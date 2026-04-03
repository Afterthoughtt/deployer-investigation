/**
 * batch-screen.ts — Batch screen 24 target wallets using Helius + Arkham APIs.
 *
 * Loads targets from three sources:
 *   1. 19 unknown recurring wallets from cross-reference-report.json
 *   2. 3 possible associates from network-map.json
 *   3. 2 unlabeled OG deployer counterparties from launch-details.json
 *
 * For each target: getBalance, batch-identity, Arkham batch intel, funded-by.
 * Saves results to data/results/batch-screen-results.json and prints triage summary.
 */

import { heliusRpc, heliusWallet, heliusBatchIdentity, arkhamBatchIntel } from './utils.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Target {
  address: string;
  source: 'unknown_recurring' | 'possible_associate' | 'og_counterparty';
}

interface ScreenResult {
  address: string;
  source: string;
  balance_sol: number | null;
  helius_identity: Record<string, unknown> | null;
  arkham_intel: Record<string, unknown> | null;
  funded_by: Record<string, unknown> | null;
}

interface OutputFile {
  timestamp: string;
  target_count: number;
  targets: ScreenResult[];
}

// ---------------------------------------------------------------------------
// 1. Load targets
// ---------------------------------------------------------------------------
function loadTargets(): Target[] {
  const root = process.cwd();

  // Source 1: 19 unknown recurring wallets
  const crossRef = JSON.parse(
    readFileSync(join(root, 'data/results/cross-reference-report.json'), 'utf8'),
  ) as { recurring_wallets: Array<{ address: string; tag: string }> };
  const unknowns: Target[] = crossRef.recurring_wallets
    .filter((w) => w.tag === 'unknown')
    .map((w) => ({ address: w.address, source: 'unknown_recurring' as const }));
  console.log(`[load] ${unknowns.length} unknown recurring wallets`);

  // Source 2: 3 possible associates
  const networkMap = JSON.parse(
    readFileSync(join(root, 'data/network-map.json'), 'utf8'),
  ) as Record<string, Record<string, { address?: string }>>;
  const associateKeys = ['7QJM8rXX', 'F7RV6aBW', 'D1XcKeSS'];
  const associates: Target[] = associateKeys.map((key) => {
    const entry = networkMap.possible_associates?.[key];
    if (!entry?.address) throw new Error(`possible_associates.${key} not found or missing address`);
    return { address: entry.address, source: 'possible_associate' as const };
  });
  console.log(`[load] ${associates.length} possible associates`);

  // Source 3: 2 unlabeled OG deployer counterparties
  const launchDetails = JSON.parse(
    readFileSync(join(root, 'data/launch-details.json'), 'utf8'),
  ) as { og_deployer_flows: { outflows: Array<{ address: string; label: string | null }> } };
  const ogUnlabeled: Target[] = launchDetails.og_deployer_flows.outflows
    .filter((o) => o.label === null)
    .map((o) => ({ address: o.address, source: 'og_counterparty' as const }));
  console.log(`[load] ${ogUnlabeled.length} unlabeled OG deployer counterparties`);
  for (const t of ogUnlabeled) {
    console.log(`       -> ${t.address.slice(0, 8)}...`);
  }

  return [...unknowns, ...associates, ...ogUnlabeled];
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
  const allTargets = loadTargets();

  // Deduplicate
  const seen = new Set<string>();
  const targets: Target[] = [];
  for (const t of allTargets) {
    if (!seen.has(t.address)) {
      seen.add(t.address);
      targets.push(t);
    }
  }
  console.log(`\n[dedup] ${targets.length} unique targets (from ${allTargets.length} total)\n`);

  const results: ScreenResult[] = targets.map((t) => ({
    address: t.address,
    source: t.source,
    balance_sol: null,
    helius_identity: null,
    arkham_intel: null,
    funded_by: null,
  }));

  // -----------------------------------------------------------------------
  // Step 1: Helius getBalance for all (1 credit each, 50 req/sec OK)
  // -----------------------------------------------------------------------
  console.log('=== Step 1: Helius getBalance ===');
  let balanceSuccesses = 0;
  let balanceErrors = 0;
  for (const result of results) {
    try {
      const raw = (await heliusRpc('getBalance', [result.address])) as { value: number };
      const lamports = typeof raw === 'number' ? raw : raw?.value ?? 0;
      result.balance_sol = lamports / 1e9;
      console.log(`  ${result.address.slice(0, 8)}... = ${result.balance_sol.toFixed(4)} SOL`);
      balanceSuccesses++;
    } catch (err) {
      console.error(`  ${result.address.slice(0, 8)}... ERROR: ${(err as Error).message}`);
      balanceErrors++;
    }
  }
  console.log(`  -> ${balanceSuccesses} OK, ${balanceErrors} errors\n`);

  // -----------------------------------------------------------------------
  // Step 2: Helius batch-identity (100 credits for all)
  // -----------------------------------------------------------------------
  console.log('=== Step 2: Helius batch-identity ===');
  try {
    const identityRaw = await heliusBatchIdentity(targets.map((t) => t.address));
    const identityResults = identityRaw as Array<Record<string, unknown>>;
    console.log(`  Raw response: array of ${identityResults.length} results`);

    // Map results by address
    const identityMap = new Map<string, Record<string, unknown>>();
    for (const entry of identityResults) {
      const addr = entry.address as string;
      if (addr) identityMap.set(addr, entry);
    }

    for (const result of results) {
      const match = identityMap.get(result.address);
      // Only count as identified if Helius returned a real name or category
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
    const arkhamRaw = await arkhamBatchIntel(targets.map((t) => t.address));

    // Log the raw response structure for the first result
    if (arkhamRaw && typeof arkhamRaw === 'object') {
      const keys = Object.keys(arkhamRaw as Record<string, unknown>);
      console.log(`  Raw response keys: [${keys.join(', ')}]`);
      if (keys.length > 0) {
        const firstKey = keys[0];
        const firstVal = (arkhamRaw as Record<string, unknown>)[firstKey];
        console.log(`  First result key: "${firstKey}"`);
        console.log(`  First result structure: ${JSON.stringify(firstVal, null, 2).slice(0, 500)}`);
      }
    }

    // Arkham batch/all returns: { addresses: { [addr]: { solana: { address, chain, isUserAddress, arkhamLabel?, ... } } } }
    const topLevel = arkhamRaw as Record<string, unknown>;
    const addressesObj = (topLevel.addresses ?? topLevel) as Record<string, Record<string, Record<string, unknown>>>;

    for (const result of results) {
      const addrEntry = addressesObj[result.address];
      // Navigate into the chain-specific data (solana)
      const intel = addrEntry?.solana ?? addrEntry?.[''] ?? null;

      if (intel) {
        result.arkham_intel = intel as Record<string, unknown>;
        const isUser = intel.isUserAddress;
        const label = intel.arkhamLabel as Record<string, unknown> | undefined;
        const entityName = label?.name
          ?? (intel.arkhamEntity as Record<string, unknown>)?.name
          ?? (intel.entity as Record<string, unknown>)?.name
          ?? null;
        console.log(`  ${result.address.slice(0, 8)}... isUser=${isUser}, entity=${entityName ?? 'none'}`);
      } else {
        console.log(`  ${result.address.slice(0, 8)}... no Arkham intel`);
      }
    }
    const withIntel = results.filter((r) => r.arkham_intel !== null).length;
    console.log(`  -> ${withIntel} with intel, ${results.length - withIntel} without\n`);
  } catch (err) {
    console.error(`  Arkham batch ERROR: ${(err as Error).message}\n`);
  }

  // -----------------------------------------------------------------------
  // Step 4: Helius funded-by for all (100 credits each, 100ms delay in util)
  // -----------------------------------------------------------------------
  console.log('=== Step 4: Helius funded-by ===');
  let fundedBySuccesses = 0;
  let fundedByErrors = 0;
  let fundedByNull = 0;
  for (const result of results) {
    try {
      const raw = await heliusWallet(`${result.address}/funded-by`);
      if (raw === null) {
        console.log(`  ${result.address.slice(0, 8)}... funded-by: 404 (unknown)`);
        fundedByNull++;
      } else {
        result.funded_by = raw as Record<string, unknown>;
        const funder = result.funded_by.funder as string | undefined;
        const funderName = result.funded_by.funderName as string | undefined;
        const amount = result.funded_by.amount as number | undefined;
        console.log(`  ${result.address.slice(0, 8)}... funder=${funder?.slice(0, 8) ?? '?'}... name=${funderName ?? 'unknown'} amount=${amount ?? '?'} SOL`);
        fundedBySuccesses++;
      }
    } catch (err) {
      console.error(`  ${result.address.slice(0, 8)}... funded-by ERROR: ${(err as Error).message}`);
      fundedByErrors++;
    }
  }
  console.log(`  -> ${fundedBySuccesses} OK, ${fundedByNull} not found, ${fundedByErrors} errors\n`);

  // -----------------------------------------------------------------------
  // Step 5: Save results
  // -----------------------------------------------------------------------
  const output: OutputFile = {
    timestamp: new Date().toISOString(),
    target_count: results.length,
    targets: results,
  };
  const outPath = join(process.cwd(), 'data/results/batch-screen-results.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`[save] Results written to ${outPath}\n`);

  // -----------------------------------------------------------------------
  // Step 6: Triage summary
  // -----------------------------------------------------------------------
  console.log('=== TRIAGE SUMMARY ===\n');

  const networkAddresses = collectNetworkAddresses();

  interface TriageEntry {
    address: string;
    source: string;
    flags: string[];
  }

  const flagged: TriageEntry[] = [];
  const clean: TriageEntry[] = [];

  for (const r of results) {
    const flags: string[] = [];

    // NETWORK_FUNDED: funder address matches any address in network-map.json
    if (r.funded_by) {
      const funderAddr = r.funded_by.funder as string | undefined;
      if (funderAddr && networkAddresses.has(funderAddr)) {
        flags.push('NETWORK_FUNDED');
      }
    }

    // DEPLOYER_EXCHANGE: funded by Coinbase or MoonPay
    if (r.funded_by) {
      const funderName = ((r.funded_by.funderName as string) ?? '').toLowerCase();
      const funderType = ((r.funded_by.funderType as string) ?? '').toLowerCase();
      if (
        funderName.includes('coinbase') ||
        funderName.includes('moonpay') ||
        funderType.includes('coinbase') ||
        funderType.includes('moonpay')
      ) {
        flags.push('DEPLOYER_EXCHANGE');
      }
    }

    // BOT: Arkham isUserAddress === false
    if (r.arkham_intel) {
      const isUser = r.arkham_intel.isUserAddress;
      if (isUser === false) {
        flags.push('BOT');
      }
    }

    // ACTIVE: balance > 0.1 SOL
    if (r.balance_sol !== null && r.balance_sol > 0.1) {
      flags.push('ACTIVE');
    }

    // LABELED: Helius identity or Arkham entity has a name
    const heliusName = r.helius_identity?.name as string | undefined;
    const arkhamEntityName =
      (r.arkham_intel?.arkhamLabel as Record<string, unknown>)?.name
      ?? (r.arkham_intel?.arkhamEntity as Record<string, unknown>)?.name
      ?? (r.arkham_intel?.entity as Record<string, unknown>)?.name;
    if (heliusName || arkhamEntityName) {
      flags.push('LABELED');
    }

    if (flags.length > 0) {
      flagged.push({ address: r.address, source: r.source, flags });
    } else {
      clean.push({ address: r.address, source: r.source, flags: [] });
    }
  }

  console.log(`FLAGGED (${flagged.length} wallets — need attention):`);
  for (const f of flagged) {
    console.log(`  ${f.address.slice(0, 8)}... [${f.source}] -> ${f.flags.join(', ')}`);
  }

  console.log(`\nCLEAN (${clean.length} wallets — no flags):`);
  for (const c of clean) {
    console.log(`  ${c.address.slice(0, 8)}... [${c.source}]`);
  }

  console.log(`\nTotal: ${results.length} screened, ${flagged.length} flagged, ${clean.length} clean`);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
