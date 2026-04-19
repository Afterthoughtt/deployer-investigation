/**
 * Verifies the synthetic payload baked into selfcheck.ts actually trips the
 * detection code path and comes out HIGH. If this ever fails, the /health
 * "Detection" check will false-negative — the same tier logic a real
 * candidate hits.
 */
import { detectCandidates, type MonitoredWallet } from "../src/detection/candidate.js";

const MP1 = "Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6";
const SYNTHETIC_RECIPIENT = "HeaLtHCheckTestRecipient1111111111111111111";
const SYNTHETIC_LAMPORTS = 13_443_000_000;

const raw = {
  blockTime: 1_773_550_293,
  transaction: {
    message: {
      instructions: [
        {
          program: "system",
          parsed: {
            type: "transfer",
            info: {
              source: MP1,
              destination: SYNTHETIC_RECIPIENT,
              lamports: SYNTHETIC_LAMPORTS,
            },
          },
        },
      ],
    },
  },
};

const monitored = new Map<string, MonitoredWallet>([
  [MP1, { address: MP1, label: "MoonPay Hot Wallet 1", category: "onramp" }],
]);

const candidates = await detectCandidates({
  event: { signature: "selfcheck-synthetic-sig", slot: 0, raw },
  monitored,
  ignore: new Set(),
  alreadyCandidates: new Set(),
  inFlight: new Set(),
  freshness: async () => ({ priorSigCount: 1, isFresh: true }),
});

let pass = true;
const check = (name: string, cond: boolean, detail?: string) => {
  const tag = cond ? "PASS" : "FAIL";
  console.log(`  ${tag}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) pass = false;
};

console.log("/health synthetic detection:");
check(
  "exactly one candidate emitted",
  candidates.length === 1,
  `got ${candidates.length}`,
);
const c = candidates[0];
if (c) {
  check("confidence = HIGH", c.confidence === "HIGH", c.confidence);
  check("recipient matches synthetic", c.recipient === SYNTHETIC_RECIPIENT);
  check("SOL = 13.443", c.fundedAmountSol === 13.443, String(c.fundedAmountSol));
  check("priorSigCount = 1", c.priorSigCount === 1, String(c.priorSigCount));
}

if (!pass) {
  console.error("SELFCHECK SYNTHETIC FAILED");
  process.exit(1);
}
console.log("SELFCHECK SYNTHETIC PASSED");
