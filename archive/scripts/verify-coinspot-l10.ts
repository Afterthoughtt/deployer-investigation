import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NANSEN_KEY = process.env.NANSEN_API_KEY!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const XAIC = "KfByHk48ecitUq8gXji2vr9smmRJKtqJwGAh2E9pump";
const DEPLOY_TIME = "2026-03-15T21:40:44Z";
const COINSPOT_INSIDER = "DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn";

async function nansenPost(endpoint: string, body: any) {
  const res = await fetch(`https://api.nansen.ai/api/v1${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apiKey: NANSEN_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Nansen ${endpoint} ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  console.log("=== Verify CoinSpot Insider L10 Buy ===\n");
  console.log("Looking for DmA9Jab in XAIC trades after first 69 seconds...\n");

  // Pull pages 4-8 of XAIC dex-trades (we already have pages 1-3 = first 150 trades)
  const allTrades: any[] = [];

  for (let page = 4; page <= 10; page++) {
    console.log(`Fetching page ${page}...`);
    try {
      const result = await nansenPost("/tgm/dex-trades", {
        chain: "solana",
        token_address: XAIC,
        date: {
          from: "2026-03-15T21:40:00Z",
          to: "2026-03-15T22:00:00Z",
        },
        filters: { action: "BUY" },
        pagination: { page, per_page: 50 },
        order_by: [{ field: "block_timestamp", direction: "ASC" }],
      });

      const trades = result.data || [];
      console.log(`  Got ${trades.length} trades`);
      allTrades.push(...trades);

      if (trades.length > 0) {
        console.log(`  Time range: ${trades[0].block_timestamp} to ${trades[trades.length - 1].block_timestamp}`);
      }

      // Check for DmA9Jab
      const dm = trades.filter((t: any) => t.trader_address === COINSPOT_INSIDER);
      if (dm.length > 0) {
        console.log(`\n*** FOUND DmA9Jab! ***`);
        for (const t of dm) {
          const deployMs = new Date(DEPLOY_TIME).getTime();
          let ts = t.block_timestamp;
          if (!ts.endsWith("Z")) ts += "Z";
          const tradeMs = new Date(ts).getTime();
          const secAfter = ((tradeMs - deployMs) / 1000).toFixed(0);
          console.log(`  Time: ${t.block_timestamp} (+${secAfter}s)`);
          console.log(`  Value: $${t.estimated_value_usd?.toFixed(2)}`);
          console.log(`  Amount: ${t.token_amount}`);
          console.log(`  Tx: ${t.transaction_hash}`);
        }
      }

      if (result.pagination?.is_last_page) {
        console.log("  Last page reached.");
        break;
      }
    } catch (e: any) {
      console.error(`  Error: ${e.message}`);
      break;
    }
    await sleep(2000);
  }

  // Also check: maybe DmA9Jab sold rather than bought? Check SELL trades too
  console.log("\n--- Checking if DmA9Jab appears in SELL trades ---");
  for (let page = 1; page <= 3; page++) {
    try {
      const result = await nansenPost("/tgm/dex-trades", {
        chain: "solana",
        token_address: XAIC,
        date: {
          from: "2026-03-15T21:40:00Z",
          to: "2026-03-16T00:00:00Z",
        },
        filters: { action: "SELL" },
        pagination: { page, per_page: 50 },
        order_by: [{ field: "block_timestamp", direction: "ASC" }],
      });

      const trades = result.data || [];
      const dm = trades.filter((t: any) => t.trader_address === COINSPOT_INSIDER);
      if (dm.length > 0) {
        console.log(`Found DmA9Jab SELL on page ${page}:`);
        for (const t of dm) {
          console.log(`  Time: ${t.block_timestamp}, Value: $${t.estimated_value_usd?.toFixed(2)}`);
        }
      }
      if (result.pagination?.is_last_page) break;
    } catch (e: any) {
      console.error(`  Error: ${e.message}`);
      break;
    }
    await sleep(2000);
  }

  // Summary
  const dmBuys = allTrades.filter((t: any) => t.trader_address === COINSPOT_INSIDER);
  console.log(`\n=== RESULT ===`);
  console.log(`Total additional BUY trades fetched: ${allTrades.length}`);
  console.log(`DmA9Jab BUY trades found: ${dmBuys.length}`);

  if (dmBuys.length === 0) {
    console.log("DmA9Jab NOT found in XAIC buys within first 20 minutes.");
    console.log("The '1 second after deploy' claim for L10 is UNVERIFIED.");
  }

  // Save results
  writeFileSync(
    join(__dirname, "..", "data", "results", "raw", "coinspot-l10-verification.json"),
    JSON.stringify({
      query: { token: XAIC, insider: COINSPOT_INSIDER, pages_checked: "4-10 BUY + 1-3 SELL" },
      additional_buy_trades: allTrades.length,
      dm_found: dmBuys.length > 0,
      dm_trades: dmBuys
    }, null, 2)
  );
  console.log("\nSaved to data/results/raw/coinspot-l10-verification.json");
}

main().catch(console.error);
