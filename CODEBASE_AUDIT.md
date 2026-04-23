# Codebase Audit — 2026-04-22

Static forensic review of the deployer-tracker repo. No code was executed, no APIs were called.

---

## 1. Top-level inventory

```
.
├── CATALOG_AUDIT_PLAN.md      — Plan to audit all 147 wallets in network-map.json (pre-execution)
├── Claude.MD                  — Project instructions (CLAUDE.md alias, checked in)
├── CODEBASE_AUDIT.md          — This file
├── L10_FULL_INVESTIGATION.MD  — L10 post-mortem working doc (marked for deletion when L10 wraps)
├── MONITOR_BUILD_PLAN.md      — L11 monitor build plan and operational reference (~725 lines)
├── STRATEGY.md                — L11 detection strategy (three vectors)
├── package.json               — Single root package.json for audit + monitor
├── tsconfig.json              — Root TS config (src/ only; monitor has its own)
├── .env                       — API keys (gitignored)
├── .env.example               — Template for .env (permission-denied; not readable)
├── .gitignore                 — Ignores .env, node_modules, dist, monitor DB, backups
├── data/                      — Canonical wallet registry, launch history, investigation results
│   ├── network-map.json       — 147 wallets (1119 lines)
│   ├── launch-history.json    — 10-launch behavioral profile + L11 upcoming
│   ├── launch-details.json    — Per-launch deployer flows + early buyer lists (huge, 500+ lines per launch)
│   ├── rxrp-repump-buyers.json — 22 RXRP repump buyer wallets
│   └── results/               — Investigation output (10 JSON files)
├── src/
│   └── audit/                 — 12 active audit/investigation scripts
├── monitor/                   — L11 operational monitor daemon
│   ├── src/                   — 16 source files across 4 subdirs
│   ├── test/                  — 8 test files + 1 fixture
│   ├── data/                  — wallets.json (committed) + l11.db (gitignored)
│   ├── systemd/               — l11-monitor.service unit file
│   └── tsconfig.json          — Monitor-only compile config
├── archive/                   — Completed investigation scripts and raw API dumps
│   ├── scripts/               — 37 TypeScript files (10K LOC total)
│   └── raw-results/           — 28 JSON files (~280K lines)
├── backups/                   — Two SQLite DB snapshots (pre-ph3 and post-deploy, both 2026-04-19)
├── docs/                      — API reference docs
│   ├── nansen_docs.md         — Nansen API reference (~610 lines)
│   └── arkhan_docs.md         — Arkham API reference (~2716 lines)
└── .claude/                   — Claude Code settings (agents/ empty, settings.json)
```

**Flagged:** `backups/` is gitignored but contains 70KB SQLite files with WAL/SHM companions — these are local-only safety nets. The `docs/helius_docs.md` file referenced in CLAUDE.md does not exist; it's listed in `.gitignore` as `docs/telegram_bot_api_raw.md` (deleted). The file `docs/arkhan_docs.md` has a typo in the name (should be "arkham").

---

## 2. Language and stack breakdown

**Language:** TypeScript (ES Modules, strict mode). No Python, SQL files, or notebooks.

**Runtime:** Node.js via `tsx` (dev) and compiled `tsc` (prod). Target ES2022.

**Package manager:** npm (single `package.json`, lockfile is `package-lock.json`).

### Dependencies (`package.json`)

| Package | Version | Purpose |
|---|---|---|
| `better-sqlite3` | ^12.9.0 | Monitor SQLite (WAL mode) |
| `dotenv` | ^17.4.2 | .env loading |
| `grammy` | 1.42.0 | Telegram bot framework |
| `@grammyjs/auto-retry` | 2.0.2 | Telegram 429 retry |
| `@grammyjs/transformer-throttler` | 1.2.1 | Telegram rate limiting |
| `ws` | 8.20.0 | WebSocket client (Helius Enhanced WS) |

| Dev Package | Version |
|---|---|
| `@types/better-sqlite3` | ^7.6.13 |
| `@types/node` | ^25.6.0 |
| `@types/ws` | 8.18.1 |
| `tsx` | ^4.21.0 |
| `typescript` | ^6.0.3 |

**No duplicated dependencies.** No `helius-sdk` — all Helius calls are raw `fetch()` against RPC and Wallet API URLs. This is relevant because CLAUDE.md says "SDK of choice for Helius is `helius-sdk`" but the codebase doesn't use it at all.

**No test runner.** Tests are standalone `tsx` scripts with inline `check()` helpers that `process.exit(1)` on failure.

**Version conflicts:** None observed.

---

## 3. Data model

### 3.1 `data/network-map.json` (canonical wallet registry)

- **Path:** `data/network-map.json`
- **Record count:** 148 entries with `verdict` field (118 `network`, 28 `not_network`, 1 `possible_associate`, 1 `pending_verification`). 155 unique address strings extracted via regex (some entries have sub-objects with addresses like `token_accounts`, `funder`, `cashout`).
- **Schema:** Nested JSON object organized by category (`deployers`, `infrastructure`, `bundle_wallets`, `profit_routing`, `side_projects`, `insiders`, `onramp_hot_wallets`, `profit_cashout`, `network_connected`, `rxrp_repump_network`, `possible_associates`, `og_deployer_token_accounts`, `not_network`). Each wallet entry has:
  - `address` (string) — Solana base58
  - `label` (string) — human-readable name
  - `role` (string) — categorical role
  - `verdict` (string) — `network` / `not_network` / `possible_associate` / `pending_verification`
  - `notes` (string) — investigation findings, free-text
- **Last modified:** 2026-04-21 per metadata field.
- **Status:** Active, authoritative. This is the single source of truth for wallet classifications.

### 3.2 `monitor/data/wallets.json` (monitor watchlist)

- **Path:** `monitor/data/wallets.json`
- **Record count:** 23 unique addresses across 4 arrays (`onramps`: 2, `hubs`: 1, `intermediaries`: 20, `ignore`: 0).
- **Schema:** `{ onramps: [{address, label}], hubs: [{address, label}], intermediaries: [{address, label}], ignore: [] }`
- **Status:** Active. Loaded at monitor startup and synced to SQLite. Subset of network-map.json — all 23 addresses exist in network-map.json.

### 3.3 `monitor/data/l11.db` (SQLite, gitignored)

- **Path:** `monitor/data/l11.db` (runtime); `backups/l11-*.db` (snapshots)
- **Schema (from `db.ts:6-53`):**
  - `monitored_wallets`: address (PK), label, category, added_at, last_processed_signature, last_processed_slot
  - `candidates`: id (auto PK), address (UNIQUE), funded_amount_sol, funding_source, funding_source_label, funding_signature, funding_slot, funding_timestamp, confidence, status, detected_at, whitelisted_at, rejected_at, alert_sent_at, prior_sig_count
  - `ignore_list`: address (PK), reason, added_at
  - `events`: signature (PK), slot, timestamp, source_address, destination_address, amount_sol, processed_at
- **Indexes:** `idx_events_source`, `idx_events_dest`, `idx_candidates_status`
- **Migrations:** `alert_sent_at` and `prior_sig_count` added via runtime ALTER TABLE (idempotent, `db.ts:73-113`).
- **Status:** Active. WAL mode. 5 live candidates detected per MONITOR_BUILD_PLAN.md.

### 3.4 `data/launch-history.json`

- **Record count:** 10 launches (L1-L10) + 1 upcoming (L11) + behavioral profile.
- **Schema:** Per-launch: `token_name`, `ticker`, `ca`, `date`, `created_utc`, `funding_source`, `deployer`, `funded_by`, `funded_utc`, `sol_spent`, `notes`.
- **Status:** Active, current. L11 entry has `date: "2026-04-25"`.

### 3.5 `data/launch-details.json`

- **Approximate size:** 500+ lines per launch, total ~29K tokens.
- **Schema:** Per-launch: `token`, `deployer` (with `funded_by`, `funded_utc`), `inflows[]`, `outflows[]`, `early_buyers[]`. Flow entries: `{address, label, transfers, volume_usd}`. Early buyers: bare address arrays.
- **Status:** Active but dated (updated 2026-03-28). Missing L10 inflows/outflows (only has deployer + early_buyers).

### 3.6 `data/rxrp-repump-buyers.json`

- **Record count:** 29 buy orders, 22 unique wallets.
- **Schema:** `buy_sequence[{order, address, note}]`, `unique_wallets[{address, buy_orders, prior_status, prior_label, launch_history, cross_ref_tag}]`.
- **Status:** Complete (2026-04-03). Static reference data.

### 3.7 `data/results/` (10 files)

| File | Lines | Created | Purpose |
|---|---|---|---|
| `investigation-notes.json` | 54 | 2026-03-25 | 7 profit extraction routes |
| `cross-reference-report.json` | 1,866 | 2026-04-02 | Cross-launch recurring wallets (292 wallets, 56 recurring) |
| `batch-screen-results.json` | ~400 | 2026-04-02 | Batch screen of 24 wallets |
| `deep-dive-results.json` | ~300 | 2026-04-02 | Deep dive of 11 wallets |
| `moonpay-search-results.json` | 1,030 | 2026-04-03 | MoonPay entity discovery |
| `rxrp-repump-screen-results.json` | 689 | 2026-04-03 | RXRP repump 19-wallet screen |
| `xaic-asset-trace.json` | 256 | ~2026-04 | XAIC token asset trace |
| `arkham-parity-check-2026-04-21.json` | 399 | 2026-04-21 | Arkham label parity probe |
| `arkham-p1-moonpay-enum-2026-04-21.json` | 12,596 | 2026-04-21 | MoonPay entity enumeration |
| `arkham-p1-moonpay-wide-2026-04-21.json` | 219 | 2026-04-21 | MoonPay wide Solana enum |
| `arkham-p1-moonpay-deep-2026-04-21.json` | 74 | 2026-04-21 | MoonPay deep enum (null result) |

**No duplicate or conflicting data stores.** `network-map.json` is authoritative; `wallets.json` is a curated subset; `launch-history.json` and `launch-details.json` complement each other without overlap.

---

## 4. Wallet catalogue specifically

### Where they live

All wallet data flows into one canonical registry: `data/network-map.json`.

### Distinct wallet count

- **155 unique base58 address strings** extracted from `data/network-map.json` (includes sub-addresses in `token_accounts`, `funder`, `cashout` fields).
- **148 entries with a `verdict` field** (the addressable wallet objects).
- **23 addresses** in `monitor/data/wallets.json` (all are a subset of network-map.json — zero wallets in wallets.json that aren't in network-map.json).

### Metadata per wallet

Every wallet entry in network-map.json has: `address`, `label`, `role`, `verdict`, `notes`. Some have additional structured fields:

- `token_accounts` (MoonPay wallets: MP1, MP2, MP4, MP5_candidate)
- `funder` + `cashout` sub-objects (BqP79Wmk)
- `volume` (CoinSpot insider: per-launch USD)
- `funding_pipeline` (BqP79Wmk: text description)
- `exchange` (CoinSpot insider: exchange name)

### Structure reliability

The schema is **consistent across all 148 wallet entries**: every one has `address`, `label`, `role`, `verdict`, `notes`. The nesting structure varies by category (deployers are keyed by launch ID, infrastructure by function name, etc.) but the leaf schema is uniform.

The `notes` field does heavy lifting — it contains investigation findings, dates, dollar amounts, counterparty lists, and status updates as free text. There is no `last_verified` timestamp field (CATALOG_AUDIT_PLAN.md proposes adding one but hasn't yet).

### Cross-file conflicts

- **Wallet count discrepancy across docs:** CLAUDE.md says "147 catalogued wallets: 118 network, 28 not_network, 1 possible_associate". Actual count from the JSON: 148 entries with verdicts (118 + 28 + 1 + 1 `pending_verification`). STRATEGY.md says "~94 catalogued wallets". CATALOG_AUDIT_PLAN.md says "144 entries". All three are stale — the actual current count is 148.
- **No address conflicts between files.** Every address in `wallets.json` exists in `network-map.json`. Every address in `rxrp-repump-buyers.json` exists in `network-map.json`.

---

## 5. API integration surface

### 5.1 Helius

- **Credentials:** `HELIUS_API_KEY` from `.env`, read in `src/audit/utils.ts:8` and `monitor/src/config.ts:55`.
- **Files that make calls:**
  - `src/audit/utils.ts` — `heliusRpc()`, `heliusWallet()`, `heliusBatchIdentity()`
  - `src/audit/batch-screen.ts` — getBalance, batch-identity, funded-by
  - `src/audit/deep-dive.ts` — (via nansen/arkham only, no direct Helius)
  - `src/audit/moonpay-search.ts` — batch-identity
  - `src/audit/rxrp-repump-screen.ts` — getBalance, batch-identity, funded-by
  - `src/audit/verify-l10-moonpay.ts` — getTransaction, getSignaturesForAddress, getBalance
  - `src/audit/verify-control-moonpay.ts` — getTransaction, getSignaturesForAddress
  - `src/audit/fingerprint-candidates.ts` — getTransaction (via l11.db)
  - `src/audit/fingerprint-other-onramps.ts` — getSignaturesForAddress, getTransaction
  - `src/audit/price-probe.ts` — (no Helius, uses CoinGecko/Birdeye)
  - `monitor/src/helius/rpc.ts` — `rpcCall()`, `getSignaturesForAddress()`, `getTransaction()`
  - `monitor/src/helius/ws.ts` — Enhanced WebSocket `transactionSubscribe`
  - `monitor/src/selfcheck.ts` — getBalance (via rpcCall)
- **Endpoints called:** `getBalance`, `getSignaturesForAddress`, `getTransaction`, Enhanced WebSocket `transactionSubscribe`, Wallet API `funded-by`, Wallet API `batch-identity`.
- **Status:** Current and working. Monitor uses raw RPC; audit scripts use raw RPC + Wallet API.
- **SDK compliance:** The codebase does NOT use `helius-sdk`. All calls are raw `fetch()` to `https://mainnet.helius-rpc.com/` and `https://api.helius.xyz/v1/`. This works but contradicts the stated SDK preference.

### 5.2 Arkham

- **Credentials:** `ARKAN_API_KEY` from `.env`, read in `src/audit/utils.ts:10`.
- **Files that make calls:**
  - `src/audit/utils.ts` — `arkham()`, `arkhamMeta()`, `arkhamBatchIntel()`, `arkhamEnrichedBatch()`
  - `src/audit/batch-screen.ts` — batch intel
  - `src/audit/moonpay-search.ts` — entity search, entity lookup
  - `src/audit/rxrp-repump-screen.ts` — batch intel
  - `src/audit/verify-l10-moonpay.ts` — batch intel
  - `src/audit/probe-counterparties-address.ts` — `/counterparties/address`
  - `src/audit/probe-intel-usage.ts` — `/subscription/intel-usage`
- **Endpoints called:** `/intelligence/address/batch/all`, `/intelligence/address_enriched/batch/all`, `/intelligence/search`, `/intelligence/entity/moonpay`, `/transfers`, `/counterparties/address/{addr}`, `/subscription/intel-usage`.
- **Status:** Current. Trial extended 2026-04-21 with unlimited credits but 10,000 datapoints cap per period. Rate limiting with exponential backoff + jitter is implemented (`utils.ts:151-198`).

### 5.3 Nansen

- **Credentials:** `NANSEN_API_KEY` from `.env`, read in `src/audit/utils.ts:9`.
- **Files that make calls:**
  - `src/audit/utils.ts` — `nansen()`
  - `src/audit/deep-dive.ts` — `/profiler/address/counterparties`
  - `src/audit/moonpay-search.ts` — `/search/entity-name`
- **Endpoints called:** `/profiler/address/counterparties`, `/search/entity-name`.
- **Status:** Current but lightly used. 2-second delay between calls. 422 (too-much-activity) handled gracefully. Single 429 retry. Labels endpoint (500 credits) is correctly avoided per project rules.

### 5.4 CoinGecko (undocumented)

- **Credentials:** None (public API).
- **Files:** `src/audit/verify-control-moonpay.ts:69-78`, `src/audit/price-probe.ts:6-22`.
- **Endpoints:** `/coins/solana/market_chart/range`, `/coins/solana/history`.
- **Status:** Public tier, rate-limited. Used only for SOL price lookups. Not documented in CLAUDE.md.

### 5.5 Birdeye (undocumented)

- **Credentials:** None (public endpoint probe).
- **Files:** `src/audit/price-probe.ts:43-51`.
- **Status:** Speculative — the probe checks if the public endpoint responds. Not a real integration.

### Committed credentials

**None found.** `.env` is in `.gitignore`. API keys are loaded from environment variables only.

---

## 6. Entry points and executable surface

### Monitor daemon

| Command | What it does |
|---|---|
| `npm run monitor:dev` | `tsx monitor/src/index.ts` — runs monitor in dev mode |
| `npm run monitor:build` | `tsc -p monitor` — compiles to `monitor/dist/` |
| `npm run monitor:start` | `node monitor/dist/index.js` — runs compiled monitor |

The monitor is the only orchestrated runtime. It connects to Helius Enhanced WebSocket, subscribes to 23 monitored wallets, detects funding events matching the deployer's pattern (8-25 SOL to a fresh address), persists candidates to SQLite, and pushes Telegram alerts with whitelist/reject inline buttons.

### Audit scripts (run individually)

| Script | Command | Purpose |
|---|---|---|
| `src/audit/batch-screen.ts` | `npx tsx src/audit/batch-screen.ts` | Screen 24 wallets |
| `src/audit/deep-dive.ts` | `npx tsx src/audit/deep-dive.ts` | Deep dive flagged wallets |
| `src/audit/moonpay-search.ts` | `npx tsx src/audit/moonpay-search.ts` | MoonPay wallet discovery |
| `src/audit/rxrp-repump-screen.ts` | `npx tsx src/audit/rxrp-repump-screen.ts` | RXRP repump screening |
| `src/audit/verify-l10-moonpay.ts` | `npx tsx src/audit/verify-l10-moonpay.ts` | L10 MoonPay forensic verification |
| `src/audit/verify-control-moonpay.ts` | `npx tsx src/audit/verify-control-moonpay.ts [addr...]` | Control purchase analysis |
| `src/audit/fingerprint-candidates.ts` | `npx tsx src/audit/fingerprint-candidates.ts` | MoonPay fingerprint on live candidates |
| `src/audit/fingerprint-other-onramps.ts` | `npx tsx src/audit/fingerprint-other-onramps.ts` | Fingerprint false-positive stress test |
| `src/audit/price-probe.ts` | `npx tsx src/audit/price-probe.ts` | SOL price source probe |
| `src/audit/probe-counterparties-address.ts` | `npx tsx src/audit/probe-counterparties-address.ts` | Arkham counterparties endpoint test |
| `src/audit/probe-intel-usage.ts` | `npx tsx src/audit/probe-intel-usage.ts` | Arkham datapoints budget check |

### Monitor tests (run individually)

| Test | Command |
|---|---|
| `monitor/test/replay-l10.ts` | `npx tsx monitor/test/replay-l10.ts` |
| `monitor/test/replay-l10-dedup.ts` | `npx tsx monitor/test/replay-l10-dedup.ts` |
| `monitor/test/selfcheck-synthetic.ts` | `npx tsx monitor/test/selfcheck-synthetic.ts` |
| `monitor/test/candidate-actions.ts` | `npx tsx monitor/test/candidate-actions.ts` |
| `monitor/test/health.ts` | `npx tsx monitor/test/health.ts` |
| `monitor/test/commands.ts` | `npx tsx monitor/test/commands.ts` |
| `monitor/test/smoke-alert.ts` | `npx tsx monitor/test/smoke-alert.ts` (interactive, needs real .env) |

### What's missing

- `package.json` has `"start": "tsx src/index.ts"` but **`src/index.ts` does not exist**. The `src/` directory only contains `src/audit/`. This `start` script is broken.
- No `npm test` script. Tests must be run individually.
- No orchestrator script that runs all tests in sequence.

---

## 7. Dead code, broken code, abandoned experiments

### Broken entry point

- `package.json:6` — `"start": "tsx src/index.ts"` references a file that does not exist. `src/` contains only `src/audit/`.

### Missing import extensions

Four audit scripts import from `'./utils'` without the `.js` extension:
- `src/audit/verify-control-moonpay.ts:7`
- `src/audit/fingerprint-other-onramps.ts:6`
- `src/audit/fingerprint-candidates.ts:8`
- `src/audit/verify-l10-moonpay.ts:2`

These work under `tsx` (which resolves extensionless imports) but would fail under `tsc` compilation with `moduleResolution: "bundler"`. Not blocking for `tsx` usage but inconsistent with the rest of the codebase which uses `.js` extensions.

### Missing documentation file

- CLAUDE.md references `docs/helius_docs.md` as the Helius API reference. This file does not exist in the repo. It appears to have been deleted (`.gitignore` has `docs/telegram_bot_api_raw.md` listed, suggesting doc cleanup happened).

### Stale batch-screen target list

- `src/audit/batch-screen.ts:59` — hardcodes `associateKeys = ['7QJM8rXX', 'F7RV6aBW', 'D1XcKeSS']` as possible_associates. In the current `network-map.json`, `F7RV6aBW` has been moved to `not_network` (downgraded 2026-04-02) and `D1XcKeSS` has been moved to `network_connected` (upgraded 2026-04-02). Only `7QJM8rXX` is still in `possible_associates`. Running this script would crash trying to read `possible_associates.F7RV6aBW` which no longer exists at that path.

### Stale deep-dive target list

- `src/audit/deep-dive.ts:104` — same hardcoded `['7QJM8rXX', 'F7RV6aBW', 'D1XcKeSS']`. Same problem.

### Duplicated `collectNetworkAddresses()` function

This identical function appears in three files:
- `src/audit/batch-screen.ts:85-113`
- `src/audit/deep-dive.ts:65-93`
- `src/audit/rxrp-repump-screen.ts:59-87`

Not a bug, but notable duplication. The function recursively walks `network-map.json` to collect all addresses.

### Duplicated `b58decode()` function

Hand-rolled base58 decoder duplicated across three files:
- `src/audit/fingerprint-candidates.ts:27-45`
- `src/audit/fingerprint-other-onramps.ts:38-56`
- `src/audit/verify-control-moonpay.ts:35-53`

### Duplicated test harness `check()` helper

An inline `check(name, cond, detail?)` test assertion function is duplicated across all 6 monitor test files.

### Archive directory

37 scripts and 28 result files in `archive/`. **Zero cross-references from live code** (verified via grep). Fully cold — safe to ignore or relocate. All archive scripts import from a `./utils` that was presumably copied alongside them but is now at `src/audit/utils.ts`.

### No commented-out blocks over 20 lines found

No significant commented-out code blocks in any active source file.

---

## 8. Detection-vector mapping

### Vector A — MoonPay Sieve

**Goal:** Monitor MP1 + MP2 hot wallets for 8-15 SOL outflows to fresh addresses.

**Implementation status:** Partially built.

| Component | State | Location |
|---|---|---|
| MP1 + MP2 in monitor watchlist | Done | `monitor/data/wallets.json:2-5` (onramps array) |
| SOL transfer detection (8-25 SOL band) | Done | `monitor/src/detection/candidate.ts:6-8` (MIN/MAX lamports) |
| Freshness check (≤1 prior sig) | Done | `monitor/src/detection/fresh.ts:17-29` |
| Confidence tiering (HIGH for clean on-ramp + 12-18 SOL + 1 prior sig) | Done | `monitor/src/detection/candidate.ts:111-136` |
| Candidate persistence + dedup | Done | `monitor/src/db.ts:184-235` |
| Telegram alert with whitelist/reject | Done | `monitor/src/telegram/push.ts:24-51` |
| MoonPay fingerprint validation (CU=14548 + memo) | Done offline | `src/audit/fingerprint-candidates.ts`, `src/audit/fingerprint-other-onramps.ts` |
| MoonPay fingerprint wired into runtime | **NOT DONE** | Explicitly excluded per STRATEGY.md — used for confirmation only |
| MP3 confirmed non-existent | Done | `data/network-map.json:501-508` notes + `arkham-p1-moonpay-deep-2026-04-21.json` |
| MP5 candidate review | **NOT DONE** | `pending_verification` in network-map.json |

**What's missing:** The MoonPay fingerprint is not checked at runtime. It could reduce false positives but is only used post-hoc. MP5 candidate awaits verification but is treasury-class (not customer-facing) so shouldn't affect L11 detection.

### Vector B — Network Intermediary Watch

**Goal:** Monitor known hub/prior-deployer/side-project wallets for 8-25 SOL outflows to fresh addresses.

**Implementation status:** Partially built.

| Component | State | Location |
|---|---|---|
| 20 intermediaries in monitor watchlist | Done | `monitor/data/wallets.json:9-31` |
| 1 hub wallet in monitor watchlist | Done | `monitor/data/wallets.json:6-8` |
| Same detection pipeline (8-25 SOL + freshness) | Done | Shares Vector A pipeline |
| Confidence tiering (LOW for non-onramp) | Done | `monitor/src/detection/candidate.ts:127` |
| Full intermediary watchlist finalized | **NOT DONE** | STRATEGY.md says "still needs to be finalized" |

**What's missing:** STRATEGY.md identifies ~11 wallets with significant SOL balances as priority intermediaries. The actual `wallets.json` has 20 intermediaries, but it's unclear if the list is complete per the strategy. The confidence tier for intermediary-funded candidates is LOW, which means they won't get the urgency of an on-ramp detection.

### Vector C — Copy-Trade Backup

**Goal:** Monitor insider buyer wallets for block-zero buys on new tokens.

**Implementation status:** Not built.

| Component | State |
|---|---|
| Wallet selection | TBD per STRATEGY.md |
| Token creation detection | Not built |
| Copy-trade logic | Not built |
| Integration with Bloom bot | Not built |

**What's missing:** Everything. This vector is explicitly excluded from v1 monitor per MONITOR_BUILD_PLAN.md. BqP79Wmk and GoonPump (231fshU8) are identified as the strongest candidates but nothing is wired.

---

## 9. Critical findings

Ordered by severity (highest first).

### CRITICAL

1. **PH3-PH6 hardening not deployed to VPS.** `MONITOR_BUILD_PLAN.md` states PH1a/PH1b/PH2/PH3/PH4/PH5/PH6 are "implemented locally 2026-04-19, pending VPS deploy." The production monitor at `143.198.12.56` is running an older build without: crash-recovery alert replay (PH3), staleness alarms (PH4), heartbeat (PH5), or undo commands (PH6). If the monitor crashes before Saturday, candidate alerts may be silently lost.

2. **Detection band width.** The monitor accepts 8-25 SOL (`candidate.ts:6-8`). The deployer's L4-L10 range is 8.09-14.81 SOL. The HIGH confidence tier is 12-18 SOL (`candidate.ts:7-8`). If the deployer adjusts spend for L11 (new token, different market), anything outside 12-18 SOL from an on-ramp will tier as MEDIUM, not HIGH. The 25 SOL ceiling is generous; the 8 SOL floor is tight (L4 was 8.098 SOL — only 98M lamports of headroom).

### HIGH

3. **`package.json` start script is broken.** `"start": "tsx src/index.ts"` — the file `src/index.ts` does not exist. This is benign (nobody runs `npm start`) but confusing.

4. **`batch-screen.ts` and `deep-dive.ts` will crash if run.** Both hardcode `possible_associates.F7RV6aBW` and `possible_associates.D1XcKeSS` which have been moved to other sections of `network-map.json`. These scripts served their purpose and shouldn't need to run again, but they're in `src/audit/` (active code), not `archive/`.

5. **Docs reference a deleted file.** CLAUDE.md line 65 references `docs/helius_docs.md` but this file does not exist. Any session that tries to read it will fail.

### MEDIUM

6. **Four audit scripts use extensionless imports.** `fingerprint-candidates.ts`, `fingerprint-other-onramps.ts`, `verify-control-moonpay.ts`, `verify-l10-moonpay.ts` import from `'./utils'` without `.js`. Works under `tsx`, fails under compiled ESM.

7. **Wallet count disagreement across docs.** CLAUDE.md says 147, CATALOG_AUDIT_PLAN.md says 144, STRATEGY.md says ~94. Actual count is 148 (with verdicts). Documentation should converge on the real number.

8. **No `npm test` script.** Tests exist but there's no single command to run them all. Risk: tests drift and nobody notices because they're not in any CI or pre-deploy workflow.

9. **CATALOG_AUDIT_PLAN.md references nonexistent `docs/arkhan-api.txt`.** The actual file is `docs/arkhan_docs.md`.

### LOW

10. **`backups/` is gitignored.** DB snapshots exist locally but aren't versioned. If the local machine dies, these are gone.

11. **L10_FULL_INVESTIGATION.MD has duplicate wallet lists.** Lines 51-72 contain two overlapping lists with inconsistent status markers — likely leftover from a triage method switch.

### Surprises

- **No `helius-sdk` anywhere.** Despite CLAUDE.md stating "SDK of choice for Helius is `helius-sdk`", the entire codebase uses raw `fetch()`. This is fine — the raw approach gives more control — but the doc claim is misleading.

- **The monitor has no transaction-signing capability.** This is explicitly correct per project rules (`CLAUDE.md:112`), but worth noting: nothing in this codebase can move funds or interact with any on-chain program. It is purely read-only.

- **`fingerprint-candidates.ts` reads from the live `monitor/data/l11.db`.** This audit script opens the SQLite database in readonly mode (`line 102`) to read candidate rows, then calls Helius RPC to fetch their funding transactions. This means it has a runtime dependency on the monitor database existing.

---

## 10. What's good

1. **`data/network-map.json` is excellent.** 148 wallets with consistent schema, detailed notes, clear verdicts, and a logical category hierarchy. This is the most valuable artifact in the repo. The notes field captures investigation provenance (dates, sources, corrections, reclassifications).

2. **The monitor (`monitor/src/`) is production-quality code.** Clean module boundaries, proper error handling, graceful shutdown, WAL-mode SQLite with transactions, exponential backoff on RPC calls, in-memory dedup with DB-level UNIQUE fallback, Telegram throttling + auto-retry, staleness monitoring, health HTTP endpoint, heartbeat, crash-recovery replay. 16 source files, well-separated concerns, no circular dependencies.

3. **The test suite is thoughtful despite the lack of a runner.** 8 tests covering: detection acceptance from a pinned fixture, DB dedup across restarts, synthetic selfcheck, candidate lifecycle (whitelist/reject/undo), staleness state machine, health server HTTP, Telegram formatting truncation. The tests actually catch real bugs (e.g., the dedup test verifies that a fresh `alreadyCandidates` set rebuilt from DB after restart still blocks re-detection).

4. **`src/audit/utils.ts` is a solid API wrapper.** Rate limiting, retry with exponential backoff + jitter, Arkham datapoints header tracking, 404 → null handling on Helius Wallet API. 271 lines covering three APIs with appropriate delays for each tier.

5. **The detection pipeline (`candidate.ts` + `fresh.ts`) is well-designed.** Recursive payload walker handles both RPC and WS message formats without hardcoded nesting. In-flight dedup prevents concurrent freshness RPCs for the same recipient. Tiering logic cleanly separates on-ramp (HIGH/MEDIUM) from intermediary (LOW).

6. **Investigation data model is clean.** `launch-history.json` for behavioral profile, `launch-details.json` for per-launch flows, `network-map.json` for wallet registry, `rxrp-repump-buyers.json` for event-specific data. No redundancy, clear separation.

7. **The archive is properly isolated.** 37 completed scripts and 28 raw result files moved to `archive/` with zero remaining cross-references from live code. Clean separation of historical investigation from operational tooling.

---

## 11. Open questions

1. **Is the VPS deploy of PH3-PH6 scheduled before Saturday?** The monitor is running an older build. If it crashes, candidate alerts won't replay on restart (PH3), staleness won't alarm (PH4), there's no heartbeat to confirm it's alive (PH5), and you can't undo a misclick (PH6).

2. **Is the `wallets.json` intermediary list finalized?** STRATEGY.md says the watchlist "still needs to be finalized." The current list has 20 intermediaries + 1 hub + 2 onramps = 23 wallets. Are there wallets from network-map.json (e.g., Eggsheeran, GgFVQNY5, cold_usdc_2, jetnut_network — all flagged as L11 watchlist candidates in notes) that should be added?

3. **Should `batch-screen.ts` and `deep-dive.ts` be moved to `archive/`?** They reference network-map sections that no longer exist and will crash if run. They've served their purpose.

4. **What happened to `docs/helius_docs.md`?** It's referenced in CLAUDE.md but doesn't exist. Was it intentionally removed? Should the CLAUDE.md reference be updated?

5. **Is the Helius Wallet API (`/v1/wallet/`) still on your plan?** `utils.ts` has `heliusWallet()` and `heliusBatchIdentity()` wrappers, but the monitor uses raw RPC only. The audit scripts use the Wallet API for `funded-by` lookups — is this endpoint on the Helius Developer plan?

6. **Does the MoonPay fingerprint need to be wired into the runtime monitor before Saturday?** Currently it's offline-only. The benefit would be automated confirmation that a MEDIUM/HIGH candidate was genuinely funded by MoonPay (vs a false positive from another exchange sending 8-25 SOL). The risk is false negatives if MoonPay changes their infrastructure.

7. **What's the status of the 5 live detected candidates in the DB?** MONITOR_BUILD_PLAN.md mentions them. Are they stale test detections that should be rejected, or real candidates that need attention?

8. **Is there a plan for the `pending_verification` MP5 candidate wallet (`EGnQqe6MPvvNYWLPHtk9mKpbtEQkv4nA7nTeENtViM4z`)?** It's treasury-class so probably doesn't affect L11 detection, but the review is noted as pending.

9. **The root `tsconfig.json` compiles `src/**/*` to `dist/` but there's no `src/index.ts`.** Is this config vestigial (from before the audit scripts were the only thing in `src/`), or is there a planned use for it?

10. **Is the `CATALOG_AUDIT_PLAN.md` audit going to happen before Saturday?** It proposes auditing all 148 wallets before L11 but has no execution progress recorded. The deadline listed is Fri 2026-04-24 (tomorrow).
