import { loadConfig } from "./config.js";
import { openDb, makePersistCandidate } from "./db.js";
import { connectHeliusWs, type TransactionEvent } from "./helius/ws.js";
import { loadWalletsFile, syncWalletsToDb, type Category } from "./wallets.js";
import { runBackfill } from "./backfill.js";
import {
  detectCandidates,
  type Candidate,
  type MonitoredWallet,
} from "./detection/candidate.js";
import { makeFreshnessChecker } from "./detection/fresh.js";
import { createTelegramBot } from "./telegram/bot.js";
import { sendStartupMessage } from "./telegram/push.js";
import { errMessage, sleep, type Logger } from "./util.js";

const consoleLog: Logger = {
  info: (m) => console.log(m),
  warn: (m) => console.warn(m),
  error: (m) => console.error(m),
};

const BOT_STOP_TIMEOUT_MS = 2000;

let shuttingDown = false;

try {
  const config = loadConfig();
  console.log("l11-monitor: config loaded");
  console.log(`  HELIUS_API_KEY:     [set, ${config.heliusApiKey.length} chars]`);
  console.log(
    `  TELEGRAM_BOT_TOKEN: [set, ${config.telegramBotToken.length} chars]`,
  );
  console.log(`  TELEGRAM_CHAT_ID:   ${config.telegramChatId}`);
  console.log(`  DB_PATH:            ${config.dbPath}`);
  console.log(`  WALLETS_PATH:       ${config.walletsPath}`);
  console.log(`  LOG_LEVEL:          ${config.logLevel}`);

  const db = openDb(config.dbPath);
  const persistCandidate = makePersistCandidate(db);
  console.log("l11-monitor: db opened");

  const wallets = loadWalletsFile(config.walletsPath);
  const stats = syncWalletsToDb(db, wallets);
  console.log(
    `l11-monitor: wallets synced (${stats.monitored.inserted} new, ${stats.monitored.alreadyPresent} existing)`,
  );

  const categorized: Array<[typeof wallets.onramps, Category]> = [
    [wallets.onramps, "onramp"],
    [wallets.hubs, "hub"],
    [wallets.intermediaries, "intermediary"],
  ];
  const monitoredMap = new Map<string, MonitoredWallet>();
  for (const [entries, category] of categorized) {
    for (const w of entries) {
      monitoredMap.set(w.address, { address: w.address, label: w.label, category });
    }
  }
  const monitoredSet = new Set(monitoredMap.keys());
  const accounts = Array.from(monitoredSet);

  const ignoreSet = new Set<string>(
    (db.prepare(`SELECT address FROM ignore_list`).all() as { address: string }[]).map(
      (r) => r.address,
    ),
  );
  const alreadyCandidates = new Set<string>(
    (db.prepare(`SELECT address FROM candidates`).all() as { address: string }[]).map(
      (r) => r.address,
    ),
  );
  const inFlightRecipients = new Set<string>();
  console.log(
    `l11-monitor: starting helius ws (${accounts.length} accounts, ${ignoreSet.size} ignored, ${alreadyCandidates.size} existing candidates)`,
  );

  const bot = createTelegramBot({
    token: config.telegramBotToken,
    chatId: config.telegramChatId,
    log: consoleLog,
  });
  await bot.start();
  try {
    await sendStartupMessage(bot, {
      monitoredCount: accounts.length,
      existingCandidates: alreadyCandidates.size,
    });
    console.log("telegram: startup message sent");
  } catch (err) {
    // Non-fatal — bot is running, but push failed (bad chat id, network, etc).
    console.error(`telegram: startup push failed: ${errMessage(err)}`);
  }

  const advanceCursorStmt = db.prepare(
    `UPDATE monitored_wallets
     SET last_processed_signature = ?, last_processed_slot = ?
     WHERE address = ?
       AND (last_processed_slot IS NULL OR last_processed_slot < ?)`,
  );

  let eventCount = 0;
  let subscribeCount = 0;
  let candidateCount = 0;
  let backfillPromise: Promise<unknown> | null = null;
  const abortController = new AbortController();
  const freshness = makeFreshnessChecker(
    config.heliusApiKey,
    abortController.signal,
  );

  const handleEvent = (source: "ws" | "backfill") => (ev: TransactionEvent) => {
    if (shuttingDown) return;
    eventCount++;
    const touched = findTouchedAddresses(ev.raw, monitoredSet);
    for (const addr of touched) {
      advanceCursorStmt.run(ev.signature, ev.slot, addr, ev.slot);
    }
    console.log(
      `${source}-event #${eventCount} sig=${ev.signature} slot=${ev.slot} touched=${touched.size}`,
    );

    // If no monitored wallet appears anywhere in the payload, the tx can't
    // contain a system.transfer whose source is monitored — skip the parse.
    if (touched.size === 0) return;

    detectCandidates({
      event: ev,
      monitored: monitoredMap,
      ignore: ignoreSet,
      alreadyCandidates,
      inFlight: inFlightRecipients,
      freshness,
      log: (m) => console.log(m),
    })
      .then((cands) => {
        for (const c of cands) {
          inFlightRecipients.delete(c.recipient);
          let result;
          try {
            result = persistCandidate(c);
          } catch (err) {
            // Leave alreadyCandidates untouched — a later event can retry.
            console.error(
              `persist: ${c.recipient} sig=${c.fundingSignature} failed: ${errMessage(err)}`,
            );
            continue;
          }
          alreadyCandidates.add(c.recipient);
          if (result.candidateInserted) {
            candidateCount++;
            logCandidate(source, candidateCount, c);
          } else {
            console.log(
              `${source}-candidate DUPLICATE ${c.recipient} sig=${c.fundingSignature} (candidates row already exists; event ${result.eventInserted ? "inserted" : "already present"})`,
            );
          }
        }
      })
      .catch((err) => {
        if (abortController.signal.aborted) return;
        console.error(`detection: fatal ${errMessage(err)}`);
      });
  };

  const triggerBackfill = () => {
    if (shuttingDown) return;
    if (backfillPromise) {
      console.log("backfill: skipped — previous backfill still running");
      return;
    }
    backfillPromise = runBackfill({
      db,
      apiKey: config.heliusApiKey,
      onEvent: handleEvent("backfill"),
      log: consoleLog,
      signal: abortController.signal,
    })
      .catch((err) => {
        console.error(`backfill: fatal ${errMessage(err)}`);
      })
      .finally(() => {
        backfillPromise = null;
      });
  };

  const wsHandle = connectHeliusWs({
    apiKey: config.heliusApiKey,
    accounts,
    onOpen: () => console.log("helius-ws: open"),
    onSubscribed: (id) => {
      subscribeCount++;
      console.log(
        `helius-ws: subscribed (id=${id}, subscribe #${subscribeCount})`,
      );
      triggerBackfill();
    },
    onEvent: handleEvent("ws"),
    onError: (err) => console.error(`helius-ws: error ${err.message}`),
    onClose: (code, reason) => {
      console.log(
        `helius-ws: close code=${code} reason=${reason || "(none)"}`,
      );
    },
    onReconnecting: (attempt, delayMs) => {
      console.log(
        `helius-ws: reconnecting (attempt=${attempt}, delay=${delayMs}ms)`,
      );
    },
  });

  process.on("SIGUSR2", () => {
    console.log("l11-monitor: SIGUSR2 — forcing WS disconnect (test harness)");
    wsHandle.forceDisconnect();
  });

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(
      `l11-monitor: ${signal} received, shutting down (events=${eventCount}, subscribes=${subscribeCount}, candidates=${candidateCount})`,
    );
    abortController.abort();
    wsHandle.close();
    if (backfillPromise) {
      console.log("l11-monitor: awaiting in-flight backfill to drain");
      try {
        await backfillPromise;
      } catch {
        // errors already logged by triggerBackfill's .catch
      }
    }
    try {
      // Grammy's bot.stop() waits for the in-flight getUpdates long-poll to
      // return (up to ~30s). Cap so a manual SIGINT exits promptly; under
      // systemd TimeoutStopSec is plenty of slack anyway.
      await Promise.race([
        bot.stop(),
        sleep(BOT_STOP_TIMEOUT_MS).then(() => {
          console.warn(
            `telegram: stop did not complete within ${BOT_STOP_TIMEOUT_MS}ms — proceeding`,
          );
        }),
      ]);
    } catch (err) {
      console.error(`telegram: stop failed: ${errMessage(err)}`);
    }
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
} catch (err) {
  console.error(errMessage(err));
  process.exit(1);
}

function logCandidate(
  source: "ws" | "backfill",
  n: number,
  c: Candidate,
): void {
  console.log(
    `${source}-candidate #${n} [${c.confidence}] ${c.recipient} ` +
      `<- ${c.fundedAmountSol.toFixed(3)} SOL ` +
      `from ${c.fundingSourceLabel} (${c.fundingSourceAddress}) ` +
      `sig=${c.fundingSignature} slot=${c.fundingSlot} priorSigs=${c.priorSigCount}`,
  );
}

function findTouchedAddresses(
  payload: unknown,
  monitored: Set<string>,
): Set<string> {
  const found = new Set<string>();
  if (monitored.size === 0) return found;
  const visit = (node: unknown): void => {
    if (found.size === monitored.size) return;
    if (typeof node === "string") {
      if (monitored.has(node)) found.add(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node && typeof node === "object") {
      for (const v of Object.values(node)) visit(v);
    }
  };
  visit(payload);
  return found;
}
