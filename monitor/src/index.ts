import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { connectHeliusWs } from "./helius/ws.js";
import { loadWalletsFile, syncWalletsToDb } from "./wallets.js";

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
  console.log(`l11-monitor: starting helius ws (${accounts.length} accounts)`);

  let eventCount = 0;
  const wsHandle = connectHeliusWs({
    apiKey: config.heliusApiKey,
    accounts,
    onOpen: () => console.log("helius-ws: open"),
    onSubscribed: (id) => console.log(`helius-ws: subscribed (id=${id})`),
    onEvent: (ev) => {
      eventCount++;
      console.log(
        `helius-ws: event #${eventCount} sig=${ev.signature} slot=${ev.slot}`,
      );
    },
    onError: (err) => console.error(`helius-ws: error ${err.message}`),
    onClose: (code, reason) => {
      console.log(`helius-ws: close code=${code} reason=${reason || "(none)"}`);
      if (!shuttingDown) {
        console.log(
          "helius-ws: connection dropped (reconnect not implemented yet — increment 5)",
        );
      }
    },
  });

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`l11-monitor: ${signal} received, shutting down (events=${eventCount})`);
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
