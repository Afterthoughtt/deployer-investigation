import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");
const resultsDir = join(dataDir, "results");
mkdirSync(resultsDir, { recursive: true });

// --- API Keys ---
const HELIUS_KEY = process.env.HELIUS_API_KEY;
const NANSEN_KEY = process.env.NANSEN_API_KEY;
const ARKHAM_KEY = process.env.ARKAN_API_KEY;

if (!HELIUS_KEY) throw new Error("HELIUS_API_KEY not set");
if (!NANSEN_KEY) throw new Error("NANSEN_API_KEY not set");
if (!ARKHAM_KEY) throw new Error("ARKAN_API_KEY not set");

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const HELIUS_API = `https://api.helius.xyz`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- Extract all addresses from network-map.json programmatically ---

interface WalletEntry {
  label: string;
  address: string;
  category: string;
  skipFundedBy?: boolean; // skip funded-by for exchange hot wallets
}

function extractAddresses(networkMap: any): WalletEntry[] {
  const entries: WalletEntry[] = [];

  // Deployers
  for (const [key, addr] of Object.entries(networkMap.deployers || {})) {
    entries.push({ label: `${key} Deployer`, address: addr as string, category: "deployer" });
  }

  // Infrastructure
  for (const [key, val] of Object.entries(networkMap.infrastructure || {})) {
    const obj = val as any;
    if (obj.address) {
      entries.push({ label: key, address: obj.address, category: "infrastructure" });
    }
  }

  // Bundle wallets
  for (const [key, addr] of Object.entries(networkMap.bundle_wallets || {})) {
    entries.push({ label: key, address: addr as string, category: "bundle" });
  }

  // Profit routing
  for (const [key, addr] of Object.entries(networkMap.profit_routing || {})) {
    entries.push({ label: key, address: addr as string, category: "profit_routing" });
  }

  // Side projects
  for (const [key, addr] of Object.entries(networkMap.side_projects || {})) {
    entries.push({ label: key, address: addr as string, category: "side_project" });
  }

  // Insiders — nested structure
  const insiders = networkMap.insiders || {};
  if (insiders.coinspot_insider) {
    const cs = insiders.coinspot_insider;
    if (cs.trading_wallet) entries.push({ label: "coinspot_insider_trading", address: cs.trading_wallet, category: "insider" });
    if (cs.collection) entries.push({ label: "coinspot_insider_collection", address: cs.collection, category: "insider" });
    if (cs.connected_susye_deployer) entries.push({ label: "coinspot_insider_susye", address: cs.connected_susye_deployer, category: "insider" });
  }
  if (insiders.blofin_insider) {
    const bl = insiders.blofin_insider;
    if (bl.hub) entries.push({ label: "blofin_hub", address: bl.hub, category: "insider" });
    if (bl.blofin_passthrough) entries.push({ label: "blofin_passthrough", address: bl.blofin_passthrough, category: "insider" });
  }

  // On-ramp hot wallets — skip funded-by for these
  const onramps = networkMap.onramp_hot_wallets || {};
  if (onramps.coinbase) {
    for (const [key, addr] of Object.entries(onramps.coinbase)) {
      if (key === "notes") continue;
      entries.push({ label: `coinbase_${key}`, address: addr as string, category: "onramp", skipFundedBy: true });
    }
  }
  if (onramps.moonpay) {
    for (const [key, val] of Object.entries(onramps.moonpay)) {
      if (key === "notes") continue;
      const obj = val as any;
      const addr = obj.address || obj;
      if (typeof addr === "string") {
        entries.push({ label: `moonpay_${key}`, address: addr, category: "onramp", skipFundedBy: true });
      }
    }
  }

  // Profit cashout
  for (const [key, val] of Object.entries(networkMap.profit_cashout || {})) {
    const obj = val as any;
    if (obj.address) {
      entries.push({ label: key, address: obj.address, category: "profit_cashout" });
    }
  }

  // Network connected
  for (const [key, val] of Object.entries(networkMap.network_connected || {})) {
    const obj = val as any;
    if (obj.address) {
      entries.push({ label: key, address: obj.address, category: "network_connected" });
    }
  }

  // Unknown high volume
  for (const [addr, val] of Object.entries(networkMap.unknown_high_volume || {})) {
    const obj = val as any;
    entries.push({ label: `unknown_${addr.slice(0, 8)}`, address: addr, category: "unknown" });
  }

  // Extras
  for (const [key, val] of Object.entries(networkMap.extras || {})) {
    const obj = val as any;
    if (obj.address) {
      entries.push({ label: key, address: obj.address, category: "extras" });
    }
  }

  return entries;
}

// --- Helius API ---

async function rpcCall(method: string, params: unknown[]) {
  const res = await fetch(HELIUS_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as any;
  if (json.error) throw new Error(`RPC ${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function getBalance(address: string): Promise<number> {
  const result = await rpcCall("getBalance", [address]);
  return result.value / 1e9;
}

async function heliusBatchIdentity(addresses: string[]) {
  const res = await fetch(`${HELIUS_API}/v1/wallet/batch-identity?api-key=${HELIUS_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addresses }),
  });
  if (!res.ok) throw new Error(`batch-identity ${res.status}: ${await res.text()}`);
  return res.json();
}

async function heliusFundedBy(address: string) {
  const res = await fetch(`${HELIUS_API}/v1/wallet/${address}/funded-by?api-key=${HELIUS_KEY}`);
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error(`funded-by ${res.status}: ${await res.text()}`);
  return res.json();
}

// --- Nansen API ---

async function nansenRelatedWallets(address: string) {
  const res = await fetch("https://api.nansen.ai/api/v1/profiler/address/related-wallets", {
    method: "POST",
    headers: { "Content-Type": "application/json", apiKey: NANSEN_KEY! },
    body: JSON.stringify({ address, chain: "solana" }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) return { rateLimited: true, status: 429, body: text };
    throw new Error(`Nansen related-wallets ${res.status}: ${text}`);
  }
  return res.json();
}

// --- Arkham API ---

async function arkhamIntelligence(address: string) {
  const res = await fetch(`https://api.arkm.com/intelligence/address/${address}`, {
    headers: { "API-Key": ARKHAM_KEY! },
  });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Arkham intelligence ${res.status}: ${text}`);
  }
  return res.json();
}

// --- Audit Logic ---

interface AuditResult {
  label: string;
  address: string;
  category: string;
  helius_balance_sol: number | null;
  helius_identity: any;
  helius_funded_by: any;
  nansen_related_wallets: any;
  arkham_intelligence: any;
  all_apis_empty: boolean;
  errors: string[];
}

async function main() {
  // 1. Read network-map.json
  const networkMap = JSON.parse(readFileSync(join(dataDir, "network-map.json"), "utf-8"));
  const entries = extractAddresses(networkMap);

  console.log(`Extracted ${entries.length} addresses from network-map.json`);
  console.log(`Categories: ${[...new Set(entries.map((e) => e.category))].join(", ")}`);
  console.log();

  // Allow filtering by category via CLI arg
  const filterCat = process.argv[2];
  const targets = filterCat ? entries.filter((e) => e.category === filterCat) : entries;
  if (filterCat) {
    console.log(`Filtered to category "${filterCat}": ${targets.length} addresses\n`);
  }

  // Credit estimate
  const fundedByCount = targets.filter((t) => !t.skipFundedBy).length;
  const batchIdentityCalls = Math.ceil(targets.length / 100);
  const credits = {
    getBalance: targets.length * 1,
    batchIdentity: batchIdentityCalls * 100,
    fundedBy: fundedByCount * 100,
    nansenRelated: targets.length * 1,
    total: 0,
  };
  credits.total = credits.getBalance + credits.batchIdentity + credits.fundedBy + credits.nansenRelated;
  console.log("Credit estimate:");
  console.log(`  Helius getBalance: ${credits.getBalance} (${targets.length} x 1)`);
  console.log(`  Helius batch-identity: ${credits.batchIdentity} (${batchIdentityCalls} x 100)`);
  console.log(`  Helius funded-by: ${credits.fundedBy} (${fundedByCount} x 100)`);
  console.log(`  Nansen related-wallets: ${credits.nansenRelated} (${targets.length} x 1)`);
  console.log(`  Arkham intelligence: free`);
  console.log(`  TOTAL: ~${credits.total} credits\n`);

  const results: AuditResult[] = [];

  // --- Phase 1: Helius batch-identity (100 credits per 100 addresses) ---
  console.log("=== Phase 1: Helius batch-identity ===");
  const allAddresses = targets.map((t) => t.address);
  const identityMap: Record<string, any> = {};

  for (let i = 0; i < allAddresses.length; i += 100) {
    const batch = allAddresses.slice(i, i + 100);
    console.log(`  Batch ${Math.floor(i / 100) + 1}: ${batch.length} addresses...`);
    try {
      const resp = await heliusBatchIdentity(batch);
      if (Array.isArray(resp)) {
        for (const item of resp) {
          if (item.address && item.type !== "unknown") {
            identityMap[item.address] = item;
          }
        }
        console.log(`  -> ${Object.keys(identityMap).length} identified so far`);
      } else {
        console.log(`  -> Unexpected response shape: ${JSON.stringify(resp).slice(0, 200)}`);
      }
    } catch (e: any) {
      console.log(`  ERROR: ${e.message}`);
    }
    await sleep(150);
  }
  console.log(`  Total identified: ${Object.keys(identityMap).length}\n`);

  // --- Phase 2: Helius getBalance (1 credit each, 50 req/sec) ---
  console.log("=== Phase 2: Helius getBalance ===");
  const balanceMap: Record<string, number | null> = {};
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    try {
      const bal = await getBalance(t.address);
      balanceMap[t.address] = bal;
      if (i < 10 || bal > 0.01) {
        console.log(`  ${t.label}: ${bal.toFixed(6)} SOL`);
      }
    } catch (e: any) {
      console.log(`  ${t.label}: ERROR ${e.message}`);
      balanceMap[t.address] = null;
    }
    // 50 req/sec = 20ms between, use 25ms for safety
    if (i % 20 === 19) await sleep(50);
  }
  const nonZero = Object.values(balanceMap).filter((b) => b !== null && b > 0).length;
  console.log(`  ${nonZero}/${targets.length} have non-zero balance\n`);

  // --- Phase 3: Helius funded-by (100 credits each, 10 req/sec) ---
  console.log("=== Phase 3: Helius funded-by ===");
  const fundedByMap: Record<string, any> = {};
  const fundedByTargets = targets.filter((t) => !t.skipFundedBy);
  for (let i = 0; i < fundedByTargets.length; i++) {
    const t = fundedByTargets[i];
    try {
      const fb = await heliusFundedBy(t.address);
      fundedByMap[t.address] = fb;
      if ((fb as any).notFound) {
        console.log(`  ${t.label}: not found (404)`);
      } else {
        const fName = (fb as any).funderName || "unknown";
        const fType = (fb as any).funderType || "?";
        const amt = (fb as any).amount || "?";
        console.log(`  ${t.label}: ${fName} (${fType}) — ${amt} SOL`);
      }
    } catch (e: any) {
      console.log(`  ${t.label}: ERROR ${e.message}`);
      fundedByMap[t.address] = { error: e.message };
    }
    // 10 req/sec = 100ms, use 120ms
    await sleep(120);
  }
  console.log();

  // --- Phase 4: Nansen related-wallets (1 credit each, 2s delays) ---
  console.log("=== Phase 4: Nansen related-wallets ===");
  const nansenMap: Record<string, any> = {};
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    try {
      const rw = await nansenRelatedWallets(t.address);
      nansenMap[t.address] = rw;
      const data = (rw as any)?.data;
      if ((rw as any).rateLimited) {
        console.log(`  ${t.label}: RATE LIMITED (429) — pausing 10s`);
        await sleep(10000);
        // Retry once
        const retry = await nansenRelatedWallets(t.address);
        nansenMap[t.address] = retry;
        const retryData = (retry as any)?.data;
        if (Array.isArray(retryData) && retryData.length > 0) {
          console.log(`  ${t.label} (retry): ${retryData.length} related wallet(s)`);
        } else {
          console.log(`  ${t.label} (retry): none`);
        }
      } else if (Array.isArray(data) && data.length > 0) {
        const labels = data.map((d: any) => `${d.address?.slice(0, 8)}...(${d.relation})`).join(", ");
        console.log(`  ${t.label}: ${data.length} related — ${labels}`);
      } else {
        console.log(`  ${t.label}: none`);
      }
    } catch (e: any) {
      console.log(`  ${t.label}: ERROR ${e.message}`);
      nansenMap[t.address] = { error: e.message };
    }
    await sleep(2000);
  }
  console.log();

  // --- Phase 5: Arkham intelligence (20 req/sec) ---
  console.log("=== Phase 5: Arkham intelligence ===");
  const arkhamMap: Record<string, any> = {};
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    try {
      const intel = await arkhamIntelligence(t.address);
      arkhamMap[t.address] = intel;
      const entity = (intel as any)?.arkhamEntity;
      const label = (intel as any)?.arkhamLabel;
      if ((intel as any).notFound) {
        // silent for brevity
      } else if (entity) {
        console.log(`  ${t.label}: ${entity.name} (${entity.type})`);
      } else if (label?.name) {
        console.log(`  ${t.label}: ${label.name}`);
      }
    } catch (e: any) {
      console.log(`  ${t.label}: ERROR ${e.message}`);
      arkhamMap[t.address] = { error: e.message };
    }
    // 20 req/sec = 50ms
    await sleep(60);
  }
  console.log();

  // --- Compile results ---
  console.log("=== Compiling Results ===\n");
  const flagged: string[] = [];

  for (const t of targets) {
    const bal = balanceMap[t.address];
    const identity = identityMap[t.address] || null;
    const fundedBy = fundedByMap[t.address] || null;
    const nansen = nansenMap[t.address] || null;
    const arkham = arkhamMap[t.address] || null;

    // Check if all APIs returned empty
    const balEmpty = bal === null || bal === 0;
    const idEmpty = !identity;
    const fbEmpty = !fundedBy || (fundedBy as any).notFound || (fundedBy as any).error;
    const nansenEmpty = !nansen || (nansen as any).error || !((nansen as any)?.data?.length > 0);
    const arkhamEmpty = !arkham || (arkham as any).notFound || (arkham as any).error ||
      (!(arkham as any)?.arkhamEntity && !(arkham as any)?.arkhamLabel?.name);

    const allEmpty = balEmpty && idEmpty && fbEmpty && nansenEmpty && arkhamEmpty;

    if (allEmpty) {
      flagged.push(`${t.label} (${t.address})`);
    }

    const errors: string[] = [];
    if (balanceMap[t.address] === null) errors.push("balance_failed");
    if (fundedBy?.error) errors.push(`funded_by: ${fundedBy.error}`);
    if (nansen?.error) errors.push(`nansen: ${nansen.error}`);
    if (arkham?.error) errors.push(`arkham: ${arkham.error}`);

    results.push({
      label: t.label,
      address: t.address,
      category: t.category,
      helius_balance_sol: bal,
      helius_identity: identity,
      helius_funded_by: fundedBy,
      nansen_related_wallets: nansen,
      arkham_intelligence: arkham,
      all_apis_empty: allEmpty,
      errors,
    });
  }

  // --- Summary ---
  console.log("=" .repeat(60));
  console.log("AUDIT SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total addresses audited: ${results.length}`);
  console.log(`Addresses with Helius identity: ${Object.keys(identityMap).length}`);
  console.log(`Addresses with non-zero balance: ${nonZero}`);
  console.log(`Addresses with funded-by data: ${Object.values(fundedByMap).filter((v: any) => v && !v.notFound && !v.error).length}`);
  console.log(`Addresses with Nansen related: ${Object.values(nansenMap).filter((v: any) => v?.data?.length > 0).length}`);
  console.log(`Addresses with Arkham entity/label: ${Object.values(arkhamMap).filter((v: any) => v?.arkhamEntity || v?.arkhamLabel?.name).length}`);
  console.log();

  if (flagged.length > 0) {
    console.log(`*** FLAGGED: ${flagged.length} address(es) returned ZERO from ALL APIs ***`);
    console.log("These may be transcription errors or closed accounts:");
    for (const f of flagged) {
      console.log(`  - ${f}`);
    }
  } else {
    console.log("No addresses flagged — all have at least some API data.");
  }

  // Save results
  const output = {
    metadata: {
      run_at: new Date().toISOString(),
      total_addresses: results.length,
      flagged_count: flagged.length,
      flagged_addresses: flagged,
      credit_estimate: credits,
    },
    identity_map: identityMap,
    results,
  };

  const outputPath = join(resultsDir, "address-audit.json");
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
