import 'dotenv/config';

const HELIUS_KEY = process.env.HELIUS_API_KEY!;
const ARKHAM_KEY = process.env.ARKAN_API_KEY!;
const NANSEN_KEY = process.env.NANSEN_API_KEY!;

const WALLETS: Record<string, { address: string; context: string }> = {
  'A9eAH6Az': { address: 'A9eAH6Az7VoXRPwcEdXZuqXqQaf7GWfzAQC91dkf76xD', context: 'Hub counterparty, $4.6K bidirectional, 18 txs' },
  '7mb5n6uw': { address: '7mb5n6uw4Xa1E3iz26phhegKVbpARg32jcjtii7645PC', context: 'jetnut_network sent 31 SOL ($2.8K), Mar 21' },
  'BigpvKiU': { address: 'BigpvKiUQBpmURwLfyMFSghRJVsLFH9bYZY8TDQPv75T', context: '$2K into 7RLD6F9S Fireblocks, 2 txs' },
  'HBgtmeZD': { address: 'HBgtmeZDeVuokEhZmubq1VYNuAEA499cgkShofpPbc6R', context: '$1.3K into 7RLD6F9S, 1 tx' },
  'ChcEbZW2': { address: 'ChcEbZW2F2rVf63pvv7q8bRQmCvmytSE8adFWaHZsijH', context: '$700 from Hub, 3 txs' },
  'EQdtK31j': { address: 'EQdtK31jwvaAAoQHRLZZJPKGXFPS3B6Axi6LSQdYh6yC', context: '$789 from cold_usdc_2' },
  'Dgq7Ba5N': { address: 'Dgq7Ba5NjDVWVcQXv5tQDD5arPowHNrw7XmrnPZjKPyN', context: '$769 from cold_usdc_2' },
};

const results: Record<string, any> = {};

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

  // Step 1: Balance (1 credit each)
  console.log('=== STEP 1: Balance ===\n');
  for (const [label, w] of entries) {
    const bal = await heliusRpc('getBalance', [w.address]);
    const solBal = (bal?.value ?? 0) / 1e9;
    results[label] = { address: w.address, context: w.context, balance_sol: solBal };
    console.log(`${label}: ${solBal.toFixed(4)} SOL — ${w.context}`);
  }

  // Step 2: Batch identity (100 credits for all 7)
  console.log('\n=== STEP 2: Batch Identity ===\n');
  const identities = await batchIdentity(addresses);
  const identityMap: Record<string, any> = {};
  if (Array.isArray(identities)) {
    for (const id of identities) identityMap[id.address] = id;
  }
  for (const [label, w] of entries) {
    const id = identityMap[w.address];
    results[label].identity = id || null;
    console.log(`${label}: ${id?.name || 'no identity'}`);
  }

  // Step 3: Funded-by (100 credits each)
  console.log('\n=== STEP 3: Funded-by ===\n');
  for (const [label, w] of entries) {
    const funder = await fundedBy(w.address);
    results[label].funded_by = funder;
    console.log(`${label}: funded by ${funder?.funderName || funder?.funder?.slice(0, 8) || 'unknown'} (${funder?.funderType || 'N/A'}) — ${funder?.amount ? funder.amount + ' SOL' : ''}`);
  }

  // Step 4: Arkham intel
  console.log('\n=== STEP 4: Arkham Intel ===\n');
  for (const [label, w] of entries) {
    const intel = await arkhamIntel(w.address);
    results[label].arkham = intel;
    console.log(`${label}: entity=${intel?.arkhamEntity?.name || 'none'}, isUserAddress=${intel?.isUserAddress}`);
  }

  // Step 5: Nansen counterparties (5 credits each, 2s delay)
  console.log('\n=== STEP 5: Nansen Counterparties ===\n');
  for (let i = 0; i < entries.length; i++) {
    const [label, w] = entries[i];
    const cp = await nansenCounterparties(w.address);
    results[label].nansen_counterparties = cp;

    if (cp.error) {
      console.log(`${label}: ERROR ${cp.error} — ${cp.text?.slice(0, 100)}`);
    } else {
      const rows = cp?.data || [];
      console.log(`${label}: ${rows.length} counterparties`);
      for (const r of rows.slice(0, 10)) {
        const cpLabel = r.counterparty_address_label?.join(', ') || 'unlabeled';
        const cpAddr = r.counterparty_address?.slice(0, 8);
        console.log(`  ${cpAddr} (${cpLabel}): $${Math.round(r.total_volume_usd)} vol, ${r.interaction_count} txs, in=$${Math.round(r.volume_in_usd)} out=$${Math.round(r.volume_out_usd)}`);
      }
    }
    console.log();
    if (i < entries.length - 1) await delay(2000);
  }

  // Save
  const fs = await import('fs');
  fs.writeFileSync('data/results/raw/medium-priority-profiles.json', JSON.stringify(results, null, 2));
  console.log('Saved to data/results/raw/medium-priority-profiles.json');
}

main().catch(console.error);
