# Session Handoff - 2026-03-21T08:00:00Z

## Goal
Track a serial pump.fun deployer on Solana to identify their next fresh wallet (L11) before `create_and_buy` fires, enabling a block-0 snipe via Bloom bot whitelist.

## Current Status
- **Phase**: investigating (bundle wallets complete, profit routing wallets next)
- **Progress**: Address audit complete. Deployers verified (prior session). Infrastructure verified (prior session). Bundle wallets fully profiled with 4 surfaced unknowns resolved. Profit routing wallets NOT yet verified. Unresolved recurring wallets NOT yet investigated. MoonPay cluster NOT yet mapped. L10 early buyers NOT yet pulled. Live sieve NOT yet built.
- **Blocked**: No — all three APIs (Helius, Nansen, Arkham) are working.

## What Was Done This Session

### Full Address Audit (54 addresses across 3 APIs)
- Created `src/audit-addresses.ts` — reads ALL addresses from `data/network-map.json` programmatically, queries Helius (batch-identity + getBalance + funded-by), Nansen (related-wallets), Arkham (intelligence). Saves to `data/results/address-audit.json`.
- Ran audit. 7 Helius identities found, 41 non-zero balances, 40 funded-by results, 46 Nansen related, 20 Arkham labels.
- **8 flagged addresses** (zero from all APIs): 5 retired Coinbase wallets (CB1,2,5,7,8), hub_first_funder (confirmed valid via hub's Nansen data — closed account), jetnut_deployer (closed account), **DLGHPXKF (transcription error — NOT found in OG deployer's counterparties)**.
- Helius identity found: binance_deposit = "Dexscreener Listing Fees 1" (conflicts with Arkham "Binance Deposit"), MoonPay MP1 confirmed, Phantom fee wallet = "Phantom Swap Fees 1" (protocol fee collector, NOT a network signal).

### Counterparty Cross-Check
- Created `src/verify-counterparties.ts` — re-queried L6, L7, L9 deployer counterparties to verify 5 investigated counterparty addresses.
- All 5 CONFIRMED: B2XLRSaQ ($4.4K), 9cDDJ5g2 ($18.1K), 3RmT3sTx ($29.3K), CQvXtWfC ($9.5K), DcbyADbN ($2.9K).
- Created `src/verify-og-unknown.ts` — verified the 2 unknown_high_volume addresses from OG deployer. **DLGHPXKF NOT FOUND** in OG counterparties (transcription error). E2NnJHhc confirmed ($2K, 70 txs).

### Bundle Wallet Profiling (all 6 bundles)
- Created `src/profile-bundles.ts` — Nansen counterparties + Arkham transfers for all 6 bundles. Saved to `data/results/bundle-profiles.json`.
- Key findings:
  - Bundle 1 heaviest: Ed4UGBWK→B1 ($52K in), B1→Profit Pass 1 ($47K out)
  - Bundle 6 ANOMALOUS: funded by Axiom (not Coinbase), only 11 connections vs 18-22 for others, trades different tokens
  - 4 unknown wallets surfaced: 9exPdTUV ($13.5K), BR1HiYtc ($4.1K), 4916Nkdu ($870), D1XcKeSS ($1.5K)

### Deep Investigation of 4 Unknown Wallets
- Created `src/investigate-bundle-unknowns.ts` — full 3-API investigation with Layer 2/3 funder tracing. Saved to `data/results/bundle-unknowns-deep.json`.
- **9exPdTUV** (`9exPdTUVTCz9EKvZjXkKJSTJ5fZzJuwJHnFptrUFHFNH`): Fireblocks Custody (Arkham). Funded by Coinbase CB9. PURE PASSTHROUGH: receives from L7 ($31.6K), Bundles 1/3/5/6, Hub → forwards ALL $49K to 9cDDJ5g2. Active Jan 21-22 2026 only. **Route C of profit extraction discovered.**
- **BR1HiYtc** (`BR1HiYtcYv5L9oB9aydMS9G9nYSjVZcMB51AxBFUkQ8T`): Coinbase Deposit (Arkham). Funded by Eggsheeran. Receives from Hub ($5.2K), l9_funder ($3.1K), jetnut_network ($2.7K), Bundle 5, OG, Bundles 2/3 → sends $15.7K to 6 Coinbase hot wallets. Active Jun-Oct 2025. **Confirmed network — 2nd Coinbase deposit address.**
- **4916Nkdu** (`4916NkdubkfRyHkxkCR7rpVGz5dvzVdK161mg4jXDwRh`): Funded by CoinSpot exchange wallet (`CSEncqtqbmNRjve4...`). Receives bundled tokens from Bundle 1 + Bundle 3 (12.5M tokens each). Trades XAIC. **CoinSpot Insider's token trading wallet — confirms insider receives deployer's bundled tokens directly.**
- **D1XcKeSS** (`D1XcKeSSiZNX9bE56meS8hcR3ZEeoBU3GAejDdm3sTVQ`): 16 network connections (Hub $4.8K in, sends $2.8K to secondary aggregator, $680 to 6UrYwo9F). BUT funded via Kraken — deployer doesn't use Kraken (~90% confidence from user). User decision: **mark as "possible associate", monitor only, NOT confirmed network.**

### Key Reclassifications
- **9cDDJ5g2**: Previously "NOT part of deployer network" → **confirmed network profit aggregator** (receives $49K from network via 9exPdTUV Route C, in addition to Route B)
- **Phantom fee wallet** (`9yj3zvLS`): Downgraded — it's "Phantom Swap Fees 1", a protocol-level fee collector. NOT a network signal.
- **DLGHPXKF**: Flagged as **transcription error** — zero from all APIs AND not in OG's counterparties.

### File Updates
- `data/network-map.json` — Major update: added BR1HiYtc (coinbase_deposit_2), 9exPdTUV (fireblocks_passthrough), 4916Nkdu (CoinSpot insider token wallet), D1XcKeSS (monitoring/possible_associate). Reclassified 2q8nSJgC notes. Downgraded phantom fee wallet. Flagged DLGHPXKF. Updated metadata timestamp.
- `MEMORY.md` — Added Route C, all reclassifications, bundle verification notes, new rules (Phantom fee wallet, connection count vs funding source).

## What Was Tried and Failed (CRITICAL)

- **tsx -e with top-level await**: `npx tsx -e '...'` with top-level await fails ("not supported with cjs output format"). Must write to a .ts file and run with `npx tsx src/file.ts` instead.

- **Phantom fee wallet as network signal**: Previously used as evidence of network membership ("same Phantom fee wallet as deployer"). Helius identified it as "Phantom Swap Fees 1" — a protocol fee address that every Phantom user pays to. Removed as a distinguishing signal. Do not use for network attribution.

- **Connection count alone for network confirmation**: D1XcKeSS had 16 network connections but is funded via Kraken. User confirmed deployer doesn't use Kraken. High connection count can indicate shared infrastructure or associates, not necessarily the deployer. Always cross-check funding source against deployer's known exchange pattern before confirming.

- **Previous session failures still apply** (do not retry):
  - Helius API key `HELIUS_API_Key` (mixed case) — must use `HELIUS_API_KEY`
  - Nansen `tgm/dex-trades` with `trader_address` filter — silently returns empty
  - Arkham counterparties on Solana — returns empty for most wallets
  - Substring/prefix matching for address verification — unreliable

## Key Decisions

- **D1XcKeSS marked "possible associate" not "confirmed network"**: Despite 16 connections, funded via Kraken which the deployer doesn't use. User explicitly chose to monitor but not confirm. Stored in `monitoring` section of network-map.json, not `network_connected`.
- **Route C as separate profit extraction path**: L7 + Bundles → 9exPdTUV → 9cDDJ5g2, distinct from Route A (Collection Wallet) and Route B (OG/Hub direct to 2q8nSJgC). All three converge at Token Millionaire.
- **9cDDJ5g2 reclassified**: Previous session's "NOT part of network" verdict was wrong. $49K of confirmed network money flows through it via 9exPdTUV.
- **DLGHPXKF removed as investigation target**: Zero from all APIs + not in OG's counterparties = transcription error from prior session. Flagged in network-map but do not investigate.
- **Retired Coinbase wallets (CB1,2,5,7,8)**: Zero balance, no data. Expected for rotated hot wallets. Not transcription errors.

## Modified Files

- `src/audit-addresses.ts` — Created. Comprehensive 3-API audit of all network-map addresses.
- `src/verify-counterparties.ts` — Created. Re-queries parent wallet counterparties to verify recorded addresses.
- `src/verify-og-unknown.ts` — Created. Verifies DLGHPXKF and E2NnJHhc from OG deployer counterparties.
- `src/profile-bundles.ts` — Created. Nansen counterparties + Arkham transfers for all 6 bundles.
- `src/investigate-bundle-unknowns.ts` — Created. Deep 3-API investigation with Layer 2/3 funder tracing.
- `data/results/address-audit.json` — Created. Full audit results for 54 addresses.
- `data/results/counterparty-verification.json` — Created. Cross-check results for 5 counterparty addresses.
- `data/results/bundle-profiles.json` — Created. Full bundle wallet profiles.
- `data/results/bundle-unknowns-deep.json` — Created. Deep investigation of 4 unknown wallets + Layer 2/3 funders.
- `data/network-map.json` — Major update: added 4 wallets (BR1HiYtc, 9exPdTUV, 4916Nkdu, D1XcKeSS), reclassified 2q8nSJgC, downgraded phantom fee wallet, flagged DLGHPXKF, updated metadata.
- `MEMORY.md` — Updated with Route C, reclassifications, bundle findings, new rules.

## Next Steps (ordered)

1. **Verify profit routing wallets** — Profile all 8 wallets in `profit_routing` section of network-map.json (Profit Pass 1/2, Cold USDC 1/2, coinbase_deposit, binance_deposit, rollbit_deposit, routes_binance) via Nansen counterparties + Arkham transfers. Check if Ed4UGBWK's Rollbit deposits (RB5KKB7h, RB2Yz3VS) connect to deployer's known Rollbit deposit (RB3dQF6T). Also profile the NEW profit routing wallets (BR1HiYtc, 9exPdTUV) if not already fully mapped.

2. **Investigate remaining unresolved recurring wallets** — CJVEFd (position #1 at L6, 4 launches), 9J9VHo (5 launches), chrisV (L8-L9 position #3). Profile via all three APIs. These are from `unresolved_recurring_wallets` in investigation-notes.json.

3. **Investigate E2NnJHhc** — Confirmed in OG deployer counterparties ($2K, 70 txs). Still needs full profiling. Listed in `unknown_high_volume` in network-map.json.

4. **Map MoonPay hot wallet cluster** — Use Helius batch-identity and Nansen to find related MoonPay wallets beyond the 1 known (MP1). Deployer switched to MoonPay for L10 and may use other MoonPay wallets for L11.

5. **Get L10 early buyers list** — Use Nansen tgm/dex-trades for the XAIC token to pull ALL early buyers (cannot filter by trader_address — must pull all trades and filter client-side). Add to launch-details.json for cross-reference with prior launches.

6. **Build the live monitoring sieve** — Watch all known network wallets + on-ramp hot wallets for 8-25 SOL outflows to fresh addresses. This is the final deliverable for L11 detection.

## Context the Next Session Needs

- **API env var names**: `NANSEN_API_KEY`, `ARKAN_API_KEY` (note: ARKAN not ARKHAM), `HELIUS_API_KEY` — all in `.env`
- **Helius working**: RPC at `https://mainnet.helius-rpc.com/?api-key=KEY`, Wallet API at `https://api.helius.xyz/v1/wallet/...?api-key=KEY`. Developer plan, 10M credits/month.
- **Credit usage this session**: ~6,000 Helius credits (audit + bundle investigation), ~100 Nansen credits, Arkham free.
- **Nansen rate limits**: 1.5-2s delays between calls. Max 3-4 day date ranges on `/profiler/address/transactions`. Counterparties works with wider ranges. Labels = 500 credits — use sparingly.
- **Arkham Solana gaps**: Counterparties endpoint returns empty for most Solana wallets. Intelligence/labels/transfers work.
- **Master investigation file**: `data/results/investigation-notes.json` — comprehensive but NOT updated this session with the new findings (bundle profiles, Route C, reclassifications). The network-map.json and MEMORY.md ARE updated. Consider updating investigation-notes.json early next session.
- **Scripts in `src/`**: `audit-addresses.ts`, `verify-counterparties.ts`, `profile-bundles.ts`, `investigate-bundle-unknowns.ts` are all reusable patterns. The investigate-bundle-unknowns.ts pattern (3-API deep + Layer 2/3 funder tracing) is the best template for future wallet investigations.
- **Bundle 6 is anomalous**: Funded by Axiom (not Coinbase), fewer connections, different token mix. May be a newer/separate bundle. Keep in mind during future analysis.
- **Phantom fee wallet is NOT a network signal**: Protocol-level fee collector used by all Phantom users.
- **D1XcKeSS is monitoring only**: User explicitly chose not to confirm. Kraken funding doesn't match deployer pattern.
- **tsx -e doesn't support top-level await**: Always write .ts files, don't use inline evaluation.
- **Helius batch-identity**: 100 credits for up to 100 addresses. Most efficient way to identify wallets.
- **Deployer gambles on Rollbit**: Confirmed behavioral trait. Don't dismiss Rollbit connections.
