import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';

const HELIUS_KEY = process.env.HELIUS_API_KEY!;
const ARKHAM_KEY = process.env.ARKAN_API_KEY!;
const NANSEN_KEY = process.env.NANSEN_API_KEY!;

const results: Record<string, any> = {};

// New discoveries to profile
const WALLETS: Record<string, { address: string; context: string }> = {
  'GgFVQNY5': { address: 'GgFVQNY5hck2WMFtpVeWi37yQKepyHLqLD8eZ3nmLvKH', context: 'cold_usdc_2 relay aggregator ($1.6K from EQdtK31j + Dgq7Ba5N)' },
  '764DRkmQ': { address: '764DRkmQKG6TEFvP4iEGUXxKZCQ571nntic51n5fPLj2', context: 'BigpvKiU funder ($2.6K)' },
  '2xVvxZ62': { address: '2xVvxZ62KBB1xupQicmhJrbJnUKP9CD7sxn37LhNe5zt', context: '$5.1K to 7mb5n6uw (network distribution wallet)' },
  '9Ws5GF8V': { address: '9Ws5GF8ViemNfrzbybsWHfVCy8kPNbJcjiFWbvGn64La', context: '$7.5K from ChcEbZW2 (9 txs), largest outflow' },
  '4mba47Vg': { address: '4mba47Vgynq7WmVuPp2zYoEoLbXsxm5cQHQZz59C3QfM', context: 'Binance Deposit, $620 from ChcEbZW2' },
};

async function heliusRpc(method: string, params: any[]): Promise<any> {
  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return (await res.json()).result;
}

async function fundedBy(address: string): Promise<any> {
  const res = await fetch(`https://api.helius.xyz/v1/wallet/${address}/funded-by?api-key=${HELIUS_KEY}`);
  if (res.status === 404) return null;
  return res.json();
}

async function batchIdentity(addresses: string[]): Promise<any> {
  const res = await fetch(`https://api.helius.xyz/v1/wallet/batch-identity?api-key=${HELIUS_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addresses }),
  });
  return res.json();
}

async function arkhamIntel(address: string): Promise<any> {
  const res = await fetch(`https://api.arkm.com/intelligence/address/${address}?chain=solana`, {
    headers: { 'API-Key': ARKHAM_KEY },
  });
  if (!res.ok) return { error: res.status };
  return res.json();
}

async function nansenCounterparties(address: string): Promise<any> {
  const res = await fetch('https://api.nansen.ai/api/v1/profiler/address/counterparties', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apiKey: NANSEN_KEY },
    body: JSON.stringify({
      address,
      chain: 'solana',
      date: { from: '2025-06-01', to: '2026-03-31' },
      group_by: 'wallet',
      source_input: 'Combined',
      pagination: { page: 1, per_page: 20 },
      order_by: [{ field: 'total_volume_usd', direction: 'DESC' }],
    }),
  });
  if (!res.ok) return { error: res.status, text: await res.text() };
  return res.json();
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const entries = Object.entries(WALLETS);
  const addresses = entries.map(([, w]) => w.address);

  // ============ PART 1: Rollbit Anomaly Investigation ============
  console.log('========== ROLLBIT ANOMALY INVESTIGATION ==========\n');

  // Load raw data and compare tx hashes between the two queries
  const rawLow = JSON.parse(readFileSync('data/results/raw/low-priority-profiles.json', 'utf8'));

  const rb5Transfers = rawLow.rollbit_verify_RB5KKB7h?.transfers || [];
  const rb2Transfers = rawLow.rollbit_verify_RB2Yz3VS?.transfers || [];

  const rb5Hashes = new Set(rb5Transfers.map((t: any) => t.transactionHash));
  const rb2Hashes = new Set(rb2Transfers.map((t: any) => t.transactionHash));

  console.log(`RB5KKB7h: ${rb5Transfers.length} transfers`);
  console.log(`RB2Yz3VS: ${rb2Transfers.length} transfers`);

  let overlap = 0;
  for (const h of rb5Hashes) {
    if (rb2Hashes.has(h)) overlap++;
  }
  console.log(`Overlapping tx hashes: ${overlap} / ${rb5Hashes.size}`);

  if (overlap === rb5Hashes.size) {
    console.log('⚠ ALL tx hashes are identical — Arkham is returning the SAME transactions for both addresses.');
    console.log('  This means RB5KKB7h and RB2Yz3VS may be subaccounts or aliases of the same Rollbit deposit,');
    console.log('  or Arkham is matching both as counterparties in the same batch transactions.\n');
  } else {
    console.log(`  ${rb5Hashes.size - overlap} unique to RB5, ${rb2Hashes.size - overlap} unique to RB2\n`);
  }

  // Print first 3 from each with hashes for manual comparison
  console.log('RB5KKB7h first 3:');
  for (const t of rb5Transfers.slice(0, 3)) {
    console.log(`  ${t.blockTimestamp} | ${t.unitValue} ${t.tokenSymbol} | tx: ${t.transactionHash?.slice(0, 20)}...`);
  }
  console.log('RB2Yz3VS first 3:');
  for (const t of rb2Transfers.slice(0, 3)) {
    console.log(`  ${t.blockTimestamp} | ${t.unitValue} ${t.tokenSymbol} | tx: ${t.transactionHash?.slice(0, 20)}...`);
  }

  results.rollbit_anomaly = {
    rb5_count: rb5Transfers.length,
    rb2_count: rb2Transfers.length,
    overlap,
    all_same: overlap === rb5Hashes.size,
    rb5_hashes: [...rb5Hashes].slice(0, 5),
    rb2_hashes: [...rb2Hashes].slice(0, 5),
  };

  // ============ PART 2: Profile New Discoveries ============
  console.log('\n========== PROFILING NEW DISCOVERIES ==========\n');

  // Step 1: Balance
  console.log('--- Balances ---');
  for (const [label, w] of entries) {
    const bal = await heliusRpc('getBalance', [w.address]);
    const sol = (bal?.value ?? 0) / 1e9;
    results[label] = { address: w.address, context: w.context, balance_sol: sol };
    console.log(`${label}: ${sol.toFixed(4)} SOL — ${w.context}`);
  }

  // Step 2: Sig counts
  console.log('\n--- Sig Counts ---');
  for (const [label, w] of entries) {
    const sigs = await heliusRpc('getSignaturesForAddress', [w.address, { limit: 1000 }]);
    results[label].sig_count = sigs?.length ?? 0;
    console.log(`${label}: ${results[label].sig_count} sigs`);
  }

  // Step 3: Batch identity
  console.log('\n--- Batch Identity ---');
  const identities = await batchIdentity(addresses);
  const idMap: Record<string, any> = {};
  if (Array.isArray(identities)) {
    for (const id of identities) idMap[id.address] = id;
  }
  for (const [label, w] of entries) {
    const id = idMap[w.address];
    results[label].identity = id || null;
    console.log(`${label}: ${id?.name || 'no identity'} ${id?.category ? `(${id.category})` : ''}`);
  }

  // Step 4: Funded-by
  console.log('\n--- Funded-by ---');
  for (const [label, w] of entries) {
    const funder = await fundedBy(w.address);
    results[label].funded_by = funder;
    console.log(`${label}: ${funder?.funderName || funder?.funder?.slice(0, 8) || 'unknown'} (${funder?.funderType || 'N/A'}) ${funder?.amount ? funder.amount + ' SOL' : ''}`);
  }

  // Step 5: Arkham
  console.log('\n--- Arkham Intel ---');
  for (const [label, w] of entries) {
    const intel = await arkhamIntel(w.address);
    results[label].arkham = intel;
    console.log(`${label}: entity=${intel?.arkhamEntity?.name || 'none'}, isUserAddress=${intel?.isUserAddress}`);
  }

  // Step 6: Nansen counterparties
  console.log('\n--- Nansen Counterparties ---\n');
  for (let i = 0; i < entries.length; i++) {
    const [label, w] = entries[i];
    const cp = await nansenCounterparties(w.address);
    results[label].nansen_counterparties = cp;

    if (cp.error) {
      console.log(`${label}: ERROR ${cp.error} — ${String(cp.text).slice(0, 100)}`);
    } else {
      const rows = cp?.data || [];
      console.log(`${label}: ${rows.length} counterparties`);
      for (const r of rows.slice(0, 12)) {
        const cpLabel = r.counterparty_address_label?.join(', ') || 'unlabeled';
        const cpAddr = r.counterparty_address?.slice(0, 8);
        console.log(`  ${cpAddr} (${cpLabel}): $${Math.round(r.total_volume_usd)} vol, ${r.interaction_count} txs, in=$${Math.round(r.volume_in_usd)} out=$${Math.round(r.volume_out_usd)}`);
      }
    }
    console.log();
    if (i < entries.length - 1) await delay(2000);
  }

  writeFileSync('data/results/raw/new-discoveries-profiles.json', JSON.stringify(results, null, 2));
  console.log('Saved to data/results/raw/new-discoveries-profiles.json');
}

main().catch(console.error);
