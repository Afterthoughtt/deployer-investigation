# Session Handoff - 2026-03-24T12:00:00Z

## Goal
Track a serial pump.fun deployer on Solana to identify their next fresh wallet (L11) before `create_and_buy` fires, enabling a block-0 snipe via Bloom bot whitelist.

## Current Status
- **Phase**: auditing / cleaning up (pre-profit-routing-investigation)
- **Progress**: Deployers verified, infrastructure verified, bundle wallets verified, audit & cleanup complete. Profit routing wallets NOT yet profiled. Unresolved recurring wallets NOT yet investigated. MoonPay cluster NOT yet mapped. L10 early buyers NOT yet pulled. Live sieve NOT yet built.
- **Blocked**: No — all three APIs (Helius, Nansen, Arkham) are working. Project now backed up to GitHub.

## What Was Done This Session

### Directory Reorganization
- Created `data/results/raw/` subdirectory
- Moved 6 raw API dump files there: `address-audit.json`, `bundle-profiles.json`, `bundle-unknowns-deep.json`, `counterparty-verification.json`, `infra-verify.json`, `infra-unknowns.json`
- Deleted `data/results/helius-resolve.json` (redundant with audit)
- Top level `data/results/` now has only curated files: `investigation-notes.json` + `cross-reference-report.json`

### Updated investigation-notes.json (was stale)
- Added Route C ($49K via 9exPdTUV) and Route D ($15.7K via BR1HiYtc → Coinbase)
- Total profit extracted revised from $78K to $143K+
- Added bundle wallet verification summary (Bundle 6 anomaly)
- Added 4 investigated counterparties (9exPdTUV, BR1HiYtc, 4916Nkdu, D1XcKeSS)
- 9cDDJ5g2 reclassified to confirmed network profit aggregator
- Phantom fee wallet downgraded, DLGHPXKF flagged as transcription error
- Added address audit summary, CoinSpot insider token link
- Consolidated remaining tasks list

### Comprehensive 3-Agent Audit
- Spawned 3 parallel audit agents to cross-check ALL raw API data against curated notes
- Agent 1: Infrastructure + deployers — found hub first funder & CB1 transcription errors, missing Nansen labels
- Agent 2: Bundle wallets + unknowns — found 6 unmapped Coinbase wallets, Bundle 3 vs 4 discrepancy for 4916Nkdu, pagination gaps
- Agent 3: Network-connected + profit cashout — found 2q8nSJgC funder transcription error, Ed4UGBWK Rollbit deposits unverifiable, F7RV6aBW funded by Binance

### 8 Transcription Errors Corrected
- Created `src/verify-suspect-addresses.ts` — live API re-verification script
- **Hub first funder**: was `9Z83ZAtd...PE5C4qE3YGLN7TgrKPaqgEhYJw56` → correct `9Z83ZAtd...KkjBZtAPTgeJZ1GzK7b1Uf1E3DsF` (Helius + Nansen confirmed)
- **CB1**: was `5g7yNHyG...WoTWqJhC2QqQeHQGqPf3Mfir` → correct `5g7yNHyG...47opDnMjc585kqXWt6d7aBWs` (Helius: "Coinbase Hot Wallet 9")
- **CB2**: was `2AQdpR2y...` → correct `2AQdpHJ2...` (user confirmed from independent records)
- **CB5**: was `4NyK1M6R...` → correct `4NyK1AdJ...` (user confirmed)
- **CB7**: was `D89hHvER...` → correct `D89hHJT5...` (user confirmed)
- **CB8**: was `FpwQQM4A...` → correct `FpwQQhQQ...` (user confirmed)
- **2q8nSJgC first funder**: was `DZFW9vYw...` → correct `56pfQ9C38WKqUTrVzkZTS4q8oMzaN8Cdh1u7JScC7fGo` (Helius + Nansen confirmed)
- **4916Nkdu token source**: was "Bundle 1 + Bundle 3" → correct "Bundle 1 only (2x 12.5M)" (Helius transfers confirmed)

### Other Corrections
- Added missing Nansen labels: L5 = "RizzmasCTO Token Deployer", L9 = "CUPID Token Deployer", Hub = "JRVSLK Token Deployer"
- Flagged Ed4UGBWK Rollbit deposits (RB5KKB7h, RB2Yz3VS) as UNVERIFIED — no raw API data backs them
- Fixed 9exPdTUV "ALL forwarded" to note $273 E7VEsTzG outflow
- Moved F7RV6aBW from `network_connected` to `monitoring` (Binance funding mismatch, user decision)
- Added F7RV6aBW Arkham label "F7RV6a" on Pump.fun
- Added 6UrYwo9F first funder = Large Funding Source (HVRcXaCF / Fireblocks)
- Added CB10 (`AafGzY9eiC5Ud3YFZQwkaKApp48cVBAT2kksGvEjhUvH`) — newly discovered Coinbase wallet
- Coinbase watchlist now has 10 correct wallets (was 9 with 5 wrong)

### Git & GitHub Setup
- Initialized git repo, configured for afterthoughtt GitHub account
- Created public repo: https://github.com/Afterthoughtt/deployer-investigation
- Initial commit with 35 files pushed to main

### File Updates
- Updated `CLAUDE.md` — directory structure, code conventions (raw/ path), strengthened address transcription rule
- Updated `MEMORY.md` — all corrections, new rules, corrected Coinbase count

## What Was Tried and Failed (CRITICAL)

- **tsx -e with top-level await**: Must write to .ts file and run with `npx tsx src/file.ts`. (Prior session failure, still applies.)

- **Phantom fee wallet as network signal**: Protocol fee address, not a network fingerprint. (Prior session failure, still applies.)

- **Connection count alone for network confirmation**: D1XcKeSS (16 connections, Kraken) and F7RV6aBW (profit relay, Binance) both have mismatched funding sources. High connection count doesn't mean deployer-controlled. (Prior session + this session.)

- **Assuming zero-balance addresses are "retired wallets"**: Prior session dismissed CB1/2/5/7/8 zero balances as "rotated hot wallets." All 5 were actually transcription errors. **Rule: zero from all APIs = suspect transcription error FIRST, not retired wallet.**

- **Arkham transfers endpoint for Ed4UGBWK Rollbit deposits**: Queried 100 transfers, 0 Rollbit-related. The Rollbit deposit addresses RB5KKB7h/RB2Yz3VS remain unverifiable — they may be from a time window not covered by the 100 most recent transfers, or may be transcription errors themselves.

- **Nansen tgm/dex-trades with trader_address filter**: Silently returns empty. Must pull ALL trades and filter client-side. (Prior session failure, still applies.)

- **Arkham counterparties on Solana**: Returns empty for most wallets. Use Nansen counterparties instead. (Prior session failure, still applies.)

## Key Decisions

- **F7RV6aBW moved to monitoring**: User explicitly decided. Despite confirmed profit relay chain (F7RV6aBW → DcbyADbN → L9 deployer), the Binance 8 funding source doesn't match deployer's Coinbase/MoonPay pattern. Same treatment as D1XcKeSS. Will explore further later.

- **CB2/5/7/8 confirmed as transcription errors (not retired wallets)**: User provided correct addresses from independent records. The "retired hot wallet" assumption from prior session was wrong for all 5 zero-balance Coinbase addresses.

- **Ed4UGBWK Rollbit deposits flagged as UNVERIFIED**: No raw API data backs the RB5KKB7h/RB2Yz3VS claims. Rather than trust unsourced addresses, they're flagged. Don't rely on them without re-sourcing.

- **data/results/raw/ created for organizational clarity**: Raw API dumps go in `raw/`, curated findings stay at `data/results/` top level. CLAUDE.md updated to reflect this.

- **Public GitHub repo**: User chose public. No sensitive data in raw files — all on-chain data. `.env` (API keys) is gitignored.

## Modified Files

- `data/results/investigation-notes.json` — Major update: added all prior session findings + corrected 8 transcription errors + fixed labels + consolidated tasks
- `data/network-map.json` — Corrected 5 Coinbase addresses, hub first funder, 4916Nkdu bundle source, Ed4UGBWK Rollbit note, 9exPdTUV outflows, F7RV6aBW moved to monitoring, 6UrYwo9F first funder, added CB10
- `CLAUDE.md` — Updated directory structure (raw/ subdirectory), code conventions (save to raw/), strengthened address transcription rule
- `.gitignore` — Removed `data/results/` exclusion (user wants raw data backed up too)
- `src/verify-suspect-addresses.ts` — Created. Live API re-verification of 5 suspect addresses (Helius funded-by, Nansen related-wallets, Arkham transfers, Helius transfers)
- `data/results/raw/suspect-address-verification.json` — Created. Raw API results from verification script
- `session_handoff.md` — This file (replaced prior version)
- `MEMORY.md` — Updated with all corrections, new rules, corrected Coinbase count

## Next Steps (ordered)

1. **Profile profit routing wallets** — 8 wallets in `profit_routing` section of network-map.json need Nansen counterparties + Arkham transfers: profit_pass_1 (`4yWaU1Qr`), profit_pass_2 (`HDTncsSn`), cold_usdc_1 (`8CvuX95R`), cold_usdc_2 (`EAcUbdoi`), coinbase_deposit (`J6YUyB4P`), binance_deposit (`21wG4F3Z`), rollbit_deposit (`RB3dQF6T`), routes_binance (`DcEYX34v`). Skip coinbase_deposit_2 and fireblocks_passthrough (already profiled). Use `src/investigate-bundle-unknowns.ts` as template. Save raw to `data/results/raw/`, distill to `investigation-notes.json`.

2. **Investigate unresolved recurring wallets** — CJVEFd (position #1 at L6, 4 launches), 9J9VHo (5 launches), chrisV (L8-L9 position #3). Profile via all three APIs. These are from `unresolved_recurring_wallets` in investigation-notes.json.

3. **Investigate E2NnJHhc** — Confirmed in OG deployer counterparties ($2K, 70 txs). Still needs full profiling. Listed in `unknown_high_volume` in network-map.json.

4. **Map MoonPay hot wallet cluster** — Use Helius batch-identity and Nansen to find related MoonPay wallets beyond the 1 known (MP1). Deployer switched to MoonPay for L10 and may use other MoonPay wallets for L11.

5. **Get L10 early buyers list** — Use Nansen tgm/dex-trades for the XAIC token to pull ALL early buyers (cannot filter by trader_address — must pull all trades and filter client-side). Add to launch-details.json for cross-reference with prior launches.

6. **Build the live monitoring sieve** — Watch all known network wallets + on-ramp hot wallets for 8-25 SOL outflows to fresh addresses. This is the final deliverable for L11 detection.

## Context the Next Session Needs

- **GitHub repo**: https://github.com/Afterthoughtt/deployer-investigation — `gh` CLI installed but not available in current terminal session. Will work in next session.
- **API env var names**: `NANSEN_API_KEY`, `ARKAN_API_KEY` (note: ARKAN not ARKHAM), `HELIUS_API_KEY` — all in `.env`
- **Helius working**: RPC at `https://mainnet.helius-rpc.com/?api-key=KEY`, Wallet API at `https://api.helius.xyz/v1/wallet/...?api-key=KEY`. Developer plan, 10M credits/month.
- **Credit usage this session**: ~700 Helius credits (5 funded-by + 1 transfers = 600 Wallet API + sigs), ~10 Nansen credits (5 related-wallets), Arkham free (1 transfers query).
- **Nansen rate limits**: 1.5-2s delays between calls. Max 3-4 day date ranges on `/profiler/address/transactions`. Labels = 500 credits — use sparingly.
- **Arkham Solana gaps**: Counterparties endpoint returns empty for most Solana wallets. Intelligence/labels/transfers work.
- **Coinbase wallet naming**: Helius calls CB1 "Coinbase Hot Wallet 9" — project numbering (CB1-CB10) is internal, not aligned with Helius numbering. Don't confuse them.
- **Coinbase wallet families**: Coinbase uses wallets with similar prefixes (e.g., CB1 `5g7yNHyG` and CB10 `AafGzY9e` are unrelated, but old-wrong-CB2 `2AQdpR2y` and correct-CB2 `2AQdpHJ2` share prefix `2AQdp`). NEVER assume prefix match = same wallet.
- **Scripts in `src/`**: `verify-suspect-addresses.ts` is the cleanest small template. `investigate-bundle-unknowns.ts` is the best full investigation template (3-API deep + Layer 2/3 funder tracing).
- **Bundle 6 is anomalous**: Funded by Axiom (not Coinbase), fewer connections, different token mix. Keep in mind during future analysis.
- **F7RV6aBW in monitoring**: User explicitly chose not to confirm despite profit relay connection. Binance funding doesn't match. Will revisit later.
- **Ed4UGBWK Rollbit deposits UNVERIFIED**: RB5KKB7h and RB2Yz3VS have no raw data backing. Don't treat as confirmed.
- **tsx -e doesn't support top-level await**: Always write .ts files.
- **Helius batch-identity**: 100 credits for up to 100 addresses. Most efficient way to identify wallets.
- **Deployer gambles on Rollbit**: Confirmed behavioral trait.
- **Open audit items (lower priority)**: Hub→J5GLMu33→DZc1evNL funding chain undocumented; DZc1evNL $2,284 outflow to 6m4q5Vzz uninvestigated; DMDBALLS Token Deployer sends $112 to 2q8nSJgC; Bundle pagination incomplete (is_last_page: false for all 6); DfwNaPDh receives $2.2K + RoganVsLiverking tokens from Bundle 2.
