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

// Build known network from network-map.json
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
  else if (typeof cs.collection === "string") KNOWN[cs.collection] = "CoinSpot Insider Collection";
  if (cs.connected_susye_deployer?.address) KNOWN[cs.connected_susye_deployer.address] = "SUSYE Deployer";
  else if (typeof cs.connected_susye_deployer === "string") KNOWN[cs.connected_susye_deployer] = "SUSYE Deployer";
}
if (networkMap.insiders?.blofin_insider) {
  const bl = networkMap.insiders.blofin_insider;
  if (bl.hub) KNOWN[bl.hub] = "BloFin Insider Hub";
  if (bl.blofin_passthrough?.address) KNOWN[bl.blofin_passthrough.address] = "BloFin Passthrough";
}

function tag(addr: string, apiLabel?: string | null): string {
  if (KNOWN[addr]) return `[KNOWN: ${KNOWN[addr]}]`;
  if (apiLabel) return `[API: ${apiLabel}]`;
  return "[UNKNOWN]";
}

// --- Helius ---
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

async function getBalance(address: string): Promise<number> {
  return (await rpcCall("getBalance", [address])).value / 1e9;
}

async function getSignatures(address: string, limit = 100) {
  return rpcCall("getSignaturesForAddress", [address, { limit }]);
}

async function heliusFundedBy(address: string) {
  const res = await fetch(`${HELIUS_API}/v1/wallet/${address}/funded-by?api-key=${HELIUS_KEY}`);
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error(`funded-by ${res.status}`);
  return res.json();
}

async function heliusIdentity(address: string) {
  const res = await fetch(`${HELIUS_API}/v1/wallet/${address}/identity?api-key=${HELIUS_KEY}`);
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error(`identity ${res.status}`);
  return res.json();
}

async function heliusTransfers(address: string, limit = 100) {
  const res = await fetch(`${HELIUS_API}/v1/wallet/${address}/transfers?api-key=${HELIUS_KEY}&limit=${limit}`);
  if (!res.ok) throw new Error(`transfers ${res.status}`);
  return res.json();
}

// --- Nansen ---
async function nansenRelatedWallets(address: string) {
  const res = await fetch("https://api.nansen.ai/api/v1/profiler/address/related-wallets", {
    method: "POST",
    headers: { "Content-Type": "application/json", apiKey: NANSEN_KEY },
    body: JSON.stringify({ address, chain: "solana" }),
  });
  if (!res.ok) {
    if (res.status === 429) return { rateLimited: true };
    throw new Error(`Nansen related ${res.status}: ${await res.text()}`);
  }
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

// --- Arkham ---
async function arkhamIntelligence(address: string) {
  const res = await fetch(`https://api.arkm.com/intelligence/address/${address}`, {
    headers: { "API-Key": ARKHAM_KEY },
  });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error(`Arkham intel ${res.status}`);
  return res.json();
}

async function arkhamTransfers(address: string, limit = "50") {
  const res = await fetch(`https://api.arkm.com/transfers?base=${address}&chain=solana&limit=${limit}`, {
    headers: { "API-Key": ARKHAM_KEY },
  });
  if (!res.ok) throw new Error(`Arkham transfers ${res.status}`);
  return res.json();
}

// --- Targets ---
const TARGETS = [
  {
    address: "7RLD6F9SiFvtdqW4bYpy4m8D3mum7xVdZUSjzv1TWJaf",
    label: "fireblocks_7RLD6F9S",
    context: "Fireblocks Custody (Arkham). Receives $6.6K from cold_usdc_2 ($4K) + routes_binance ($2.6K). Outflows unknown — where does this SOL go?",
  },
  {
    address: "yNanvu8HynWMfirERTkx8SAPg2By6f2pmv4Sv4VBHK3",
    label: "yNanvu8H_usdc_recipient",
    context: "Receives $2,201 USDC from cold_usdc_2 (2 txs: $2200 + $1 USDC). Completely unknown.",
  },
  {
    address: "E2NnJHhcMhwrMT2qZDJicnGLFQZw44ceqTAcrqo8BA8F",
    label: "E2NnJHhc_og_counterparty",
    context: "Confirmed in OG deployer Nansen counterparties ($2.1K inflow, 37 transfers). Needs full profiling.",
  },
  {
    address: "chrisVmt4xpnsvGsKrkzW4a2Si6xTTixUpzsk99ixWR",
    label: "chrisV_recurring",
    context: "Recurring early buyer L8-L9, position #3 at L8. Last unresolved recurring wallet. Needs full profiling.",
  },
];

const SOL_MINT = "So11111111111111111111111111111111111111111";

async function investigate(target: typeof TARGETS[number]) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`TARGET: ${target.label}`);
  console.log(`Address: ${target.address}`);
  console.log(`Context: ${target.context}`);
  console.log("=".repeat(70));

  const result: any = {
    label: target.label,
    address: target.address,
    context: target.context,
    helius: {},
    nansen: {},
    arkham: {},
  };

  // --- Helius: balance + signatures (cheap: 1+10 credits) ---
  console.log("\n--- Helius: balance + signatures ---");
  try {
    result.helius.balance = await getBalance(target.address);
    console.log(`Balance: ${result.helius.balance} SOL`);
  } catch (e: any) { console.log(`Balance error: ${e.message}`); }

  try {
    const sigs = await getSignatures(target.address);
    result.helius.signatures = sigs;
    const count = sigs.length;
    if (count > 0) {
      const newest = new Date(sigs[0].blockTime * 1000).toISOString();
      const oldest = new Date(sigs[count - 1].blockTime * 1000).toISOString();
      console.log(`Signatures: ${count} (newest: ${newest}, oldest: ${oldest})`);
    } else {
      console.log("Signatures: 0 (no activity)");
    }
  } catch (e: any) { console.log(`Signatures error: ${e.message}`); }

  // --- Helius: identity + funded-by (100+100 credits) ---
  console.log("\n--- Helius: identity + funded-by ---");
  try {
    result.helius.identity = await heliusIdentity(target.address);
    const id = result.helius.identity;
    if (id.notFound) console.log("Identity: not found");
    else console.log(`Identity: ${id.name} (${id.category}) tags=${JSON.stringify(id.tags)}`);
  } catch (e: any) { console.log(`Identity error: ${e.message}`); }

  try {
    result.helius.fundedBy = await heliusFundedBy(target.address);
    const fb = result.helius.fundedBy;
    if (fb.notFound) {
      console.log("Funded-by: not found (404)");
    } else {
      const fTag = tag(fb.funder, fb.funderName);
      console.log(`Funded-by: ${fb.funder} ${fTag}`);
      console.log(`  Name: ${fb.funderName || "unknown"}, Type: ${fb.funderType || "unknown"}`);
      console.log(`  Amount: ${fb.amount} SOL, Date: ${fb.date}`);
    }
  } catch (e: any) { console.log(`Funded-by error: ${e.message}`); }

  // --- Helius: transfers (100 credits) ---
  console.log("\n--- Helius: transfers (last 100) ---");
  try {
    const transfers = await heliusTransfers(target.address);
    result.helius.transfers = transfers;
    const data = transfers.data || [];
    console.log(`Transfers: ${data.length} (hasMore: ${transfers.pagination?.hasMore})`);

    // Summarize counterparties
    const cpMap: Record<string, { in: number; out: number; count: number; symbols: Set<string> }> = {};
    for (const t of data) {
      const cp = t.counterparty;
      if (!cp) continue;
      if (!cpMap[cp]) cpMap[cp] = { in: 0, out: 0, count: 0, symbols: new Set() };
      cpMap[cp].count++;
      const sym = t.symbol || (t.mint === SOL_MINT ? "SOL" : "TOKEN");
      cpMap[cp].symbols.add(sym);
      if (t.direction === "in") cpMap[cp].in += t.amount || 0;
      else cpMap[cp].out += t.amount || 0;
    }

    const sorted = Object.entries(cpMap)
      .sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out))
      .slice(0, 20);

    let networkCount = 0;
    for (const [addr, info] of sorted) {
      const t = tag(addr);
      if (t.includes("KNOWN")) networkCount++;
      const symbols = Array.from(info.symbols).join(",");
      console.log(`  ${addr.slice(0, 8)}... ${t} in=${info.in.toFixed(4)} out=${info.out.toFixed(4)} txs=${info.count} (${symbols})`);
    }
    console.log(`Network connections in transfers: ${networkCount}`);
  } catch (e: any) { console.log(`Transfers error: ${e.message}`); }

  // --- Nansen: related wallets (1 credit) ---
  console.log("\n--- Nansen: related wallets ---");
  await sleep(2000);
  try {
    result.nansen.relatedWallets = await nansenRelatedWallets(target.address);
    const rw = result.nansen.relatedWallets;
    if (rw.rateLimited) {
      console.log("Related wallets: rate limited");
    } else {
      const wallets = rw.data || [];
      console.log(`Related wallets: ${wallets.length}`);
      for (const w of wallets) {
        const t = tag(w.address, w.address_label);
        console.log(`  ${w.address} ${t} relation=${w.relation}`);
      }
    }
  } catch (e: any) { console.log(`Related wallets error: ${e.message}`); }

  // --- Nansen: counterparties (5 credits) ---
  console.log("\n--- Nansen: counterparties ---");
  await sleep(2000);
  try {
    // Use wide date range to capture all activity
    result.nansen.counterparties = await nansenCounterparties(target.address, "2025-01-01", "2026-03-25");
    const cp = result.nansen.counterparties;
    const items = cp.data || [];
    console.log(`Counterparties: ${items.length} (is_last_page: ${cp.is_last_page})`);

    let networkCount = 0;
    for (const c of items) {
      const t = tag(c.counterparty_address, c.counterparty_address_label);
      if (t.includes("KNOWN")) networkCount++;
      console.log(`  ${c.counterparty_address?.slice(0, 8)}... ${t} vol=$${c.total_volume_usd?.toFixed(0)} in=$${c.volume_in_usd?.toFixed(0)} out=$${c.volume_out_usd?.toFixed(0)} txs=${c.interaction_count}`);
      if (c.tokens_info?.length > 0) {
        for (const tk of c.tokens_info.slice(0, 3)) {
          console.log(`    token: ${tk.token_symbol || tk.token_address?.slice(0, 8)} vol=$${tk.volume_usd?.toFixed(0)}`);
        }
      }
    }
    console.log(`Network connections in Nansen counterparties: ${networkCount}`);
  } catch (e: any) { console.log(`Counterparties error: ${e.message}`); }

  // --- Arkham: intelligence (free) ---
  console.log("\n--- Arkham: intelligence ---");
  try {
    result.arkham.intelligence = await arkhamIntelligence(target.address);
    const ai = result.arkham.intelligence;
    if (ai.notFound) {
      console.log("Arkham: not found");
    } else {
      const entity = ai.arkhamEntity || ai.entity;
      if (entity) {
        console.log(`Arkham entity: ${entity.name || "unnamed"} (type: ${entity.type || "unknown"})`);
        if (entity.tags) console.log(`  Tags: ${JSON.stringify(entity.tags)}`);
      }
      if (ai.arkhamLabel) console.log(`Arkham label: ${ai.arkhamLabel.name} (${ai.arkhamLabel.address})`);
      console.log(`Arkham raw keys: ${Object.keys(ai).join(", ")}`);
    }
  } catch (e: any) { console.log(`Arkham intelligence error: ${e.message}`); }

  // --- Arkham: transfers (free tier) ---
  console.log("\n--- Arkham: transfers ---");
  await sleep(1100);
  try {
    result.arkham.transfers = await arkhamTransfers(target.address, "50");
    const xfers = result.arkham.transfers?.transfers || [];
    console.log(`Arkham transfers: ${xfers.length}`);
    for (const x of xfers.slice(0, 10)) {
      const from = x.fromAddress?.arkhamEntity?.name || x.fromAddress?.address?.slice(0, 8);
      const to = x.toAddress?.arkhamEntity?.name || x.toAddress?.address?.slice(0, 8);
      const val = x.unitValue?.toFixed(4) || "?";
      const sym = x.tokenSymbol || "SOL";
      console.log(`  ${from} → ${to}: ${val} ${sym} ($${x.historicalUSD?.toFixed(0) || "?"})`);
    }
  } catch (e: any) { console.log(`Arkham transfers error: ${e.message}`); }

  // --- L2: funded-by chain (if funder is unknown) ---
  const fb = result.helius.fundedBy;
  if (fb && !fb.notFound && fb.funder && !KNOWN[fb.funder]) {
    console.log(`\n--- L2: Investigating funder ${fb.funder.slice(0, 8)}... ---`);
    try {
      const l2Balance = await getBalance(fb.funder);
      const l2Identity = await heliusIdentity(fb.funder);
      const l2FundedBy = await heliusFundedBy(fb.funder);
      result.helius.l2_funder = { address: fb.funder, balance: l2Balance, identity: l2Identity, fundedBy: l2FundedBy };

      console.log(`L2 Balance: ${l2Balance} SOL`);
      if (!l2Identity.notFound) console.log(`L2 Identity: ${l2Identity.name} (${l2Identity.category})`);
      if (!l2FundedBy.notFound) {
        const l2Tag = tag(l2FundedBy.funder, l2FundedBy.funderName);
        console.log(`L2 Funded-by: ${l2FundedBy.funder} ${l2Tag} (${l2FundedBy.funderName || "unknown"})`);
      }
    } catch (e: any) { console.log(`L2 error: ${e.message}`); }
  }

  return result;
}

async function main() {
  console.log("=== Profiling 4 Remaining Unknown Wallets ===");
  console.log(`Targets: ${TARGETS.map(t => t.label).join(", ")}`);
  console.log(`Known network addresses: ${Object.keys(KNOWN).length}`);
  console.log(`Estimated credit cost: ~1600 Helius + ~28 Nansen + Arkham free\n`);

  const results: any[] = [];

  for (const target of TARGETS) {
    try {
      const r = await investigate(target);
      results.push(r);
    } catch (e: any) {
      console.log(`\nFATAL ERROR for ${target.label}: ${e.message}`);
      results.push({ label: target.label, address: target.address, error: e.message });
    }
    await sleep(500);
  }

  // Save raw results
  const outPath = join(rawDir, "remaining-unknowns-profiles.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n\nSaved raw results to ${outPath}`);

  // Summary
  console.log("\n\n=== SUMMARY ===");
  for (const r of results) {
    console.log(`\n${r.label} (${r.address?.slice(0, 8)}...):`);
    if (r.error) { console.log(`  ERROR: ${r.error}`); continue; }
    console.log(`  Balance: ${r.helius?.balance ?? "?"} SOL`);
    const fb = r.helius?.fundedBy;
    if (fb && !fb.notFound) {
      const fTag = tag(fb.funder, fb.funderName);
      console.log(`  Funded by: ${fb.funder?.slice(0, 8)}... ${fTag}`);
    }
    const id = r.helius?.identity;
    if (id && !id.notFound) console.log(`  Helius ID: ${id.name} (${id.category})`);
    const ai = r.arkham?.intelligence;
    if (ai && !ai.notFound && ai.arkhamEntity) console.log(`  Arkham: ${ai.arkhamEntity.name} (${ai.arkhamEntity.type})`);
    const cp = r.nansen?.counterparties?.data || [];
    const netCount = cp.filter((c: any) => KNOWN[c.counterparty_address]).length;
    console.log(`  Nansen counterparties: ${cp.length} (${netCount} network)`);
  }
}

main().catch(console.error);
