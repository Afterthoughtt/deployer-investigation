import 'dotenv/config';
import fs from 'fs';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY!;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Expected non-zero balances (SOL) — flag if zero
const EXPECTED_NONZERO: Record<string, number> = {
  'fireblocks_7RLD6F9S': 43.79,
  'jetnut_network': 7.9,
  'collection_wallet': 380,
  'large_funding_source': 2800,
  'MP1': 2275,
  'MP4': 17056,
};

// Known to be near-zero or drained — don't flag
const KNOWN_LOW = new Set([
  'hub_wallet', 'hub_first_funder', 'hub_intermediary_DfwNaPDh',
  'profit_pass_1', 'profit_pass_2', 'cold_usdc_1',
  'rollbit_deposit', 'coinbase_deposit', 'coinbase_deposit_2',
  'binance_deposit_real', 'binance_deposit_generic',
  'phantom_fee_wallet', 'token_millionaire', 'secondary_aggregator',
  'fireblocks_passthrough', '6UrYwo9F', 'DZc1evNL', 'Ed4UGBWK',
  'E2NnJHhc', 'jetnut_deployer',
  'BqP79Wmk_deployer_trading', '7QJM8rXX', 'F7RV6aBW', 'D1XcKeSS',
  'yNanvu8H_resolved', 'chrisV_resolved', 'niggerd5_resolved', '4tMmABq7_resolved',
  'blofin_passthrough',
  // Deployers are typically drained
  'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10',
  // CoinSpot insider sub-wallets
  'trading_wallet', 'token_trading_wallet', 'collection',
  'connected_susye_deployer',
]);

interface AddressEntry {
  label: string;
  address: string;
  category: string;
}

function extractAddresses(obj: any, category: string = '', label: string = ''): AddressEntry[] {
  const entries: AddressEntry[] = [];

  if (typeof obj === 'string' && obj.length >= 32 && obj.length <= 44 && !obj.includes(' ') && !obj.includes('/')) {
    // Looks like a Solana address
    entries.push({ label, address: obj, category });
    return entries;
  }

  if (typeof obj !== 'object' || obj === null) return entries;

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'metadata' || key === 'notes' || key === 'details' || key === 'status' ||
        key === 'unmapped' || key === 'exchange' || key === 'volume' || key === 'funding_pipeline' ||
        key === 'label' || key === 'funded_by' || key === 'receives_from' || key === 'sends_to' ||
        key === 'deploys' || key === 'trades') continue;

    if (key === 'address') {
      if (typeof value === 'string') {
        entries.push({ label: label || category, address: value, category });
      }
    } else if (typeof value === 'string' && value.length >= 32 && value.length <= 44 && !value.includes(' ') && !value.includes('/') && !value.includes(':')) {
      // Direct address value (e.g., deployers.L4 = "addr")
      entries.push({ label: key, address: value, category: category || key });
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      entries.push(...extractAddresses(value, category || key, key));
    }
  }

  return entries;
}

async function getBalance(address: string): Promise<{ lamports: number | null; error: string | null }> {
  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getBalance',
        params: [address],
      }),
    });
    const json = await res.json() as any;
    if (json.error) return { lamports: null, error: json.error.message };
    return { lamports: json.result?.value ?? 0, error: null };
  } catch (e: any) {
    return { lamports: null, error: e.message };
  }
}

async function main() {
  const networkMap = JSON.parse(fs.readFileSync('data/network-map.json', 'utf-8'));
  const allAddresses = extractAddresses(networkMap);

  // Deduplicate by address
  const seen = new Set<string>();
  const unique: AddressEntry[] = [];
  for (const entry of allAddresses) {
    if (!seen.has(entry.address)) {
      seen.add(entry.address);
      unique.push(entry);
    }
  }

  console.log(`Found ${unique.length} unique addresses to audit\n`);
  console.log('Label'.padEnd(35) + 'Address'.padEnd(48) + 'Balance (SOL)'.padEnd(16) + 'Status');
  console.log('-'.repeat(110));

  const results: any[] = [];

  // Batch in groups of 10 to stay well under 50 req/sec
  for (let i = 0; i < unique.length; i += 10) {
    const batch = unique.slice(i, i + 10);
    const balances = await Promise.all(batch.map(e => getBalance(e.address)));

    for (let j = 0; j < batch.length; j++) {
      const entry = batch[j];
      const { lamports, error } = balances[j];
      let status = '';
      let balanceSol = 0;

      if (error) {
        status = `ERROR: ${error}`;
      } else {
        balanceSol = (lamports ?? 0) / 1e9;

        if (EXPECTED_NONZERO[entry.label] && balanceSol === 0) {
          status = `FLAG — expected ~${EXPECTED_NONZERO[entry.label]} SOL`;
        } else if (balanceSol === 0 && !KNOWN_LOW.has(entry.label)) {
          status = 'FLAG — unexpected zero';
        } else {
          status = 'OK';
        }
      }

      const shortAddr = entry.address.slice(0, 8) + '...' + entry.address.slice(-4);
      console.log(
        entry.label.padEnd(35) +
        shortAddr.padEnd(48) +
        (error ? 'ERR' : balanceSol.toFixed(4)).toString().padEnd(16) +
        status
      );

      results.push({
        label: entry.label,
        address: entry.address,
        category: entry.category,
        balance_sol: error ? null : balanceSol,
        status,
        error: error || undefined,
      });
    }
  }

  // Summary
  const flagged = results.filter(r => r.status.startsWith('FLAG') || r.status.startsWith('ERROR'));
  console.log(`\n${'='.repeat(110)}`);
  console.log(`AUDIT SUMMARY: ${unique.length} addresses scanned, ${flagged.length} flagged\n`);

  if (flagged.length > 0) {
    console.log('FLAGGED ADDRESSES:');
    for (const f of flagged) {
      console.log(`  ${f.label}: ${f.address}`);
      console.log(`    ${f.status}`);
    }
  } else {
    console.log('No addresses flagged. All balances match expectations.');
  }

  // Save full results
  fs.writeFileSync('data/results/raw/address-audit-results.json', JSON.stringify(results, null, 2));
  console.log('\nFull results saved to data/results/raw/address-audit-results.json');
}

main().catch(console.error);
