import { InlineKeyboard } from "grammy";
import type { Candidate } from "../detection/candidate.js";
import type { TelegramBotHandle } from "./bot.js";
import { TIER_EMOJI, escapeHtml } from "./format.js";

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
