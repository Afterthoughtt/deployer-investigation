import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(__dirname, "..", "data", "results");
mkdirSync(resultsDir, { recursive: true });

const HELIUS_KEY = process.env.HELIUS_API_KEY;
if (!HELIUS_KEY) throw new Error("HELIUS_API_KEY not set in .env");

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const HELIUS_API = `https://api.helius.xyz`;

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
  "HVRcXaCFyUFG7iZLm3T1Qn8ZGDMHj3P3BpezUfWfRf2x": "Large Funding Source (Fireblocks)",
  "B8aWJoDqZPSZkHQL7BuURR95ujox4oubgFR8g1q3kpzW": "Bundle 1",
  "91CuNTxyGkUvMU8hgzBHSW8FPEHArt767dApEoVsLRn7": "Bundle 2",
  "6M2Pp3vkmNaoq9idYsU8fcNZKUJnVqHuhtx8D5e6maB": "Bundle 3",
  "9dda2gRVxkuQDvDQwpiSKUCgEk7TxAKDFKVZrfRqerta": "Bundle 4",
  "EvcWdhdjB2SG2x8hrsxSFuxbf5azu5rpPSmepismXMYc": "Bundle 5",
  "LCoYfBS9DMhGavDNk3NdwcfhEcPqWC6BuarFqci3CMm": "Bundle 6",
  "4yWaU1QrwteHi1gixoFehknRP9a61T5PhAfM6ED3U2bs": "Profit Pass 1",
  "HDTncsSnBmJWNRXd641Xuh8tYjKXx1xcJq8ACuCZQz52": "Profit Pass 2",
  "J6YUyB4P4LFfHqWxJvfXQC7ktFKgvx8rzfJFEzTNJmcT": "Coinbase Deposit",
  "21wG4F3ZR8gwGC47CkpD6ySBUgH9AABtYMBWFiYdTTgv": "Binance Deposit",
  "RB3dQF6TsinAUsQsvXtAyxMztMHXJ2GaZ3gdMuuHiw7": "Rollbit Deposit",
  "Ed4UGBWK4UpwBKiGFkM2uQMTPpahPwxgxEWjJTRXuAJv": "Ed4UGBWK (Network)",
  "Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6": "MoonPay MP1",
  "GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE": "Coinbase CB9",
  "49mvMufixEbUMzZEUVAnbQ8hLLuEWy789XfKUNTz7wCv": "Token Millionaire (Fireblocks)",
  "2q8nSJgCpaZZjchK4s7mGy3f9tAJgsXZQQHDfKMB4EN7": "Secondary Aggregator",
  "DZc1evNLyaufVzUATwy7eZjURbjeESRKkN5nvdcFESZC": "DZc1evNL (Network)",
  "6UrYwo9F97zDpd7cCvnKJp5HrcGnhSYKmHaphiZd71UE": "6UrYwo9F (Relay)",
};

// Targets blocked without Helius
const TARGETS = [
  {
    address: "DVrX592fJrj7SpQVhJfPRCn5FcDBbRHBiSoxMPKkjp1U",
    context: "L10 counterparty. $20.1K volume ($18.9K inflow to L10 deployer). No Nansen/Arkham data.",
    priority: "HIGH",
  },
  {
    address: "9PMGB6REhc4XBUkpHiKNhYJiT8YAhSdMDfNUYFBpCvGH",
    context: "L10 counterparty. $10.2K inflow to L10 deployer. No Nansen/Arkham data.",
    priority: "MEDIUM",
  },
  {
    address: "6afg6U4csVN35XMMzDmQRcwJcpHf7ozU3FBqRvPi3rz3",
    context: "Funder of CQvXtWfC (pure passthrough to L7 deployer). Closed/drained. Zero data in Nansen/Arkham.",
    priority: "MEDIUM",
  },
];

function tag(addr: string): string {
  return KNOWN_NETWORK[addr] ? ` [KNOWN: ${KNOWN_NETWORK[addr]}]` : "";
}

// --- Helius Wallet API ---

async function heliusFundedBy(address: string) {
  const res = await fetch(`${HELIUS_API}/v1/wallet/${address}/funded-by?api-key=${HELIUS_KEY}`);
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error(`funded-by ${res.status}: ${await res.text()}`);
  return res.json();
}

async function heliusIdentity(address: string) {
  const res = await fetch(`${HELIUS_API}/v1/wallet/${address}/identity?api-key=${HELIUS_KEY}`);
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error(`identity ${res.status}: ${await res.text()}`);
  return res.json();
}

async function heliusTransfers(address: string, limit = 50) {
  const res = await fetch(`${HELIUS_API}/v1/wallet/${address}/transfers?api-key=${HELIUS_KEY}&limit=${limit}`);
  if (!res.ok) throw new Error(`transfers ${res.status}: ${await res.text()}`);
  return res.json();
}

// --- Helius RPC ---

async function rpcCall(method: string, params: unknown[]) {
  const res = await fetch(HELIUS_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} ${res.status}: ${await res.text()}`);
  const json = await res.json() as any;
  if (json.error) throw new Error(`RPC ${method} error: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function getBalance(address: string): Promise<number> {
  const result = await rpcCall("getBalance", [address]);
  return result.value / 1e9;
}

async function getSignatures(address: string, limit = 20) {
  return rpcCall("getSignaturesForAddress", [address, { limit }]);
}

// --- Main ---

async function investigate(target: typeof TARGETS[number]) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Address: ${target.address}`);
  console.log(`Context: ${target.context}`);
  console.log(`Priority: ${target.priority}`);
  console.log("=".repeat(60));

  const result: Record<string, unknown> = {
    address: target.address,
    context: target.context,
    network_connections: [] as string[],
    errors: [] as string[],
  };

  // 1. Balance (1 credit)
  console.log("\n[Helius RPC] getBalance...");
  try {
    const bal = await getBalance(target.address);
    console.log(`  Balance: ${bal} SOL`);
    result.balance_sol = bal;
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
    (result.errors as string[]).push(`balance: ${e.message}`);
  }

  // 2. Identity (100 credits)
  console.log("[Helius] Identity...");
  try {
    const id = await heliusIdentity(target.address);
    if ((id as any).notFound || (id as any).type === "unknown") {
      console.log(`  Unknown wallet (type: ${(id as any).type || "not found"})`);
      result.identity = null;
    } else {
      console.log(`  Name: ${(id as any).name} | Category: ${(id as any).category} | Type: ${(id as any).type} | Tags: ${JSON.stringify((id as any).tags)}`);
      result.identity = id;
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
    (result.errors as string[]).push(`identity: ${e.message}`);
  }
  await sleep(150);

  // 3. Funded-by (100 credits)
  console.log("[Helius] Funded-by...");
  try {
    const fb = await heliusFundedBy(target.address);
    if ((fb as any).notFound) {
      console.log("  No funding data (404)");
      result.funded_by = null;
    } else {
      const funder = (fb as any).funder || "?";
      const funderName = (fb as any).funderName || "unknown";
      const funderType = (fb as any).funderType || "unknown";
      const amount = (fb as any).amount || "?";
      const t = tag(funder);
      console.log(`  Funder: ${funder}${t}`);
      console.log(`  Name: ${funderName} | Type: ${funderType} | Amount: ${amount} SOL`);
      console.log(`  Date: ${(fb as any).date} | Sig: ${(fb as any).signature?.slice(0, 30)}...`);
      result.funded_by = fb;
      if (KNOWN_NETWORK[funder]) {
        (result.network_connections as string[]).push(`Funded by: ${KNOWN_NETWORK[funder]}`);
      }
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
    (result.errors as string[]).push(`funded_by: ${e.message}`);
  }
  await sleep(150);

  // 4. Recent signatures (10 credits)
  console.log("[Helius RPC] getSignaturesForAddress (last 20)...");
  try {
    const sigs = await getSignatures(target.address, 20);
    if (Array.isArray(sigs) && sigs.length > 0) {
      console.log(`  ${sigs.length} signature(s). Latest: ${new Date(sigs[0].blockTime * 1000).toISOString()}`);
      console.log(`  Oldest in batch: ${new Date(sigs[sigs.length - 1].blockTime * 1000).toISOString()}`);
      result.signature_count = sigs.length;
      result.latest_activity = new Date(sigs[0].blockTime * 1000).toISOString();
      result.oldest_in_batch = new Date(sigs[sigs.length - 1].blockTime * 1000).toISOString();
    } else {
      console.log("  No signatures found (account may be closed)");
      result.signature_count = 0;
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
    (result.errors as string[]).push(`signatures: ${e.message}`);
  }

  // 5. Transfers (100 credits) — only if we have signatures
  if ((result.signature_count as number) > 0) {
    console.log("[Helius] Wallet transfers (last 50)...");
    try {
      const transfers = await heliusTransfers(target.address, 50);
      const data = (transfers as any)?.data;
      if (Array.isArray(data) && data.length > 0) {
        console.log(`  ${data.length} transfer(s):`);
        for (const t of data.slice(0, 15)) {
          const dir = t.direction === "in" ? "←" : "→";
          const cp = t.counterparty || "?";
          const cpTag = tag(cp);
          const sym = t.symbol || "SOL";
          const amt = typeof t.amount === "number" ? t.amount.toFixed(4) : t.amount;
          const ts = t.timestamp ? new Date(t.timestamp * 1000).toISOString().slice(0, 19) : "?";
          console.log(`    ${ts} ${dir} ${cp.slice(0, 16)}...${cpTag} | ${amt} ${sym}`);

          if (KNOWN_NETWORK[cp]) {
            (result.network_connections as string[]).push(
              `Transfer ${t.direction}: ${KNOWN_NETWORK[cp]} (${amt} ${sym})`
            );
          }
        }
        result.transfers = data;
      } else {
        console.log("  No transfers found");
      }
    } catch (e: any) {
      console.log(`  ERROR: ${e.message}`);
      (result.errors as string[]).push(`transfers: ${e.message}`);
    }
  }

  // Dedupe
  result.network_connections = [...new Set(result.network_connections as string[])];

  console.log(`\n--- SUMMARY ---`);
  console.log(`  Network connections: ${(result.network_connections as string[]).length}`);
  for (const c of result.network_connections as string[]) console.log(`    - ${c}`);

  return result;
}

async function main() {
  const idx = process.argv[2] ? parseInt(process.argv[2]) : null;
  const targets = idx !== null ? [TARGETS[idx]] : TARGETS;

  console.log(`Resolving ${targets.length} Helius-blocked wallet(s)...`);
  console.log(`Credits per wallet: ~311 (balance=1, identity=100, funded-by=100, sigs=10, transfers=100)\n`);

  const results: Record<string, unknown>[] = [];
  for (const t of targets) {
    results.push(await investigate(t));
    await sleep(500);
  }

  const outputPath = join(resultsDir, "helius-resolve.json");
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results saved to: ${outputPath}`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
