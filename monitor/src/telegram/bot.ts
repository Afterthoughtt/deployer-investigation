import { Bot, GrammyError, HttpError } from "grammy";
import type { Context, InlineKeyboard } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import type {
  ActiveCandidateCount,
  CandidateAction,
  ListActiveCandidates,
} from "../db.js";
import type { HealthCheckResult } from "../selfcheck.js";
import { errMessage, type Logger } from "../util.js";
import type { Category } from "../wallets.js";
import {
  escapeHtml,
  formatCandidatesBody,
  formatDuration,
  formatLastEventLines,
} from "./format.js";

export interface DaemonStatus {
  startedAt: number;
  wsConnected: boolean;
  subscribeCount: number;
  lastEventByCategory: Record<Category, number | null>;
}

export interface CreateTelegramBotArgs {
  token: string;
  chatId: number;
  log: Logger;
  /** Invoked when the user taps the "Whitelist" inline button or types /whitelist <id>. */
  onWhitelist: CandidateAction;
  /** Invoked when the user taps the "Reject" inline button or types /reject <id>. */
  onReject: CandidateAction;
  /** PH6: invoked by /unwhitelist <id> — moves a whitelisted row back to 'detected'. */
  onUnwhitelist: CandidateAction;
  /** PH6: invoked by /unreject <id> — moves a rejected row back to 'detected' and removes from ignore_list. */
  onUnreject: CandidateAction;
  /** Reader for /candidates. */
  listActiveCandidates: ListActiveCandidates;
  /** Count used by /status (cheaper than materializing the whole row set). */
  activeCandidateCount: ActiveCandidateCount;
  /** Snapshot of daemon uptime/ws/last-event state for /status. */
  getStatus: () => DaemonStatus;
  /** End-to-end probe triggered by /health. */
  runHealthChecks: () => Promise<HealthCheckResult[]>;
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
  { command: "health", description: "end-to-end probe (DB + RPC + WS + detection + alert)" },
  { command: "candidates", description: "list active candidates" },
  { command: "whitelist", description: "mark candidate whitelisted: /whitelist <id>" },
  { command: "reject", description: "reject candidate + add to ignore list: /reject <id>" },
  { command: "unwhitelist", description: "undo a whitelist: /unwhitelist <id>" },
  { command: "unreject", description: "undo a reject + remove from ignore list: /unreject <id>" },
  { command: "mute", description: "silence alerts for a duration: /mute 2h" },
  { command: "unmute", description: "cancel an active mute" },
];

// Reject /mute durations over 7d as typos rather than silently clamp.
const MAX_MUTE_MS = 7 * 24 * 60 * 60 * 1000;

interface ActionConfig {
  /** verb used in usage messages and error lines ("whitelist", "unreject", …) */
  verb: string;
  action: CandidateAction;
  /** rendered as the confirmation body (HTML). receives id + already-escaped address. */
  successHtml: (id: number, addrHtml: string) => string;
  /** rendered when the row exists but its status doesn't match the expected source.
   *  Receives id and the actual previousStatus. */
  mismatchText: (id: number, previousStatus: string) => string;
}

export function createTelegramBot(args: CreateTelegramBotArgs): TelegramBotHandle {
  const {
    token,
    chatId,
    log,
    onWhitelist,
    onReject,
    onUnwhitelist,
    onUnreject,
    listActiveCandidates,
    activeCandidateCount,
    getStatus,
    runHealthChecks,
  } = args;
  const bot = new Bot(token);

  // Transformer order: first-registered runs innermost (closest to the API
  // call). Throttler first → autoRetry wraps the throttled call, so when
  // autoRetry retries a 429 the retry itself re-enters the throttler queue
  // and is rate-limited. Throttler defaults align with Telegram's documented
  // per-chat + per-group limits — fine for our single-chat bot.
  bot.api.config.use(apiThrottler());
  // Retries 429 (flood-wait, honoring retry_after) and transient 5xx. Without
  // this, a single blip between `handleEvent` fire and Telegram ack silently
  // drops the candidate alert. maxDelaySeconds=30 absorbs typical 1–5s
  // flood-waits while refusing the 460–490s lockout windows.
  bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 30 }));

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

  const whitelistCfg: ActionConfig = {
    verb: "whitelist",
    action: onWhitelist,
    successHtml: (id, a) => `\u2705 C${id} whitelisted\n\n<code>${a}</code>`,
    mismatchText: (id, prev) => `C${id} already ${prev}`,
  };
  const rejectCfg: ActionConfig = {
    verb: "reject",
    action: onReject,
    successHtml: (id, a) => `\u274C C${id} rejected\n\n<code>${a}</code>`,
    mismatchText: (id, prev) => `C${id} already ${prev}`,
  };
  const unwhitelistCfg: ActionConfig = {
    verb: "unwhitelist",
    action: onUnwhitelist,
    successHtml: (id, a) =>
      `\u21A9\uFE0F C${id} moved back to detected\n\n<code>${a}</code>`,
    mismatchText: (id, prev) =>
      `C${id} not in whitelisted state (currently ${prev})`,
  };
  const unrejectCfg: ActionConfig = {
    verb: "unreject",
    action: onUnreject,
    successHtml: (id, a) =>
      `\u21A9\uFE0F C${id} moved back to detected\n\n<code>${a}</code>`,
    mismatchText: (id, prev) =>
      `C${id} not in rejected state (currently ${prev})`,
  };

  const dispatchCandidateAction = async (
    ctx: Context,
    id: number,
    cfg: ActionConfig,
  ): Promise<void> => {
    let result;
    try {
      result = cfg.action(id);
    } catch (err) {
      log.error(`telegram: ${cfg.verb} C${id} failed: ${errMessage(err)}`);
      await reply(ctx, `${cfg.verb} C${id} failed: ${errMessage(err)}`);
      return;
    }
    if (!result.address) {
      await reply(ctx, `C${id} not found`);
      return;
    }
    if (!result.statusChanged) {
      await reply(
        ctx,
        cfg.mismatchText(id, result.previousStatus ?? "(unknown)"),
      );
      return;
    }
    await reply(ctx, cfg.successHtml(id, escapeHtml(result.address)), {
      html: true,
    });
  };

  const runIdCommand = async (
    ctx: Context,
    argText: string,
    cfg: ActionConfig,
  ): Promise<void> => {
    const trimmed = argText.trim();
    if (trimmed === "") {
      await reply(ctx, `usage: /${cfg.verb} <id>`);
      return;
    }
    const id = Number(trimmed);
    if (!Number.isInteger(id) || id <= 0) {
      await reply(ctx, `usage: /${cfg.verb} <id> (got: ${trimmed})`);
      return;
    }
    await dispatchCandidateAction(ctx, id, cfg);
  };

  bot.command("status", async (ctx) => {
    const s = getStatus();
    const now = Date.now();
    const muteLine = isMuted()
      ? `muted for ${formatDuration((muteUntil ?? 0) - now)}`
      : "off";
    const lines = [
      "l11-monitor status",
      `Uptime: ${formatDuration(now - s.startedAt)}`,
      `WS: ${s.wsConnected ? "connected" : "disconnected"} (subscribes: ${s.subscribeCount})`,
      ...formatLastEventLines(s.lastEventByCategory, now),
      `Active candidates: ${activeCandidateCount()}`,
      `Mute: ${muteLine}`,
    ];
    await reply(ctx, lines.join("\n"));
  });

  bot.command("health", async (ctx) => {
    const results = await runHealthChecks();
    const allPassed = results.every((r) => r.passed);
    const header = allPassed
      ? "\u2705 /health — all checks passed"
      : "\u26A0\uFE0F /health — some checks failed";
    const body = results
      .map((r) => {
        const mark = r.passed ? "\u2705" : "\u274C";
        return `${mark} ${r.name} (${r.durationMs}ms) — ${r.detail}`;
      })
      .join("\n");
    await reply(ctx, `${header}\n\n${body}`);
  });

  bot.command("candidates", async (ctx) => {
    const rows = listActiveCandidates();
    await reply(ctx, formatCandidatesBody(rows, Date.now()), { html: true });
  });

  bot.command("whitelist", async (ctx) => {
    await runIdCommand(ctx, ctx.match, whitelistCfg);
  });

  bot.command("reject", async (ctx) => {
    await runIdCommand(ctx, ctx.match, rejectCfg);
  });

  bot.command("unwhitelist", async (ctx) => {
    await runIdCommand(ctx, ctx.match, unwhitelistCfg);
  });

  bot.command("unreject", async (ctx) => {
    await runIdCommand(ctx, ctx.match, unrejectCfg);
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
    await dispatchCandidateAction(
      ctx,
      Number(idStr),
      prefix === "wl" ? whitelistCfg : rejectCfg,
    );
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
