import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");
const rawDir = join(dataDir, "results", "raw");

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
if (networkMap.insiders?.coinspot_insider) {
  const cs = networkMap.insiders.coinspot_insider;
  if (cs.trading_wallet) KNOWN[cs.trading_wallet] = "CoinSpot Insider Trading";
  if (cs.token_trading_wallet?.address) KNOWN[cs.token_trading_wallet.address] = "CoinSpot Token Wallet";
}
if (networkMap.insiders?.blofin_insider) {
  KNOWN[networkMap.insiders.blofin_insider.hub] = "BloFin Insider Hub";
}
KNOWN["chrisVmt4xpnsvGsKrkzW4a2Si6xTTixUpzsk99ixWR"] = "chrisV (not network)";
KNOWN["CJVEFdRSSPp9788dJ2zQZrL6GFWERsYaaYkTKqFxUPf6"] = "CJVEFd (zougz/BloFin)";
KNOWN["9J9VHoLWgTRxuc6DtNYxRMi2jVqAFAPshUSMeWQ7wz3Y"] = "9J9VHo (zougz/BloFin)";
KNOWN["F7RV6aBWfniixoFkQNWmRwznDj2vae2XbusFfvMMjtbE"] = "F7RV6aBW (possible associate)";
KNOWN["E2NnJHhcMhwrMT2qZDJicnGLFQZw44ceqTAcrqo8BA8F"] = "E2NnJHhc (network bot)";

// Load raw data
const rawData = JSON.parse(readFileSync(join(rawDir, "l10-early-buyers.json"), "utf-8"));
const allTrades = rawData.pages.flatMap((p: any) => p.data || []);

// Normalize timestamps — append Z if missing
function normalizeTs(ts: string): number {
  if (!ts.endsWith("Z")) ts += "Z";
  return new Date(ts).getTime();
}

const deployTs = normalizeTs("2026-03-15T21:40:44");

// Sort by time
allTrades.sort((a: any, b: any) => normalizeTs(a.block_timestamp) - normalizeTs(b.block_timestamp));

console.log(`Total BUY trades: ${allTrades.length}`);
console.log(`Time range: ${allTrades[0]?.block_timestamp} to ${allTrades[allTrades.length-1]?.block_timestamp}`);
console.log(`Deploy time: 2026-03-15T21:40:44Z\n`);

// Aggregate by trader (all trades, since they're all within ~70s of deploy)
const traderMap: Record<string, {
  totalUsd: number; totalTokens: number; firstBuyTime: string;
  tradeCount: number; label: string | null; secondsAfterDeploy: number;
}> = {};

for (const trade of allTrades) {
  const addr = trade.trader_address;
  if (!addr) continue;
  const ts = normalizeTs(trade.block_timestamp);
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

// Sort by first buy time
const sortedTraders = Object.entries(traderMap)
  .sort((a, b) => a[1].secondsAfterDeploy - b[1].secondsAfterDeploy);

console.log("=== L10 EARLY BUYERS (sorted by time, first 70s) ===\n");
console.log("Pos | Address              | +Sec | Vol USD   | Trades | Network Tag / Nansen Label");
console.log("----|----------------------|------|-----------|--------|---------------------------");

const earlyBuyerList: any[] = [];
for (let i = 0; i < sortedTraders.length; i++) {
  const [addr, info] = sortedTraders[i];
  const networkTag = KNOWN[addr] || "";
  const label = networkTag || info.label || "";
  const seconds = info.secondsAfterDeploy.toFixed(0);
  const vol = info.totalUsd.toFixed(0);

  console.log(`${String(i + 1).padStart(3)} | ${addr.slice(0, 20)} | ${seconds.padStart(4)} | $${vol.padStart(8)} | ${String(info.tradeCount).padStart(6)} | ${label}`);

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

// Summary
const networkBuyers = earlyBuyerList.filter(b => b.networkMatch);
const unknownBuyers = earlyBuyerList.filter(b => !b.networkMatch);
console.log(`\nTotal unique traders: ${earlyBuyerList.length}`);
console.log(`Network/known: ${networkBuyers.length}`);
console.log(`Unknown: ${unknownBuyers.length}`);

// Highlight significant unknowns
const significantUnknowns = unknownBuyers.filter(b => b.totalUsd > 100 && b.secondsAfterDeploy <= 10);
if (significantUnknowns.length > 0) {
  console.log(`\n=== SUSPICIOUS: Unknown buyers >$100 within 10 seconds ===`);
  for (const b of significantUnknowns) {
    console.log(`  ${b.address} — $${b.totalUsd} at +${b.secondsAfterDeploy}s (${b.nansenLabel || "no label"})`);
  }
}

// Save processed list
const processedPath = join(rawDir, "l10-early-buyers-processed.json");
writeFileSync(processedPath, JSON.stringify({ earlyBuyers: earlyBuyerList, summary: { total: earlyBuyerList.length, network: networkBuyers.length, unknown: unknownBuyers.length } }, null, 2));
console.log(`\nSaved processed list to ${processedPath}`);
