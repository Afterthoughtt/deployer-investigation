import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { connectHeliusWs, type TransactionEvent } from "./helius/ws.js";
import { loadWalletsFile, syncWalletsToDb } from "./wallets.js";
import { runBackfill, type BackfillLogger } from "./backfill.js";

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
  console.log("l11-monitor: db opened");

  const wallets = loadWalletsFile(config.walletsPath);
  const stats = syncWalletsToDb(db, wallets);
  console.log(
    `l11-monitor: wallets synced (${stats.monitored.inserted} new, ${stats.monitored.alreadyPresent} existing)`,
  );

  const accounts = [
    ...wallets.onramps.map((w) => w.address),
    ...wallets.hubs.map((w) => w.address),
    ...wallets.intermediaries.map((w) => w.address),
  ];
  const monitoredSet = new Set(accounts);
  console.log(`l11-monitor: starting helius ws (${accounts.length} accounts)`);

  const advanceCursorStmt = db.prepare(
    `UPDATE monitored_wallets
     SET last_processed_signature = ?, last_processed_slot = ?
     WHERE address = ?
       AND (last_processed_slot IS NULL OR last_processed_slot < ?)`,
  );

  let eventCount = 0;
  let backfillEventCount = 0;
  let subscribeCount = 0;
  let backfillInFlight = false;

  const backfillLog: BackfillLogger = {
    info: (m) => console.log(m),
    warn: (m) => console.warn(m),
    error: (m) => console.error(m),
  };

  const handleEvent = (source: "ws" | "backfill") => (ev: TransactionEvent) => {
    eventCount++;
    if (source === "backfill") backfillEventCount++;
    const touched = findTouchedAddresses(ev.raw, monitoredSet);
    for (const addr of touched) {
      advanceCursorStmt.run(ev.signature, ev.slot, addr, ev.slot);
    }
    console.log(
      `${source}-event #${eventCount} sig=${ev.signature} slot=${ev.slot} touched=${touched.size}`,
    );
  };

  const triggerBackfill = () => {
    if (backfillInFlight) {
      console.log("backfill: skipped — previous backfill still running");
      return;
    }
    backfillInFlight = true;
    runBackfill({
      db,
      apiKey: config.heliusApiKey,
      onEvent: handleEvent("backfill"),
      log: backfillLog,
    })
      .catch((err) => {
        console.error(
          `backfill: fatal ${err instanceof Error ? err.message : String(err)}`,
        );
      })
      .finally(() => {
        backfillInFlight = false;
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

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(
      `l11-monitor: ${signal} received, shutting down (events=${eventCount}, backfill_events=${backfillEventCount}, subscribes=${subscribeCount})`,
    );
    wsHandle.close();
    db.close();
    setTimeout(() => process.exit(0), 500);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

// String-walk rather than reading accountKeys directly: the WS notification
// and getTransaction payloads have different shapes, and full parsing lands
// in increment 6. Base58 address collisions against memo/log content are
// effectively zero.
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
