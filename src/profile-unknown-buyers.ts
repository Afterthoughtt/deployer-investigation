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

// --- Deployer Token CAs ---
const DEPLOYER_TOKENS: Record<string, string> = {
  "2rQcoMECcsU3UBNfpsUxegnHc9js7usb2XagwUK3pump": "L1_ArkXRP",
  "8mETm8mxyn7gP1igZLv4DryquuYLjcekkrQBVpZpFHvC": "L2_DogwifXRP",
  "FnzYzrkRL1JLHmxS8QctidKDGJgJRa6BN4QH3hkVpump": "L3_WFXRP",
  "5K7ufVK7cGwU8vd66bFAzHgijVK8RoWZBxtMmvW1pump": "L4_XRPEP3",
  "CDjuuYYY9dGA85iojEhpRwjYhGRv6VAPyoKan5ytpump": "L5_TrollXRP",
  "3VQU1DgaLE6E49HhqvH73Azsin8gAZRc14cvyV4hpump": "L6_RXRP",
  "AvMdYR4dVLatpMa3YecWhDrerXp5Wx7sNLNTyiA3pump": "L7_QTX",
  "5f2KbZjnJEnPpW5JqY53mv2cDH7MLixUUgxCFnLBpump": "L8_GSBANK",
  "GytQthjDhj3pE9seoZ6ir35VBBH86U22ntkGJndQpump": "L9_CUPID",
  "KfByHk48ecitUq8gXji2vr9smmRJKtqJwGAh2E9pump": "L10_XAIC",
};

// --- Build KNOWN network from network-map.json ---
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
  const bl = networkMap.insiders.blofin_insider;
  if (bl.hub) KNOWN[bl.hub] = "BloFin Insider Hub";
  if (bl.blofin_passthrough?.address) KNOWN[bl.blofin_passthrough.address] = "BloFin Passthrough";
}

function tag(addr: string, apiLabel?: string | null): string {
  if (KNOWN[addr]) return `[KNOWN: ${KNOWN[addr]}]`;
  if (apiLabel) return `[API: ${apiLabel}]`;
  return "[UNKNOWN]";
}

// --- Helius RPC ---
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

async function getSignatures(address: string, limit = 1) {
  return rpcCall("getSignaturesForAddress", [address, { limit }]);
}

// --- Helius Wallet API ---
async function heliusFundedBy(address: string) {
  const res = await fetch(`${HELIUS_API}/v1/wallet/${address}/funded-by?api-key=${HELIUS_KEY}`);
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error(`funded-by ${res.status}: ${await res.text()}`);
  return res.json();
}

async function heliusIdentity(address: string) {
  const res = await fetch(`${HELIUS_API}/v1/wallet/${address}/identity?api-key=${HELIUS_KEY}`);
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error(`identity ${res.status}: ${await res.text()}`);
  return res.json();
}

// --- Nansen ---
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

async function nansenPnl(address: string, dateFrom: string, dateTo: string) {
  const res = await fetch("https://api.nansen.ai/api/v1/profiler/address/pnl", {
    method: "POST",
    headers: { "Content-Type": "application/json", apiKey: NANSEN_KEY },
    body: JSON.stringify({
      address, chain: "solana",
      date: { from: dateFrom, to: dateTo },
      pagination: { page: 1, per_page: 100 },
    }),
  });
  if (!res.ok) throw new Error(`Nansen PnL ${res.status}: ${await res.text()}`);
  return res.json();
}

// --- Arkham ---
async function arkhamIntelligence(address: string) {
  const res = await fetch(`https://api.arkm.com/intelligence/address/${address}`, {
    headers: { "API-Key": ARKHAM_KEY },
  });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error(`Arkham intel ${res.status}: ${await res.text()}`);
  return res.json();
}

// --- Targets ---
const TARGETS = [
  {
    address: "9J9VHoLWgTRxuc6DtNYxRMi2jVqAFAPshUSMeWQ7wz3Y",
    label: "9J9VHoLW",
    context: "5 launches (L1-L3, L6-L7), positions 4, 5, 4, 5, 10. Consistently top-5 across both OG and fresh wallet eras. Stopped after L7.",
  },
  {
    address: "CJVEFdRSSPp9788dJ2zQZrL6GFWERsYaaYkTKqFxUPf6",
    label: "CJVEFdRS",
    context: "4 launches (L2-L3, L6-L7), positions 6, 3, 1, 9. Position #1 on L6. Stopped after L7.",
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
    context: target.context,
    helius: {},
    nansen: {},
    arkham: {},
    analysis: {},
  };

  // === STEP 1: getBalance (1 credit) ===
  console.log("\n--- Step 1: getBalance (1 credit) ---");
  try {
    result.helius.balance_sol = await getBalance(target.address);
    console.log(`Balance: ${result.helius.balance_sol} SOL`);
  } catch (e: any) {
    console.log(`Balance error: ${e.message}`);
    result.helius.balance_sol = null;
  }

  // === STEP 2: getSignaturesForAddress limit 1 (10 credits) ===
  console.log("\n--- Step 2: getSignaturesForAddress limit=1 (10 credits) ---");
  try {
    const sigs = await getSignatures(target.address, 1);
    result.helius.latest_signature = sigs;
    if (sigs.length > 0) {
      const latest = new Date(sigs[0].blockTime * 1000).toISOString();
      console.log(`Latest activity: ${latest}`);
      console.log(`Signature: ${sigs[0].signature}`);
    } else {
      console.log("No signatures found (closed/empty account)");
    }
  } catch (e: any) {
    console.log(`Signatures error: ${e.message}`);
    result.helius.latest_signature = null;
  }

  // === STEP 3: Helius funded-by (100 credits) ===
  console.log("\n--- Step 3: Helius funded-by (100 credits) ---");
  await sleep(150);
  try {
    result.helius.funded_by = await heliusFundedBy(target.address);
    const fb = result.helius.funded_by;
    if (fb.notFound) {
      console.log("Funded-by: not found (404)");
    } else {
      const fTag = tag(fb.funder, fb.funderName);
      console.log(`Funded-by: ${fb.funder} ${fTag}`);
      console.log(`  Name: ${fb.funderName || "unknown"}, Type: ${fb.funderType || "unknown"}`);
      console.log(`  Amount: ${fb.amount} SOL, Date: ${fb.date}`);
    }
  } catch (e: any) {
    console.log(`Funded-by error: ${e.message}`);
    result.helius.funded_by = { error: e.message };
  }

  // === STEP 4: Helius identity (100 credits) ===
  console.log("\n--- Step 4: Helius identity (100 credits) ---");
  await sleep(150);
  try {
    result.helius.identity = await heliusIdentity(target.address);
    const id = result.helius.identity;
    if (id.notFound) {
      console.log("Identity: not found");
    } else {
      console.log(`Identity: ${id.name} (${id.category}) tags=${JSON.stringify(id.tags)}`);
    }
  } catch (e: any) {
    console.log(`Identity error: ${e.message}`);
    result.helius.identity = { error: e.message };
  }

  // === STEP 5: Nansen counterparties (5 credits) ===
  console.log("\n--- Step 5: Nansen counterparties (5 credits) ---");
  await sleep(2000);
  try {
    result.nansen.counterparties = await nansenCounterparties(target.address, "2025-01-01", "2026-03-28");
    const cp = result.nansen.counterparties;
    const items = cp.data || [];
    console.log(`Counterparties: ${items.length} (is_last_page: ${cp.is_last_page})`);

    let networkCount = 0;
    for (const c of items) {
      const t = tag(c.counterparty_address, c.counterparty_address_label?.[0]);
      if (t.includes("KNOWN")) networkCount++;
      console.log(`  ${c.counterparty_address?.slice(0, 8)}... ${t} vol=$${c.total_volume_usd?.toFixed(0)} in=$${c.volume_in_usd?.toFixed(0)} out=$${c.volume_out_usd?.toFixed(0)} txs=${c.interaction_count}`);
    }
    result.analysis.network_counterparty_count = networkCount;
    result.analysis.total_counterparty_count = items.length;
    console.log(`\nNetwork connections in counterparties: ${networkCount}/${items.length}`);
  } catch (e: any) {
    console.log(`Counterparties error: ${e.message}`);
    result.nansen.counterparties = { error: e.message };
  }

  // === STEP 6: Nansen PnL (1 credit) — check for deployer token trades ===
  console.log("\n--- Step 6: Nansen PnL (1 credit) — deployer token check ---");
  await sleep(2000);
  try {
    result.nansen.pnl = await nansenPnl(target.address, "2025-01-01", "2026-03-28");
    const pnlData = result.nansen.pnl.data || [];
    console.log(`PnL entries: ${pnlData.length}`);

    const deployerTokenTrades: any[] = [];
    const otherTrades: any[] = [];

    for (const p of pnlData) {
      const ca = p.token_address;
      const sym = p.token_symbol || "UNKNOWN";
      const deployerLabel = DEPLOYER_TOKENS[ca];
      const pnlRealized = p.pnl_usd_realised ?? 0;
      const boughtUsd = p.bought_usd ?? 0;
      const soldUsd = p.sold_usd ?? 0;
      const roi = p.roi_percent_realised ?? 0;

      if (deployerLabel) {
        deployerTokenTrades.push({
          launch: deployerLabel,
          token_symbol: sym,
          token_address: ca,
          bought_usd: boughtUsd,
          sold_usd: soldUsd,
          pnl_usd_realised: pnlRealized,
          roi_percent: roi,
          nof_buys: p.nof_buys,
          nof_sells: p.nof_sells,
        });
        console.log(`  ** DEPLOYER TOKEN: ${deployerLabel} (${sym}) — bought=$${boughtUsd.toFixed(0)}, sold=$${soldUsd.toFixed(0)}, PnL=$${pnlRealized.toFixed(0)}, ROI=${roi.toFixed(1)}%`);
      } else {
        otherTrades.push({
          token_symbol: sym,
          token_address: ca,
          bought_usd: boughtUsd,
          sold_usd: soldUsd,
          pnl_usd_realised: pnlRealized,
        });
      }
    }

    result.analysis.deployer_token_trades = deployerTokenTrades;
    result.analysis.deployer_token_count = deployerTokenTrades.length;
    result.analysis.total_traded_tokens = pnlData.length;

    console.log(`\nDeployer tokens traded: ${deployerTokenTrades.length}/${Object.keys(DEPLOYER_TOKENS).length}`);
    if (otherTrades.length > 0) {
      console.log(`Other tokens traded: ${otherTrades.length}`);
      // Show top 5 by absolute PnL
      const topOther = [...otherTrades].sort((a, b) => Math.abs(b.pnl_usd_realised) - Math.abs(a.pnl_usd_realised)).slice(0, 5);
      for (const t of topOther) {
        console.log(`  ${t.token_symbol}: bought=$${t.bought_usd?.toFixed(0)}, sold=$${t.sold_usd?.toFixed(0)}, PnL=$${t.pnl_usd_realised?.toFixed(0)}`);
      }
    }
  } catch (e: any) {
    console.log(`PnL error: ${e.message}`);
    result.nansen.pnl = { error: e.message };
  }

  // === STEP 7: Arkham intelligence ===
  console.log("\n--- Step 7: Arkham intelligence ---");
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
      if (ai.arkhamLabel) {
        console.log(`Arkham label: ${ai.arkhamLabel.name} (${ai.arkhamLabel.address?.slice(0, 8)}...)`);
      }
      console.log(`isUserAddress: ${ai.isUserAddress}`);
      console.log(`Arkham keys: ${Object.keys(ai).join(", ")}`);
    }
  } catch (e: any) {
    console.log(`Arkham intelligence error: ${e.message}`);
    result.arkham.intelligence = { error: e.message };
  }

  // === Analysis: Classification ===
  console.log("\n--- ANALYSIS ---");
  const fb = result.helius.funded_by;
  const funderAddr = fb && !fb.notFound ? fb.funder : null;
  const funderIsNetwork = funderAddr ? !!KNOWN[funderAddr] : false;
  const funderLabel = funderAddr ? (KNOWN[funderAddr] || fb.funderName || "unknown") : "unknown";

  result.analysis.funding_source = funderLabel;
  result.analysis.funding_is_deployer_exchange = false; // Check if Coinbase/MoonPay

  if (funderLabel.toLowerCase().includes("coinbase") || funderLabel.toLowerCase().includes("moonpay")) {
    result.analysis.funding_is_deployer_exchange = true;
    console.log(`FUNDING: ${funderLabel} — MATCHES deployer's exchanges!`);
  } else if (funderLabel.toLowerCase().includes("blofin")) {
    console.log(`FUNDING: ${funderLabel} — BloFin (different from deployer's Coinbase/MoonPay)`);
    result.analysis.blofin_connection = true;
  } else {
    console.log(`FUNDING: ${funderLabel} — different from deployer's exchanges`);
  }

  // Check if funder is BloFin Insider Hub
  if (funderAddr === "BDVgXauNbs7AQEqgPich2hUANu6oLf9VQEuXqL2q3Q5a") {
    result.analysis.blofin_connection = true;
    console.log(`CONFIRMED: Funded by BloFin Insider Hub (BDVgXauN / 'zougz')`);
  }

  // Network connection count
  const netCount = result.analysis.network_counterparty_count ?? 0;
  console.log(`NETWORK CONNECTIONS: ${netCount} counterparties match known network`);

  // Deployer token trades
  const dtCount = result.analysis.deployer_token_count ?? 0;
  console.log(`DEPLOYER TOKENS TRADED: ${dtCount}`);

  // Classification
  let classification = "inconclusive";
  if (result.analysis.blofin_connection && !result.analysis.funding_is_deployer_exchange) {
    if (dtCount >= 3) {
      classification = "independent_sniper_blofin_network";
    } else {
      classification = "independent_sniper_blofin_network";
    }
  }
  if (result.analysis.funding_is_deployer_exchange && netCount >= 3) {
    classification = "possible_deployer_associate";
  }

  result.analysis.classification = classification;
  console.log(`CLASSIFICATION: ${classification}`);

  return result;
}

async function main() {
  console.log("=== Profiling Unknown Recurring Buyers: 9J9VHoLW, CJVEFdRS ===");
  console.log(`Known network addresses: ${Object.keys(KNOWN).length}`);
  console.log(`Deployer tokens tracked: ${Object.keys(DEPLOYER_TOKENS).length}`);
  console.log(`\nEstimated credits per wallet:`);
  console.log(`  Helius: getBalance(1) + getSigs(10) + funded-by(100) + identity(100) = 211`);
  console.log(`  Nansen: counterparties(5) + pnl(1) = 6`);
  console.log(`  Arkham: intelligence(free)`);
  console.log(`  Total: ~211 Helius + ~6 Nansen per wallet = ~434 Helius + ~12 Nansen total\n`);

  const results: any[] = [];

  for (const target of TARGETS) {
    try {
      const r = await investigate(target);
      results.push(r);
    } catch (e: any) {
      console.log(`\nFATAL ERROR for ${target.label}: ${e.message}`);
      results.push({ label: target.label, address: target.address, error: e.message });
    }
    await sleep(500); // Brief pause between targets
  }

  // Save raw results
  const outPath = join(rawDir, "unknown-buyer-profiles.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nSaved raw results to ${outPath}`);

  // === FINAL SUMMARY ===
  console.log("\n\n" + "=".repeat(70));
  console.log("FINAL SUMMARY");
  console.log("=".repeat(70));

  for (const r of results) {
    console.log(`\n--- ${r.label} (${r.address?.slice(0, 8)}...) ---`);
    if (r.error) { console.log(`  ERROR: ${r.error}`); continue; }

    console.log(`  Balance: ${r.helius?.balance_sol ?? "?"} SOL`);

    const fb = r.helius?.funded_by;
    if (fb && !fb.notFound) {
      console.log(`  Funded by: ${fb.funder?.slice(0, 8)}... ${tag(fb.funder, fb.funderName)}`);
      console.log(`  Funding amount: ${fb.amount} SOL on ${fb.date}`);
    }

    const id = r.helius?.identity;
    if (id && !id.notFound) console.log(`  Helius ID: ${id.name} (${id.category})`);
    else console.log(`  Helius ID: not found`);

    const ai = r.arkham?.intelligence;
    if (ai && !ai.notFound) {
      const entity = ai.arkhamEntity;
      if (entity) console.log(`  Arkham: ${entity.name} (${entity.type})`);
      console.log(`  isUserAddress: ${ai.isUserAddress}`);
    } else {
      console.log(`  Arkham: not found`);
    }

    console.log(`  Network counterparties: ${r.analysis?.network_counterparty_count ?? "?"}/${r.analysis?.total_counterparty_count ?? "?"}`);
    console.log(`  Deployer tokens traded: ${r.analysis?.deployer_token_count ?? "?"}`);
    if (r.analysis?.deployer_token_trades?.length > 0) {
      for (const dt of r.analysis.deployer_token_trades) {
        console.log(`    ${dt.launch}: bought=$${dt.bought_usd?.toFixed(0)}, sold=$${dt.sold_usd?.toFixed(0)}, PnL=$${dt.pnl_usd_realised?.toFixed(0)}`);
      }
    }
    console.log(`  BloFin connection: ${r.analysis?.blofin_connection ? "YES" : "no"}`);
    console.log(`  Classification: ${r.analysis?.classification}`);
  }

  // Latest activity check
  console.log("\n--- Latest Activity ---");
  for (const r of results) {
    const sigs = r.helius?.latest_signature;
    if (sigs && sigs.length > 0) {
      const latest = new Date(sigs[0].blockTime * 1000).toISOString();
      console.log(`  ${r.label}: ${latest}`);
    } else {
      console.log(`  ${r.label}: no recent activity`);
    }
  }
}

main().catch(console.error);
