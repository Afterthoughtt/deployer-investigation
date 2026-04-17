import { Bot, GrammyError, HttpError } from "grammy";
import type { InlineKeyboard } from "grammy";
import type { CandidateAction } from "../db.js";
import { errMessage, type Logger } from "../util.js";

export interface CreateTelegramBotArgs {
  token: string;
  chatId: number;
  log: Logger;
  /** Invoked when the user taps the "Whitelist" inline button on a candidate alert. */
  onWhitelist: CandidateAction;
  /** Invoked when the user taps the "Reject" inline button on a candidate alert. */
  onReject: CandidateAction;
}

export interface TelegramBotHandle {
  /** Register commands with Telegram and begin long-polling in the background.
   *  Resolves once `setMyCommands` completes; long-polling starts asynchronously
   *  after that (grammy's `bot.start()` blocks for the lifetime of the bot, so
   *  we fire-and-forget it). */
  start: () => Promise<void>;
  /** Gracefully stop long-polling. Resolves when grammy has shut down. */
  stop: () => Promise<void>;
  /** Send plain text to the configured chat. */
  sendText: (text: string) => Promise<void>;
  /** Send HTML-formatted text to the configured chat, optionally with an inline keyboard. */
  sendHtml: (html: string, replyMarkup?: InlineKeyboard) => Promise<void>;
}

const COMMANDS = [
  { command: "status", description: "daemon + WS + candidate summary" },
  { command: "candidates", description: "list active candidates" },
  { command: "whitelist", description: "mark candidate whitelisted: /whitelist <id>" },
  { command: "reject", description: "reject candidate + add to ignore list: /reject <id>" },
  { command: "mute", description: "silence non-critical alerts: /mute <duration>" },
];

export function createTelegramBot(args: CreateTelegramBotArgs): TelegramBotHandle {
  const { token, chatId, log, onWhitelist, onReject } = args;
  const bot = new Bot(token);

  // Chat guard: drop every update whose chat isn't the configured one.
  // Silent-ish drop — we don't want to leak the bot's presence to other chats.
  bot.use(async (ctx, next) => {
    if (ctx.chat?.id !== chatId) {
      log.warn(
        `telegram: ignored update from chat=${ctx.chat?.id ?? "unknown"} (expected ${chatId})`,
      );
      return;
    }
    await next();
  });

  for (const { command } of COMMANDS) {
    bot.command(command, async (ctx) => {
      await ctx.reply(`stub: /${command} not yet implemented`);
    });
  }

  bot.callbackQuery(/^(wl|rj):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.match || typeof ctx.match === "string") return;
    const prefix = ctx.match[1];
    const idStr = ctx.match[2];
    if (!prefix || !idStr) return;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return;
    const isWhitelist = prefix === "wl";
    const verb = isWhitelist ? "whitelist" : "reject";
    const action = isWhitelist ? onWhitelist : onReject;

    let result;
    try {
      result = action(id);
    } catch (err) {
      log.error(`telegram: ${verb} C${id} failed: ${errMessage(err)}`);
      await ctx.reply(`${verb} C${id} failed: ${errMessage(err)}`);
      return;
    }
    if (!result.address) {
      await ctx.reply(`C${id} not found`);
      return;
    }
    if (!result.statusChanged) {
      await ctx.reply(`C${id} already ${result.previousStatus ?? "(unknown)"}`);
      return;
    }
    const emoji = isWhitelist ? "\u2705" : "\u274C";
    const past = isWhitelist ? "whitelisted" : "rejected";
    await ctx.reply(`${emoji} C${id} ${past}\n\n<code>${result.address}</code>`, {
      parse_mode: "HTML",
    });
  });

  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError) {
      log.error(`telegram: grammy error code=${e.error_code} desc=${e.description}`);
    } else if (e instanceof HttpError) {
      log.error(`telegram: http error ${e.message}`);
    } else {
      log.error(`telegram: unknown error ${errMessage(e)}`);
    }
  });

  return {
    start: async () => {
      await bot.api.setMyCommands(COMMANDS);
      void bot.start({
        onStart: (info) => log.info(`telegram: started polling as @${info.username}`),
      });
    },
    stop: async () => {
      await bot.stop();
      log.info("telegram: stopped");
    },
    sendText: async (text: string) => {
      await bot.api.sendMessage(chatId, text);
    },
    sendHtml: async (html: string, replyMarkup?: InlineKeyboard) => {
      await bot.api.sendMessage(chatId, html, {
        parse_mode: "HTML",
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    },
  };
}
