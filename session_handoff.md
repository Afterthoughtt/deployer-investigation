# Session Handoff - 2026-03-25T03:00:00Z

## Goal
Track a serial pump.fun deployer on Solana to identify their next fresh wallet (L11) before `create_and_buy` fires, enabling a block-0 snipe via Bloom bot whitelist.

## Current Status
- **Phase**: investigating (profit routing complete, moving to side projects + insiders)
- **Progress**: Deployers verified, infrastructure verified, bundle wallets verified, audit & cleanup complete, profit routing wallets PROFILED. Side projects and insiders NOT yet reviewed. Unresolved recurring wallets NOT yet investigated. MoonPay cluster NOT yet mapped. L10 early buyers NOT yet pulled. Live sieve NOT yet built.
- **Blocked**: No — all three APIs (Helius, Nansen, Arkham) are working. Project backed up to GitHub.

## What Was Done This Session

### Profiled 8 Profit Routing Wallets
- Created `src/profile-profit-routing.ts` — 3-API deep investigation script (Helius balance/identity/funded-by/sigs/transfers + Nansen related/counterparties + Arkham intel/transfers + Layer 2 funder tracing)
- Ran against: profit_pass_1, profit_pass_2, cold_usdc_1, cold_usdc_2, coinbase_deposit, binance_deposit, rollbit_deposit, routes_binance
- Raw results saved to `data/results/raw/profit-routing-profiles.json`
- Credit cost: ~2488 Helius + 48 Nansen + Arkham free

### Comprehensive Audit of Results
- Verified ALL funded-by addresses against raw JSON (8 L1 + 4 L2 funders)
- Verified ALL Arkham labels (Coinbase Deposit, Binance Deposit, Rollbit Deposit confirmed)
- Verified Nansen counterparty volumes against raw JSON ($247K Ed4UGBWK, $235K Rollbit Treasury, etc.)
- Caught and corrected 5 errors before writing to investigation notes:
  1. cold_usdc_2 "1000 SOL from l9_funder" → actually 1000 pump.fun tokens (mint `KfByHk48...pump`)
  2. cold_usdc_2 "2200 SOL to yNanvu8H" → actually $2,200 USDC (mint `EPjFWdd5...`)
  3. routes_binance "5M SOL" and "28M SOL" → pump.fun token transfers, not SOL
  4. 9cDDJ5g2 listed as "new unknown" → already profiled in investigation-notes.json line 167
  5. 7RLD6F9S listed as unknown → Arkham labels it "Fireblocks Custody" (missed in initial read)

### Key Findings
- **binance_deposit (21wG4F3Z) is NOT deployer-specific** — zero network connections, generic Binance deposit. Moved to `not_network` section. Real deployer Binance deposit is `Fx7gAJpkhWUBWRLa8igKwAkMdLG58mCnoyL9dCKfnZo3` (Nansen: "Binance: Deposit"), receives $1K from routes_binance.
- **Coinbase-Rollbit gambling cycle confirmed**: CB1-CB10 send $184K+ INTO rollbit_deposit → $233K deposited to Rollbit Treasury. Deployer cashes out via Coinbase, then recycles funds to Rollbit gambling.
- **coinbase_deposit (J6YUyB4P) is the PRIMARY cashout**: $235K Rollbit winnings + $40K+ network inflows → $265K+ out to all 10 CB hot wallets.
- **7RLD6F9SiFvtdqW4bYpy4m8D3mum7xVdZUSjzv1TWJaf** — new Fireblocks Custody wallet receiving $6.6K SOL from cold_usdc_2 ($4K) + routes_binance ($2.6K). Needs further profiling.
- **Hub→DfwNaPDh→routes_binance** chain confirmed (DfwNaPDh funded by Hub Wallet).
- **cold_usdc_2 (EAcUbdoi) STILL ACTIVE** — last activity Mar 20 2026, 1.97 SOL balance.
- **routes_binance (DcEYX34v) STILL ACTIVE** — last activity Mar 22 2026.
- Added Routes E/F/G to profit extraction map, total network extraction $400K+.

### Bug Fix
- Fixed `sym = t.symbol || "SOL"` in both `src/profile-profit-routing.ts` and `src/investigate-bundle-unknowns.ts` — now checks mint address to distinguish real SOL from pump.fun tokens (`"TOKEN"` for non-SOL).

### Stale Address Fix
- Corrected `9Z83ZAtd` address in investigation-notes.json `new_high_priority_wallets` section — was still showing old transcription error, now matches network-map.json.

## What Was Tried and Failed (CRITICAL)

- **tsx -e with top-level await**: Must write to .ts file and run with `npx tsx src/file.ts`. (Prior session failure, still applies.)

- **Phantom fee wallet as network signal**: Protocol fee address, not a network fingerprint. (Prior session failure, still applies.)

- **Connection count alone for network confirmation**: D1XcKeSS (16 connections, Kraken) and F7RV6aBW (profit relay, Binance) both have mismatched funding sources. High connection count doesn't mean deployer-controlled. (Prior session + prior session.)

- **Assuming zero-balance addresses are "retired wallets"**: Prior session dismissed CB1/2/5/7/8 zero balances as "rotated hot wallets." All 5 were actually transcription errors. **Rule: zero from all APIs = suspect transcription error FIRST, not retired wallet.**

- **Arkham transfers endpoint for Ed4UGBWK Rollbit deposits**: Queried 100 transfers, 0 Rollbit-related. The Rollbit deposit addresses RB5KKB7h/RB2Yz3VS remain unverifiable.

- **Nansen tgm/dex-trades with trader_address filter**: Silently returns empty. Must pull ALL trades and filter client-side. (Prior session failure, still applies.)

- **Arkham counterparties on Solana**: Returns empty for most wallets. Use Nansen counterparties instead. (Prior session failure, still applies.)

- **Script defaulting null symbol to "SOL"**: `t.symbol || "SOL"` misreports pump.fun token transfers as SOL. Fixed this session — now checks mint address. Any future scripts must use the fixed pattern: `t.symbol || (t.mint === "So11111111111111111111111111111111111111111" ? "SOL" : "TOKEN")`.

## Key Decisions

- **binance_deposit (21wG4F3Z) reclassified as NOT network**: Zero network connections, massive random throughput, Nansen first funder is "LONGHORSE Token Deployer" (unrelated). Moved to `not_network` section in network-map.json. Real deployer Binance deposit identified as Fx7gAJpk.

- **7RLD6F9S added to network map as Fireblocks Custody**: Receives $6.6K SOL from two active network wallets. Arkham confirms "Fireblocks Custody". Added to profit_routing section.

- **DfwNaPDh added as hub intermediary**: Layer 2 investigation confirmed Hub Wallet funded DfwNaPDh which funded routes_binance. Added to profit_routing section.

- **User requested next session focus**: Review side projects and insiders wallets, then continue to unresolved recurring wallets.

## Modified Files

- `data/results/investigation-notes.json` — Added profit_routing_profiles section (8 wallets), layer2_funder_investigations, new_findings, Routes E/F/G. Updated remaining_tasks, resolved binance_deposit label conflict, fixed 9Z83ZAtd address.
- `data/network-map.json` — All profit_routing entries now have detailed notes. binance_deposit moved to not_network. Added binance_deposit_real (Fx7gAJpk), hub_intermediary_DfwNaPDh, fireblocks_7RLD6F9S, yNanvu8H_unknown.
- `src/profile-profit-routing.ts` — Created. 3-API profit routing investigation script. Symbol bug fixed.
- `src/investigate-bundle-unknowns.ts` — Symbol bug fixed (2 occurrences).
- `data/results/raw/profit-routing-profiles.json` — Created. Raw API responses for all 8 wallets + 4 L2 funders.

## Next Steps (ordered)

1. **Review side projects and insiders wallets** — User explicitly requested this as next focus. Side projects: jetnut_deployer (52eC8Uy5CDSJhR), jetnut_network (FSbvLdrK), eggsheeran (DuCzGNzS). Insiders: coinspot_insider (DmA9Jab, 4916Nkdu, 9a22FhBe), blofin_insider (BDVgXauN, 33KoLeWr). Profile via all three APIs — check current activity, balances, recent counterparties.

2. **Investigate unresolved recurring wallets** — CJVEFd (position #1 at L6, 4 launches), 9J9VHo (5 launches), chrisV (L8-L9 position #3). Profile via all three APIs.

3. **Profile new unknowns from profit routing** — 7RLD6F9S (Fireblocks Custody, $6.6K from network — where does it send?), yNanvu8H ($2.2K USDC from cold_usdc_2).

4. **Investigate E2NnJHhc** — Confirmed in OG deployer counterparties ($2K, 70 txs). Needs full profiling.

5. **Map MoonPay hot wallet cluster** — Use Helius batch-identity and Nansen to find related MoonPay wallets beyond the 1 known (MP1). Deployer switched to MoonPay for L10 and may use other MoonPay wallets for L11.

6. **Get L10 early buyers list** — Use Nansen tgm/dex-trades for the XAIC token to pull ALL early buyers (cannot filter by trader_address — must pull all trades and filter client-side). Add to launch-details.json for cross-reference.

7. **Build the live monitoring sieve** — Watch all known network wallets + on-ramp hot wallets for 8-25 SOL outflows to fresh addresses. This is the final deliverable for L11 detection.

## Context the Next Session Needs

- **GitHub repo**: https://github.com/Afterthoughtt/deployer-investigation — `gh` CLI installed. Remote uses old case URL but redirects work.
- **API env var names**: `NANSEN_API_KEY`, `ARKAN_API_KEY` (note: ARKAN not ARKHAM), `HELIUS_API_KEY` — all in `.env`
- **Helius working**: RPC at `https://mainnet.helius-rpc.com/?api-key=KEY`, Wallet API at `https://api.helius.xyz/v1/wallet/...?api-key=KEY`. Developer plan, 10M credits/month.
- **Credit usage this session**: ~2488 Helius credits (8x balance/identity/funded-by/sigs/transfers + 4x L2 investigations), ~48 Nansen credits (8x related + 7x counterparties, 1 returned 422), Arkham free.
- **Nansen rate limits**: 1.5-2s delays between calls. Max 3-4 day date ranges on `/profiler/address/transactions`. Labels = 500 credits — use sparingly.
- **Nansen 422 on binance_deposit**: "excessively high trade activity" — some addresses are too active for counterparties endpoint. Will happen on other high-volume addresses too.
- **Arkham Solana gaps**: Counterparties endpoint returns empty for most Solana wallets. Intelligence/labels/transfers work.
- **Symbol bug FIXED**: Scripts now use `t.symbol || (t.mint === "So11111111111111111111111111111111111111111" ? "SOL" : "TOKEN")` instead of `t.symbol || "SOL"`. Copy this pattern to any new scripts.
- **Scripts in `src/`**: `profile-profit-routing.ts` is the latest clean template. `investigate-bundle-unknowns.ts` also updated with symbol fix.
- **Active network wallets**: cold_usdc_2 (EAcUbdoi, last Mar 20, 1.97 SOL), routes_binance (DcEYX34v, last Mar 22, 0 SOL). These could show new activity.
- **Coinbase deposit naming**: Helius calls CB1 "Coinbase Hot Wallet 9" — project numbering (CB1-CB10) is internal, not aligned with Helius.
- **Fireblocks wallets in network**: Collection (Bra1HUNK), 9exPdTUV, 9cDDJ5g2, 2q8nSJgC, 7RLD6F9S, Token Millionaire, LFS. Arkham labels many wallets "Fireblocks Custody" — it's a broad label.
- **Ed4UGBWK Rollbit deposits UNVERIFIED**: RB5KKB7h and RB2Yz3VS have no raw data backing. Don't treat as confirmed.
- **tsx -e doesn't support top-level await**: Always write .ts files.
