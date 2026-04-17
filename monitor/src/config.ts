import "dotenv/config";

const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

export interface Config {
  heliusApiKey: string;
  telegramBotToken: string;
  telegramChatId: number;
  dbPath: string;
  logLevel: LogLevel;
}

function requireString(name: string, errors: string[]): string {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") {
    errors.push(`Missing required env var: ${name}`);
    return "";
  }
  return v.trim();
}

export function loadConfig(): Config {
  const errors: string[] = [];

  const heliusApiKey = requireString("HELIUS_API_KEY", errors);
  const telegramBotToken = requireString("TELEGRAM_BOT_TOKEN", errors);
  const telegramChatIdRaw = requireString("TELEGRAM_CHAT_ID", errors);

  let telegramChatId = 0;
  if (telegramChatIdRaw !== "") {
    const parsed = Number(telegramChatIdRaw);
    if (!Number.isInteger(parsed)) {
      errors.push(`TELEGRAM_CHAT_ID must be an integer, got: ${telegramChatIdRaw}`);
    } else {
      telegramChatId = parsed;
    }
  }

  const dbPath = process.env.DB_PATH?.trim() || "./data/l11.db";

  const logLevelRaw = process.env.LOG_LEVEL?.trim() || "info";
  if (!LOG_LEVELS.includes(logLevelRaw as LogLevel)) {
    errors.push(
      `LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")}; got: ${logLevelRaw}`,
    );
  }

  if (errors.length > 0) {
    const msg = ["Config validation failed:", ...errors.map((e) => `  - ${e}`)].join(
      "\n",
    );
    throw new Error(msg);
  }

  return {
    heliusApiKey,
    telegramBotToken,
    telegramChatId,
    dbPath,
    logLevel: logLevelRaw as LogLevel,
  };
}
