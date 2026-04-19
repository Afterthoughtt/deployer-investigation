import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import {
  openDb,
  makePersistCandidate,
  makeWhitelistCandidate,
  makeRejectCandidate,
  makeUnwhitelistCandidate,
  makeUnrejectCandidate,
  makeMarkAlertSent,
  makeListUnalertedCandidates,
} from "../src/db.js";
import type { Candidate } from "../src/detection/candidate.js";

const tmpDir = mkdtempSync(join(tmpdir(), "l11-actions-"));
const dbPath = join(tmpDir, "l11.db");
const db = openDb(dbPath);
const persist = makePersistCandidate(db);
const whitelist = makeWhitelistCandidate(db);
const reject = makeRejectCandidate(db);
const unwhitelist = makeUnwhitelistCandidate(db);
const unreject = makeUnrejectCandidate(db);

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

// --- PH6: unwhitelist round-trip ---------------------------------------
const addrE = "E5TestUnwhitelistAddr" + "A".repeat(44 - 21);
const sigE = "sigE" + "A".repeat(87 - 4);
const idE = seedCandidate(addrE, sigE, 414_000_000);
// Can't unwhitelist a detected row
const u1 = unwhitelist(idE);
check("unwhitelist on detected: statusChanged=false", !u1.statusChanged);
check(
  "unwhitelist on detected: previousStatus=detected",
  u1.previousStatus === "detected",
);
whitelist(idE);
const u2 = unwhitelist(idE);
check("unwhitelist round-trip: address returned", u2.address === addrE);
check("unwhitelist round-trip: statusChanged=true", u2.statusChanged === true);
check(
  "unwhitelist round-trip: previousStatus=whitelisted",
  u2.previousStatus === "whitelisted",
);
const rowE = db
  .prepare(`SELECT status, whitelisted_at FROM candidates WHERE id = ?`)
  .get(idE) as { status: string; whitelisted_at: number | null };
check("unwhitelist: row back to detected", rowE.status === "detected");
check("unwhitelist: whitelisted_at cleared", rowE.whitelisted_at === null);
// Idempotent on detected row
const u3 = unwhitelist(idE);
check("unwhitelist idempotent: statusChanged=false", !u3.statusChanged);
const uMissing = unwhitelist(999_999);
check("unwhitelist missing id: address=null", uMissing.address === null);

// --- PH6: unreject round-trip ------------------------------------------
const addrF = "F5TestUnrejectAddr" + "B".repeat(44 - 18);
const sigF = "sigF" + "B".repeat(87 - 4);
const idF = seedCandidate(addrF, sigF, 414_100_000);
reject(idF);
// pre: ignore_list should contain addrF
const ignoreBefore = db
  .prepare(`SELECT address FROM ignore_list WHERE address = ?`)
  .get(addrF) as { address: string } | undefined;
check("unreject preflight: ignore_list has addrF", ignoreBefore?.address === addrF);
const ur1 = unreject(idF);
check("unreject round-trip: address returned", ur1.address === addrF);
check("unreject round-trip: statusChanged=true", ur1.statusChanged === true);
check(
  "unreject round-trip: previousStatus=rejected",
  ur1.previousStatus === "rejected",
);
const rowF = db
  .prepare(`SELECT status, rejected_at FROM candidates WHERE id = ?`)
  .get(idF) as { status: string; rejected_at: number | null };
check("unreject: row back to detected", rowF.status === "detected");
check("unreject: rejected_at cleared", rowF.rejected_at === null);
const ignoreAfter = db
  .prepare(`SELECT address FROM ignore_list WHERE address = ?`)
  .get(addrF);
check("unreject: ignore_list row removed", ignoreAfter === undefined);
// Wrong-state path: unreject a detected row returns statusChanged=false
const ur2 = unreject(idF);
check("unreject on detected: statusChanged=false", !ur2.statusChanged);
check(
  "unreject on detected: previousStatus=detected",
  ur2.previousStatus === "detected",
);

// --- PH3: replay query + markAlertSent ----------------------------------
const listUnalerted = makeListUnalertedCandidates(db);
const markAlertSent = makeMarkAlertSent(db);

// Mark the detected rows left over from PH6 as alert_sent so PH3 starts from
// a clean "no un-alerted rows" baseline. In production these would already be
// alert_sent_at≠NULL because the alert push happened before whitelist/reject.
markAlertSent(idE);
markAlertSent(idF);

// Existing rows (idA whitelisted, idB rejected) are terminal — they must not
// appear in the un-alerted query regardless of their alert_sent_at value.
check(
  "replay: terminal rows excluded (even with alert_sent_at IS NULL)",
  listUnalerted().length === 0,
);

// Seed a detected row with alert_sent_at NULL — simulates crash between
// persistCandidate and sendCandidateAlert.
const addrC = "Do2j8tgHov4Hw5YhL8rA4ibhhfbeEeP2a5asreAejJwi";
const sigC =
  "2sfaMwoYCNENxQKtttGYxJ8LEzsxjVX5GqPhtXf3KRoohkyBZkNTLGkRUioQxecsYF6PdUcALWeTqhB8PMnZDvxR";
const idC = seedCandidate(addrC, sigC, 413_789_122);
const unalertedRows = listUnalerted();
check(
  "replay: detected + alert_sent_at NULL row returned",
  unalertedRows.length === 1 && unalertedRows[0]?.id === idC,
  `ids=${unalertedRows.map((r) => r.id).join(",")}`,
);
check(
  "replay: returned row has priorSigCount=1 (seeded)",
  unalertedRows[0]?.priorSigCount === 1,
);

// markAlertSent should make it drop out of the replay query.
markAlertSent(idC);
const afterMark = listUnalerted();
check(
  "replay: markAlertSent → row no longer returned",
  afterMark.length === 0,
);

// Persist another row and leave it un-alerted; confirm replay picks it up.
const addrD = "HTW7YzyQFNGsVjgcg96GrAspTgPnF9rjoAP8iRhd96qm";
const sigD =
  "5Nfk2zPvLWxz1qHHrWZ8e5yH8J6Zj3Yzq9uRxqR5w6qE4V4jP3b9YRqBuBzW2cRmJ5ZjLXM3SsXvGtqKLpPyQuY";
const idD = seedCandidate(addrD, sigD, 413_900_000);
const afterD = listUnalerted();
check(
  "replay: new un-alerted row picked up",
  afterD.length === 1 && afterD[0]?.id === idD,
);

// --- Crash-recovery simulation: inject a row via raw SQL with NULL alert_sent_at
// --- and confirm the replay query surfaces it. Mirrors production state after
// --- daemon crashes between persist and Telegram ack.
const rawCrashSig = "CrashBeforeAlert" + "A".repeat(87 - 16); // 87-char sig placeholder
const rawCrashAddr = "CrashRecovery" + "B".repeat(44 - 13);
db.prepare(
  `INSERT INTO candidates
     (address, funded_amount_sol, funding_source, funding_source_label,
      funding_signature, funding_slot, funding_timestamp,
      confidence, status, detected_at, alert_sent_at, prior_sig_count)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'detected', ?, NULL, ?)`,
).run(
  rawCrashAddr,
  10.0,
  "Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6",
  "MoonPay Hot Wallet 1",
  rawCrashSig,
  400_000_000,
  1_773_550_293_000,
  "MEDIUM",
  Date.now() - 3600_000, // older → should order before idD
  1,
);
const afterCrash = listUnalerted();
check(
  "replay: raw-SQL-inserted crash row surfaces",
  afterCrash.length === 2,
  `ids=${afterCrash.map((r) => r.id).join(",")}`,
);
check(
  "replay: rows ordered by detected_at ASC (oldest first)",
  afterCrash[0]?.address === rawCrashAddr && afterCrash[1]?.id === idD,
);

db.close();

// --- PH3: migration idempotency -----------------------------------------
// Calling openDb again on the same file must be a no-op — no errors,
// no duplicate columns.
const reopened = openDb(dbPath);
const colNames = (
  reopened
    .prepare(`SELECT name FROM pragma_table_info('candidates')`)
    .all() as { name: string }[]
).map((r) => r.name);
check(
  "migration: re-open does not duplicate alert_sent_at",
  colNames.filter((n) => n === "alert_sent_at").length === 1,
);
check(
  "migration: re-open does not duplicate prior_sig_count",
  colNames.filter((n) => n === "prior_sig_count").length === 1,
);
reopened.close();

// --- PH3: migration backfill on legacy DB -------------------------------
// Construct a DB *without* the new columns (simulates pre-PH3 file shape),
// insert a legacy detected row, then run openDb and verify the ALTER +
// backfill landed correctly.
const legacyDir = mkdtempSync(join(tmpdir(), "l11-legacy-"));
const legacyPath = join(legacyDir, "l11.db");
const legacyDb = new Database(legacyPath);
legacyDb.exec(`
  CREATE TABLE candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT UNIQUE NOT NULL,
    funded_amount_sol REAL NOT NULL,
    funding_source TEXT NOT NULL,
    funding_source_label TEXT,
    funding_signature TEXT NOT NULL,
    funding_slot INTEGER NOT NULL,
    funding_timestamp INTEGER NOT NULL,
    confidence TEXT NOT NULL,
    status TEXT NOT NULL,
    detected_at INTEGER NOT NULL,
    whitelisted_at INTEGER,
    rejected_at INTEGER
  );
`);
legacyDb
  .prepare(
    `INSERT INTO candidates
       (address, funded_amount_sol, funding_source, funding_source_label,
        funding_signature, funding_slot, funding_timestamp,
        confidence, status, detected_at)
     VALUES ('LegacyAddr', 13.443,
             'Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6',
             'MoonPay Hot Wallet 1',
             'LegacySig', 400000000, 1773550293000,
             'HIGH', 'detected', ?)`,
  )
  .run(Date.now() - 7200_000);
legacyDb.close();

const migrated = openDb(legacyPath);
const legacyRow = migrated
  .prepare(
    `SELECT alert_sent_at, prior_sig_count FROM candidates WHERE address = ?`,
  )
  .get("LegacyAddr") as
  | { alert_sent_at: number | null; prior_sig_count: number | null }
  | undefined;
check(
  "migration: legacy row gets alert_sent_at = NULL",
  legacyRow !== undefined && legacyRow.alert_sent_at === null,
);
check(
  "migration: legacy row backfilled to prior_sig_count = 1",
  legacyRow?.prior_sig_count === 1,
);
// And the legacy row must be returned by listUnalerted — this is the
// "5 live prod rows re-alert once" scenario.
const legacyUnalerted = makeListUnalertedCandidates(migrated)();
check(
  "migration: legacy detected row surfaces in replay query after migration",
  legacyUnalerted.length === 1 && legacyUnalerted[0]?.address === "LegacyAddr",
);
migrated.close();
rmSync(legacyDir, { recursive: true, force: true });

rmSync(tmpDir, { recursive: true, force: true });

if (!pass) {
  console.error("CANDIDATE ACTIONS TEST FAILED");
  process.exit(1);
}
console.log("CANDIDATE ACTIONS TEST PASSED");
