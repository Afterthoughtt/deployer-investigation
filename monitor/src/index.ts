import { loadConfig } from "./config.js";
import {
  openDb,
  makePersistCandidate,
  makeWhitelistCandidate,
  makeRejectCandidate,
  makeUnwhitelistCandidate,
  makeUnrejectCandidate,
  makeListActiveCandidates,
  makeActiveCandidateCount,
  makeMarkAlertSent,
  makeListUnalertedCandidates,
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
  sendWsDownWarning,
  sendWsRecovery,
  sendRpcFailureWarning,
  sendRpcFailureRecovery,
} from "./telegram/push.js";
import {
  createStalenessMonitor,
  startHealthServer,
  createHeartbeat,
} from "./health.js";
import { runHealthChecks } from "./selfcheck.js";
import { errMessage, sleep, type Logger } from "./util.js";

const consoleLog: Logger = {
  info: (m) => console.log(m),
  warn: (m) => console.warn(m),
  error: (m) => console.error(m),
};

const BOT_STOP_TIMEOUT_MS = 2000;
const WS_DOWN_WARN_MS = 60_000;
const RPC_FAILURE_WARN_THRESHOLD = 5;

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
  const unwhitelistCandidate = makeUnwhitelistCandidate(db);
  const unrejectCandidate = makeUnrejectCandidate(db);
  const listActiveCandidates = makeListActiveCandidates(db);
  const activeCandidateCount = makeActiveCandidateCount(db);
  const markAlertSent = makeMarkAlertSent(db);
  const listUnalertedCandidates = makeListUnalertedCandidates(db);
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

  // Pre-applied "no events yet" floor: until an on-ramp event has arrived,
  // age is measured from boot so the daemon doesn't alarm in its own grace
  // window. Shared between the staleness monitor, /health server, and
  // the /health Telegram command.
  const onrampLastOrBoot = () =>
    status.lastEventByCategory.onramp ?? status.startedAt;

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
    onUnwhitelist: unwhitelistCandidate,
    onUnreject: (id) => {
      const result = unrejectCandidate(id);
      // Mirror of /reject: on successful undo, drop the address from the
      // in-memory ignore set so it can be re-detected on the next funding tx.
      if (result.statusChanged && result.address) {
        ignoreSet.delete(result.address);
      }
      return result;
    },
    listActiveCandidates,
    activeCandidateCount,
    getStatus: () => status,
    runHealthChecks: () =>
      runHealthChecks({
        db,
        bot,
        heliusApiKey: config.heliusApiKey,
        monitored: monitoredMap,
        getOnrampLastEventAt: onrampLastOrBoot,
        getWsConnected: () => status.wsConnected,
        // Tighter than the automated staleness threshold: an interactive probe
        // should flag minutes-scale silence, not hours.
        wsFreshnessMaxAgeMs: 5 * 60 * 1000,
      }),
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

  // PH3: replay any candidate that was persisted but never alerted (crash
  // between persistCandidate and the Telegram ack, or Telegram-side drop
  // before auto-retry was wired in).
  //
  // Fire-and-forget on purpose: with throttler+auto-retry in front of the API,
  // burst replays self-pace at ~1/sec, and WS connect is not blocked.
  //
  // Caveat: `fundedAmountLamports` here is reconstructed from `funded_amount_sol`
  // and is lossy (REAL has ~1-lamport rounding). Safe for sendCandidateAlert
  // (reads fundedAmountSol only). Do NOT pass replay Candidates through
  // detectCandidates or persistCandidate — those paths assume authoritative
  // lamports.
  const unalerted = listUnalertedCandidates();
  if (unalerted.length > 0) {
    console.log(`replay: queued ${unalerted.length} un-alerted candidate(s)`);
    for (const row of unalerted) {
      const cat =
        monitoredMap.get(row.fundingSource)?.category ?? "intermediary";
      const replayCandidate: Candidate = {
        recipient: row.address,
        fundingSourceAddress: row.fundingSource,
        fundingSourceLabel: row.fundingSourceLabel ?? "(unknown)",
        fundingSourceCategory: cat,
        fundedAmountLamports: Math.round(row.fundedAmountSol * 1e9),
        fundedAmountSol: row.fundedAmountSol,
        fundingSignature: row.fundingSignature,
        fundingSlot: row.fundingSlot,
        fundingTimestamp: row.fundingTimestamp,
        confidence: row.confidence,
        // Pre-PH3 rows had NULL priorSigCount until backfilled; backfill sets
        // it to 1 but cover the `?? 1` path defensively for safety.
        priorSigCount: row.priorSigCount ?? 1,
      };
      sendCandidateAlert(bot, replayCandidate, row.id)
        .then(() => markAlertSent(row.id))
        .catch((err) => {
          console.error(
            `replay: alert push for C${row.id} (${row.address}) failed: ${errMessage(err)}`,
          );
        });
    }
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
  const innerFreshness = makeFreshnessChecker(
    config.heliusApiKey,
    abortController.signal,
  );

  // Wrap the freshness checker with a consecutive-failure counter. A silently
  // failing freshness call drops candidates into /dev/null (detection.ts:74
  // logs + skips), so we want a Telegram ping once failures pile up. Threshold
  // is low enough to catch sustained outages quickly, high enough that a
  // single flaky retry-exhausted call doesn't page.
  let rpcConsecutiveFailures = 0;
  let rpcWarned = false;
  const freshness: typeof innerFreshness = async (addr) => {
    try {
      const result = await innerFreshness(addr);
      rpcConsecutiveFailures = 0;
      if (rpcWarned) {
        rpcWarned = false;
        sendRpcFailureRecovery(bot).catch((err) =>
          console.error(
            `telegram: rpc-recovery push failed ${errMessage(err)}`,
          ),
        );
      }
      return result;
    } catch (err) {
      rpcConsecutiveFailures++;
      if (
        !rpcWarned &&
        rpcConsecutiveFailures >= RPC_FAILURE_WARN_THRESHOLD
      ) {
        rpcWarned = true;
        sendRpcFailureWarning(bot, {
          consecutive: rpcConsecutiveFailures,
        }).catch((err2) =>
          console.error(
            `telegram: rpc-warn push failed ${errMessage(err2)}`,
          ),
        );
      }
      throw err;
    }
  };

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
              sendCandidateAlert(bot, c, id)
                .then(() => markAlertSent(id))
                .catch((err) => {
                  // Non-fatal: candidate is already persisted. Log the recipient
                  // so a tailing operator can still act on L11 if the push drops.
                  // alert_sent_at stays NULL → PH3 startup replay will retry
                  // on the next boot.
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

  // WS down-warn timer: if reconnect fails to reopen within WS_DOWN_WARN_MS,
  // push a Telegram warning. Push a recovery when it comes back. Both edges
  // are single-fire per down→up cycle; rapid flaps (<threshold) are silent.
  let wsDownSince: number | null = null;
  let wsWarnTimer: NodeJS.Timeout | null = null;
  let wsWarned = false;

  const wsHandle = connectHeliusWs({
    apiKey: config.heliusApiKey,
    accounts,
    onOpen: () => {
      status.wsConnected = true;
      console.log("helius-ws: open");
      if (wsWarnTimer) {
        clearTimeout(wsWarnTimer);
        wsWarnTimer = null;
      }
      if (wsWarned) {
        const downMs =
          wsDownSince !== null ? Date.now() - wsDownSince : 0;
        wsWarned = false;
        sendWsRecovery(bot, { downMs }).catch((err) =>
          console.error(
            `telegram: ws-recovery push failed ${errMessage(err)}`,
          ),
        );
      }
      wsDownSince = null;
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
      if (shuttingDown) return;
      if (wsDownSince === null) wsDownSince = Date.now();
      if (wsWarnTimer === null && !wsWarned) {
        wsWarnTimer = setTimeout(() => {
          wsWarnTimer = null;
          wsWarned = true;
          sendWsDownWarning(bot, { downForMs: WS_DOWN_WARN_MS }).catch(
            (err) =>
              console.error(
                `telegram: ws-down push failed ${errMessage(err)}`,
              ),
          );
        }, WS_DOWN_WARN_MS);
      }
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
    getOnrampLastEventAt: onrampLastOrBoot,
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
    getOnrampLastEventAt: onrampLastOrBoot,
    getWsConnected: () => status.wsConnected,
    log: consoleLog,
  });

  const heartbeat = createHeartbeat({
    intervalMs: config.heartbeatIntervalMs,
    push: () =>
      sendHeartbeat(bot, {
        uptimeMs: Date.now() - status.startedAt,
        wsConnected: status.wsConnected,
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
    if (wsWarnTimer) {
      clearTimeout(wsWarnTimer);
      wsWarnTimer = null;
    }
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
