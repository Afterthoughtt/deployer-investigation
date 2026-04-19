import { InlineKeyboard } from "grammy";
import type { Db } from "./db.js";
import {
  detectCandidates,
  type MonitoredWallet,
} from "./detection/candidate.js";
import { rpcCall } from "./helius/rpc.js";
import type { TelegramBotHandle } from "./telegram/bot.js";
import { errMessage } from "./util.js";

export interface HealthCheckResult {
  name: string;
  passed: boolean;
  detail: string;
  /** Wall-clock duration in ms, rounded. */
  durationMs: number;
}

export interface RunHealthChecksArgs {
  db: Db;
  bot: TelegramBotHandle;
  heliusApiKey: string;
  monitored: ReadonlyMap<string, MonitoredWallet>;
  /** Returns timestamp of last on-ramp event, with the boot-grace fallback
   *  already applied by the caller. */
  getOnrampLastEventAt: () => number;
  getWsConnected: () => boolean;
  /** Max age allowed for the WS-freshness check. */
  wsFreshnessMaxAgeMs: number;
  now?: () => number;
}

const MP1 = "Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6";
const SYNTHETIC_RECIPIENT = "HeaLtHCheckTestRecipient1111111111111111111";
const SYNTHETIC_LAMPORTS = 13_443_000_000;

/**
 * Runs an end-to-end liveness probe:
 *   1. SQLite read
 *   2. Helius RPC (getBalance on MP1 — 1 credit)
 *   3. WS connected + on-ramp freshness
 *   4. Detection code path against a synthetic payload (no DB write)
 *   5. Telegram alert pipe via bot.sendHtml with inline keyboard
 *
 * Each check is independent — a failure in one does not short-circuit the rest.
 * Never throws; any internal error becomes a failed check in the result array.
 */
export async function runHealthChecks(
  args: RunHealthChecksArgs,
): Promise<HealthCheckResult[]> {
  const now = args.now ?? (() => Date.now());
  const results: HealthCheckResult[] = [];

  results.push(await runCheck("SQLite read", () => checkDb(args.db)));
  results.push(
    await runCheck("Helius RPC", () => checkRpc(args.heliusApiKey)),
  );
  results.push(
    await runCheck("Helius WS", () =>
      checkWs(
        args.getWsConnected(),
        args.getOnrampLastEventAt(),
        args.wsFreshnessMaxAgeMs,
        now(),
      ),
    ),
  );
  results.push(
    await runCheck("Detection", () => checkDetection(args.monitored)),
  );
  results.push(await runCheck("Alert pipe", () => checkAlertPipe(args.bot)));

  return results;
}

async function runCheck(
  name: string,
  fn: () => Promise<{ passed: boolean; detail: string }>,
): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const { passed, detail } = await fn();
    return { name, passed, detail, durationMs: Date.now() - start };
  } catch (err) {
    return {
      name,
      passed: false,
      detail: errMessage(err),
      durationMs: Date.now() - start,
    };
  }
}

async function checkDb(
  db: Db,
): Promise<{ passed: boolean; detail: string }> {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM candidates`)
    .get() as { n: number };
  return { passed: true, detail: `${row.n} candidate rows` };
}

async function checkRpc(
  apiKey: string,
): Promise<{ passed: boolean; detail: string }> {
  const result = await rpcCall<{ value: number }>(apiKey, "getBalance", [MP1]);
  const sol = (result.value / 1e9).toFixed(3);
  return { passed: true, detail: `MP1 balance ${sol} SOL` };
}

function checkWs(
  connected: boolean,
  lastEventAt: number,
  maxAgeMs: number,
  now: number,
): Promise<{ passed: boolean; detail: string }> {
  if (!connected) {
    return Promise.resolve({ passed: false, detail: "ws disconnected" });
  }
  const ageMs = now - lastEventAt;
  if (ageMs > maxAgeMs) {
    return Promise.resolve({
      passed: false,
      detail: `last on-ramp event ${Math.round(ageMs / 1000)}s ago (> ${Math.round(maxAgeMs / 1000)}s)`,
    });
  }
  return Promise.resolve({
    passed: true,
    detail: `last on-ramp event ${Math.round(ageMs / 1000)}s ago`,
  });
}

async function checkDetection(
  monitored: ReadonlyMap<string, MonitoredWallet>,
): Promise<{ passed: boolean; detail: string }> {
  if (!monitored.has(MP1)) {
    return {
      passed: false,
      detail: `MP1 not in monitored map — synthetic probe cannot run`,
    };
  }
  const raw = buildSyntheticPayload();
  const event = { signature: "selfcheck-synthetic-sig", slot: 0, raw };
  const candidates = await detectCandidates({
    event,
    monitored,
    ignore: new Set(),
    alreadyCandidates: new Set(),
    inFlight: new Set(),
    freshness: async () => ({ priorSigCount: 1, isFresh: true }),
  });
  if (candidates.length !== 1) {
    return {
      passed: false,
      detail: `expected 1 candidate, got ${candidates.length}`,
    };
  }
  const c = candidates[0]!;
  if (c.confidence !== "HIGH") {
    return {
      passed: false,
      detail: `expected HIGH, got ${c.confidence}`,
    };
  }
  return { passed: true, detail: "synthetic 13.443 SOL → HIGH" };
}

async function checkAlertPipe(
  bot: TelegramBotHandle,
): Promise<{ passed: boolean; detail: string }> {
  const keyboard = new InlineKeyboard()
    .text("\u2705 Test whitelist", "wl:0")
    .text("\u274C Test reject", "rj:0");
  const html = [
    "\uD83E\uDDEA /health alert-path test",
    "",
    "<i>Not a real candidate.</i>",
    "Tapping either button should reply <code>C0 not found</code>,",
    "which proves the callback round-trip end-to-end.",
  ].join("\n");
  await bot.sendHtml(html, keyboard);
  return { passed: true, detail: "test alert + inline keyboard pushed" };
}

/**
 * Minimal parsed-instruction payload that exercises the same recursive walker
 * the live detection path uses. Shape matches jsonParsed RPC output (what the
 * extractSolTransfers walker finds: a node with `program: "system"` and
 * `parsed: { type: "transfer", info: { source, destination, lamports } }`).
 */
function buildSyntheticPayload(): unknown {
  return {
    blockTime: 1_773_550_293,
    transaction: {
      message: {
        instructions: [
          {
            program: "system",
            parsed: {
              type: "transfer",
              info: {
                source: MP1,
                destination: SYNTHETIC_RECIPIENT,
                lamports: SYNTHETIC_LAMPORTS,
              },
            },
          },
        ],
      },
    },
  };
}
