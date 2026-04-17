import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  openDb,
  makePersistCandidate,
  makeWhitelistCandidate,
  makeRejectCandidate,
} from "../src/db.js";
import type { Candidate } from "../src/detection/candidate.js";

const tmpDir = mkdtempSync(join(tmpdir(), "l11-actions-"));
const dbPath = join(tmpDir, "l11.db");
const db = openDb(dbPath);
const persist = makePersistCandidate(db);
const whitelist = makeWhitelistCandidate(db);
const reject = makeRejectCandidate(db);

let pass = true;
const check = (name: string, cond: boolean, detail?: string) => {
  const tag = cond ? "PASS" : "FAIL";
  console.log(`  ${tag}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) pass = false;
};

const seedCandidate = (
  recipient: string,
  sig: string,
  slot: number,
): number => {
  const c: Candidate = {
    recipient,
    fundingSourceAddress: "Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6",
    fundingSourceLabel: "MoonPay Hot Wallet 1",
    fundingSourceCategory: "onramp",
    fundedAmountLamports: 13_443_000_000,
    fundedAmountSol: 13.443,
    fundingSignature: sig,
    fundingSlot: slot,
    fundingTimestamp: 1_773_550_293_000,
    confidence: "HIGH",
    priorSigCount: 1,
  };
  const r = persist(c);
  if (!r.candidateInserted || r.candidateId === null) {
    throw new Error(`seed failed for ${recipient}`);
  }
  return r.candidateId;
};

const addrA = "2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB";
const addrB = "cqUHqi8ntcxG6QHJ2mgne3UramTmikjeLAeAp7sS9Ls";
const sigA =
  "4hQpmGKE9irpwaEuzRL6kcK1c5uFGzfieaCAwXjvSSbLpUx4qGBKgZRpMvxuyspan7FrHEfNx8usvV9C6QS37UKu";
const sigB =
  "4MGa4vd2ps3YHnZimCppPixBgY9viV58NR8U9H3oehVowvr3Pbj3R9gcmC8yBjbsktUnzS5MhP9drU5XCCeHKVuT";

const idA = seedCandidate(addrA, sigA, 406_505_247);
const idB = seedCandidate(addrB, sigB, 413_776_858);
check("persist assigned monotonic ids", idB > idA, `A=${idA} B=${idB}`);

// --- whitelist flow -------------------------------------------------------
const r1 = whitelist(idA);
check("whitelist: address returned", r1.address === addrA, r1.address ?? "null");
check("whitelist: statusChanged=true", r1.statusChanged === true);
check(
  "whitelist: previousStatus=detected",
  r1.previousStatus === "detected",
  r1.previousStatus ?? "null",
);
const rowA = db
  .prepare(`SELECT status, whitelisted_at FROM candidates WHERE id = ?`)
  .get(idA) as { status: string; whitelisted_at: number | null };
check("whitelist: row status=whitelisted", rowA.status === "whitelisted");
check(
  "whitelist: whitelisted_at populated",
  typeof rowA.whitelisted_at === "number" && rowA.whitelisted_at > 0,
);

const r2 = whitelist(idA);
check("whitelist (idempotent): address still returned", r2.address === addrA);
check("whitelist (idempotent): statusChanged=false", r2.statusChanged === false);
check(
  "whitelist (idempotent): previousStatus=whitelisted",
  r2.previousStatus === "whitelisted",
);

const rMissing = whitelist(999_999);
check("whitelist missing id: address=null", rMissing.address === null);
check("whitelist missing id: statusChanged=false", !rMissing.statusChanged);

// --- reject flow ----------------------------------------------------------
const r3 = reject(idB);
check("reject: address returned", r3.address === addrB, r3.address ?? "null");
check("reject: statusChanged=true", r3.statusChanged === true);
check("reject: previousStatus=detected", r3.previousStatus === "detected");
const rowB = db
  .prepare(`SELECT status, rejected_at FROM candidates WHERE id = ?`)
  .get(idB) as { status: string; rejected_at: number | null };
check("reject: row status=rejected", rowB.status === "rejected");
check(
  "reject: rejected_at populated",
  typeof rowB.rejected_at === "number" && rowB.rejected_at > 0,
);
const ignoreRow = db
  .prepare(`SELECT address, reason FROM ignore_list WHERE address = ?`)
  .get(addrB) as { address: string; reason: string } | undefined;
check("reject: address added to ignore_list", ignoreRow?.address === addrB);
check(
  "reject: ignore_list reason references id",
  ignoreRow?.reason.includes(String(idB)) === true,
  ignoreRow?.reason,
);

const r4 = reject(idB);
check("reject (idempotent): statusChanged=false", r4.statusChanged === false);
check(
  "reject (idempotent): previousStatus=rejected",
  r4.previousStatus === "rejected",
);

// --- cross-terminal: whitelist a rejected candidate -----------------------
const r5 = whitelist(idB);
check(
  "whitelist after reject: statusChanged=false (terminal state)",
  r5.statusChanged === false,
);
check(
  "whitelist after reject: previousStatus=rejected",
  r5.previousStatus === "rejected",
);

db.close();
rmSync(tmpDir, { recursive: true, force: true });

if (!pass) {
  console.error("CANDIDATE ACTIONS TEST FAILED");
  process.exit(1);
}
console.log("CANDIDATE ACTIONS TEST PASSED");
