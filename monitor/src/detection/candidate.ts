import type { Category } from "../wallets.js";
import type { FreshnessChecker } from "./fresh.js";

const MIN_SOL_LAMPORTS = 8_000_000_000;
const MAX_SOL_LAMPORTS = 25_000_000_000;
const HIGH_MIN_LAMPORTS = 12_000_000_000;
const HIGH_MAX_LAMPORTS = 18_000_000_000;

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export interface MonitoredWallet {
  address: string;
  label: string;
  category: Category;
}

export interface Candidate {
  recipient: string;
  fundingSourceAddress: string;
  fundingSourceLabel: string;
  fundingSourceCategory: Category;
  fundedAmountLamports: number;
  fundedAmountSol: number;
  fundingSignature: string;
  fundingSlot: number;
  fundingTimestamp: number | null; // epoch ms UTC, null if unknown
  confidence: Confidence;
  priorSigCount: number;
}

export interface DetectCandidatesArgs {
  event: { signature: string; slot: number; raw: unknown };
  monitored: ReadonlyMap<string, MonitoredWallet>;
  ignore: ReadonlySet<string>;
  alreadyCandidates: ReadonlySet<string>;
  /**
   * Recipients currently mid-freshness-check across other concurrent detection
   * runs. Prevents two simultaneous txs funding the same destination from both
   * passing the dedupe gate, each firing their own freshness RPC, and each
   * emitting a candidate. Mutated: this function adds a recipient before the
   * freshness await and removes it if the destination turns out not-fresh or
   * the freshness check errors. Recipients that produce a candidate are left
   * in the set — the caller is responsible for moving them from `inFlight`
   * into `alreadyCandidates` once they drain the returned candidates array.
   */
  inFlight: Set<string>;
  freshness: FreshnessChecker;
  log?: (msg: string) => void;
}

export async function detectCandidates(
  args: DetectCandidatesArgs,
): Promise<Candidate[]> {
  const transfers = extractSolTransfers(args.event.raw);
  if (transfers.length === 0) return [];

  const blockTimeSec = extractBlockTime(args.event.raw);
  const fundingTimestamp =
    blockTimeSec !== null ? blockTimeSec * 1000 : null;

  const candidates: Candidate[] = [];

  for (const t of transfers) {
    const src = args.monitored.get(t.source);
    if (!src) continue;
    if (t.lamports < MIN_SOL_LAMPORTS || t.lamports > MAX_SOL_LAMPORTS) continue;
    if (args.ignore.has(t.destination)) continue;
    if (args.alreadyCandidates.has(t.destination)) continue;
    if (args.inFlight.has(t.destination)) continue;

    args.inFlight.add(t.destination);
    let freshness;
    try {
      freshness = await args.freshness(t.destination);
    } catch (err) {
      args.inFlight.delete(t.destination);
      args.log?.(
        `detection: freshness check failed for ${t.destination}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      continue;
    }
    if (!freshness.isFresh) {
      args.inFlight.delete(t.destination);
      continue;
    }

    candidates.push({
      recipient: t.destination,
      fundingSourceAddress: t.source,
      fundingSourceLabel: src.label,
      fundingSourceCategory: src.category,
      fundedAmountLamports: t.lamports,
      fundedAmountSol: t.lamports / 1e9,
      fundingSignature: args.event.signature,
      fundingSlot: args.event.slot,
      fundingTimestamp,
      confidence: tierize(
        src.category,
        src.label,
        t.lamports,
        freshness.priorSigCount,
      ),
      priorSigCount: freshness.priorSigCount,
    });
  }

  return candidates;
}

function tierize(
  category: Category,
  label: string,
  lamports: number,
  priorSigCount: number,
): Confidence {
  if (
    category === "onramp" &&
    isCleanOnramp(label) &&
    lamports >= HIGH_MIN_LAMPORTS &&
    lamports <= HIGH_MAX_LAMPORTS &&
    priorSigCount === 1
  ) {
    return "HIGH";
  }
  if (category === "onramp") return "MEDIUM";
  return "LOW";
}

// Clean on-ramps have strong custody (KYC fiat ramp), so the signal that the
// deployer is funding from one is distinctive. Hubs/intermediaries and exotic
// on-ramps are noisier.
function isCleanOnramp(label: string): boolean {
  const l = label.toLowerCase();
  return l.startsWith("moonpay") || l.startsWith("coinbase");
}

interface SolTransfer {
  source: string;
  destination: string;
  lamports: number;
}

/**
 * Walks the tx payload recursively and collects every parsed `system.transfer`
 * (and `system.transferWithSeed`) instruction it finds. Shape-agnostic: the
 * same traversal works for RPC `getTransaction` results and for WS
 * `transactionNotification` payloads without committing to a specific nesting.
 * Inner instructions (CPIs) are captured the same way as top-level.
 */
function extractSolTransfers(raw: unknown): SolTransfer[] {
  const out: SolTransfer[] = [];
  visit(raw);
  return out;

  function visit(node: unknown): void {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node !== "object") return;
    const o = node as Record<string, unknown>;

    if (o.program === "system" && o.parsed && typeof o.parsed === "object") {
      const p = o.parsed as Record<string, unknown>;
      if (
        (p.type === "transfer" || p.type === "transferWithSeed") &&
        p.info &&
        typeof p.info === "object"
      ) {
        const i = p.info as Record<string, unknown>;
        const source = typeof i.source === "string" ? i.source : undefined;
        const destination =
          typeof i.destination === "string" ? i.destination : undefined;
        const lamports = toFiniteNumber(i.lamports);
        if (source && destination && lamports !== null) {
          out.push({ source, destination, lamports });
        }
      }
    }

    for (const v of Object.values(o)) visit(v);
  }
}

function extractBlockTime(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.blockTime === "number") return r.blockTime;
  // WS wraps the RPC envelope under `transaction`
  if (r.transaction && typeof r.transaction === "object") {
    const t = r.transaction as Record<string, unknown>;
    if (typeof t.blockTime === "number") return t.blockTime;
  }
  return null;
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
