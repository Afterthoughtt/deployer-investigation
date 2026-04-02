import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");
const rawDir = join(dataDir, "results", "raw");
mkdirSync(rawDir, { recursive: true });

const HELIUS_KEY = process.env.HELIUS_API_KEY!;
const NANSEN_KEY = process.env.NANSEN_API_KEY!;

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const HELIUS_API = `https://api.helius.xyz`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MP1 = "Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6";

// Known network addresses for tagging
const networkMap = JSON.parse(readFileSync(join(dataDir, "network-map.json"), "utf-8"));
const KNOWN: Record<string, string> = {};
for (const [k, v] of Object.entries(networkMap.deployers || {})) KNOWN[v as string] = `${k} Deployer`;
for (const [k, v] of Object.entries(networkMap.infrastructure || {})) { const a = (v as any).address || v; if (typeof a === "string") KNOWN[a] = k; }
for (const [k, v] of Object.entries(networkMap.bundle_wallets || {})) KNOWN[v as string] = k;
for (const [k, v] of Object.entries(networkMap.profit_routing || {})) { const a = (v as any).address || v; if (typeof a === "string") KNOWN[a] = k; }
for (const [k, v] of Object.entries(networkMap.side_projects || {})) { const a = (v as any).address || v; if (typeof a === "string") KNOWN[a] = k; }
const cb = networkMap.onramp_hot_wallets?.coinbase || {};
for (const [k, v] of Object.entries(cb)) { if (k !== "notes" && typeof v === "string") KNOWN[v] = `Coinbase ${k}`; }

async function rpcCall(method: string, params: unknown[]) {
  const res = await fetch(HELIUS_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} ${res.status}`);
  const json = (await res.json()) as any;
  if (json.error) throw new Error(`RPC ${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function heliusTransfers(address: string, limit = 100, cursor?: string) {
  let url = `${HELIUS_API}/v1/wallet/${address}/transfers?api-key=${HELIUS_KEY}&limit=${limit}`;
  if (cursor) url += `&cursor=${cursor}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`transfers ${res.status}`);
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

async function nansenCounterparties(address: string, dateFrom: string, dateTo: string) {
  const res = await fetch("https://api.nansen.ai/api/v1/profiler/address/counterparties", {
    method: "POST",
    headers: { "Content-Type": "application/json", apiKey: NANSEN_KEY },
    body: JSON.stringify({
      address, chain: "solana",
      date: { from: dateFrom, to: dateTo },
      group_by: "wallet", source_input: "Combined",
      pagination: { page: 1, per_page: 50 },
      order_by: [{ field: "total_volume_usd", direction: "DESC" }],
    }),
  });
  if (!res.ok) throw new Error(`Nansen counterparties ${res.status}: ${await res.text()}`);
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

const SOL_MINT = "So11111111111111111111111111111111111111111";

async function main() {
  console.log("=== MoonPay Hot Wallet Cluster Mapping ===");
  console.log(`Starting from MP1: ${MP1}\n`);

  const results: any = { mp1: MP1, helius: {}, nansen: {}, discovered_moonpay_wallets: [] };

  // Step 1: Get MP1 transfers (pages of 100) — look for high-volume counterparties
  // that could be other MoonPay hot wallets
  console.log("--- Step 1: Helius transfers for MP1 (2 pages) ---");
  const allTransfers: any[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 2; page++) {
    console.log(`  Page ${page + 1}...`);
    const result = await heliusTransfers(MP1, 100, cursor);
    results.helius[`transfers_page_${page + 1}`] = result;
    const data = result.data || [];
    allTransfers.push(...data);
    if (!result.pagination?.hasMore) break;
    cursor = result.pagination?.nextCursor;
    await sleep(150);
  }
  console.log(`  Total transfers fetched: ${allTransfers.length}`);

  // Aggregate counterparties from transfers
  const cpMap: Record<string, { in: number; out: number; count: number; solOnly: boolean }> = {};
  for (const t of allTransfers) {
    const cp = t.counterparty;
    if (!cp) continue;
    if (!cpMap[cp]) cpMap[cp] = { in: 0, out: 0, count: 0, solOnly: true };
    cpMap[cp].count++;
    const isSol = t.mint === SOL_MINT || !t.mint;
    if (!isSol) cpMap[cp].solOnly = false;
    if (t.direction === "out") cpMap[cp].out += t.amount || 0;
    else cpMap[cp].in += t.amount || 0;
  }

  // Sort by volume (SOL amount), find addresses MP1 sends SOL to (these are customers/recipients)
  // MoonPay hot wallets would RECEIVE from users paying fiat, and SEND SOL to customers
  // So outflows from MP1 = customer deliveries. Inflows to MP1 = other MoonPay wallets or recycling
  const sorted = Object.entries(cpMap)
    .sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out))
    .slice(0, 40);

  console.log(`\n  Top 40 counterparties by volume:`);
  for (const [addr, info] of sorted) {
    const tag = KNOWN[addr] ? `[KNOWN: ${KNOWN[addr]}]` : "[?]";
    console.log(`  ${addr.slice(0, 12)}... ${tag} in=${info.in.toFixed(2)} out=${info.out.toFixed(2)} txs=${info.count} solOnly=${info.solOnly}`);
  }

  // Step 2: Collect unique addresses that have high SOL volume with MP1
  // MoonPay hot wallets would have bidirectional high volume or send large amounts TO MP1
  const candidateAddrs = sorted
    .map(([addr]) => addr)
    .filter(a => !KNOWN[a]); // exclude known network

  // Step 3: Batch identity check on candidates (100 credits for up to 100 addresses)
  console.log(`\n--- Step 2: Helius batch-identity on ${candidateAddrs.length} candidates ---`);
  const batchResult = await heliusBatchIdentity(candidateAddrs);
  results.helius.batchIdentity = batchResult;

  const identifiedMoonPay: any[] = [];
  const otherIdentified: any[] = [];
  for (const item of batchResult) {
    if (item.name?.toLowerCase().includes("moonpay") || item.category?.toLowerCase().includes("moonpay")) {
      identifiedMoonPay.push(item);
      console.log(`  MOONPAY FOUND: ${item.address} — ${item.name} (${item.category})`);
    } else if (item.name) {
      otherIdentified.push(item);
      console.log(`  Other: ${item.address?.slice(0, 12)} — ${item.name} (${item.category})`);
    }
  }

  // Step 4: Nansen related wallets for MP1
  console.log(`\n--- Step 3: Nansen related wallets for MP1 ---`);
  await sleep(2000);
  try {
    results.nansen.relatedWallets = await nansenRelatedWallets(MP1);
    const rw = results.nansen.relatedWallets?.data || [];
    console.log(`  Related wallets: ${rw.length}`);
    for (const w of rw) {
      const isMoonPay = w.address_label?.toLowerCase().includes("moonpay");
      console.log(`  ${w.address} — ${w.address_label || "unlabeled"} (${w.relation})${isMoonPay ? " *** MOONPAY ***" : ""}`);
      if (isMoonPay) identifiedMoonPay.push({ address: w.address, name: w.address_label, source: "nansen_related" });
    }
  } catch (e: any) { console.log(`  Error: ${e.message}`); }

  // Step 5: Nansen counterparties for MP1 (last 4 months)
  console.log(`\n--- Step 4: Nansen counterparties for MP1 ---`);
  await sleep(2000);
  try {
    results.nansen.counterparties = await nansenCounterparties(MP1, "2025-11-01", "2026-03-25");
    const cpList = results.nansen.counterparties?.data || [];
    console.log(`  Counterparties: ${cpList.length} (is_last_page: ${results.nansen.counterparties?.is_last_page})`);
    for (const c of cpList) {
      const isMoonPay = c.counterparty_address_label?.toLowerCase().includes("moonpay");
      const isKnown = KNOWN[c.counterparty_address];
      const tag = isKnown ? `[KNOWN: ${isKnown}]` : isMoonPay ? "*** MOONPAY ***" : `[${c.counterparty_address_label || "?"}]`;
      console.log(`  ${c.counterparty_address?.slice(0, 12)}... ${tag} vol=$${c.total_volume_usd?.toFixed(0)} in=$${c.volume_in_usd?.toFixed(0)} out=$${c.volume_out_usd?.toFixed(0)} txs=${c.interaction_count}`);
      if (isMoonPay && !identifiedMoonPay.find((m: any) => m.address === c.counterparty_address)) {
        identifiedMoonPay.push({ address: c.counterparty_address, name: c.counterparty_address_label, source: "nansen_counterparties" });
      }
    }
  } catch (e: any) { console.log(`  Error: ${e.message}`); }

  // Step 6: If we found MoonPay wallets, batch-identity them for confirmation
  if (identifiedMoonPay.length > 0) {
    const mpAddrs = identifiedMoonPay.map((m: any) => m.address).filter(Boolean);
    console.log(`\n--- Step 5: Verify ${mpAddrs.length} MoonPay candidates via batch-identity ---`);
    if (mpAddrs.length > 0) {
      const verifyResult = await heliusBatchIdentity(mpAddrs);
      results.helius.moonpayVerification = verifyResult;
      for (const item of verifyResult) {
        console.log(`  ${item.address} — ${item.name} (${item.category})`);
      }
    }
  }

  results.discovered_moonpay_wallets = identifiedMoonPay;

  // Save
  const outPath = join(rawDir, "moonpay-cluster-mapping.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nSaved raw results to ${outPath}`);

  // Summary
  console.log(`\n\n=== SUMMARY ===`);
  console.log(`MoonPay wallets discovered: ${identifiedMoonPay.length}`);
  for (const m of identifiedMoonPay) {
    console.log(`  ${m.address} — ${m.name} (source: ${m.source || "helius"})`);
  }
  console.log(`Other identified entities: ${otherIdentified.length}`);
  for (const o of otherIdentified) {
    console.log(`  ${o.address?.slice(0, 12)} — ${o.name} (${o.category})`);
  }

  // Check which network wallets MP1 sends SOL to (deployer-relevant outflows)
  console.log(`\nNetwork wallets in MP1 transfers:`);
  for (const [addr, info] of sorted) {
    if (KNOWN[addr]) {
      console.log(`  ${addr.slice(0, 12)}... [${KNOWN[addr]}] out=${info.out.toFixed(2)} SOL, in=${info.in.toFixed(2)} SOL, txs=${info.count}`);
    }
  }
}

main().catch(console.error);
