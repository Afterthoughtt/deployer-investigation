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

const KNOWN_NETWORK: Record<string, string> = {
  "37XxihfsTW1EFSJJherWFRFWcAFhj4KQ66cXHiegSKg2": "OG Deployer",
  "D7MsVpaXFP9sBCr8em4g4iGKYLBg2C2iwCAhBVUNHLXb": "L4 Deployer",
  "DBmxMiP8xeiZ4T45AviCjZCmmmTFETFU8VtsC8vdJZWy": "L5 Deployer",
  "Bz2yexdH6YyDbru3nmUmeex2ZZyfpKLgmAN7w4C2Bt4Y": "L6 Deployer",
  "HYMtCcfQTkBGw7uufDZtYHzg48pUmmBWPf5S44akPfdG": "L7 Deployer",
  "75YFxMtMiR22LsBxa75yN5jxCGYorpZoCMhnjwwuugzE": "L8 Deployer",
  "3VmNQ8ForGkoBpvyHyfS31VQuQqWn4NuxTTsvf7bGGot": "L9 Deployer",
  "2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB": "L10 Deployer",
  "v49jgwyQy9zu4oeemnq3ytjRkyiJth5HKiXSstk8aV5": "Hub Wallet",
  "Bra1HUNKj1tcM3iKnL3pHc2m1rXkXZ9JELq4ceivag34": "Collection Wallet",
  "HVRcXaCFyUFG7iZLm3T1Qn8ZGDMHj3P3BpezUfWfRf2x": "Large Funding Source",
  "B8aWJoDqZPSZkHQL7BuURR95ujox4oubgFR8g1q3kpzW": "Bundle 1",
  "91CuNTxyGkUvMU8hgzBHSW8FPEHArt767dApEoVsLRn7": "Bundle 2",
  "6M2Pp3vkmNaoq9idYsU8fcNZKUJnVqHuhtx8D5e6maB": "Bundle 3",
  "9dda2gRVxkuQDvDQwpiSKUCgEk7TxAKDFKVZrfRqerta": "Bundle 4",
  "EvcWdhdjB2SG2x8hrsxSFuxbf5azu5rpPSmepismXMYc": "Bundle 5",
  "LCoYfBS9DMhGavDNk3NdwcfhEcPqWC6BuarFqci3CMm": "Bundle 6",
  "4yWaU1QrwteHi1gixoFehknRP9a61T5PhAfM6ED3U2bs": "Profit Pass 1",
  "HDTncsSnBmJWNRXd641Xuh8tYjKXx1xcJq8ACuCZQz52": "Profit Pass 2",
  "J6YUyB4P4LFfHqWxJvfXQC7ktFKgvx8rzfJFEzTNJmcT": "Coinbase Deposit",
  "21wG4F3ZR8gwGC47CkpD6ySBUgH9AABtYMBWFiYdTTgv": "NOT NETWORK (Dexscreener Listing Fees / generic Binance Deposit)",
  "RB3dQF6TsinAUsQsvXtAyxMztMHXJ2GaZ3gdMuuHiw7": "Rollbit Deposit",
  "DcEYX34vm5JYHmYbCCQC141XGJektNHqhnGDUoUTdGsg": "Routes Binance",
  "52eC8Uy5eFkwpGbDbXp1FoarxkR8MonwUvpm2WT9ni5B": "l9_funder (JETNUT Token Deployer)",
  "DuCzGNzSorXNgWKbx6koWTjd4P1AQaZHrNAdQu6NWmR8": "Eggsheeran",
  "Ed4UGBWK4UpwBKiGFkM2uQMTPpahPwxgxEWjJTRXuAJv": "Ed4UGBWK (Network-Connected)",
  "F7RV6aBWfniixoFkQNWmRwznDj2vae2XbusFfvMMjtbE": "F7RV6aBW (Network-Connected)",
  "49mvMufixEbUMzZEUVAnbQ8hLLuEWy789XfKUNTz7wCv": "Token Millionaire (Cash-Out Target)",
  "9Z83ZAtd7vjEFvXfKkjBZtAPTgeJZ1GzK7b1Uf1E3DsF": "Hub First Funder (BloomBot)",
  "8CvuX95RTCCBfUY8cUET8FQZusoY49yUkQxTEL2skYyq": "Cold USDC 1",
  "EAcUbdoiY8aCwJKdSo17fhU4uqMopW27K4oLqpstqfHe": "Cold USDC 2",
  "Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6": "MoonPay MP1",
  "GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE": "Coinbase CB9",
  "DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn": "CoinSpot Insider",
};

const TARGETS = [
  {
    address: "49mvMufixEbUMzZEUVAnbQ8hLLuEWy789XfKUNTz7wCv",
    context: "Token Millionaire. Receives $50,257 from Collection Wallet (6 txs). Top cash-out target.",
  },
  {
    address: "3YxRuo3eHJaW6cHxP1rcsj5RsB1VuVByXstDjt7hwMov",
    context: "Trading Bot. Sends $673 to Hub + $342 to Collection. Cross-wallet profit relay?",
  },
  {
    address: "DZc1evNLyaufVzUATwy7eZjURbjeESRKkN5nvdcFESZC",
    context: "Unlabeled. Receives $1,370 from Hub, sends $127 to Collection. Passthrough?",
  },
  {
    address: "2q8nSJgCpaZZjchK4s7mGy3f9tAJgsXZQQHDfKMB4EN7",
    context: "Unlabeled. Receives $2,510 from Hub + $2,290 from OG. $4.8K total from 2 network wallets.",
  },
];

function tag(addr: string): string {
  return KNOWN_NETWORK[addr] ? `[KNOWN: ${KNOWN_NETWORK[addr]}]` : "";
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

async function investigate(wallet: typeof TARGETS[number]) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Address: ${wallet.address}`);
  console.log(`Context: ${wallet.context}`);
  console.log("=".repeat(60));

  const result: Record<string, unknown> = {
    address: wallet.address,
    context: wallet.context,
    network_connections: [] as string[],
    errors: [] as string[],
  };

  // 1. Arkham Intelligence
  console.log("\n[Arkham] Intelligence...");
  try {
    const intel = await arkhamGet(`/intelligence/address/${wallet.address}`, { chain: "solana" });
    const entity = (intel as any)?.arkhamEntity;
    const label = (intel as any)?.arkhamLabel;
    if (entity) {
      console.log(`  Entity: ${entity.name} (type: ${entity.type})`);
      result.arkham_entity = entity.name;
    } else if (label) {
      console.log(`  Label: ${label.name || JSON.stringify(label)}`);
      result.arkham_label = label.name || label;
    } else {
      console.log("  No label");
      result.arkham_label = null;
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
    (result.errors as string[]).push(`arkham: ${e.message}`);
  }
  await sleep(2000);

  // 2. Nansen Related Wallets (1 credit)
  console.log("[Nansen] Related wallets...");
  try {
    const related = await nansenPost("/profiler/address/related-wallets", {
      address: wallet.address,
      chain: "solana",
    });
    const data = (related as any)?.data;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`  ${data.length} related wallet(s):`);
      for (const r of data) {
        const t = tag(r.address);
        console.log(`    ${r.relation}: ${r.address} ${t} (${r.address_label || "unlabeled"})`);
        if (KNOWN_NETWORK[r.address]) {
          (result.network_connections as string[]).push(`${r.relation}: ${KNOWN_NETWORK[r.address]}`);
        }
      }
      result.nansen_related = data;
    } else {
      console.log("  None found");
      result.nansen_related = [];
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
    (result.errors as string[]).push(`nansen_related: ${e.message}`);
  }
  await sleep(2000);

  // 3. Nansen Counterparties (5 credits)
  console.log("[Nansen] Counterparties...");
  try {
    const cp = await nansenPost("/profiler/address/counterparties", {
      address: wallet.address,
      chain: "solana",
      date: { from: "2025-03-01", to: "2026-03-20" },
      group_by: "wallet",
      source_input: "Combined",
      pagination: { page: 1, per_page: 25 },
      order_by: [{ field: "total_volume_usd", direction: "DESC" }],
    });
    const data = (cp as any)?.data;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`  ${data.length} counterparty(ies):`);
      for (const c of data) {
        const addr = c.counterparty_address || "?";
        const labels = c.counterparty_address_label;
        const label = Array.isArray(labels) ? labels[0] : labels || "unlabeled";
        const t = tag(addr);
        const vol = c.total_volume_usd?.toLocaleString() || "?";
        const inflow = c.volume_in_usd?.toLocaleString() || "0";
        const outflow = c.volume_out_usd?.toLocaleString() || "0";
        console.log(`    ${addr.slice(0, 20)}... ${t || label} | vol=$${vol} | in=$${inflow} out=$${outflow} | ${c.interaction_count} txs`);

        if (KNOWN_NETWORK[addr]) {
          (result.network_connections as string[]).push(
            `Counterparty: ${KNOWN_NETWORK[addr]} — $${vol} (in=$${inflow}, out=$${outflow})`
          );
        }
      }
      result.nansen_counterparties = data;
    } else {
      console.log("  None found");
      result.nansen_counterparties = [];
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
    (result.errors as string[]).push(`nansen_cp: ${e.message}`);
  }
  await sleep(2000);

  // 4. Arkham Transfers (for context)
  console.log("[Arkham] Recent transfers...");
  try {
    const transfers = await arkhamGet("/transfers", {
      base: wallet.address,
      chain: "solana",
      limit: "20",
    });
    const data = (transfers as any)?.transfers;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`  ${data.length} transfer(s) — latest 10:`);
      for (const t of data.slice(0, 10)) {
        const fromAddr = t.fromAddress?.address || "?";
        const toAddr = t.toAddress?.address || "?";
        const fromName = t.fromAddress?.arkhamEntity?.name || KNOWN_NETWORK[fromAddr] || fromAddr.slice(0, 12);
        const toName = t.toAddress?.arkhamEntity?.name || KNOWN_NETWORK[toAddr] || toAddr.slice(0, 12);
        const val = t.unitValue ? `${Number(t.unitValue).toFixed(4)} ${t.tokenSymbol || "SOL"}` : "?";
        const usd = t.historicalUSD ? `$${Number(t.historicalUSD).toFixed(2)}` : "";
        console.log(`    ${t.blockTimestamp || "?"} | ${fromName} → ${toName} | ${val} ${usd}`);
      }
      result.arkham_transfers = data;
    } else {
      console.log("  None found");
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
    (result.errors as string[]).push(`arkham_transfers: ${e.message}`);
  }

  // Dedupe connections
  result.network_connections = [...new Set(result.network_connections as string[])];

  console.log(`\n--- SUMMARY ---`);
  console.log(`  Network connections: ${(result.network_connections as string[]).length}`);
  for (const c of result.network_connections as string[]) console.log(`    - ${c}`);

  return result;
}

async function main() {
  const idx = process.argv[2] ? parseInt(process.argv[2]) : null;
  const targets = idx !== null ? [TARGETS[idx]] : TARGETS;

  console.log(`Investigating ${targets.length} wallet(s) from infrastructure verification...`);
  console.log(`Nansen credits: ~${targets.length * 6} (related=1, counterparties=5)\n`);

  const results: Record<string, unknown>[] = [];
  for (const t of targets) {
    results.push(await investigate(t));
    await sleep(3000);
  }

  const outputPath = join(resultsDir, "infra-unknowns.json");
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results saved to: ${outputPath}`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
