import { resolve } from "node:path";
import dotenv from "dotenv";
import { REPO_ROOT, resolveFromMonitor } from "./paths.js";

dotenv.config({ path: resolve(REPO_ROOT, ".env") });

const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

export interface Config {
  heliusApiKey: string;
  telegramBotToken: string;
  telegramChatId: number;
  dbPath: string;
  walletsPath: string;
  logLevel: LogLevel;
  healthPort: number;
  staleThresholdMs: number;
  stalenessCheckIntervalMs: number;
  heartbeatIntervalMs: number;
}

const DEFAULT_HEALTH_PORT = 9479;
const DEFAULT_STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;
const DEFAULT_STALENESS_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000;

function requireString(name: string, errors: string[]): string {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") {
    errors.push(`Missing required env var: ${name}`);
    return "";
  }
  return v.trim();
}

function optionalPositiveInt(
  name: string,
  defaultValue: number,
  errors: string[],
): number {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === "") return defaultValue;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    errors.push(`${name} must be a positive integer, got: ${raw}`);
    return defaultValue;
  }
  return n;
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

  const dbPathRaw = process.env.DB_PATH?.trim() || "./data/l11.db";
  const dbPath = resolveFromMonitor(dbPathRaw);

  const walletsPath = resolveFromMonitor("./data/wallets.json");

  const logLevelRaw = process.env.LOG_LEVEL?.trim() || "info";
  if (!LOG_LEVELS.includes(logLevelRaw as LogLevel)) {
    errors.push(
      `LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")}; got: ${logLevelRaw}`,
    );
  }

  const healthPort = optionalPositiveInt(
    "HEALTH_PORT",
    DEFAULT_HEALTH_PORT,
    errors,
  );
  const staleThresholdMs = optionalPositiveInt(
    "STALE_THRESHOLD_MS",
    DEFAULT_STALE_THRESHOLD_MS,
    errors,
  );
  const stalenessCheckIntervalMs = optionalPositiveInt(
    "STALENESS_CHECK_INTERVAL_MS",
    DEFAULT_STALENESS_CHECK_INTERVAL_MS,
    errors,
  );
  const heartbeatIntervalMs = optionalPositiveInt(
    "HEARTBEAT_INTERVAL_MS",
    DEFAULT_HEARTBEAT_INTERVAL_MS,
    errors,
  );

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
    walletsPath,
    logLevel: logLevelRaw as LogLevel,
    healthPort,
    staleThresholdMs,
    stalenessCheckIntervalMs,
    heartbeatIntervalMs,
  };
}
