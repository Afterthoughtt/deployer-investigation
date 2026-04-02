import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");
const rawDir = join(dataDir, "results", "raw");
mkdirSync(rawDir, { recursive: true });

const NANSEN_KEY = process.env.NANSEN_API_KEY!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const XAIC_TOKEN = "KfByHk48ecitUq8gXji2vr9smmRJKtqJwGAh2E9pump";
const DEPLOY_TIME = "2026-03-15T21:40:44Z"; // L10 deploy time
const DEPLOY_DATE = "2026-03-15";

// Known network for tagging
const networkMap = JSON.parse(readFileSync(join(dataDir, "network-map.json"), "utf-8"));
const KNOWN: Record<string, string> = {};
for (const [k, v] of Object.entries(networkMap.deployers || {})) KNOWN[v as string] = `${k} Deployer`;
for (const [k, v] of Object.entries(networkMap.infrastructure || {})) { const a = (v as any).address || v; if (typeof a === "string") KNOWN[a] = k; }
for (const [k, v] of Object.entries(networkMap.bundle_wallets || {})) KNOWN[v as string] = k;
for (const [k, v] of Object.entries(networkMap.profit_routing || {})) { const a = (v as any).address || v; if (typeof a === "string") KNOWN[a] = k; }
for (const [k, v] of Object.entries(networkMap.side_projects || {})) { const a = (v as any).address || v; if (typeof a === "string") KNOWN[a] = k; }
for (const [k, v] of Object.entries(networkMap.network_connected || {})) { const a = (v as any).address; if (a) KNOWN[a] = k; }
for (const [k, v] of Object.entries(networkMap.monitoring || {})) { const a = (v as any).address; if (a) KNOWN[a] = k; }
for (const [k, v] of Object.entries(networkMap.extras || {})) { const a = (v as any).address; if (a) KNOWN[a] = k; }
const cb = networkMap.onramp_hot_wallets?.coinbase || {};
for (const [k, v] of Object.entries(cb)) { if (k !== "notes" && typeof v === "string") KNOWN[v] = `Coinbase ${k}`; }
const mp = networkMap.onramp_hot_wallets?.moonpay || {};
for (const [k, v] of Object.entries(mp)) { if (k !== "notes") { const a = typeof v === "string" ? v : (v as any).address; if (a) KNOWN[a] = `MoonPay ${k}`; } }
if (networkMap.insiders?.coinspot_insider) {
  const cs = networkMap.insiders.coinspot_insider;
  if (cs.trading_wallet) KNOWN[cs.trading_wallet] = "CoinSpot Insider Trading";
  if (cs.token_trading_wallet?.address) KNOWN[cs.token_trading_wallet.address] = "CoinSpot Token Wallet";
}
if (networkMap.insiders?.blofin_insider) {
  KNOWN[networkMap.insiders.blofin_insider.hub] = "BloFin Insider Hub";
}

// Also add resolved wallets
KNOWN["chrisVmt4xpnsvGsKrkzW4a2Si6xTTixUpzsk99ixWR"] = "chrisV (resolved: not network)";
KNOWN["CJVEFdRSSPp9788dJ2zQZrL6GFWERsYaaYkTKqFxUPf6"] = "CJVEFd (resolved: zougz/BloFin)";
KNOWN["9J9VHoLWgTRxuc6DtNYxRMi2jVqAFAPshUSMeWQ7wz3Y"] = "9J9VHo (resolved: zougz/BloFin)";
KNOWN["F7RV6aBWfniixoFkQNWmRwznDj2vae2XbusFfvMMjtbE"] = "F7RV6aBW (possible associate)";
KNOWN["E2NnJHhcMhwrMT2qZDJicnGLFQZw44ceqTAcrqo8BA8F"] = "E2NnJHhc (network trading bot)";

async function nansenDexTrades(tokenAddress: string, dateFrom: string, dateTo: string, page = 1, action = "BUY") {
  const res = await fetch("https://api.nansen.ai/api/v1/tgm/dex-trades", {
    method: "POST",
    headers: { "Content-Type": "application/json", apiKey: NANSEN_KEY },
    body: JSON.stringify({
      chain: "solana",
      token_address: tokenAddress,
      date: { from: dateFrom, to: dateTo },
      filters: { action },
      pagination: { page, per_page: 50 },
      order_by: [{ field: "block_timestamp", direction: "ASC" }],
    }),
  });
  if (!res.ok) throw new Error(`Nansen dex-trades ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log("=== L10 (XAIC) Early Buyers ===");
  console.log(`Token: ${XAIC_TOKEN}`);
  console.log(`Deploy time: ${DEPLOY_TIME}\n`);

  const results: any = { token: XAIC_TOKEN, deployTime: DEPLOY_TIME, pages: [] };

  // Pull BUY trades on deploy day — get first 3 pages (150 trades)
  // Nansen dex-trades does NOT support trader_address filter — must pull ALL and filter
  let allBuys: any[] = [];
  for (let page = 1; page <= 3; page++) {
    console.log(`Fetching page ${page} BUY trades...`);
    await sleep(2000);
    try {
      const data = await nansenDexTrades(XAIC_TOKEN, `${DEPLOY_DATE}T00:00:00Z`, `${DEPLOY_DATE}T23:59:59Z`, page);
      results.pages.push(data);
      const trades = data.data || [];
      console.log(`  Page ${page}: ${trades.length} trades (is_last_page: ${data.is_last_page})`);
      allBuys.push(...trades);
      if (data.is_last_page || trades.length === 0) break;
    } catch (e: any) {
      console.log(`  Error: ${e.message}`);
      break;
    }
  }

  console.log(`\nTotal BUY trades fetched: ${allBuys.length}`);

  // Sort by timestamp (should already be ASC)
  allBuys.sort((a, b) => new Date(a.block_timestamp).getTime() - new Date(b.block_timestamp).getTime());

  // Identify early buyers (first 60 minutes after deploy)
  const deployTs = new Date(DEPLOY_TIME).getTime();
  const earlyWindow = 60 * 60 * 1000; // 60 minutes

  const earlyBuys = allBuys.filter(t => {
    const ts = new Date(t.block_timestamp).getTime();
    return ts >= deployTs && ts <= deployTs + earlyWindow;
  });

  console.log(`Early buyers (first 60 min): ${earlyBuys.length} trades\n`);

  // Aggregate by trader
  const traderMap: Record<string, {
    totalUsd: number; totalTokens: number; firstBuyTime: string;
    tradeCount: number; label: string | null; secondsAfterDeploy: number;
  }> = {};

  for (const trade of earlyBuys) {
    const addr = trade.trader_address;
    if (!addr) continue;
    const ts = new Date(trade.block_timestamp).getTime();
    const secondsAfter = (ts - deployTs) / 1000;

    if (!traderMap[addr]) {
      traderMap[addr] = {
        totalUsd: 0,
        totalTokens: 0,
        firstBuyTime: trade.block_timestamp,
        tradeCount: 0,
        label: trade.trader_address_label || null,
        secondsAfterDeploy: secondsAfter,
      };
    }
    traderMap[addr].totalUsd += trade.estimated_value_usd || 0;
    traderMap[addr].totalTokens += trade.token_amount || 0;
    traderMap[addr].tradeCount++;
  }

  // Sort by first buy time (earliest first)
  const sortedTraders = Object.entries(traderMap)
    .sort((a, b) => a[1].secondsAfterDeploy - b[1].secondsAfterDeploy);

  console.log("=== EARLY BUYERS (sorted by time) ===\n");
  console.log("Pos | Address         | Seconds | Vol USD   | Trades | Network | Label");
  console.log("----|-----------------|---------|-----------|--------|---------|------");

  const earlyBuyerList: any[] = [];
  for (let i = 0; i < sortedTraders.length; i++) {
    const [addr, info] = sortedTraders[i];
    const networkTag = KNOWN[addr] || "";
    const isNetwork = !!KNOWN[addr];
    const label = info.label || "";
    const seconds = info.secondsAfterDeploy.toFixed(0);
    const vol = info.totalUsd.toFixed(0);

    console.log(`${String(i + 1).padStart(3)} | ${addr.slice(0, 15)} | ${seconds.padStart(7)} | $${vol.padStart(8)} | ${String(info.tradeCount).padStart(6)} | ${isNetwork ? "YES" : "   "} | ${networkTag || label}`);

    earlyBuyerList.push({
      position: i + 1,
      address: addr,
      secondsAfterDeploy: Math.round(info.secondsAfterDeploy),
      totalUsd: Math.round(info.totalUsd),
      tradeCount: info.tradeCount,
      firstBuyTime: info.firstBuyTime,
      networkMatch: networkTag || null,
      nansenLabel: info.label,
    });
  }

  results.earlyBuyers = earlyBuyerList;

  // Count network vs unknown
  const networkBuyers = earlyBuyerList.filter(b => b.networkMatch);
  const unknownBuyers = earlyBuyerList.filter(b => !b.networkMatch);
  console.log(`\nNetwork buyers: ${networkBuyers.length}`);
  console.log(`Unknown buyers: ${unknownBuyers.length}`);
  console.log(`Total: ${earlyBuyerList.length}`);

  // Highlight unknowns with significant volume (>$500)
  const significantUnknowns = unknownBuyers.filter(b => b.totalUsd > 500);
  if (significantUnknowns.length > 0) {
    console.log(`\n=== SIGNIFICANT UNKNOWN EARLY BUYERS (>$500) ===`);
    for (const b of significantUnknowns) {
      console.log(`  ${b.address} — $${b.totalUsd} at +${b.secondsAfterDeploy}s (${b.nansenLabel || "no label"})`);
    }
  }

  // Save
  const outPath = join(rawDir, "l10-early-buyers.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nSaved to ${outPath}`);
}

main().catch(console.error);
