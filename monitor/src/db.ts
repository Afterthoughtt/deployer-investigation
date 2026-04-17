import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Candidate } from "./detection/candidate.js";

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
  eventInserted: boolean;     // false => sig already in events table
}

export type PersistCandidate = (c: Candidate) => PersistCandidateResult;

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
      eventInserted: evRes.changes === 1,
    };
  });
}
