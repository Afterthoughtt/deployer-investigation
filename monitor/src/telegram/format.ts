import type { ActiveCandidateRow } from "../db.js";
import type { Confidence } from "../detection/candidate.js";
import type { Category } from "../wallets.js";

export const TIER_EMOJI: Record<Confidence, string> = {
  HIGH: "\uD83D\uDFE2",   // 🟢
  MEDIUM: "\uD83D\uDFE1", // 🟡
  LOW: "\uD83D\uDD34",    // 🔴
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Human-readable duration. Drops seconds once we're past an hour so the output
 * stays compact for /status ("2h 14m" not "2h 14m 33s"); includes seconds for
 * sub-hour durations so short /mute confirmations read sensibly.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86_400);
  const h = Math.floor((totalSec % 86_400) / 3_600);
  const m = Math.floor((totalSec % 3_600) / 60);
  const s = totalSec % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  // Seconds only appear sub-hour, and only when meaningful (non-zero or the
  // output would otherwise be empty). Avoids trailing "1m 0s" / "3m 0s".
  if (d === 0 && h === 0 && (s > 0 || parts.length === 0)) {
    parts.push(`${s}s`);
  }
  return parts.join(" ");
}

export function formatAge(timestamp: number | null, now: number): string {
  if (timestamp === null) return "never";
  const diff = now - timestamp;
  if (diff < 1000) return "just now";
  return `${formatDuration(diff)} ago`;
}

const CATEGORY_LABELS: Record<Category, string> = {
  onramp: "On-ramp",
  hub: "Hub",
  intermediary: "Intermediary",
};

/**
 * Three "<Category> last event: X ago" lines, rendered in a fixed order so
 * /status and /heartbeat read consistently across restarts.
 */
export function formatLastEventLines(
  lastByCategory: Record<Category, number | null>,
  now: number,
): string[] {
  return (["onramp", "hub", "intermediary"] as const).map(
    (c) => `${CATEGORY_LABELS[c]} last event: ${formatAge(lastByCategory[c], now)}`,
  );
}

// Telegram hard-caps sendMessage text at 4096 chars (raw, including HTML tags).
// We leave 196 chars of headroom for last-minute append churn.
export const MAX_CANDIDATES_BODY_CHARS = 3900;

export interface CandidatesReply {
  text: string;
  /** Ids of rows that survived 4096-char truncation, in display order. The
   *  caller pairs these with inline-keyboard ✅/❌ buttons so each visible row
   *  has a one-tap whitelist/reject. Truncated trailing rows fall back to the
   *  textual `/whitelist <id>` / `/reject <id>` instructions in the footer. */
  visibleIds: number[];
}

/** /candidates renders 'active', /whitelisted renders 'whitelisted', etc.
 *  Drives the header label, empty-state text, and the truncation-footer hint
 *  so each list points at the right action commands. */
export type CandidatesView = "active" | "whitelisted" | "rejected";

const VIEW_COPY: Record<
  CandidatesView,
  { header: (n: number) => string; empty: string; footerHint: string }
> = {
  active: {
    header: (n) => `Active candidates (${n}):`,
    empty: "No active candidates.",
    footerHint: "use /whitelist &lt;id&gt; or /reject &lt;id&gt; directly",
  },
  whitelisted: {
    header: (n) => `Whitelisted candidates (${n}):`,
    empty: "No whitelisted candidates.",
    footerHint: "use /unwhitelist &lt;id&gt; directly",
  },
  rejected: {
    header: (n) => `Rejected candidates (${n}):`,
    empty: "No rejected candidates.",
    footerHint: "use /unreject &lt;id&gt; directly",
  },
};

/**
 * Render the /candidates reply body, honoring the 4096-char Telegram hard cap.
 * Each row is a 4-line chunk (blank separator + header + code-block address +
 * Solscan link). When the concatenated body would overflow, trailing chunks
 * are dropped in whole, and a "… and N more" footer is appended — never a
 * partial chunk.
 *
 * Exported for regression testing; `bot.ts` is the only runtime caller.
 */
export function formatCandidatesBody(
  rows: ActiveCandidateRow[],
  now: number,
  view: CandidatesView = "active",
): CandidatesReply {
  const copy = VIEW_COPY[view];
  if (rows.length === 0) return { text: copy.empty, visibleIds: [] };
  const total = rows.length;
  const header = copy.header(total);
  const rowChunks: string[][] = rows.map((r) => {
    const emoji = TIER_EMOJI[r.confidence];
    const src = escapeHtml(r.fundingSourceLabel ?? "(unknown)");
    const amount = r.fundedAmountSol.toFixed(3);
    const age = formatAge(r.detectedAt, now);
    const addr = escapeHtml(r.address);
    return [
      "",
      `${emoji} C${r.id} ${r.confidence} ${amount} SOL from ${src} \u00B7 ${age}`,
      `<code>${addr}</code>`,
      `<a href="https://solscan.io/account/${addr}">\uD83D\uDD0D Solscan</a>`,
    ];
  });

  // Footer is rendered with parse_mode=HTML alongside the rest of the body, so
  // literal `<id>` was being parsed by Telegram as an unknown tag and rejecting
  // the entire reply with code=400. Escape to entities.
  const footer = (dropped: number): string =>
    `\n\n\u2026 and ${dropped} more (${copy.footerHint})`;

  for (let n = total; n >= 0; n--) {
    const body = rowChunks.slice(0, n).flat().join("\n");
    const f = n < total ? footer(total - n) : "";
    const text = `${header}${body ? `\n${body}` : ""}${f}`;
    if (text.length <= MAX_CANDIDATES_BODY_CHARS) {
      return { text, visibleIds: rows.slice(0, n).map((r) => r.id) };
    }
  }
  // Header+footer alone is ~120 chars — always fits. This return is unreachable
  // in practice but makes the function total.
  return { text: `${header}${footer(total)}`, visibleIds: [] };
}
