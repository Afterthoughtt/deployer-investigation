# Data Audit & Gap Investigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit and normalize all 5 canonical data files, then investigate the 24 highest-signal unresolved wallets across 3 APIs to catch missed network members.

**Architecture:** Two sequential passes. Pass 1 (Tasks 1-5) is pure data file restructuring — no API calls, no scripts. Pass 2 (Tasks 6-10) writes and runs TypeScript investigation scripts against Helius, Nansen, and Arkham APIs, updating data files with findings.

**Tech Stack:** TypeScript (ES Modules), tsx, dotenv, Helius RPC + Wallet API, Nansen REST API, Arkham Intel API

---

## File Structure

**Pass 1 modifies these existing files:**
- `data/network-map.json` — wallet registry (uniform schema)
- `data/launch-history.json` — behavioral profile (schema normalization)
- `data/launch-details.json` — per-launch flows (schema normalization + L10 restructure)
- `data/results/cross-reference-report.json` — metadata reconciliation
- `data/results/investigation-notes.json` — verification pass

**Pass 2 creates these new files:**
- `src/audit/batch-screen.ts` — batch screening script (Helius + Arkham)
- `src/audit/deep-dive.ts` — deep investigation script (Nansen + Arkham transfers)
- `src/audit/moonpay-search.ts` — MoonPay wallet discovery
- `src/audit/utils.ts` — shared helpers (API clients, rate limiting, address loading)

**Pass 2 modifies:**
- `data/network-map.json` — updated with investigation findings
- `data/results/cross-reference-report.json` — tags updated

---

## Task 1: Normalize network-map.json Schema

**Files:**
- Modify: `data/network-map.json`

- [ ] **Step 1: Read current file and plan transformation**

Read `data/network-map.json`. The transformation rules:
- Every wallet entry becomes `{ "address": "...", "label": "...", "role": "...", "verdict": "...", "notes": "..." }`
- `deployers` section: promote bare strings to objects with `role: "deployer"`, `verdict: "network"`
- `bundle_wallets` section: promote bare strings to objects with `role: "bundle"`, `verdict: "network"`
- `onramp_hot_wallets.coinbase` CB1-CB10: promote bare strings to objects with `role: "onramp"`, `verdict: "network"`
- `onramp_hot_wallets.moonpay` MP1/MP4: already objects, add `role: "onramp"`, `verdict: "network"`
- `infrastructure` section: add `role: "infrastructure"`, `verdict: "network"` to each
- `profit_routing` section: add `role: "profit_routing"`, `verdict: "network"` to each
- `side_projects` section: add `role: "side_project"`, `verdict: "network"` to each
- `insiders` section: keep nested structure, add `role: "insider"`, `verdict: "network"` to each sub-wallet. Add `role`/`verdict` to cluster-level objects too
- `profit_cashout` section: add `role: "cashout"`, `verdict: "network"` to each
- `network_connected` section: add `role: "network_connected"`, `verdict: "network"` to each
- `og_deployer_token_accounts`: add `role: "token_account"`, `verdict: "network"` (they're resolved ATAs)
- `monitoring` section: dissolve — move BqP79Wmk to `network_connected` with `verdict: "network"` (confirmed deployer personal trading wallet, trades all 9 tokens), move 7QJM8rXX/F7RV6aBW/D1XcKeSS to a new `possible_associates` section with `verdict: "possible_associate"`
- `not_network` section: add `role: "resolved"`, `verdict: "not_network"` to each
- `extras` section: dissolve — entries with "NOT NETWORK" notes move to `not_network`. `l9_funder` moves to `infrastructure`. `phantom_fee_wallet` moves to `not_network` (protocol fee collector, not a network signal)
- Preserve `onramp_hot_wallets.unmapped` array as-is

- [ ] **Step 2: Write the transformed file**

Write the normalized `network-map.json`. Verify the file is valid JSON after writing. Do NOT change any addresses or notes content — only add `role`/`verdict`/`label` fields and restructure sections.

Every bare string entry like `"L4": "D7MsVpaXFP9sBCr8em4g4iGKYLBg2C2iwCAhBVUNHLXb"` becomes:
```json
"L4": {
  "address": "D7MsVpaXFP9sBCr8em4g4iGKYLBg2C2iwCAhBVUNHLXb",
  "label": "L4 Deployer",
  "role": "deployer",
  "verdict": "network",
  "notes": ""
}
```

Every CB entry like `"CB1": "5g7yNHyGLJ7fiQ9SN9mf47opDnMjc585kqXWt6d7aBWs"` becomes:
```json
"CB1": {
  "address": "5g7yNHyGLJ7fiQ9SN9mf47opDnMjc585kqXWt6d7aBWs",
  "label": "Coinbase Hot Wallet 1",
  "role": "onramp",
  "verdict": "network",
  "notes": ""
}
```

For `insiders.coinspot_insider.trading_wallet` which is currently a bare string `"DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn"`, promote to:
```json
"trading_wallet": {
  "address": "DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn",
  "label": "CoinSpot Insider Trading Wallet",
  "role": "insider",
  "verdict": "network",
  "notes": ""
}
```

- [ ] **Step 3: Validate the transformed file**

Run: `node -e "const d = JSON.parse(require('fs').readFileSync('data/network-map.json','utf8')); console.log('Sections:', Object.keys(d).join(', ')); let count = 0; const walk = (o) => { if (o && typeof o === 'object') { if (o.address) count++; Object.values(o).forEach(walk); } }; walk(d); console.log('Total wallet entries:', count);"`

Expected: Valid JSON, all sections present, wallet count ~89-91.

Verify `monitoring` and `extras` sections no longer exist. Verify `possible_associates` section exists with 3 entries. Verify `not_network` section has ~8 entries (was 1, now includes 6 from extras + phantom_fee_wallet).

- [ ] **Step 4: Commit**

```bash
git add data/network-map.json
git commit -m "Normalize network-map.json to uniform entry schema"
```

---

## Task 2: Normalize launch-history.json Schema

**Files:**
- Modify: `data/launch-history.json`

- [ ] **Step 1: Add missing fields to L1-L3**

L1-L3 are missing `funded_by` and `funded_utc` fields. Add them as explicit nulls:

For each of L1, L2, L3, add after the `deployer` field:
```json
"funded_by": null,
"funded_utc": null,
```

L1 already has no `funded_by`/`funded_utc`. L2 and L3 likewise. Adding explicit nulls makes the schema consistent.

- [ ] **Step 2: Normalize L10 to match L4-L9**

L10 currently stores funding info inside `timeline_utc` but lacks top-level `funded_by` and `funded_utc`. Add them:

```json
"funded_by": "Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6",
"funded_utc": "2026-03-15T04:51:00Z",
```

These values are extracted from `L10.timeline_utc.funding_wallet` and `L10.timeline_utc.funded`. Keep the `timeline_utc` block as supplementary detail.

- [ ] **Step 3: Validate schema consistency**

Run: `node -e "const d = JSON.parse(require('fs').readFileSync('data/launch-history.json','utf8')); const fields = ['token_name','ticker','ca','date','created_utc','funding_source','deployer','sol_spent','funded_by','funded_utc','notes']; for (const [k,v] of Object.entries(d.launches)) { const missing = fields.filter(f => !(f in v)); if (missing.length) console.log(k, 'missing:', missing.join(',')); else console.log(k, 'OK'); }"`

Expected: All 10 launches print "OK" (all have the standard field set).

- [ ] **Step 4: Commit**

```bash
git add data/launch-history.json
git commit -m "Normalize launch-history.json: add funded_by/funded_utc to all launches"
```

---

## Task 3: Normalize launch-details.json Schema

**Files:**
- Modify: `data/launch-details.json`

- [ ] **Step 1: Fix L3 duplicate early buyer**

Address `2eGkfs5jX9Mf12xanzthkTLMCfraSbFBL6MEDZkhebHm` appears at positions 2 and 12 (0-indexed: 1 and 11) in L3's `early_buyers` array. Remove the second occurrence (index 11).

- [ ] **Step 2: Add notes to L1-L3 empty inflows/outflows**

For L1, L2, L3: the `inflows` and `outflows` arrays are empty `[]`. Keep them empty but add a note field to each launch's deployer object:

In L1, L2, L3 deployer objects, ensure a `notes` field exists. L1 already has `"notes": "Used OG deployer directly, not a fresh wallet"`. L2 has `"notes": "Used OG deployer directly"`. L3 has `"notes": "Used OG deployer directly"`. These are sufficient — the `og_deployer_flows` top-level section contains the actual flow data.

No change needed for L1-L3 inflows/outflows — the empty arrays are correct.

- [ ] **Step 3: Add notes to L5 null outflows**

L5 has 11 outflow entries where `transfers` and `volume_usd` are both null. Add a `note` field to each:

For each L5 outflow entry that has `"transfers": null, "volume_usd": null`, add `"note": "data unavailable"`.

Example — change:
```json
{ "address": "Bra1HUNKj1tcM3iKnL3pHc2m1rXkXZ9JELq4ceivag34", "label": "Collection Wallet", "transfers": null, "volume_usd": null }
```
To:
```json
{ "address": "Bra1HUNKj1tcM3iKnL3pHc2m1rXkXZ9JELq4ceivag34", "label": "Collection Wallet", "transfers": null, "volume_usd": null, "note": "data unavailable" }
```

Apply to all 11 L5 outflow entries.

- [ ] **Step 4: Restructure L10 to match L1-L9 schema**

Current L10 uses flat fields (`token_name`, `token_address`, flat `deployer` string). Restructure to match:

```json
"L10": {
  "token": {
    "name": "XAIC",
    "ticker": "XAIC",
    "ca": "KfByHk48ecitUq8gXji2vr9smmRJKtqJwGAh2E9pump",
    "created_utc": "2026-03-15T21:40:44Z"
  },
  "deployer": {
    "address": "2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB",
    "funded_by": "Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6",
    "funded_by_label": "MoonPay Hot Wallet 1 (MP1)",
    "funded_utc": "2026-03-15T04:51:00Z",
    "notes": "First non-Coinbase funding (MoonPay via Phantom Buy button)"
  },
  "inflows": [],
  "outflows": [],
  "early_buyers": [
    "2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB",
    "SF9TGdsfTPcA3ZVmPdPt4YUxmFXjk6baTyNGjzxKJHJ",
    "FSbvLdrK1FuWJSNVfyguDQgvt93Zk92KnGxxSHoFjAyE",
    "niggerd597QYedtvjQDVHZTCCGyJrwHNm2i49dkm5zS",
    "BqP79WmkKFRytsrWCqY2ra4n5XzUxQjTf45rHy7rkgtC",
    "F7RV6aBWfniixoFkQNWmRwznDj2vae2XbusFfvMMjtbE",
    "Dj9WL4NhdQHd9X46KjoFfkDgKho1ZDYqpomJerbqDfe1",
    "7QJM8rXXUz4vTgKyQJNJyCtNLe9YuSpQoSsQUMZSRWHj",
    "4tMmABq7ZE1yaKRacMPeT3R3xQCzVHU73z66TLGhJFBf"
  ],
  "early_buyers_annotated": [
    { "position": 1, "address": "2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB", "seconds": 0, "usd": 1175, "tag": "L10 Deployer (create_and_buy)" },
    { "position": 2, "address": "SF9TGdsfTPcA3ZVmPdPt4YUxmFXjk6baTyNGjzxKJHJ", "seconds": 1, "usd": 89, "tag": "unknown" },
    { "position": 8, "address": "FSbvLdrK1FuWJSNVfyguDQgvt93Zk92KnGxxSHoFjAyE", "seconds": 2, "usd": 1048, "tag": "NETWORK: jetnut_network" },
    { "position": 13, "address": "niggerd597QYedtvjQDVHZTCCGyJrwHNm2i49dkm5zS", "seconds": 3, "usd": 916, "tag": "Nansen: Deployer. Suspicious — $916 at +3s" },
    { "position": 24, "address": "BqP79WmkKFRytsrWCqY2ra4n5XzUxQjTf45rHy7rkgtC", "seconds": 6, "usd": 689, "tag": "unknown. Suspicious — $689 at +6s" },
    { "position": 56, "address": "F7RV6aBWfniixoFkQNWmRwznDj2vae2XbusFfvMMjtbE", "seconds": 9, "usd": 132, "tag": "KNOWN: F7RV6aBW (possible associate, L7-L9 recurring)" },
    { "position": 61, "address": "Dj9WL4NhdQHd9X46KjoFfkDgKho1ZDYqpomJerbqDfe1", "seconds": 9, "usd": 367, "tag": "BloomBot user. $367 at +9s" },
    { "position": 63, "address": "7QJM8rXXUz4vTgKyQJNJyCtNLe9YuSpQoSsQUMZSRWHj", "seconds": 10, "usd": 1075, "tag": "unknown. Suspicious — $1075 at +10s, largest non-deployer buy!" },
    { "position": 114, "address": "4tMmABq7ZE1yaKRacMPeT3R3xQCzVHU73z66TLGhJFBf", "seconds": 63, "usd": 612, "tag": "unknown. $612 at +63s" }
  ],
  "early_buyers_note": "150 BUY trades in first 69 seconds. 117 unique traders. 3 known network. Data from Nansen tgm/dex-trades 2026-03-25.",
  "coinspot_insider_note": "CoinSpot insider (DmA9Jab) NOT found in first 405 XAIC buy trades (20 min window, pages 1-9). Also not in sell trades. None of the insider's wallets (DmA9Jab, 4916Nkdu, 9a22FhBe, 2Zizao3x) or Bundle 1 appear. Prior '1 second after deploy' claim UNVERIFIED — no raw data source. Insider may have received tokens via bundle (4916Nkdu from Bundle 1 per network-map) or traded much later. Verified 2026-03-28.",
  "cross_reference_summary": {
    "network_matches": 3,
    "known_wallets": ["L10 Deployer", "jetnut_network (position 8, $1048 at +2s)", "F7RV6aBW (position 56, $132 at +9s)"],
    "suspicious_profiled": {
      "BqP79Wmk": "HIGHLY SUSPICIOUS — trades ALL deployer tokens (DOGWIFXRP $129K, WFXRP $49K, etc), MoonPay funded (same as L10), receives from Large Funding Source (Fireblocks). First funded on L1 launch day.",
      "7QJM8rXX": "POSSIBLE ASSOCIATE — largest non-deployer buy ($1075). Receives $142 from 98KvdqZJ (SUSYE/CoinSpot insider). MEXC funded.",
      "niggerd5": "NOT NETWORK — heavy independent trader (Nansen 422). Zero connections.",
      "4tMmABq7": "NOT NETWORK — single-use XAIC sniper. Suspicious timing (funded 58m before deploy) but zero connections."
    }
  }
}
```

Key changes: `token_name`/`token_address` → `token` sub-object. Flat `deployer` string → `deployer` sub-object. Original annotated `early_buyers` array → `early_buyers_annotated`. New flat `early_buyers` array with just addresses. Preserve `coinspot_insider_note`, `cross_reference_summary`, `early_buyers_note`.

- [ ] **Step 5: Validate**

Run: `node -e "const d = JSON.parse(require('fs').readFileSync('data/launch-details.json','utf8')); for (const [k,v] of Object.entries(d.launches)) { const hasToken = v.token && v.token.name; const hasDeployer = v.deployer && v.deployer.address; const hasEB = Array.isArray(v.early_buyers); console.log(k, hasToken ? 'token:OK' : 'token:FAIL', hasDeployer ? 'deployer:OK' : 'deployer:FAIL', hasEB ? 'eb:OK('+v.early_buyers.length+')' : 'eb:FAIL'); }"`

Expected: All 10 launches show OK for token, deployer, and early_buyers. L3 should have 32 early buyers (was 33, removed duplicate). L10 should have 9 early buyers (flat address list).

- [ ] **Step 6: Commit**

```bash
git add data/launch-details.json
git commit -m "Normalize launch-details.json: fix L3 dupe, L5 null notes, restructure L10"
```

---

## Task 4: Reconcile cross-reference-report.json Metadata

**Files:**
- Modify: `data/results/cross-reference-report.json`

- [ ] **Step 1: Recount tags**

Read the file and count actual tags. Current `by_tag`: `{ unknown: 19, known_infra: 26, known_insider: 4, resolved: 7 }`. Total: 56.

Actual tag prefixes in data:
- `"unknown"` — count them
- `"known_infra"` — count them
- `"known_insider"` and `"known_insider:..."` — count them
- `"resolved:..."` — count them
- `"monitoring:..."` — count them
- `"network_connected:..."` — count them

The `monitoring` and `network_connected` prefixed entries are currently bucketed under `resolved: 7`. Break them out:

```json
"by_tag": {
  "unknown": 19,
  "known_infra": 26,
  "known_insider": 4,
  "resolved": 4,
  "monitoring": 3,
  "network_connected": 1
}
```

Verify: 19 + 26 + 4 + 4 + 3 + 1 = 57? Recount from actual data to get exact numbers. The `known_insider` count should be verified — DmA9Jab has `launch_count: 1` which is unusual for "recurring wallets."

- [ ] **Step 2: Write updated metadata**

Update the `metadata.by_tag` object with correct counts. Do not change any wallet entries.

- [ ] **Step 3: Commit**

```bash
git add data/results/cross-reference-report.json
git commit -m "Reconcile cross-reference-report.json tag counts with actual data"
```

---

## Task 5: Verify investigation-notes.json

**Files:**
- Modify: `data/results/investigation-notes.json` (only if issues found)

- [ ] **Step 1: Verify arithmetic**

Read the file. Sum all route amounts: A ($50,257) + B ($28,184) + C ($49,000) + D ($15,700) + E ($265,000) + F ($233,000) + G (~$9,800) = ~$650,941. The stated total is "$400K+ confirmed" — this is conservative because routes overlap and some amounts are unverifiable (Route C is $49K unverifiable). Verify the $400K+ claim is reasonable.

- [ ] **Step 2: Check Route C note**

Confirm Route C still says the $49K is unverifiable on-chain and that 9exPdTUV sends to 9cDDJ5g2 (Fireblocks Custody shared wallet), not directly to 2q8nSJgC.

- [ ] **Step 3: Commit (only if changes made)**

If no changes needed, skip this step. If corrections made:
```bash
git add data/results/investigation-notes.json
git commit -m "Verify investigation-notes.json: confirm route totals and Route C status"
```

---

## Task 6: Create Shared Audit Utilities

**Files:**
- Create: `src/audit/utils.ts`

- [ ] **Step 1: Write the utilities file**

```typescript
import 'dotenv/config';

// API keys from .env
const HELIUS_API_KEY = process.env.HELIUS_API_KEY!;
const NANSEN_API_KEY = process.env.NANSEN_API_KEY!;
const ARKHAM_API_KEY = process.env.ARKAN_API_KEY!; // Note: ARKAN, not ARKHAM

// Rate limiting
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helius RPC (50 req/sec, 1 credit per getBalance)
export async function heliusRpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json() as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`Helius RPC ${method}: ${json.error.message}`);
  return json.result;
}

// Helius Wallet API (10 req/sec, 100ms delay, 100 credits per call)
export async function heliusWallet(endpoint: string, options?: { method?: string; body?: unknown }): Promise<unknown> {
  await sleep(100); // Rate limit: 10 req/sec
  const url = `https://api.helius.xyz/v1/wallet/${endpoint}?api-key=${HELIUS_API_KEY}`;
  const res = await fetch(url, {
    method: options?.method || 'GET',
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Helius Wallet ${endpoint}: ${res.status} ${await res.text()}`);
  return res.json();
}

// Helius batch-identity (100 credits for up to 100 addresses)
export async function heliusBatchIdentity(addresses: string[]): Promise<unknown[]> {
  await sleep(100);
  const res = await fetch(`https://api.helius.xyz/v1/wallet/batch-identity?api-key=${HELIUS_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addresses }),
  });
  if (!res.ok) throw new Error(`Helius batch-identity: ${res.status} ${await res.text()}`);
  return res.json() as Promise<unknown[]>;
}

// Nansen API (POST, 1.5-2s delay between calls)
export async function nansen(endpoint: string, body: unknown): Promise<unknown> {
  await sleep(2000); // Rate limit: conservative 2s delay
  const res = await fetch(`https://api.nansen.ai/api/v1${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apiKey': NANSEN_API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 422) return { error: 'unprocessable', status: 422 };
  if (res.status === 429) {
    console.warn('Nansen rate limited, waiting 5s...');
    await sleep(5000);
    return nansen(endpoint, body); // Retry once
  }
  if (!res.ok) throw new Error(`Nansen ${endpoint}: ${res.status} ${await res.text()}`);
  return res.json();
}

// Arkham API (GET, 20 req/sec standard, 1 req/sec on transfers/counterparties)
export async function arkham(endpoint: string, params?: Record<string, string>, slowEndpoint = false): Promise<unknown> {
  if (slowEndpoint) await sleep(1000); // 1 req/sec for transfers/counterparties
  const url = new URL(`https://api.arkm.com${endpoint}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { 'API-Key': ARKHAM_API_KEY },
  });
  if (!res.ok) throw new Error(`Arkham ${endpoint}: ${res.status} ${await res.text()}`);
  return res.json();
}

// Arkham batch intelligence (up to 1000 addresses, 1 credit per address)
export async function arkhamBatchIntel(addresses: string[]): Promise<unknown> {
  const res = await fetch('https://api.arkm.com/intelligence/address/batch/all', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'API-Key': ARKHAM_API_KEY,
    },
    body: JSON.stringify({ addresses }),
  });
  if (!res.ok) throw new Error(`Arkham batch: ${res.status} ${await res.text()}`);
  return res.json();
}

// Load addresses from data files — NEVER type manually
export function loadAddressesFromCrossRef(tag: string): string[] {
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync('data/results/cross-reference-report.json', 'utf8'));
  return data.recurring_wallets
    .filter((w: { tag: string }) => w.tag === tag)
    .map((w: { address: string }) => w.address);
}

export function loadAddressFromNetworkMap(section: string, key: string): string {
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync('data/network-map.json', 'utf8'));
  const entry = data[section]?.[key];
  if (!entry) throw new Error(`Not found: ${section}.${key}`);
  return typeof entry === 'string' ? entry : entry.address;
}
```

- [ ] **Step 2: Verify .env keys are accessible**

Run: `npx tsx -e "import 'dotenv/config'; console.log('HELIUS:', process.env.HELIUS_API_KEY ? 'OK' : 'MISSING'); console.log('NANSEN:', process.env.NANSEN_API_KEY ? 'OK' : 'MISSING'); console.log('ARKHAM:', process.env.ARKAN_API_KEY ? 'OK' : 'MISSING');"`

Expected: All three print "OK".

- [ ] **Step 3: Commit**

```bash
mkdir -p src/audit
git add src/audit/utils.ts
git commit -m "Add shared audit utilities: API clients, rate limiting, address loading"
```

---

## Task 7: Batch Screen All Target Wallets

**Files:**
- Create: `src/audit/batch-screen.ts`

This script screens all 24 target wallets (19 unknowns + 3 possible associates + 2 OG counterparties) using cheap batch calls.

- [ ] **Step 1: Write the batch screening script**

```typescript
import { readFileSync, writeFileSync } from 'fs';
import { heliusRpc, heliusWallet, heliusBatchIdentity, arkhamBatchIntel } from './utils.js';

async function main() {
  // 1. Load 19 unknown addresses from cross-reference-report.json
  const crossRef = JSON.parse(readFileSync('data/results/cross-reference-report.json', 'utf8'));
  const unknowns: string[] = crossRef.recurring_wallets
    .filter((w: { tag: string }) => w.tag === 'unknown')
    .map((w: { address: string }) => w.address);
  console.log(`Loaded ${unknowns.length} unknown recurring wallets`);

  // 2. Load 3 possible associates from network-map.json
  const networkMap = JSON.parse(readFileSync('data/network-map.json', 'utf8'));
  const associates: string[] = [
    networkMap.possible_associates['7QJM8rXX'].address,
    networkMap.possible_associates['F7RV6aBW'].address,
    networkMap.possible_associates['D1XcKeSS'].address,
  ];
  console.log(`Loaded ${associates.length} possible associates`);

  // 3. Load 2 unlabeled OG deployer counterparties from launch-details.json
  const launchDetails = JSON.parse(readFileSync('data/launch-details.json', 'utf8'));
  const ogOutflows = launchDetails.og_deployer_flows.outflows;
  const unlabeled: string[] = ogOutflows
    .filter((o: { label: string | null }) => o.label === null)
    .map((o: { address: string }) => o.address)
    .filter((addr: string) => {
      // Only the two we haven't identified: 6UrYwo9F and 2q8nSJgC
      // 6UrYwo9F is actually already in network-map as network_connected
      // 2q8nSJgC is already in network-map as profit_cashout.secondary_aggregator
      // Check if they have labels already
      return true; // Load all null-label outflows, we'll check against network-map
    });
  console.log(`Found ${unlabeled.length} null-label OG outflows`);

  // Combine all targets
  const allTargets = [...unknowns, ...associates, ...unlabeled];
  const unique = [...new Set(allTargets)];
  console.log(`\nTotal unique targets: ${unique.length}`);

  // 4. Helius getBalance for all (1 credit each)
  console.log('\n--- Helius getBalance ---');
  const balances: Record<string, number> = {};
  for (const addr of unique) {
    const result = await heliusRpc('getBalance', [addr]) as { value: number };
    const sol = (result?.value || 0) / 1e9;
    balances[addr] = sol;
    console.log(`${addr.slice(0, 8)}... = ${sol.toFixed(4)} SOL`);
  }

  // 5. Helius batch-identity (100 credits for all)
  console.log('\n--- Helius batch-identity ---');
  const identities = await heliusBatchIdentity(unique);
  console.log(`Identified ${(identities as unknown[]).length} wallets`);
  for (const id of identities as Array<{ address: string; name?: string; type?: string }>) {
    if (id.name) console.log(`  ${id.address.slice(0, 8)}... = ${id.name} (${id.type})`);
  }

  // 6. Arkham batch intelligence (1 credit per address)
  console.log('\n--- Arkham batch intelligence ---');
  const arkhamResult = await arkhamBatchIntel(unique) as Record<string, unknown>;
  for (const [addr, intel] of Object.entries(arkhamResult)) {
    const i = intel as { arkhamEntity?: { name: string }; isUserAddress?: boolean };
    console.log(`  ${(addr as string).slice(0, 8)}... isUser=${i.isUserAddress} entity=${i.arkhamEntity?.name || 'none'}`);
  }

  // 7. Helius funded-by for all (100 credits each)
  console.log('\n--- Helius funded-by ---');
  const funders: Record<string, unknown> = {};
  for (const addr of unique) {
    const result = await heliusWallet(`${addr}/funded-by`);
    funders[addr] = result;
    if (result) {
      const r = result as { funder: string; funderName?: string; amount?: number };
      console.log(`  ${addr.slice(0, 8)}... funded by ${r.funder?.slice(0, 8)}... (${r.funderName || 'unknown'}) ${r.amount || '?'} SOL`);
    } else {
      console.log(`  ${addr.slice(0, 8)}... funded-by: 404 (no SOL received)`);
    }
  }

  // 8. Write raw results
  const results = {
    timestamp: new Date().toISOString(),
    targets: unique.map(addr => ({
      address: addr,
      balance_sol: balances[addr],
      helius_identity: (identities as Array<{ address: string }>).find(i => i.address === addr) || null,
      arkham_intel: (arkhamResult as Record<string, unknown>)[addr] || null,
      funded_by: funders[addr] || null,
    })),
  };
  writeFileSync('data/results/batch-screen-results.json', JSON.stringify(results, null, 2));
  console.log('\nResults saved to data/results/batch-screen-results.json');
}

main().catch(console.error);
```

- [ ] **Step 2: Run the batch screening script**

Run: `npx tsx src/audit/batch-screen.ts`

Expected: Completes without errors. Prints balance, identity, Arkham intel, and funded-by for each wallet. Saves results to `data/results/batch-screen-results.json`.

**IMPORTANT:** Before running, verify the `possible_associates` section exists in network-map.json (created in Task 1). If Task 1 hasn't been executed yet, adjust the path to read from `monitoring` section instead.

Credit cost: ~2,524 Helius + ~24 Arkham = ~2,548 total.

- [ ] **Step 3: Review results and triage**

Read `data/results/batch-screen-results.json`. For each wallet, apply triage criteria:

**Flag for deep dive if ANY of:**
- Funded by a known network wallet (check funder address against network-map.json)
- Funded by Coinbase or MoonPay (deployer's known on-ramps)
- Arkham `isUserAddress=false` (bot/program — could be deployer-controlled)
- Helius identity matches an exchange the deployer uses
- Balance > 5 SOL (active wallet with funds)

**Tag as `resolved: independent_trader` if ALL of:**
- Funded by an exchange not in the deployer's network (Binance, Bybit, MEXC, etc.)
- `isUserAddress=true` (human wallet)
- Balance < 1 SOL
- No known entity label connecting to network

Print a summary of flagged vs resolved wallets.

- [ ] **Step 4: Commit**

```bash
git add src/audit/batch-screen.ts data/results/batch-screen-results.json
git commit -m "Batch screen 24 target wallets: balances, identities, funders"
```

---

## Task 8: Deep Dive Flagged Wallets

**Files:**
- Create: `src/audit/deep-dive.ts`

This script investigates wallets flagged in Task 7's triage using Nansen counterparties and Arkham transfers. **Only run on flagged wallets, not all 24.**

- [ ] **Step 1: Write the deep dive script**

```typescript
import { readFileSync, writeFileSync } from 'fs';
import { nansen, arkham } from './utils.js';

// Load flagged addresses — update this list based on Task 7 triage results
const FLAGGED_ADDRESSES: string[] = [
  // POPULATE FROM TASK 7 TRIAGE — read from batch-screen-results.json
  // DO NOT hardcode addresses. Load programmatically:
];

// Load from batch screen results
function loadFlagged(): string[] {
  const results = JSON.parse(readFileSync('data/results/batch-screen-results.json', 'utf8'));
  // Filter for flagged wallets based on triage criteria
  // This will be filled in after reviewing batch-screen results
  return results.targets
    .filter((t: { funded_by: { funderName?: string } | null; arkham_intel: { isUserAddress?: boolean } | null; balance_sol: number }) => {
      // Flag if: funded by network, isUserAddress=false, or high balance
      // Adjust criteria based on actual results
      return false; // Placeholder — replace with actual triage logic after reviewing results
    })
    .map((t: { address: string }) => t.address);
}

// Also always include the 3 possible associates regardless of triage
function loadAssociates(): string[] {
  const networkMap = JSON.parse(readFileSync('data/network-map.json', 'utf8'));
  return [
    networkMap.possible_associates['7QJM8rXX'].address,
    networkMap.possible_associates['F7RV6aBW'].address,
    networkMap.possible_associates['D1XcKeSS'].address,
  ];
}

// Launch dates for Nansen transaction window queries (max 3-4 day range)
const LAUNCH_DATES: Record<string, { from: string; to: string }> = {
  L1: { from: '2025-06-14T00:00:00Z', to: '2025-06-17T00:00:00Z' },
  L2: { from: '2025-07-19T00:00:00Z', to: '2025-07-22T00:00:00Z' },
  L3: { from: '2025-08-23T00:00:00Z', to: '2025-08-26T00:00:00Z' },
  L4: { from: '2025-09-27T00:00:00Z', to: '2025-09-30T00:00:00Z' },
  L5: { from: '2025-11-01T00:00:00Z', to: '2025-11-04T00:00:00Z' },
  L6: { from: '2025-11-29T00:00:00Z', to: '2025-12-02T00:00:00Z' },
  L7: { from: '2026-01-17T00:00:00Z', to: '2026-01-20T00:00:00Z' },
  L8: { from: '2026-01-30T00:00:00Z', to: '2026-02-02T00:00:00Z' },
  L9: { from: '2026-02-12T00:00:00Z', to: '2026-02-15T00:00:00Z' },
  L10: { from: '2026-03-14T00:00:00Z', to: '2026-03-17T00:00:00Z' },
};

async function investigateWallet(address: string) {
  console.log(`\n=== Investigating ${address.slice(0, 8)}... ===`);

  // 1. Nansen counterparties (5 credits)
  console.log('Nansen counterparties...');
  const counterparties = await nansen('/profiler/address/counterparties', {
    address,
    chain: 'solana',
    date: { from: '2025-06-01T00:00:00Z', to: '2026-04-01T00:00:00Z' },
    group_by: 'wallet',
    source_input: 'Combined',
    pagination: { page: 1, per_page: 20 },
    order_by: [{ field: 'total_volume_usd', direction: 'DESC' }],
  });

  // 2. Check each counterparty against Arkham isUserAddress
  // to avoid profiling ATAs/program accounts
  if (counterparties && !(counterparties as { error?: string }).error) {
    const cpData = (counterparties as { data?: Array<{ counterparty_address: string }> }).data || [];
    const cpAddresses = cpData.map(cp => cp.counterparty_address);
    if (cpAddresses.length > 0) {
      console.log(`  Checking ${cpAddresses.length} counterparties via Arkham...`);
      // Batch check isUserAddress — avoid profiling ATAs
    }
  }

  // 3. Arkham transfers around launch dates (2 credits per row, limit: 50)
  console.log('Arkham transfers...');
  const transfers = await arkham('/transfers', {
    base: address,
    chains: 'solana',
    limit: '50',
    sortKey: 'time',
    sortDir: 'desc',
  }, true); // slowEndpoint = true (1 req/sec)

  return { address, counterparties, transfers };
}

async function main() {
  const flagged = loadFlagged();
  const associates = loadAssociates();
  const allTargets = [...new Set([...flagged, ...associates])];

  console.log(`Deep diving ${allTargets.length} wallets (${flagged.length} flagged + ${associates.length} associates)`);

  const results: unknown[] = [];
  for (const addr of allTargets) {
    const result = await investigateWallet(addr);
    results.push(result);
  }

  writeFileSync('data/results/deep-dive-results.json', JSON.stringify(results, null, 2));
  console.log('\nResults saved to data/results/deep-dive-results.json');
}

main().catch(console.error);
```

- [ ] **Step 2: Update triage logic after reviewing Task 7 results**

After running Task 7's batch screen and reviewing results, update the `loadFlagged()` function with the actual triage criteria. The specific filtering logic depends on what the batch screen reveals.

- [ ] **Step 3: Run the deep dive script**

Run: `npx tsx src/audit/deep-dive.ts`

Expected: Completes with Nansen counterparties and Arkham transfers for each flagged wallet + all 3 associates. Saves to `data/results/deep-dive-results.json`.

- [ ] **Step 4: Commit**

```bash
git add src/audit/deep-dive.ts data/results/deep-dive-results.json
git commit -m "Deep dive flagged wallets: Nansen counterparties + Arkham transfers"
```

---

## Task 9: MoonPay Wallet Discovery

**Files:**
- Create: `src/audit/moonpay-search.ts`

- [ ] **Step 1: Write the MoonPay search script**

```typescript
import { writeFileSync } from 'fs';
import { arkham, heliusBatchIdentity, nansen } from './utils.js';

async function main() {
  console.log('=== MoonPay Wallet Discovery (Second Attempt) ===\n');

  // 1. Arkham entity search
  console.log('1. Arkham entity search for "moonpay"...');
  const searchResult = await arkham('/intelligence/search', { q: 'moonpay' });
  console.log('Search results:', JSON.stringify(searchResult, null, 2));

  // 2. Arkham entity lookup
  console.log('\n2. Arkham entity lookup "moonpay"...');
  const entityResult = await arkham('/intelligence/entity/moonpay');
  console.log('Entity result:', JSON.stringify(entityResult, null, 2));

  // 3. Nansen entity name search (0 credits)
  console.log('\n3. Nansen entity search for "moonpay"...');
  const nansenSearch = await nansen('/search/entity-name', { search_query: 'moonpay' });
  console.log('Nansen entities:', JSON.stringify(nansenSearch, null, 2));

  // 4. If Arkham returns Solana MoonPay addresses, cross-verify with Helius
  // Extract any Solana addresses from Arkham results and batch-identity them
  // This logic depends on the actual response structure

  // 5. Save all results
  const results = {
    timestamp: new Date().toISOString(),
    arkham_search: searchResult,
    arkham_entity: entityResult,
    nansen_search: nansenSearch,
    notes: 'Second attempt at finding MoonPay MP2/MP3 on Solana. First attempt (2026-03-25) found only MP1 and MP4.',
  };
  writeFileSync('data/results/moonpay-search-results.json', JSON.stringify(results, null, 2));
  console.log('\nResults saved to data/results/moonpay-search-results.json');
}

main().catch(console.error);
```

- [ ] **Step 2: Run the MoonPay search**

Run: `npx tsx src/audit/moonpay-search.ts`

Expected: Results from all three sources saved. Review output for any new Solana MoonPay wallet addresses not already in network-map.json.

- [ ] **Step 3: Update STRATEGY.md with findings**

If new MoonPay wallets found: add to `onramp_hot_wallets` in network-map.json and update STRATEGY.md Vector A watchlist.

If still not found: update STRATEGY.md to explicitly document: "MP2/MP3 search: second attempt 2026-04-02 via Arkham entity search + Nansen entity search. Still not found on Solana. Vector A covers MP1 only."

- [ ] **Step 4: Commit**

```bash
git add src/audit/moonpay-search.ts data/results/moonpay-search-results.json
git add -A data/network-map.json STRATEGY.md  # Only if modified
git commit -m "MoonPay wallet discovery: second attempt via Arkham + Nansen entity search"
```

---

## Task 10: Update Data Files With Investigation Findings

**Files:**
- Modify: `data/network-map.json`
- Modify: `data/results/cross-reference-report.json`

This task is run after Tasks 7-9 complete and results have been reviewed.

- [ ] **Step 1: Update network-map.json with verdicts**

For each investigated wallet, add or update its entry in network-map.json using the uniform format:

For wallets resolved as independent traders:
```json
{
  "address": "...",
  "label": "Independent Trader",
  "role": "resolved",
  "verdict": "not_network",
  "notes": "Batch screened 2026-04-02. Funded by [exchange]. isUserAddress=[true/false]. [X] SOL balance. No network connections."
}
```

For wallets confirmed as network:
```json
{
  "address": "...",
  "label": "[descriptive label]",
  "role": "network_connected",
  "verdict": "network",
  "notes": "Deep dived 2026-04-02. Funded by [source]. [counterparty details]. [cross-reference details]."
}
```

For wallets that need further investigation (deferred to Phase 2):
```json
{
  "address": "...",
  "label": "[descriptive label]",
  "role": "unresolved",
  "verdict": "needs_further_investigation",
  "notes": "Screened 2026-04-02. [what was found, what's still unclear]."
}
```

Add resolved unknowns to the `not_network` section. Add confirmed network wallets to `network_connected`. Add deferred wallets to a new `unresolved` section.

- [ ] **Step 2: Update cross-reference-report.json tags**

For each of the 19 unknown wallets that received a verdict, update their `tag` field:
- Independent trader: `"resolved:independent_trader"`
- Confirmed network: `"network_connected:[label]"`
- Needs further investigation: `"unresolved:[reason]"`

Update `metadata.by_tag` counts to reflect the changes.

- [ ] **Step 3: Update OG deployer outflow labels**

In `data/launch-details.json`, update the two null-label outflows in `og_deployer_flows.outflows`:
- `6UrYwo9F97zDpd7cCvnKJp5HrcGnhSYKmHaphiZd71UE` — already labeled in network-map as "Relay: OG sends $5.1K to it, sends $5.2K to 2q8nSJgC". Update label in launch-details to `"6UrYwo9F (Network Relay → Secondary Aggregator)"`.
- `2q8nSJgCpaZZjchK4s7mGy3f9tAJgsXZQQHDfKMB4EN7` — already labeled in network-map as `secondary_aggregator`. Update label in launch-details to `"Secondary Aggregator (2q8nSJgC)"`.

- [ ] **Step 4: Final validation**

Run: `node -e "const nm = JSON.parse(require('fs').readFileSync('data/network-map.json','utf8')); const cr = JSON.parse(require('fs').readFileSync('data/results/cross-reference-report.json','utf8')); console.log('Unknown tags remaining:', cr.recurring_wallets.filter(w => w.tag === 'unknown').length); console.log('Cross-ref by_tag:', JSON.stringify(cr.metadata.by_tag));"`

Expected: `Unknown tags remaining: 0` (all 19 have been triaged). `by_tag` counts match actual data.

- [ ] **Step 5: Commit**

```bash
git add data/network-map.json data/results/cross-reference-report.json data/launch-details.json
git commit -m "Update data files with audit findings: all unknowns triaged, labels updated"
```

---

## Verification Checklist

After all tasks complete, verify:

- [ ] `network-map.json`: No bare string entries. Every wallet has `address`, `label`, `role`, `verdict`, `notes`. No `monitoring` or `extras` sections.
- [ ] `launch-history.json`: All 10 launches have `funded_by` and `funded_utc` fields (null for L1-L3, populated for L4-L10).
- [ ] `launch-details.json`: L10 matches L1-L9 schema. L3 has no duplicate. L5 nulls annotated. OG deployer outflows fully labeled.
- [ ] `cross-reference-report.json`: Zero wallets tagged `"unknown"`. `by_tag` counts match actual data.
- [ ] `investigation-notes.json`: Route totals verified. Route C status confirmed.
- [ ] All new addresses were loaded from files programmatically, never typed manually.
- [ ] All entity labels were cross-verified across 2+ APIs before updating verdicts.
- [ ] MoonPay discovery documented (found or gap confirmed in STRATEGY.md).
