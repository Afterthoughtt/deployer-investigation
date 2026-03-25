import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(__dirname, "..", "data", "results");
mkdirSync(resultsDir, { recursive: true });

const NANSEN_KEY = process.env.NANSEN_API_KEY;
if (!NANSEN_KEY) throw new Error("NANSEN_API_KEY not set");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function nansenCounterparties(address: string, dateFrom: string, dateTo: string) {
  const res = await fetch("https://api.nansen.ai/api/v1/profiler/address/counterparties", {
    method: "POST",
    headers: { "Content-Type": "application/json", apiKey: NANSEN_KEY! },
    body: JSON.stringify({
      address,
      chain: "solana",
      date: { from: dateFrom, to: dateTo },
      group_by: "wallet",
      source_input: "Combined",
      pagination: { page: 1, per_page: 50 },
      order_by: [{ field: "total_volume_usd", direction: "DESC" }],
    }),
  });
  if (!res.ok) throw new Error(`Nansen counterparties ${res.status}: ${await res.text()}`);
  return res.json();
}

// Counterparties to verify, grouped by parent wallet
const VERIFICATIONS = [
  {
    parentLabel: "L6 Deployer",
    parentAddress: "Bz2yexdH6YyDbru3nmUmeex2ZZyfpKLgmAN7w4C2Bt4Y",
    dateFrom: "2025-11-01",
    dateTo: "2026-03-20",
    expectedCounterparties: [
      { address: "B2XLRSaQqcB2Ab5KSUSjiepinQTMZqsQCExsKt9GTgDn", label: "$4.4K to L6" },
    ],
  },
  {
    parentLabel: "L7 Deployer",
    parentAddress: "HYMtCcfQTkBGw7uufDZtYHzg48pUmmBWPf5S44akPfdG",
    dateFrom: "2025-11-01",
    dateTo: "2026-03-20",
    expectedCounterparties: [
      { address: "9cDDJ5g2wPqVZUZwpPuwqzxN7ouvc6QFauFwrX2TTTAX", label: "$18.1K to L7" },
      { address: "3RmT3sTxX75cHPCJNjwzCXY87VBFEkZrZny7qXmrxn2v", label: "$29.2K to L7" },
      { address: "CQvXtWfC8Dz2EVU9jS7MjGeqaSfTpAzfZF87obyGCKWE", label: "$9.5K to L7" },
    ],
  },
  {
    parentLabel: "L9 Deployer",
    parentAddress: "3VmNQ8ForGkoBpvyHyfS31VQuQqWn4NuxTTsvf7bGGot",
    dateFrom: "2025-12-01",
    dateTo: "2026-03-20",
    expectedCounterparties: [
      { address: "DcbyADbNZanTyzhuWokNt5HrbYFFn4HmPygNPvLZC1v9", label: "$2.9K to L9" },
    ],
  },
];

async function main() {
  console.log("=== Counterparty Address Verification ===");
  console.log("Re-querying parent wallets to confirm counterparty addresses\n");
  console.log(`Nansen credits: ${VERIFICATIONS.length * 5} (${VERIFICATIONS.length} x 5)\n`);

  const allResults: any[] = [];

  for (const v of VERIFICATIONS) {
    console.log(`--- ${v.parentLabel} (${v.parentAddress.slice(0, 12)}...) ---`);
    try {
      const cp = await nansenCounterparties(v.parentAddress, v.dateFrom, v.dateTo);
      const data = (cp as any)?.data;

      const result: any = {
        parent: v.parentLabel,
        parentAddress: v.parentAddress,
        raw_counterparties: data,
        verification: [],
      };

      if (Array.isArray(data)) {
        console.log(`  Found ${data.length} counterparties`);

        for (const expected of v.expectedCounterparties) {
          const found = data.find((c: any) => c.counterparty_address === expected.address);
          if (found) {
            const vol = found.total_volume_usd?.toLocaleString() || "?";
            const label = found.counterparty_address_label || "unlabeled";
            console.log(`  CONFIRMED: ${expected.address.slice(0, 12)}... — ${label}, vol=$${vol}`);
            result.verification.push({
              address: expected.address,
              status: "CONFIRMED",
              counterparty_label: label,
              total_volume_usd: found.total_volume_usd,
              volume_in_usd: found.volume_in_usd,
              volume_out_usd: found.volume_out_usd,
              interaction_count: found.interaction_count,
            });
          } else {
            console.log(`  *** NOT FOUND: ${expected.address.slice(0, 12)}... (${expected.label}) ***`);
            // Check for partial matches (same prefix)
            const prefix = expected.address.slice(0, 8);
            const partials = data.filter((c: any) => c.counterparty_address?.startsWith(prefix));
            if (partials.length > 0) {
              console.log(`    Partial prefix match(es) for "${prefix}":`);
              for (const p of partials) {
                console.log(`      ${p.counterparty_address} — vol=$${p.total_volume_usd?.toLocaleString()}`);
              }
            }
            result.verification.push({
              address: expected.address,
              status: "NOT_FOUND",
              note: expected.label,
              partial_matches: partials.map((p: any) => p.counterparty_address),
            });
          }
        }
      } else {
        console.log("  No counterparty data returned");
      }

      allResults.push(result);
    } catch (e: any) {
      console.log(`  ERROR: ${e.message}`);
      allResults.push({ parent: v.parentLabel, error: e.message });
    }

    await sleep(2500);
  }

  // Save raw results
  const outputPath = join(resultsDir, "counterparty-verification.json");
  writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);

  // Summary
  console.log("\n=== VERIFICATION SUMMARY ===");
  for (const r of allResults) {
    if (r.error) {
      console.log(`  ${r.parent}: ERROR`);
      continue;
    }
    for (const v of r.verification || []) {
      const icon = v.status === "CONFIRMED" ? "OK" : "FAIL";
      console.log(`  [${icon}] ${r.parent} -> ${v.address.slice(0, 12)}... — ${v.status}`);
    }
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
