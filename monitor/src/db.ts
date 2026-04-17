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
  rejected_at INTEGER
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
  return db;
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
        confidence, status, detected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'detected', ?)`,
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

/**
 * Only transitions from 'detected'. Re-invoking on a terminal row is a no-op
 * (statusChanged=false, previousStatus reflects what's in the DB).
 */
function makeStatusTransition(
  db: Db,
  update: Database.Statement,
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
    const res = update.run(now, id);
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
  return makeStatusTransition(
    db,
    db.prepare(
      `UPDATE candidates
       SET status = 'whitelisted', whitelisted_at = ?
       WHERE id = ? AND status = 'detected'`,
    ),
  );
}

/** Rejecting also adds the address to ignore_list so subsequent detection runs skip it. */
export function makeRejectCandidate(db: Db): CandidateAction {
  const insertIgnore = db.prepare(
    `INSERT OR IGNORE INTO ignore_list (address, reason, added_at)
     VALUES (?, ?, ?)`,
  );
  return makeStatusTransition(
    db,
    db.prepare(
      `UPDATE candidates
       SET status = 'rejected', rejected_at = ?
       WHERE id = ? AND status = 'detected'`,
    ),
    (address, id, now) =>
      insertIgnore.run(address, `rejected candidate ${id}`, now),
  );
}
