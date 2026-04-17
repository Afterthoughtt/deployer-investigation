import { loadConfig } from "./config.js";
import { openDb } from "./db.js";

try {
  const config = loadConfig();
  console.log("l11-monitor: config loaded");
  console.log(`  HELIUS_API_KEY:     [set, ${config.heliusApiKey.length} chars]`);
  console.log(
    `  TELEGRAM_BOT_TOKEN: [set, ${config.telegramBotToken.length} chars]`,
  );
  console.log(`  TELEGRAM_CHAT_ID:   ${config.telegramChatId}`);
  console.log(`  DB_PATH:            ${config.dbPath}`);
  console.log(`  LOG_LEVEL:          ${config.logLevel}`);

  const db = openDb(config.dbPath);
  const journalMode = db.pragma("journal_mode", { simple: true });
  const foreignKeys = db.pragma("foreign_keys", { simple: true });
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as { name: string }[];
  const indexes = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as { name: string }[];

  console.log("l11-monitor: db opened");
  console.log(`  journal_mode: ${journalMode}`);
  console.log(`  foreign_keys: ${foreignKeys}`);
  console.log(`  tables:       ${tables.map((t) => t.name).join(", ")}`);
  console.log(`  indexes:      ${indexes.map((i) => i.name).join(", ")}`);
  db.close();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
