# HANDOFF — Read Me First

**Purpose:** Entry point for a Claude session on a fresh machine with zero prior context. Read this before taking any action.

**Written:** 2026-04-16 (supersedes 2026-04-15 two-repo version)

---

## 1. Who You Are

You are a Senior Blockchain Forensics Investigator and TypeScript developer. Goal: catch a serial pump.fun deployer's next fresh wallet (L11) after it gets funded but before `create_and_buy` fires, so the user can feed it to Bloom bot for a block-0 snipe.

Investigation phase is **done**. The operational monitor needs to be **built from scratch** inside this repo (`investigation/`). A prior attempt in a sibling repo was discarded on 2026-04-16.

## 2. Single Repo

Everything lives in this directory. One `.git/`, one `.env`, one GitHub remote: `git@github.com:Afterthoughtt/deployer-investigation.git`.

When the monitor is built, it goes under `investigation/src/monitor/` and reads `data/network-map.json` directly (no cross-repo snapshot).

## 3. Where to Start

Read in order:
1. `CLAUDE.md` — project brief, rules, API conventions.
2. `STRATEGY.md` — L11 detection plan (three vectors: MoonPay sieve, network intermediary watch, copy-trade backup).
3. `data/network-map.json` — canonical wallet registry (~147 wallets).
4. `data/launch-history.json` — 10-launch behavioral profile + timeline.

`docs/helius_docs.md`, `docs/nansen_docs.md`, `docs/arkham_docs.md` are the API references used while building.

## 4. Critical Rules (Non-Negotiable)

These have all cost the user time in the past. Read carefully.

- **NEVER retype wallet addresses.** Always copy from JSON files or API response bodies. Multiple prior sessions recorded wrong addresses (correct prefix, wrong suffix) for CB1, hub_first_funder, FKjuwJzH, and 2q8nSJgC's funder. This is the single highest-cost recurring mistake in this project. If an address must appear in code, load it from JSON (`JSON.parse` or `grep`).

- **`.env` key names** (note the spelling):
  - `HELIUS_API_KEY`
  - `NANSEN_API_KEY`
  - `ARKAN_API_KEY` — spelled **ARKAN**, not ARKHAM. Intentional.

- **Never use public Solana RPC** (`api.mainnet-beta.solana.com`). Always Helius.

- **Nansen counterparties can be program accounts or ATAs**, not just wallets. DLGHPXKF and E2NnJHhc looked like OG deployer counterparties but were actually its WSOL ATAs. Before profiling a counterparty: parse a transaction involving it, check who's the fee payer/signer, verify `isUserAddress` via Arkham. If the address is never a signer, it's not a wallet.

- **Nansen `tgm/dex-trades` does NOT support filtering by `trader_address`.** It silently returns empty. To check a specific wallet's trades on a token, pull ALL trades and filter client-side, or use Helius.

- **Nansen labels endpoint costs 500 credits per call** — avoid unless critical.

- **BigInt for all lamport and token threshold math.** JS number precision is unsafe at edge amounts. Store thresholds as strings and parse to BigInt on load.

- **Helius credit discipline**: `getBalance` = 1 credit, `getSignaturesForAddress` = 10, `getTransaction` = 10, all Wallet API calls = 100. Screen cheap first. Batch identity lookups (up to 100 addresses per 100-credit call) are the most efficient identification method.

## 5. Load-Bearing Facts (Not Obvious from the Repo)

- **BqP79Wmk** (`BqP79WmkKFRytsrWCqY2ra4n5XzUxQjTf45rHy7rkgtC`) is the deployer's personal trading wallet. Trades all 9 deployer tokens across all 10 launches ($240K+ total volume). Funded by GoonPump (`231fshU82vSSeyytyCZJUEUG8Ti3UAgnDSoNFGTETCuK`). Currently 0 SOL — re-funding from GoonPump is a launch-imminent signal. Pipeline: MoonPay/Bitget → GoonPump → BqP79Wmk → Crypto.com Deposit → Crypto.com.

- **MP2** (`5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1`) was discovered 2026-04-03 via RXRP repump funder chain tracing. Separate supply chain from MP1 — funded by Binance 8, not by MP4 (Bitstamp/FalconX). Two earlier searches missed it because it doesn't appear in MP4's outflows. **Both MP1 and MP2 must be monitored for L11.**

- **MP1 USDC ATA** (`4FoRA1uLBcE31TC799djhLt3rqpGuh2gV9C5KdvLgUPg`) is the USDC fallback path. If the deployer buys USDC via MoonPay instead of SOL, the USDC arrives from this ATA (not MP1/MP2 directly), and the recipient then swaps USDC → SOL on a DEX before deploying. Monitor for $1K-3.5K USDC outflows to fresh wallets. Lower likelihood than SOL path, but would bypass the SOL sieve entirely if used.

- **CB1/2/5/7/8** wallets in `data/network-map.json` were corrected 2026-03-24 after transcription errors. Trust what's in the JSON now.

- **CoinSpot L10 "bought 1 second after deploy ($11,815 volume)"** claim is UNVERIFIED — no raw data backs it. May instead receive tokens via bundle (wallet `4916NkdubkfRyHkxkCR7rpVGz5dvzVdK161mg4jXDwRh` from Bundle 1) rather than open market buy. Flag if anyone cites it as confirmed.

- **Pump.fun program ID**: `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`. Instruction to detect: `create_and_buy`.

- **Deployer behavioral fingerprint**: 30-35% supply purchased, 8.09-14.81 SOL spent from fresh wallet (range widened to 8-25 for safety), 12-17h funding-to-deploy gap (max observed 26h), deploy window 18:00-23:43 UTC, XRP-themed memecoin naming.

- **1 unresolved wallet**: 7QJM8rXX (2 network overlaps, MEXC-funded — ambiguous). Needs follow-up during monitor build.

- **`max_prior_signatures: 1` is correct**, not 0. The funding transaction itself creates a signature on the recipient address. A truly fresh wallet on its first incoming transfer has exactly 1 prior sig, not 0.

- **User is in PDT (UTC-7).** Plan sessions accordingly.

## 6. Setup Checklist (New Machine)

1. Clone: `git clone git@github.com:Afterthoughtt/deployer-investigation.git investigation && cd investigation`.
2. Install Node v24+ (required for native WebSocket support if the monitor uses it).
3. Create `.env` with: `HELIUS_API_KEY`, `NANSEN_API_KEY`, `ARKAN_API_KEY`. Copy values from the old machine's `.env` or generate fresh keys at the providers.
4. If/when the monitor uses Telegram alerting: also add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. Create the bot via `@BotFather` on Telegram (user action — cannot be automated). To get the chat ID: message the new bot, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` and find `"chat":{"id":...}`.
5. Install deps: `npm install`.

## 7. Deadlines

- **L11 launch window: April 20-30, 2026** (community intel).
- **Monitor must be armed-capable by April 19, 2026.**
- As of 2026-04-16, that means design + build + verify in ~3 days.

## 8. Your Next Action

Design and build the L11 monitor inside `investigation/src/monitor/`. Architecture (polling vs. webhooks vs. WebSocket, alerting mechanism) is still to be decided — see STRATEGY.md §Architecture and start a brainstorm session with the user.

---

## Key Files Index

- `CLAUDE.md` — project brief, rules, API conventions.
- `STRATEGY.md` — L11 detection strategy, three vectors.
- `data/network-map.json` — canonical wallet registry (~147 wallets).
- `data/launch-history.json` — 10-launch behavioral profile.
- `data/launch-details.json` — per-launch deployer flows + early buyers.
- `data/rxrp-repump-buyers.json` — RXRP repump buyer sequence.
- `data/results/` — investigation-notes, cross-reference, batch-screen, deep-dive, rxrp-repump screening.
- `src/audit/` — TypeScript audit scripts (`utils.ts`, `batch-screen.ts`, `deep-dive.ts`, `moonpay-search.ts`, `rxrp-repump-screen.ts`).
- `src/monitor/` — (to be created) L11 operational monitor.
- `docs/` — API references for Helius, Nansen, Arkham.
- `archive/` — 37 completed scripts + 28 raw API response dumps.
