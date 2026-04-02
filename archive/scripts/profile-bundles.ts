import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");
const resultsDir = join(dataDir, "results");
mkdirSync(resultsDir, { recursive: true });

const NANSEN_KEY = process.env.NANSEN_API_KEY;
const ARKHAM_KEY = process.env.ARKAN_API_KEY;
const HELIUS_KEY = process.env.HELIUS_API_KEY;

if (!NANSEN_KEY) throw new Error("NANSEN_API_KEY not set");
if (!ARKHAM_KEY) throw new Error("ARKAN_API_KEY not set");
if (!HELIUS_KEY) throw new Error("HELIUS_API_KEY not set");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Read bundle addresses from network-map.json
const networkMap = JSON.parse(readFileSync(join(dataDir, "network-map.json"), "utf-8"));
const BUNDLES = Object.entries(networkMap.bundle_wallets as Record<string, string>).map(
  ([key, address]) => ({ label: key, address })
);

// Known network for tagging
const KNOWN_NETWORK: Record<string, string> = {};
// Populate from network-map programmatically
for (const [k, v] of Object.entries(networkMap.deployers || {})) KNOWN_NETWORK[v as string] = `${k} Deployer`;
for (const [k, v] of Object.entries(networkMap.infrastructure || {})) {
  const addr = (v as any).address;
  if (addr) KNOWN_NETWORK[addr] = k;
}
for (const [k, v] of Object.entries(networkMap.bundle_wallets || {})) KNOWN_NETWORK[v as string] = k;
for (const [k, v] of Object.entries(networkMap.profit_routing || {})) { const a = (v as any).address || v; if (typeof a === "string") KNOWN_NETWORK[a] = k; }
for (const [k, v] of Object.entries(networkMap.side_projects || {})) { const a = (v as any).address || v; if (typeof a === "string") KNOWN_NETWORK[a] = k; }
for (const [k, v] of Object.entries(networkMap.profit_cashout || {})) {
  const addr = (v as any).address;
  if (addr) KNOWN_NETWORK[addr] = k;
}
for (const [k, v] of Object.entries(networkMap.network_connected || {})) {
  const addr = (v as any).address;
  if (addr) KNOWN_NETWORK[addr] = k;
}
if (networkMap.extras) {
  for (const [k, v] of Object.entries(networkMap.extras)) {
    const addr = (v as any).address;
    if (addr) KNOWN_NETWORK[addr] = k;
  }
}
// On-ramp wallets
const cb = networkMap.onramp_hot_wallets?.coinbase || {};
for (const [k, v] of Object.entries(cb)) {
  if (k !== "notes" && typeof v === "string") KNOWN_NETWORK[v] = `Coinbase ${k}`;
}
const mp = networkMap.onramp_hot_wallets?.moonpay || {};
for (const [k, v] of Object.entries(mp)) {
  if (k !== "notes") {
    const addr = typeof v === "string" ? v : (v as any).address;
    if (addr) KNOWN_NETWORK[addr] = `MoonPay ${k}`;
  }
}
// Insiders
if (networkMap.insiders?.coinspot_insider) {
  const cs = networkMap.insiders.coinspot_insider;
  if (cs.trading_wallet) KNOWN_NETWORK[cs.trading_wallet] = "CoinSpot Insider";
  if (cs.collection) KNOWN_NETWORK[cs.collection] = "CoinSpot Insider Collection";
}

function tag(addr: string, apiLabel?: string | null): string {
  const known = KNOWN_NETWORK[addr];
  if (known) return `[KNOWN: ${known}]`;
  if (apiLabel) return `[API: ${apiLabel}]`;
  return "[UNKNOWN]";
}

// --- Nansen ---
async function nansenCounterparties(address: string, dateFrom: string, dateTo: string, page = 1) {
  const res = await fetch("https://api.nansen.ai/api/v1/profiler/address/counterparties", {
    method: "POST",
    headers: { "Content-Type": "application/json", apiKey: NANSEN_KEY! },
    body: JSON.stringify({
      address,
      chain: "solana",
      date: { from: dateFrom, to: dateTo },
      group_by: "wallet",
      source_input: "Combined",
      pagination: { page, per_page: 50 },
      order_by: [{ field: "total_volume_usd", direction: "DESC" }],
    }),
  });
  if (!res.ok) throw new Error(`Nansen counterparties ${res.status}: ${await res.text()}`);
  return res.json();
}

// --- Arkham ---
async function arkhamTransfers(address: string, limit = "50") {
  const url = new URL("https://api.arkm.com/transfers");
  url.searchParams.set("base", address);
  url.searchParams.set("chain", "solana");
  url.searchParams.set("limit", limit);
  const res = await fetch(url.toString(), { headers: { "API-Key": ARKHAM_KEY! } });
  if (!res.ok) throw new Error(`Arkham transfers ${res.status}: ${await res.text()}`);
  return res.json();
}

// --- Main ---
async function profileBundle(bundle: { label: string; address: string }) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${bundle.label}: ${bundle.address}`);
  console.log("=".repeat(60));

  const result: any = {
    label: bundle.label,
    address: bundle.address,
    nansen_counterparties: null,
    arkham_transfers: null,
    network_connections: [] as string[],
    unknown_counterparties: [] as any[],
    errors: [] as string[],
  };

  // 1. Nansen counterparties (5 credits) — wide date range
  console.log("\n[Nansen] Counterparties...");
  try {
    const cp = await nansenCounterparties(bundle.address, "2025-06-01", "2026-03-21");
    result.nansen_counterparties = cp;
    const data = (cp as any)?.data;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`  ${data.length} counterparties:`);
      for (const c of data) {
        const addr = c.counterparty_address || "?";
        const label = c.counterparty_address_label || null;
        const t = tag(addr, label);
        const vol = c.total_volume_usd?.toLocaleString() || "?";
        const inflow = c.volume_in_usd?.toLocaleString() || "0";
        const outflow = c.volume_out_usd?.toLocaleString() || "0";
        console.log(`    ${addr.slice(0, 16)}... ${t} | vol=$${vol} | in=$${inflow} out=$${outflow} | ${c.interaction_count} txs`);

        if (KNOWN_NETWORK[addr]) {
          result.network_connections.push(
            `${KNOWN_NETWORK[addr]} — $${vol} (in=$${inflow}, out=$${outflow}, ${c.interaction_count} txs)`
          );
        } else {
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
      console.log("  No counterparties found");
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
    result.errors.push(`nansen: ${e.message}`);
  }
  await sleep(2000);

  // 2. Arkham transfers (last 50)
  console.log("[Arkham] Transfers...");
  try {
    const transfers = await arkhamTransfers(bundle.address, "50");
    result.arkham_transfers = transfers;
    const data = (transfers as any)?.transfers;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`  ${data.length} transfers (showing first 15):`);
      for (const t of data.slice(0, 15)) {
        const fromAddr = t.fromAddress?.address || "?";
        const toAddr = t.toAddress?.address || "?";
        const fromName = t.fromAddress?.arkhamEntity?.name || KNOWN_NETWORK[fromAddr] || fromAddr.slice(0, 12);
        const toName = t.toAddress?.arkhamEntity?.name || KNOWN_NETWORK[toAddr] || toAddr.slice(0, 12);
        const val = t.unitValue ? `${Number(t.unitValue).toFixed(4)} ${t.tokenSymbol || "SOL"}` : "?";
        const usd = t.historicalUSD ? `$${Number(t.historicalUSD).toFixed(2)}` : "";
        console.log(`    ${(t.blockTimestamp || "?").slice(0, 19)} | ${fromName} → ${toName} | ${val} ${usd}`);

        if (KNOWN_NETWORK[fromAddr] && fromAddr !== bundle.address) {
          result.network_connections.push(`Arkham: receives from ${KNOWN_NETWORK[fromAddr]}`);
        }
        if (KNOWN_NETWORK[toAddr] && toAddr !== bundle.address) {
          result.network_connections.push(`Arkham: sends to ${KNOWN_NETWORK[toAddr]}`);
        }
      }
    } else {
      console.log("  No transfers found");
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
    result.errors.push(`arkham: ${e.message}`);
  }
  await sleep(500);

  // Dedupe connections
  result.network_connections = [...new Set(result.network_connections)];

  console.log(`\n--- SUMMARY: ${bundle.label} ---`);
  console.log(`  Network connections: ${result.network_connections.length}`);
  for (const c of result.network_connections) console.log(`    - ${c}`);
  console.log(`  Unknown counterparties: ${result.unknown_counterparties.length}`);
  for (const u of result.unknown_counterparties.slice(0, 5)) {
    console.log(`    - ${u.address.slice(0, 16)}... ${u.label || "unlabeled"} | vol=$${u.total_volume_usd?.toLocaleString()}`);
  }

  return result;
}

async function main() {
  console.log(`Profiling ${BUNDLES.length} bundle wallets`);
  console.log(`Nansen credits: ${BUNDLES.length * 5} (counterparties)`);
  console.log(`Arkham: free (transfers)\n`);

  const results: any[] = [];
  for (const b of BUNDLES) {
    results.push(await profileBundle(b));
    await sleep(2500);
  }

  // Save results
  const outputPath = join(resultsDir, "bundle-profiles.json");
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results saved to: ${outputPath}`);

  // Cross-bundle summary
  console.log("\n=== CROSS-BUNDLE SUMMARY ===");
  const allUnknowns = new Map<string, { label: string; vol: number; bundles: string[] }>();
  for (const r of results) {
    for (const u of r.unknown_counterparties) {
      const existing = allUnknowns.get(u.address);
      if (existing) {
        existing.vol += u.total_volume_usd || 0;
        existing.bundles.push(r.label);
      } else {
        allUnknowns.set(u.address, {
          label: u.label || "unlabeled",
          vol: u.total_volume_usd || 0,
          bundles: [r.label],
        });
      }
    }
  }

  // Show unknowns that appear in 2+ bundles
  const recurring = [...allUnknowns.entries()].filter(([, v]) => v.bundles.length >= 2);
  if (recurring.length > 0) {
    console.log(`\nUnknown counterparties appearing in 2+ bundles:`);
    for (const [addr, info] of recurring.sort((a, b) => b[1].vol - a[1].vol)) {
      console.log(`  ${addr.slice(0, 16)}... ${info.label} | total=$${info.vol.toLocaleString()} | bundles: ${info.bundles.join(", ")}`);
    }
  } else {
    console.log("No recurring unknown counterparties across bundles.");
  }

  // Show high-volume unknowns
  const highVol = [...allUnknowns.entries()].filter(([, v]) => v.vol > 1000).sort((a, b) => b[1].vol - a[1].vol);
  if (highVol.length > 0) {
    console.log(`\nHigh-volume unknown counterparties (>$1K):`);
    for (const [addr, info] of highVol.slice(0, 15)) {
      console.log(`  ${addr.slice(0, 16)}... ${info.label} | vol=$${info.vol.toLocaleString()} | ${info.bundles.join(", ")}`);
    }
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
