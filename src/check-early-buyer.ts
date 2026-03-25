import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(__dirname, "..", "data", "results");
mkdirSync(resultsDir, { recursive: true });

const NANSEN_KEY = process.env.NANSEN_API_KEY!;
const ARKHAM_KEY = process.env.ARKAN_API_KEY!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function nansenPost(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
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

async function arkhamGet(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`https://api.arkm.com${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { "API-Key": ARKHAM_KEY } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Arkham ${endpoint} ${res.status}: ${text}`);
  }
  return res.json();
}

// Our deployer's token CAs with deploy timestamps
const DEPLOYER_TOKENS = [
  { label: "L1 ArkXRP", ca: "2rQcoMECcsU3UBNfpsUxegnHc9js7usb2XagwUK3pump", deployed: "2025-06-15T15:57:57Z" },
  { label: "L2 DogwifXRP", ca: "8mETm8mxyn7gP1igZLv4DryquuYLjcekkrQBVpZpFHvC", deployed: "2025-07-20T18:09:58Z" },
  { label: "L3 WFXRP", ca: "FnzYzrkRL1JLHmxS8QctidKDGJgJRa6BN4QH3hkVpump", deployed: "2025-08-24T18:36:21Z" },
  { label: "L4 XRPEP3", ca: "5K7ufVK7cGwU8vd66bFAzHgijVK8RoWZBxtMmvW1pump", deployed: "2025-09-28T17:51:54Z" },
  { label: "L5 TrollXRP", ca: "CDjuuYYY9dGA85iojEhpRwjYhGRv6VAPyoKan5ytpump", deployed: "2025-11-02T19:28:36Z" },
  { label: "L6 RXRP", ca: "3VQU1DgaLE6E49HhqvH73Azsin8gAZRc14cvyV4hpump", deployed: "2025-11-30T23:43:26Z" },
  { label: "L7 QTX", ca: "AvMdYR4dVLatpMa3YecWhDrerXp5Wx7sNLNTyiA3pump", deployed: "2026-01-18T22:21:05Z" },
  { label: "L8 GSBANK", ca: "5f2KbZjnJEnPpW5JqY53mv2cDH7MLixUUgxCFnLBpump", deployed: "2026-01-31T20:54:31Z" },
  { label: "L9 CUPID", ca: "GytQthjDhj3pE9seoZ6ir35VBBH86U22ntkGJndQpump", deployed: "2026-02-13T21:46:20Z" },
];

interface WalletToCheck {
  address: string;
  context: string;
}

const WALLETS: WalletToCheck[] = [
  {
    address: "Ed4UGBWK4UpwBKiGFkM2uQMTPpahPwxgxEWjJTRXuAJv",
    context: "$63K into L6, $29.5K into L7. Nansen: Trading Bot. $7M from Binance.",
  },
  {
    address: "9cDDJ5g2wPqVZUZwpPuwqzxN7ouvc6QFauFwrX2TTTAX",
    context: "$18.1K into L7. Arkham: Fireblocks Custody.",
  },
];

async function checkTokenTrades(wallet: WalletToCheck) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`${wallet.address}`);
  console.log(`Context: ${wallet.context}`);
  console.log("═".repeat(60));

  const tokenResults: Record<string, unknown>[] = [];

  for (const token of DEPLOYER_TOKENS) {
    console.log(`\n  [${token.label}] CA: ${token.ca.slice(0, 16)}...`);
    console.log(`  Deployed: ${token.deployed}`);

    // Use Nansen TGM dex-trades to find this wallet's trades on this token
    try {
      const deployDate = new Date(token.deployed);
      const fromDate = new Date(deployDate.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day before
      const toDate = new Date(deployDate.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days after

      const trades = await nansenPost("/tgm/dex-trades", {
        chain: "solana",
        token_address: token.ca,
        date: {
          from: fromDate.toISOString().split("T")[0],
          to: toDate.toISOString().split("T")[0],
        },
        filters: {
          trader_address: wallet.address,
        },
        pagination: { page: 1, per_page: 10 },
        order_by: [{ field: "block_timestamp", direction: "ASC" }],
      });

      const data = (trades as any)?.data;
      if (Array.isArray(data) && data.length > 0) {
        for (const t of data) {
          const tradeTime = new Date(t.block_timestamp);
          const deployTime = new Date(token.deployed);
          const diffSec = (tradeTime.getTime() - deployTime.getTime()) / 1000;
          const diffStr = diffSec < 60 ? `${diffSec.toFixed(0)}s` : diffSec < 3600 ? `${(diffSec / 60).toFixed(1)}m` : `${(diffSec / 3600).toFixed(1)}h`;
          const early = diffSec < 300 ? " ⚡VERY EARLY" : diffSec < 3600 ? " ⚡EARLY" : "";

          console.log(`  ${t.action} | ${t.block_timestamp} | +${diffStr} after deploy${early} | $${Number(t.estimated_value_usd).toFixed(2)}`);
          tokenResults.push({
            token: token.label,
            ca: token.ca,
            deployed: token.deployed,
            action: t.action,
            timestamp: t.block_timestamp,
            seconds_after_deploy: Math.round(diffSec),
            value_usd: t.estimated_value_usd,
            trader_label: t.trader_address_label || null,
          });
        }
      } else {
        console.log("  No trades found in window");
      }
    } catch (e: any) {
      console.log(`  ERROR: ${e.message}`);
    }

    await sleep(2000);
  }

  return { address: wallet.address, context: wallet.context, token_trades: tokenResults };
}

async function main() {
  const targetIdx = process.argv[2] ? parseInt(process.argv[2]) : null;
  const targets = targetIdx !== null ? [WALLETS[targetIdx]] : WALLETS;

  console.log(`Checking ${targets.length} wallet(s) for early buys on deployer tokens...`);
  console.log(`Checking ${DEPLOYER_TOKENS.length} tokens each.`);
  console.log(`Nansen credits: ~${targets.length * DEPLOYER_TOKENS.length} (1 per tgm/dex-trades call)\n`);

  const results: Record<string, unknown>[] = [];
  for (const w of targets) {
    const result = await checkTokenTrades(w);
    results.push(result);
  }

  const outputPath = join(resultsDir, "early-buyer-check.json");
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
