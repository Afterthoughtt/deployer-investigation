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
  if (cs.collection) { const a = typeof cs.collection === "object" ? cs.collection.address : cs.collection; if (a) KNOWN[a] = "CoinSpot Insider Collection"; }
  if (cs.connected_susye_deployer) { const a = typeof cs.connected_susye_deployer === "object" ? cs.connected_susye_deployer.address : cs.connected_susye_deployer; if (a) KNOWN[a] = "SUSYE Deployer"; }
}
if (networkMap.insiders?.blofin_insider) {
  const bl = networkMap.insiders.blofin_insider;
  if (bl.hub) KNOWN[bl.hub] = "BloFin Insider Hub";
  if (bl.blofin_passthrough) { const a = typeof bl.blofin_passthrough === "object" ? bl.blofin_passthrough.address : bl.blofin_passthrough; if (a) KNOWN[a] = "BloFin Passthrough"; }
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
  // Side projects
  {
    address: "52eC8Uy5CDSJhRao7RgFfBASsmePEJP7dGbUQa9gNJeW",
    label: "jetnut_deployer",
    context: "Side project deployer. Different from l9_funder (52eC8Uy5eFkw). Funded L9 via separate wallet.",
  },
  {
    address: "FSbvLdrK1FuWJSNVfyguDQgvt93Zk92KnGxxSHoFjAyE",
    label: "jetnut_network",
    context: "JETNUT network wallet. Sends $2.7K to BR1HiYtc (Coinbase Deposit 2), receives $814 from routes_binance.",
  },
  {
    address: "DuCzGNzSorXNgWKbx6koWTjd4P1AQaZHrNAdQu6NWmR8",
    label: "eggsheeran",
    context: "Side project. First funder of BR1HiYtc (Coinbase Deposit 2). Sends $4.8K to cold_usdc_2, $1.8K to coinbase_deposit, $1.2K to collection. Nansen: 'eggsheeran Token Deployer'.",
  },
  // CoinSpot insider
  {
    address: "DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn",
    label: "coinspot_insider_trading",
    context: "CoinSpot insider primary trading wallet. Bought L10 1 second after deploy ($11.8K). Uses BloomBot.",
  },
  {
    address: "9a22FhBeMJq4nuuvBRCsW67vAwPdLUN8eGJwykaUf7TH",
    label: "coinspot_insider_collection",
    context: "CoinSpot insider collection wallet. Receives profits from trading wallet.",
  },
  {
    address: "2Zizao3xpJGsoUFdvTJjYL8LijtFxR9v36cNBeDJJVSz",
    label: "susye_deployer",
    context: "Connected to CoinSpot insider. SUSYE token deployer. Check if deployer-network related or independent.",
  },
  // BloFin insider
  {
    address: "BDVgXauNbs7AQEqgPich2hUANu6oLf9VQEuXqL2q3Q5a",
    label: "blofin_insider_hub",
    context: "BloFin insider hub wallet. Historically positions #5-10. Separate network from main deployer?",
  },
  {
    address: "33KoLeWrpGXNGXCcnMbexfhyk9hJRMk5dU78dMyWTc9A",
    label: "blofin_passthrough",
    context: "BloFin insider passthrough wallet. Connected to blofin_insider_hub.",
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

  // Balance (1 cr)
  try {
    const bal = await getBalance(target.address);
    result.helius.balance_sol = bal;
    console.log(`[Balance] ${bal.toFixed(6)} SOL`);
  } catch (e: any) {
    console.log(`[Balance] ERROR: ${e.message}`);
    result.errors.push(`balance: ${e.message}`);
  }

  // Identity (100 cr)
  try {
    const id = await heliusIdentity(target.address);
    result.helius.identity = id;
    if ((id as any).notFound || (id as any).type === "unknown") {
      console.log(`[Identity] Unknown`);
    } else {
      console.log(`[Identity] ${(id as any).name} | ${(id as any).category} | Tags: ${JSON.stringify((id as any).tags)}`);
    }
  } catch (e: any) {
    console.log(`[Identity] ERROR: ${e.message}`);
    result.errors.push(`identity: ${e.message}`);
  }
  await sleep(120);

  // Funded-by (100 cr)
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
  } catch (e: any) {
    console.log(`[Funded-by] ERROR: ${e.message}`);
    result.errors.push(`funded_by: ${e.message}`);
  }
  await sleep(120);

  // Signatures (10 cr)
  try {
    const sigs = await getSignatures(target.address, 100);
    result.helius.signature_count = sigs?.length || 0;
    if (Array.isArray(sigs) && sigs.length > 0) {
      const latest = new Date(sigs[0].blockTime * 1000).toISOString();
      const oldest = new Date(sigs[sigs.length - 1].blockTime * 1000).toISOString();
      result.helius.latest_activity = latest;
      result.helius.oldest_in_batch = oldest;
      console.log(`[Signatures] ${sigs.length} sigs | Latest: ${latest} | Oldest: ${oldest}`);
    } else {
      console.log(`[Signatures] None (closed account?)`);
    }
  } catch (e: any) {
    console.log(`[Signatures] ERROR: ${e.message}`);
    result.errors.push(`signatures: ${e.message}`);
  }
  await sleep(120);

  // Transfers (100 cr)
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
        if (KNOWN[cp]) {
          result.network_connections.push(`Transfer ${t.direction}: ${KNOWN[cp]} (${amt} ${sym})`);
        }
      }
    } else {
      console.log(`[Transfers] None`);
    }
  } catch (e: any) {
    console.log(`[Transfers] ERROR: ${e.message}`);
    result.errors.push(`transfers: ${e.message}`);
  }

  // === NANSEN ===
  console.log("\n--- NANSEN ---");
  await sleep(2000);

  // Related wallets (1 cr)
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
    } else {
      console.log(`[Related] None`);
    }
  } catch (e: any) {
    console.log(`[Related] ERROR: ${e.message}`);
    result.errors.push(`nansen_related: ${e.message}`);
  }
  await sleep(2000);

  // Counterparties (5 cr)
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
            address: addr,
            label: label || null,
            total_volume_usd: c.total_volume_usd,
            volume_in_usd: c.volume_in_usd,
            volume_out_usd: c.volume_out_usd,
            interaction_count: c.interaction_count,
          });
        }
      }
    } else {
      console.log(`[Counterparties] None`);
    }
  } catch (e: any) {
    console.log(`[Counterparties] ERROR: ${e.message}`);
    result.errors.push(`nansen_counterparties: ${e.message}`);
  }
  await sleep(2000);

  // === ARKHAM ===
  console.log("\n--- ARKHAM ---");

  // Intelligence
  try {
    const intel = await arkhamIntelligence(target.address);
    result.arkham.intelligence = intel;
    const entity = (intel as any)?.arkhamEntity;
    const label = (intel as any)?.arkhamLabel;
    if ((intel as any).notFound) {
      console.log(`[Intelligence] Not found`);
    } else if (entity) {
      console.log(`[Intelligence] Entity: ${entity.name} (${entity.type})`);
    } else if (label?.name) {
      console.log(`[Intelligence] Label: ${label.name}`);
    } else {
      console.log(`[Intelligence] No entity/label`);
    }
  } catch (e: any) {
    console.log(`[Intelligence] ERROR: ${e.message}`);
    result.errors.push(`arkham_intel: ${e.message}`);
  }
  await sleep(100);

  // Transfers
  try {
    const transfers = await arkhamTransfers(target.address, "50");
    result.arkham.transfers = transfers;
    const data = (transfers as any)?.transfers;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`[Transfers] ${data.length} transfers:`);
      for (const t of data.slice(0, 25)) {
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
    } else {
      console.log(`[Transfers] None`);
    }
  } catch (e: any) {
    console.log(`[Transfers] ERROR: ${e.message}`);
    result.errors.push(`arkham_transfers: ${e.message}`);
  }

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

// === Layer 2: Investigate unknown funders ===
async function investigateFunder(funderAddr: string, parentLabel: string) {
  console.log(`\n${"#".repeat(70)}`);
  console.log(`LAYER 2 — Funder of ${parentLabel}`);
  console.log(`Address: ${funderAddr}`);
  console.log("#".repeat(70));

  const result: any = {
    address: funderAddr,
    parent: parentLabel,
    layer: 2,
    helius: {} as any,
    arkham: {} as any,
    network_connections: [] as string[],
    errors: [] as string[],
  };

  // Balance (1 cr)
  try {
    const bal = await getBalance(funderAddr);
    result.helius.balance_sol = bal;
    console.log(`[Balance] ${bal.toFixed(6)} SOL`);
  } catch (e: any) { result.errors.push(`balance: ${e.message}`); }

  // Identity (100 cr)
  try {
    const id = await heliusIdentity(funderAddr);
    result.helius.identity = id;
    if (!(id as any).notFound && (id as any).type !== "unknown") {
      console.log(`[Identity] ${(id as any).name} | ${(id as any).category}`);
    } else { console.log(`[Identity] Unknown`); }
  } catch (e: any) { result.errors.push(`identity: ${e.message}`); }
  await sleep(120);

  // Funded-by (100 cr)
  try {
    const fb = await heliusFundedBy(funderAddr);
    result.helius.funded_by = fb;
    if (!(fb as any).notFound) {
      const f = (fb as any).funder || "?";
      console.log(`[Funded-by] ${f} ${tag(f)} | ${(fb as any).funderName || "?"} | ${(fb as any).amount} SOL`);
      if (KNOWN[f]) result.network_connections.push(`Funded by: ${KNOWN[f]}`);
    } else { console.log(`[Funded-by] 404`); }
  } catch (e: any) { result.errors.push(`funded_by: ${e.message}`); }
  await sleep(120);

  // Arkham intel
  try {
    const intel = await arkhamIntelligence(funderAddr);
    result.arkham.intelligence = intel;
    const entity = (intel as any)?.arkhamEntity;
    if (entity) console.log(`[Arkham] ${entity.name} (${entity.type})`);
    else console.log(`[Arkham] No entity`);
  } catch (e: any) { result.errors.push(`arkham: ${e.message}`); }

  result.network_connections = [...new Set(result.network_connections)];
  console.log(`L2 Network connections: ${result.network_connections.length}`);
  for (const c of result.network_connections) console.log(`  - ${c}`);

  return result;
}

async function main() {
  console.log("=== SIDE PROJECT & INSIDER WALLET PROFILING ===");
  console.log(`Targets: ${TARGETS.length}`);
  console.log(`Credit estimate per target: ~311 Helius (balance=1, identity=100, funded-by=100, sigs=10, transfers=100) + 6 Nansen (related=1, counterparties=5) + Arkham free`);
  console.log(`Total estimate: ~${TARGETS.length * 311} Helius + ${TARGETS.length * 6} Nansen\n`);

  const allResults: any[] = [];
  const funderResults: any[] = [];

  for (const t of TARGETS) {
    const result = await investigate(t);
    allResults.push(result);

    // Layer 2: If funder is unknown, investigate
    const funder = result.helius?.funded_by?.funder;
    if (funder && !KNOWN[funder] && !(result.helius.funded_by as any).notFound) {
      await sleep(2000);
      const funderResult = await investigateFunder(funder, t.label);
      funderResults.push(funderResult);
    }

    await sleep(3000);
  }

  const output = {
    metadata: {
      run_at: new Date().toISOString(),
      targets: TARGETS.length,
      layer2_investigations: funderResults.length,
    },
    layer1_results: allResults,
    layer2_results: funderResults,
  };

  const outputPath = join(rawDir, "side-projects-insiders-profiles.json");
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n${"=".repeat(70)}`);
  console.log(`Results saved to: ${outputPath}`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
