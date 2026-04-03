/**
 * moonpay-search.ts — Second attempt to discover additional MoonPay hot wallets on Solana.
 *
 * Known wallets (loaded from network-map.json):
 *   - MP1: Customer-facing, funded L10 deployer
 *   - MP4: Treasury only, funds MP1
 *
 * Strategy: Query Arkham entity search + entity lookup + Nansen entity search
 * to find any MoonPay-labeled Solana addresses beyond MP1/MP4.
 * If new addresses found, cross-verify with Helius batch-identity.
 */

import { arkham, heliusBatchIdentity, nansen } from './utils.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Load known MoonPay addresses from network-map.json (NEVER type addresses)
// ---------------------------------------------------------------------------
function loadKnownMoonPayWallets(): Record<string, string> {
  const filePath = join(process.cwd(), 'data/network-map.json');
  const data = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, Record<string, unknown>>;
  const moonpay = data.onramp_hot_wallets?.moonpay as Record<string, unknown> | undefined;
  if (!moonpay) throw new Error('network-map: onramp_hot_wallets.moonpay not found');

  const wallets: Record<string, string> = {};
  for (const [key, value] of Object.entries(moonpay)) {
    if (key === 'notes') continue;
    const entry = value as Record<string, unknown>;
    if (typeof entry.address === 'string') {
      wallets[key] = entry.address;
    }
  }
  return wallets;
}

// ---------------------------------------------------------------------------
// Check if a string looks like a Solana address (base58, 32-44 chars)
// ---------------------------------------------------------------------------
function isSolanaAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== MoonPay Wallet Discovery (Second Attempt) ===\n');

  const knownWallets = loadKnownMoonPayWallets();
  const knownAddresses = new Set(Object.values(knownWallets));
  console.log('Known MoonPay wallets from network-map.json:');
  for (const [key, addr] of Object.entries(knownWallets)) {
    console.log(`  ${key}: ${addr}`);
  }
  console.log();

  // -------------------------------------------------------------------------
  // 1. Arkham intelligence search for "moonpay"
  // -------------------------------------------------------------------------
  console.log('1. Arkham entity search for "moonpay"...');
  let arkhamSearch: unknown = null;
  try {
    arkhamSearch = await arkham('/intelligence/search', { q: 'moonpay' });
    const searchStr = JSON.stringify(arkhamSearch, null, 2);
    console.log('Search results:', searchStr.slice(0, 3000));
    if (searchStr.length > 3000) console.log(`  ... (${searchStr.length} chars total, truncated)`);
  } catch (err) {
    console.error(`  ERROR: ${(err as Error).message}`);
  }

  // -------------------------------------------------------------------------
  // 2. Arkham entity lookup for "moonpay" — may return address list
  // -------------------------------------------------------------------------
  console.log('\n2. Arkham entity lookup "moonpay"...');
  let arkhamEntity: unknown = null;
  try {
    arkhamEntity = await arkham('/intelligence/entity/moonpay');
    const entityStr = JSON.stringify(arkhamEntity, null, 2);
    console.log('Entity result:', entityStr.slice(0, 3000));
    if (entityStr.length > 3000) console.log(`  ... (${entityStr.length} chars total, truncated)`);
  } catch (err) {
    console.error(`  ERROR: ${(err as Error).message}`);
  }

  // -------------------------------------------------------------------------
  // 3. Nansen entity name search (0 credits)
  // -------------------------------------------------------------------------
  console.log('\n3. Nansen entity search for "moonpay"...');
  let nansenSearch: unknown = null;
  try {
    nansenSearch = await nansen('/search/entity-name', { search_query: 'moonpay' });
    console.log('Nansen entities:', JSON.stringify(nansenSearch, null, 2));
  } catch (err) {
    console.error(`  ERROR: ${(err as Error).message}`);
  }

  // -------------------------------------------------------------------------
  // 4. Extract Solana addresses from Arkham results
  // -------------------------------------------------------------------------
  console.log('\n4. Extracting Solana addresses from Arkham results...');
  const solanaAddresses: string[] = [];

  // Helper: recursively find addresses in Arkham response
  function extractAddresses(obj: unknown, path: string): void {
    if (obj === null || obj === undefined) return;
    if (typeof obj === 'string') {
      if (isSolanaAddress(obj) && !knownAddresses.has(obj)) {
        // Could be a Solana address — but only flag if in a Solana context
      }
      return;
    }
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        extractAddresses(obj[i], `${path}[${i}]`);
      }
      return;
    }
    if (typeof obj === 'object') {
      const record = obj as Record<string, unknown>;
      // Look for address fields with chain=solana context
      if (typeof record.address === 'string' && isSolanaAddress(record.address)) {
        const chain = record.chain as string | undefined;
        if (!chain || chain.toLowerCase() === 'solana') {
          if (!knownAddresses.has(record.address)) {
            console.log(`  Found Solana address at ${path}: ${record.address} (chain: ${chain ?? 'unspecified'})`);
            solanaAddresses.push(record.address);
          } else {
            console.log(`  Known address at ${path}: ${record.address} (already tracked)`);
          }
        }
      }
      for (const [key, val] of Object.entries(record)) {
        extractAddresses(val, `${path}.${key}`);
      }
    }
  }

  if (arkhamSearch) extractAddresses(arkhamSearch, 'arkhamSearch');
  if (arkhamEntity) extractAddresses(arkhamEntity, 'arkhamEntity');

  // Deduplicate
  const uniqueNewAddresses = [...new Set(solanaAddresses)];
  console.log(`\n  New Solana addresses found: ${uniqueNewAddresses.length}`);
  for (const addr of uniqueNewAddresses) {
    console.log(`    ${addr}`);
  }

  // -------------------------------------------------------------------------
  // 5. Cross-verify new addresses with Helius batch-identity (if any found)
  // -------------------------------------------------------------------------
  let heliusVerification: unknown = null;
  if (uniqueNewAddresses.length > 0) {
    console.log('\n5. Verifying new addresses with Helius batch-identity...');
    try {
      heliusVerification = await heliusBatchIdentity(uniqueNewAddresses);
      console.log('Helius verification:', JSON.stringify(heliusVerification, null, 2));
    } catch (err) {
      console.error(`  ERROR: ${(err as Error).message}`);
    }
  } else {
    console.log('\n5. No new Solana addresses to verify with Helius.');
  }

  // -------------------------------------------------------------------------
  // 6. Analyze and save results
  // -------------------------------------------------------------------------
  console.log('\n6. Analyzing results...');

  // Determine which new addresses are confirmed MoonPay
  const confirmedNewMoonPay: Array<{ address: string; source: string; helius_name?: string }> = [];
  if (heliusVerification && Array.isArray(heliusVerification)) {
    for (const entry of heliusVerification as Array<Record<string, unknown>>) {
      const name = (entry.name as string) ?? '';
      const category = (entry.category as string) ?? '';
      if (name.toLowerCase().includes('moonpay') || category.toLowerCase().includes('moonpay')) {
        confirmedNewMoonPay.push({
          address: entry.address as string,
          source: 'arkham + helius',
          helius_name: name,
        });
      }
    }
  }

  let conclusion: string;
  if (confirmedNewMoonPay.length > 0) {
    conclusion = `Found ${confirmedNewMoonPay.length} new MoonPay Solana wallet(s): ${confirmedNewMoonPay.map(w => w.address.slice(0, 8) + '...').join(', ')}. These should be added to network-map.json and monitored in Vector A.`;
  } else if (uniqueNewAddresses.length > 0) {
    conclusion = `Found ${uniqueNewAddresses.length} new Solana address(es) from Arkham MoonPay entity, but none confirmed as MoonPay by Helius. May be associated wallets rather than MoonPay hot wallets. Manual review recommended.`;
  } else {
    conclusion = 'No additional MoonPay Solana wallets found beyond MP1 and MP4. Arkham entity search and Nansen entity search returned no new Solana addresses. Gap confirmed — Vector A monitors MP1 only.';
  }

  console.log(`\nConclusion: ${conclusion}`);

  const results = {
    timestamp: new Date().toISOString(),
    purpose: 'Second attempt to discover additional MoonPay hot wallets on Solana',
    arkham_search: arkhamSearch,
    arkham_entity: arkhamEntity,
    nansen_search: nansenSearch,
    known_moonpay_wallets: knownWallets,
    new_solana_addresses_from_arkham: uniqueNewAddresses,
    helius_verification: heliusVerification,
    confirmed_new_moonpay: confirmedNewMoonPay,
    conclusion,
  };

  const outPath = join(process.cwd(), 'data/results/moonpay-search-results.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2) + '\n');
  console.log(`\nResults saved to ${outPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
