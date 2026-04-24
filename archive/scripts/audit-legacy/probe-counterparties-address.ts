// One-off probe: does /counterparties/address work on Solana?
// CLAUDE.md says "unverified for Solana" — testing against OG Deployer,
// a known-busy wallet with well-documented network counterparties.
import 'dotenv/config';
import { arkhamMeta } from './utils.js';

const OG_DEPLOYER = '37XxihfsTW1EFSJJherWFRFWcAFhj4KQ66cXHiegSKg2';

async function main() {
  console.log(`Testing /counterparties/address/${OG_DEPLOYER}?chain=solana`);
  try {
    const { body, meta } = await arkhamMeta(
      `/counterparties/address/${OG_DEPLOYER}`,
      { chain: 'solana' },
      true,
    );
    console.log('meta:', JSON.stringify(meta, null, 2));
    console.log('body type:', typeof body, Array.isArray(body) ? `(array, length ${(body as unknown[]).length})` : '');
    console.log('body (first 6000 chars):');
    console.log(JSON.stringify(body, null, 2).slice(0, 6000));
  } catch (err) {
    console.error('ERROR:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
