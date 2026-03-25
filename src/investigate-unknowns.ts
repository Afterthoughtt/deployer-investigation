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

// Unknown counterparties from deployer verification that need investigation
const UNKNOWNS = [
  {
    address: "Ed4UGBWK4UpwBKiGFkM2uQMTPpahPwxgxEWjJTRXuAJv",
    context: "L6 #1 counterparty ($63K inflow), L7 #3 ($29.5K inflow). Nansen: 'Trading Bot'. Already in unknown_high_volume.",
  },
  {
    address: "B2XLRSaQqcB2Ab5KSUSjiepinQTMZqsQCExsKt9GTgDn",
    context: "L6 counterparty, $4.4K inflow, unlabeled.",
  },
  {
    address: "3RmT3sTxX75cHPCJNjwzCXY87VBFEkZrZny7qXmrxn2v",
    context: "L7 counterparty, $29.2K inflow, unlabeled.",
  },
  {
    address: "9cDDJ5g2wPqVZUZwpPuwqzxN7ouvc6QFauFwrX2TTTAX",
    context: "L7 counterparty, $18.1K inflow. Nansen: 'Trading Bot'.",
  },
  {
    address: "CQvXtWfC8Dz2EVU9jS7MjGeqaSfTpAzfZF87obyGCKWE",
    context: "L7 counterparty, $7.4K inflow, unlabeled.",
  },
  {
    address: "DcbyADbNZanTyzhuWokNt5HrbYFFn4HmPygNPvLZC1v9",
    context: "L9 counterparty, $2.9K inflow, unlabeled.",
  },
  {
    address: "DVrX592fJrj7SpQVhJfPRCn5FcDBbRHBiSoxMPKkjp1U",
    context: "L10 #1 counterparty, $20.1K volume ($18.9K inflow), unlabeled.",
  },
  {
    address: "9PMGB6REhc4XBUkpHiKNhYJiT8YAhSdMDfNUYFBpCvGH",
    context: "L10 counterparty, $10.2K inflow, unlabeled.",
  },
];

async function investigate(wallet: { address: string; context: string }) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`${wallet.address}`);
  console.log(`Context: ${wallet.context}`);
  console.log("─".repeat(60));

  const result: Record<string, unknown> = {
    address: wallet.address,
    context: wallet.context,
    verdict: null,
  };

  // Arkham intelligence — entity/label
  console.log("[Arkham] Intelligence...");
  try {
    const intel = await arkhamGet(`/intelligence/address/${wallet.address}`, { chain: "solana" });
    const entity = (intel as any)?.arkhamEntity;
    const label = (intel as any)?.arkhamLabel;
    if (entity) {
      console.log(`  Entity: ${entity.name} (type: ${entity.type || "?"})`);
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
  }
  await sleep(2000);

  // Nansen related wallets — who funded this address?
  console.log("[Nansen] Related wallets (funding chain)...");
  try {
    const related = await nansenPost("/profiler/address/related-wallets", {
      address: wallet.address,
      chain: "solana",
    });
    const data = (related as any)?.data;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`  ${data.length} related wallet(s):`);
      for (const r of data) {
        console.log(`    ${r.relation}: ${r.address?.slice(0, 20)}... (${r.address_label || "unlabeled"})`);
      }
      result.nansen_related = data.map((r: any) => ({
        relation: r.relation,
        address: r.address,
        label: r.address_label || null,
      }));
    } else {
      console.log("  No related wallets found");
      result.nansen_related = [];
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
  }
  await sleep(2000);

  // Nansen counterparties — who does this wallet interact with?
  console.log("[Nansen] Top counterparties...");
  try {
    const cp = await nansenPost("/profiler/address/counterparties", {
      address: wallet.address,
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
        const addr = c.counterparty_address?.slice(0, 20) || "?";
        const dir = `in=$${c.volume_in_usd?.toLocaleString()} out=$${c.volume_out_usd?.toLocaleString()}`;
        console.log(`    ${addr}... ${label} | vol=$${c.total_volume_usd?.toLocaleString()} | ${dir} | ${c.interaction_count} txs`);
      }
      result.nansen_counterparties = data.map((c: any) => ({
        address: c.counterparty_address,
        label: c.counterparty_address_label || null,
        total_volume_usd: c.total_volume_usd,
        volume_in_usd: c.volume_in_usd,
        volume_out_usd: c.volume_out_usd,
        interaction_count: c.interaction_count,
      }));
    } else {
      console.log("  No counterparties found");
      result.nansen_counterparties = [];
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
  }
  await sleep(2000);

  return result;
}

async function main() {
  const targetIdx = process.argv[2] ? parseInt(process.argv[2]) : null;
  const targets = targetIdx !== null ? [UNKNOWNS[targetIdx]] : UNKNOWNS;

  console.log(`Investigating ${targets.length} unknown counterparty(ies)...`);
  console.log(`Nansen credits: ~${targets.length * 6} (related=1, counterparties=5 each)\n`);

  const results: Record<string, unknown>[] = [];
  for (const wallet of targets) {
    const result = await investigate(wallet);
    results.push(result);
    await sleep(2000);
  }

  const outputPath = join(resultsDir, "unknown-counterparties.json");
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
