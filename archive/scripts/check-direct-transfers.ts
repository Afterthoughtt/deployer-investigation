import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(__dirname, "..", "data", "results");
mkdirSync(resultsDir, { recursive: true });

const ARKHAM_KEY = process.env.ARKAN_API_KEY!;
const NANSEN_KEY = process.env.NANSEN_API_KEY!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

// Wallets to investigate
const TARGETS = [
  {
    address: "Ed4UGBWK4UpwBKiGFkM2uQMTPpahPwxgxEWjJTRXuAJv",
    context: "$63K into L6, $29.5K into L7. Nansen: Trading Bot. $7M from Binance.",
    deployer_connections: [
      { label: "L6", address: "Bz2yexdH6YyDbru3nmUmeex2ZZyfpKLgmAN7w4C2Bt4Y" },
      { label: "L7", address: "HYMtCcfQTkBGw7uufDZtYHzg48pUmmBWPf5S44akPfdG" },
    ],
  },
  {
    address: "9cDDJ5g2wPqVZUZwpPuwqzxN7ouvc6QFauFwrX2TTTAX",
    context: "$18.1K into L7. Arkham: Fireblocks Custody.",
    deployer_connections: [
      { label: "L7", address: "HYMtCcfQTkBGw7uufDZtYHzg48pUmmBWPf5S44akPfdG" },
    ],
  },
];

async function checkTransfers(target: typeof TARGETS[number]) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(target.address);
  console.log(`Context: ${target.context}`);
  console.log("═".repeat(60));

  const allTransfers: Record<string, unknown>[] = [];

  // Check Arkham transfers between target and each deployer
  for (const conn of target.deployer_connections) {
    console.log(`\n  [Arkham] Transfers with ${conn.label} deployer (${conn.address.slice(0, 12)}...):`);
    try {
      const transfers = await arkhamGet("/transfers", {
        base: target.address,
        counterparty: conn.address,
        chain: "solana",
        limit: "30",
      });
      const data = (transfers as any)?.transfers;
      if (Array.isArray(data) && data.length > 0) {
        console.log(`  Found ${data.length} transfer(s):`);
        for (const t of data) {
          const from = t.fromAddress?.address?.slice(0, 12) || "?";
          const to = t.toAddress?.address?.slice(0, 12) || "?";
          const symbol = t.tokenSymbol || t.unitValue === "0" ? (t.tokenSymbol || "SOL") : "SOL";
          const val = t.unitValue ? `${Number(t.unitValue).toFixed(4)} ${symbol}` : "?";
          const usd = t.historicalUSD ? `$${Number(t.historicalUSD).toFixed(2)}` : "";
          const dir = from === target.address.slice(0, 12) ? "OUT→" : "←IN";
          console.log(`    ${t.blockTimestamp} | ${dir} | ${val} ${usd}`);
          allTransfers.push({
            deployer: conn.label,
            timestamp: t.blockTimestamp,
            direction: dir,
            from: t.fromAddress?.address,
            to: t.toAddress?.address,
            token: symbol,
            amount: t.unitValue,
            usd: t.historicalUSD,
          });
        }
      } else {
        console.log("  No direct transfers found");
      }
    } catch (e: any) {
      console.log(`  ERROR: ${e.message}`);
    }
    await sleep(2000);
  }

  // Also check: what other deployer network wallets does this target interact with?
  // Get Arkham transfers for this wallet broadly and look for known addresses
  console.log(`\n  [Arkham] Recent transfers (looking for network connections):`);
  try {
    const transfers = await arkhamGet("/transfers", {
      base: target.address,
      chain: "solana",
      limit: "100",
    });
    const data = (transfers as any)?.transfers;

    // Known network addresses to flag
    const knownAddresses: Record<string, string> = {
      "37XxihfsTW1EFSJJherWFRFWcAFhj4KQ66cXHiegSKg2": "OG Deployer",
      "v49jgwyQy9zu4oeemnq3ytjRkyiJth5HKiXSstk8aV5": "Hub Wallet",
      "Bra1HUNKj1tcM3iKnL3pHc2m1rXkXZ9JELq4ceivag34": "Collection Wallet",
      "D7MsVpaXFP9sBCr8em4g4iGKYLBg2C2iwCAhBVUNHLXb": "L4 Deployer",
      "DBmxMiP8xeiZ4T45AviCjZCmmmTFETFU8VtsC8vdJZWy": "L5 Deployer",
      "Bz2yexdH6YyDbru3nmUmeex2ZZyfpKLgmAN7w4C2Bt4Y": "L6 Deployer",
      "HYMtCcfQTkBGw7uufDZtYHzg48pUmmBWPf5S44akPfdG": "L7 Deployer",
      "75YFxMtMiR22LsBxa75yN5jxCGYorpZoCMhnjwwuugzE": "L8 Deployer",
      "3VmNQ8ForGkoBpvyHyfS31VQuQqWn4NuxTTsvf7bGGot": "L9 Deployer",
      "2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB": "L10 Deployer",
      "B8aWJoDqZPSZkHQL7BuURR95ujox4oubgFR8g1q3kpzW": "Bundle 1",
      "91CuNTxyGkUvMU8hgzBHSW8FPEHArt767dApEoVsLRn7": "Bundle 2",
      "6M2Pp3vkmNaoq9idYsU8fcNZKUJnVqHuhtx8D5e6maB": "Bundle 3",
      "9dda2gRVxkuQDvDQwpiSKUCgEk7TxAKDFKVZrfRqerta": "Bundle 4",
      "EvcWdhdjB2SG2x8hrsxSFuxbf5azu5rpPSmepismXMYc": "Bundle 5",
      "LCoYfBS9DMhGavDNk3NdwcfhEcPqWC6BuarFqci3CMm": "Bundle 6",
      "4yWaU1QrwteHi1gixoFehknRP9a61T5PhAfM6ED3U2bs": "Profit Pass 1",
      "HDTncsSnBmJWNRXd641Xuh8tYjKXx1xcJq8ACuCZQz52": "Profit Pass 2",
      "DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn": "CoinSpot Insider",
      "52eC8Uy5eFkwpGbDbXp1FoarxkR8MonwUvpm2WT9ni5B": "L9 Funder / JETNUT",
      "DuCzGNzSorXNgWKbx6koWTjd4P1AQaZHrNAdQu6NWmR8": "Eggsheeran",
    };

    if (Array.isArray(data) && data.length > 0) {
      const networkHits: any[] = [];
      for (const t of data) {
        const fromAddr = t.fromAddress?.address;
        const toAddr = t.toAddress?.address;
        const counterpartyAddr = fromAddr === target.address ? toAddr : fromAddr;
        const networkLabel = knownAddresses[counterpartyAddr];
        if (networkLabel) {
          networkHits.push({ ...t, networkLabel });
        }
      }

      if (networkHits.length > 0) {
        console.log(`  ${networkHits.length} interactions with known network wallets:`);
        for (const t of networkHits) {
          const dir = t.fromAddress?.address === target.address ? "OUT→" : "←IN";
          const symbol = t.tokenSymbol || "SOL";
          const val = t.unitValue ? `${Number(t.unitValue).toFixed(4)} ${symbol}` : "?";
          const usd = t.historicalUSD ? `$${Number(t.historicalUSD).toFixed(2)}` : "";
          console.log(`    ${t.blockTimestamp} | ${dir} ${t.networkLabel} | ${val} ${usd}`);
        }
      } else {
        console.log("  No interactions with known network wallets in last 100 transfers");
      }

      // Also summarize unique counterparties
      const uniqueCounterparties = new Map<string, { label: string | null; count: number }>();
      for (const t of data) {
        const fromAddr = t.fromAddress?.address;
        const toAddr = t.toAddress?.address;
        const counterpartyAddr = fromAddr === target.address ? toAddr : fromAddr;
        const entityName = fromAddr === target.address
          ? t.toAddress?.arkhamEntity?.name || t.toAddress?.arkhamLabel?.name
          : t.fromAddress?.arkhamEntity?.name || t.fromAddress?.arkhamLabel?.name;
        const existing = uniqueCounterparties.get(counterpartyAddr);
        if (existing) {
          existing.count++;
        } else {
          uniqueCounterparties.set(counterpartyAddr, { label: entityName || knownAddresses[counterpartyAddr] || null, count: 1 });
        }
      }
      console.log(`\n  Unique counterparties in last 100 transfers: ${uniqueCounterparties.size}`);
      const sorted = [...uniqueCounterparties.entries()].sort((a, b) => b[1].count - a[1].count);
      for (const [addr, info] of sorted.slice(0, 15)) {
        console.log(`    ${addr.slice(0, 16)}... ${info.label || "unlabeled"} (${info.count} txs)`);
      }
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
  }

  return { address: target.address, context: target.context, transfers: allTransfers };
}

async function main() {
  const results: Record<string, unknown>[] = [];
  for (const target of TARGETS) {
    const result = await checkTransfers(target);
    results.push(result);
    await sleep(2000);
  }

  // Now investigate CQvXtWfC passthrough and its funder 6afg6U4c
  console.log(`\n${"═".repeat(60)}`);
  console.log("PASSTHROUGH: CQvXtWfC8Dz2EVU9jS7MjGeqaSfTpAzfZF87obyGCKWE");
  console.log("Its funder: 6afg6U4csVN35XMMzDmQ... (unknown)");
  console.log("═".repeat(60));

  // Investigate the funder
  console.log("\n[Arkham] Intelligence on funder 6afg6U4c...");
  try {
    const intel = await arkhamGet("/intelligence/address/6afg6U4csVN35XMMzDmQRcwJcpHf7ozU3FBqRvPi3rz3", { chain: "solana" });
    const entity = (intel as any)?.arkhamEntity;
    const label = (intel as any)?.arkhamLabel;
    if (entity) console.log(`  Entity: ${entity.name}`);
    else if (label) console.log(`  Label: ${label.name || JSON.stringify(label)}`);
    else console.log("  No label");
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
  }
  await sleep(2000);

  console.log("[Nansen] Related wallets for funder 6afg6U4c...");
  try {
    const related = await nansenPost("/profiler/address/related-wallets", {
      address: "6afg6U4csVN35XMMzDmQRcwJcpHf7ozU3FBqRvPi3rz3",
      chain: "solana",
    });
    const data = (related as any)?.data;
    if (Array.isArray(data) && data.length > 0) {
      for (const r of data) {
        console.log(`  ${r.relation}: ${r.address?.slice(0, 20)}... (${r.address_label || "unlabeled"})`);
      }
    } else {
      console.log("  No related wallets");
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
  }
  await sleep(2000);

  console.log("[Nansen] Counterparties for funder 6afg6U4c...");
  try {
    const cp = await nansenPost("/profiler/address/counterparties", {
      address: "6afg6U4csVN35XMMzDmQRcwJcpHf7ozU3FBqRvPi3rz3",
      chain: "solana",
      date: { from: "2025-06-01", to: "2026-03-20" },
      group_by: "wallet",
      source_input: "Combined",
      pagination: { page: 1, per_page: 15 },
      order_by: [{ field: "total_volume_usd", direction: "DESC" }],
    });
    const data = (cp as any)?.data;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`  ${data.length} counterparty(ies):`);
      for (const c of data.slice(0, 10)) {
        const label = c.counterparty_address_label || "unlabeled";
        const addr = c.counterparty_address?.slice(0, 16) || "?";
        console.log(`    ${addr}... ${label} | vol=$${c.total_volume_usd?.toLocaleString()} | in=$${c.volume_in_usd?.toLocaleString()} out=$${c.volume_out_usd?.toLocaleString()}`);
      }
    } else {
      console.log("  No counterparties");
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
  }

  const outputPath = join(resultsDir, "direct-transfers-check.json");
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
