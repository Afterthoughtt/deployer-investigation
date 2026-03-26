# Session Handoff - 2026-03-25T12:00:00Z

## Goal
Track a serial pump.fun deployer on Solana to identify their next fresh wallet (L11) before `create_and_buy` fires, enabling a block-0 snipe via Bloom bot whitelist.

## Current Status
- **Phase**: ADDRESS VERIFICATION AUDIT NEEDED before continuing. See `ADDRESS_AUDIT_INSTRUCTIONS.md`.
- **Progress**: BqP79Wmk identified as deployer's personal trading wallet. Cashout goes to Crypto.com (FKjuwJzHn4hq, Arkham: Crypto.com Deposit). But a transcription error was caught during audit (wrong suffix on cashout address), raising concern about other addresses in network-map.json.
- **Blocked**: Need to verify all addresses in network-map.json before trusting any findings.

## What Was Done This Session

### 0. CRITICAL: Identified Deployer's Personal Trading Wallet (BqP79Wmk)
- Created `src/profile-l10-suspicious.ts` + `src/deep-dive-bqp79wmk.ts`
- Raw: `data/results/raw/l10-suspicious-buyers-profiles.json` + `data/results/raw/bqp79wmk-deep-dive.json`

**BqP79Wmk = deployer's personal trading wallet.** Evidence:
1. Trades ALL 7 deployer tokens across ALL launches ($194K+ total)
2. Funded by MoonPay MP1 via GoonPump intermediary (231fshU8)
3. Receives from Large Funding Source (Fireblocks — deployer infrastructure)
4. First funded on L1 launch day
5. Buys at +6 seconds on L10
6. GoonPump funder also trades WFXRP, receives from LFS, cashes out to MEXC
7. Cashout FKjuwJzHn4hq is Crypto.com Deposit (Arkham confirmed) — sends $7.2K to Crypto.com
8. Pipeline: MoonPay/Bitget → GoonPump (231fshU8) → BqP79Wmk → FKjuwJzHn4hq → Crypto.com
9. AUDIT NOTE: Cashout address was initially transcribed wrong (FKjuwJzHJYAh... instead of FKjuwJzHn4hq...). Caught during audit. See ADDRESS_AUDIT_INSTRUCTIONS.md.

**L11 monitoring**: GoonPump + BqP79Wmk will appear as early L11 buyers. Also monitor 8QCVZ7KL/5c9EM9y2 funding pipeline.

**Other L10 buyers**: 7QJM8rXX possible CoinSpot associate. niggerd5/4tMmABq7 not network.

### 1. Profiled 4 Remaining Unknown Wallets
- Created `src/profile-remaining-unknowns.ts`
- Raw results saved to `data/results/raw/remaining-unknowns-profiles.json`

**Findings:**

- **7RLD6F9S (Fireblocks)**: CONFIRMED NETWORK. **Funded by Hub Wallet**. 43.79 SOL balance. ONLY outflow: 108 SOL ($12.1K) to Token Millionaire. Receives from cold_usdc_2, routes_binance, hub_intermediary, jetnut_network, l9_funder, CB6/CB8, hub, L6. Also gambles (flip.gg, bspin.io). **ADDED TO L11 INTERMEDIARY WATCHLIST** — has 43.79 SOL, enough to fund L11.

- **yNanvu8H**: NOT NETWORK. Independent DeFi trader. Received $2.2K USDC from cold_usdc_2 as one-time payment. Funded by unknown chain (not Coinbase/MoonPay). Massive Jupiter swaps ($252K), trades WAR/LUXE/BONK. Zero network connections beyond cold_usdc_2.

- **E2NnJHhc**: CONFIRMED NETWORK. Pump.fun trading bot sending $2,076 TO OG deployer + $94 to L9 + $5 to Hub. Trades deployer's XRP-themed tokens (ARKXRP, DOGWIFXRP, WFXRP). Same profit-relay pattern as Ed4UGBWK. Still very active (Mar 25). Moved to network_connected.

- **chrisV**: NOT NETWORK. Independent BloomBot power trader. ZERO network connections. Deploys own tokens (USELESS, JiaBeiZhu, TEST). Cashes out $11K to Binance (deployer uses Coinbase). $2M BloomBot self-volume. Bought L8-L9 early via sniping, not insider knowledge.

### 2. Mapped MoonPay Hot Wallet Cluster
- Created `src/map-moonpay-cluster.ts`, `src/map-moonpay-cluster-v2.ts`, `src/moonpay-entity-lookup2.ts`
- Raw results saved to `data/results/raw/moonpay-cluster-mapping.json`, `data/results/raw/moonpay-cluster-v2.json`

**Findings:**
- **MP1** (Cc3bpPzU): MoonPay Hot Wallet 1. Customer-facing — sends SOL to buyers. **Monitor for L11.**
- **MP4** (AFKxebx9): MoonPay Hot Wallet 4. Treasury, 17,056 SOL. Funded by Bitstamp/FalconX. Only sends to MP1. NOT customer-facing.
- MoonPay Hot Wallets 2/3 NOT found on Solana — may not exist or be inactive.
- Nansen entity holds 14K SOL + $568K USDC + $77K USDT aggregate.
- Nansen counterparties for MP1: 422 error (too much activity).

### 3. Pulled L10 Early Buyers (XAIC Token)
- Created `src/get-l10-early-buyers.ts`, `src/process-l10-buyers.ts`
- Raw results saved to `data/results/raw/l10-early-buyers.json`, `data/results/raw/l10-early-buyers-processed.json`
- Added L10 section to `data/launch-details.json`

**Findings:**
- 150 BUY trades in first 69 seconds. 117 unique traders.
- **Network matches (3):** L10 Deployer (#1, $1175 at +0s), jetnut_network (#8, $1048 at +2s), F7RV6aBW (#56, $132 at +9s)
- **jetnut_network bought $1048 at +2 seconds** — fastest network buyer after deployer
- **F7RV6aBW continues appearing** — 4th consecutive launch (L7-L10)
- **CoinSpot insider NOT in first 150 trades** — may have bought slightly after first 69 seconds
- **New suspicious unknowns:** niggerd5 ($916 at +3s, Nansen: "Deployer"), BqP79Wmk ($689 at +6s), 7QJM8rXX ($1075 at +10s — largest non-deployer buy!), 4tMmABq7 ($612 at +63s)

### Updated Files
- `data/results/investigation-notes.json` — Added remaining_unknowns_profiles section (4 wallets), updated L11 watchlist (added 7RLD6F9S), marked all remaining_tasks done, resolved E2NnJHhc, resolved chrisV, updated MoonPay mapping, added L10 early buyers results
- `data/network-map.json` — Updated 7RLD6F9S (profiled, L11 watchlist), moved E2NnJHhc to network_connected, resolved yNanvu8H (not network), resolved chrisV (not network), updated MoonPay cluster (added MP4)
- `data/launch-details.json` — Added L10 section with early buyers, token address, cross-reference
- Scripts created: `src/profile-remaining-unknowns.ts`, `src/map-moonpay-cluster.ts`, `src/map-moonpay-cluster-v2.ts`, `src/moonpay-entity-lookup.ts`, `src/moonpay-entity-lookup2.ts`, `src/get-l10-early-buyers.ts`, `src/process-l10-buyers.ts`

## What Was Tried and Failed (CRITICAL)

All prior session failures still apply (see below). No new failures this session.

- **tsx -e with top-level await**: Must write to .ts file and run with `npx tsx src/file.ts`.
- **Phantom fee wallet as network signal**: Protocol fee address, not a network fingerprint.
- **Connection count alone for network confirmation**: D1XcKeSS (Kraken) and F7RV6aBW (Binance) have mismatched funding sources.
- **Assuming zero-balance = retired wallet**: Could be transcription error.
- **Arkham transfers endpoint for Ed4UGBWK Rollbit deposits**: 0 Rollbit matches in 100 results.
- **Nansen tgm/dex-trades with trader_address filter**: Silently returns empty. Must pull ALL trades and filter client-side.
- **Arkham counterparties on Solana**: Returns empty for most wallets. Use Nansen.
- **Script defaulting null symbol to "SOL"**: Use `t.symbol || (t.mint === "So111..." ? "SOL" : "TOKEN")`.
- **Nansen counterparties for MoonPay MP1**: Returns 422 (too much activity).
- **Nansen entity balance for MoonPay**: Returns empty addresses (aggregate only, no individual wallet addresses).
- **Nansen dex-trades timestamp format**: Returns `2026-03-15T21:40:44` WITHOUT trailing Z. Must normalize before comparing with ISO dates.

## Key Decisions

- **7RLD6F9S added to L11 intermediary watchlist**: 43.79 SOL balance, funded by Hub Wallet. Could fund L11.
- **yNanvu8H classified NOT NETWORK**: One-time $2.2K USDC payment from cold_usdc_2. Independent DeFi trader.
- **E2NnJHhc confirmed NETWORK**: Pump.fun trading bot, same profit-relay pattern as Ed4UGBWK.
- **chrisV classified NOT NETWORK**: Independent BloomBot power trader with zero network connections.
- **MoonPay MP1 is the ONLY customer-facing wallet**: MP4 is treasury only. For L11 sieve, monitor MP1 only.

## Completed Investigation Tasks

All wallet profiling tasks are now complete:
- Deployers: L4-L10 verified
- Infrastructure: Hub, OG, Collection, LFS verified
- Bundle wallets: All 6 verified
- Profit routing: 8 wallets profiled (including 7RLD6F9S)
- Side projects: jetnut (closed), jetnut_network (active), eggsheeran (critical node)
- Insiders: CoinSpot (likely family), BloFin (separate network)
- Recurring wallets: ALL resolved (CJVEFd/9J9VHo = BloFin, chrisV = independent, F7RV6aBW = possible associate)
- Unknown counterparties: E2NnJHhc (network bot), yNanvu8H (not network), DLGHPXKF (transcription error)
- MoonPay: 2 wallets mapped (MP1 customer-facing, MP4 treasury)
- L10 early buyers: 117 traders profiled, 4 new suspicious unknowns identified

## NEXT SESSION: Address Verification Audit

**READ `ADDRESS_AUDIT_INSTRUCTIONS.md` FIRST.** Full instructions for the audit are there.

The audit must complete before any further investigation. After the audit:

1. **Profile BqP79Wmk pipeline wallets** — 8QCVZ7KL ($701 to GoonPump, "High Balance") and 5c9EM9y2 ($1,249 to GoonPump, "Distributor"). Upstream funding for deployer's trading wallet.

2. **Cross-reference BqP79Wmk with L1-L9 early buyer lists** — Confirm it appears across prior launches.

3. **Re-verify jetnut_deployer address** — Currently labeled "CLOSED ACCOUNT" (52eC8Uy5CDSJhR...) but given the pattern, this may be another transcription error. Check raw source.

4. **Profile remaining minor unknowns** — BigpvKiU ($2K to 7RLD6F9S), HBgtmeZD ($1.3K to 7RLD6F9S), 7mb5n6uw ($2.8K from jetnut_network), A9eAH6Az ($4.6K with Hub).

5. **Verify CoinSpot insider L10 buy** — Not in first 150 trades. Pull more pages.

6. **Build live monitoring sieve** — User explicitly said NOT to start this yet.

## Context the Next Session Needs

- **GitHub repo**: https://github.com/Afterthoughtt/deployer-investigation — `gh` CLI installed.
- **API env var names**: `NANSEN_API_KEY`, `ARKAN_API_KEY` (note: ARKAN not ARKHAM), `HELIUS_API_KEY` — all in `.env`
- **All APIs working**: Helius RPC/Wallet API, Nansen, Arkham.
- **Nansen rate limits**: 1.5-2s delays between calls. Max 3-4 day date ranges on `/profiler/address/transactions`. Labels = 500 credits.
- **Nansen dex-trades timestamp bug**: Returns timestamps WITHOUT trailing Z. Always normalize with `if (!ts.endsWith("Z")) ts += "Z"`.
- **Symbol bug pattern**: `t.symbol || (t.mint === "So11111111111111111111111111111111111111111" ? "SOL" : "TOKEN")`.
- **Scripts in `src/`**: Latest: `profile-remaining-unknowns.ts`, `process-l10-buyers.ts`.
- **XAIC token address**: `KfByHk48ecitUq8gXji2vr9smmRJKtqJwGAh2E9pump`
- **L11 intermediary watchlist**: Hub (0.05 SOL), OG, l9_funder, L7-L10 deployers, eggsheeran (0.05 SOL), jetnut_network (7.9 SOL), 7RLD6F9S (43.79 SOL! Highest balance).
- **jetnut_deployer (52eC8Uy5CDSJhR)**: Returns zero from all APIs. Previously labeled "CLOSED" but given the pattern of transcription errors (FKjuwJzH was wrong, not closed), this address may also be wrong. Re-verify during audit.
- **Ed4UGBWK Rollbit deposits UNVERIFIED**: Still no raw data for RB5KKB7h/RB2Yz3VS.
- **tsx -e doesn't support top-level await**: Always write .ts files.
