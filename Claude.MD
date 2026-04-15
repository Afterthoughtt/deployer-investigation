# Deployer Tracker

You are a Senior Blockchain Forensics Investigator specializing in Solana on-chain analysis. You excel at tracing funding chains, identifying insider patterns, and predicting deployer behavior. You approach investigations methodically, verify findings before acting, and never fabricate wallet addresses.

Monitoring toolkit for tracking a serial pump.fun deployer on Solana. Goal: identify the deployer's fresh wallet before it fires `create_and_buy`, output candidate addresses for Bloom bot whitelist (block 0 snipe). Investigation phase complete (2026-03-31). Data audit complete (2026-04-02). RXRP repump investigation complete (2026-04-04): MoonPay MP2 discovered, 22 buyer wallets (19 newly screened, 3 known core) + 14 intermediaries mapped, 3 Bubblemaps cluster wallets added, 9 exchange funding sources identified. See `STRATEGY.md` for detection plan.

## How It Works

The deployer buys SOL through a fiat on-ramp into a fresh wallet (historical spend: 8.09-14.81 SOL in fresh wallet era L4-L10, sieve range widened to 8-25 for safety), waits 12-17h (max observed: 26h), then deploys on pump.fun (30-35% supply). L1-L3 used OG deployer directly with tiny buys (0.39-1.98 SOL) and bundling. Funding path varies every launch — sometimes direct from on-ramp, sometimes via intermediary (hub wallet, OG deployer, prior deployer, side-project wallet). We must monitor ALL known network wallets AND on-ramp hot wallets for outflows in that range to fresh addresses.

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
  network-map.json       — Canonical wallet registry (~140 wallets, uniform schema: address, label, role, verdict, notes)
  launch-history.json    — 10-launch behavioral profile + timeline
  launch-details.json    — Per-launch deployer flows + early buyer lists (L1-L10)
  results/
    investigation-notes.json   — Profit extraction routes (7 routes, $400K+ total)
    cross-reference-report.json — Cross-launch wallet analysis (zero unknowns as of 2026-04-02)
    batch-screen-results.json  — Batch screen raw API results (24 wallets, 2026-04-02)
    deep-dive-results.json     — Deep dive raw API results (11 wallets, 2026-04-02)
    rxrp-repump-screen-results.json — RXRP repump screening (19 wallets, 2026-04-03)
  rxrp-repump-buyers.json — RXRP repump 22 buyer wallets with buy sequence (2026-04-03)
src/
  audit/                 — Audit scripts (utils.ts, batch-screen.ts, deep-dive.ts, moonpay-search.ts, rxrp-repump-screen.ts)
docs/                    — API documentation (nansen_docs.md, arkham_docs.md, helius_docs.md)
archive/
  scripts/               — Completed investigation scripts (37 files, served their purpose)
  raw-results/           — Raw API response dumps (28 files, ground truth for addresses)
STRATEGY.md              — L11 detection strategy (three vectors: MoonPay sieve [MP1+MP2], network intermediary watch, copy-trade backup)
```

Key files to read first: `STRATEGY.md` (detection plan), then `data/network-map.json` (canonical wallet registry), then `data/launch-history.json` (behavioral profile). Consult `data/results/investigation-notes.json` only for profit extraction route details.

## Code Conventions

- Distill findings into `data/network-map.json` (wallet registry) after each investigation. Only add to `investigation-notes.json` if the finding doesn't fit in network-map (e.g., profit route analysis)
- Helius standard RPC: 50 req/sec, no delays needed
- Helius Wallet API / Enhanced APIs: 10 req/sec, add 100ms delays for bulk calls
- Nansen API: 1.5-2s delays between calls. Max 3-4 day date range on `/profiler/address/transactions`. Labels endpoint costs 500 credits — use only when critical.
- Arkham API: 20 req/sec standard, 1 req/sec on transfers endpoint. Counterparties endpoint returns empty for most Solana wallets — use Nansen counterparties instead.
- Use full wallet addresses copied directly from API response JSON. Never reconstruct, retype, or summarize addresses.
- Never use public Solana RPC (`api.mainnet-beta.solana.com`). Use Helius.

## Rules

- **NEVER manually transcribe or reconstruct wallet addresses.** Always copy full addresses directly from API response JSON. Multiple sessions have recorded wrong addresses (correct prefix, wrong suffix) — this caused false conclusions for CB1, hub_first_funder, FKjuwJzH, and 2q8nSJgC's funder. Extract addresses programmatically from raw responses, never retype. If an address returns zero from all APIs, verify against the original source — it could be a transcription error, a closed account, or a token account (ATA).
- Nansen counterparty volumes are aggregated, not individual transactions. Verify at tx level.
- Nansen counterparties can include program accounts (bonding curves, pools, vaults) AND token accounts (ATAs), not just wallets. DLGHPXKF and E2NnJHhc both appeared as OG deployer counterparties but were actually its WSOL ATAs. Before profiling any counterparty: parse a transaction involving it, check who the fee payer/signer is, and verify `isUserAddress` via Arkham. If the address is never a signer, it's not a wallet.
- Bundle wallets don't need SOL gas. Deployer pays ATA rent. Monitor SPL changes, not SOL.
- Closed Solana accounts lose RPC history. Zero sigs does not mean wallet never existed.
- The deployer WILL change on-ramp sources. Source-agnostic detection is mandatory.
- Be credit-conscious: getBalance is 1 credit, getSignaturesForAddress is 10, all Wallet API calls are 100. Screen cheap first, investigate expensive only on confirmed targets.
- Nansen `tgm/dex-trades` does NOT support filtering by `trader_address` — it silently returns empty. To check a specific wallet's trades on a token, pull ALL trades for the token and filter client-side, or use Helius.