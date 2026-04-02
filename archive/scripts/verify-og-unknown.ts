import "dotenv/config";

const NANSEN_KEY = process.env.NANSEN_API_KEY;
if (!NANSEN_KEY) throw new Error("NANSEN_API_KEY not set");

async function main() {
  const res = await fetch("https://api.nansen.ai/api/v1/profiler/address/counterparties", {
    method: "POST",
    headers: { "Content-Type": "application/json", apiKey: NANSEN_KEY! },
    body: JSON.stringify({
      address: "37XxihfsTW1EFSJJherWFRFWcAFhj4KQ66cXHiegSKg2",
      chain: "solana",
      date: { from: "2025-03-01", to: "2026-03-21" },
      group_by: "wallet",
      source_input: "Combined",
      pagination: { page: 1, per_page: 50 },
      order_by: [{ field: "total_volume_usd", direction: "DESC" }],
    }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const data = ((await res.json()) as any)?.data;

  const target1 = "DLGHPXKFVepjShuRvp8PDBkaCH7bkxaCK21USQGmSQ3e";
  const target2 = "E2NnJHhcMhwrMT2qZDJicnGLFQZw44ceqTAcrqo8BA8F";

  for (const target of [target1, target2]) {
    const found = data?.find((c: any) => c.counterparty_address === target);
    if (found) {
      console.log(`CONFIRMED: ${target.slice(0, 12)}...`);
      console.log(`  Label: ${found.counterparty_address_label || "unlabeled"}`);
      console.log(`  Volume: $${found.total_volume_usd?.toLocaleString()}`);
      console.log(`  In: $${found.volume_in_usd?.toLocaleString()} | Out: $${found.volume_out_usd?.toLocaleString()}`);
      console.log(`  Txs: ${found.interaction_count}`);
    } else {
      console.log(`NOT FOUND: ${target.slice(0, 12)}...`);
      const prefix = target.slice(0, 8);
      const partials = data?.filter((c: any) => c.counterparty_address?.startsWith(prefix));
      if (partials?.length > 0) {
        console.log(`  Prefix "${prefix}" matches:`);
        for (const p of partials) console.log(`    ${p.counterparty_address}`);
      }
    }
    console.log();
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
