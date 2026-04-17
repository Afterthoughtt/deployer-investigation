import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { detectCandidates, type MonitoredWallet } from "../src/detection/candidate.js";
import type { FreshnessChecker } from "../src/detection/fresh.js";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(TEST_DIR, "fixtures/l10-rpc.json");

// Pinned from MONITOR_BUILD_PLAN.md — verified on-chain 2026-04-16.
const L10_FUNDING_SIG =
  "4hQpmGKE9irpwaEuzRL6kcK1c5uFGzfieaCAwXjvSSbLpUx4qGBKgZRpMvxuyspan7FrHEfNx8usvV9C6QS37UKu";
const L10_RECIPIENT = "2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB";
const MP1 = "Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6";
const EXPECTED_LAMPORTS = 13_443_000_000;
const EXPECTED_SLOT = 406_505_247;
const EXPECTED_BLOCKTIME_SEC = 1_773_550_293;

const raw = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

const monitored = new Map<string, MonitoredWallet>([
  [MP1, { address: MP1, label: "MoonPay Hot Wallet 1", category: "onramp" }],
]);

// Stub freshness checker: at the time L10's funder landed, 2mZzsVKN had
// exactly 1 signature (the funding tx itself). We can't re-query history
// to prove this today (the wallet has since deployed tokens), so pin it.
const freshness: FreshnessChecker = async () => ({
  priorSigCount: 1,
  isFresh: true,
});

const event = { signature: L10_FUNDING_SIG, slot: EXPECTED_SLOT, raw };

const candidates = await detectCandidates({
  event,
  monitored,
  ignore: new Set(),
  alreadyCandidates: new Set(),
  inFlight: new Set(),
  freshness,
  log: (m) => console.log(`  [log] ${m}`),
});

let pass = true;
const check = (name: string, cond: boolean, detail?: string) => {
  const tag = cond ? "PASS" : "FAIL";
  console.log(`  ${tag}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) pass = false;
};

console.log("L10 replay:");
check("exactly one candidate emitted", candidates.length === 1, `got ${candidates.length}`);

const c = candidates[0];
if (!c) {
  console.error("no candidate emitted — cannot continue");
  process.exit(1);
}

check("recipient = 2mZzsVKN...", c.recipient === L10_RECIPIENT, c.recipient);
check("source address = MP1", c.fundingSourceAddress === MP1, c.fundingSourceAddress);
check(
  "source label = MoonPay Hot Wallet 1",
  c.fundingSourceLabel === "MoonPay Hot Wallet 1",
  c.fundingSourceLabel,
);
check("category = onramp", c.fundingSourceCategory === "onramp", c.fundingSourceCategory);
check(
  "lamports = 13,443,000,000",
  c.fundedAmountLamports === EXPECTED_LAMPORTS,
  String(c.fundedAmountLamports),
);
check("SOL = 13.443", c.fundedAmountSol === 13.443, String(c.fundedAmountSol));
check("funding signature matches", c.fundingSignature === L10_FUNDING_SIG);
check("slot = 406505247", c.fundingSlot === EXPECTED_SLOT, String(c.fundingSlot));
check(
  "timestamp = blockTime * 1000",
  c.fundingTimestamp === EXPECTED_BLOCKTIME_SEC * 1000,
  String(c.fundingTimestamp),
);
check("confidence = HIGH", c.confidence === "HIGH", c.confidence);
check("priorSigCount = 1", c.priorSigCount === 1, String(c.priorSigCount));

if (!pass) {
  console.error("REPLAY FAILED");
  process.exit(1);
}
console.log("REPLAY PASSED");
