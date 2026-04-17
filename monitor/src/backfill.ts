import type { Db } from "./db.js";
import {
  getSignaturesForAddress,
  getTransaction,
  type SignatureInfo,
} from "./helius/rpc.js";
import type { TransactionEvent } from "./helius/ws.js";
import { errMessage, sleep, type Logger } from "./util.js";

const SIGS_PER_PAGE = 1000;
const MAX_PAGES_PER_WALLET = 10;
const THROTTLE_MS_DEFAULT = 120;

interface CursorRow {
  address: string;
  label: string;
  lastSig: string;
  lastSlot: number | null;
}

export interface RunBackfillArgs {
  db: Db;
  apiKey: string;
  onEvent: (event: TransactionEvent) => void;
  log: Logger;
  throttleMs?: number;
  signal?: AbortSignal;
}

export async function runBackfill(args: RunBackfillArgs): Promise<void> {
  const { db, apiKey, onEvent, log, signal } = args;
  const throttleMs = args.throttleMs ?? THROTTLE_MS_DEFAULT;

  const cursors = db
    .prepare(
      `SELECT address, label,
              last_processed_signature AS lastSig,
              last_processed_slot       AS lastSlot
       FROM monitored_wallets
       WHERE last_processed_signature IS NOT NULL`,
    )
    .all() as CursorRow[];

  if (cursors.length === 0) {
    log.info("backfill: no wallets with cursors — skipping");
    return;
  }

  log.info(`backfill: starting for ${cursors.length} wallet(s)`);

  let totalEmitted = 0;
  let walletsProcessed = 0;
  for (const w of cursors) {
    if (signal?.aborted) break;
    totalEmitted += await backfillOneWallet(w, apiKey, onEvent, log, throttleMs, signal);
    walletsProcessed++;
  }

  log.info(
    `backfill: complete — ${totalEmitted} tx(s) emitted across ${walletsProcessed} wallet(s)`,
  );
}

async function backfillOneWallet(
  w: CursorRow,
  apiKey: string,
  onEvent: (event: TransactionEvent) => void,
  log: Logger,
  throttleMs: number,
  signal: AbortSignal | undefined,
): Promise<number> {
  let emitted = 0;

  try {
    const collected: SignatureInfo[] = [];
    let before: string | undefined;
    let reachedPageCap = false;
    for (let page = 0; page < MAX_PAGES_PER_WALLET; page++) {
      if (signal?.aborted) return emitted;
      const batch = await getSignaturesForAddress(apiKey, w.address, {
        until: w.lastSig,
        before,
        limit: SIGS_PER_PAGE,
        signal,
      });
      if (batch.length === 0) break;
      collected.push(...batch);
      if (batch.length < SIGS_PER_PAGE) break;
      const last = batch[batch.length - 1];
      if (!last) break;
      before = last.signature;
      if (page === MAX_PAGES_PER_WALLET - 1) reachedPageCap = true;
    }

    if (reachedPageCap) {
      log.warn(
        `backfill: ${w.label} (${w.address}) reached page cap (${MAX_PAGES_PER_WALLET} × ${SIGS_PER_PAGE}); older sigs may be truncated`,
      );
    }
    if (collected.length === 0) {
      log.info(`backfill: ${w.label} — no new signatures since ${w.lastSig}`);
      return 0;
    }

    collected.reverse();

    log.info(
      `backfill: ${w.label} — ${collected.length} sig(s) to replay (oldest slot ${collected[0]?.slot}, newest ${collected[collected.length - 1]?.slot})`,
    );

    for (const s of collected) {
      if (signal?.aborted) return emitted;
      if (s.err) continue;
      let tx: unknown;
      try {
        tx = await getTransaction(apiKey, s.signature, signal);
      } catch (err) {
        log.error(
          `backfill: ${w.label} getTransaction ${s.signature} failed: ${errMessage(err)}`,
        );
        continue;
      }
      if (!tx) continue;
      onEvent({ signature: s.signature, slot: s.slot, raw: tx });
      emitted++;
      if (throttleMs > 0) await sleep(throttleMs, signal);
    }
  } catch (err) {
    log.error(
      `backfill: ${w.label} (${w.address}) aborted: ${errMessage(err)}`,
    );
  }

  return emitted;
}
