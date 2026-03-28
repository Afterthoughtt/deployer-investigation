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
const ARKHAM_KEY = process.env.ARKAN_API_KEY!;

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const HELIUS_API = `https://api.helius.xyz`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const networkMap = JSON.parse(readFileSync(join(dataDir, "network-map.json"), "utf-8"));
const KNOWN: Record<string, string> = {};
for (const [k, v] of Object.entries(networkMap.deployers || {})) KNOWN[v as string] = `${k} Deployer`;
for (const [k, v] of Object.entries(networkMap.infrastructure || {})) { const a = (v as any).address || v; if (typeof a === "string") KNOWN[a] = k; }
for (const [k, v] of Object.entries(networkMap.bundle_wallets || {})) KNOWN[v as string] = k;
for (const [k, v] of Object.entries(networkMap.profit_routing || {})) { const a = (v as any).address || v; if (typeof a === "string") KNOWN[a] = k; }
for (const [k, v] of Object.entries(networkMap.side_projects || {})) { const a = (v as any).address || v; if (typeof a === "string") KNOWN[a] = k; }
for (const [k, v] of Object.entries(networkMap.profit_cashout || {})) { const a = (v as any).address; if (a) KNOWN[a] = k; }
for (const [k, v] of Object.entries(networkMap.network_connected || {})) { const a = (v as any).address; if (a) KNOWN[a] = k; }
for (const [k, v] of Object.entries(networkMap.extras || {})) { const a = (v as any).address; if (a) KNOWN[a] = k; }
for (const [k, v] of Object.entries(networkMap.monitoring || {})) { const a = (v as any).address; if (a) KNOWN[a] = k; }
const cb = networkMap.onramp_hot_wallets?.coinbase || {};
for (const [k, v] of Object.entries(cb)) { if (k !== "notes" && typeof v === "string") KNOWN[v] = `Coinbase ${k}`; }
const mp = networkMap.onramp_hot_wallets?.moonpay || {};
for (const [k, v] of Object.entries(mp)) { if (k !== "notes") { const a = typeof v === "string" ? v : (v as any).address; if (a) KNOWN[a] = `MoonPay ${k}`; } }
if (networkMap.insiders?.coinspot_insider) {
  const cs = networkMap.insiders.coinspot_insider;
  if (cs.trading_wallet) KNOWN[cs.trading_wallet] = "CoinSpot Insider Trading";
  if (cs.token_trading_wallet?.address) KNOWN[cs.token_trading_wallet.address] = "CoinSpot Token Wallet";
  if (cs.collection?.address) KNOWN[cs.collection.address] = "CoinSpot Insider Collection";
  if (cs.connected_susye_deployer?.address) KNOWN[cs.connected_susye_deployer.address] = "SUSYE Deployer";
}
if (networkMap.insiders?.blofin_insider) {
  KNOWN[networkMap.insiders.blofin_insider.hub] = "BloFin Insider Hub";
  if (networkMap.insiders.blofin_insider.blofin_passthrough?.address)
    KNOWN[networkMap.insiders.blofin_insider.blofin_passthrough.address] = "BloFin Passthrough";
}
// Add BqP79Wmk network
KNOWN["BqP79WmkKFRytsrWCqY2ra4n5XzUxQjTf45rHy7rkgtC"] = "BqP79Wmk (deployer trading?)";
KNOWN["231fshU82vSSeyytyCZJUEUG8Ti3UAgnDSoNFGTETCuK"] = "GoonPump (BqP79Wmk funder)";

const SOL_MINT = "So11111111111111111111111111111111111111111";

function tag(addr: string, apiLabel?: string | null): string {
  if (KNOWN[addr]) return `[KNOWN: ${KNOWN[addr]}]`;
  if (apiLabel) return `[API: ${apiLabel}]`;
  return "[UNKNOWN]";
}

// --- API helpers ---
async function rpcCall(method: string, params: unknown[]) {
  const res = await fetch(HELIUS_RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const json = (await res.json()) as any;
  if (json.error) throw new Error(`RPC ${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}
async function getBalance(a: string) { return (await rpcCall("getBalance", [a])).value / 1e9; }
async function getSignatures(a: string, limit = 100) { return rpcCall("getSignaturesForAddress", [a, { limit }]); }
async function heliusFundedBy(a: string) { const r = await fetch(`${HELIUS_API}/v1/wallet/${a}/funded-by?api-key=${HELIUS_KEY}`); if (r.status === 404) return null; if (!r.ok) throw new Error(`funded-by ${r.status}`); return r.json(); }
async function heliusIdentity(a: string) { const r = await fetch(`${HELIUS_API}/v1/wallet/${a}/identity?api-key=${HELIUS_KEY}`); if (r.status === 404) return null; if (!r.ok) throw new Error(`identity ${r.status}`); return r.json(); }
async function heliusTransfers(a: string, limit = 100) { const r = await fetch(`${HELIUS_API}/v1/wallet/${a}/transfers?api-key=${HELIUS_KEY}&limit=${limit}`); if (!r.ok) throw new Error(`transfers ${r.status}`); return r.json(); }

async function nansenCounterparties(address: string, dateFrom: string, dateTo: string) {
  const res = await fetch("https://api.nansen.ai/api/v1/profiler/address/counterparties", {
    method: "POST", headers: { "Content-Type": "application/json", apiKey: NANSEN_KEY },
    body: JSON.stringify({ address, chain: "solana", date: { from: dateFrom, to: dateTo }, group_by: "wallet", source_input: "Combined", pagination: { page: 1, per_page: 50 }, order_by: [{ field: "total_volume_usd", direction: "DESC" }] }),
  });
  if (!res.ok) throw new Error(`Nansen counterparties ${res.status}: ${await res.text()}`);
  return res.json();
}
async function nansenRelatedWallets(a: string) {
  const res = await fetch("https://api.nansen.ai/api/v1/profiler/address/related-wallets", {
    method: "POST", headers: { "Content-Type": "application/json", apiKey: NANSEN_KEY },
    body: JSON.stringify({ address: a, chain: "solana" }),
  });
  if (!res.ok) throw new Error(`Nansen related ${res.status}: ${await res.text()}`);
  return res.json();
}
async function arkhamIntelligence(a: string) { const r = await fetch(`https://api.arkm.com/intelligence/address/${a}`, { headers: { "API-Key": ARKHAM_KEY } }); if (r.status === 404) return null; if (!r.ok) throw new Error(`Arkham ${r.status}`); return r.json(); }
async function arkhamTransfers(a: string, limit = "50") { const r = await fetch(`https://api.arkm.com/transfers?base=${a}&chain=solana&limit=${limit}`, { headers: { "API-Key": ARKHAM_KEY } }); if (!r.ok) throw new Error(`Arkham xfers ${r.status}`); return r.json(); }

// --- Targets ---
const TARGETS = [
  {
    id: "goonpump_funder",
    address: "231fshU82vSSeyytyCZJUEUG8Ti3UAgnDSoNFGTETCuK",
    context: "GoonPump Token Deployer. First funder of BqP79Wmk. Funded by MoonPay MP1. If this connects back to deployer network, BqP79Wmk is deployer's personal trading wallet.",
  },
  {
    id: "cashout_FKjuwJzH",
    address: "FKjuwJzHn4hqSfarMMsKjzsNUzEuWzzDM4ZcqJzuATqu",
    context: "BqP79Wmk sends $5.1K here (11 txs). Crypto.com Deposit (Arkham). Prior address FKjuwJzHJYAh... was TRANSCRIPTION ERROR.",
  },
];

async function profileWallet(id: string, address: string, context: string) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`TARGET: ${id}`);
  console.log(`Address: ${address}`);
  console.log(`Context: ${context}`);
  console.log("=".repeat(70));

  const result: any = { id, address, context, helius: {}, nansen: {}, arkham: {} };

  // Helius
  console.log("\n--- Helius ---");
  try { result.helius.balance = await getBalance(address); console.log(`Balance: ${result.helius.balance} SOL`); } catch (e: any) { console.log(`Balance: ${e.message}`); }
  try {
    const sigs = await getSignatures(address);
    result.helius.signatures = sigs;
    if (sigs.length > 0) {
      console.log(`Sigs: ${sigs.length} (newest: ${new Date(sigs[0].blockTime * 1000).toISOString()}, oldest: ${new Date(sigs[sigs.length - 1].blockTime * 1000).toISOString()})`);
    } else console.log("Sigs: 0");
  } catch (e: any) { console.log(`Sigs: ${e.message}`); }

  try {
    const id2 = await heliusIdentity(address);
    result.helius.identity = id2;
    if (id2) console.log(`Identity: ${id2.name} (${id2.category})`);
    else console.log("Identity: not found");
  } catch (e: any) { console.log(`Identity: ${e.message}`); }

  try {
    const fb = await heliusFundedBy(address);
    result.helius.fundedBy = fb;
    if (fb) {
      const t = tag(fb.funder, fb.funderName);
      console.log(`Funded-by: ${fb.funder} ${t} — ${fb.funderName || "?"} (${fb.funderType || "?"}) ${fb.amount} SOL ${fb.date}`);
    } else console.log("Funded-by: 404");
  } catch (e: any) { console.log(`Funded-by: ${e.message}`); }

  // Helius transfers
  console.log("\n--- Helius transfers ---");
  try {
    const xfers = await heliusTransfers(address);
    result.helius.transfers = xfers;
    const data = xfers.data || [];
    console.log(`Transfers: ${data.length} (hasMore: ${xfers.pagination?.hasMore})`);

    const cpMap: Record<string, { in: number; out: number; count: number; symbols: Set<string> }> = {};
    for (const t of data) {
      const cp = t.counterparty; if (!cp) continue;
      if (!cpMap[cp]) cpMap[cp] = { in: 0, out: 0, count: 0, symbols: new Set() };
      cpMap[cp].count++;
      cpMap[cp].symbols.add(t.symbol || (t.mint === SOL_MINT ? "SOL" : "TOKEN"));
      if (t.direction === "in") cpMap[cp].in += t.amount || 0;
      else cpMap[cp].out += t.amount || 0;
    }
    const sorted = Object.entries(cpMap).sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out)).slice(0, 25);
    let netCount = 0;
    for (const [addr, info] of sorted) {
      const t = tag(addr);
      if (t.includes("KNOWN")) netCount++;
      console.log(`  ${addr.slice(0, 8)}... ${t} in=${info.in.toFixed(4)} out=${info.out.toFixed(4)} txs=${info.count} (${Array.from(info.symbols).join(",")})`);
    }
    console.log(`Network connections: ${netCount}`);
  } catch (e: any) { console.log(`Transfers: ${e.message}`); }

  // Nansen
  console.log("\n--- Nansen related ---");
  await sleep(2000);
  try {
    result.nansen.related = await nansenRelatedWallets(address);
    const rw = result.nansen.related?.data || [];
    console.log(`Related: ${rw.length}`);
    for (const w of rw) console.log(`  ${w.address} ${tag(w.address, w.address_label)} relation=${w.relation}`);
  } catch (e: any) { console.log(`Related: ${e.message}`); }

  console.log("\n--- Nansen counterparties ---");
  await sleep(2000);
  try {
    result.nansen.counterparties = await nansenCounterparties(address, "2025-01-01", "2026-03-25");
    const cp = result.nansen.counterparties;
    const items = cp.data || [];
    console.log(`Counterparties: ${items.length} (is_last_page: ${cp.is_last_page})`);
    let netCount = 0;
    for (const c of items) {
      const t = tag(c.counterparty_address, c.counterparty_address_label);
      if (t.includes("KNOWN")) netCount++;
      console.log(`  ${c.counterparty_address?.slice(0, 8)}... ${t} vol=$${c.total_volume_usd?.toFixed(0)} in=$${c.volume_in_usd?.toFixed(0)} out=$${c.volume_out_usd?.toFixed(0)} txs=${c.interaction_count}`);
    }
    console.log(`Network connections: ${netCount}`);
  } catch (e: any) { console.log(`Counterparties: ${e.message}`); }

  // Arkham
  console.log("\n--- Arkham ---");
  try {
    const ai = await arkhamIntelligence(address);
    result.arkham.intelligence = ai;
    if (ai) {
      const entity = ai.arkhamEntity;
      if (entity) console.log(`Arkham entity: ${entity.name} (${entity.type})`);
      if (ai.arkhamLabel) console.log(`Arkham label: ${ai.arkhamLabel.name}`);
      console.log(`Keys: ${Object.keys(ai).join(", ")}`);
    } else console.log("Arkham: not found");
  } catch (e: any) { console.log(`Arkham: ${e.message}`); }

  await sleep(1100);
  try {
    result.arkham.transfers = await arkhamTransfers(address);
    const xfers = result.arkham.transfers?.transfers || [];
    console.log(`Arkham transfers: ${xfers.length}`);
    for (const x of xfers.slice(0, 15)) {
      const from = x.fromAddress?.arkhamEntity?.name || x.fromAddress?.address?.slice(0, 8);
      const to = x.toAddress?.arkhamEntity?.name || x.toAddress?.address?.slice(0, 8);
      console.log(`  ${from} → ${to}: ${x.unitValue?.toFixed(4)} ${x.tokenSymbol || "SOL"} ($${x.historicalUSD?.toFixed(0) || "?"})`);
    }
  } catch (e: any) { console.log(`Arkham transfers: ${e.message}`); }

  // L2 funder if unknown
  const fb = result.helius.fundedBy;
  if (fb && fb.funder && !KNOWN[fb.funder]) {
    console.log(`\n--- L2 funder: ${fb.funder.slice(0, 8)}... ---`);
    try {
      const l2b = await getBalance(fb.funder);
      const l2i = await heliusIdentity(fb.funder);
      const l2f = await heliusFundedBy(fb.funder);
      result.helius.l2_funder = { address: fb.funder, balance: l2b, identity: l2i, fundedBy: l2f };
      console.log(`L2 Balance: ${l2b} SOL`);
      if (l2i) console.log(`L2 Identity: ${l2i.name} (${l2i.category})`);
      if (l2f) console.log(`L2 Funded-by: ${l2f.funder} ${tag(l2f.funder, l2f.funderName)} — ${l2f.funderName || "?"}`);
    } catch (e: any) { console.log(`L2: ${e.message}`); }
  }

  return result;
}

async function main() {
  console.log("=== Deep Dive: BqP79Wmk Funder + Cashout ===\n");
  const results: any[] = [];

  for (const t of TARGETS) {
    const r = await profileWallet(t.id, t.address, t.context);
    results.push(r);
    await sleep(500);
  }

  const outPath = join(rawDir, "bqp79wmk-deep-dive.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n\nSaved to ${outPath}`);

  // Summary
  console.log("\n=== SUMMARY ===");
  for (const r of results) {
    console.log(`\n${r.id}:`);
    console.log(`  Balance: ${r.helius?.balance ?? "?"} SOL`);
    const fb = r.helius?.fundedBy;
    if (fb) console.log(`  Funded by: ${fb.funder?.slice(0, 8)}... ${tag(fb.funder, fb.funderName)}`);
    const cp = r.nansen?.counterparties?.data || [];
    const netCount = cp.filter((c: any) => KNOWN[c.counterparty_address]).length;
    console.log(`  Nansen counterparties: ${cp.length} (${netCount} network)`);
  }
}

main().catch(console.error);
