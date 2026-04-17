import { loadConfig } from "./config.js";
import {
  openDb,
  makePersistCandidate,
  makeWhitelistCandidate,
  makeRejectCandidate,
  makeListActiveCandidates,
  makeActiveCandidateCount,
} from "./db.js";
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
import {
  sendStartupMessage,
  sendCandidateAlert,
  sendStaleWarning,
  sendStaleRecovery,
  sendHeartbeat,
} from "./telegram/push.js";
import {
  createStalenessMonitor,
  startHealthServer,
  createHeartbeat,
} from "./health.js";
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
  console.log(`  HEALTH_PORT:        ${config.healthPort}`);
  console.log(
    `  STALE_THRESHOLD_MS: ${config.staleThresholdMs} (check every ${config.stalenessCheckIntervalMs}ms)`,
  );
  console.log(`  HEARTBEAT_MS:       ${config.heartbeatIntervalMs}`);

  const db = openDb(config.dbPath);
  const persistCandidate = makePersistCandidate(db);
  const whitelistCandidate = makeWhitelistCandidate(db);
  const rejectCandidate = makeRejectCandidate(db);
  const listActiveCandidates = makeListActiveCandidates(db);
  const activeCandidateCount = makeActiveCandidateCount(db);
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

  const status = {
    startedAt: Date.now(),
    wsConnected: false,
    subscribeCount: 0,
    lastEventByCategory: {
      onramp: null,
      hub: null,
      intermediary: null,
    } as Record<Category, number | null>,
  };

  const bot = createTelegramBot({
    token: config.telegramBotToken,
    chatId: config.telegramChatId,
    log: consoleLog,
    onWhitelist: whitelistCandidate,
    onReject: (id) => {
      const result = rejectCandidate(id);
      // Skip the 10-credit freshness RPC on future sigs to this recipient.
      if (result.statusChanged && result.address) {
        ignoreSet.add(result.address);
      }
      return result;
    },
    listActiveCandidates,
    activeCandidateCount,
    getStatus: () => status,
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
    const ts = Date.now();
    const touched = findTouchedAddresses(ev.raw, monitoredSet);
    const touchedCategories = new Set<Category>();
    for (const addr of touched) {
      advanceCursorStmt.run(ev.signature, ev.slot, addr, ev.slot);
      const w = monitoredMap.get(addr);
      if (w) touchedCategories.add(w.category);
    }
    for (const c of touchedCategories) {
      status.lastEventByCategory[c] = ts;
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
            const id = result.candidateId;
            if (id !== null) {
              sendCandidateAlert(bot, c, id).catch((err) => {
                // Non-fatal: candidate is already persisted. Log the recipient
                // so a tailing operator can still act on L11 if the push drops.
                console.error(
                  `telegram: alert push for C${id} (${c.recipient}) failed: ${errMessage(err)}`,
                );
              });
            }
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
    onOpen: () => {
      status.wsConnected = true;
      console.log("helius-ws: open");
    },
    onSubscribed: (id) => {
      status.subscribeCount++;
      console.log(
        `helius-ws: subscribed (id=${id}, subscribe #${status.subscribeCount})`,
      );
      triggerBackfill();
    },
    onEvent: handleEvent("ws"),
    onError: (err) => console.error(`helius-ws: error ${err.message}`),
    onClose: (code, reason) => {
      status.wsConnected = false;
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

  const stalenessMonitor = createStalenessMonitor({
    thresholdMs: config.staleThresholdMs,
    checkIntervalMs: config.stalenessCheckIntervalMs,
    startedAt: status.startedAt,
    getOnrampLastEventAt: () => status.lastEventByCategory.onramp,
    onStaleEnter: ({ ageMs }) => {
      console.warn(
        `staleness: on-ramp stale (age=${ageMs}ms, threshold=${config.staleThresholdMs}ms)`,
      );
      sendStaleWarning(bot, {
        ageMs,
        thresholdMs: config.staleThresholdMs,
      }).catch((err) => {
        console.error(`telegram: stale warning push failed ${errMessage(err)}`);
      });
    },
    onStaleExit: ({ stalenessDurationMs }) => {
      console.log(
        `staleness: on-ramp recovered (was stale ${stalenessDurationMs}ms)`,
      );
      sendStaleRecovery(bot, { stalenessDurationMs }).catch((err) => {
        console.error(
          `telegram: stale recovery push failed ${errMessage(err)}`,
        );
      });
    },
    log: consoleLog,
  });

  const healthServer = await startHealthServer({
    port: config.healthPort,
    thresholdMs: config.staleThresholdMs,
    startedAt: status.startedAt,
    getOnrampLastEventAt: () => status.lastEventByCategory.onramp,
    getWsConnected: () => status.wsConnected,
    log: consoleLog,
  });

  const heartbeat = createHeartbeat({
    intervalMs: config.heartbeatIntervalMs,
    push: () =>
      sendHeartbeat(bot, {
        uptimeMs: Date.now() - status.startedAt,
        activeCandidateCount: activeCandidateCount(),
        lastEventByCategory: status.lastEventByCategory,
      }),
    log: consoleLog,
  });

  process.on("SIGUSR2", () => {
    console.log("l11-monitor: SIGUSR2 — forcing WS disconnect (test harness)");
    wsHandle.forceDisconnect();
  });

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(
      `l11-monitor: ${signal} received, shutting down (events=${eventCount}, subscribes=${status.subscribeCount}, candidates=${candidateCount})`,
    );
    heartbeat.stop();
    stalenessMonitor.stop();
    try {
      await healthServer.close();
    } catch (err) {
      console.error(`health: close failed ${errMessage(err)}`);
    }
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
