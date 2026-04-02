import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rawDir = join(__dirname, "..", "data", "results", "raw");
mkdirSync(rawDir, { recursive: true });

const HELIUS_KEY = process.env.HELIUS_API_KEY!;
const NANSEN_KEY = process.env.NANSEN_API_KEY!;

const HELIUS_API = `https://api.helius.xyz`;
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MP1 = "Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6";
const MP1_FUNDER = "AFKxebx96mnt1yn1ek6mcxeGDHmfrAWzo2h1fVdrrvWE"; // Nansen: "High Balance"

async function rpcCall(method: string, params: unknown[]) {
  const res = await fetch(HELIUS_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as any;
  if (json.error) throw new Error(`RPC ${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function heliusFundedBy(address: string) {
  const res = await fetch(`${HELIUS_API}/v1/wallet/${address}/funded-by?api-key=${HELIUS_KEY}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`funded-by ${res.status}`);
  return res.json();
}

async function heliusIdentity(address: string) {
  const res = await fetch(`${HELIUS_API}/v1/wallet/${address}/identity?api-key=${HELIUS_KEY}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`identity ${res.status}`);
  return res.json();
}

async function heliusBatchIdentity(addresses: string[]) {
  const res = await fetch(`${HELIUS_API}/v1/wallet/batch-identity?api-key=${HELIUS_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addresses }),
  });
  if (!res.ok) throw new Error(`batch-identity ${res.status}`);
  return res.json();
}

async function heliusTransfers(address: string, limit = 100) {
  const res = await fetch(`${HELIUS_API}/v1/wallet/${address}/transfers?api-key=${HELIUS_KEY}&limit=${limit}`);
  if (!res.ok) throw new Error(`transfers ${res.status}`);
  return res.json();
}

async function nansenSearchEntity(query: string) {
  const res = await fetch("https://api.nansen.ai/api/v1/search/entity-name", {
    method: "POST",
    headers: { "Content-Type": "application/json", apiKey: NANSEN_KEY },
    body: JSON.stringify({ search_query: query }),
  });
  if (!res.ok) throw new Error(`Nansen search ${res.status}: ${await res.text()}`);
  return res.json();
}

async function nansenCurrentBalance(address: string) {
  const res = await fetch("https://api.nansen.ai/api/v1/profiler/address/current-balance", {
    method: "POST",
    headers: { "Content-Type": "application/json", apiKey: NANSEN_KEY },
    body: JSON.stringify({ address, chain: "solana", hide_spam_token: true }),
  });
  if (!res.ok) throw new Error(`Nansen balance ${res.status}: ${await res.text()}`);
  return res.json();
}

async function nansenRelatedWallets(address: string) {
  const res = await fetch("https://api.nansen.ai/api/v1/profiler/address/related-wallets", {
    method: "POST",
    headers: { "Content-Type": "application/json", apiKey: NANSEN_KEY },
    body: JSON.stringify({ address, chain: "solana" }),
  });
  if (!res.ok) throw new Error(`Nansen related ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log("=== MoonPay Cluster Mapping v2 ===\n");
  const results: any = {};

  // 1. Search Nansen for "MoonPay" entity (FREE — 0 credits)
  console.log("--- Nansen entity search: 'MoonPay' ---");
  try {
    results.nansenSearch = await nansenSearchEntity("MoonPay");
    const entities = results.nansenSearch?.data || results.nansenSearch || [];
    console.log(`Found ${Array.isArray(entities) ? entities.length : "?"} entities:`);
    if (Array.isArray(entities)) {
      for (const e of entities) console.log(`  ${JSON.stringify(e)}`);
    } else {
      console.log(`  ${JSON.stringify(entities)}`);
    }
  } catch (e: any) { console.log(`Error: ${e.message}`); }

  // 2. Check MP1 funder (AFKxebx9)
  console.log("\n--- MP1 Funder: AFKxebx9 ---");
  try {
    const balance = (await rpcCall("getBalance", [MP1_FUNDER])).value / 1e9;
    results.mp1Funder = { address: MP1_FUNDER, balance };
    console.log(`Balance: ${balance} SOL`);

    const identity = await heliusIdentity(MP1_FUNDER);
    results.mp1Funder.identity = identity;
    if (identity) console.log(`Identity: ${identity.name} (${identity.category})`);
    else console.log("Identity: not found");

    const fundedBy = await heliusFundedBy(MP1_FUNDER);
    results.mp1Funder.fundedBy = fundedBy;
    if (fundedBy) console.log(`Funded-by: ${fundedBy.funder} — ${fundedBy.funderName || "unknown"} (${fundedBy.funderType || "unknown"})`);
    else console.log("Funded-by: not found");
  } catch (e: any) { console.log(`Error: ${e.message}`); }

  // 3. Get MP1 funder transfers to find other MoonPay hot wallets it funds
  console.log("\n--- MP1 Funder transfers ---");
  await sleep(150);
  try {
    const transfers = await heliusTransfers(MP1_FUNDER);
    results.mp1FunderTransfers = transfers;
    const data = transfers.data || [];
    console.log(`Transfers: ${data.length}`);

    // Aggregate outflows — these could be other MoonPay hot wallets
    const outflows: Record<string, { amount: number; count: number }> = {};
    for (const t of data) {
      if (t.direction === "out" && t.counterparty) {
        if (!outflows[t.counterparty]) outflows[t.counterparty] = { amount: 0, count: 0 };
        outflows[t.counterparty].amount += t.amount || 0;
        outflows[t.counterparty].count++;
      }
    }

    const sortedOut = Object.entries(outflows).sort((a, b) => b[1].amount - a[1].amount).slice(0, 30);
    console.log(`\nTop outflow recipients from MP1 funder:`);
    const candidateAddrs: string[] = [];
    for (const [addr, info] of sortedOut) {
      console.log(`  ${addr.slice(0, 12)}... out=${info.amount.toFixed(2)} SOL, txs=${info.count}`);
      candidateAddrs.push(addr);
    }

    // Batch identity on these — any MoonPay?
    if (candidateAddrs.length > 0) {
      console.log(`\n  Batch-identity on ${candidateAddrs.length} recipients...`);
      const batchResult = await heliusBatchIdentity(candidateAddrs);
      results.funderBatchIdentity = batchResult;
      if (batchResult.length === 0) {
        console.log("  No identities found");
      }
      for (const item of batchResult) {
        console.log(`  ${item.address?.slice(0, 12)} — ${item.name} (${item.category})`);
      }
    }
  } catch (e: any) { console.log(`Error: ${e.message}`); }

  // 4. Check Nansen related wallets for MP1 funder
  console.log("\n--- Nansen related wallets for MP1 funder ---");
  await sleep(2000);
  try {
    const related = await nansenRelatedWallets(MP1_FUNDER);
    results.mp1FunderRelated = related;
    const wallets = related?.data || [];
    console.log(`Related wallets: ${wallets.length}`);
    for (const w of wallets) {
      const isMoonPay = w.address_label?.toLowerCase().includes("moonpay");
      console.log(`  ${w.address} — ${w.address_label || "unlabeled"} (${w.relation})${isMoonPay ? " *** MOONPAY ***" : ""}`);
    }
  } catch (e: any) { console.log(`Error: ${e.message}`); }

  // 5. Check Helius identity directly for MP1 (confirm it's labeled)
  console.log("\n--- Helius identity for MP1 ---");
  try {
    const mp1Id = await heliusIdentity(MP1);
    results.mp1Identity = mp1Id;
    if (mp1Id) console.log(`MP1 Identity: ${mp1Id.name} (${mp1Id.category})`);
    else console.log("MP1 Identity: not found in Helius");
  } catch (e: any) { console.log(`Error: ${e.message}`); }

  // 6. Also try: search for known MoonPay addresses on other chains
  // MoonPay uses different hot wallets. Let's check if Nansen entity search gives us Solana-specific results
  console.log("\n--- Nansen entity search: 'moonpay' (lowercase) ---");
  await sleep(2000);
  try {
    const search2 = await nansenSearchEntity("moonpay");
    results.nansenSearch2 = search2;
    const entities = search2?.data || search2 || [];
    console.log(`Found ${Array.isArray(entities) ? entities.length : "?"} entities`);
    if (Array.isArray(entities)) {
      for (const e of entities) console.log(`  ${JSON.stringify(e)}`);
    }
  } catch (e: any) { console.log(`Error: ${e.message}`); }

  // Save
  const outPath = join(rawDir, "moonpay-cluster-v2.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nSaved to ${outPath}`);
}

main().catch(console.error);
