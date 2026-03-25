import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(__dirname, "..", "data", "results");
mkdirSync(resultsDir, { recursive: true });

const NANSEN_KEY = process.env.NANSEN_API_KEY;
const ARKHAM_KEY = process.env.ARKAN_API_KEY;

if (!NANSEN_KEY) throw new Error("NANSEN_API_KEY not set in .env");
if (!ARKHAM_KEY) throw new Error("ARKAN_API_KEY not set in .env");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Infrastructure wallets to verify
const INFRA_WALLETS = [
  {
    label: "Hub Wallet",
    address: "v49jgwyQy9zu4oeemnq3ytjRkyiJth5HKiXSstk8aV5",
    notes: "Funded L4, L5, L7 deployers. BloomBot labeled. Drained to 0.05 SOL.",
    // Active during L4-L7 period
    dateFrom: "2025-09-01",
    dateTo: "2026-02-28",
    // Narrow window for transactions endpoint (max 4 days)
    txDateFrom: "2025-09-25",
    txDateTo: "2025-09-29",
  },
  {
    label: "Collection Wallet",
    address: "Bra1HUNKj1tcM3iKnL3pHc2m1rXkXZ9JELq4ceivag34",
    notes: "~380 SOL, inflows only. Profits aggregated here from deployers.",
    dateFrom: "2025-03-01",
    dateTo: "2026-03-20",
    txDateFrom: "2026-03-16",
    txDateTo: "2026-03-20",
  },
  {
    label: "Large Funding Source",
    address: "HVRcXaCFyUFG7iZLm3T1Qn8ZGDMHj3P3BpezUfWfRf2x",
    notes: "~2800 SOL, too noisy to monitor. Check for labels/entity info.",
    dateFrom: "2025-03-01",
    dateTo: "2026-03-20",
    txDateFrom: "2026-03-16",
    txDateTo: "2026-03-20",
  },
];

// Known network addresses for cross-referencing counterparties
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
  "8CvuX95RTCCBfUY8cUET8FQZusoY49yUkQxTEL2skYyq": "Cold USDC 1",
  "EAcUbdoiY8aCwJKdSo17fhU4uqMopW27K4oLqpstqfHe": "Cold USDC 2",
  "J6YUyB4P4LFfHqWxJvfXQC7ktFKgvx8rzfJFEzTNJmcT": "Coinbase Deposit",
  "21wG4F3ZR8gwGC47CkpD6ySBUgH9AABtYMBWFiYdTTgv": "Binance Deposit",
  "RB3dQF6TsinAUsQsvXtAyxMztMHXJ2GaZ3gdMuuHiw7": "Rollbit Deposit",
  "DcEYX34vm5JYHmYbCCQC141XGJektNHqhnGDUoUTdGsg": "Routes Binance",
  "52eC8Uy5eFkwpGbDbXp1FoarxkR8MonwUvpm2WT9ni5B": "JETNUT Deployer (L9 Funder)",
  "DuCzGNzSorXNgWKbx6koWTjd4P1AQaZHrNAdQu6NWmR8": "Eggsheeran",
  "9yj3zvLS3fDMqi1F8zhkaWfq8TZpZWHe6cz1Sgt7djXf": "Phantom Fee Wallet",
  "Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6": "MoonPay MP1",
  "GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE": "Coinbase CB9",
  "DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn": "CoinSpot Insider Trading",
  "Ed4UGBWK4UpwBKiGFkM2uQMTPpahPwxgxEWjJTRXuAJv": "Ed4UGBWK (UNRESOLVED)",
  "F7RV6aBWfniixoFkQNWmRwznDj2vae2XbusFfvMMjtbE": "F7RV6aBW (Network-Connected)",
};

// --- Nansen API ---

async function nansenPost(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`https://api.nansen.ai/api/v1${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apiKey: NANSEN_KEY! },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Nansen ${endpoint} ${res.status}: ${text}`);
  }
  return res.json();
}

async function nansenRelatedWallets(address: string) {
  return nansenPost("/profiler/address/related-wallets", { address, chain: "solana" });
}

async function nansenCounterparties(address: string, dateFrom: string, dateTo: string) {
  return nansenPost("/profiler/address/counterparties", {
    address,
    chain: "solana",
    date: { from: dateFrom, to: dateTo },
    group_by: "wallet",
    source_input: "Combined",
    pagination: { page: 1, per_page: 50 },
    order_by: [{ field: "total_volume_usd", direction: "DESC" }],
  });
}

async function nansenTransactions(address: string, dateFrom: string, dateTo: string) {
  return nansenPost("/profiler/address/transactions", {
    address,
    chain: "solana",
    date: { from: dateFrom, to: dateTo },
    pagination: { page: 1, per_page: 50 },
    order_by: [{ field: "block_timestamp", direction: "DESC" }],
  });
}

// --- Arkham API ---

async function arkhamGet(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`https://api.arkm.com${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { "API-Key": ARKHAM_KEY! } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Arkham ${endpoint} ${res.status}: ${text}`);
  }
  return res.json();
}

async function arkhamIntelligence(address: string) {
  return arkhamGet(`/intelligence/address/${address}`, { chain: "solana" });
}

async function arkhamTransfers(address: string, limit = "50") {
  return arkhamGet("/transfers", { base: address, chain: "solana", limit });
}

// --- Helpers ---

function tagCounterparty(address: string, apiLabel: string | null): string {
  const known = KNOWN_NETWORK[address];
  if (known) return `[KNOWN: ${known}]`;
  if (apiLabel) return `[API: ${apiLabel}]`;
  return "[UNKNOWN]";
}

// --- Main verification ---

async function verifyInfraWallet(wallet: typeof INFRA_WALLETS[number]) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Verifying: ${wallet.label}`);
  console.log(`Address: ${wallet.address}`);
  console.log(`Notes: ${wallet.notes}`);
  console.log("=".repeat(60));

  const result: Record<string, unknown> = {
    label: wallet.label,
    address: wallet.address,
    notes: wallet.notes,
    verified_at: new Date().toISOString(),
    nansen: {} as Record<string, unknown>,
    arkham: {} as Record<string, unknown>,
    network_connections: [] as string[],
    unknown_counterparties: [] as Record<string, unknown>[],
    errors: [] as string[],
  };

  // 1. Nansen Related Wallets (1 credit)
  console.log("\n[Nansen] Related wallets...");
  try {
    const related = await nansenRelatedWallets(wallet.address);
    (result.nansen as Record<string, unknown>).related_wallets = related;
    const data = (related as any)?.data;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`  Found ${data.length} related wallet(s):`);
      for (const r of data) {
        const tag = tagCounterparty(r.address, r.address_label);
        console.log(`    ${r.address?.slice(0, 16)}... ${tag} — ${r.relation}`);
        if (KNOWN_NETWORK[r.address]) {
          (result.network_connections as string[]).push(`${KNOWN_NETWORK[r.address]} (${r.relation})`);
        }
      }
    } else {
      console.log("  No related wallets found");
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
    (result.errors as string[]).push(`nansen_related: ${e.message}`);
  }
  await sleep(2000);

  // 2. Nansen Counterparties (5 credits)
  console.log(`[Nansen] Counterparties (${wallet.dateFrom} → ${wallet.dateTo})...`);
  try {
    const cp = await nansenCounterparties(wallet.address, wallet.dateFrom, wallet.dateTo);
    (result.nansen as Record<string, unknown>).counterparties = cp;
    const data = (cp as any)?.data;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`  Found ${data.length} counterparty(ies):`);
      for (const c of data) {
        const addr = c.counterparty_address || "?";
        const label = c.counterparty_address_label || null;
        const tag = tagCounterparty(addr, label);
        const vol = c.total_volume_usd?.toLocaleString() || "?";
        const inflow = c.volume_in_usd?.toLocaleString() || "0";
        const outflow = c.volume_out_usd?.toLocaleString() || "0";
        console.log(`    ${addr.slice(0, 16)}... ${tag} | vol=$${vol} | in=$${inflow} out=$${outflow} | ${c.interaction_count} txs`);

        if (KNOWN_NETWORK[addr]) {
          (result.network_connections as string[]).push(
            `${KNOWN_NETWORK[addr]} — $${vol} vol (in=$${inflow}, out=$${outflow})`
          );
        } else if (!label?.includes("Coinbase") && !label?.includes("MoonPay") && !label?.includes("Phantom")) {
          (result.unknown_counterparties as Record<string, unknown>[]).push({
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
    (result.errors as string[]).push(`nansen_counterparties: ${e.message}`);
  }
  await sleep(2000);

  // 3. Nansen Transactions — narrow window (1 credit)
  console.log(`[Nansen] Transactions (${wallet.txDateFrom} → ${wallet.txDateTo})...`);
  try {
    const txs = await nansenTransactions(wallet.address, wallet.txDateFrom, wallet.txDateTo);
    (result.nansen as Record<string, unknown>).transactions = txs;
    const data = (txs as any)?.data;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`  Found ${data.length} transaction(s) — latest 10:`);
      for (const tx of data.slice(0, 10)) {
        const ts = tx.block_timestamp || "?";
        const method = tx.method || "?";
        const vol = tx.volume_usd ? `$${Number(tx.volume_usd).toLocaleString()}` : "$?";
        console.log(`    ${ts} | ${method} | ${vol}`);
      }
    } else {
      console.log("  No transactions in window");
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
    (result.errors as string[]).push(`nansen_transactions: ${e.message}`);
  }
  await sleep(2000);

  // 4. Arkham Intelligence
  console.log("[Arkham] Intelligence...");
  try {
    const intel = await arkhamIntelligence(wallet.address);
    (result.arkham as Record<string, unknown>).intelligence = intel;
    const entity = (intel as any)?.arkhamEntity;
    const label = (intel as any)?.arkhamLabel;
    if (entity) {
      console.log(`  Entity: ${entity.name} (${entity.type || "?"})`);
    } else if (label) {
      console.log(`  Label: ${JSON.stringify(label)}`);
    } else {
      console.log("  No entity/label found");
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
    (result.errors as string[]).push(`arkham_intelligence: ${e.message}`);
  }
  await sleep(2000);

  // 5. Arkham Transfers
  console.log("[Arkham] Transfers (last 50)...");
  try {
    const transfers = await arkhamTransfers(wallet.address, "50");
    (result.arkham as Record<string, unknown>).transfers = transfers;
    const data = (transfers as any)?.transfers;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`  Found ${data.length} transfer(s) — latest 10:`);
      for (const t of data.slice(0, 10)) {
        const fromAddr = t.fromAddress?.address || "?";
        const toAddr = t.toAddress?.address || "?";
        const fromName = t.fromAddress?.arkhamEntity?.name || KNOWN_NETWORK[fromAddr] || fromAddr.slice(0, 12);
        const toName = t.toAddress?.arkhamEntity?.name || KNOWN_NETWORK[toAddr] || toAddr.slice(0, 12);
        const val = t.unitValue ? `${Number(t.unitValue).toFixed(4)} ${t.tokenSymbol || "SOL"}` : "?";
        const usd = t.historicalUSD ? `$${Number(t.historicalUSD).toFixed(2)}` : "";
        console.log(`    ${t.blockTimestamp || "?"} | ${fromName} → ${toName} | ${val} ${usd}`);

        // Flag known network addresses in transfers
        if (KNOWN_NETWORK[fromAddr] && fromAddr !== wallet.address) {
          (result.network_connections as string[]).push(`Arkham transfer FROM ${KNOWN_NETWORK[fromAddr]}`);
        }
        if (KNOWN_NETWORK[toAddr] && toAddr !== wallet.address) {
          (result.network_connections as string[]).push(`Arkham transfer TO ${KNOWN_NETWORK[toAddr]}`);
        }
      }
    } else {
      console.log("  No transfers found");
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
    (result.errors as string[]).push(`arkham_transfers: ${e.message}`);
  }

  // Summary
  const connections = [...new Set(result.network_connections as string[])];
  result.network_connections = connections;
  console.log(`\n--- SUMMARY for ${wallet.label} ---`);
  console.log(`  Network connections: ${connections.length}`);
  for (const c of connections) console.log(`    - ${c}`);
  console.log(`  Unknown counterparties: ${(result.unknown_counterparties as any[]).length}`);
  for (const u of (result.unknown_counterparties as any[])) {
    console.log(`    - ${u.address.slice(0, 16)}... ${u.label || "unlabeled"} | vol=$${u.total_volume_usd?.toLocaleString()}`);
  }
  console.log(`  Errors: ${(result.errors as string[]).length}`);

  return result;
}

async function main() {
  const targetLabel = process.argv[2];
  const targets = targetLabel
    ? INFRA_WALLETS.filter((w) => w.label.toLowerCase().includes(targetLabel.toLowerCase()))
    : INFRA_WALLETS;

  if (targets.length === 0) {
    console.error(`No wallet matching "${targetLabel}". Available: ${INFRA_WALLETS.map((w) => w.label).join(", ")}`);
    process.exit(1);
  }

  console.log(`Verifying ${targets.length} infrastructure wallet(s)...`);
  console.log(`Nansen credits per wallet: ~7 (related=1, counterparties=5, txs=1)`);
  console.log(`Total estimated Nansen credits: ${targets.length * 7}\n`);

  const allResults: Record<string, unknown>[] = [];

  for (const wallet of targets) {
    const result = await verifyInfraWallet(wallet);
    allResults.push(result);
    if (targets.indexOf(wallet) < targets.length - 1) await sleep(3000);
  }

  const outputPath = join(resultsDir, "infra-verify.json");
  writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results saved to: ${outputPath}`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
