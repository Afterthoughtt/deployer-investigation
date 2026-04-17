import type { Db } from "./db.js";
import {
  getSignaturesForAddress,
  getTransaction,
  type SignatureInfo,
} from "./helius/rpc.js";
import type { TransactionEvent } from "./helius/ws.js";

const SIGS_PER_PAGE = 1000;
const MAX_PAGES_PER_WALLET = 10;
const THROTTLE_MS_DEFAULT = 120;

interface CursorRow {
  address: string;
  label: string;
  lastSig: string;
  lastSlot: number | null;
}

export interface BackfillLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

export interface WalletBackfillResult {
  address: string;
  label: string;
  signaturesFetched: number;
  transactionsEmitted: number;
  pagesFetched: number;
  cappedAtMaxPages: boolean;
  error?: string;
}

export interface RunBackfillArgs {
  db: Db;
  apiKey: string;
  onEvent: (event: TransactionEvent) => void;
  log: BackfillLogger;
  throttleMs?: number;
  signal?: AbortSignal;
}

export async function runBackfill(args: RunBackfillArgs): Promise<WalletBackfillResult[]> {
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
    return [];
  }

  log.info(`backfill: starting for ${cursors.length} wallet(s)`);

  const results: WalletBackfillResult[] = [];
  for (const w of cursors) {
    if (signal?.aborted) break;
    const result = await backfillOneWallet(w, apiKey, onEvent, log, throttleMs, signal);
    results.push(result);
  }

  const totalEmitted = results.reduce((a, r) => a + r.transactionsEmitted, 0);
  log.info(`backfill: complete — ${totalEmitted} tx(s) emitted across ${results.length} wallet(s)`);
  return results;
}

async function backfillOneWallet(
  w: CursorRow,
  apiKey: string,
  onEvent: (event: TransactionEvent) => void,
  log: BackfillLogger,
  throttleMs: number,
  signal: AbortSignal | undefined,
): Promise<WalletBackfillResult> {
  const result: WalletBackfillResult = {
    address: w.address,
    label: w.label,
    signaturesFetched: 0,
    transactionsEmitted: 0,
    pagesFetched: 0,
    cappedAtMaxPages: false,
  };

  try {
    const collected: SignatureInfo[] = [];
    let before: string | undefined;
    for (let page = 0; page < MAX_PAGES_PER_WALLET; page++) {
      if (signal?.aborted) return result;
      const batch = await getSignaturesForAddress(apiKey, w.address, {
        until: w.lastSig,
        before,
        limit: SIGS_PER_PAGE,
      });
      result.pagesFetched++;
      if (batch.length === 0) break;
      collected.push(...batch);
      if (batch.length < SIGS_PER_PAGE) break;
      const last = batch[batch.length - 1];
      if (!last) break;
      before = last.signature;
      if (page === MAX_PAGES_PER_WALLET - 1) result.cappedAtMaxPages = true;
    }
    result.signaturesFetched = collected.length;

    if (result.cappedAtMaxPages) {
      log.warn(
        `backfill: ${w.label} (${w.address}) hit page cap (${MAX_PAGES_PER_WALLET} × ${SIGS_PER_PAGE}); older sigs may be skipped`,
      );
    }
    if (collected.length === 0) {
      log.info(`backfill: ${w.label} — no new signatures since ${w.lastSig}`);
      return result;
    }

    // Oldest-first so the cursor advances monotonically forward.
    collected.reverse();

    log.info(
      `backfill: ${w.label} — ${collected.length} sig(s) to replay (oldest slot ${collected[0]?.slot}, newest ${collected[collected.length - 1]?.slot})`,
    );

    for (const s of collected) {
      if (signal?.aborted) return result;
      if (s.err) continue; // ws subscription filters failed txs; match behavior here
      let tx: unknown;
      try {
        tx = await getTransaction(apiKey, s.signature);
      } catch (err) {
        log.error(
          `backfill: ${w.label} getTransaction ${s.signature} failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        continue;
      }
      if (!tx) continue;
      onEvent({ signature: s.signature, slot: s.slot, raw: tx });
      result.transactionsEmitted++;
      if (throttleMs > 0) await sleep(throttleMs);
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    log.error(`backfill: ${w.label} (${w.address}) aborted: ${result.error}`);
  }

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
