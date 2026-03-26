import "dotenv/config";

const NANSEN_KEY = process.env.NANSEN_API_KEY!;
const HELIUS_KEY = process.env.HELIUS_API_KEY!;
const HELIUS_API = `https://api.helius.xyz`;
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Step 1: Get full Nansen entity balance raw response
  console.log("--- Nansen MoonPay entity raw ---");
  const res = await fetch("https://api.nansen.ai/api/v1/profiler/address/current-balance", {
    method: "POST",
    headers: { "Content-Type": "application/json", apiKey: NANSEN_KEY },
    body: JSON.stringify({ entity_name: "MoonPay", chain: "solana", hide_spam_token: true }),
  });
  const raw = await res.json();
  console.log(JSON.stringify(raw, null, 2).slice(0, 3000));

  // Step 2: Also try Nansen profiler/address/related-wallets approach
  // Using entity_name doesn't give us addresses — let's try getting MP1's transfers via Nansen
  // and look for wallets labeled "MoonPay"

  // Step 3: Try Helius — search for all "MoonPay" identities
  // Helius doesn't have a search-by-name endpoint, but we can check specific IDs
  // Helius labeled MP1 as "MoonPay Hot Wallet 1" and AFKxebx9 as "MoonPay Hot Wallet 4"
  // So there should be Hot Wallets 2, 3, and possibly 5+

  // Let's check the MP4 (AFKxebx9) transfers to find other MP wallets it funds
  console.log("\n--- MP4 (AFKxebx9) full transfers — looking for other MoonPay wallets ---");
  const mp4Transfers = await fetch(`${HELIUS_API}/v1/wallet/AFKxebx96mnt1yn1ek6mcxeGDHmfrAWzo2h1fVdrrvWE/transfers?api-key=${HELIUS_KEY}&limit=100`);
  const mp4Data = await mp4Transfers.json();
  const transfers = mp4Data.data || [];
  console.log(`Transfers: ${transfers.length}`);

  // Show all unique counterparties
  const cpMap: Record<string, { in: number; out: number; count: number }> = {};
  for (const t of transfers) {
    const cp = t.counterparty;
    if (!cp) continue;
    if (!cpMap[cp]) cpMap[cp] = { in: 0, out: 0, count: 0 };
    cpMap[cp].count++;
    if (t.direction === "out") cpMap[cp].out += t.amount || 0;
    else cpMap[cp].in += t.amount || 0;
  }

  const sorted = Object.entries(cpMap).sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out));
  console.log(`\nAll counterparties of MP4:`);
  const allAddrs: string[] = [];
  for (const [addr, info] of sorted) {
    console.log(`  ${addr} out=${info.out.toFixed(2)} in=${info.in.toFixed(2)} txs=${info.count}`);
    allAddrs.push(addr);
  }

  // Batch identity ALL of MP4's counterparties
  if (allAddrs.length > 0) {
    console.log(`\n--- Batch identity on ${allAddrs.length} MP4 counterparties ---`);
    const batchRes = await fetch(`${HELIUS_API}/v1/wallet/batch-identity?api-key=${HELIUS_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresses: allAddrs }),
    });
    if (batchRes.ok) {
      const batch = await batchRes.json();
      console.log(`Identified: ${batch.length}`);
      for (const item of batch) {
        console.log(`  ${item.address} — ${item.name} (${item.category})`);
      }
    } else {
      console.log(`Batch identity error: ${batchRes.status}`);
    }
  }

  // Step 4: Check Bitstamp (HBxZShcE) — it funded MP4. Does it fund other MoonPay wallets?
  console.log("\n--- Bitstamp (HBxZShcE) transfers — looking for other MoonPay wallets ---");
  await sleep(150);
  const bitstampTransfers = await fetch(`${HELIUS_API}/v1/wallet/HBxZShcE86UMmF93KUM8eWJKqeEXi5cqWCLYLMMhqMYm/transfers?api-key=${HELIUS_KEY}&limit=100`);
  const bsData = await bitstampTransfers.json();
  const bsTransfers = bsData.data || [];
  console.log(`Transfers: ${bsTransfers.length}`);

  const bsCpMap: Record<string, { in: number; out: number; count: number }> = {};
  for (const t of bsTransfers) {
    const cp = t.counterparty;
    if (!cp) continue;
    if (!bsCpMap[cp]) bsCpMap[cp] = { in: 0, out: 0, count: 0 };
    bsCpMap[cp].count++;
    if (t.direction === "out") bsCpMap[cp].out += t.amount || 0;
    else bsCpMap[cp].in += t.amount || 0;
  }

  const bsSorted = Object.entries(bsCpMap).sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out));
  const bsAddrs: string[] = [];
  for (const [addr, info] of bsSorted) {
    console.log(`  ${addr.slice(0, 12)}... out=${info.out.toFixed(2)} in=${info.in.toFixed(2)} txs=${info.count}`);
    bsAddrs.push(addr);
  }

  if (bsAddrs.length > 0) {
    console.log(`\n--- Batch identity on ${bsAddrs.length} Bitstamp counterparties ---`);
    const batchRes = await fetch(`${HELIUS_API}/v1/wallet/batch-identity?api-key=${HELIUS_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresses: bsAddrs }),
    });
    if (batchRes.ok) {
      const batch = await batchRes.json();
      console.log(`Identified: ${batch.length}`);
      for (const item of batch) {
        console.log(`  ${item.address} — ${item.name} (${item.category})`);
      }
    }
  }
}

main().catch(console.error);
