import "dotenv/config";

const NANSEN_KEY = process.env.NANSEN_API_KEY!;
const HELIUS_KEY = process.env.HELIUS_API_KEY!;
const HELIUS_API = `https://api.helius.xyz`;

async function nansenBalanceByEntity(entityName: string) {
  const res = await fetch("https://api.nansen.ai/api/v1/profiler/address/current-balance", {
    method: "POST",
    headers: { "Content-Type": "application/json", apiKey: NANSEN_KEY },
    body: JSON.stringify({ entity_name: entityName, chain: "solana", hide_spam_token: true }),
  });
  if (!res.ok) throw new Error(`Nansen balance ${res.status}: ${await res.text()}`);
  return res.json();
}

async function heliusBatchIdentity(addresses: string[]) {
  const res = await fetch(`${HELIUS_API}/v1/wallet/batch-identity?api-key=${HELIUS_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addresses }),
  });
  if (!res.ok) throw new Error(`batch-identity ${res.status}`);
  return res.json();
}

async function main() {
  console.log("--- Nansen: MoonPay entity balance (all wallets on Solana) ---");
  const result = await nansenBalanceByEntity("MoonPay");
  const data = result?.data || [];
  console.log(`Records found: ${data.length}`);

  const uniqueAddrs = new Set<string>();
  for (const d of data) uniqueAddrs.add(d.address);

  const addrs = Array.from(uniqueAddrs);
  console.log(`Unique addresses: ${addrs.length}`);
  for (const a of addrs) {
    const balances = data.filter((d: any) => d.address === a);
    const solBal = balances.find((b: any) => b.token_symbol === "SOL");
    console.log(`  ${a} — SOL: ${solBal?.token_amount?.toFixed(2) || "0"} ($${solBal?.value_usd?.toFixed(0) || "0"})`);
  }

  if (addrs.length > 0) {
    console.log(`\n--- Helius batch-identity on ${addrs.length} MoonPay wallets ---`);
    const batchResult = await heliusBatchIdentity(addrs);
    for (const item of batchResult) {
      console.log(`  ${item.address} — ${item.name} (${item.category})`);
    }

    const heliusAddrs = new Set(batchResult.map((b: any) => b.address));
    const unlabeled = addrs.filter(a => !heliusAddrs.has(a));
    if (unlabeled.length > 0) {
      console.log(`\nMoonPay wallets known to Nansen but NOT in Helius identity:`);
      for (const a of unlabeled) console.log(`  ${a}`);
    }
  }
}

main().catch(console.error);
