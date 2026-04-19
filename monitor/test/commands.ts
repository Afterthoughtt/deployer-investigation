/**
 * Unit tests for increment 10's pure helpers + the /candidates DB reader.
 *
 * Covers what can be tested without a real Telegram connection: duration/age
 * parsing, status-filtering on the active-candidates reader, DESC ordering.
 * The command-routing layer itself is verified live against the Bot API via
 * /verify.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  openDb,
  makePersistCandidate,
  makeWhitelistCandidate,
  makeRejectCandidate,
  makeListActiveCandidates,
} from "../src/db.js";
import type { Candidate } from "../src/detection/candidate.js";
import type { ActiveCandidateRow } from "../src/db.js";
import { parseMuteDuration } from "../src/telegram/bot.js";
import {
  MAX_CANDIDATES_BODY_CHARS,
  formatAge,
  formatCandidatesBody,
  formatDuration,
} from "../src/telegram/format.js";

let pass = true;
const check = (name: string, cond: boolean, detail?: string) => {
  const tag = cond ? "PASS" : "FAIL";
  console.log(`  ${tag}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) pass = false;
};

// ---------- parseMuteDuration ----------
check("parseMuteDuration empty → null", parseMuteDuration("") === null);
check("parseMuteDuration gibberish → null", parseMuteDuration("abc") === null);
check("parseMuteDuration bare int → null", parseMuteDuration("5") === null);
check("parseMuteDuration zero → null", parseMuteDuration("0s") === null);
check(
  "parseMuteDuration negative → null",
  parseMuteDuration("-1h") === null,
);
check(
  "parseMuteDuration multi-unit → null",
  parseMuteDuration("1h30m") === null,
);
check(
  "parseMuteDuration trailing word → null",
  parseMuteDuration("2hours") === null,
);
check("parseMuteDuration '1s' → 1000", parseMuteDuration("1s") === 1_000);
check("parseMuteDuration '15m' → 900000", parseMuteDuration("15m") === 900_000);
check("parseMuteDuration '2h' → 7200000", parseMuteDuration("2h") === 7_200_000);
check("parseMuteDuration '1d' → 86400000", parseMuteDuration("1d") === 86_400_000);
check("parseMuteDuration case-insensitive", parseMuteDuration("2H") === 7_200_000);
check(
  "parseMuteDuration with surrounding space",
  parseMuteDuration("  30m  ") === 1_800_000,
);

// ---------- formatDuration ----------
check("formatDuration 0 → '0s'", formatDuration(0) === "0s");
check("formatDuration 999 → '0s'", formatDuration(999) === "0s");
check("formatDuration 1000 → '1s'", formatDuration(1_000) === "1s");
check("formatDuration 59s → '59s'", formatDuration(59_000) === "59s");
check("formatDuration 60s → '1m'", formatDuration(60_000) === "1m");
check(
  "formatDuration 1m30s → '1m 30s'",
  formatDuration(90_000) === "1m 30s",
);
check(
  "formatDuration 3m exact → '3m'",
  formatDuration(3 * 60_000) === "3m",
);
check(
  "formatDuration 1h exactly → '1h'",
  formatDuration(3_600_000) === "1h",
);
check(
  "formatDuration 1h1m → '1h 1m' (seconds dropped)",
  formatDuration(3_700_000) === "1h 1m",
);
check(
  "formatDuration 1h0m → '1h' (trailing zeros dropped)",
  formatDuration(3_600_500) === "1h",
);
check(
  "formatDuration 1d1h1m → '1d 1h 1m'",
  formatDuration(86_400_000 + 3_600_000 + 60_000) === "1d 1h 1m",
);
check(
  "formatDuration 1d exactly → '1d'",
  formatDuration(86_400_000) === "1d",
);
check(
  "formatDuration negative → '0s'",
  formatDuration(-5_000) === "0s",
);

// ---------- formatAge ----------
const NOW = 1_700_000_000_000;
check("formatAge null → 'never'", formatAge(null, NOW) === "never");
check(
  "formatAge same instant → 'just now'",
  formatAge(NOW, NOW) === "just now",
);
check(
  "formatAge <1s diff → 'just now'",
  formatAge(NOW - 500, NOW) === "just now",
);
check(
  "formatAge 5s ago",
  formatAge(NOW - 5_000, NOW) === "5s ago",
);
check(
  "formatAge 3m ago",
  formatAge(NOW - 3 * 60_000, NOW) === "3m ago",
);
check(
  "formatAge future timestamp → 'just now'",
  formatAge(NOW + 5_000, NOW) === "just now",
);

// ---------- makeListActiveCandidates ----------
const tmpDir = mkdtempSync(join(tmpdir(), "l11-commands-"));
const dbPath = join(tmpDir, "l11.db");
const db = openDb(dbPath);
const persist = makePersistCandidate(db);
const whitelist = makeWhitelistCandidate(db);
const reject = makeRejectCandidate(db);
const listActive = makeListActiveCandidates(db);

check("listActive: empty db → []", listActive().length === 0);

const sigAddr = (n: number): [string, string] => [
  `sig${"A".repeat(87 - 3 - String(n).length)}${n}`,
  `addr${"B".repeat(44 - 4 - String(n).length)}${n}`,
];

const seed = (
  n: number,
  label: string,
  confidence: Candidate["confidence"],
): number => {
  const [sig, addr] = sigAddr(n);
  const r = persist({
    recipient: addr,
    fundingSourceAddress: "Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6",
    fundingSourceLabel: label,
    fundingSourceCategory: "onramp",
    fundedAmountLamports: 10_000_000_000 + n,
    fundedAmountSol: 10 + n / 1000,
    fundingSignature: sig,
    fundingSlot: 400_000_000 + n,
    fundingTimestamp: NOW - n * 1_000,
    confidence,
    priorSigCount: 1,
  });
  if (!r.candidateInserted || r.candidateId === null) {
    throw new Error(`seed failed for n=${n}`);
  }
  return r.candidateId;
};

const id1 = seed(1, "MoonPay MP1", "HIGH");
const id2 = seed(2, "MoonPay MP2", "MEDIUM");
const id3 = seed(3, "v49 hub", "LOW");

// detected_at is set by Date.now() inside persist — enforce deterministic ordering
// by overwriting them on the DB side so the test isn't flaky on fast machines.
const setDetectedAt = db.prepare(
  `UPDATE candidates SET detected_at = ? WHERE id = ?`,
);
setDetectedAt.run(NOW - 3_000, id1); // oldest
setDetectedAt.run(NOW - 2_000, id2);
setDetectedAt.run(NOW - 1_000, id3); // newest

const all3 = listActive();
check("listActive: three detected rows returned", all3.length === 3);
check(
  "listActive: ordered DESC by detected_at",
  all3[0]?.id === id3 && all3[1]?.id === id2 && all3[2]?.id === id1,
  all3.map((r) => r.id).join(","),
);
check(
  "listActive: camelCase aliases present",
  typeof all3[0]?.fundedAmountSol === "number" &&
    typeof all3[0]?.detectedAt === "number",
);
check(
  "listActive: fundingSourceLabel preserved",
  all3[2]?.fundingSourceLabel === "MoonPay MP1",
  all3[2]?.fundingSourceLabel ?? "null",
);
check(
  "listActive: confidence preserved",
  all3[2]?.confidence === "HIGH" &&
    all3[1]?.confidence === "MEDIUM" &&
    all3[0]?.confidence === "LOW",
);

// Whitelist id1 → should drop out of listActive
whitelist(id1);
const after1 = listActive();
check(
  "listActive: whitelisted row excluded",
  after1.length === 2 && after1.every((r) => r.id !== id1),
);

// Reject id2 → should drop out too
reject(id2);
const after2 = listActive();
check(
  "listActive: rejected row excluded",
  after2.length === 1 && after2[0]?.id === id3,
);

// Terminal-status rows re-transitioned should stay terminal (sanity check)
whitelist(id1);
reject(id2);
check(
  "listActive: terminal rows stay excluded after no-op transitions",
  listActive().length === 1,
);

db.close();
rmSync(tmpDir, { recursive: true, force: true });

// ---------- formatCandidatesBody (PH2: 4096-char truncation guard) ----------
check(
  "formatCandidatesBody: empty rows → 'No active candidates.'",
  formatCandidatesBody([], NOW) === "No active candidates.",
);

const makeFakeRow = (i: number): ActiveCandidateRow => ({
  id: i,
  // realistic 44-char base58 pubkey (content doesn't matter for truncation math)
  address: `PumpFunDeployer${String(i).padStart(6, "0")}XXXXXXXXXXXXXXXXXXXXXXXX`.slice(
    0,
    44,
  ),
  fundedAmountSol: 13.443,
  fundingSourceLabel: "MoonPay Hot Wallet 1",
  confidence: "MEDIUM",
  detectedAt: NOW - i * 60_000,
});

// 3 rows: well under cap, no footer, every included row is complete (4 lines).
const smallBody = formatCandidatesBody([1, 2, 3].map(makeFakeRow), NOW);
check(
  "formatCandidatesBody small: under cap",
  smallBody.length <= MAX_CANDIDATES_BODY_CHARS,
  `${smallBody.length} chars`,
);
check(
  "formatCandidatesBody small: no truncation footer",
  !smallBody.includes("more (use /whitelist"),
);
check(
  "formatCandidatesBody small: header shows total",
  smallBody.startsWith("Active candidates (3):"),
);
check(
  "formatCandidatesBody small: three Solscan rows",
  (smallBody.match(/Solscan<\/a>/g) ?? []).length === 3,
);

// 60 rows @ ~215 chars each = ~12KB → guaranteed overflow.
const bigRows = Array.from({ length: 60 }, (_, i) => makeFakeRow(i + 1));
const bigBody = formatCandidatesBody(bigRows, NOW);
check(
  "formatCandidatesBody big: under 4096 char Telegram cap",
  bigBody.length <= 4096,
  `${bigBody.length} chars`,
);
check(
  "formatCandidatesBody big: under MAX_CANDIDATES_BODY_CHARS",
  bigBody.length <= MAX_CANDIDATES_BODY_CHARS,
  `${bigBody.length} chars`,
);
check(
  "formatCandidatesBody big: header still shows total=60",
  bigBody.startsWith("Active candidates (60):"),
);
const footerMatch = bigBody.match(/\u2026 and (\d+) more \(use \/whitelist <id> or \/reject <id> directly\)/);
check(
  "formatCandidatesBody big: truncation footer present",
  footerMatch !== null,
);
const droppedN = Number(footerMatch?.[1] ?? -1);
const solscanCount = (bigBody.match(/Solscan<\/a>/g) ?? []).length;
check(
  "formatCandidatesBody big: dropped + included = total",
  solscanCount + droppedN === 60,
  `included=${solscanCount} dropped=${droppedN}`,
);
// Every included row must be complete (4 lines → ending in Solscan closing tag)
// — no dangling `<code>` or truncated header line. Easiest check: every
// occurrence of `<code>` is followed by its closing `</code>` before the next.
check(
  "formatCandidatesBody big: no dangling <code> tags",
  (bigBody.match(/<code>/g) ?? []).length ===
    (bigBody.match(/<\/code>/g) ?? []).length &&
    (bigBody.match(/<code>/g) ?? []).length === solscanCount,
);
// The last included row's Solscan link must be followed by blank separator
// + footer, never by a half-rendered next row.
check(
  "formatCandidatesBody big: footer follows the last complete Solscan link",
  /Solscan<\/a>\n\n\u2026 and \d+ more/.test(bigBody),
);

if (!pass) {
  console.error("COMMANDS TEST FAILED");
  process.exit(1);
}
console.log("COMMANDS TEST PASSED");
