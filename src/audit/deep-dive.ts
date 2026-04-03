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
function collectNetworkAddresses(): Set<string> {
  const root = process.cwd();
  const networkMap = JSON.parse(
    readFileSync(join(root, 'data/network-map.json'), 'utf8'),
  ) as Record<string, unknown>;

  const addresses = new Set<string>();

  function walk(obj: unknown): void {
    if (obj === null || obj === undefined) return;
    if (typeof obj === 'string') return;
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
      return;
    }
    if (typeof obj === 'object') {
      const record = obj as Record<string, unknown>;
      if (typeof record.address === 'string') {
        addresses.add(record.address);
      }
      for (const val of Object.values(record)) {
        walk(val);
      }
    }
  }

  walk(networkMap);
  return addresses;
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
  networkOverlaps: string[],
  target: { address: string; source: string },
  batchTargets: BatchScreenTarget[],
  networkAddresses: Set<string>,
): 'network' | 'not_network' | 'needs_further' {
  const overlapCount = networkOverlaps.length;

  // Find the batch screen entry for this address to check funding
  const batchEntry = batchTargets.find((t) => t.address === target.address);
  const isFundedByNetwork =
    batchEntry?.funded_by?.funder !== undefined &&
    networkAddresses.has(batchEntry.funded_by.funder);

  if (overlapCount >= 3) {
    return 'network';
  }
  if (overlapCount >= 1 && overlapCount <= 2 && isFundedByNetwork) {
    return 'network';
  }
  if (overlapCount >= 1 && overlapCount <= 2 && !isFundedByNetwork) {
    return 'needs_further';
  }
  return 'not_network';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const root = process.cwd();
  const networkAddresses = collectNetworkAddresses();
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
      } else {
        // Nansen returns { data: [...] } or just array
        const data = (nansenRes.data ?? nansenRes) as unknown[];
        nansenCounterparties = Array.isArray(data) ? data : [];
        console.log(`  [nansen] ${nansenCounterparties.length} counterparties returned`);

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

      // Print summary of recent transfers
      const recent = (arkhamTransfers as Array<Record<string, unknown>>).slice(0, 5);
      for (const tx of recent) {
        const from = ((tx.fromAddress as Record<string, unknown>)?.address as string) ?? (tx.from as string) ?? '';
        const to = ((tx.toAddress as Record<string, unknown>)?.address as string) ?? (tx.to as string) ?? '';
        const val = (tx.unitValue as number) ?? (tx.historicalUSD as number) ?? 0;
        const token = ((tx.token as Record<string, unknown>)?.symbol as string) ?? (tx.tokenSymbol as string) ?? 'SOL';
        const time = (tx.blockTimestamp as string) ?? (tx.timestamp as string) ?? '';
        const direction = from.startsWith(target.address.slice(0, 8)) ? 'OUT' : 'IN';
        console.log(
          `    ${direction} ${val.toFixed(2)} ${token} ${direction === 'OUT' ? `-> ${to.slice(0, 8)}...` : `<- ${from.slice(0, 8)}...`} ${time}`,
        );
      }
    } catch (err) {
      console.error(`  [arkham] ERROR: ${(err as Error).message}`);
    }

    // -------------------------------------------------------------------
    // 3. Cross-reference counterparties against network-map
    // -------------------------------------------------------------------
    const networkOverlaps: string[] = [];
    if (Array.isArray(nansenCounterparties)) {
      for (const cp of nansenCounterparties as Array<Record<string, unknown>>) {
        const cpAddr = cp.counterparty_address as string;
        if (cpAddr && networkAddresses.has(cpAddr)) {
          networkOverlaps.push(cpAddr);
        }
      }
    }
    console.log(`  [cross-ref] ${networkOverlaps.length} counterparties found in network-map`);
    for (const overlap of networkOverlaps) {
      console.log(`    -> ${overlap.slice(0, 8)}...`);
    }

    // -------------------------------------------------------------------
    // 4. Verdict
    // -------------------------------------------------------------------
    const verdict = determineVerdict(
      networkOverlaps,
      target,
      batchFile.targets,
      networkAddresses,
    );
    console.log(`  [verdict] ${verdict}`);

    results.push({
      address: target.address,
      source: target.source,
      nansen_counterparties: nansenCounterparties,
      arkham_transfers: arkhamTransfers,
      network_overlaps: networkOverlaps,
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
    const cpCount = Array.isArray(r.nansen_counterparties)
      ? `${r.nansen_counterparties.length} CPs`
      : 'nansen error';
    console.log(
      `  ${r.address.slice(0, 8)}... [${r.source}] -> ${r.verdict_recommendation} (${cpCount}, ${overlapStr})`,
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
