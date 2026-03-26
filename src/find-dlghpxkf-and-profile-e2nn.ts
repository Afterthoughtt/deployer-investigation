import 'dotenv/config';
import fs from 'fs';

const NANSEN_API_KEY = process.env.NANSEN_API_KEY!;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY!;
const ARKHAM_API_KEY = process.env.ARKAN_API_KEY!;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const networkMap = JSON.parse(fs.readFileSync('data/network-map.json', 'utf-8'));
const OG_ADDRESS = networkMap.infrastructure.og_deployer.address;
const E2NN_ADDRESS = networkMap.network_connected.E2NnJHhc.address;

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function nansenCounterparties(address: string, page: number = 1) {
  const res = await fetch('https://api.nansen.ai/api/v1/profiler/address/counterparties', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apiKey': NANSEN_API_KEY },
    body: JSON.stringify({
      address,
      chain: 'solana',
      date: { from: '2025-01-01', to: '2026-03-25' },
      group_by: 'wallet',
      source_input: 'Combined',
      pagination: { page, per_page: 50 },
      order_by: [{ field: 'total_volume_usd', direction: 'DESC' }]
    })
  });
  return res.json();
}

async function nansenTransactions(address: string, from: string, to: string) {
  const res = await fetch('https://api.nansen.ai/api/v1/profiler/address/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apiKey': NANSEN_API_KEY },
    body: JSON.stringify({
      address,
      chain: 'solana',
      date: { from, to },
      pagination: { page: 1, per_page: 50 },
      order_by: [{ field: 'volume_usd', direction: 'DESC' }]
    })
  });
  return res.json();
}

async function heliusFundedBy(address: string) {
  const res = await fetch(`https://api.helius.xyz/v1/wallet/${address}/funded-by?api-key=${HELIUS_API_KEY}`);
  if (res.status === 404) return { error: '404' };
  return res.json();
}

async function heliusTransfers(address: string) {
  const res = await fetch(`https://api.helius.xyz/v1/wallet/${address}/transfers?api-key=${HELIUS_API_KEY}&limit=100`);
  return res.json();
}

async function arkhamIntelligence(address: string) {
  const res = await fetch(`https://api.arkm.com/intelligence/address/${address}`, {
    headers: { 'API-Key': ARKHAM_API_KEY }
  });
  return res.json();
}

async function main() {
  const results: any = { dlghpxkf_search: {}, e2nn_profile: {} };

  // === PART 1: Find DLGHPXKF in OG deployer counterparties ===
  console.log('=== SEARCHING FOR DLGHPXKF IN OG DEPLOYER COUNTERPARTIES ===');
  console.log(`OG deployer: ${OG_ADDRESS}\n`);

  // Get page 1 and 2 of counterparties (top 100 by volume)
  const cp1 = await nansenCounterparties(OG_ADDRESS, 1);
  await delay(2000);
  const cp2 = await nansenCounterparties(OG_ADDRESS, 2);
  await delay(2000);

  const allCounterparties = [
    ...(cp1?.data || []),
    ...(cp2?.data || [])
  ];

  console.log(`Total counterparties fetched: ${allCounterparties.length}`);
  console.log(`Page 1 is_last_page: ${cp1?.pagination?.is_last_page}`);
  console.log(`Page 2 is_last_page: ${cp2?.pagination?.is_last_page}\n`);

  // Search for any address starting with DLGHPXKF
  const dlghMatches = allCounterparties.filter((cp: any) =>
    cp.counterparty_address?.startsWith('DLGHPXKF')
  );

  if (dlghMatches.length > 0) {
    console.log('FOUND DLGHPXKF match(es):');
    for (const m of dlghMatches) {
      console.log(`  Address: ${m.counterparty_address}`);
      console.log(`  Label: ${m.counterparty_address_label}`);
      console.log(`  Volume: $${m.total_volume_usd?.toFixed(2)}`);
      console.log(`  In: $${m.volume_in_usd?.toFixed(2)}, Out: $${m.volume_out_usd?.toFixed(2)}`);
      console.log(`  Interactions: ${m.interaction_count}`);
    }
  } else {
    console.log('NO address starting with DLGHPXKF found in top 100 counterparties.');
    console.log('\nTop 15 counterparties by volume (for reference):');
    for (const cp of allCounterparties.slice(0, 15)) {
      const addr = cp.counterparty_address || '';
      const label = cp.counterparty_address_label || '';
      const vol = cp.total_volume_usd?.toFixed(0) || '?';
      const txs = cp.interaction_count || '?';
      console.log(`  ${addr.slice(0, 12)}... ${label ? `(${label})` : ''} $${vol} / ${txs} txs`);
    }
  }

  results.dlghpxkf_search = {
    pages_searched: 2,
    total_counterparties: allCounterparties.length,
    dlghpxkf_matches: dlghMatches,
    top_15: allCounterparties.slice(0, 15).map((cp: any) => ({
      address: cp.counterparty_address,
      label: cp.counterparty_address_label,
      total_volume_usd: cp.total_volume_usd,
      volume_in_usd: cp.volume_in_usd,
      volume_out_usd: cp.volume_out_usd,
      interaction_count: cp.interaction_count
    })),
    all_counterparties: allCounterparties.map((cp: any) => ({
      address: cp.counterparty_address,
      label: cp.counterparty_address_label,
      total_volume_usd: cp.total_volume_usd,
      volume_in_usd: cp.volume_in_usd,
      volume_out_usd: cp.volume_out_usd,
      interaction_count: cp.interaction_count
    }))
  };

  // === PART 2: Deep profile E2NnJHhc ===
  console.log('\n\n=== DEEP PROFILING E2NnJHhc ===');
  console.log(`Address: ${E2NN_ADDRESS}\n`);

  // Nansen counterparties
  const e2nnCp = await nansenCounterparties(E2NN_ADDRESS, 1);
  await delay(2000);

  console.log('Nansen counterparties:');
  if (e2nnCp?.data) {
    for (const cp of e2nnCp.data) {
      const addr = cp.counterparty_address || '';
      const label = cp.counterparty_address_label || '';
      const volIn = cp.volume_in_usd?.toFixed(0) || '0';
      const volOut = cp.volume_out_usd?.toFixed(0) || '0';
      const txs = cp.interaction_count || '?';
      console.log(`  ${addr.slice(0, 12)}... ${label ? `(${label})` : ''} in=$${volIn} out=$${volOut} / ${txs} txs`);
    }
    console.log(`  is_last_page: ${e2nnCp.pagination?.is_last_page}`);
  } else {
    console.log(`  Error or empty: ${JSON.stringify(e2nnCp).slice(0, 200)}`);
  }

  // Nansen transactions (recent)
  await delay(2000);
  const e2nnTxs = await nansenTransactions(E2NN_ADDRESS, '2026-03-22', '2026-03-25');
  console.log(`\nNansen transactions (Mar 22-25):`)
  if (e2nnTxs?.data) {
    console.log(`  ${e2nnTxs.data.length} transactions found`);
    for (const tx of e2nnTxs.data.slice(0, 10)) {
      const sent = tx.tokens_sent?.map((t: any) => `${t.token_amount?.toFixed(4)} ${t.token_symbol || 'TOKEN'}`).join(', ') || 'none';
      const rcvd = tx.tokens_received?.map((t: any) => `${t.token_amount?.toFixed(4)} ${t.token_symbol || 'TOKEN'}`).join(', ') || 'none';
      console.log(`  ${tx.block_timestamp} | $${tx.volume_usd?.toFixed(2)} | sent: ${sent} | rcvd: ${rcvd}`);
    }
  } else {
    console.log(`  Error: ${JSON.stringify(e2nnTxs).slice(0, 200)}`);
  }

  // Helius funded-by
  await delay(100);
  const e2nnFunded = await heliusFundedBy(E2NN_ADDRESS);
  console.log(`\nHelius funded-by: ${JSON.stringify(e2nnFunded).slice(0, 300)}`);

  // Helius transfers (top 100)
  await delay(100);
  const e2nnTransfers = await heliusTransfers(E2NN_ADDRESS);
  console.log(`\nHelius transfers: ${e2nnTransfers?.data?.length || 0} transfers`);
  if (e2nnTransfers?.data) {
    // Summarize by counterparty
    const cpMap: Record<string, { in: number; out: number; count: number }> = {};
    for (const t of e2nnTransfers.data) {
      const cp = t.counterparty || 'unknown';
      if (!cpMap[cp]) cpMap[cp] = { in: 0, out: 0, count: 0 };
      cpMap[cp].count++;
      if (t.direction === 'in') cpMap[cp].in += t.amount || 0;
      else cpMap[cp].out += t.amount || 0;
    }
    const sorted = Object.entries(cpMap).sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out));
    console.log('  Top counterparties by volume:');
    for (const [addr, data] of sorted.slice(0, 15)) {
      const symbol = e2nnTransfers.data.find((t: any) => t.counterparty === addr)?.symbol || 'SOL';
      console.log(`    ${addr.slice(0, 12)}... in=${data.in.toFixed(4)} out=${data.out.toFixed(4)} ${symbol} (${data.count} txs)`);
    }
  }

  // Arkham intelligence
  const e2nnArkham = await arkhamIntelligence(E2NN_ADDRESS);
  console.log(`\nArkham intel: ${JSON.stringify(e2nnArkham).slice(0, 300)}`);

  results.e2nn_profile = {
    address: E2NN_ADDRESS,
    nansen_counterparties: e2nnCp?.data || [],
    nansen_transactions: e2nnTxs?.data?.slice(0, 20) || [],
    helius_funded_by: e2nnFunded,
    helius_transfers: e2nnTransfers?.data || [],
    arkham: e2nnArkham
  };

  // Save
  fs.writeFileSync('data/results/raw/dlghpxkf-e2nn-investigation.json', JSON.stringify(results, null, 2));
  console.log('\n\nResults saved to data/results/raw/dlghpxkf-e2nn-investigation.json');
}

main().catch(console.error);
