import 'dotenv/config';
import { readFileSync } from 'fs';

// Load network-map for cross-referencing
const networkMap = JSON.parse(readFileSync('data/network-map.json', 'utf8'));

// Known addresses from network-map (flatten all)
const KNOWN: Record<string, string> = {};

// Deployers
for (const [k, v] of Object.entries(networkMap.deployers)) KNOWN[k] = v as string;

// Infrastructure
for (const [k, v] of Object.entries(networkMap.infrastructure)) {
  const obj = v as any;
  KNOWN[k] = obj.address;
}

// Bundle wallets
for (const [k, v] of Object.entries(networkMap.bundle_wallets)) KNOWN[k] = v as string;

// Profit routing
for (const [k, v] of Object.entries(networkMap.profit_routing)) {
  const obj = v as any;
  KNOWN[k] = obj.address;
}

// Side projects
for (const [k, v] of Object.entries(networkMap.side_projects)) {
  const obj = v as any;
  KNOWN[k] = obj.address;
}

// Network connected
for (const [k, v] of Object.entries(networkMap.network_connected)) {
  const obj = v as any;
  KNOWN[k] = obj.address;
}

// Coinbase
for (const [k, v] of Object.entries(networkMap.onramp_hot_wallets.coinbase)) {
  if (k === 'notes') continue;
  KNOWN[`coinbase_${k}`] = v as string;
}

// MoonPay
KNOWN['MP1'] = networkMap.onramp_hot_wallets.moonpay.MP1.address;

console.log(`Loaded ${Object.keys(KNOWN).length} known addresses\n`);

// Reverse lookup
const addrToLabel: Record<string, string> = {};
for (const [label, addr] of Object.entries(KNOWN)) addrToLabel[addr] = label;

function identify(addr: string): string {
  if (addrToLabel[addr]) return addrToLabel[addr];
  // Check prefix match
  for (const [fullAddr, label] of Object.entries(addrToLabel)) {
    if (fullAddr.startsWith(addr.slice(0, 8))) return `${label} (prefix match)`;
  }
  return 'UNKNOWN';
}

// ============ AUDIT HIGH PRIORITY ============
console.log('========== HIGH PRIORITY AUDIT ==========\n');

// 98KvdqZJ: funded by 2Zizao3xpJGsoUFdvTJjYL8LijtFxR9v36cNBeDJJVSz
const susyeDeployer = networkMap.insiders.coinspot_insider.connected_susye_deployer.address;
const fundedBy98Kv = '2Zizao3xpJGsoUFdvTJjYL8LijtFxR9v36cNBeDJJVSz';
console.log(`[98KvdqZJ] Funded by: ${fundedBy98Kv}`);
console.log(`  Expected (SUSYE deployer): ${susyeDeployer}`);
console.log(`  MATCH: ${fundedBy98Kv === susyeDeployer ? '✓' : '✗ MISMATCH'}\n`);

// F7oLGB1U: funded by 4916NkdubkfRyHkxkCR7rpVGz5dvzVdK161mg4jXDwRh
const tokenTradingWallet = networkMap.insiders.coinspot_insider.token_trading_wallet.address;
const fundedByF7oL = '4916NkdubkfRyHkxkCR7rpVGz5dvzVdK161mg4jXDwRh';
console.log(`[F7oLGB1U] Funded by: ${fundedByF7oL}`);
console.log(`  Expected (token_trading_wallet): ${tokenTradingWallet}`);
console.log(`  MATCH: ${fundedByF7oL === tokenTradingWallet ? '✓' : '✗ MISMATCH'}\n`);

// F7oLGB1U counterparty: CoinSpot CSEncqtq
const coinspotExchange = networkMap.insiders.coinspot_insider.exchange;
console.log(`[F7oLGB1U] Sends to CoinSpot: ${coinspotExchange}`);
console.log(`  CSEncqtq prefix match: ${coinspotExchange.includes('CSEncqtq') ? '✓' : '✗'}\n`);

// DcbyADbN counterparty: L9 deployer 3VmNQ8Fo
const l9Deployer = networkMap.deployers.L9;
console.log(`[DcbyADbN] Top counterparty L9 deployer: 3VmNQ8Fo...`);
console.log(`  Expected (L9): ${l9Deployer}`);
console.log(`  Prefix match: ${l9Deployer.startsWith('3VmNQ8Fo') ? '✓' : '✗ MISMATCH'}\n`);

// ============ AUDIT MEDIUM PRIORITY ============
console.log('========== MEDIUM PRIORITY AUDIT ==========\n');

// 7mb5n6uw: funded by FSbvLdrK
const jetnutNetwork = networkMap.side_projects.jetnut_network.address;
console.log(`[7mb5n6uw] Funded by: FSbvLdrK...`);
console.log(`  Expected (jetnut_network): ${jetnutNetwork}`);
console.log(`  Prefix match: ${jetnutNetwork.startsWith('FSbvLdrK') ? '✓' : '✗ MISMATCH'}\n`);

// BigpvKiU counterparties: L9 deployer + jetnut_network + 7RLD6F9S
const fireblocks7RLD = networkMap.profit_routing.fireblocks_7RLD6F9S.address;
console.log(`[BigpvKiU] Sends to 7RLD6F9S: ${fireblocks7RLD.slice(0, 8)}...`);
console.log(`  Known address match: ${fireblocks7RLD.startsWith('7RLD6F9S') ? '✓' : '✗'}`);
console.log(`  Receives from L9 deployer 3VmNQ8Fo: ${l9Deployer.startsWith('3VmNQ8Fo') ? '✓' : '✗'}`);
console.log(`  Receives from jetnut_network FSbvLdrK: ${jetnutNetwork.startsWith('FSbvLdrK') ? '✓' : '✗'}\n`);

// HBgtmeZD: funded by HYMtCcfQ = L7 deployer
const l7Deployer = networkMap.deployers.L7;
console.log(`[HBgtmeZD] Funded by: HYMtCcfQ...`);
console.log(`  Expected (L7 deployer): ${l7Deployer}`);
console.log(`  Prefix match: ${l7Deployer.startsWith('HYMtCcfQ') ? '✓' : '✗ MISMATCH'}\n`);

// ChcEbZW2 counterparties: CB5 + CB8 + Hub + Bundle 5
const cb5 = networkMap.onramp_hot_wallets.coinbase.CB5;
const cb8 = networkMap.onramp_hot_wallets.coinbase.CB8;
const hub = networkMap.infrastructure.hub_wallet.address;
const bundle5 = networkMap.bundle_wallets.bundle_5;
console.log(`[ChcEbZW2] Coinbase CB5 (4NyK1AdJ): ${cb5}`);
console.log(`  Prefix match: ${cb5.startsWith('4NyK1AdJ') ? '✓' : '✗ MISMATCH'}`);
console.log(`  Coinbase CB8 (FpwQQhQQ): ${cb8}`);
console.log(`  Prefix match: ${cb8.startsWith('FpwQQhQQ') ? '✓' : '✗ MISMATCH'}`);
console.log(`  Hub (v49jgwyQ): ${hub}`);
console.log(`  Prefix match: ${hub.startsWith('v49jgwyQ') ? '✓' : '✗ MISMATCH'}`);
console.log(`  Bundle 5 (EvcWdhdj): ${bundle5}`);
console.log(`  Prefix match: ${bundle5.startsWith('EvcWdhdj') ? '✓' : '✗ MISMATCH'}\n`);

// ChcEbZW2: Binance Deposit 4mba47Vg — is this known?
const binanceReal = networkMap.profit_routing.binance_deposit_real.address;
console.log(`[ChcEbZW2] Sends to Binance Deposit 4mba47Vg`);
console.log(`  Known deployer Binance deposit (Fx7gAJpk): ${binanceReal}`);
console.log(`  Is 4mba47Vg the same? NO — different address. This is a NEW Binance deposit.\n`);

// EQdtK31j + Dgq7Ba5N: funded by EAcUbdoi = cold_usdc_2
const coldUsdc2 = networkMap.profit_routing.cold_usdc_2.address;
console.log(`[EQdtK31j/Dgq7Ba5N] Funded by: EAcUbdoi...`);
console.log(`  Expected (cold_usdc_2): ${coldUsdc2}`);
console.log(`  Prefix match: ${coldUsdc2.startsWith('EAcUbdoi') ? '✓' : '✗ MISMATCH'}\n`);

// ============ AUDIT LOW PRIORITY ============
console.log('========== LOW PRIORITY AUDIT ==========\n');

// Ed4UGBWK Rollbit: identical transfers to both RB addresses
console.log(`[Ed4UGBWK Rollbit] Both RB5KKB7h and RB2Yz3VS show IDENTICAL amounts and timestamps:`);
console.log(`  2026-03-31T10:01:35Z — 1.60569356 SOL ($131.25)`);
console.log(`  2026-03-31T10:00:23Z — 0.20965312 SOL ($17.14)`);
console.log(`  ⚠ ANOMALY: Same amounts, same times to two different addresses.`);
console.log(`  This could be: (a) Arkham returning the same tx for both, (b) a batch transaction, or (c) a data issue.`);
console.log(`  NEEDS: Parse a specific transaction hash to verify these are distinct transfers.\n`);

// ============ NEW DISCOVERIES ============
console.log('========== NEW DISCOVERIES TO INVESTIGATE ==========\n');

const newDiscoveries = [
  { label: 'GgFVQNY5', address: 'GgFVQNY5hck2WMFtpVeWi37yQKepyHLqLD8eZ3nmLvKH', context: 'Aggregator: receives from both cold_usdc_2 relays ($789 + $769 = $1.6K)' },
  { label: '764DRkmQ', address: '764DRkmQ', context: 'Funds BigpvKiU ($2.6K) — BigpvKiU is a network router to 7RLD6F9S. Need full address from raw data.' },
  { label: '2xVvxZ62', address: '2xVvxZ62', context: 'Sends $5.1K to 7mb5n6uw (network distribution wallet). Unknown source.' },
  { label: '4mba47Vg', address: '4mba47Vg', context: 'Binance Deposit receiving $620 from ChcEbZW2. NOT the known deployer Binance (Fx7gAJpk). New Binance deposit?' },
  { label: '9Ws5GF8V', address: '9Ws5GF8V', context: 'Receives $7.5K from ChcEbZW2 (9 txs). Largest ChcEbZW2 outflow destination.' },
];

for (const d of newDiscoveries) {
  const known = identify(d.address);
  console.log(`${d.label}: ${d.context}`);
  console.log(`  Network match: ${known}\n`);
}
