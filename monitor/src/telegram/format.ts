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
