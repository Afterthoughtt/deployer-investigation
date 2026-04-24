/**
 * rxrp-repump-screen.ts — Screen 19 RXRP repump pre-announcement buyer wallets.
 *
 * Loads targets from data/rxrp-repump-buyers.json (excludes 3 known core wallets).
 * For each target: getBalance, batch-identity, Arkham batch intel, funded-by.
 * Arkham batch intel is blocked by default in utils.ts; enable only with
 * ARKHAM_ALLOW_BATCH_INTEL=1 and a small ARKHAM_LABEL_LOOKUP_RUN_BUDGET.
 * Triage flags: NETWORK_FUNDED, DEPLOYER_EXCHANGE, SHARED_FUNDER, BOT, ACTIVE, LABELED.
 * Saves results to data/results/rxrp-repump-screen-results.json.
 */

import { heliusRpc, heliusWallet, heliusBatchIdentity, arkhamBatchIntel } from './utils.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface BuyerEntry {
  address: string;
  buy_orders: number[];
  prior_status: string;
  prior_label: string | null;
}

interface ScreenResult {
  address: string;
  buy_orders: number[];
  prior_status: string;
  prior_label: string | null;
  balance_sol: number | null;
  helius_identity: Record<string, unknown> | null;
  arkham_intel: Record<string, unknown> | null;
  funded_by: Record<string, unknown> | null;
  flags: string[];
}

// ---------------------------------------------------------------------------
// 1. Load targets (exclude 3 known core wallets)
// ---------------------------------------------------------------------------
function loadTargets(): BuyerEntry[] {
  const root = process.cwd();
  const data = JSON.parse(
    readFileSync(join(root, 'data/rxrp-repump-buyers.json'), 'utf8'),
  ) as { unique_wallets: BuyerEntry[] };

  const knownCore = new Set([
    '37XxihfsTW1EFSJJherWFRFWcAFhj4KQ66cXHiegSKg2',
    '52eC8Uy5eFkwpGbDbXp1FoarxkR8MonwUvpm2WT9ni5B',
    '4916NkdubkfRyHkxkCR7rpVGz5dvzVdK161mg4jXDwRh',
  ]);

  const targets = data.unique_wallets.filter((w) => !knownCore.has(w.address));
  console.log(`[load] ${targets.length} targets (excluded ${data.unique_wallets.length - targets.length} known core)\n`);
  return targets;
}

// ---------------------------------------------------------------------------
// 2. Collect all network addresses for funder matching
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
// 3. Main screening flow
// ---------------------------------------------------------------------------
async function main() {
  const targets = loadTargets();
  const addresses = targets.map((t) => t.address);

  const results: ScreenResult[] = targets.map((t) => ({
    address: t.address,
    buy_orders: t.buy_orders,
    prior_status: t.prior_status,
    prior_label: t.prior_label,
    balance_sol: null,
    helius_identity: null,
    arkham_intel: null,
    funded_by: null,
    flags: [],
  }));

  // -----------------------------------------------------------------------
  // Step 1: Helius getBalance (1 credit each)
  // -----------------------------------------------------------------------
  console.log('=== Step 1: Helius getBalance ===');
  for (const result of results) {
    try {
      const raw = (await heliusRpc('getBalance', [result.address])) as { value: number };
      const lamports = typeof raw === 'number' ? raw : raw?.value ?? 0;
      result.balance_sol = lamports / 1e9;
      console.log(`  ${result.address.slice(0, 8)}... = ${result.balance_sol.toFixed(4)} SOL`);
    } catch (err) {
      console.error(`  ${result.address.slice(0, 8)}... ERROR: ${(err as Error).message}`);
    }
  }
  console.log();

  // -----------------------------------------------------------------------
  // Step 2: Helius batch-identity (100 credits for all)
  // -----------------------------------------------------------------------
  console.log('=== Step 2: Helius batch-identity ===');
  try {
    const identityRaw = await heliusBatchIdentity(addresses);
    const identityResults = identityRaw as Array<Record<string, unknown>>;
    const identityMap = new Map<string, Record<string, unknown>>();
    for (const entry of identityResults) {
      const addr = entry.address as string;
      if (addr) identityMap.set(addr, entry);
    }
    for (const result of results) {
      const match = identityMap.get(result.address);
      if (match && (match.name || match.category)) {
        result.helius_identity = match;
        console.log(`  IDENTIFIED: ${result.address.slice(0, 8)}... = ${match.name} (${match.category})`);
      }
    }
    const identified = results.filter((r) => r.helius_identity !== null).length;
    console.log(`  -> ${identified} identified, ${results.length - identified} unknown\n`);
  } catch (err) {
    console.error(`  batch-identity ERROR: ${(err as Error).message}\n`);
  }

  // -----------------------------------------------------------------------
  // Step 3: Arkham batch intelligence
  // -----------------------------------------------------------------------
  console.log('=== Step 3: Arkham batch intelligence ===');
  try {
    const arkhamRaw = await arkhamBatchIntel(addresses);
    const topLevel = arkhamRaw as Record<string, unknown>;
    const addressesObj = (topLevel.addresses ?? topLevel) as Record<
      string,
      Record<string, Record<string, unknown>>
    >;

    for (const result of results) {
      const addrEntry = addressesObj[result.address];
      const intel = addrEntry?.solana ?? addrEntry?.[''] ?? null;
      if (intel) {
        result.arkham_intel = intel as Record<string, unknown>;
        const isUser = intel.isUserAddress;
        const entityName =
          (intel.arkhamLabel as Record<string, unknown>)?.name ??
          (intel.arkhamEntity as Record<string, unknown>)?.name ??
          null;
        console.log(`  ${result.address.slice(0, 8)}... isUser=${isUser}, entity=${entityName ?? 'none'}`);
      } else {
        console.log(`  ${result.address.slice(0, 8)}... no Arkham intel`);
      }
    }
    console.log();
  } catch (err) {
    console.error(`  Arkham batch ERROR: ${(err as Error).message}\n`);
  }

  // -----------------------------------------------------------------------
  // Step 4: Helius funded-by (100 credits each)
  // -----------------------------------------------------------------------
  console.log('=== Step 4: Helius funded-by ===');
  for (const result of results) {
    try {
      const raw = await heliusWallet(`${result.address}/funded-by`);
      if (raw === null) {
        console.log(`  ${result.address.slice(0, 8)}... funded-by: 404 (unknown)`);
      } else {
        result.funded_by = raw as Record<string, unknown>;
        const funder = result.funded_by.funder as string | undefined;
        const funderName = result.funded_by.funderName as string | undefined;
        const amount = result.funded_by.amount as number | undefined;
        console.log(
          `  ${result.address.slice(0, 8)}... funder=${funder?.slice(0, 8) ?? '?'}... name=${funderName ?? 'unknown'} amount=${amount ?? '?'} SOL`,
        );
      }
    } catch (err) {
      console.error(`  ${result.address.slice(0, 8)}... funded-by ERROR: ${(err as Error).message}`);
    }
  }
  console.log();

  // -----------------------------------------------------------------------
  // Step 5: Triage
  // -----------------------------------------------------------------------
  console.log('=== TRIAGE ===\n');

  const networkAddresses = collectNetworkAddresses();

  // Count funders for SHARED_FUNDER detection
  const funderCounts = new Map<string, number>();
  for (const r of results) {
    const funder = r.funded_by?.funder as string | undefined;
    if (funder) {
      funderCounts.set(funder, (funderCounts.get(funder) ?? 0) + 1);
    }
  }

  for (const r of results) {
    const flags: string[] = [];

    // NETWORK_FUNDED
    const funderAddr = r.funded_by?.funder as string | undefined;
    if (funderAddr && networkAddresses.has(funderAddr)) {
      flags.push('NETWORK_FUNDED');
    }

    // DEPLOYER_EXCHANGE
    const funderName = ((r.funded_by?.funderName as string) ?? '').toLowerCase();
    if (
      funderName.includes('coinbase') ||
      funderName.includes('moonpay') ||
      funderName.includes('coinspot')
    ) {
      flags.push('DEPLOYER_EXCHANGE');
    }

    // SHARED_FUNDER
    if (funderAddr && (funderCounts.get(funderAddr) ?? 0) > 1) {
      flags.push('SHARED_FUNDER');
    }

    // BOT
    if (r.arkham_intel?.isUserAddress === false) {
      flags.push('BOT');
    }

    // ACTIVE
    if (r.balance_sol !== null && r.balance_sol > 0.1) {
      flags.push('ACTIVE');
    }

    // LABELED
    const heliusName = r.helius_identity?.name as string | undefined;
    const arkhamEntityName =
      (r.arkham_intel?.arkhamLabel as Record<string, unknown>)?.name ??
      (r.arkham_intel?.arkhamEntity as Record<string, unknown>)?.name;
    if (heliusName || arkhamEntityName) {
      flags.push('LABELED');
    }

    r.flags = flags;
  }

  // Priority buckets
  const high = results.filter(
    (r) =>
      r.flags.includes('NETWORK_FUNDED') ||
      r.flags.includes('DEPLOYER_EXCHANGE') ||
      (r.flags.includes('SHARED_FUNDER') && r.flags.length >= 2),
  );
  const medium = results.filter(
    (r) => !high.includes(r) && r.flags.length >= 1,
  );
  const low = results.filter((r) => r.flags.length === 0);

  console.log(`HIGH PRIORITY (${high.length}):`);
  for (const r of high) {
    console.log(
      `  ${r.address.slice(0, 8)}... [${r.prior_status}] -> ${r.flags.join(', ')}` +
        (r.funded_by ? ` | funder: ${(r.funded_by.funder as string)?.slice(0, 8)}... (${r.funded_by.funderName ?? 'unknown'})` : ''),
    );
  }

  console.log(`\nMEDIUM PRIORITY (${medium.length}):`);
  for (const r of medium) {
    console.log(
      `  ${r.address.slice(0, 8)}... [${r.prior_status}] -> ${r.flags.join(', ')}` +
        (r.funded_by ? ` | funder: ${(r.funded_by.funder as string)?.slice(0, 8)}... (${r.funded_by.funderName ?? 'unknown'})` : ''),
    );
  }

  console.log(`\nLOW PRIORITY (${low.length}):`);
  for (const r of low) {
    console.log(
      `  ${r.address.slice(0, 8)}... [${r.prior_status}]` +
        (r.funded_by ? ` | funder: ${(r.funded_by.funder as string)?.slice(0, 8)}... (${r.funded_by.funderName ?? 'unknown'})` : ''),
    );
  }

  // -----------------------------------------------------------------------
  // Step 6: Funder clustering
  // -----------------------------------------------------------------------
  console.log('\n=== FUNDER CLUSTERS ===\n');
  const clusters = new Map<string, { funderName: string; wallets: string[] }>();
  for (const r of results) {
    const funder = r.funded_by?.funder as string | undefined;
    if (!funder) continue;
    if (!clusters.has(funder)) {
      clusters.set(funder, {
        funderName: (r.funded_by?.funderName as string) ?? 'unknown',
        wallets: [],
      });
    }
    clusters.get(funder)!.wallets.push(r.address);
  }
  for (const [funder, info] of clusters) {
    if (info.wallets.length > 1) {
      const inNetwork = networkAddresses.has(funder) ? ' [IN NETWORK MAP]' : '';
      console.log(`  ${funder.slice(0, 8)}... (${info.funderName})${inNetwork} -> ${info.wallets.join(', ')}`);
    }
  }

  // -----------------------------------------------------------------------
  // Step 7: Save results
  // -----------------------------------------------------------------------
  const output = {
    timestamp: new Date().toISOString(),
    target_count: results.length,
    funder_clusters: Object.fromEntries(
      [...clusters].filter(([, v]) => v.wallets.length > 1),
    ),
    targets: results,
  };
  const outPath = join(process.cwd(), 'data/results/rxrp-repump-screen-results.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`\n[save] Results written to ${outPath}`);
  console.log(`\nTotal: ${results.length} screened | ${high.length} HIGH | ${medium.length} MEDIUM | ${low.length} LOW`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
