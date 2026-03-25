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

if (!NANSEN_KEY) throw new Error("NANSEN_API_KEY not set in .env");
if (!ARKHAM_KEY) throw new Error("ARKAN_API_KEY not set in .env");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Deployer wallets with date context for API queries
const DEPLOYERS = [
  {
    label: "OG (L1-L3)",
    address: "37XxihfsTW1EFSJJherWFRFWcAFhj4KQ66cXHiegSKg2",
    // Funded 2025-03-22, active through present
    dateFrom: "2025-03-01",
    dateTo: "2026-03-20",
  },
  {
    label: "L4",
    address: "D7MsVpaXFP9sBCr8em4g4iGKYLBg2C2iwCAhBVUNHLXb",
    dateFrom: "2025-09-25",
    dateTo: "2025-10-05",
  },
  {
    label: "L5",
    address: "DBmxMiP8xeiZ4T45AviCjZCmmmTFETFU8VtsC8vdJZWy",
    dateFrom: "2025-10-30",
    dateTo: "2025-11-10",
  },
  {
    label: "L6",
    address: "Bz2yexdH6YyDbru3nmUmeex2ZZyfpKLgmAN7w4C2Bt4Y",
    dateFrom: "2025-11-27",
    dateTo: "2026-01-05",
  },
  {
    label: "L7",
    address: "HYMtCcfQTkBGw7uufDZtYHzg48pUmmBWPf5S44akPfdG",
    dateFrom: "2026-01-15",
    dateTo: "2026-02-05",
  },
  {
    label: "L8",
    address: "75YFxMtMiR22LsBxa75yN5jxCGYorpZoCMhnjwwuugzE",
    dateFrom: "2026-01-28",
    dateTo: "2026-02-15",
  },
  {
    label: "L9",
    address: "3VmNQ8ForGkoBpvyHyfS31VQuQqWn4NuxTTsvf7bGGot",
    dateFrom: "2026-02-10",
    dateTo: "2026-03-01",
  },
  {
    label: "L10",
    address: "2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB",
    dateFrom: "2026-03-12",
    dateTo: "2026-03-20",
  },
];

// --- Nansen API ---

async function nansenPost(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`https://api.nansen.ai/api/v1${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apiKey: NANSEN_KEY!,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Nansen ${endpoint} ${res.status}: ${text}`);
  }
  return res.json();
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

async function nansenRelatedWallets(address: string) {
  return nansenPost("/profiler/address/related-wallets", {
    address,
    chain: "solana",
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
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { "API-Key": ARKHAM_KEY! },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Arkham ${endpoint} ${res.status}: ${text}`);
  }
  return res.json();
}

async function arkhamIntelligence(address: string) {
  return arkhamGet(`/intelligence/address/${address}`, { chain: "solana" });
}

async function arkhamTransfers(address: string, limit: string = "50") {
  return arkhamGet("/transfers", {
    base: address,
    chain: "solana",
    limit,
  });
}

async function arkhamCounterparties(address: string) {
  return arkhamGet(`/counterparties/address/${address}`, { chain: "solana" });
}

// --- Main ---

async function verifyDeployer(deployer: typeof DEPLOYERS[number]) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Verifying: ${deployer.label} — ${deployer.address}`);
  console.log(`Date range: ${deployer.dateFrom} → ${deployer.dateTo}`);
  console.log("=".repeat(60));

  const result: Record<string, unknown> = {
    label: deployer.label,
    address: deployer.address,
    dateRange: { from: deployer.dateFrom, to: deployer.dateTo },
    verified_at: new Date().toISOString(),
    nansen: {},
    arkham: {},
    errors: [] as string[],
  };

  // --- Nansen calls ---

  // 1. Related wallets (1 credit)
  console.log("\n[Nansen] Related wallets...");
  try {
    const related = await nansenRelatedWallets(deployer.address);
    (result.nansen as Record<string, unknown>).related_wallets = related;
    const data = (related as any)?.data;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`  Found ${data.length} related wallet(s):`);
      for (const r of data.slice(0, 10)) {
        console.log(`    ${r.address?.slice(0, 16)}... — ${r.relation} (${r.address_label || "unlabeled"})`);
      }
    } else {
      console.log("  No related wallets found");
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
    (result.errors as string[]).push(`nansen_related: ${e.message}`);
  }
  await sleep(2000);

  // 2. Counterparties (5 credits)
  console.log("[Nansen] Counterparties...");
  try {
    const cp = await nansenCounterparties(deployer.address, deployer.dateFrom, deployer.dateTo);
    (result.nansen as Record<string, unknown>).counterparties = cp;
    const data = (cp as any)?.data;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`  Found ${data.length} counterparty(ies) — top 10:`);
      for (const c of data.slice(0, 10)) {
        const label = c.counterparty_address_label || "unlabeled";
        const addr = c.counterparty_address?.slice(0, 16) || "?";
        console.log(`    ${addr}... — ${label} | vol=$${c.total_volume_usd?.toLocaleString()} | in=$${c.volume_in_usd?.toLocaleString()} out=$${c.volume_out_usd?.toLocaleString()} | ${c.interaction_count} txs`);
      }
    } else {
      console.log("  No counterparties found");
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
    (result.errors as string[]).push(`nansen_counterparties: ${e.message}`);
  }
  await sleep(2000);

  // 3. Transactions — use a narrow window around deploy date (max 4 days)
  // For deployers with wide date ranges, narrow to 4 days around the deploy
  const txDateFrom = deployer.dateFrom;
  const txDateTo = (() => {
    const from = new Date(deployer.dateFrom);
    const to = new Date(deployer.dateTo);
    const diff = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    if (diff > 4) {
      // Use last 4 days of the range (most relevant — around deploy)
      const narrow = new Date(to.getTime() - 4 * 24 * 60 * 60 * 1000);
      return narrow.toISOString().split("T")[0];
    }
    return deployer.dateFrom;
  })();

  console.log(`[Nansen] Transactions (${txDateTo} → ${deployer.dateTo})...`);
  try {
    const txs = await nansenTransactions(deployer.address, txDateTo, deployer.dateTo);
    (result.nansen as Record<string, unknown>).transactions = txs;
    const data = (txs as any)?.data;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`  Found ${data.length} transaction(s) — latest 5:`);
      for (const tx of data.slice(0, 5)) {
        const ts = tx.block_timestamp || "?";
        const method = tx.method || "?";
        const vol = tx.volume_usd ? `$${tx.volume_usd.toLocaleString()}` : "$?";
        console.log(`    ${ts} | ${method} | ${vol}`);
      }
    } else {
      console.log("  No transactions found in window");
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
    (result.errors as string[]).push(`nansen_transactions: ${e.message}`);
  }
  await sleep(2000);

  // --- Arkham calls ---

  // 4. Intelligence / labels
  console.log("[Arkham] Intelligence...");
  try {
    const intel = await arkhamIntelligence(deployer.address);
    (result.arkham as Record<string, unknown>).intelligence = intel;
    const entity = (intel as any)?.arkhamEntity;
    const label = (intel as any)?.arkhamLabel;
    if (entity) {
      console.log(`  Entity: ${entity.name} (${entity.type || "?"})`);
    } else if (label) {
      console.log(`  Label: ${JSON.stringify(label)}`);
    } else {
      console.log("  No entity/label found (unlabeled address)");
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
    (result.errors as string[]).push(`arkham_intelligence: ${e.message}`);
  }
  await sleep(2000);

  // 5. Transfers
  console.log("[Arkham] Transfers (last 50)...");
  try {
    const transfers = await arkhamTransfers(deployer.address, "50");
    (result.arkham as Record<string, unknown>).transfers = transfers;
    const data = (transfers as any)?.transfers;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`  Found ${data.length} transfer(s) — latest 10:`);
      for (const t of data.slice(0, 10)) {
        const from = t.fromAddress?.arkhamEntity?.name || t.fromAddress?.address?.slice(0, 12) || "?";
        const to = t.toAddress?.arkhamEntity?.name || t.toAddress?.address?.slice(0, 12) || "?";
        const val = t.unitValue ? `${Number(t.unitValue).toFixed(4)} ${t.tokenSymbol || "SOL"}` : "?";
        const usd = t.historicalUSD ? `$${Number(t.historicalUSD).toFixed(2)}` : "";
        console.log(`    ${t.blockTimestamp || "?"} | ${from} → ${to} | ${val} ${usd}`);
      }
    } else {
      console.log("  No transfers found");
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
    (result.errors as string[]).push(`arkham_transfers: ${e.message}`);
  }
  await sleep(2000);

  // 6. Counterparties
  console.log("[Arkham] Counterparties...");
  try {
    const cp = await arkhamCounterparties(deployer.address);
    (result.arkham as Record<string, unknown>).counterparties = cp;
    const data = (cp as any)?.counterparties;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`  Found ${data.length} counterparty(ies) — top 10:`);
      for (const c of data.slice(0, 10)) {
        const name = c.entity?.name || c.address?.slice(0, 16) || "?";
        const vol = c.totalUSD ? `$${Number(c.totalUSD).toFixed(2)}` : "?";
        console.log(`    ${name} | ${vol}`);
      }
    } else {
      console.log("  No counterparties found");
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
    (result.errors as string[]).push(`arkham_counterparties: ${e.message}`);
  }

  return result;
}

async function main() {
  // Allow selecting a specific deployer via CLI arg
  const targetLabel = process.argv[2]; // e.g., "L4" or "OG"
  const targets = targetLabel
    ? DEPLOYERS.filter((d) => d.label.includes(targetLabel))
    : DEPLOYERS;

  if (targets.length === 0) {
    console.error(`No deployer found matching "${targetLabel}". Available: ${DEPLOYERS.map((d) => d.label).join(", ")}`);
    process.exit(1);
  }

  console.log(`\nVerifying ${targets.length} deployer wallet(s)...`);
  console.log(`APIs: Nansen (counterparties=5cr, related=1cr, txs=1cr) + Arkham (intel, transfers, counterparties)`);
  console.log(`Estimated Nansen credits: ${targets.length * 7}\n`);

  const allResults: Record<string, unknown>[] = [];

  for (const deployer of targets) {
    const result = await verifyDeployer(deployer);
    allResults.push(result);
    await sleep(2000); // Gap between deployers
  }

  const outputPath = join(resultsDir, targetLabel
    ? `deployer-verify-${targetLabel.replace(/[^a-zA-Z0-9]/g, "")}.json`
    : "deployer-verify-all.json"
  );
  writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results saved to: ${outputPath}`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
