# Data Audit & Gap Investigation — Design Spec

**Date:** 2026-04-02
**Phase:** 1 of 4 (Audit > Add New Intel > Close Research Gaps > Build Monitor)
**Approach:** Two-Pass Hybrid (C)

---

## Objective

Audit and finalize all canonical data files for accuracy, consistency, and completeness. Investigate the highest-signal unresolved wallets to catch any missed network members before new intel is added.

---

## Pass 1: Structural Cleanup

Normalize all canonical data files into consistent schemas so they're clean, queryable, and ready to receive new information. No API calls required — this is purely data file work.

### 1a. network-map.json — Uniform Entry Format

**Problem:** Entries use inconsistent formats — bare strings (deployers, bundles, CB1-10), objects with varying fields, deeply nested insider clusters. No uniform `verdict` or `role` field. `monitoring` and `extras` sections act as catch-all buckets.

**Fix:** Every wallet entry becomes an object with a consistent shape:

```json
{
  "address": "full-base58-address",
  "label": "human-readable-name",
  "role": "deployer | bundle | infrastructure | profit_routing | side_project | insider | onramp | cashout | network_connected",
  "verdict": "network | not_network | possible_associate | unresolved",
  "notes": "context string"
}
```

Changes:
- Bare string entries (deployers, bundles, CB1-10) promoted to full objects
- Insider clusters keep nesting but each sub-wallet gets the standard fields
- `monitoring` section dissolved — wallets move to appropriate category with `verdict` field
- `extras` section dissolved — each entry goes to proper section based on verdict
- `not_network` entries get `verdict: "not_network"` and stay grouped for clarity
- `onramp_hot_wallets.unmapped` array preserved as-is (list of exchange names, not wallet entries)

### 1b. launch-history.json — Schema Normalization

**Problem:** L1-L3 missing `funded_by`/`funded_utc` fields entirely (vs null). L10 uses `timeline_utc` sub-object instead of top-level `funded_by`/`funded_utc`. Inconsistent structure across launches.

**Fix:**
- L1-L3: Add `funded_by: null` and `funded_utc: null` explicitly
- L10: Add top-level `funded_by` and `funded_utc` extracted from `timeline_utc`
- L10's `timeline_utc` preserved as supplementary detail (only launch with this granularity)
- All launches share the same top-level field set: `token_name`, `ticker`, `ca`, `date`, `created_utc`, `funding_source`, `deployer`, `sol_spent`, `funded_by`, `funded_utc`, `notes`

### 1c. launch-details.json — Schema Normalization

**Problem:** L10 uses completely different field names and nesting from L1-L9 (`token_name` vs `token.name`, flat `deployer` string vs `deployer` sub-object, annotated early buyer objects vs flat address arrays). L5 outflows all null. L3 has duplicate early buyer. L1-L3 have empty inflow/outflow arrays with no explanation.

**Fix:**
- L10 restructured to match L1-L9 schema:
  - `token` sub-object with `name`, `ticker`, `ca`, `created_utc`
  - `deployer` sub-object with `address`, `funded_by`, `funded_by_label`, `funded_utc`
  - `inflows` and `outflows` arrays (populate from available data or leave empty with note)
  - `early_buyers` as flat address array for consistency
- L10's enriched early buyer data (position, seconds, usd, tag) preserved in separate `early_buyers_annotated` field
- L3: Remove duplicate address (`2eGkfs5jX9Mf12xanzthkTLMCfraSbFBL6MEDZkhebHm`) from early buyers
- L5: Add notes to null outflow entries: `"note": "data unavailable — likely closed accounts"`
- L1-L3: Add note to empty inflows/outflows: `"note": "OG deployer era — see og_deployer_flows"`

### 1d. cross-reference-report.json — Metadata Reconciliation

**Problem:** `metadata.by_tag` counts may not match actual tag distribution. Tags like `monitoring:` and `network_connected:` are bucketed under `resolved` but this isn't explicit.

**Fix:**
- Recount all 56 recurring wallets by actual tag prefix
- Update `by_tag` to reflect true distribution
- Add any missing tag categories to the breakdown

### 1e. investigation-notes.json — Verification Pass

**Problem:** Minimal — file is well-structured. Route C is marked unverifiable. CoinSpot L10 volume referenced as unverified.

**Fix:**
- Verify Route C note is accurate (no action needed if already marked)
- Confirm $400K+ total is still arithmetically correct across all routes
- No structural changes needed

---

## Pass 2: Targeted Investigation

Profile unresolved wallets using all three APIs to catch missed network members. All addresses read programmatically from data files — never manually typed.

### Investigation Protocol

For every wallet investigated, follow this sequence:

1. **Read address from JSON file** — `JSON.parse()` from canonical data, never type manually
2. **Helius getBalance** (1 credit) — is the wallet active? Screen cheap first
3. **Arkham `POST /intelligence/address/batch/all`** (batch up to 1,000) — get `isUserAddress`, entity labels, contract status. Confirms whether address is a wallet vs ATA/program
4. **Helius `funded-by`** (100 credits, cache permanently) — who funded it?
5. **Helius `batch-identity`** (100 credits for up to 100 addresses) — known entity?
6. **Triage decision point:** If funded by a network wallet, exchange in our network, or shows suspicious pattern -> proceed to deep dive. Otherwise -> tag as `resolved: independent_trader`
7. **Deep dive (flagged wallets only):**
   - **Nansen counterparties** (5 credits) — NOT Arkham counterparties (returns empty for most Solana wallets per CLAUDE.md rules). Volumes are aggregated — verify suspicious volumes at tx level
   - **Nansen `/profiler/address/transactions`** (1 credit, free tier) — max 3-4 day date range per call. Use launch dates as windows
   - **Arkham transfers** (2 credits per row returned, 1 req/sec) — use `limit` parameter to control costs. Filter by time window around launches
   - Before profiling any Nansen counterparty: verify `isUserAddress` via Arkham to avoid profiling ATAs/program accounts

8. **Cross-verify** — any label/entity must be confirmed by at least 2 of 3 APIs before updating verdict
9. **Update network-map.json** — using the uniform format from Pass 1

### 2a. The 19 Unknown Recurring Wallets

Source: `data/results/cross-reference-report.json`, entries where `tag === "unknown"`

These appeared in 2-3 launches but were never identified. Most are likely independent traders who happened to buy multiple deployer tokens. Some may reveal network connections.

**Batch steps:**
1. Extract all 19 addresses programmatically from cross-reference-report.json
2. Arkham batch intelligence (1 call, up to 1,000 addresses) — get `isUserAddress`, entity, labels for all 19
3. Helius batch-identity (1 call for all 19) — check if any are known entities
4. Helius getBalance for all 19 (19 credits total) — activity screening
5. Helius funded-by for all 19 (1,900 credits) — trace funding sources
6. Triage: flag any wallet funded by a known network address, an exchange we've seen in the deployer's flows, or showing fresh-wallet-then-large-trade patterns
7. Deep dive flagged wallets only (Nansen counterparties + transactions)

**Expected outcome:** ~15-17 tagged `resolved: independent_trader`, 2-4 flagged for deeper investigation.

### 2b. The 3 Possible Associates

Source: `data/network-map.json`, monitoring section: `7QJM8rXX`, `F7RV6aBW`, `D1XcKeSS`

Already flagged as suspicious — these get deeper investigation than the 19 unknowns regardless of initial triage.

**Per wallet:**
1. Helius funded-by (100 credits each) — identity already covered by batch call in 2a
2. Arkham intelligence/address — entity, `isUserAddress`, labels (already covered by batch call in 2a)
3. Nansen counterparties (5 credits) — look for overlap with known network wallets
4. Nansen transactions — check activity around each launch date (3-4 day windows)
5. Arkham transfers — filter by time windows around launches, use `limit` to control credit spend
6. Cross-reference with launch-details.json early buyer lists — verify all appearances are accounted for

### 2c. The 2 Unlabeled OG Deployer Counterparties

Source: `data/launch-details.json`, `og_deployer_flows.outflows` — addresses `6UrYwo9F...` and `2q8nSJg...` with null labels

**Per wallet:**
1. Read full addresses from launch-details.json (the prefixes above are truncated — must get full address from file)
2. Arkham intelligence/address — entity lookup
3. Helius funded-by + identity
4. If exchange deposit -> label and close. If network-connected -> add to network-map with full profile

### 2d. MoonPay MP2/MP3 Discovery (Second Attempt)

**Problem:** Only 1 confirmed MoonPay hot wallet (MP1). Prior search didn't find MP2/MP3 on Solana. If deployer uses a different MoonPay wallet for L11, Vector A is blind.

**Approach:**
1. Arkham entity search: `GET /intelligence/search?q=moonpay` — check for any new Solana-labeled MoonPay wallets since last search
2. Arkham entity lookup: `GET /intelligence/entity/moonpay` — get all known MoonPay addresses, filter for Solana
3. Helius batch-identity for any Arkham results — cross-verify
4. Nansen entity search: `POST /search/entity-name` with "moonpay" (0 credits) — find exact entity name, then query Solana balances/addresses
5. If new MoonPay wallets found -> add to `onramp_hot_wallets` in network-map.json
6. If still not found -> document the gap explicitly in STRATEGY.md and note that Vector A covers MP1 only

### Credit Budget (Revised)

**Helius (10M credits/month, Developer plan):**

| Action | Credits | Notes |
|--------|---------|-------|
| batch-identity (24 wallets) | 100 | 1 call |
| funded-by (24 wallets) | 2,400 | 100 each, cache permanently |
| getBalance (24 wallets) | 24 | Screening |
| history/transfers (deep dives, ~5 wallets) | ~500 | Only flagged targets |
| **Helius total** | **~3,024** | 0.03% of monthly budget |

**Nansen (1,000 starter credits, Pro plan):**

| Action | Credits | Notes |
|--------|---------|-------|
| counterparties (~8 wallets) | 40 | 5 credits each. Estimate: 3 possible associates + ~5 flagged from unknowns/OG counterparties |
| transactions (~8 wallets) | 8 | 1 credit each, free tier. Same ~8 wallets as counterparties |
| entity-name search | 0 | Free endpoint |
| **Nansen total** | **~48** | 4.8% of monthly budget |

**Arkham (30-day trial):**

| Action | Credits | Notes |
|--------|---------|-------|
| batch intelligence (24 wallets) | ~24 | 1 credit per address in batch |
| entity search (MoonPay) | ~1 | Search endpoint |
| transfers (deep dives, ~5 wallets) | ~100-500 | 2 credits per row — use `limit: 50` to cap at 100 credits per wallet |
| **Arkham total** | **~125-525** | Monitor via `X-Intel-Datapoints-Remaining` header |

**Rate limiting built into all scripts:**
- Helius RPC: no delays (50 req/sec)
- Helius Wallet API: 100ms delays (10 req/sec)
- Nansen: 1.5-2s delays between calls
- Arkham standard: no delays needed (20 req/sec)
- Arkham transfers/counterparties: 1s delays (1 req/sec)

---

## Output

### Pass 1 deliverables:
- All 5 canonical data files normalized and consistent
- No bare string entries, no schema mismatches between launches
- Every wallet in network-map.json has `address`, `label`, `role`, `verdict`, `notes`

### Pass 2 deliverables:
- All 19 unknown recurring wallets triaged with verdicts in network-map.json
- All 3 possible associates investigated with verdicts
- 2 OG deployer counterparties labeled
- MoonPay wallet discovery documented (found or confirmed gap)
- cross-reference-report.json tags updated to reflect new verdicts
- All addresses read from files, never manually typed
- All labels cross-verified across 2+ APIs

### What this does NOT cover (deferred to later phases):
- Adding user's new intel (new addresses, post-L10 activity)
- Exhaustive re-verification of all 70+ known wallets
- Finalizing Vector B/C watchlists
- Building the monitor
- Unmapped on-ramps (Ramp Network, Transak, Simplex, Banxa, Robinhood Connect)
