import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

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
