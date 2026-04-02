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
  if (typeof cs.collection === "object" && cs.collection?.address) KNOWN[cs.collection.address] = "CoinSpot Insider Collection";
  else if (typeof cs.collection === "string") KNOWN[cs.collection] = "CoinSpot Insider Collection";
  if (typeof cs.connected_susye_deployer === "object" && cs.connected_susye_deployer?.address) KNOWN[cs.connected_susye_deployer.address] = "SUSYE Deployer";
  else if (typeof cs.connected_susye_deployer === "string") KNOWN[cs.connected_susye_deployer] = "SUSYE Deployer";
}
if (networkMap.insiders?.blofin_insider) {
  const bl = networkMap.insiders.blofin_insider;
  if (bl.hub) KNOWN[typeof bl.hub === "string" ? bl.hub : bl.hub] = "BloFin Insider Hub";
  if (typeof bl.blofin_passthrough === "object" && bl.blofin_passthrough?.address) KNOWN[bl.blofin_passthrough.address] = "BloFin Passthrough";
  else if (typeof bl.blofin_passthrough === "string") KNOWN[bl.blofin_passthrough] = "BloFin Passthrough";
}
// Add key addresses we're investigating
KNOWN["BDVgXauNbs7AQEqgPich2hUANu6oLf9VQEuXqL2q3Q5a"] = "BloFin Insider Hub (zougz)";
KNOWN["AobVSwdW9BbpMdJvTqeCN4hPAmh4rHm7vwLnQ5ATSyrS"] = "Crypto.com Hot Wallet 1";
KNOWN["CSEncqtqbmNRjve42sNnbs5cCSmrjUNsAEwc17XY2RCs"] = "CoinSpot Exchange";

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
  // === QUESTION 1: Are CJVEFd/9J9VHo zougz's wallets or just associates? ===
  {
    address: "CJVEFdRSSPp9788dJ2zQZrL6GFWERsYaaYkTKqFxUPf6",
    label: "CJVEFd_recurring",
    context: "Recurring early buyer: L2, L3, L6, L7 (position #1 at L6). $11.8K counterparty of BloFin hub (zougz). Nansen: BloomBot Trading Bot User. KEY QUESTION: funded by Crypto.com (= zougz) or different exchange?",
  },
  {
    address: "9J9VHoLWgTRxuc6DtNYxRMi2jVqAFAPshUSMeWQ7wz3Y",
    label: "9J9VHo_recurring",
    context: "Recurring early buyer: L1, L2, L3, L6, L7 (position #4). $17.4K counterparty of BloFin hub (zougz). Nansen: BloomBot Trading Bot User. KEY QUESTION: funded by Crypto.com (= zougz) or different exchange?",
  },
  // === QUESTION 2: CoinSpot insider deeper investigation ===
  {
    address: "98KvdqZJcwXSx2mxV1itXxWnWM5Ziuu5bsw4KKqvZhX7",
    label: "coinspot_intermediary_98KvdqZJ",
    context: "SUSYE deployer's primary intermediary. $12K volume with SUSYE deployer (bidirectional). Also $494 to CoinSpot collection. WHO IS THIS?",
  },
  {
    address: "F7oLGB1UbFWBhKWHY1n3GTAMhW91oVoCWfNtsG5XLEGc",
    label: "coinspot_receiver_F7oLGB1U",
    context: "Receives $5.2K SOL from CoinSpot token wallet (4916Nkdu). Where does this money go?",
  },
];

async function investigate(target: typeof TARGETS[number]) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`TARGET: ${target.label}`);
  console.log(`Address: ${target.address}`);
  console.log(`Context: ${target.context}`);
  console.log("=".repeat(70));

  const result: any = {
    label: target.label,
    address: target.address,
    helius: {} as any,
    nansen: {} as any,
    arkham: {} as any,
    network_connections: [] as string[],
    unknown_counterparties: [] as any[],
    errors: [] as string[],
  };

  // === HELIUS ===
  console.log("\n--- HELIUS ---");

  try {
    const bal = await getBalance(target.address);
    result.helius.balance_sol = bal;
    console.log(`[Balance] ${bal.toFixed(6)} SOL`);
  } catch (e: any) { console.log(`[Balance] ERROR: ${e.message}`); result.errors.push(`balance: ${e.message}`); }

  try {
    const id = await heliusIdentity(target.address);
    result.helius.identity = id;
    if ((id as any).notFound || (id as any).type === "unknown") console.log(`[Identity] Unknown`);
    else console.log(`[Identity] ${(id as any).name} | ${(id as any).category} | Tags: ${JSON.stringify((id as any).tags)}`);
  } catch (e: any) { console.log(`[Identity] ERROR: ${e.message}`); result.errors.push(`identity: ${e.message}`); }
  await sleep(120);

  try {
    const fb = await heliusFundedBy(target.address);
    result.helius.funded_by = fb;
    if ((fb as any).notFound) {
      console.log(`[Funded-by] Not found (404)`);
    } else {
      const funder = (fb as any).funder || "?";
      const t = tag(funder);
      console.log(`[Funded-by] ${funder} ${t}`);
      console.log(`  Name: ${(fb as any).funderName || "?"} | Type: ${(fb as any).funderType || "?"} | Amount: ${(fb as any).amount} SOL | Date: ${(fb as any).date}`);
      if (KNOWN[funder]) result.network_connections.push(`First funder: ${KNOWN[funder]} (${funder.slice(0, 8)})`);
    }
  } catch (e: any) { console.log(`[Funded-by] ERROR: ${e.message}`); result.errors.push(`funded_by: ${e.message}`); }
  await sleep(120);

  try {
    const sigs = await getSignatures(target.address, 100);
    result.helius.signature_count = sigs?.length || 0;
    if (Array.isArray(sigs) && sigs.length > 0) {
      const latest = new Date(sigs[0].blockTime * 1000).toISOString();
      const oldest = new Date(sigs[sigs.length - 1].blockTime * 1000).toISOString();
      result.helius.latest_activity = latest;
      result.helius.oldest_in_batch = oldest;
      console.log(`[Signatures] ${sigs.length} sigs | Latest: ${latest} | Oldest: ${oldest}`);
    } else console.log(`[Signatures] None`);
  } catch (e: any) { console.log(`[Signatures] ERROR: ${e.message}`); result.errors.push(`signatures: ${e.message}`); }
  await sleep(120);

  try {
    const transfers = await heliusTransfers(target.address, 100);
    const data = (transfers as any)?.data;
    result.helius.transfers = transfers;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`[Transfers] ${data.length} transfers:`);
      for (const t of data) {
        const dir = t.direction === "in" ? "IN " : "OUT";
        const cp = t.counterparty || "?";
        const cpTag = tag(cp);
        const sym = t.symbol || (t.mint === "So11111111111111111111111111111111111111111" ? "SOL" : "TOKEN");
        const amt = typeof t.amount === "number" ? t.amount.toFixed(4) : t.amount;
        const ts = t.timestamp ? new Date(t.timestamp * 1000).toISOString().slice(0, 19) : "?";
        console.log(`  ${ts} ${dir} ${cp.slice(0, 16)}... ${cpTag} | ${amt} ${sym}`);
        if (KNOWN[cp]) result.network_connections.push(`Transfer ${t.direction}: ${KNOWN[cp]} (${amt} ${sym})`);
      }
    } else console.log(`[Transfers] None`);
  } catch (e: any) { console.log(`[Transfers] ERROR: ${e.message}`); result.errors.push(`transfers: ${e.message}`); }

  // === NANSEN ===
  console.log("\n--- NANSEN ---");
  await sleep(2000);

  try {
    const rw = await nansenRelatedWallets(target.address);
    result.nansen.related_wallets = rw;
    const data = (rw as any)?.data;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`[Related] ${data.length} related wallet(s):`);
      for (const r of data) {
        const t = tag(r.address, r.address_label);
        console.log(`  ${r.address?.slice(0, 16)}... ${t} — ${r.relation}`);
        if (KNOWN[r.address]) result.network_connections.push(`Nansen related: ${KNOWN[r.address]} (${r.relation})`);
      }
    } else console.log(`[Related] None`);
  } catch (e: any) { console.log(`[Related] ERROR: ${e.message}`); result.errors.push(`nansen_related: ${e.message}`); }
  await sleep(2000);

  try {
    const cp = await nansenCounterparties(target.address, "2025-01-01", "2026-03-25");
    result.nansen.counterparties = cp;
    const data = (cp as any)?.data;
    const pagination = (cp as any)?.pagination;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`[Counterparties] ${data.length} counterparties (page 1, is_last_page: ${pagination?.is_last_page ?? "?"}):`);
      for (const c of data) {
        const addr = c.counterparty_address || "?";
        const label = c.counterparty_address_label || null;
        const t = tag(addr, label);
        const vol = c.total_volume_usd?.toLocaleString() || "?";
        const inflow = c.volume_in_usd?.toLocaleString() || "0";
        const outflow = c.volume_out_usd?.toLocaleString() || "0";
        console.log(`  ${addr.slice(0, 16)}... ${t} | vol=$${vol} | in=$${inflow} out=$${outflow} | ${c.interaction_count} txs`);
        if (KNOWN[addr]) {
          result.network_connections.push(`Counterparty: ${KNOWN[addr]} — $${vol} (in=$${inflow}, out=$${outflow})`);
        } else if (!label?.includes("Pump.fun") && !label?.includes("Bonding Curve") && !label?.includes("Liquidity Pool") && !label?.includes("Raydium")) {
          result.unknown_counterparties.push({
            address: addr, label: label || null,
            total_volume_usd: c.total_volume_usd,
            volume_in_usd: c.volume_in_usd, volume_out_usd: c.volume_out_usd,
            interaction_count: c.interaction_count,
          });
        }
      }
    } else console.log(`[Counterparties] None`);
  } catch (e: any) { console.log(`[Counterparties] ERROR: ${e.message}`); result.errors.push(`nansen_counterparties: ${e.message}`); }
  await sleep(2000);

  // === ARKHAM ===
  console.log("\n--- ARKHAM ---");

  try {
    const intel = await arkhamIntelligence(target.address);
    result.arkham.intelligence = intel;
    const entity = (intel as any)?.arkhamEntity;
    const label = (intel as any)?.arkhamLabel;
    if ((intel as any).notFound) console.log(`[Intelligence] Not found`);
    else if (entity) console.log(`[Intelligence] Entity: ${entity.name} (${entity.type})`);
    else if (label?.name) console.log(`[Intelligence] Label: ${label.name}`);
    else console.log(`[Intelligence] No entity/label`);
  } catch (e: any) { console.log(`[Intelligence] ERROR: ${e.message}`); result.errors.push(`arkham_intel: ${e.message}`); }
  await sleep(100);

  try {
    const transfers = await arkhamTransfers(target.address, "50");
    result.arkham.transfers = transfers;
    const data = (transfers as any)?.transfers;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`[Transfers] ${data.length} transfers:`);
      for (const t of data.slice(0, 30)) {
        const fromAddr = t.fromAddress?.address || "?";
        const toAddr = t.toAddress?.address || "?";
        const fromName = t.fromAddress?.arkhamEntity?.name || KNOWN[fromAddr] || fromAddr.slice(0, 12);
        const toName = t.toAddress?.arkhamEntity?.name || KNOWN[toAddr] || toAddr.slice(0, 12);
        const val = t.unitValue ? `${Number(t.unitValue).toFixed(4)} ${t.tokenSymbol || "SOL"}` : "?";
        const usd = t.historicalUSD ? `$${Number(t.historicalUSD).toFixed(2)}` : "";
        console.log(`  ${(t.blockTimestamp || "?").slice(0, 19)} | ${fromName} → ${toName} | ${val} ${usd}`);
        if (KNOWN[fromAddr] && fromAddr !== target.address) result.network_connections.push(`Arkham: receives from ${KNOWN[fromAddr]}`);
        if (KNOWN[toAddr] && toAddr !== target.address) result.network_connections.push(`Arkham: sends to ${KNOWN[toAddr]}`);
      }
    } else console.log(`[Transfers] None`);
  } catch (e: any) { console.log(`[Transfers] ERROR: ${e.message}`); result.errors.push(`arkham_transfers: ${e.message}`); }

  // === SUMMARY ===
  result.network_connections = [...new Set(result.network_connections)];
  console.log(`\n--- VERDICT: ${target.label} ---`);
  console.log(`Balance: ${result.helius.balance_sol ?? "?"} SOL`);
  console.log(`Sigs: ${result.helius.signature_count || 0} | Active: ${result.helius.oldest_in_batch?.slice(0, 10) || "?"} to ${result.helius.latest_activity?.slice(0, 10) || "?"}`);
  console.log(`Network connections (${result.network_connections.length}):`);
  for (const c of result.network_connections) console.log(`  - ${c}`);
  console.log(`Unknown counterparties: ${result.unknown_counterparties.length}`);
  for (const u of result.unknown_counterparties.slice(0, 10)) {
    console.log(`  - ${u.address.slice(0, 16)}... ${u.label || "unlabeled"} | vol=$${u.total_volume_usd?.toLocaleString()}`);
  }

  return result;
}

// === Layer 2: Trace funding chain up to 3 levels ===
async function traceFundingChain(startAddr: string, label: string, maxDepth = 3) {
  console.log(`\n${"#".repeat(70)}`);
  console.log(`FUNDING CHAIN TRACE for ${label}`);
  console.log(`Starting: ${startAddr}`);
  console.log("#".repeat(70));

  const chain: any[] = [];
  let currentAddr = startAddr;

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (KNOWN[currentAddr] && (
      KNOWN[currentAddr].includes("Coinbase") ||
      KNOWN[currentAddr].includes("MoonPay") ||
      KNOWN[currentAddr].includes("Crypto.com") ||
      KNOWN[currentAddr].includes("CoinSpot") ||
      KNOWN[currentAddr].includes("Binance")
    )) {
      console.log(`  L${depth}: ${currentAddr.slice(0, 16)}... ${tag(currentAddr)} — EXCHANGE ENDPOINT. Chain complete.`);
      chain.push({ depth, address: currentAddr, tag: KNOWN[currentAddr], is_exchange: true });
      break;
    }

    const step: any = { depth, address: currentAddr };

    // Balance
    try {
      step.balance = await getBalance(currentAddr);
    } catch { step.balance = "error"; }

    // Identity
    try {
      const id = await heliusIdentity(currentAddr);
      if (!(id as any).notFound && (id as any).type !== "unknown") {
        step.helius_identity = `${(id as any).name} | ${(id as any).category}`;
        console.log(`  L${depth}: ${currentAddr.slice(0, 16)}... [Helius: ${step.helius_identity}] | ${step.balance} SOL`);
        if ((id as any).category === "Centralized Exchange" || (id as any).name?.includes("Hot Wallet")) {
          step.is_exchange = true;
          chain.push(step);
          console.log(`  → EXCHANGE ENDPOINT. Chain complete.`);
          break;
        }
      }
    } catch { /* ignore */ }
    await sleep(120);

    // Funded-by
    try {
      const fb = await heliusFundedBy(currentAddr);
      if ((fb as any).notFound) {
        step.funded_by = "404";
        console.log(`  L${depth}: ${currentAddr.slice(0, 16)}... ${tag(currentAddr)} | ${step.balance} SOL | funded-by: 404`);
        chain.push(step);
        break;
      }
      step.funded_by = (fb as any).funder;
      step.funder_name = (fb as any).funderName;
      step.funder_type = (fb as any).funderType;
      step.funding_amount = (fb as any).amount;
      step.funding_date = (fb as any).date;
      console.log(`  L${depth}: ${currentAddr.slice(0, 16)}... ${tag(currentAddr)} | ${step.balance} SOL | funded by: ${step.funded_by?.slice(0, 16)}... ${tag(step.funded_by)} | ${step.funder_name || "?"} | ${step.funding_amount} SOL | ${step.funding_date}`);
      chain.push(step);

      if (step.funder_type === "Centralized Exchange") {
        console.log(`  → EXCHANGE FUNDER (${step.funder_name}). Chain complete.`);
        chain.push({ depth: depth + 1, address: step.funded_by, is_exchange: true, name: step.funder_name, type: step.funder_type });
        break;
      }

      currentAddr = step.funded_by;
    } catch (e: any) {
      step.error = e.message;
      chain.push(step);
      break;
    }
    await sleep(120);

    // Arkham on intermediate wallets
    try {
      const intel = await arkhamIntelligence(currentAddr);
      const entity = (intel as any)?.arkhamEntity;
      if (entity) {
        console.log(`  → Arkham: ${entity.name} (${entity.type})`);
        if (entity.type === "cex") {
          chain.push({ depth: depth + 1, address: currentAddr, arkham: `${entity.name} (${entity.type})`, is_exchange: true });
          console.log(`  → EXCHANGE (Arkham). Chain complete.`);
          break;
        }
      }
    } catch { /* ignore */ }
    await sleep(100);
  }

  console.log(`\nFunding chain summary (${chain.length} steps):`);
  for (const s of chain) {
    const addr = s.address?.slice(0, 16) || "?";
    const name = s.name || s.helius_identity || s.arkham || KNOWN[s.address] || "unknown";
    console.log(`  [L${s.depth}] ${addr}... | ${name} ${s.is_exchange ? "*** EXCHANGE ***" : ""}`);
  }

  return chain;
}

async function main() {
  console.log("=== RECURRING WALLETS + COINSPOT DEEP DIVE ===");
  console.log(`Targets: ${TARGETS.length}`);
  console.log(`Plus funding chain traces for CJVEFd and 9J9VHo\n`);

  const allResults: any[] = [];
  const fundingChains: Record<string, any[]> = {};

  for (const t of TARGETS) {
    const result = await investigate(t);
    allResults.push(result);

    // For CJVEFd and 9J9VHo, also trace the full funding chain
    if (t.label.includes("recurring")) {
      const funder = result.helius?.funded_by?.funder;
      if (funder && !(result.helius.funded_by as any).notFound) {
        await sleep(2000);
        const chain = await traceFundingChain(funder, `${t.label} funder`, 4);
        fundingChains[t.label] = chain;
      }
    }

    // For CoinSpot intermediary, trace funding chain too
    if (t.label.includes("coinspot_intermediary")) {
      const funder = result.helius?.funded_by?.funder;
      if (funder && !(result.helius.funded_by as any).notFound) {
        await sleep(2000);
        const chain = await traceFundingChain(funder, `${t.label} funder`, 3);
        fundingChains[t.label] = chain;
      }
    }

    await sleep(3000);
  }

  const output = {
    metadata: {
      run_at: new Date().toISOString(),
      targets: TARGETS.length,
      funding_chains: Object.keys(fundingChains).length,
      questions: [
        "Q1: Are CJVEFd/9J9VHo zougz's wallets (Crypto.com funded) or associates (different exchange)?",
        "Q2: How deep is the CoinSpot insider's connection to the deployer network?"
      ],
    },
    layer1_results: allResults,
    funding_chains: fundingChains,
  };

  const outputPath = join(rawDir, "recurring-coinspot-deep-dive.json");
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n${"=".repeat(70)}`);
  console.log(`Results saved to: ${outputPath}`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
