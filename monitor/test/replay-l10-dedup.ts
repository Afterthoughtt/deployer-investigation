import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { openDb, makePersistCandidate } from "../src/db.js";
import {
  detectCandidates,
  type MonitoredWallet,
} from "../src/detection/candidate.js";
import type { FreshnessChecker } from "../src/detection/fresh.js";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(TEST_DIR, "fixtures/l10-rpc.json");

const L10_FUNDING_SIG =
  "4hQpmGKE9irpwaEuzRL6kcK1c5uFGzfieaCAwXjvSSbLpUx4qGBKgZRpMvxuyspan7FrHEfNx8usvV9C6QS37UKu";
const L10_RECIPIENT = "2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB";
const MP1 = "Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6";

const raw = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
const event = { signature: L10_FUNDING_SIG, slot: 406_505_247, raw };

const monitored = new Map<string, MonitoredWallet>([
  [MP1, { address: MP1, label: "MoonPay Hot Wallet 1", category: "onramp" }],
]);
const freshness: FreshnessChecker = async () => ({ priorSigCount: 1, isFresh: true });

const tmpDir = mkdtempSync(join(tmpdir(), "l11-dedup-"));
const dbPath = join(tmpDir, "l11.db");

const db = openDb(dbPath);
const persist = makePersistCandidate(db);

let pass = true;
const check = (name: string, cond: boolean, detail?: string) => {
  const tag = cond ? "PASS" : "FAIL";
  console.log(`  ${tag}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) pass = false;
};

// ---- Run 1: fresh DB, fresh memory state — candidate should persist.
const cands1 = await detectCandidates({
  event,
  monitored,
  ignore: new Set(),
  alreadyCandidates: new Set(),
  inFlight: new Set(),
  freshness,
});
check("run 1: one candidate detected", cands1.length === 1);
const r1 = cands1[0]
  ? persist(cands1[0])
  : { candidateInserted: false, eventInserted: false };
check("run 1: candidate row inserted", r1.candidateInserted);
check("run 1: event row inserted", r1.eventInserted);

const candRowCount = (): number =>
  (db.prepare(`SELECT COUNT(*) AS n FROM candidates`).get() as { n: number }).n;
const eventRowCount = (): number =>
  (db.prepare(`SELECT COUNT(*) AS n FROM events`).get() as { n: number }).n;
check("run 1: candidates table has 1 row", candRowCount() === 1, String(candRowCount()));
check("run 1: events table has 1 row", eventRowCount() === 1, String(eventRowCount()));

// ---- Run 2: simulate daemon restart — rebuild alreadyCandidates from DB.
// A well-behaved daemon will skip re-detection at the pre-freshness gate
// because L10_RECIPIENT is in the set. No persist call should fire.
const alreadyCandidates2 = new Set<string>(
  (db.prepare(`SELECT address FROM candidates`).all() as { address: string }[]).map(
    (r) => r.address,
  ),
);
check(
  "run 2: alreadyCandidates seeded from DB",
  alreadyCandidates2.has(L10_RECIPIENT),
);
const cands2 = await detectCandidates({
  event,
  monitored,
  ignore: new Set(),
  alreadyCandidates: alreadyCandidates2,
  inFlight: new Set(),
  freshness,
});
check("run 2: no candidate emitted (blocked in-memory)", cands2.length === 0);

// ---- Run 3: belt-and-suspenders — persist the candidate a second time
// directly (simulating a bug where in-memory dedupe was bypassed). The DB
// UNIQUE + PK constraints must return changes=0 for both inserts.
const r3 = cands1[0]
  ? persist(cands1[0])
  : { candidateInserted: false, eventInserted: false };
check(
  "run 3: second persist returns candidateInserted=false",
  !r3.candidateInserted,
);
check(
  "run 3: second persist returns eventInserted=false",
  !r3.eventInserted,
);
check(
  "run 3: candidates table still has 1 row",
  candRowCount() === 1,
  String(candRowCount()),
);
check(
  "run 3: events table still has 1 row",
  eventRowCount() === 1,
  String(eventRowCount()),
);

db.close();
rmSync(tmpDir, { recursive: true, force: true });

if (!pass) {
  console.error("DEDUP REPLAY FAILED");
  process.exit(1);
}
console.log("DEDUP REPLAY PASSED");
