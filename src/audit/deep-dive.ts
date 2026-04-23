/**
 * deep-dive.ts — Investigate flagged wallets from batch screen using
 * Nansen counterparties + Arkham transfers.
 *
 * Target selection:
 *   - 3 possible associates from network-map.json (7QJM8rXX, F7RV6aBW, D1XcKeSS)
 *   - Wallets from batch-screen-results.json with flags:
 *     NETWORK_FUNDED, DEPLOYER_EXCHANGE, or ACTIVE with balance > 5 SOL
 *
 * For each target:
 *   1. Nansen counterparties (5 credits, 2s delay)
 *   2. Arkham transfers (1 req/sec)
 *   3. Cross-reference counterparties against network-map.json
 *   4. Verdict recommendation
 *
 * Saves to data/results/deep-dive-results.json
 */

import { nansen, arkham } from './utils.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface BatchScreenTarget {
  address: string;
  source: string;
  balance_sol: number | null;
  helius_identity: Record<string, unknown> | null;
  arkham_intel: Record<string, unknown> | null;
  funded_by: {
    funder?: string;
    funderName?: string;
    funderType?: string;
    amount?: number;
    [key: string]: unknown;
  } | null;
}

interface BatchScreenFile {
  timestamp: string;
  target_count: number;
  targets: BatchScreenTarget[];
}

interface DeepDiveResult {
  address: string;
  source: string;
  nansen_counterparties: unknown[] | { error: string };
  arkham_transfers: unknown[];
  network_overlaps: string[];
  network_overlap_details: NetworkOverlapDetail[];
  evidence_limits: string[];
  review_notes: string[];
  verdict_recommendation: 'network' | 'not_network' | 'needs_further';
}

interface DeepDiveOutput {
  timestamp: string;
  investigated_count: number;
  results: DeepDiveResult[];
}

// ---------------------------------------------------------------------------
// Collect ALL addresses from network-map.json (for cross-referencing)
// ---------------------------------------------------------------------------
interface NetworkMapEntry {
  address: string;
  section: string;
  key: string;
  label: string | null;
  role: string | null;
  verdict: string | null;
}

interface NetworkOverlapDetail extends NetworkMapEntry {
  source: 'nansen_counterparty';
  usable_for_verdict: boolean;
  reason: string;
}

function loadNetworkIndex(): Map<string, NetworkMapEntry[]> {
  const root = process.cwd();
  const networkMap = JSON.parse(
    readFileSync(join(root, 'data/network-map.json'), 'utf8'),
  ) as Record<string, unknown>;

  const entries = new Map<string, NetworkMapEntry[]>();

  function add(entry: NetworkMapEntry): void {
    const list = entries.get(entry.address) ?? [];
    list.push(entry);
    entries.set(entry.address, list);
  }

  const primitiveLike = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const roleFromPath = (path: string[]): string | null => {
    if (path.includes('token_accounts')) return 'token_account';
    if (path[path.length - 1] === 'program_id') return 'program';
    return null;
  };

  function walk(obj: unknown, path: string[]): void {
    if (obj === null || obj === undefined) return;
    if (typeof obj === 'string') {
      if (primitiveLike.test(obj)) {
        add({
          address: obj,
          section: path[0] ?? 'unknown',
          key: path.slice(1).join('.') || path[path.length - 1] || obj,
          label: null,
          role: roleFromPath(path),
          verdict: null,
        });
      }
      return;
    }
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item, path);
      return;
    }
    if (typeof obj === 'object') {
      const record = obj as Record<string, unknown>;
      if (typeof record.address === 'string') {
        add({
          address: record.address,
          section: path[0] ?? 'unknown',
          key: path[path.length - 1] ?? record.address,
          label: typeof record.label === 'string' ? record.label : null,
          role: typeof record.role === 'string' ? record.role : null,
          verdict: typeof record.verdict === 'string' ? record.verdict : null,
        });
      }
      for (const [key, val] of Object.entries(record)) {
        if (key === 'address') continue;
        walk(val, [...path, key]);
      }
    }
  }

  for (const [section, val] of Object.entries(networkMap)) {
    if (section === 'metadata') continue;
    walk(val, [section]);
  }
  return entries;
}

function collectNetworkAddresses(index: Map<string, NetworkMapEntry[]>): Set<string> {
  return new Set(index.keys());
}

function isUsableWalletOverlap(entry: NetworkMapEntry): boolean {
  if (entry.section === 'not_network') return false;
  if (entry.verdict === 'not_network') return false;
  if (entry.role === 'token_account') return false;
  if (entry.role === 'program') return false;
  if (entry.role === 'resolved') return false;
  return true;
}

function overlapDetailsFor(
  address: string,
  index: Map<string, NetworkMapEntry[]>,
): NetworkOverlapDetail[] {
  return (index.get(address) ?? []).map((entry) => {
    const usable = isUsableWalletOverlap(entry);
    return {
      ...entry,
      source: 'nansen_counterparty',
      usable_for_verdict: usable,
      reason: usable
        ? 'network-map wallet-like entry; still requires tx-level signer verification before promotion'
        : 'not usable for wallet verdict without separate signer/user-wallet proof',
    };
  });
}

// ---------------------------------------------------------------------------
// Load possible associates from network-map.json
// ---------------------------------------------------------------------------
function loadPossibleAssociates(): Array<{ address: string; source: string }> {
  const root = process.cwd();
  const networkMap = JSON.parse(
    readFileSync(join(root, 'data/network-map.json'), 'utf8'),
  ) as Record<string, Record<string, { address?: string }>>;

  const keys = ['7QJM8rXX', 'F7RV6aBW', 'D1XcKeSS'];
  return keys.map((key) => {
    const entry = networkMap.possible_associates?.[key];
    if (!entry?.address) {
      throw new Error(`possible_associates.${key} not found or missing address`);
    }
    return { address: entry.address, source: 'possible_associate' };
  });
}

// ---------------------------------------------------------------------------
// Recompute flags from batch screen results (same logic as batch-screen.ts)
// ---------------------------------------------------------------------------
function computeFlags(
  target: BatchScreenTarget,
  networkAddresses: Set<string>,
): string[] {
  const flags: string[] = [];

  // NETWORK_FUNDED: funder address in network-map
  if (target.funded_by) {
    const funderAddr = target.funded_by.funder;
    if (funderAddr && networkAddresses.has(funderAddr)) {
      flags.push('NETWORK_FUNDED');
    }
  }

  // DEPLOYER_EXCHANGE: funded by Coinbase or MoonPay
  if (target.funded_by) {
    const funderName = (target.funded_by.funderName ?? '').toLowerCase();
    const funderType = (target.funded_by.funderType ?? '').toLowerCase();
    if (
      funderName.includes('coinbase') ||
      funderName.includes('moonpay') ||
      funderType.includes('coinbase') ||
      funderType.includes('moonpay')
    ) {
      flags.push('DEPLOYER_EXCHANGE');
    }
  }

  // BOT
  if (target.arkham_intel) {
    const isUser = target.arkham_intel.isUserAddress;
    if (isUser === false) {
      flags.push('BOT');
    }
  }

  // ACTIVE
  if (target.balance_sol !== null && target.balance_sol > 0.1) {
    flags.push('ACTIVE');
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Select targets for deep dive
// ---------------------------------------------------------------------------
function selectTargets(
  networkAddresses: Set<string>,
): Array<{ address: string; source: string }> {
  const root = process.cwd();

  // Load batch screen results
  const batchFile = JSON.parse(
    readFileSync(join(root, 'data/results/batch-screen-results.json'), 'utf8'),
  ) as BatchScreenFile;

  // Find flagged wallets meeting our criteria
  const flaggedFromBatch: Array<{ address: string; source: string }> = [];
  for (const target of batchFile.targets) {
    const flags = computeFlags(target, networkAddresses);
    const hasNetworkFunded = flags.includes('NETWORK_FUNDED');
    const hasDeployerExchange = flags.includes('DEPLOYER_EXCHANGE');
    const isActiveHighBalance =
      flags.includes('ACTIVE') &&
      target.balance_sol !== null &&
      target.balance_sol > 5;

    if (hasNetworkFunded || hasDeployerExchange || isActiveHighBalance) {
      flaggedFromBatch.push({
        address: target.address,
        source: 'flagged_unknown',
      });
      console.log(
        `  [flagged] ${target.address.slice(0, 8)}... flags=[${flags.join(', ')}] balance=${target.balance_sol?.toFixed(2) ?? '?'} SOL`,
      );
    }
  }

  // Load possible associates
  const associates = loadPossibleAssociates();

  // Combine and deduplicate
  const seen = new Set<string>();
  const combined: Array<{ address: string; source: string }> = [];

  // Associates first (they keep their source label)
  for (const a of associates) {
    if (!seen.has(a.address)) {
      seen.add(a.address);
      combined.push(a);
    }
  }

  // Then flagged from batch (use 'flagged_unknown' unless already added as associate)
  for (const f of flaggedFromBatch) {
    if (!seen.has(f.address)) {
      seen.add(f.address);
      combined.push(f);
    }
  }

  return combined;
}

// ---------------------------------------------------------------------------
// Determine verdict based on network overlaps and funding
// ---------------------------------------------------------------------------
function determineVerdict(
  networkOverlapDetails: NetworkOverlapDetail[],
  target: { address: string; source: string },
  batchTargets: BatchScreenTarget[],
  networkAddresses: Set<string>,
  evidenceLimits: string[],
): 'network' | 'not_network' | 'needs_further' {
  const usableOverlapCount = networkOverlapDetails.filter((o) => o.usable_for_verdict).length;
  const hasOnlyUnusableOverlaps =
    networkOverlapDetails.length > 0 && usableOverlapCount === 0;

  // Find the batch screen entry for this address to check funding
  const batchEntry = batchTargets.find((t) => t.address === target.address);
  const isFundedByNetwork =
    batchEntry?.funded_by?.funder !== undefined &&
    networkAddresses.has(batchEntry.funded_by.funder);

  if (hasOnlyUnusableOverlaps) {
    return 'needs_further';
  }
  if (usableOverlapCount >= 3) {
    return 'network';
  }
  if (usableOverlapCount >= 1 && usableOverlapCount <= 2 && isFundedByNetwork) {
    return 'network';
  }
  if (usableOverlapCount >= 1 && usableOverlapCount <= 2 && !isFundedByNetwork) {
    return 'needs_further';
  }
  if (evidenceLimits.length > 0) {
    return 'needs_further';
  }
  return 'not_network';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const root = process.cwd();
  const networkIndex = loadNetworkIndex();
  const networkAddresses = collectNetworkAddresses(networkIndex);
  console.log(`[init] ${networkAddresses.size} addresses in network-map.json\n`);

  console.log('=== Selecting targets for deep dive ===');
  const targets = selectTargets(networkAddresses);
  console.log(`\n[selected] ${targets.length} targets for deep dive\n`);

  if (targets.length === 0) {
    console.log('No targets to investigate. Exiting.');
    return;
  }

  // Load batch screen for verdict logic
  const batchFile = JSON.parse(
    readFileSync(join(root, 'data/results/batch-screen-results.json'), 'utf8'),
  ) as BatchScreenFile;

  const results: DeepDiveResult[] = [];

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${i + 1}/${targets.length}] Investigating ${target.address.slice(0, 8)}... (${target.source})`);
    console.log('='.repeat(60));

    const evidenceLimits: string[] = [];
    const reviewNotes: string[] = [];

    // -------------------------------------------------------------------
    // 1. Nansen counterparties
    // -------------------------------------------------------------------
    let nansenCounterparties: unknown[] | { error: string };
    try {
      console.log('  [nansen] Fetching counterparties...');
      const nansenRes = await nansen('/profiler/address/counterparties', {
        address: target.address,
        chain: 'solana',
        date: { from: '2025-06-01T00:00:00Z', to: '2026-04-01T00:00:00Z' },
        group_by: 'wallet',
        source_input: 'Combined',
        pagination: { page: 1, per_page: 20 },
        order_by: [{ field: 'total_volume_usd', direction: 'DESC' }],
      }) as Record<string, unknown>;

      if (nansenRes.error === 'unprocessable' || nansenRes.status === 422) {
        console.log('  [nansen] 422 — too much activity, skipping');
        nansenCounterparties = { error: '422' };
        evidenceLimits.push('nansen_counterparties_422_unprocessable');
      } else {
        // Nansen returns { data: [...] } or just array
        const data = (nansenRes.data ?? nansenRes) as unknown[];
        nansenCounterparties = Array.isArray(data) ? data : [];
        console.log(`  [nansen] ${nansenCounterparties.length} counterparties returned`);

        const pagination = (nansenRes.pagination ?? {}) as Record<string, unknown>;
        const isLastPage = nansenRes.is_last_page ?? pagination.is_last_page;
        if (isLastPage === false) {
          evidenceLimits.push('nansen_counterparties_page_1_only');
        }
        if (nansenCounterparties.length === 20 && isLastPage !== true) {
          evidenceLimits.push('nansen_counterparties_hit_page_limit_20');
        }

        // Print top 5
        const top5 = (nansenCounterparties as Array<Record<string, unknown>>).slice(0, 5);
        for (const cp of top5) {
          const addr = (cp.counterparty_address as string) ?? '';
          const label = (cp.counterparty_address_label as string) ?? '';
          const vol = (cp.total_volume_usd as number) ?? 0;
          const isNetwork = networkAddresses.has(addr);
          console.log(
            `    ${addr.slice(0, 8)}... vol=$${vol.toFixed(0)} label="${label}" ${isNetwork ? '<< NETWORK MATCH >>' : ''}`,
          );
        }
      }
    } catch (err) {
      console.error(`  [nansen] ERROR: ${(err as Error).message}`);
      nansenCounterparties = { error: (err as Error).message };
      evidenceLimits.push('nansen_counterparties_error');
    }

    // -------------------------------------------------------------------
    // 2. Arkham transfers
    // -------------------------------------------------------------------
    let arkhamTransfers: unknown[] = [];
    try {
      console.log('  [arkham] Fetching transfers...');
      const arkhamRes = await arkham(
        '/transfers',
        {
          base: target.address,
          chains: 'solana',
          limit: '50',
          sortKey: 'time',
          sortDir: 'desc',
        },
        true, // slowEndpoint = true (1s delay)
      ) as Record<string, unknown>;

      // Arkham returns { transfers: [...] } or { data: [...] }
      const transfers = (arkhamRes.transfers ?? arkhamRes.data ?? arkhamRes) as unknown[];
      arkhamTransfers = Array.isArray(transfers) ? transfers : [];
      console.log(`  [arkham] ${arkhamTransfers.length} transfers returned`);
      const arkhamCount = typeof arkhamRes.count === 'number' ? arkhamRes.count : null;
      if (arkhamCount !== null && arkhamCount > arkhamTransfers.length) {
        evidenceLimits.push(`arkham_transfers_partial_${arkhamTransfers.length}_of_${arkhamCount}`);
      } else if (arkhamTransfers.length === 50) {
        evidenceLimits.push('arkham_transfers_hit_limit_50');
      }

      // Print summary of recent transfers
      const recent = (arkhamTransfers as Array<Record<string, unknown>>).slice(0, 5);
      for (const tx of recent) {
        const from = ((tx.fromAddress as Record<string, unknown>)?.address as string) ?? (tx.from as string) ?? '';
        const to = ((tx.toAddress as Record<string, unknown>)?.address as string) ?? (tx.to as string) ?? '';
        const val = (tx.unitValue as number) ?? (tx.historicalUSD as number) ?? 0;
        const token = ((tx.token as Record<string, unknown>)?.symbol as string) ?? (tx.tokenSymbol as string) ?? 'SOL';
        const time = (tx.blockTimestamp as string) ?? (tx.timestamp as string) ?? '';
        const direction = from === target.address ? 'OUT' : 'IN';
        console.log(
          `    ${direction} ${val.toFixed(2)} ${token} ${direction === 'OUT' ? `-> ${to.slice(0, 8)}...` : `<- ${from.slice(0, 8)}...`} ${time}`,
        );
      }
    } catch (err) {
      console.error(`  [arkham] ERROR: ${(err as Error).message}`);
      evidenceLimits.push('arkham_transfers_error');
    }

    // -------------------------------------------------------------------
    // 3. Cross-reference counterparties against network-map
    // -------------------------------------------------------------------
    const networkOverlaps: string[] = [];
    const networkOverlapDetails: NetworkOverlapDetail[] = [];
    if (Array.isArray(nansenCounterparties)) {
      for (const cp of nansenCounterparties as Array<Record<string, unknown>>) {
        const cpAddr = cp.counterparty_address as string;
        if (cpAddr && networkAddresses.has(cpAddr)) {
          networkOverlaps.push(cpAddr);
          networkOverlapDetails.push(...overlapDetailsFor(cpAddr, networkIndex));
        }
      }
    }
    console.log(`  [cross-ref] ${networkOverlaps.length} counterparties found in network-map`);
    for (const overlap of networkOverlapDetails) {
      console.log(
        `    -> ${overlap.address.slice(0, 8)}... ${overlap.section}.${overlap.key} role=${overlap.role ?? '?'} usable=${overlap.usable_for_verdict}`,
      );
      if (!overlap.usable_for_verdict) {
        reviewNotes.push(`Counterparty ${overlap.address} is ${overlap.section}.${overlap.key}; do not treat as wallet evidence without signer/user-address verification.`);
      }
    }
    if (evidenceLimits.length > 0) {
      console.log(`  [limits] ${evidenceLimits.join(', ')}`);
    }

    // -------------------------------------------------------------------
    // 4. Verdict
    // -------------------------------------------------------------------
    const verdict = determineVerdict(
      networkOverlapDetails,
      target,
      batchFile.targets,
      networkAddresses,
      evidenceLimits,
    );
    console.log(`  [verdict] ${verdict}`);

    results.push({
      address: target.address,
      source: target.source,
      nansen_counterparties: nansenCounterparties,
      arkham_transfers: arkhamTransfers,
      network_overlaps: networkOverlaps,
      network_overlap_details: networkOverlapDetails,
      evidence_limits: evidenceLimits,
      review_notes: reviewNotes,
      verdict_recommendation: verdict,
    });
  }

  // -----------------------------------------------------------------------
  // Save results
  // -----------------------------------------------------------------------
  const output: DeepDiveOutput = {
    timestamp: new Date().toISOString(),
    investigated_count: results.length,
    results,
  };
  const outPath = join(root, 'data/results/deep-dive-results.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`\n[save] Results written to ${outPath}`);

  // -----------------------------------------------------------------------
  // Final summary
  // -----------------------------------------------------------------------
  console.log('\n=== DEEP DIVE SUMMARY ===\n');
  const networkCount = results.filter((r) => r.verdict_recommendation === 'network').length;
  const notNetworkCount = results.filter((r) => r.verdict_recommendation === 'not_network').length;
  const needsFurtherCount = results.filter((r) => r.verdict_recommendation === 'needs_further').length;

  for (const r of results) {
    const overlapStr =
      r.network_overlaps.length > 0
        ? `overlaps=[${r.network_overlaps.map((a) => a.slice(0, 8) + '...').join(', ')}]`
        : 'no overlaps';
    const limitStr = r.evidence_limits.length > 0 ? `, limits=${r.evidence_limits.length}` : '';
    const cpCount = Array.isArray(r.nansen_counterparties)
      ? `${r.nansen_counterparties.length} CPs`
      : 'nansen error';
    console.log(
      `  ${r.address.slice(0, 8)}... [${r.source}] -> ${r.verdict_recommendation} (${cpCount}, ${overlapStr}${limitStr})`,
    );
  }

  console.log(`\nVerdicts: ${networkCount} network, ${notNetworkCount} not_network, ${needsFurtherCount} needs_further`);
  console.log(`Total investigated: ${results.length}`);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
