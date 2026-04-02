import 'dotenv/config';

const HELIUS_KEY = process.env.HELIUS_API_KEY!;
const ARKHAM_KEY = process.env.ARKAN_API_KEY!;
const NANSEN_KEY = process.env.NANSEN_API_KEY!;

// Items 11, 12, 14: profile wallets
const WALLETS: Record<string, { address: string; context: string }> = {
  '8QCVZ7KL': { address: '8QCVZ7KL65pBhUxbvfwbyyg4ronxNAEXbDrGLYLrRNn5', context: '$701 to GoonPump, Nansen: High Balance' },
  '5c9EM9y2': { address: '5c9EM9y2mrr9oJcSAB6WF391CYVAzh8bAYBuPNj2ghDV', context: '$1,249 to GoonPump, Nansen: Distributor' },
  'E7VEsTzG': { address: 'E7VEsTzG65z5xojtZd2msw992sBgr64L2wTDPcPV4wzo', context: '$273 from fireblocks_passthrough (9exPdTUV)' },
};

// Item 13: verify Ed4UGBWK Rollbit deposits
const ED4UGBWK = 'Ed4UGBWK4UpwBKiGFkM2uQMTPpahPwxgxEWjJTRXuAJv';
const ROLLBIT_CLAIMS = {
  'RB5KKB7h': 'RB5KKB7hbkuo3gnHk3FBxkBnKqmbyXgLCwBq8Rp7WBe',
  'RB2Yz3VS': 'RB2Yz3VSt2F4PGZBT4iNfHBi8wmMwG3CKt2GkrBqLoE',
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

async function arkhamTransfers(params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.arkm.com/transfers?${qs}`, {
    headers: { 'API-Key': ARKHAM_KEY },
  });
  if (!res.ok) return { error: res.status, text: await res.text() };
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
  const allAddresses = [
    ...entries.map(([, w]) => w.address),
    ...Object.values(ROLLBIT_CLAIMS),
  ];

  // Step 1: Balance for all wallets + Rollbit claim addresses
  console.log('=== STEP 1: Balance ===\n');
  for (const [label, w] of entries) {
    const bal = await heliusRpc('getBalance', [w.address]);
    const sol = (bal?.value ?? 0) / 1e9;
    results[label] = { address: w.address, context: w.context, balance_sol: sol };
    console.log(`${label}: ${sol.toFixed(4)} SOL — ${w.context}`);
  }
  for (const [label, addr] of Object.entries(ROLLBIT_CLAIMS)) {
    const bal = await heliusRpc('getBalance', [addr]);
    const sol = (bal?.value ?? 0) / 1e9;
    console.log(`${label} (Rollbit claim): ${sol.toFixed(4)} SOL`);
    results[`rollbit_${label}`] = { address: addr, balance_sol: sol };
  }

  // Step 2: Batch identity
  console.log('\n=== STEP 2: Batch Identity ===\n');
  const identities = await batchIdentity(allAddresses);
  const idMap: Record<string, any> = {};
  if (Array.isArray(identities)) {
    for (const id of identities) idMap[id.address] = id;
  }
  for (const addr of allAddresses) {
    const id = idMap[addr];
    const prefix = addr.slice(0, 8);
    console.log(`${prefix}: ${id?.name || 'no identity'} ${id?.category ? `(${id.category})` : ''}`);
  }

  // Step 3: Funded-by for profile wallets
  console.log('\n=== STEP 3: Funded-by ===\n');
  for (const [label, w] of entries) {
    const funder = await fundedBy(w.address);
    results[label].funded_by = funder;
    console.log(`${label}: funded by ${funder?.funderName || funder?.funder?.slice(0, 8) || 'unknown'} (${funder?.funderType || 'N/A'}) ${funder?.amount ? funder.amount + ' SOL' : ''}`);
  }

  // Step 4: Arkham intel for profile wallets + Rollbit claim addresses
  console.log('\n=== STEP 4: Arkham Intel ===\n');
  for (const [label, w] of entries) {
    const intel = await arkhamIntel(w.address);
    results[label].arkham = intel;
    console.log(`${label}: entity=${intel?.arkhamEntity?.name || 'none'}, isUserAddress=${intel?.isUserAddress}`);
  }
  for (const [label, addr] of Object.entries(ROLLBIT_CLAIMS)) {
    const intel = await arkhamIntel(addr);
    results[`rollbit_${label}`].arkham = intel;
    console.log(`${label} (Rollbit claim): entity=${intel?.arkhamEntity?.name || 'none'}, isUserAddress=${intel?.isUserAddress}`);
  }

  // Step 5: Verify Ed4UGBWK → Rollbit transfers via Arkham
  console.log('\n=== STEP 5: Ed4UGBWK Rollbit Transfer Verification ===\n');
  for (const [label, addr] of Object.entries(ROLLBIT_CLAIMS)) {
    console.log(`Checking Ed4UGBWK → ${label} (${addr})...`);
    const transfers = await arkhamTransfers({
      base: ED4UGBWK,
      counterparty: addr,
      chain: 'solana',
      limit: '10',
    });
    results[`rollbit_verify_${label}`] = transfers;
    if (transfers.error) {
      console.log(`  ERROR: ${transfers.error}`);
    } else {
      const txs = transfers?.transfers || [];
      console.log(`  Found ${txs.length} transfers`);
      for (const tx of txs.slice(0, 5)) {
        console.log(`  ${tx.blockTimestamp} — ${tx.unitValue} ${tx.tokenSymbol} ($${tx.historicalUSD?.toFixed(2)})`);
      }
    }
    await delay(1100); // Arkham transfers: 1 req/sec
  }

  // Also check reverse: Rollbit → Ed4UGBWK
  for (const [label, addr] of Object.entries(ROLLBIT_CLAIMS)) {
    console.log(`Checking ${label} → Ed4UGBWK...`);
    const transfers = await arkhamTransfers({
      base: addr,
      counterparty: ED4UGBWK,
      chain: 'solana',
      limit: '10',
    });
    results[`rollbit_verify_${label}_reverse`] = transfers;
    if (transfers.error) {
      console.log(`  ERROR: ${transfers.error}`);
    } else {
      const txs = transfers?.transfers || [];
      console.log(`  Found ${txs.length} transfers`);
    }
    await delay(1100);
  }

  // Step 6: Nansen counterparties for profile wallets
  console.log('\n=== STEP 6: Nansen Counterparties ===\n');
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

  const fs = await import('fs');
  fs.writeFileSync('data/results/raw/low-priority-profiles.json', JSON.stringify(results, null, 2));
  console.log('Saved to data/results/raw/low-priority-profiles.json');
}

main().catch(console.error);
