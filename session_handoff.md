# Session Handoff - 2026-03-25T06:00:00Z

## Goal
Track a serial pump.fun deployer on Solana to identify their next fresh wallet (L11) before `create_and_buy` fires, enabling a block-0 snipe via Bloom bot whitelist.

## Current Status
- **Phase**: investigating (side projects + insiders complete, moving to remaining unknowns + MoonPay + L10 buyers + live sieve)
- **Progress**: Deployers verified, infrastructure verified, bundle wallets verified, audit & cleanup complete, profit routing wallets PROFILED, side projects & insiders PROFILED. CJVEFd and 9J9VHo RESOLVED as BloFin insider associated. MoonPay cluster NOT yet mapped. L10 early buyers NOT yet pulled. Live sieve NOT yet built.
- **Blocked**: No — all three APIs (Helius, Nansen, Arkham) are working. Project backed up to GitHub.

## What Was Done This Session

### Profiled 8 Side Project & Insider Wallets
- Created `src/profile-side-projects-insiders.ts` — 3-API investigation script
- Raw results saved to `data/results/raw/side-projects-insiders-profiles.json`
- Credit cost: ~2488 Helius + 48 Nansen + Arkham free

### Key Findings

1. **jetnut_deployer (52eC8Uy5CDSJhR)** — CLOSED ACCOUNT. Zero from all 3 APIs. Cannot investigate.

2. **jetnut_network (FSbvLdrK)** — VERY ACTIVE (Mar 23). 7.9 SOL. Funded by hub_intermediary_DfwNaPDh. 13 network connections. Sends $2.7K to Coinbase Deposit 2, $1.5K to Fireblocks 7RLD6F9S. Receives from routes_binance, LFS. Trades XAIC, DOGWIFXRP, QTX. Added to L11 intermediary watchlist.

3. **eggsheeran (DuCzGNzS)** — CRITICAL NODE. 35 network connections. Arkham: "andrewpapd" on Pump.fun. Funded by MoonPay MP1. Sends $6.7K to l9_funder, $6.3K to L7, $4.8K to cold_usdc_2, $1.8K to coinbase_deposit, $1.2K to collection. Receives $5.5K from OG, $3.1K from Hub, bundles. Deployed 8+ tokens. Also gambles on Solcasino.io. Added to L11 intermediary watchlist — could fund L11.

4. **CoinSpot insider** — CONFIRMED SEPARATE. Funded by CoinSpot exchange (sigmurzkferog.sol). Trading wallet sends ALL profits ($9.1K) to collection, which forwards ALL to CoinSpot ($17.6K). SUSYE deployer funded by Coinbase CB7 (notable overlap) but primarily uses CoinSpot/MEXC/Bybit.

5. **BloFin insider (BDVgXauN)** — COMPLETELY SEPARATE NETWORK. Funded by Crypto.com Hot Wallet 1. Arkham: "zougz" on Pump.fun. Massive trader ($192K Photon, $44K OKX DEX). Deploys own tokens. Passthrough (33KoLeWr) confirmed as BloFin Deposit by Arkham.

6. **CRITICAL RESOLUTION**: BloFin insider hub is counterparty with BOTH previously-unresolved recurring wallets:
   - 9J9VHoLW ($17.4K, 49 txs, BloomBot) — appeared in 5 launches
   - CJVEFdRS ($11.8K, 20 txs, BloomBot) — appeared in 4 launches
   These are BloFin insider's trading wallets, NOT deployer-controlled. Removes them from L11 watchlist.

### Deep Dive: CJVEFd/9J9VHo Ownership + CoinSpot Insider
- Created `src/profile-recurring-coinspot.ts` — profiles CJVEFd, 9J9VHo, 98KvdqZJ intermediary, F7oLGB1U cashout
- Raw results saved to `data/results/raw/recurring-coinspot-deep-dive.json`
- **CJVEFd and 9J9VHo are CONFIRMED zougz's own wallets** — both directly funded by BDVgXauN (zougz hub), funding chain → Crypto.com. All SOL flows exclusively to/from zougz hub.
- **98KvdqZJ is SUSYE deployer's own trading wallet** — funded by SUSYE, $12K bidirectional, also receives $2K from CoinSpot exchange
- **F7oLGB1U is pure CoinSpot cashout passthrough** — 4916Nkdu → F7oLGB1U → CoinSpot exchange ($5.2K)
- **CoinSpot insider reclassified as likely deployer insider/family** (user assessment, not coincidence). CB7 funding is the key link.

### Audit
- Ran programmatic audit comparing all session findings against raw JSON
- 12/12 funded-by addresses verified
- 3/3 Arkham labels verified
- 9/9 balances verified
- 8/8 network-map addresses verified
- 5/5 counterparty dollar figures verified
- All 12 narrative claims verified against raw data
- Caught and corrected 2 address transcription errors mid-session: 98KvdqZJ and F7oLGB1U (wrong suffixes in initial script, fixed before API calls)

### Updated Files
- `data/results/investigation-notes.json` — Added side_projects_insiders_profiles section (8 wallets), CJVEFd/9J9VHo confirmed as zougz's wallets, 98KvdqZJ/F7oLGB1U profiled, CoinSpot insider updated to "likely insider/family", updated remaining_tasks, added eggsheeran+jetnut_network to L11 intermediary watchlist
- `data/network-map.json` — Updated side_projects (jetnut_deployer closed, jetnut_network active, eggsheeran critical), updated insiders (coinspot "likely insider/family" + new wallets, blofin profiled with Crypto.com source + zougz label + BloFin Deposit confirmation)
- `src/profile-side-projects-insiders.ts` — Created. 3-API side project + insider investigation script.
- `src/profile-recurring-coinspot.ts` — Created. Deep dive on CJVEFd/9J9VHo + CoinSpot intermediaries.
- `data/results/raw/side-projects-insiders-profiles.json` — Created. Raw API responses for all 8 wallets + 2 L2 funders.
- `data/results/raw/recurring-coinspot-deep-dive.json` — Created. Raw API responses for 4 wallets + 3 funding chains.

## What Was Tried and Failed (CRITICAL)

- **tsx -e with top-level await**: Must write to .ts file and run with `npx tsx src/file.ts`. (Prior session failure, still applies.)

- **Phantom fee wallet as network signal**: Protocol fee address, not a network fingerprint. (Prior session failure, still applies.)

- **Connection count alone for network confirmation**: D1XcKeSS (16 connections, Kraken) and F7RV6aBW (profit relay, Binance) both have mismatched funding sources. High connection count doesn't mean deployer-controlled. (Prior session + prior session.)

- **Assuming zero-balance addresses are "retired wallets"**: Prior session dismissed CB1/2/5/7/8 zero balances as "rotated hot wallets." All 5 were actually transcription errors. **Rule: zero from all APIs = suspect transcription error FIRST, not retired wallet.**

- **Arkham transfers endpoint for Ed4UGBWK Rollbit deposits**: Queried 100 transfers, 0 Rollbit-related. The Rollbit deposit addresses RB5KKB7h/RB2Yz3VS remain unverifiable.

- **Nansen tgm/dex-trades with trader_address filter**: Silently returns empty. Must pull ALL trades and filter client-side. (Prior session failure, still applies.)

- **Arkham counterparties on Solana**: Returns empty for most wallets. Use Nansen counterparties instead. (Prior session failure, still applies.)

- **Script defaulting null symbol to "SOL"**: `t.symbol || "SOL"` misreports pump.fun token transfers as SOL. Fixed in prior session — now checks mint address. Any future scripts must use the fixed pattern: `t.symbol || (t.mint === "So11111111111111111111111111111111111111111" ? "SOL" : "TOKEN")`.

## Key Decisions

- **CJVEFd and 9J9VHo reclassified as BloFin insider associated**: Both are counterparties of BloFin insider hub ($11.8K and $17.4K respectively). Both labeled "BloomBot Trading Bot User" by Nansen. They trade on deployer's launches but are NOT deployer-controlled wallets. Removed from L11 watchlist.

- **Eggsheeran added to L11 intermediary watchlist**: 35 network connections, sends $6.7K to l9_funder (who funded L9). Could serve as intermediary funder for L11.

- **jetnut_network added to L11 intermediary watchlist**: 7.9 SOL balance, funded by Hub intermediary, active Mar 23. Has SOL to potentially fund a fresh deployer.

- **SUSYE deployer funded by Coinbase CB7**: Notable overlap — CoinSpot insider's deployer wallet was initially funded by the same Coinbase infrastructure the main deployer uses. Could indicate a loose association or coincidence.

## Next Steps (ordered)

1. **Profile new unknowns from profit routing** — 7RLD6F9S (Fireblocks Custody, $6.6K from network — where does it send?), yNanvu8H ($2.2K USDC from cold_usdc_2).

2. **Investigate E2NnJHhc** — Confirmed in OG deployer counterparties ($2K, 70 txs). Needs full profiling.

3. **Profile chrisV** — Last unresolved recurring wallet (L8-L9 position #3). CJVEFd and 9J9VHo are resolved.

4. **Map MoonPay hot wallet cluster** — Use Helius batch-identity and Nansen to find related MoonPay wallets beyond the 1 known (MP1). Deployer switched to MoonPay for L10 and may use other MoonPay wallets for L11.

5. **Get L10 early buyers list** — Use Nansen tgm/dex-trades for the XAIC token to pull ALL early buyers (cannot filter by trader_address — must pull all trades and filter client-side). Add to launch-details.json for cross-reference.

6. **Build the live monitoring sieve** — Watch all known network wallets + on-ramp hot wallets for 8-25 SOL outflows to fresh addresses. This is the final deliverable for L11 detection.

## Context the Next Session Needs

- **GitHub repo**: https://github.com/Afterthoughtt/deployer-investigation — `gh` CLI installed.
- **API env var names**: `NANSEN_API_KEY`, `ARKAN_API_KEY` (note: ARKAN not ARKHAM), `HELIUS_API_KEY` — all in `.env`
- **Helius working**: RPC at `https://mainnet.helius-rpc.com/?api-key=KEY`, Wallet API at `https://api.helius.xyz/v1/wallet/...?api-key=KEY`. Developer plan, 10M credits/month.
- **Credit usage this session**: ~2488 Helius + ~48 Nansen + Arkham free (8 wallets + 2 L2 funders).
- **Nansen rate limits**: 1.5-2s delays between calls. Max 3-4 day date ranges on `/profiler/address/transactions`. Labels = 500 credits.
- **Nansen counterparties pagination**: jetnut_network, eggsheeran, blofin_hub all had `is_last_page: false` on page 1. May have more counterparties not yet fetched.
- **Arkham Solana gaps**: Counterparties endpoint returns empty. Intelligence/labels/transfers work.
- **Symbol bug FIXED**: Scripts use `t.symbol || (t.mint === "So11111111111111111111111111111111111111111" ? "SOL" : "TOKEN")`.
- **Scripts in `src/`**: `profile-side-projects-insiders.ts` is the latest script. `profile-profit-routing.ts` is the prior template.
- **Active network wallets to watch**: cold_usdc_2 (EAcUbdoi, last Mar 20, 1.97 SOL), routes_binance (DcEYX34v, last Mar 22, 0 SOL), jetnut_network (FSbvLdrK, last Mar 23, 7.9 SOL), eggsheeran (DuCzGNzS, last Mar 21, 0.05 SOL).
- **Coinbase deposit naming**: Helius calls CB1 "Coinbase Hot Wallet 9" — project numbering (CB1-CB10) is internal.
- **Fireblocks wallets in network**: Collection (Bra1HUNK), 9exPdTUV, 9cDDJ5g2, 2q8nSJgC, 7RLD6F9S, Token Millionaire, LFS.
- **NOT YET PROFILED**: 7RLD6F9S (Fireblocks, receives $6.6K from network — outflows unknown), yNanvu8H ($2.2K USDC from cold_usdc_2 — completely unknown), E2NnJHhc ($2K/70 txs with OG — unprofilied), chrisV (L8-L9 position #3 — unprofiled).
- **Ed4UGBWK Rollbit deposits UNVERIFIED**: RB5KKB7h and RB2Yz3VS have no raw data.
- **tsx -e doesn't support top-level await**: Always write .ts files.
- **jetnut_deployer (52eC8Uy5CDSJhR) is CLOSED**: Zero from all APIs. Do not re-query.
