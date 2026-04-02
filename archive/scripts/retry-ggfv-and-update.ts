import 'dotenv/config';
import { writeFileSync, readFileSync } from 'fs';

const NANSEN_KEY = process.env.NANSEN_API_KEY!;
const HELIUS_KEY = process.env.HELIUS_API_KEY!;

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

// Also profile 9Ws5GF8V via Helius transfers since Nansen 422'd
async function heliusTransfers(address: string, limit = 50): Promise<any> {
  const res = await fetch(`https://api.helius.xyz/v1/wallet/${address}/transfers?api-key=${HELIUS_KEY}&limit=${limit}`);
  if (!res.ok) return { error: res.status };
  return res.json();
}

async function main() {
  // Retry GgFVQNY5
  console.log('=== Retrying GgFVQNY5 Nansen Counterparties ===\n');
  const ggfv = await nansenCounterparties('GgFVQNY5hck2WMFtpVeWi37yQKepyHLqLD8eZ3nmLvKH');

  if (ggfv.error) {
    console.log(`GgFVQNY5: Still ERROR ${ggfv.error} — ${String(ggfv.text).slice(0, 200)}`);
  } else {
    const rows = ggfv?.data || [];
    console.log(`GgFVQNY5: ${rows.length} counterparties`);
    for (const r of rows.slice(0, 20)) {
      const cpLabel = r.counterparty_address_label?.join(', ') || 'unlabeled';
      const cpAddr = r.counterparty_address?.slice(0, 8);
      console.log(`  ${cpAddr} (${cpLabel}): $${Math.round(r.total_volume_usd)} vol, ${r.interaction_count} txs, in=$${Math.round(r.volume_in_usd)} out=$${Math.round(r.volume_out_usd)}`);
    }
  }

  // 9Ws5GF8V via Helius transfers
  console.log('\n=== 9Ws5GF8V Helius Transfers (first 50) ===\n');
  const wsTransfers = await heliusTransfers('9Ws5GF8ViemNfrzbybsWHfVCy8kPNbJcjiFWbvGn64La');

  if (wsTransfers.error) {
    console.log(`ERROR: ${wsTransfers.error}`);
  } else {
    const txs = wsTransfers?.data || [];
    console.log(`${txs.length} transfers found`);

    // Summarize counterparties
    const cpMap: Record<string, { in: number; out: number; count: number }> = {};
    for (const tx of txs) {
      const cp = tx.counterparty;
      if (!cp) continue;
      const prefix = cp.slice(0, 8);
      if (!cpMap[prefix]) cpMap[prefix] = { in: 0, out: 0, count: 0 };
      cpMap[prefix].count++;
      if (tx.direction === 'in') cpMap[prefix].in += tx.amount || 0;
      else cpMap[prefix].out += tx.amount || 0;
    }

    const sorted = Object.entries(cpMap).sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out));
    console.log('\nTop counterparties by volume (SOL):');
    for (const [prefix, stats] of sorted.slice(0, 15)) {
      console.log(`  ${prefix}: in=${stats.in.toFixed(2)} out=${stats.out.toFixed(2)} SOL, ${stats.count} txs`);
    }
  }

  // Save
  const results = { ggfv_counterparties: ggfv, ws_transfers: wsTransfers };
  writeFileSync('data/results/raw/new-discoveries-retry.json', JSON.stringify(results, null, 2));
  console.log('\nSaved to data/results/raw/new-discoveries-retry.json');
}

main().catch(console.error);
