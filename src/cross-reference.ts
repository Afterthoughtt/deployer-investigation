import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");
const resultsDir = join(dataDir, "results");

// Ensure results directory exists
mkdirSync(resultsDir, { recursive: true });

// Load data files
const launchDetails = JSON.parse(
  readFileSync(join(dataDir, "launch-details.json"), "utf-8")
);
const networkMap = JSON.parse(
  readFileSync(join(dataDir, "network-map.json"), "utf-8")
);

// Build set of all known network addresses for tagging
const knownInfra = new Set<string>();
const knownInsiders = new Set<string>();

// Deployers
for (const addr of Object.values(networkMap.deployers)) {
  knownInfra.add(addr as string);
}

// Infrastructure
for (const entry of Object.values(networkMap.infrastructure)) {
  knownInfra.add((entry as { address: string }).address);
}

// Bundle wallets
for (const addr of Object.values(networkMap.bundle_wallets)) {
  knownInfra.add(addr as string);
}

// Profit routing
for (const addr of Object.values(networkMap.profit_routing)) {
  knownInfra.add(addr as string);
}

// Side projects
for (const addr of Object.values(networkMap.side_projects)) {
  knownInfra.add(addr as string);
}

// On-ramp hot wallets
for (const [key, val] of Object.entries(networkMap.onramp_hot_wallets)) {
  if (key === "unmapped") continue;
  if (typeof val === "object" && val !== null) {
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (k === "notes") continue;
      if (typeof v === "string") knownInfra.add(v);
      else if (typeof v === "object" && v !== null && "address" in v)
        knownInfra.add((v as { address: string }).address);
    }
  }
}

// OG deployer
knownInfra.add(launchDetails.og_deployer_flows.address);

// Insiders
if (networkMap.insiders?.coinspot_insider?.trading_wallet) {
  knownInsiders.add(networkMap.insiders.coinspot_insider.trading_wallet);
}
if (networkMap.insiders?.coinspot_insider?.collection) {
  knownInsiders.add(networkMap.insiders.coinspot_insider.collection);
}
if (networkMap.insiders?.coinspot_insider?.connected_susye_deployer) {
  knownInsiders.add(
    networkMap.insiders.coinspot_insider.connected_susye_deployer
  );
}
if (networkMap.insiders?.blofin_insider?.hub) {
  knownInsiders.add(networkMap.insiders.blofin_insider.hub);
}
if (networkMap.insiders?.blofin_insider?.blofin_passthrough) {
  knownInsiders.add(networkMap.insiders.blofin_insider.blofin_passthrough);
}

// Known protocol/exchange addresses to exclude from analysis
const knownProtocols = new Set([
  "1nc1nerator11111111111111111111111111111111",
  "GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL", // Raydium Vault Authority
  "HV1KXxWFaSeriyFvXyx48FqG9BoFbfinB8njCJonqP7K", // OKX DEX Sa Authority
  "ARu4n5mFdZogZAravu7CcizaojWnS6oqka37gdLT5SZn", // OKX Router
  "RBHdGVfDfMjfU6iUfCb1LczMJcQLx7hGnxbzRsoDNvx", // Rollbit Treasury
  "8ekCy2jHHUbW2yeNGFWYJT9Hm9FW7SvZcZK66dSZCDiF", // Tessera V Authority
  "F7p3dFrjRTbtRp8FRF6qHLomXbKRBzpvBLjtQcfcgmNe", // Relay Solver
]);

type SourceType = "deployer_inflow" | "deployer_outflow" | "early_buyer";

interface Appearance {
  sources: SourceType[];
  position: number | null; // position in early_buyers list (1-indexed), null if only in flows
}

interface WalletRecord {
  address: string;
  tag: string;
  launch_count: number;
  launches: string[];
  appearances: Record<string, Appearance>;
  first_seen: string;
  last_seen: string;
  gap_launches: string[];
  investigate_rotation: boolean;
}

// Build the cross-reference map
const walletMap = new Map<string, Record<string, Appearance>>();
const allLaunches = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9"];

for (const launchId of allLaunches) {
  const launch = launchDetails.launches[launchId];
  if (!launch) continue;

  // Process early buyers
  for (let i = 0; i < launch.early_buyers.length; i++) {
    const addr = launch.early_buyers[i];
    if (!walletMap.has(addr)) walletMap.set(addr, {});
    const record = walletMap.get(addr)!;
    if (!record[launchId]) {
      record[launchId] = {
        sources: [],
        position: null,
      };
    }
    if (!record[launchId].sources.includes("early_buyer")) {
      record[launchId].sources.push("early_buyer");
    }
    // Use earliest position if already set
    const pos = i + 1;
    if (record[launchId].position === null || pos < record[launchId].position!) {
      record[launchId].position = pos;
    }
  }

  // Process deployer inflows
  for (const flow of launch.inflows || []) {
    const addr = flow.address;
    if (!walletMap.has(addr)) walletMap.set(addr, {});
    const record = walletMap.get(addr)!;
    if (!record[launchId]) {
      record[launchId] = {
        sources: [],
        position: null,
      };
    }
    if (!record[launchId].sources.includes("deployer_inflow")) {
      record[launchId].sources.push("deployer_inflow");
    }
    // volume tracked in launch-details.json, not needed here
  }

  // Process deployer outflows
  for (const flow of launch.outflows || []) {
    const addr = flow.address;
    if (!walletMap.has(addr)) walletMap.set(addr, {});
    const record = walletMap.get(addr)!;
    if (!record[launchId]) {
      record[launchId] = {
        sources: [],
        position: null,
      };
    }
    if (!record[launchId].sources.includes("deployer_outflow")) {
      record[launchId].sources.push("deployer_outflow");
    }
    // volume tracked in launch-details.json, not needed here
  }
}

// Also process OG deployer flows (applies to L1-L3 era broadly)
// These are aggregate flows, not per-launch, so we skip adding them to specific launches
// They're already captured in the network map

// Filter and tag
const recurringWallets: WalletRecord[] = [];

for (const [address, appearances] of walletMap.entries()) {
  const launches = Object.keys(appearances).sort(
    (a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))
  );

  // Skip known protocol addresses
  if (knownProtocols.has(address)) continue;

  // Determine tag
  let tag: string;
  if (knownInfra.has(address)) {
    tag = "known_infra";
  } else if (knownInsiders.has(address)) {
    tag = "known_insider";
  } else {
    tag = "unknown";
  }

  // Require 2+ launches for unknown wallets only — always keep known insiders/infra
  if (launches.length < 2 && tag === "unknown") continue;

  // Significance filter for unknown wallets — skip noise
  if (tag === "unknown" && launches.length === 2) {
    const bestPosition = Math.min(
      ...Object.values(appearances)
        .map((app) => app.position)
        .filter((p): p is number => p !== null)
        .concat([999])
    );
    const hasDeployerFlow = Object.values(appearances).some((app) =>
      app.sources.some((s) => s === "deployer_inflow" || s === "deployer_outflow")
    );
    const isRecentlyActive = launches.includes("L8") || launches.includes("L9");

    // Keep only if: top-10 position, deployer flow involvement, or recently active
    if (bestPosition > 10 && !hasDeployerFlow && !isRecentlyActive) {
      continue;
    }
  }

  const firstSeen = launches[0];
  const lastSeen = launches[launches.length - 1];

  // Find gap launches (launches after first_seen and before/at last_seen where wallet is absent)
  const firstIdx = allLaunches.indexOf(firstSeen);
  const lastIdx = allLaunches.indexOf(lastSeen);
  const gapLaunches: string[] = [];
  for (let i = firstIdx; i <= lastIdx; i++) {
    if (!launches.includes(allLaunches[i])) {
      gapLaunches.push(allLaunches[i]);
    }
  }

  // Also check if wallet disappeared from recent launches
  const lastLaunchIdx = allLaunches.indexOf(lastSeen);
  const recentlyAbsent = lastLaunchIdx < allLaunches.length - 2; // absent from 2+ recent launches

  const investigateRotation = recentlyAbsent && tag === "unknown";

  recurringWallets.push({
    address,
    tag,
    launch_count: launches.length,
    launches,
    appearances,
    first_seen: firstSeen,
    last_seen: lastSeen,
    gap_launches: gapLaunches,
    investigate_rotation: investigateRotation,
  });
}

// Sort: unknown first, then by launch count desc, then by best position
recurringWallets.sort((a, b) => {
  // Priority: unknown > known_insider > known_infra
  const tagOrder: Record<string, number> = {
    unknown: 0,
    known_insider: 1,
    known_infra: 2,
  };
  const tagDiff = (tagOrder[a.tag] ?? 3) - (tagOrder[b.tag] ?? 3);
  if (tagDiff !== 0) return tagDiff;

  // Then by launch count descending
  if (b.launch_count !== a.launch_count) return b.launch_count - a.launch_count;

  // Then by best (lowest) early buyer position
  const bestPosA = Math.min(
    ...Object.values(a.appearances)
      .map((app) => app.position)
      .filter((p): p is number => p !== null)
      .concat([999])
  );
  const bestPosB = Math.min(
    ...Object.values(b.appearances)
      .map((app) => app.position)
      .filter((p): p is number => p !== null)
      .concat([999])
  );
  return bestPosA - bestPosB;
});

// Generate report
const report = {
  metadata: {
    generated: new Date().toISOString(),
    total_unique_wallets: walletMap.size,
    recurring_wallets_count: recurringWallets.length,
    by_tag: {
      unknown: recurringWallets.filter(
        (w) => w.tag === "unknown"
      ).length,
      known_infra: recurringWallets.filter((w) => w.tag === "known_infra")
        .length,
      known_insider: recurringWallets.filter((w) => w.tag === "known_insider")
        .length,
    },
    rotation_candidates: recurringWallets.filter((w) => w.investigate_rotation)
      .length,
  },
  recurring_wallets: recurringWallets,
};

const outputPath = join(resultsDir, "cross-reference-report.json");
writeFileSync(outputPath, JSON.stringify(report, null, 2));

// Print summary to console
console.log("\n=== CROSS-REFERENCE ANALYSIS ===\n");
console.log(`Total unique wallets scanned: ${walletMap.size}`);
console.log(`Recurring wallets (2+ launches): ${recurringWallets.length}`);
console.log(
  `  - Unknown: ${report.metadata.by_tag.unknown}`
);
console.log(`  - Known Infra: ${report.metadata.by_tag.known_infra}`);
console.log(`  - Known Insider: ${report.metadata.by_tag.known_insider}`);
console.log(
  `  - Rotation Candidates: ${report.metadata.rotation_candidates}\n`
);

console.log("=== UNKNOWN WALLETS (investigation priority) ===\n");
const unknowns = recurringWallets.filter((w) => w.tag === "unknown");
for (const w of unknowns) {
  const positions = Object.entries(w.appearances)
    .map(([launch, app]) => {
      const parts: string[] = [];
      if (app.position) parts.push(`#${app.position}`);
      parts.push(app.sources.join("+"));
      return `${launch}(${parts.join(" ")})`;
    })
    .join(", ");
  const rotFlag = w.investigate_rotation ? " [ROTATION?]" : "";
  console.log(`${w.address}`);
  console.log(
    `  ${w.launch_count} launches: ${positions}${rotFlag}`
  );
  if (w.gap_launches.length > 0) {
    console.log(`  Gaps: ${w.gap_launches.join(", ")}`);
  }
  console.log();
}

console.log("=== KNOWN INSIDERS ===\n");
const insiders = recurringWallets.filter((w) => w.tag === "known_insider");
for (const w of insiders) {
  const positions = Object.entries(w.appearances)
    .map(([launch, app]) => {
      const parts: string[] = [];
      if (app.position) parts.push(`#${app.position}`);
      parts.push(app.sources.join("+"));
      return `${launch}(${parts.join(" ")})`;
    })
    .join(", ");
  console.log(`${w.address}`);
  console.log(`  ${w.launch_count} launch(es): ${positions}`);
  console.log();
}
if (insiders.length === 0) {
  console.log("  (none detected)\n");
}

console.log("=== KNOWN INFRA CROSS-CHECK ===\n");
const infra = recurringWallets.filter((w) => w.tag === "known_infra");
for (const w of infra.slice(0, 15)) {
  console.log(
    `${w.address.slice(0, 12)}... — ${w.launch_count} launches: ${w.launches.join(", ")}`
  );
}

console.log(`\nFull report saved to: ${outputPath}`);
