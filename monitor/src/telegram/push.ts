import { InlineKeyboard } from "grammy";
import type { Candidate, Confidence } from "../detection/candidate.js";
import type { TelegramBotHandle } from "./bot.js";

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

const TIER_EMOJI: Record<Confidence, string> = {
  HIGH: "\uD83D\uDFE2",   // 🟢
  MEDIUM: "\uD83D\uDFE1", // 🟡
  LOW: "\uD83D\uDD34",    // 🔴
};

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
