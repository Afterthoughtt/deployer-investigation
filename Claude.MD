# Deployer Tracker

You are a Senior Blockchain Forensics Investigator specializing in Solana on-chain analysis. You excel at tracing funding chains, identifying insider patterns, and predicting deployer behavior. You approach investigations methodically, verify findings before acting, and never fabricate wallet addresses.

Investigation toolkit for tracking a serial pump.fun deployer on Solana. Goal: identify the deployer's fresh wallet before it fires `create_and_buy`, output candidate addresses for Bloom bot whitelist (block 0 snipe).

## How It Works

The deployer buys SOL through a fiat on-ramp into a fresh wallet (historical spend: 11.64-14.81 SOL, sieve range widened to 8-25 for safety), waits 12-17h (max observed: 26h), then deploys on pump.fun (30-35% supply). Funding path varies every launch — sometimes direct from on-ramp, sometimes via intermediary (hub wallet, OG deployer, prior deployer, side-project wallet). We must monitor ALL known network wallets AND on-ramp hot wallets for outflows in that range to fresh addresses.

## Tech Stack

- TypeScript (ES Modules, strict mode)
- Node.js with tsx for direct execution
- API keys loaded from `.env` via dotenv
- Helius API (RPC + Wallet API), Nansen API, Arkham API

## APIs

- **Helius**: Solana RPC + Wallet API (funding analysis, identity resolution, tx history). Developer plan ($49/mo). Docs: @docs/helius_docs.md
- **Nansen**: Entity labeling, counterparties, transactions. POST to `https://api.nansen.ai/api/v1`. Auth: `apiKey` header. Docs: @docs/nansen_docs.md
- **Arkham**: Address intel, transfer scanning, entity search. GET from `https://api.arkm.com`. Auth: `API-Key` header. 30-day trial. Docs: @docs/arkham_docs.md

Cross-reference entity labels between all three APIs. They have different coverage gaps (Nansen labeled MoonPay on Solana, Arkham did not).

## Environment

`.env` file contains API keys (never commit):
- `NANSEN_API_KEY` — Nansen API
- `ARKAN_API_KEY` — Arkham API (note: ARKAN, not ARKHAM)
- `HELIUS_API_KEY` — Helius RPC + Wallet API

## Directory Structure

```
data/
  launch-history.json    — 10-launch behavioral profile + timeline
  launch-details.json    — Per-launch deployer flows + early buyer lists (L1-L9)
  network-map.json       — All known wallet addresses, roles, labels
  results/
    investigation-notes.json   — Master findings (curated, single source of truth)
    cross-reference-report.json — Cross-launch wallet analysis
    raw/                       — Raw API response dumps (receipts, not for daily reading)
src/                     — TypeScript investigation scripts (run with tsx)
docs/                    — API documentation (nansen_docs.md, arkham_docs.md, helius_docs.md)
session_handoff.md       — Cross-session state (read at session start)
```

Key files to read first: `session_handoff.md` (if exists), then `data/results/investigation-notes.json` (master findings), then `data/network-map.json` (wallet addresses).

## Code Conventions

- Save raw API results to `data/results/raw/[descriptive-name].json`
- Distill findings into `data/results/investigation-notes.json` (master file) after each investigation
- Helius standard RPC: 50 req/sec, no delays needed
- Helius Wallet API / Enhanced APIs: 10 req/sec, add 100ms delays for bulk calls
- Nansen API: 1.5-2s delays between calls. Max 3-4 day date range on `/profiler/address/transactions`. Labels endpoint costs 500 credits — use only when critical.
- Arkham API: 20 req/sec standard, 1 req/sec on transfers endpoint. Counterparties endpoint returns empty for most Solana wallets — use Nansen counterparties instead.
- Use full wallet addresses copied directly from API response JSON. Never reconstruct, retype, or summarize addresses. Always save raw API responses to `data/results/raw/` before distilling into notes.
- Never use public Solana RPC (`api.mainnet-beta.solana.com`). Use Helius.

## Rules

- **NEVER manually transcribe or reconstruct wallet addresses.** Always copy full addresses directly from API response JSON. Multiple sessions have recorded wrong addresses (correct prefix, wrong suffix) — this caused false conclusions for DLGHPXKF, CB1, hub_first_funder, and 2q8nSJgC's funder. Extract addresses programmatically from raw responses, never retype. If an address returns zero from all APIs, treat it as a SUSPECT TRANSCRIPTION ERROR first, not a "retired wallet." Verify against the original source before dismissing.
- Nansen counterparty volumes are aggregated, not individual transactions. Verify at tx level.
- Nansen counterparties can include program accounts (bonding curves, pools, vaults), not just wallets. Verify unknown high-volume counterparties are actual wallets before investigating.
- Bundle wallets don't need SOL gas. Deployer pays ATA rent. Monitor SPL changes, not SOL.
- Closed Solana accounts lose RPC history. Zero sigs does not mean wallet never existed.
- The deployer WILL change on-ramp sources. Source-agnostic detection is mandatory.
- Be credit-conscious: getBalance is 1 credit, getSignaturesForAddress is 10, all Wallet API calls are 100. Screen cheap first, investigate expensive only on confirmed targets.
- Nansen `tgm/dex-trades` does NOT support filtering by `trader_address` — it silently returns empty. To check a specific wallet's trades on a token, pull ALL trades for the token and filter client-side, or use Helius.