import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rawDir = join(__dirname, "..", "data", "results", "raw");
mkdirSync(rawDir, { recursive: true });

const HELIUS_KEY = process.env.HELIUS_API_KEY!;
const NANSEN_KEY = process.env.NANSEN_API_KEY!;
const ARKHAM_KEY = process.env.ARKAN_API_KEY!;
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const HELIUS_API = `https://api.helius.xyz`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const networkMap = JSON.parse(readFileSync(join(__dirname, "..", "data", "network-map.json"), "utf-8"));
const KNOWN: Record<string, string> = {};
for (const [k, v] of Object.entries(networkMap.deployers || {})) KNOWN[v as string] = `${k} Deployer`;
for (const [k, v] of Object.entries(networkMap.infrastructure || {})) { const a = (v as any).address || v; if (typeof a === "string") KNOWN[a] = k; }
for (const [k, v] of Object.entries(networkMap.bundle_wallets || {})) KNOWN[v as string] = k;
for (const [k, v] of Object.entries(networkMap.profit_routing || {})) { const a = (v as any).address || v; if (typeof a === "string") KNOWN[a] = k; }
for (const [k, v] of Object.entries(networkMap.side_projects || {})) { const a = (v as any).address || v; if (typeof a === "string") KNOWN[a] = k; }
for (const [k, v] of Object.entries(networkMap.profit_cashout || {})) { const a = (v as any).address; if (a) KNOWN[a] = k; }
for (const [k, v] of Object.entries(networkMap.network_connected || {})) { const a = (v as any).address; if (a) KNOWN[a] = k; }
for (const [k, v] of Object.entries(networkMap.monitoring || {})) { const a = (v as any).address; if (a) KNOWN[a] = k; }
const cb = networkMap.onramp_hot_wallets?.coinbase || {};
for (const [k, v] of Object.entries(cb)) { if (k !== "notes" && typeof v === "string") KNOWN[v] = `Coinbase ${k}`; }
KNOWN["BqP79WmkKFRytsrWCqY2ra4n5XzUxQjTf45rHy7rkgtC"] = "BqP79Wmk (deployer trading)";
KNOWN["231fshU82vSSeyytyCZJUEUG8Ti3UAgnDSoNFGTETCuK"] = "GoonPump (BqP79Wmk funder)";

const SOL_MINT = "So11111111111111111111111111111111111111111";
function tag(addr: string, apiLabel?: string | null): string {
  if (KNOWN[addr]) return `[KNOWN: ${KNOWN[addr]}]`;
  if (apiLabel) return `[API: ${apiLabel}]`;
  return "[UNKNOWN]";
}

// CORRECT address from raw API data
const CORRECT_CASHOUT = "FKjuwJzHn4hqSfarMMsKjzsNUzEuWzzDM4ZcqJzuATqu";

async function main() {
  console.log("=== Profile CORRECT Cashout Address ===");
  console.log(`Address: ${CORRECT_CASHOUT}`);
  console.log(`(Previous address FKjuwJzHJYAh... was TRANSCRIPTION ERROR)\n`);

  const result: any = { address: CORRECT_CASHOUT, helius: {}, nansen: {}, arkham: {} };

  // Helius
  const balRes = await fetch(HELIUS_RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [CORRECT_CASHOUT] }) });
  const bal = (await balRes.json() as any).result?.value / 1e9;
  result.helius.balance = bal;
  console.log(`Balance: ${bal} SOL`);

  const sigRes = await fetch(HELIUS_RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [CORRECT_CASHOUT, { limit: 100 }] }) });
  const sigs = (await sigRes.json() as any).result || [];
  result.helius.signatures = sigs;
  if (sigs.length > 0) console.log(`Sigs: ${sigs.length} (newest: ${new Date(sigs[0].blockTime * 1000).toISOString()}, oldest: ${new Date(sigs[sigs.length - 1].blockTime * 1000).toISOString()})`);
  else console.log("Sigs: 0");

  const idRes = await fetch(`${HELIUS_API}/v1/wallet/${CORRECT_CASHOUT}/identity?api-key=${HELIUS_KEY}`);
  result.helius.identity = idRes.status === 404 ? null : await idRes.json();
  if (result.helius.identity) console.log(`Identity: ${result.helius.identity.name} (${result.helius.identity.category})`);
  else console.log("Identity: not found");

  const fbRes = await fetch(`${HELIUS_API}/v1/wallet/${CORRECT_CASHOUT}/funded-by?api-key=${HELIUS_KEY}`);
  result.helius.fundedBy = fbRes.status === 404 ? null : await fbRes.json();
  if (result.helius.fundedBy) {
    const fb = result.helius.fundedBy;
    console.log(`Funded-by: ${fb.funder} ${tag(fb.funder, fb.funderName)} — ${fb.funderName || "?"} ${fb.amount} SOL ${fb.date}`);
  } else console.log("Funded-by: 404");

  // Helius transfers
  const xfRes = await fetch(`${HELIUS_API}/v1/wallet/${CORRECT_CASHOUT}/transfers?api-key=${HELIUS_KEY}&limit=100`);
  const xfData = await xfRes.json();
  result.helius.transfers = xfData;
  const transfers = xfData.data || [];
  console.log(`\nTransfers: ${transfers.length} (hasMore: ${xfData.pagination?.hasMore})`);

  const cpMap: Record<string, { in: number; out: number; count: number; symbols: Set<string> }> = {};
  for (const t of transfers) {
    const cp = t.counterparty; if (!cp) continue;
    if (!cpMap[cp]) cpMap[cp] = { in: 0, out: 0, count: 0, symbols: new Set() };
    cpMap[cp].count++;
    cpMap[cp].symbols.add(t.symbol || (t.mint === SOL_MINT ? "SOL" : "TOKEN"));
    if (t.direction === "in") cpMap[cp].in += t.amount || 0;
    else cpMap[cp].out += t.amount || 0;
  }
  const sorted = Object.entries(cpMap).sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out)).slice(0, 20);
  let netCount = 0;
  for (const [addr, info] of sorted) {
    const t = tag(addr);
    if (t.includes("KNOWN")) netCount++;
    console.log(`  ${addr.slice(0, 8)}... ${t} in=${info.in.toFixed(4)} out=${info.out.toFixed(4)} txs=${info.count} (${Array.from(info.symbols).join(",")})`);
  }
  console.log(`Network connections: ${netCount}`);

  // Nansen
  console.log("\n--- Nansen related ---");
  await sleep(2000);
  try {
    const nrRes = await fetch("https://api.nansen.ai/api/v1/profiler/address/related-wallets", { method: "POST", headers: { "Content-Type": "application/json", apiKey: NANSEN_KEY }, body: JSON.stringify({ address: CORRECT_CASHOUT, chain: "solana" }) });
    result.nansen.related = await nrRes.json();
    const rw = result.nansen.related?.data || [];
    console.log(`Related: ${rw.length}`);
    for (const w of rw) console.log(`  ${w.address} ${tag(w.address, w.address_label)} relation=${w.relation}`);
  } catch (e: any) { console.log(`Error: ${e.message}`); }

  console.log("\n--- Nansen counterparties ---");
  await sleep(2000);
  try {
    const ncRes = await fetch("https://api.nansen.ai/api/v1/profiler/address/counterparties", {
      method: "POST", headers: { "Content-Type": "application/json", apiKey: NANSEN_KEY },
      body: JSON.stringify({ address: CORRECT_CASHOUT, chain: "solana", date: { from: "2025-01-01", to: "2026-03-25" }, group_by: "wallet", source_input: "Combined", pagination: { page: 1, per_page: 50 }, order_by: [{ field: "total_volume_usd", direction: "DESC" }] }),
    });
    result.nansen.counterparties = await ncRes.json();
    const items = result.nansen.counterparties?.data || [];
    console.log(`Counterparties: ${items.length}`);
    let nc = 0;
    for (const c of items) {
      const t = tag(c.counterparty_address, c.counterparty_address_label);
      if (t.includes("KNOWN")) nc++;
      console.log(`  ${c.counterparty_address?.slice(0, 8)}... ${t} vol=$${c.total_volume_usd?.toFixed(0)} in=$${c.volume_in_usd?.toFixed(0)} out=$${c.volume_out_usd?.toFixed(0)} txs=${c.interaction_count}`);
    }
    console.log(`Network connections: ${nc}`);
  } catch (e: any) { console.log(`Error: ${e.message}`); }

  // Arkham
  console.log("\n--- Arkham ---");
  try {
    const aiRes = await fetch(`https://api.arkm.com/intelligence/address/${CORRECT_CASHOUT}`, { headers: { "API-Key": ARKHAM_KEY } });
    result.arkham.intelligence = aiRes.status === 404 ? null : await aiRes.json();
    if (result.arkham.intelligence) {
      const ai = result.arkham.intelligence;
      if (ai.arkhamEntity) console.log(`Entity: ${ai.arkhamEntity.name} (${ai.arkhamEntity.type})`);
      if (ai.arkhamLabel) console.log(`Label: ${ai.arkhamLabel.name}`);
      console.log(`Keys: ${Object.keys(ai).join(", ")}`);
    }
  } catch (e: any) { console.log(`Error: ${e.message}`); }

  await sleep(1100);
  try {
    const atRes = await fetch(`https://api.arkm.com/transfers?base=${CORRECT_CASHOUT}&chain=solana&limit=50`, { headers: { "API-Key": ARKHAM_KEY } });
    const atData = await atRes.json();
    result.arkham.transfers = atData;
    const xfers = atData?.transfers || [];
    console.log(`Arkham transfers: ${xfers.length}`);
    for (const x of xfers.slice(0, 15)) {
      const from = x.fromAddress?.arkhamEntity?.name || x.fromAddress?.address?.slice(0, 8);
      const to = x.toAddress?.arkhamEntity?.name || x.toAddress?.address?.slice(0, 8);
      console.log(`  ${from} → ${to}: ${x.unitValue?.toFixed(4)} ${x.tokenSymbol || "SOL"} ($${x.historicalUSD?.toFixed(0) || "?"})`);
    }
  } catch (e: any) { console.log(`Error: ${e.message}`); }

  // L2 funder
  const fb = result.helius.fundedBy;
  if (fb && fb.funder && !KNOWN[fb.funder]) {
    console.log(`\n--- L2 funder: ${fb.funder.slice(0, 8)}... ---`);
    try {
      const l2bRes = await fetch(HELIUS_RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [fb.funder] }) });
      const l2bal = (await l2bRes.json() as any).result?.value / 1e9;
      const l2iRes = await fetch(`${HELIUS_API}/v1/wallet/${fb.funder}/identity?api-key=${HELIUS_KEY}`);
      const l2id = l2iRes.status === 404 ? null : await l2iRes.json();
      const l2fRes = await fetch(`${HELIUS_API}/v1/wallet/${fb.funder}/funded-by?api-key=${HELIUS_KEY}`);
      const l2fb = l2fRes.status === 404 ? null : await l2fRes.json();
      result.helius.l2_funder = { address: fb.funder, balance: l2bal, identity: l2id, fundedBy: l2fb };
      console.log(`L2 Balance: ${l2bal} SOL`);
      if (l2id) console.log(`L2 Identity: ${l2id.name} (${l2id.category})`);
      if (l2fb) console.log(`L2 Funded-by: ${l2fb.funder} ${tag(l2fb.funder, l2fb.funderName)}`);
    } catch (e: any) { console.log(`L2 error: ${e.message}`); }
  }

  const outPath = join(rawDir, "correct-cashout-profile.json");
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\nSaved to ${outPath}`);
}

main().catch(console.error);
