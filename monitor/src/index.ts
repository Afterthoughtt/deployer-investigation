import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { loadWalletsFile, syncWalletsToDb } from "./wallets.js";

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
  console.log("l11-monitor: wallets.json loaded");
  console.log(`  onramps:        ${wallets.onramps.length}`);
  console.log(`  hubs:           ${wallets.hubs.length}`);
  console.log(`  intermediaries: ${wallets.intermediaries.length}`);
  console.log(`  ignore:         ${wallets.ignore.length}`);

  const stats = syncWalletsToDb(db, wallets);
  console.log("l11-monitor: wallets synced to db");
  console.log(
    `  monitored: ${stats.monitored.inserted} inserted, ${stats.monitored.alreadyPresent} already present (${stats.monitored.totalInFile} in file)`,
  );
  console.log(
    `  ignore:    ${stats.ignore.inserted} inserted, ${stats.ignore.alreadyPresent} already present (${stats.ignore.totalInFile} in file)`,
  );

  const rows = db
    .prepare(
      `SELECT address, label, category FROM monitored_wallets ORDER BY category, label`,
    )
    .all() as { address: string; label: string; category: string }[];
  console.log(`l11-monitor: monitored_wallets table (${rows.length} rows)`);
  for (const r of rows) {
    console.log(`  [${r.category}] ${r.label} — ${r.address}`);
  }

  db.close();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
