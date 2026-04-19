import { InlineKeyboard } from "grammy";
import type { Candidate } from "../detection/candidate.js";
import type { Category } from "../wallets.js";
import type { TelegramBotHandle } from "./bot.js";
import {
  TIER_EMOJI,
  escapeHtml,
  formatDuration,
  formatLastEventLines,
} from "./format.js";

export async function sendStartupMessage(
  bot: TelegramBotHandle,
  meta: { monitoredCount: number; existingCandidates: number },
): Promise<void> {
  const lines = [
    "l11-monitor: online",
    `monitoring ${meta.monitoredCount} wallets`,
    `${meta.existingCandidates} existing candidates in DB`,
  ];
  await bot.sendText(lines.join("\n"));
}

export async function sendCandidateAlert(
  bot: TelegramBotHandle,
  candidate: Candidate,
  candidateId: number,
): Promise<void> {
  const priorSigText =
    candidate.priorSigCount === 1
      ? "1 prior sig"
      : `${candidate.priorSigCount} prior sigs`;
  const lines = [
    `${TIER_EMOJI[candidate.confidence]} CANDIDATE DETECTED — C${candidateId}`,
    "",
    `<code>${escapeHtml(candidate.recipient)}</code>`,
    "",
    `Amount: ${candidate.fundedAmountSol.toFixed(3)} SOL`,
    `Source: ${escapeHtml(candidate.fundingSourceLabel)}`,
    `Fresh: \u2705 (${priorSigText})`,
    `Confidence: ${candidate.confidence}`,
  ];
  const keyboard = new InlineKeyboard()
    .text("\u2705 Whitelist", `wl:${candidateId}`)
    .text("\u274C Reject", `rj:${candidateId}`)
    .url(
      "\uD83D\uDD0D Solscan",
      `https://solscan.io/account/${candidate.recipient}`,
    );
  await bot.sendHtml(lines.join("\n"), keyboard);
}

export async function sendStaleWarning(
  bot: TelegramBotHandle,
  meta: { ageMs: number; thresholdMs: number },
): Promise<void> {
  const lines = [
    "\u26A0\uFE0F l11-monitor: on-ramp stale",
    `no on-ramp events in ${formatDuration(meta.ageMs)}`,
    `threshold ${formatDuration(meta.thresholdMs)}`,
    "check WS + journalctl",
  ];
  await bot.sendText(lines.join("\n"));
}

export async function sendStaleRecovery(
  bot: TelegramBotHandle,
  meta: { stalenessDurationMs: number },
): Promise<void> {
  await bot.sendText(
    `\u2705 l11-monitor: on-ramp recovered (stale for ${formatDuration(meta.stalenessDurationMs)})`,
  );
}

export async function sendWsDownWarning(
  bot: TelegramBotHandle,
  meta: { downForMs: number },
): Promise<void> {
  const lines = [
    "\u26A0\uFE0F l11-monitor: WebSocket down",
    `reconnect has been failing for ${formatDuration(meta.downForMs)}`,
    "check journalctl -u l11-monitor -f",
  ];
  await bot.sendText(lines.join("\n"));
}

export async function sendWsRecovery(
  bot: TelegramBotHandle,
  meta: { downMs: number },
): Promise<void> {
  await bot.sendText(
    `\u2705 l11-monitor: WebSocket back (was down for ${formatDuration(meta.downMs)})`,
  );
}

export async function sendRpcFailureWarning(
  bot: TelegramBotHandle,
  meta: { consecutive: number },
): Promise<void> {
  const lines = [
    "\u26A0\uFE0F l11-monitor: freshness RPC failing",
    `${meta.consecutive} consecutive getSignaturesForAddress errors`,
    "candidates may be silently dropped — check Helius credits + network",
  ];
  await bot.sendText(lines.join("\n"));
}

export async function sendRpcFailureRecovery(
  bot: TelegramBotHandle,
): Promise<void> {
  await bot.sendText(
    "\u2705 l11-monitor: freshness RPC recovered",
  );
}

export async function sendHeartbeat(
  bot: TelegramBotHandle,
  meta: {
    uptimeMs: number;
    activeCandidateCount: number;
    lastEventByCategory: Record<Category, number | null>;
  },
): Promise<void> {
  const lines = [
    "\uD83D\uDC93 l11-monitor heartbeat",
    `Uptime: ${formatDuration(meta.uptimeMs)}`,
    `Active candidates: ${meta.activeCandidateCount}`,
    ...formatLastEventLines(meta.lastEventByCategory, Date.now()),
  ];
  await bot.sendText(lines.join("\n"));
}
