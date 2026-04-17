/**
 * Interactive smoke test for increment 9.
 *
 * Opens a temp DB, inserts a synthetic candidate, boots the Telegram bot with
 * the real token + chat from .env, fires one candidate alert, and keeps
 * long-polling so the user can tap Whitelist/Reject. DB + temp dir are cleaned
 * up on SIGINT.
 *
 * DO NOT run this while the main monitor daemon is running — grammy long-poll
 * is single-instance per token.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../src/config.js";
import {
  openDb,
  makePersistCandidate,
  makeWhitelistCandidate,
  makeRejectCandidate,
  makeListActiveCandidates,
  makeActiveCandidateCount,
} from "../src/db.js";
import { createTelegramBot } from "../src/telegram/bot.js";
import { sendCandidateAlert } from "../src/telegram/push.js";
import type { Candidate } from "../src/detection/candidate.js";
import { errMessage } from "../src/util.js";

const config = loadConfig();

const tmpDir = mkdtempSync(join(tmpdir(), "l11-smoke-alert-"));
const dbPath = join(tmpDir, "smoke.db");
const db = openDb(dbPath);
const persist = makePersistCandidate(db);
const whitelist = makeWhitelistCandidate(db);
const reject = makeRejectCandidate(db);
const listActiveCandidates = makeListActiveCandidates(db);
const activeCandidateCount = makeActiveCandidateCount(db);
const startedAt = Date.now();

const cleanup = () => {
  try {
    db.close();
  } catch {
    /* ignore */
  }
  rmSync(tmpDir, { recursive: true, force: true });
};

// Use a real L11-window candidate address so Solscan shows something real on tap.
// cqUHqi8n... was flagged by the live monitor during increment 7's /verify and
// is already visible in the production DB. Safe to reference here; the smoke
// DB is entirely separate so nothing gets polluted.
const SMOKE_CANDIDATE: Candidate = {
  recipient: "cqUHqi8ntcxG6QHJ2mgne3UramTmikjeLAeAp7sS9Ls",
  fundingSourceAddress: "Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6",
  fundingSourceLabel: "MoonPay Hot Wallet 1",
  fundingSourceCategory: "onramp",
  fundedAmountLamports: 15_995_000_000,
  fundedAmountSol: 15.995,
  fundingSignature:
    "4MGa4vd2ps3YHnZimCppPixBgY9viV58NR8U9H3oehVowvr3Pbj3R9gcmC8yBjbsktUnzS5MhP9drU5XCCeHKVuT",
  fundingSlot: 413_776_858,
  fundingTimestamp: Date.now(),
  confidence: "HIGH",
  priorSigCount: 1,
};

const result = persist(SMOKE_CANDIDATE);
if (!result.candidateInserted || result.candidateId === null) {
  console.error("smoke: failed to seed candidate");
  cleanup();
  process.exit(1);
}
const candidateId = result.candidateId;
console.log(`smoke: seeded candidate id=C${candidateId} in ${dbPath}`);

const log = {
  info: (m: string) => console.log(m),
  warn: (m: string) => console.warn(m),
  error: (m: string) => console.error(m),
};

const bot = createTelegramBot({
  token: config.telegramBotToken,
  chatId: config.telegramChatId,
  log,
  onWhitelist: (id) => {
    console.log(`smoke: onWhitelist id=${id}`);
    return whitelist(id);
  },
  onReject: (id) => {
    console.log(`smoke: onReject id=${id}`);
    return reject(id);
  },
  listActiveCandidates,
  activeCandidateCount,
  getStatus: () => ({
    startedAt,
    wsConnected: false,
    subscribeCount: 0,
    lastEventByCategory: { onramp: null, hub: null, intermediary: null },
  }),
});

await bot.start();
console.log("smoke: bot started, polling for callbacks...");

try {
  await sendCandidateAlert(bot, SMOKE_CANDIDATE, candidateId);
  console.log(`smoke: alert sent for C${candidateId} — tap a button`);
} catch (err) {
  console.error(`smoke: sendCandidateAlert failed: ${errMessage(err)}`);
  await bot.stop();
  cleanup();
  process.exit(1);
}

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  console.log("\nsmoke: shutting down...");
  const row = db
    .prepare(
      `SELECT id, status, whitelisted_at, rejected_at FROM candidates WHERE id = ?`,
    )
    .get(candidateId) as {
    id: number;
    status: string;
    whitelisted_at: number | null;
    rejected_at: number | null;
  };
  console.log(`smoke: final C${candidateId} =`, row);
  const ignoreCount = (
    db.prepare(`SELECT COUNT(*) AS n FROM ignore_list`).get() as { n: number }
  ).n;
  console.log(`smoke: ignore_list rows = ${ignoreCount}`);
  try {
    await Promise.race([
      bot.stop(),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
  } catch (err) {
    console.error(`smoke: bot.stop failed: ${errMessage(err)}`);
  }
  cleanup();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
