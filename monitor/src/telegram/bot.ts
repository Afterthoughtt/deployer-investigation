import { Bot, GrammyError, HttpError } from "grammy";
import type { Context, InlineKeyboard } from "grammy";
import type { CandidateAction, ListActiveCandidates } from "../db.js";
import { errMessage, type Logger } from "../util.js";
import { TIER_EMOJI, escapeHtml, formatAge, formatDuration } from "./format.js";

export interface DaemonStatus {
  startedAt: number;
  wsConnected: boolean;
  subscribeCount: number;
  lastEventAt: number | null;
}

export interface CreateTelegramBotArgs {
  token: string;
  chatId: number;
  log: Logger;
  /** Invoked when the user taps the "Whitelist" inline button or types /whitelist <id>. */
  onWhitelist: CandidateAction;
  /** Invoked when the user taps the "Reject" inline button or types /reject <id>. */
  onReject: CandidateAction;
  /** Reader for /candidates and the count in /status. */
  listActiveCandidates: ListActiveCandidates;
  /** Snapshot of daemon uptime/ws/last-event state for /status. */
  getStatus: () => DaemonStatus;
}

export interface TelegramBotHandle {
  /** Register commands with Telegram and begin long-polling in the background.
   *  Resolves once `setMyCommands` completes; long-polling starts asynchronously
   *  after that (grammy's `bot.start()` blocks for the lifetime of the bot, so
   *  we fire-and-forget it). */
  start: () => Promise<void>;
  /** Gracefully stop long-polling. Resolves when grammy has shut down. */
  stop: () => Promise<void>;
  /** Send plain text to the configured chat (silenced while /mute is active). */
  sendText: (text: string) => Promise<void>;
  /** Send HTML-formatted text to the configured chat, optionally with an inline keyboard. */
  sendHtml: (html: string, replyMarkup?: InlineKeyboard) => Promise<void>;
}

const COMMANDS = [
  { command: "status", description: "daemon + WS + candidate summary" },
  { command: "candidates", description: "list active candidates" },
  { command: "whitelist", description: "mark candidate whitelisted: /whitelist <id>" },
  { command: "reject", description: "reject candidate + add to ignore list: /reject <id>" },
  { command: "mute", description: "silence alerts for a duration: /mute 2h" },
  { command: "unmute", description: "cancel an active mute" },
];

// Reject /mute durations over 7d as typos rather than silently clamp.
const MAX_MUTE_MS = 7 * 24 * 60 * 60 * 1000;

export function createTelegramBot(args: CreateTelegramBotArgs): TelegramBotHandle {
  const {
    token,
    chatId,
    log,
    onWhitelist,
    onReject,
    listActiveCandidates,
    getStatus,
  } = args;
  const bot = new Bot(token);

  // In-memory only: a daemon restart clears the mute, which is the right default
  // — restarts are rare and the user will want to know the daemon is healthy.
  let muteUntil: number | null = null;
  const isMuted = (): boolean =>
    muteUntil !== null && Date.now() < muteUntil;

  bot.use(async (ctx, next) => {
    if (ctx.chat?.id !== chatId) {
      log.warn(
        `telegram: ignored update from chat=${ctx.chat?.id ?? "unknown"} (expected ${chatId})`,
      );
      return;
    }
    await next();
  });

  const reply = async (
    ctx: Context,
    text: string,
    opts: { html?: boolean } = {},
  ): Promise<void> => {
    await ctx.reply(text, {
      disable_notification: isMuted(),
      link_preview_options: { is_disabled: true },
      ...(opts.html ? { parse_mode: "HTML" as const } : {}),
    });
  };

  const dispatchCandidateAction = async (
    ctx: Context,
    id: number,
    isWhitelist: boolean,
  ): Promise<void> => {
    const verb = isWhitelist ? "whitelist" : "reject";
    const action = isWhitelist ? onWhitelist : onReject;
    let result;
    try {
      result = action(id);
    } catch (err) {
      log.error(`telegram: ${verb} C${id} failed: ${errMessage(err)}`);
      await reply(ctx, `${verb} C${id} failed: ${errMessage(err)}`);
      return;
    }
    if (!result.address) {
      await reply(ctx, `C${id} not found`);
      return;
    }
    if (!result.statusChanged) {
      await reply(
        ctx,
        `C${id} already ${result.previousStatus ?? "(unknown)"}`,
      );
      return;
    }
    const emoji = isWhitelist ? "\u2705" : "\u274C";
    const past = isWhitelist ? "whitelisted" : "rejected";
    await reply(
      ctx,
      `${emoji} C${id} ${past}\n\n<code>${escapeHtml(result.address)}</code>`,
      { html: true },
    );
  };

  const runIdCommand = async (
    ctx: Context,
    argText: string,
    isWhitelist: boolean,
  ): Promise<void> => {
    const verb = isWhitelist ? "whitelist" : "reject";
    const trimmed = argText.trim();
    if (trimmed === "") {
      await reply(ctx, `usage: /${verb} <id>`);
      return;
    }
    const id = Number(trimmed);
    if (!Number.isInteger(id) || id <= 0) {
      await reply(ctx, `usage: /${verb} <id> (got: ${trimmed})`);
      return;
    }
    await dispatchCandidateAction(ctx, id, isWhitelist);
  };

  bot.command("status", async (ctx) => {
    const s = getStatus();
    const now = Date.now();
    const active = listActiveCandidates().length;
    const muteLine = isMuted()
      ? `muted for ${formatDuration((muteUntil ?? 0) - now)}`
      : "off";
    const lines = [
      "l11-monitor status",
      `Uptime: ${formatDuration(now - s.startedAt)}`,
      `WS: ${s.wsConnected ? "connected" : "disconnected"} (subscribes: ${s.subscribeCount})`,
      `Last event: ${formatAge(s.lastEventAt, now)}`,
      `Active candidates: ${active}`,
      `Mute: ${muteLine}`,
    ];
    await reply(ctx, lines.join("\n"));
  });

  bot.command("candidates", async (ctx) => {
    const rows = listActiveCandidates();
    if (rows.length === 0) {
      await reply(ctx, "No active candidates.");
      return;
    }
    const now = Date.now();
    const lines: string[] = [`Active candidates (${rows.length}):`];
    for (const r of rows) {
      const emoji = TIER_EMOJI[r.confidence];
      const src = escapeHtml(r.fundingSourceLabel ?? "(unknown)");
      const amount = r.fundedAmountSol.toFixed(3);
      const age = formatAge(r.detectedAt, now);
      const addr = escapeHtml(r.address);
      lines.push("");
      lines.push(
        `${emoji} C${r.id} ${r.confidence} ${amount} SOL from ${src} · ${age}`,
      );
      lines.push(`<code>${addr}</code>`);
      lines.push(
        `<a href="https://solscan.io/account/${addr}">\uD83D\uDD0D Solscan</a>`,
      );
    }
    await reply(ctx, lines.join("\n"), { html: true });
  });

  bot.command("whitelist", async (ctx) => {
    await runIdCommand(ctx, ctx.match, true);
  });

  bot.command("reject", async (ctx) => {
    await runIdCommand(ctx, ctx.match, false);
  });

  bot.command("mute", async (ctx) => {
    const arg = ctx.match.trim();
    if (arg === "") {
      await reply(ctx, "usage: /mute <duration>  (e.g. 30s, 15m, 2h, 1d)");
      return;
    }
    const ms = parseMuteDuration(arg);
    if (ms === null) {
      await reply(
        ctx,
        `unrecognized duration: "${arg}"\nexpected a number + s/m/h/d (e.g. 2h, 30m)`,
      );
      return;
    }
    if (ms > MAX_MUTE_MS) {
      await reply(ctx, `max mute is ${formatDuration(MAX_MUTE_MS)}`);
      return;
    }
    const now = Date.now();
    muteUntil = now + ms;
    // Confirmation is itself sent silently — the user just asked for quiet.
    await reply(
      ctx,
      `\uD83D\uDD15 muted for ${formatDuration(ms)} (until ${new Date(muteUntil).toISOString()})`,
    );
  });

  bot.command("unmute", async (ctx) => {
    const wasMuted = isMuted();
    muteUntil = null;
    await reply(ctx, wasMuted ? "\uD83D\uDD14 unmuted" : "not muted");
  });

  bot.callbackQuery(/^(wl|rj):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (typeof ctx.match === "string") return;
    const prefix = ctx.match[1];
    const idStr = ctx.match[2];
    if (!prefix || !idStr) return;
    await dispatchCandidateAction(ctx, Number(idStr), prefix === "wl");
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
      await bot.api.sendMessage(chatId, text, {
        disable_notification: isMuted(),
        link_preview_options: { is_disabled: true },
      });
    },
    sendHtml: async (html: string, replyMarkup?: InlineKeyboard) => {
      await bot.api.sendMessage(chatId, html, {
        parse_mode: "HTML",
        disable_notification: isMuted(),
        link_preview_options: { is_disabled: true },
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    },
  };
}

/**
 * Parse a duration like "30s" / "15m" / "2h" / "1d" into milliseconds. Returns
 * null for anything that doesn't match, including zero and negative values.
 */
export function parseMuteDuration(s: string): number | null {
  const m = /^(\d+)([smhd])$/.exec(s.trim().toLowerCase());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2];
  const factor =
    unit === "s"
      ? 1_000
      : unit === "m"
        ? 60_000
        : unit === "h"
          ? 3_600_000
          : unit === "d"
            ? 86_400_000
            : 0;
  const ms = n * factor;
  return ms > 0 ? ms : null;
}
