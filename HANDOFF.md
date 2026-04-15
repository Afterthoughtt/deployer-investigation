# HANDOFF — Read Me First

**Purpose:** This file is the entry point for a Claude session on a fresh machine with zero prior context or memory. Read it top-to-bottom before taking any action.

**Written:** 2026-04-15 (project state snapshot)

---

## 1. Who You Are

You are a Senior Blockchain Forensics Investigator and TypeScript developer. Goal: catch a serial pump.fun deployer's next fresh wallet (L11) after it gets funded but before `create_and_buy` fires, so the user can feed it to Bloom bot for a block-0 snipe.

Investigation phase is **done**. Operational monitor build is **in progress**.

## 2. Two Directories, Two Repos

Both are siblings under `~/Desktop/` on the user's machine. Each has its own `.git/`. Neither is nested inside the other.

| Dir | Role | Status |
|-----|------|--------|
| `investigation/` (this one) | Frozen research archive — ~147 wallets mapped, strategy doc, audit scripts | Has 13 days of uncommitted work as of 2026-04-15, see section 7 |
| `../l11-monitor/` | Active operational build — standalone TypeScript project | Clean working tree, Phases 0-1 complete |

**Both repos must be cloned on the new machine.** They transfer independently — push and pull each separately.

## 3. Where the Build Is

Read these in order on the first session after clone:

1. `../l11-monitor/PROGRESS.md` — live phase tracker with commit hashes and per-phase checklists
2. `../l11-monitor/PLAN.md` — full architecture, data flows, design rationale
3. `../l11-monitor/README.md` — user-facing setup + keyboard controls

Snapshot as of 2026-04-15:
- Phase 0 scaffold — complete (commit `2fb20b5`)
- Phase 1 core standby polling — complete (commit `c4cc5e3`)
- Phase 2 alerts (Telegram + terminal) — NEXT
- Phase 3 armed mode (WebSocket) — pending
- Phase 4 pump watcher (detect `create_and_buy`) — pending
- Phase 5 polish + verification — pending

## 4. Cross-Directory Coupling Contract

Important — this is how the two dirs relate:

- **At RUNTIME**, `l11-monitor/` reads only its own `config/*.json`. It never opens a file in `investigation/`.
- `l11-monitor/config/known-addresses.json` is a **one-time snapshot** (86 addresses, captured 2026-04-12) of `investigation/data/network-map.json`. If the investigation data changes, the snapshot must be regenerated manually by the user. There is no automatic sync.
- `l11-monitor/config/watchlist.json` addresses were transcribed once from `investigation/STRATEGY.md` during Phase 0 scaffold. When adding wallets, copy-paste from the source JSON — never retype.
- **At DEVELOPMENT time**, Claude working in `l11-monitor/` may read `../investigation/STRATEGY.md`, `../investigation/data/network-map.json`, `../investigation/docs/*.md` for context.

## 5. Critical Rules (Non-Negotiable)

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

- **BigInt for all lamport and token threshold math.** JS number precision is unsafe at edge amounts. Config stores thresholds as strings and parses to BigInt on load.

- **`max_prior_signatures: 1` is correct**, not 0. The funding transaction itself creates a signature on the recipient address. A truly fresh wallet on its first incoming transfer has exactly 1 prior sig, not 0.

- **Helius credit discipline**: `getBalance` = 1 credit, `getSignaturesForAddress` = 10, `getTransaction` = 10, all Wallet API calls = 100. Screen cheap first. Batch identity lookups (up to 100 addresses per 100-credit call) are the most efficient identification method.

## 6. Load-Bearing Facts (Not in the Repos)

These are captured only in auto-memory on the old machine, and need to live here so they transfer.

- **BqP79Wmk** (`BqP79WmkKFRytsrWCqY2ra4n5XzUxQjTf45rHy7rkgtC`) is the deployer's personal trading wallet. Trades all 9 deployer tokens across all 10 launches ($240K+ total volume). Funded by GoonPump (`231fshU82vSSeyytyCZJUEUG8Ti3UAgnDSoNFGTETCuK`). Currently 0 SOL — re-funding from GoonPump is a launch-imminent signal. Pipeline: MoonPay/Bitget → GoonPump → BqP79Wmk → Crypto.com Deposit → Crypto.com.

- **MP2** (`5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1`) was discovered 2026-04-03 via RXRP repump funder chain tracing. Separate supply chain from MP1 — funded by Binance 8, not by MP4 (Bitstamp/FalconX). Two earlier searches missed it because it doesn't appear in MP4's outflows. **Both MP1 and MP2 must be monitored for L11.**

- **MP1 USDC ATA** (`4FoRA1uLBcE31TC799djhLt3rqpGuh2gV9C5KdvLgUPg`) is the USDC fallback path. If the deployer buys USDC via MoonPay instead of SOL, the USDC arrives from this ATA (not MP1/MP2 directly), and the recipient then swaps USDC → SOL on a DEX before deploying. Monitor for $1K-3.5K USDC outflows to fresh wallets. Lower likelihood than SOL path, but would bypass the SOL sieve entirely if used.

- **CB1/2/5/7/8** wallets in `investigation/data/network-map.json` were corrected 2026-03-24 after transcription errors. Trust what's in the JSON now.

- **CoinSpot L10 "bought 1 second after deploy ($11,815 volume)"** claim is UNVERIFIED — no raw data backs it. May instead receive tokens via bundle (wallet `4916NkdubkfRyHkxkCR7rpVGz5dvzVdK161mg4jXDwRh` from Bundle 1) rather than open market buy. Flag if anyone cites it as confirmed.

- **Pump.fun program ID**: `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`. Instruction to detect: `create_and_buy`.

- **Deployer behavioral fingerprint**: 30-35% supply purchased, 8.09-14.81 SOL spent from fresh wallet (range widened to 8-25 for safety), 12-17h funding-to-deploy gap (max observed 26h), deploy window 18:00-23:43 UTC, XRP-themed memecoin naming.

- **1 unresolved wallet**: 7QJM8rXX (2 network overlaps, MEXC-funded — ambiguous). Needs Phase 2 follow-up.

- **User is in PDT (UTC-7).** Plan sessions accordingly.

## 7. Investigation Repo State

Committed and pushed as of 2026-04-15. Most recent commit on `main`:

- `a957314` — RXRP repump investigation: MP2 discovery + 22 buyer wallets mapped
- `fbd38a9` — Update CLAUDE.md: reflect audit completion, add src/audit and results files
- `eb59807` — Remove completed audit spec and plan
- `6eb44a7` — Update data files with audit findings: all unknowns triaged, labels updated

Remote: `git@github-afterthoughtt:afterthoughtt/deployer-investigation.git`

`.DS_Store` is now gitignored. Working tree is clean except for this HANDOFF.md (about to be committed).

## 8. Setup Checklist (New Machine)

1. Clone both repos: `investigation/` and `l11-monitor/` under `~/Desktop/` (or anywhere sibling to each other).
2. Install Node v24+ (native WebSocket is used in l11-monitor/ Phase 3 — no `ws` npm package).
3. Create `investigation/.env` with: `HELIUS_API_KEY`, `NANSEN_API_KEY`, `ARKAN_API_KEY`. Copy values from old machine or generate fresh keys at the providers.
4. Create `l11-monitor/.env` with: `HELIUS_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
5. **Telegram bot does NOT yet exist.** Blocker for Phase 2. User action required: message `@BotFather` on Telegram → `/newbot` → follow prompts → copy bot token. Then message the new bot once, visit `https://api.telegram.org/bot<TOKEN>/getUpdates`, find `"chat":{"id":...}`. Add both to `l11-monitor/.env`.
6. Install monitor deps: `cd l11-monitor && npm install`.
7. Smoke test: `cd l11-monitor && npx tsx src/index.ts` — should poll the 15 watchlist wallets in standby mode. Clean SIGINT (Ctrl+C) to quit. Expected cost: ~15 credits per cycle.

## 9. Deadlines

- **L11 launch window: April 20-30, 2026** (community intel via `/Users/error/Desktop/l11-monitor/PROGRESS.md`).
- **Monitor must be fully armed-capable by April 19, 2026.**
- As of 2026-04-15, that means Phases 2, 3, 4, 5 must land in ~4 days.

## 10. Your Next Action

1. Open `../l11-monitor/PROGRESS.md` and find the Phase 2 checklist.
2. Confirm Telegram bot setup is done (section 8 above). If not, pause and let the user create it.
3. Begin `l11-monitor/src/alerts.ts`: Telegram bot HTTP client + terminal formatter extraction from `index.ts`. Per-phase details are in PROGRESS.md and PLAN.md.
4. After each phase completes, update PROGRESS.md checkboxes and commit.

---

## Key Files Index

**investigation/ (this dir):**
- `STRATEGY.md` — L11 detection strategy, three vectors
- `Claude.MD` — project brief, rules, API conventions
- `data/network-map.json` — canonical wallet registry (~147 wallets)
- `data/launch-history.json` — 10-launch behavioral profile
- `data/launch-details.json` — per-launch deployer flows + early buyers
- `data/rxrp-repump-buyers.json` — RXRP repump buyer sequence (untracked — commit before transfer)
- `data/results/` — investigation-notes, cross-reference, batch-screen, deep-dive, rxrp-repump screening
- `src/audit/` — TypeScript audit scripts (`utils.ts`, `batch-screen.ts`, `deep-dive.ts`, `moonpay-search.ts`, `rxrp-repump-screen.ts`)
- `docs/` — API references for Helius, Nansen, Arkham
- `archive/` — 37 completed scripts + 28 raw API response dumps

**l11-monitor/ (sibling dir):**
- `PLAN.md` — full implementation plan with architecture and design rationale
- `PROGRESS.md` — live phase tracker (read this first when continuing the build)
- `README.md` — user-facing setup + keyboard controls
- `docs/helius.md`, `docs/telegram.md` — runtime API refs
- `config/watchlist.json` — 15 wallets to monitor + thresholds (editable, restart to apply)
- `config/known-addresses.json` — 86-address exclusion list, snapshot from investigation/data/network-map.json
- `src/` — 9 TypeScript modules: `types.ts`, `config.ts`, `rpc.ts`, `state.ts`, `logger.ts`, `parser.ts`, `evaluator.ts`, `poller.ts`, `index.ts`
- `data/candidates.json` — runtime log, gitignored, created on first candidate
