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
