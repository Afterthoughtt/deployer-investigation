import 'dotenv/config';

const HELIUS_KEY = process.env.HELIUS_API_KEY!;
const ARKHAM_KEY = process.env.ARKAN_API_KEY!;
const NANSEN_KEY = process.env.NANSEN_API_KEY!;

const WALLETS = {
  '98KvdqZJ': '98KvdqZJcwXSx2mxV1itXxWnWM5Ziuu5bsw4KKqvZhX7',
  'F7oLGB1U': 'F7oLGB1UbFWBhKWHY1n3GTAMhW91oVoCWfNtsG5XLEGc',
  'DcbyADbN': 'DcbyADbNZanTyzhuWokNt5HrbYFFn4HmPygNPvLZC1v9',
};

const results: Record<string, any> = {};

// --- Helius RPC ---
async function getBalance(address: string): Promise<number> {
  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] }),
  });
  const json = await res.json();
  return (json.result?.value ?? 0) / 1e9;
}

async function getSigCount(address: string): Promise<number> {
  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress', params: [address, { limit: 1000 }] }),
  });
  const json = await res.json();
  return json.result?.length ?? 0;
}

// --- Helius Wallet API ---
async function fundedBy(address: string): Promise<any> {
  const res = await fetch(`https://api.helius.xyz/v1/wallet/${address}/funded-by?api-key=${HELIUS_KEY}`);
  if (res.status === 404) return null;
  return res.json();
}

async function walletIdentity(address: string): Promise<any> {
  const res = await fetch(`https://api.helius.xyz/v1/wallet/${address}/identity?api-key=${HELIUS_KEY}`);
  if (res.status === 404) return null;
  return res.json();
}

// --- Arkham ---
async function arkhamIntel(address: string): Promise<any> {
  const res = await fetch(`https://api.arkm.com/intelligence/address/${address}?chain=solana`, {
    headers: { 'API-Key': ARKHAM_KEY },
  });
  if (!res.ok) return { error: res.status };
  return res.json();
}

// --- Nansen ---
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
      pagination: { page: 1, per_page: 25 },
      order_by: [{ field: 'total_volume_usd', direction: 'DESC' }],
    }),
  });
  if (!res.ok) return { error: res.status, text: await res.text() };
  return res.json();
}

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const entries = Object.entries(WALLETS);

  // Step 1: Balance + sig count (cheap: 1 + 10 credits each)
  console.log('=== STEP 1: Balance + Sig Count ===\n');
  for (const [label, addr] of entries) {
    const [bal, sigs] = await Promise.all([getBalance(addr), getSigCount(addr)]);
    results[label] = { address: addr, balance_sol: bal, sig_count: sigs };
    console.log(`${label}: ${bal.toFixed(4)} SOL, ${sigs} sigs`);
  }

  // Step 2: Funded-by + Identity (100 credits each)
  console.log('\n=== STEP 2: Funded-by + Identity ===\n');
  for (const [label, addr] of entries) {
    const [funder, identity] = await Promise.all([fundedBy(addr), walletIdentity(addr)]);
    results[label].funded_by = funder;
    results[label].identity = identity;
    console.log(`${label} funded by: ${funder?.funderName || funder?.funder || 'unknown'} (${funder?.funderType || 'N/A'})`);
    console.log(`${label} identity: ${identity?.name || 'none'}`);
    console.log();
  }

  // Step 3: Arkham intel (20 req/sec, no delay needed)
  console.log('=== STEP 3: Arkham Intel ===\n');
  for (const [label, addr] of entries) {
    const intel = await arkhamIntel(addr);
    results[label].arkham = intel;
    const entity = intel?.arkhamEntity;
    const tags = intel?.arkhamLabel?.address?.arkhamLabel?.labels?.map((l: any) => l.name) || [];
    console.log(`${label} Arkham entity: ${entity?.name || 'none'}`);
    console.log(`${label} Arkham isUserAddress: ${intel?.isUserAddress}`);
    console.log(`${label} Arkham labels: ${tags.length ? tags.join(', ') : 'none'}`);
    console.log();
  }

  // Step 4: Nansen counterparties (5 credits each, 2s delay)
  console.log('=== STEP 4: Nansen Counterparties ===\n');
  for (const [label, addr] of entries) {
    const cp = await nansenCounterparties(addr);
    results[label].nansen_counterparties = cp;

    if (cp.error) {
      console.log(`${label}: ERROR ${cp.error}`);
    } else {
      const rows = cp?.data || [];
      console.log(`${label}: ${rows.length} counterparties`);
      for (const r of rows.slice(0, 15)) {
        const cpLabel = r.counterparty_address_label?.join(', ') || 'unlabeled';
        const cpAddr = r.counterparty_address?.slice(0, 8);
        console.log(`  ${cpAddr} (${cpLabel}): $${Math.round(r.total_volume_usd)} vol, ${r.interaction_count} txs, in=$${Math.round(r.volume_in_usd)} out=$${Math.round(r.volume_out_usd)}`);
      }
    }
    console.log();
    if (label !== entries[entries.length - 1][0]) await delay(2000);
  }

  // Save raw results
  const fs = await import('fs');
  fs.writeFileSync(
    'data/results/raw/high-priority-profiles.json',
    JSON.stringify(results, null, 2)
  );
  console.log('\nSaved to data/results/raw/high-priority-profiles.json');
}

main().catch(console.error);
