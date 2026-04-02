import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rawDir = join(__dirname, "..", "data", "results", "raw");
mkdirSync(rawDir, { recursive: true });

const HELIUS_KEY = process.env.HELIUS_API_KEY;
if (!HELIUS_KEY) throw new Error("HELIUS_API_KEY not set");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Wallet addresses — copied exactly from task description, do NOT retype
const WALLETS = {
  fireblocks_passthrough: "9exPdTUVTCz9EKvZjXkKJSTJ5fZzJuwJHnFptrUFHFNH",
  wallet_9cDDJ5g2: "9cDDJ5g2wPqVZUZwpPuwqzxN7ouvc6QFauFwrX2TTTAX",
  secondary_aggregator: "2q8nSJgCpaZZjchK4s7mGy3f9tAJgsXZQQHDfKMB4EN7",
  token_millionaire: "49mvMufixEbUMzZEUVAnbQ8hLLuEWy789XfKUNTz7wCv",
};

interface Transfer {
  signature: string;
  timestamp: number;
  direction: "in" | "out";
  counterparty: string;
  mint: string;
  symbol: string;
  amount: number;
  amountRaw: string;
  decimals: number;
}

interface TransferPage {
  data: Transfer[];
  pagination: { hasMore: boolean; nextCursor?: string };
}

async function getTransfers(
  address: string,
  maxPages: number = 20
): Promise<Transfer[]> {
  const all: Transfer[] = [];
  let cursor: string | undefined;
  let page = 0;

  while (page < maxPages) {
    const url = new URL(
      `https://api.helius.xyz/v1/wallet/${address}/transfers`
    );
    url.searchParams.set("api-key", HELIUS_KEY!);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Helius transfers ${res.status}: ${body}`);
    }

    const json: TransferPage = await res.json();
    all.push(...json.data);
    page++;

    console.log(
      `    Page ${page}: ${json.data.length} transfers (total: ${all.length})`
    );

    if (!json.pagination.hasMore || !json.pagination.nextCursor) break;
    cursor = json.pagination.nextCursor;

    // Wallet API rate limit: 10 req/sec, use 150ms delay
    await sleep(150);
  }

  return all;
}

interface CounterpartySummary {
  address: string;
  shortAddr: string;
  inCount: number;
  outCount: number;
  inAmount: number;
  outAmount: number;
  netAmount: number;
  mints: Set<string>;
  symbols: Set<string>;
}

function summarizeCounterparties(transfers: Transfer[]): CounterpartySummary[] {
  const map = new Map<string, CounterpartySummary>();

  for (const t of transfers) {
    if (!t.counterparty) continue;
    let cp = map.get(t.counterparty);
    if (!cp) {
      cp = {
        address: t.counterparty,
        shortAddr: t.counterparty.slice(0, 8),
        inCount: 0,
        outCount: 0,
        inAmount: 0,
        outAmount: 0,
        netAmount: 0,
        mints: new Set(),
        symbols: new Set(),
      };
      map.set(t.counterparty, cp);
    }

    if (t.direction === "in") {
      cp.inCount++;
      cp.inAmount += t.amount;
    } else {
      cp.outCount++;
      cp.outAmount += t.amount;
    }
    cp.netAmount = cp.inAmount - cp.outAmount;
    cp.mints.add(t.mint);
    cp.symbols.add(t.symbol || t.mint.slice(0, 8));
  }

  return Array.from(map.values()).sort(
    (a, b) => b.inAmount + b.outAmount - (a.inAmount + a.outAmount)
  );
}

function printTopCounterparties(
  label: string,
  summaries: CounterpartySummary[],
  limit: number = 15
) {
  console.log(`\n  Top ${limit} counterparties for ${label}:`);
  console.log(
    `  ${"Address".padEnd(14)} ${"In#".padStart(4)} ${"Out#".padStart(4)} ${"In Amt".padStart(14)} ${"Out Amt".padStart(14)} ${"Symbols".padEnd(20)}`
  );
  console.log(`  ${"-".repeat(80)}`);

  for (const cp of summaries.slice(0, limit)) {
    const symbols = Array.from(cp.symbols).join(",");
    console.log(
      `  ${(cp.shortAddr + "...").padEnd(14)} ${String(cp.inCount).padStart(4)} ${String(cp.outCount).padStart(4)} ${cp.inAmount.toFixed(4).padStart(14)} ${cp.outAmount.toFixed(4).padStart(14)} ${symbols.padEnd(20)}`
    );
  }
}

async function main() {
  console.log("=== Route C Verification via Helius Transfers ===\n");
  console.log("Goal: Trace 9exPdTUV → 9cDDJ5g2 → ? (2q8nSJgC or Token Millionaire)\n");

  const results: Record<string, any> = {
    metadata: {
      run_at: new Date().toISOString(),
      purpose: "Verify Route C fund flow: fireblocks_passthrough -> 9cDDJ5g2 -> ?",
      wallets: WALLETS,
    },
    wallets: {},
  };

  // ========== Step 1: Get transfers for 9exPdTUV (fireblocks_passthrough) ==========
  console.log(
    `--- Step 1: Fetching transfers for fireblocks_passthrough (${WALLETS.fireblocks_passthrough.slice(0, 8)}...) ---`
  );
  const passTransfers = await getTransfers(WALLETS.fireblocks_passthrough);
  console.log(`  Total transfers: ${passTransfers.length}`);

  const passSummaries = summarizeCounterparties(passTransfers);
  printTopCounterparties("fireblocks_passthrough (9exPdTUV)", passSummaries);

  // Check outflows specifically to 9cDDJ5g2
  const outTo9cDD = passTransfers.filter(
    (t) =>
      t.direction === "out" &&
      t.counterparty === WALLETS.wallet_9cDDJ5g2
  );
  console.log(
    `\n  Outflows to 9cDDJ5g2: ${outTo9cDD.length} transfers, total ${outTo9cDD.reduce((s, t) => s + t.amount, 0).toFixed(6)}`
  );

  results.wallets.fireblocks_passthrough = {
    address: WALLETS.fireblocks_passthrough,
    total_transfers: passTransfers.length,
    transfers: passTransfers,
    counterparty_summary: passSummaries.map((cp) => ({
      ...cp,
      mints: Array.from(cp.mints),
      symbols: Array.from(cp.symbols),
    })),
    outflows_to_9cDDJ5g2: {
      count: outTo9cDD.length,
      total_amount: outTo9cDD.reduce((s, t) => s + t.amount, 0),
      transfers: outTo9cDD,
    },
  };

  // Small delay between wallets
  await sleep(500);

  // ========== Step 2: Get transfers for 9cDDJ5g2 ==========
  console.log(
    `\n--- Step 2: Fetching transfers for 9cDDJ5g2 (${WALLETS.wallet_9cDDJ5g2.slice(0, 8)}...) ---`
  );
  const aggTransfers = await getTransfers(WALLETS.wallet_9cDDJ5g2);
  console.log(`  Total transfers: ${aggTransfers.length}`);

  const aggSummaries = summarizeCounterparties(aggTransfers);
  printTopCounterparties("9cDDJ5g2", aggSummaries);

  // Check outflows to specific targets
  const outTo2q8n = aggTransfers.filter(
    (t) =>
      t.direction === "out" &&
      t.counterparty === WALLETS.secondary_aggregator
  );
  const outToTM = aggTransfers.filter(
    (t) =>
      t.direction === "out" &&
      t.counterparty === WALLETS.token_millionaire
  );
  const inFrom9ex = aggTransfers.filter(
    (t) =>
      t.direction === "in" &&
      t.counterparty === WALLETS.fireblocks_passthrough
  );

  console.log(
    `\n  Inflows from 9exPdTUV: ${inFrom9ex.length} transfers, total ${inFrom9ex.reduce((s, t) => s + t.amount, 0).toFixed(6)}`
  );
  console.log(
    `  Outflows to 2q8nSJgC (secondary_aggregator): ${outTo2q8n.length} transfers, total ${outTo2q8n.reduce((s, t) => s + t.amount, 0).toFixed(6)}`
  );
  console.log(
    `  Outflows to Token Millionaire: ${outToTM.length} transfers, total ${outToTM.reduce((s, t) => s + t.amount, 0).toFixed(6)}`
  );

  // Also identify ALL outflow destinations
  const allOutflows = aggTransfers.filter((t) => t.direction === "out");
  const outflowByDest = new Map<string, { count: number; total: number }>();
  for (const t of allOutflows) {
    const key = t.counterparty || "UNKNOWN";
    const entry = outflowByDest.get(key) || { count: 0, total: 0 };
    entry.count++;
    entry.total += t.amount;
    outflowByDest.set(key, entry);
  }
  const sortedOutflows = Array.from(outflowByDest.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10);

  console.log(`\n  Top outflow destinations from 9cDDJ5g2:`);
  for (const [addr, info] of sortedOutflows) {
    const short = addr.slice(0, 8);
    let label = "";
    if (addr === WALLETS.secondary_aggregator) label = " [secondary_aggregator / 2q8nSJgC]";
    else if (addr === WALLETS.token_millionaire) label = " [Token Millionaire]";
    else if (addr === WALLETS.fireblocks_passthrough) label = " [fireblocks_passthrough / 9exPdTUV]";
    console.log(
      `    ${short}...  ${info.count} txs, ${info.total.toFixed(6)} total${label}`
    );
  }

  results.wallets.wallet_9cDDJ5g2 = {
    address: WALLETS.wallet_9cDDJ5g2,
    total_transfers: aggTransfers.length,
    transfers: aggTransfers,
    counterparty_summary: aggSummaries.map((cp) => ({
      ...cp,
      mints: Array.from(cp.mints),
      symbols: Array.from(cp.symbols),
    })),
    inflows_from_9exPdTUV: {
      count: inFrom9ex.length,
      total_amount: inFrom9ex.reduce((s, t) => s + t.amount, 0),
    },
    outflows_to_secondary_aggregator: {
      count: outTo2q8n.length,
      total_amount: outTo2q8n.reduce((s, t) => s + t.amount, 0),
      transfers: outTo2q8n,
    },
    outflows_to_token_millionaire: {
      count: outToTM.length,
      total_amount: outToTM.reduce((s, t) => s + t.amount, 0),
      transfers: outToTM,
    },
    all_outflow_destinations: sortedOutflows.map(([addr, info]) => ({
      address: addr,
      count: info.count,
      total_amount: info.total,
    })),
  };

  // ========== VERDICT ==========
  console.log("\n" + "=".repeat(60));
  console.log("=== ROUTE C VERDICT ===");
  console.log("=".repeat(60));

  console.log(
    `\n  9exPdTUV (fireblocks_passthrough) → 9cDDJ5g2:`
  );
  console.log(
    `    ${outTo9cDD.length} outflows, ${outTo9cDD.reduce((s, t) => s + t.amount, 0).toFixed(6)} SOL total`
  );

  if (outTo2q8n.length > 0 && outToTM.length > 0) {
    console.log(
      `\n  9cDDJ5g2 → 2q8nSJgC (secondary_aggregator): ${outTo2q8n.length} txs, ${outTo2q8n.reduce((s, t) => s + t.amount, 0).toFixed(6)}`
    );
    console.log(
      `  9cDDJ5g2 → Token Millionaire: ${outToTM.length} txs, ${outToTM.reduce((s, t) => s + t.amount, 0).toFixed(6)}`
    );
    console.log(
      "\n  VERDICT: 9cDDJ5g2 forwards to BOTH secondary_aggregator AND Token Millionaire"
    );
  } else if (outTo2q8n.length > 0) {
    console.log(
      `\n  9cDDJ5g2 → 2q8nSJgC (secondary_aggregator): ${outTo2q8n.length} txs, ${outTo2q8n.reduce((s, t) => s + t.amount, 0).toFixed(6)}`
    );
    console.log(
      `  9cDDJ5g2 → Token Millionaire: NONE`
    );
    console.log(
      "\n  VERDICT: Route C is 9exPdTUV → 9cDDJ5g2 → 2q8nSJgC (secondary_aggregator)"
    );
  } else if (outToTM.length > 0) {
    console.log(
      `\n  9cDDJ5g2 → 2q8nSJgC (secondary_aggregator): NONE`
    );
    console.log(
      `  9cDDJ5g2 → Token Millionaire: ${outToTM.length} txs, ${outToTM.reduce((s, t) => s + t.amount, 0).toFixed(6)}`
    );
    console.log(
      "\n  VERDICT: Route C is 9exPdTUV → 9cDDJ5g2 → Token Millionaire (direct, bypasses 2q8nSJgC)"
    );
  } else {
    console.log(
      `\n  9cDDJ5g2 → 2q8nSJgC: NONE`
    );
    console.log(
      `  9cDDJ5g2 → Token Millionaire: NONE`
    );
    if (sortedOutflows.length > 0) {
      const topDest = sortedOutflows[0];
      console.log(
        `  VERDICT: 9cDDJ5g2 forwards to NEITHER expected target. Top destination: ${topDest[0].slice(0, 12)}... (${topDest[1].count} txs, ${topDest[1].total.toFixed(6)})`
      );
    } else {
      console.log("  VERDICT: No outflows found from 9cDDJ5g2");
    }
  }

  results.verdict = {
    step1_confirmed: outTo9cDD.length > 0,
    step1_outflows_to_9cDDJ5g2: outTo9cDD.length,
    step2_forwards_to_2q8nSJgC: outTo2q8n.length > 0,
    step2_outflows_to_2q8nSJgC: outTo2q8n.length,
    step2_forwards_to_token_millionaire: outToTM.length > 0,
    step2_outflows_to_token_millionaire: outToTM.length,
    top_outflow_destination:
      sortedOutflows.length > 0
        ? {
            address: sortedOutflows[0][0],
            count: sortedOutflows[0][1].count,
            total: sortedOutflows[0][1].total,
          }
        : null,
  };

  // Save raw results
  const outputPath = join(rawDir, "route-c-verification.json");
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nRaw results saved to: ${outputPath}`);
  console.log(
    `Credit cost: ~${Math.ceil(passTransfers.length / 100) + Math.ceil(aggTransfers.length / 100)} pages x 100 = ${(Math.ceil(passTransfers.length / 100) + Math.ceil(aggTransfers.length / 100)) * 100} credits`
  );
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
