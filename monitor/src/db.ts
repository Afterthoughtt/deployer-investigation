import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Candidate, Confidence } from "./detection/candidate.js";

const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS monitored_wallets (
  address TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  last_processed_signature TEXT,
  last_processed_slot INTEGER
);

CREATE TABLE IF NOT EXISTS candidates (
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
  rejected_at INTEGER,
  alert_sent_at INTEGER,
  prior_sig_count INTEGER
);

CREATE TABLE IF NOT EXISTS ignore_list (
  address TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  added_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  signature TEXT PRIMARY KEY,
  slot INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  source_address TEXT NOT NULL,
  destination_address TEXT,
  amount_sol REAL,
  processed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_source ON events(source_address);
CREATE INDEX IF NOT EXISTS idx_events_dest ON events(destination_address);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status);
`;

export type Db = Database.Database;

export function openDb(dbPath: string): Db {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_DDL);
  migrateCandidatesSchema(db);
  return db;
}

/**
 * Idempotent migration for columns added after the original CREATE TABLE. For
 * each column listed in CANDIDATES_MIGRATIONS that is missing, run the ALTER
 * and its optional post-ALTER backfill. Runs before any prepared statements
 * so `makePersistCandidate`'s INSERT binds against the final column set.
 */
const CANDIDATES_MIGRATIONS: Array<{
  column: string;
  ddl: string; // full ALTER TABLE ... ADD COLUMN ... clause
  /** One-shot SQL to populate the new column for rows that existed pre-migration.
   *  Runs only when the column was actually added. */
  backfill?: string;
}> = [
  // PH3: persist whether each candidate has successfully been alerted to the
  // operator. NULL means "never alerted" → startup replay will push it.
  { column: "alert_sent_at", ddl: "ADD COLUMN alert_sent_at INTEGER" },
  // PH3: replay needs priorSigCount to render the "1 prior sig" / "N prior sigs"
  // line faithfully. Historical detections all had priorSigCount=1 (by tiering
  // logic at the time), so backfill NULLs to 1.
  {
    column: "prior_sig_count",
    ddl: "ADD COLUMN prior_sig_count INTEGER",
    backfill:
      "UPDATE candidates SET prior_sig_count = 1 WHERE prior_sig_count IS NULL",
  },
];

function migrateCandidatesSchema(db: Db): void {
  const existing = new Set(
    (
      db
        .prepare(`SELECT name FROM pragma_table_info('candidates')`)
        .all() as { name: string }[]
    ).map((r) => r.name),
  );
  for (const m of CANDIDATES_MIGRATIONS) {
    if (existing.has(m.column)) continue;
    db.exec(`ALTER TABLE candidates ${m.ddl}`);
    console.log(`db-migrate: candidates +${m.column}`);
    if (m.backfill) {
      const info = db.prepare(m.backfill).run();
      console.log(
        `db-migrate: candidates.${m.column} backfilled ${info.changes} row(s)`,
      );
    }
  }
}

export interface PersistCandidateResult {
  candidateInserted: boolean; // false => already persisted (DB dedup fired)
  candidateId: number | null; // lastInsertRowid on successful insert; null if ignored
  eventInserted: boolean;     // false => sig already in events table
}

export type PersistCandidate = (c: Candidate) => PersistCandidateResult;

export type CandidateStatus = "detected" | "whitelisted" | "rejected";

export interface CandidateActionResult {
  /** null if the id doesn't exist in the candidates table. */
  address: string | null;
  /** true iff this call moved the row from 'detected' to the target status. */
  statusChanged: boolean;
  /** row's status *before* this call; null iff the row was missing. */
  previousStatus: CandidateStatus | null;
}

export type CandidateAction = (id: number) => CandidateActionResult;

export interface ActiveCandidateRow {
  id: number;
  address: string;
  fundedAmountSol: number;
  fundingSourceLabel: string | null;
  confidence: Confidence;
  detectedAt: number;
}

export type ListActiveCandidates = () => ActiveCandidateRow[];

export type ActiveCandidateCount = () => number;

export function makeActiveCandidateCount(db: Db): ActiveCandidateCount {
  const stmt = db.prepare(
    `SELECT COUNT(*) AS n FROM candidates WHERE status = 'detected'`,
  );
  return () => (stmt.get() as { n: number }).n;
}

/** Snapshot of candidates currently awaiting a whitelist/reject decision. */
export function makeListActiveCandidates(db: Db): ListActiveCandidates {
  const stmt = db.prepare(
    `SELECT id,
            address,
            funded_amount_sol    AS fundedAmountSol,
            funding_source_label AS fundingSourceLabel,
            confidence,
            detected_at          AS detectedAt
       FROM candidates
      WHERE status = 'detected'
      ORDER BY detected_at DESC`,
  );
  return () => stmt.all() as ActiveCandidateRow[];
}

/**
 * Reader for `/whitelisted` and `/rejected`. Aliases `whitelisted_at` /
 * `rejected_at` into the same `detectedAt` field the formatter consumes, so
 * the row shape is interchangeable with the active reader. Status is the
 * only allowed input — `tsCol` and the literal in the WHERE clause are
 * derived from a closed enum, never user input.
 */
export function makeListCandidatesByStatus(
  db: Db,
  status: CandidateStatus,
): ListActiveCandidates {
  const tsCol =
    status === "detected"
      ? "detected_at"
      : status === "whitelisted"
        ? "whitelisted_at"
        : "rejected_at";
  const stmt = db.prepare(
    `SELECT id,
            address,
            funded_amount_sol    AS fundedAmountSol,
            funding_source_label AS fundingSourceLabel,
            confidence,
            ${tsCol}             AS detectedAt
       FROM candidates
      WHERE status = '${status}'
      ORDER BY ${tsCol} DESC`,
  );
  return () => stmt.all() as ActiveCandidateRow[];
}

/**
 * Build a persist function bound to prepared statements for this db handle.
 * Both inserts are `INSERT OR IGNORE` — the candidates.address UNIQUE constraint
 * and events.signature PK give sig- and recipient-level dedup that survives
 * restarts (where the in-memory alreadyCandidates set is wiped and gets rebuilt
 * from this table on boot).
 *
 * funding_timestamp on the candidates table is NOT NULL in schema. WS payloads
 * can occasionally arrive without blockTime; we fall back to the current clock
 * in that case — the candidate's slot is authoritative and this is close
 * enough for a human-readable audit column.
 */
export function makePersistCandidate(db: Db): PersistCandidate {
  const insertCandidate = db.prepare(
    `INSERT OR IGNORE INTO candidates
       (address, funded_amount_sol, funding_source, funding_source_label,
        funding_signature, funding_slot, funding_timestamp,
        confidence, status, detected_at, prior_sig_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'detected', ?, ?)`,
  );
  const insertEvent = db.prepare(
    `INSERT OR IGNORE INTO events
       (signature, slot, timestamp, source_address, destination_address,
        amount_sol, processed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  return db.transaction((c: Candidate): PersistCandidateResult => {
    const now = Date.now();
    const eventTimestamp = c.fundingTimestamp ?? now;
    if (c.fundingTimestamp === null) {
      console.warn(
        `persist: blockTime missing for sig=${c.fundingSignature} recipient=${c.recipient}; using wall-clock for funding_timestamp`,
      );
    }
    const candRes = insertCandidate.run(
      c.recipient,
      c.fundedAmountSol,
      c.fundingSourceAddress,
      c.fundingSourceLabel,
      c.fundingSignature,
      c.fundingSlot,
      eventTimestamp,
      c.confidence,
      now,
      c.priorSigCount,
    );
    const evRes = insertEvent.run(
      c.fundingSignature,
      c.fundingSlot,
      eventTimestamp,
      c.fundingSourceAddress,
      c.recipient,
      c.fundedAmountSol,
      now,
    );
    return {
      candidateInserted: candRes.changes === 1,
      candidateId:
        candRes.changes === 1 ? Number(candRes.lastInsertRowid) : null,
      eventInserted: evRes.changes === 1,
    };
  });
}

/** PH3: stamp `alert_sent_at` once a candidate's Telegram alert has been ack'd
 *  by the Bot API. Rows with NULL in this column after startup will be replayed
 *  by `listUnalertedCandidates` on the next boot. */
export type MarkAlertSent = (id: number) => void;

export function makeMarkAlertSent(db: Db): MarkAlertSent {
  const stmt = db.prepare(
    `UPDATE candidates SET alert_sent_at = ? WHERE id = ?`,
  );
  return (id: number) => {
    stmt.run(Date.now(), id);
  };
}

/** PH3: rows whose alert has not yet been pushed. Ordered oldest-first so the
 *  operator sees replay events in the same sequence they were detected. */
export interface UnalertedCandidateRow {
  id: number;
  address: string;
  fundedAmountSol: number;
  fundingSource: string;
  fundingSourceLabel: string | null;
  fundingSignature: string;
  fundingSlot: number;
  fundingTimestamp: number;
  confidence: Confidence;
  priorSigCount: number | null;
}

export type ListUnalertedCandidates = () => UnalertedCandidateRow[];

export function makeListUnalertedCandidates(db: Db): ListUnalertedCandidates {
  const stmt = db.prepare(
    `SELECT id,
            address,
            funded_amount_sol    AS fundedAmountSol,
            funding_source       AS fundingSource,
            funding_source_label AS fundingSourceLabel,
            funding_signature    AS fundingSignature,
            funding_slot         AS fundingSlot,
            funding_timestamp    AS fundingTimestamp,
            confidence,
            prior_sig_count      AS priorSigCount
       FROM candidates
      WHERE status = 'detected' AND alert_sent_at IS NULL
      ORDER BY detected_at ASC`,
  );
  return () => stmt.all() as UnalertedCandidateRow[];
}

/**
 * Source-status filter lives inside each caller's UPDATE WHERE clause, so a
 * row whose status doesn't match the intended source is a no-op
 * (statusChanged=false, previousStatus reflects what's actually in the DB).
 * `runUpdate` does the bind so forward transitions can stamp a timestamp and
 * undo transitions can null one out without inventing a placeholder for `now`.
 */
function makeStatusTransition(
  db: Db,
  runUpdate: (id: number, now: number) => Database.RunResult,
  afterUpdate?: (address: string, id: number, now: number) => void,
): CandidateAction {
  const fetchRow = db.prepare(
    `SELECT address, status FROM candidates WHERE id = ?`,
  );
  return db.transaction((id: number): CandidateActionResult => {
    const row = fetchRow.get(id) as
      | { address: string; status: CandidateStatus }
      | undefined;
    if (!row) {
      return { address: null, statusChanged: false, previousStatus: null };
    }
    const now = Date.now();
    const res = runUpdate(id, now);
    const statusChanged = res.changes === 1;
    if (statusChanged) afterUpdate?.(row.address, id, now);
    return {
      address: row.address,
      statusChanged,
      previousStatus: row.status,
    };
  });
}

export function makeWhitelistCandidate(db: Db): CandidateAction {
  const stmt = db.prepare(
    `UPDATE candidates
     SET status = 'whitelisted', whitelisted_at = ?
     WHERE id = ? AND status = 'detected'`,
  );
  return makeStatusTransition(db, (id, now) => stmt.run(now, id));
}

/** Rejecting also adds the address to ignore_list so subsequent detection runs skip it. */
export function makeRejectCandidate(db: Db): CandidateAction {
  const stmt = db.prepare(
    `UPDATE candidates
     SET status = 'rejected', rejected_at = ?
     WHERE id = ? AND status = 'detected'`,
  );
  const insertIgnore = db.prepare(
    `INSERT OR IGNORE INTO ignore_list (address, reason, added_at)
     VALUES (?, ?, ?)`,
  );
  return makeStatusTransition(
    db,
    (id, now) => stmt.run(now, id),
    (address, id, now) =>
      insertIgnore.run(address, `rejected candidate ${id}`, now),
  );
}

/** PH6: undo a whitelist → moves the row back to 'detected' and clears
 *  whitelisted_at. DB-only — does not affect a Bloom bot paste already made. */
export function makeUnwhitelistCandidate(db: Db): CandidateAction {
  const stmt = db.prepare(
    `UPDATE candidates
     SET status = 'detected', whitelisted_at = NULL
     WHERE id = ? AND status = 'whitelisted'`,
  );
  return makeStatusTransition(db, (id) => stmt.run(id));
}

/** PH6: undo a reject → moves the row back to 'detected', clears rejected_at,
 *  and removes the address from ignore_list (symmetric with the reject hook). */
export function makeUnrejectCandidate(db: Db): CandidateAction {
  const stmt = db.prepare(
    `UPDATE candidates
     SET status = 'detected', rejected_at = NULL
     WHERE id = ? AND status = 'rejected'`,
  );
  const deleteIgnore = db.prepare(
    `DELETE FROM ignore_list WHERE address = ?`,
  );
  return makeStatusTransition(
    db,
    (id) => stmt.run(id),
    (address) => {
      deleteIgnore.run(address);
    },
  );
}
