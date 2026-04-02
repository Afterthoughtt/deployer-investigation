import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");
const resultsDir = join(dataDir, "results", "raw");
mkdirSync(resultsDir, { recursive: true });

const HELIUS_KEY = process.env.HELIUS_API_KEY!;
const NANSEN_KEY = process.env.NANSEN_API_KEY!;
const ARKHAM_KEY = process.env.ARKAN_API_KEY!;

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const HELIUS_API = `https://api.helius.xyz`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- Helius ---
async function heliusFundedBy(address: string) {
  const res = await fetch(`${HELIUS_API}/v1/wallet/${address}/funded-by?api-key=${HELIUS_KEY}`);
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error(`funded-by ${res.status}: ${await res.text()}`);
  return res.json();
}

async function heliusTransfers(address: string, limit = 100) {
  const res = await fetch(`${HELIUS_API}/v1/wallet/${address}/transfers?api-key=${HELIUS_KEY}&limit=${limit}`);
  if (!res.ok) throw new Error(`transfers ${res.status}: ${await res.text()}`);
  return res.json();
}

// --- Nansen ---
async function nansenRelatedWallets(address: string) {
  const res = await fetch("https://api.nansen.ai/api/v1/profiler/address/related-wallets", {
    method: "POST",
    headers: { "Content-Type": "application/json", apiKey: NANSEN_KEY },
    body: JSON.stringify({ address, chain: "solana" }),
  });
  if (!res.ok) throw new Error(`Nansen related ${res.status}: ${await res.text()}`);
  return res.json();
}

// --- Arkham ---
async function arkhamTransfers(address: string, limit = "50") {
  const res = await fetch(`https://api.arkm.com/transfers?base=${address}&chain=solana&limit=${limit}`, {
    headers: { "API-Key": ARKHAM_KEY },
  });
  if (!res.ok) throw new Error(`Arkham transfers ${res.status}: ${await res.text()}`);
  return res.json();
}

// ========================================
// VERIFICATION TARGETS
// ========================================

const results: Record<string, any> = {
  metadata: {
    run_at: new Date().toISOString(),
    purpose: "Re-verify 5 suspect addresses flagged by audit",
  },
};

async function main() {
  // -------------------------------------------------------
  // 1. Hub Wallet first funder
  //    Notes say: 9Z83ZAtd7vjEFvXfPE5C4qE3YGLN7TgrKPaqgEhYJw56
  //    Raw file says: 9Z83ZAtd7vjEFvXfKkjBZtAPTgeJZ1GzK7b1Uf1E3DsF
  // -------------------------------------------------------
  console.log("=== 1. HUB WALLET FIRST FUNDER ===");
  const hubAddr = "v49jgwyQy9zu4oeemnq3ytjRkyiJth5HKiXSstk8aV5";

  console.log("[Helius funded-by]");
  const hubFundedBy = await heliusFundedBy(hubAddr);
  results.hub_wallet_funded_by = hubFundedBy;
  console.log(`  Funder: ${(hubFundedBy as any).funder}`);
  console.log(`  Name: ${(hubFundedBy as any).funderName}`);
  console.log(`  Type: ${(hubFundedBy as any).funderType}`);
  console.log(`  Amount: ${(hubFundedBy as any).amount} SOL`);
  console.log(`  Date: ${(hubFundedBy as any).date}`);
  await sleep(120);

  console.log("[Nansen related-wallets]");
  await sleep(2000);
  const hubRelated = await nansenRelatedWallets(hubAddr);
  results.hub_wallet_nansen_related = hubRelated;
  const hubData = (hubRelated as any)?.data;
  if (Array.isArray(hubData)) {
    for (const r of hubData) {
      console.log(`  ${r.relation}: ${r.address} [${r.address_label || "unlabeled"}]`);
    }
  }

  // -------------------------------------------------------
  // 2. Collection Wallet first funder (CB1 verification)
  //    Notes say: 5g7yNHyGLJ7fiQ9SN9mfWoTWqJhC2QqQeHQGqPf3Mfir
  //    Raw file says: 5g7yNHyGLJ7fiQ9SN9mf47opDnMjc585kqXWt6d7aBWs
  // -------------------------------------------------------
  console.log("\n=== 2. COLLECTION WALLET FIRST FUNDER (CB1) ===");
  const collectionAddr = "Bra1HUNKj1tcM3iKnL3pHc2m1rXkXZ9JELq4ceivag34";

  console.log("[Helius funded-by]");
  await sleep(120);
  const collFundedBy = await heliusFundedBy(collectionAddr);
  results.collection_wallet_funded_by = collFundedBy;
  console.log(`  Funder: ${(collFundedBy as any).funder}`);
  console.log(`  Name: ${(collFundedBy as any).funderName}`);
  console.log(`  Type: ${(collFundedBy as any).funderType}`);
  console.log(`  Amount: ${(collFundedBy as any).amount} SOL`);
  await sleep(120);

  console.log("[Nansen related-wallets]");
  await sleep(2000);
  const collRelated = await nansenRelatedWallets(collectionAddr);
  results.collection_wallet_nansen_related = collRelated;
  const collData = (collRelated as any)?.data;
  if (Array.isArray(collData)) {
    for (const r of collData) {
      console.log(`  ${r.relation}: ${r.address} [${r.address_label || "unlabeled"}]`);
    }
  }

  // -------------------------------------------------------
  // 3. 2q8nSJgC first funder
  //    Notes say: DZFW9vYwHzQWYm6PtU9J...
  //    Raw file says: 56pfQ9C38WKqUTrVzkZTS4q8oMzaN8Cdh1u7JScC7fGo
  // -------------------------------------------------------
  console.log("\n=== 3. 2q8nSJgC FIRST FUNDER ===");
  const aggAddr = "2q8nSJgCpaZZjchK4s7mGy3f9tAJgsXZQQHDfKMB4EN7";

  console.log("[Helius funded-by]");
  await sleep(120);
  const aggFundedBy = await heliusFundedBy(aggAddr);
  results.secondary_aggregator_funded_by = aggFundedBy;
  console.log(`  Funder: ${(aggFundedBy as any).funder}`);
  console.log(`  Name: ${(aggFundedBy as any).funderName}`);
  console.log(`  Type: ${(aggFundedBy as any).funderType}`);
  console.log(`  Amount: ${(aggFundedBy as any).amount} SOL`);
  await sleep(120);

  console.log("[Nansen related-wallets]");
  await sleep(2000);
  const aggRelated = await nansenRelatedWallets(aggAddr);
  results.secondary_aggregator_nansen_related = aggRelated;
  const aggData = (aggRelated as any)?.data;
  if (Array.isArray(aggData)) {
    for (const r of aggData) {
      console.log(`  ${r.relation}: ${r.address} [${r.address_label || "unlabeled"}]`);
    }
  }

  // -------------------------------------------------------
  // 4. Ed4UGBWK — Arkham transfers to find Rollbit deposits
  //    Notes say: RB5KKB7h... and RB2Yz3VS... but no raw data saved
  // -------------------------------------------------------
  console.log("\n=== 4. Ed4UGBWK ARKHAM TRANSFERS (Rollbit check) ===");
  const ed4Addr = "Ed4UGBWK4UpwBKiGFkM2uQMTPpahPwxgxEWjJTRXuAJv";

  console.log("[Arkham transfers — looking for Rollbit deposits]");
  const ed4Transfers = await arkhamTransfers(ed4Addr, "100");
  results.ed4ugbwk_arkham_transfers = ed4Transfers;
  const ed4Data = (ed4Transfers as any)?.transfers;
  if (Array.isArray(ed4Data)) {
    console.log(`  Total transfers returned: ${ed4Data.length}`);
    // Filter for Rollbit-related (RB prefix or Rollbit entity)
    const rollbitTxs = ed4Data.filter((t: any) => {
      const toAddr = t.toAddress?.address || "";
      const fromAddr = t.fromAddress?.address || "";
      const toName = t.toAddress?.arkhamEntity?.name || "";
      const fromName = t.fromAddress?.arkhamEntity?.name || "";
      return toAddr.startsWith("RB") || fromAddr.startsWith("RB") ||
        toName.toLowerCase().includes("rollbit") || fromName.toLowerCase().includes("rollbit");
    });
    console.log(`  Rollbit-related transfers: ${rollbitTxs.length}`);
    for (const t of rollbitTxs) {
      const from = t.fromAddress?.address || "?";
      const to = t.toAddress?.address || "?";
      const fromName = t.fromAddress?.arkhamEntity?.name || "";
      const toName = t.toAddress?.arkhamEntity?.name || "";
      const val = t.unitValue ? `${Number(t.unitValue).toFixed(4)} ${t.tokenSymbol || "SOL"}` : "?";
      const usd = t.historicalUSD ? `$${Number(t.historicalUSD).toFixed(2)}` : "";
      console.log(`  ${(t.blockTimestamp || "?").slice(0, 19)} | ${from.slice(0, 12)}(${fromName}) → ${to.slice(0, 12)}(${toName}) | ${val} ${usd}`);
    }

    // Also show ALL unique counterparty addresses to find any Rollbit deposits
    const allCounterparties = new Map<string, { name: string; count: number; totalUSD: number }>();
    for (const t of ed4Data) {
      const from = t.fromAddress?.address || "";
      const to = t.toAddress?.address || "";
      const fromName = t.fromAddress?.arkhamEntity?.name || "";
      const toName = t.toAddress?.arkhamEntity?.name || "";
      const usd = Number(t.historicalUSD || 0);

      if (from !== ed4Addr) {
        const existing = allCounterparties.get(from) || { name: fromName, count: 0, totalUSD: 0 };
        existing.count++;
        existing.totalUSD += usd;
        allCounterparties.set(from, existing);
      }
      if (to !== ed4Addr) {
        const existing = allCounterparties.get(to) || { name: toName, count: 0, totalUSD: 0 };
        existing.count++;
        existing.totalUSD += usd;
        allCounterparties.set(to, existing);
      }
    }
    console.log(`\n  All unique counterparties (${allCounterparties.size}):`);
    const sorted = [...allCounterparties.entries()].sort((a, b) => b[1].totalUSD - a[1].totalUSD);
    for (const [addr, info] of sorted) {
      console.log(`    ${addr.slice(0, 16)}... ${info.name || "unlabeled"} | ${info.count} txs | $${info.totalUSD.toFixed(2)}`);
    }
  } else {
    console.log("  No transfers returned");
  }

  // -------------------------------------------------------
  // 5. 4916Nkdu — Helius transfers to verify Bundle 3 vs Bundle 4
  //    Notes say: receives from Bundle 1 + Bundle 3
  //    Raw Nansen says: Bundle 1 + Bundle 4
  // -------------------------------------------------------
  console.log("\n=== 5. 4916Nkdu HELIUS TRANSFERS (Bundle 3 vs 4 check) ===");
  const insiderAddr = "4916NkdubkfRyHkxkCR7rpVGz5dvzVdK161mg4jXDwRh";

  console.log("[Helius transfers]");
  await sleep(120);
  const insiderTransfers = await heliusTransfers(insiderAddr, 100);
  results.insider_token_wallet_transfers = insiderTransfers;
  const insiderData = (insiderTransfers as any)?.data;

  const BUNDLE_1 = "B8aWJoDqZPSZkHQL7BuURR95ujox4oubgFR8g1q3kpzW";
  const BUNDLE_3 = "6M2Pp3vkmNaoq9idYsU8fcNZKUJnVqHuhtx8D5e6maB";
  const BUNDLE_4 = "9dda2gRVxkuQDvDQwpiSKUCgEk7TxAKDFKVZrfRqerta";

  if (Array.isArray(insiderData)) {
    console.log(`  Total transfers: ${insiderData.length}`);
    const bundleTransfers = insiderData.filter((t: any) =>
      [BUNDLE_1, BUNDLE_3, BUNDLE_4].includes(t.counterparty)
    );
    console.log(`  Bundle-related transfers: ${bundleTransfers.length}`);
    for (const t of bundleTransfers) {
      const cp = t.counterparty;
      const label = cp === BUNDLE_1 ? "BUNDLE_1" : cp === BUNDLE_3 ? "BUNDLE_3" : cp === BUNDLE_4 ? "BUNDLE_4" : "?";
      const ts = t.timestamp ? new Date(t.timestamp * 1000).toISOString().slice(0, 19) : "?";
      console.log(`  ${ts} ${t.direction} ${label} (${cp}) | ${t.amount} ${t.symbol || "?"}`);
    }
  } else {
    console.log("  No transfers returned");
  }

  // -------------------------------------------------------
  // SAVE ALL RESULTS
  // -------------------------------------------------------
  const outputPath = join(resultsDir, "suspect-address-verification.json");
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n=== Results saved to ${outputPath} ===`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
