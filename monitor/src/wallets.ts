import { readFileSync } from "node:fs";
import type { Db } from "./db.js";

export type Category = "onramp" | "hub" | "intermediary";

export interface WalletEntry {
  address: string;
  label: string;
}

export interface IgnoreEntry {
  address: string;
  reason: string;
}

export interface WalletsFile {
  onramps: WalletEntry[];
  hubs: WalletEntry[];
  intermediaries: WalletEntry[];
  ignore: IgnoreEntry[];
}

export interface SyncStats {
  monitored: {
    totalInFile: number;
    inserted: number;
    alreadyPresent: number;
    byCategory: Record<Category, number>;
  };
  ignore: {
    totalInFile: number;
    inserted: number;
    alreadyPresent: number;
  };
}

export function loadWalletsFile(path: string): WalletsFile {
  const raw = readFileSync(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${path}: invalid JSON (${(err as Error).message})`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${path}: expected a JSON object`);
  }
  const obj = parsed as Record<string, unknown>;
  const onramps = parseEntries(obj.onramps, "onramps", path);
  const hubs = parseEntries(obj.hubs, "hubs", path);
  const intermediaries = parseEntries(obj.intermediaries, "intermediaries", path);
  const ignore = parseIgnore(obj.ignore, "ignore", path);

  assertNoDuplicateAddresses([...onramps, ...hubs, ...intermediaries], path);
  assertNoIgnoreConflict([...onramps, ...hubs, ...intermediaries], ignore, path);

  return { onramps, hubs, intermediaries, ignore };
}

function parseEntries(v: unknown, key: string, path: string): WalletEntry[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new Error(`${path}: "${key}" must be an array`);
  return v.map((item, i) => {
    if (!item || typeof item !== "object") {
      throw new Error(`${path}: ${key}[${i}] must be an object`);
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry.address !== "string" || entry.address.trim() === "") {
      throw new Error(`${path}: ${key}[${i}].address missing or empty`);
    }
    if (typeof entry.label !== "string" || entry.label.trim() === "") {
      throw new Error(`${path}: ${key}[${i}].label missing or empty`);
    }
    return { address: entry.address, label: entry.label };
  });
}

function parseIgnore(v: unknown, key: string, path: string): IgnoreEntry[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new Error(`${path}: "${key}" must be an array`);
  return v.map((item, i) => {
    if (!item || typeof item !== "object") {
      throw new Error(`${path}: ${key}[${i}] must be an object`);
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry.address !== "string" || entry.address.trim() === "") {
      throw new Error(`${path}: ${key}[${i}].address missing or empty`);
    }
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
      throw new Error(`${path}: ${key}[${i}].reason missing or empty`);
    }
    return { address: entry.address, reason: entry.reason };
  });
}

function assertNoDuplicateAddresses(entries: WalletEntry[], path: string): void {
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.address)) {
      throw new Error(`${path}: duplicate address across monitored categories: ${e.address}`);
    }
    seen.add(e.address);
  }
}

function assertNoIgnoreConflict(
  monitored: WalletEntry[],
  ignore: IgnoreEntry[],
  path: string,
): void {
  const ignoredSet = new Set(ignore.map((i) => i.address));
  for (const m of monitored) {
    if (ignoredSet.has(m.address)) {
      throw new Error(
        `${path}: ${m.address} appears in both monitored and ignore lists`,
      );
    }
  }
}

export function syncWalletsToDb(db: Db, wallets: WalletsFile): SyncStats {
  const now = Date.now();
  const insertMonitored = db.prepare(
    `INSERT OR IGNORE INTO monitored_wallets (address, label, category, added_at) VALUES (?, ?, ?, ?)`,
  );
  const insertIgnore = db.prepare(
    `INSERT OR IGNORE INTO ignore_list (address, reason, added_at) VALUES (?, ?, ?)`,
  );

  let monitoredInserted = 0;
  let monitoredAlreadyPresent = 0;
  let ignoreInserted = 0;
  let ignoreAlreadyPresent = 0;

  const categorized: [WalletEntry[], Category][] = [
    [wallets.onramps, "onramp"],
    [wallets.hubs, "hub"],
    [wallets.intermediaries, "intermediary"],
  ];

  const sync = db.transaction(() => {
    for (const [entries, category] of categorized) {
      for (const e of entries) {
        const r = insertMonitored.run(e.address, e.label, category, now);
        if (r.changes === 1) monitoredInserted++;
        else monitoredAlreadyPresent++;
      }
    }
    for (const e of wallets.ignore) {
      const r = insertIgnore.run(e.address, e.reason, now);
      if (r.changes === 1) ignoreInserted++;
      else ignoreAlreadyPresent++;
    }
  });
  sync();

  return {
    monitored: {
      totalInFile:
        wallets.onramps.length + wallets.hubs.length + wallets.intermediaries.length,
      inserted: monitoredInserted,
      alreadyPresent: monitoredAlreadyPresent,
      byCategory: {
        onramp: wallets.onramps.length,
        hub: wallets.hubs.length,
        intermediary: wallets.intermediaries.length,
      },
    },
    ignore: {
      totalInFile: wallets.ignore.length,
      inserted: ignoreInserted,
      alreadyPresent: ignoreAlreadyPresent,
    },
  };
}
