# L11 Monitor — Build Plan

## Purpose

Build a persistent daemon that detects the deployer wallet funding event before launch and pushes a Telegram alert so the wallet can be whitelisted in Bloom bot for block-0 execution.

**The daemon's only job is pre-launch wallet identification.** Once the candidate is whitelisted in Bloom, the daemon's role is done. It does not detect deploys, track launches, or do post-launch reporting. Those are too late to be useful.

L10 was missed because no monitor was running at the time. We built this from scratch ahead of L11. **L11 confirmed 2026-04-20 (operator intel): token name Nukex, Saturday April 25 2026, 14:00–18:00 EST deploy window.** Earlier community estimate of April 20–30 now narrowed to this date. Designed source-agnostic across fiat on-ramps so the deployer can't dodge us by switching providers (as they did from Coinbase → MoonPay between L9 and L10).

Wallet map, deployer history, insider networks, and API docs are all in this repo. Read them before writing code. Do not re-derive what is already documented.

---

## Implementation status (2026-04-24)

**Live on VPS** (`l11@143.198.12.56:/opt/l11-monitor`, systemd-managed, 4.4-day uptime, 0 crashes since last deploy):

- Increments 1–11: config loader, SQLite schema + WAL, wallets.json sync, Helius Enhanced WSS, reconnect + backfill, candidate detection + tiering, DB persistence + dedup, Grammy bot, commands, candidate alerts, staleness monitor + `/health` HTTP + heartbeat
- `/health` Telegram command + end-to-end selfcheck; proactive WS-down + RPC-failure alarms with recovery
- Production hardening PH1a–PH6 (commit `5335ae2`, deployed 2026-04-19): Telegram auto-retry + throttler, `/candidates` truncation guard, startup replay + schema migration for un-alerted candidates, heartbeat WS-state line, startup `🟢` prefix, `/unreject` + `/unwhitelist`
- 23 monitored wallets (reviewed 2026-04-18): MP1, MP2, v49 hub, 20 intermediaries

**Current operational state (2026-04-24):** 133 `status='detected'` candidates awaiting triage; all have `alert_sent_at` populated; `ignore_list` empty. DB clean: no NULL violations, no duplicate addresses or signatures. `/health` green.

**Post-L11 backlog:**
- PH7 (`/wallets`) and PH8 (`/stats`) — OPTIONAL commands, not started.
- Two open `/audit` findings (2026-04-19) deferred as launch-week risk:
  - Unit test locking the `sendCandidateAlert` rejection → `markAlertSent` NOT called contract that PH3 replay depends on.
  - Burst cap on PH3 startup replay (`index.ts:200-229`). Throttler already paces, but a `.slice(0, 50)` + warn log is cheap hardening.
- Revert `STALE_THRESHOLD_MS=900000` on `/opt/l11-monitor/.env` to the documented 2h default after L11 launches.

---

## How to work on this codebase

### Build in small, runnable increments

One component at a time. Run it, verify it works end-to-end with real output, then move to the next. Every increment must be runnable on its own.

### Stop and verify after every increment

Run the thing. Show the output. Confirm it matches expectation before continuing.

If a step depends on live data, use real data. Do not mock Helius or Telegram.

### Know how to start and run the daemon end-to-end

```bash
# Local development (from repo root)
npm run monitor:dev

# Build compiled JS into monitor/dist/
npm run monitor:build

# Run compiled daemon (what systemd invokes)
npm run monitor:start

# Production on the VPS
systemctl start l11-monitor
systemctl status l11-monitor
journalctl -u l11-monitor -f
```

Runtime deps and scripts live in the root `package.json`. Monitor-only compile settings live in `monitor/tsconfig.json`. If you add a new dependency, new env var, or new build step, update the run instructions in this document and confirm the daemon still starts cleanly.

### Do not over-engineer

- No abstract base classes, factories, or DI frameworks. This is a single-process daemon.
- No ORM. Raw SQL through better-sqlite3 prepared statements.
- No GraphQL, no tRPC, no Express. Grammy handles Telegram. A minimal `http.createServer` on localhost handles the health endpoint.
- No Docker unless it earns its place. Node + systemd is simpler.
- No MCP servers.
- **Divergence from original plan:** the plan said "no tests beyond the acceptance test". In practice we maintain small regression-test files (`monitor/test/*.ts`) for the state machines and DB helpers — they caught real bugs during increments 5–11 and are cheap to keep.

### Ask before assuming

If a wallet, API behavior, or threshold is unclear, stop and ask. Do not guess. The cost of being wrong is a missed launch. The cost of asking is 30 seconds.

### Full wallet addresses, always

Never reconstruct a wallet address from a truncated prefix. Copy full addresses directly from raw API responses or from the repo's wallet map (`data/network-map.json`). Address suffix fabrication has caused real errors on this project before.

---

## Stack

- Node.js 20 LTS
- tsx for dev execution
- TypeScript, strict mode
- better-sqlite3 with WAL mode
- grammy for Telegram (1.42.0) + `@grammyjs/auto-retry` 2.0.2 + `@grammyjs/transformer-throttler` 1.2.1
- Helius Developer plan ($24.50/mo): Enhanced WSS `transactionSubscribe` with `accountInclude` filter, plus RPC for backfill
- dotenv for config (reads the single root `.env`)
- systemd for process management (no pm2)

**Divergence from original plan:** the plan listed `pino` for structured logging. Current code uses a minimal `console.log`-based `Logger` interface (`monitor/src/util.ts`). Sufficient for single-user journalctl tailing; pino was never added.

Packaging: one root `package.json` at the repo root covers runtime + dev deps for both audit scripts and monitor. Monitor sources live in `monitor/src/` with `monitor/tsconfig.json` for scoped compilation into `monitor/dist/`. No separate `monitor/package.json`, no separate `monitor/.env`. (Originally planned as a self-contained package 2026-04-16; consolidated 2026-04-17 after realizing the audit side had no runtime deps worth separating.)

**Credit budget (Helius Developer plan, 10M credits/month):** observed burn ~1–3K credits/day during normal operation. Enhanced WS data streaming at 3 credits / 0.1 MB; 23 monitored wallets produce well under the estimated 50–100 MB/day. Reconnect-backfill (`getSignaturesForAddress` at 10 credits, `getTransaction` at 10 credits) adds margin. Normal-day operation leaves >100x headroom. Track actual burn on the Helius dashboard, not programmatically.

Deployment target (confirmed): DigitalOcean Premium Droplet (Intel 2 vCPU / 4GB / 120GB NVMe), NYC3, Ubuntu 24.04.3 LTS, IPv4 `143.198.12.56`. Hardening: ufw, fail2ban, SSH key only.

---

## Architecture

### High level

```
[Helius Enhanced WSS] --events--> [Daemon] --writes--> [SQLite]
                                    |
                                    v
                              [Grammy Bot] <--commands-- [Telegram]
                                    |
                                    +--pushes--> [Telegram chat]
```

Single process. One writer to SQLite. One WebSocket connection. One Grammy long-polling loop.

### Data flow

1. `transactionSubscribe` with `accountInclude: [on-ramp wallets, hub wallets, intermediary wallets]` — every address from `wallets.json` regardless of category
2. Incoming tx parsed: identify outflow recipient, SOL amount, source wallet
3. Filter: if source is monitored, amount is 8-25 SOL, recipient is fresh (≤1 prior signature), recipient is not in the ignore list, recipient is not already a candidate — create candidate
4. SQLite write, Telegram alert with inline buttons
5. User taps Whitelist in Telegram, then manually pastes address into Bloom bot
6. Daemon marks candidate `whitelisted` in SQLite

That's the full loop. Nothing after step 6 is the daemon's concern.

### Reconnect and backfill

WebSockets drop. The daemon:
- Reconnects with exponential backoff (start 1s, cap 60s, reset on successful subscribe confirmation)
- Re-registers all subscriptions on reconnect
- Tracks `last_processed_signature` per monitored address in SQLite (MAX-slot semantics)
- On reconnect, for each monitored address:
  - Calls `getSignaturesForAddress` with `until: last_processed_signature` to get missed signatures (up to 10 pages × 1000 sigs)
  - For each missed signature, calls `getTransaction` to fetch the full parsed tx
  - Runs through the same candidate detection logic as live events (shared handler)
  - Updates `last_processed_signature` as events flow
- Deduplicates candidates via the `candidates.address` UNIQUE constraint and an in-memory `alreadyCandidates` set rebuilt from the `candidates` table at startup. The `events` table records each persisted funding tx by signature (PK) as an audit trail, so the same sig re-arriving via WS + backfill can't produce two event rows either.

**New-wallet bootstrap policy:** when a wallet is added to `wallets.json` for the first time (no row in `monitored_wallets`), the daemon goes **forward-only** for that wallet — it does NOT backfill historical signatures. We're predicting future funding events, not retro-detecting past ones. Backfill applies only to existing wallets that were watched before a disconnect.

### Health self-check

Track `last_event_received_at` per wallet category. **Only the on-ramp category drives the staleness alarm:** if no on-ramp wallet has produced an event in 2 hours, push a Telegram warning. On-ramp hot wallets (MoonPay, Coinbase) globally always have traffic in any 2-hour window — silence means our subscription is broken. Hub and intermediary wallets can sit idle for days legitimately, so they do not gate the alarm.

Expose `GET /health` on 127.0.0.1 only. Returns 200 if WebSocket connected and at least one on-ramp event received in last 2 hours, else 503.

Separately, the `/health` Telegram command runs an interactive 5-probe selfcheck (SQLite read, Helius RPC `getBalance` on MP1, WS freshness < 5min, detection synthetic, Telegram alert pipe) — see Telegram interface below.

---

## Detection logic

### Candidate criteria

A wallet becomes a candidate when ALL of:
- Source is a monitored on-ramp wallet OR a monitored hub/intermediary wallet
- Outflow amount is between 8 and 25 SOL (8_000_000_000 to 25_000_000_000 lamports)
- Recipient wallet has ≤ 1 prior signature (the funding tx itself counts as 1 — equivalent to "0 prior history before this tx")
- Recipient wallet not in the ignore list (trading bot infrastructure etc)
- Recipient wallet not already present in SQLite with any status

### Confidence tiering (simple, rules-based)

- **HIGH:** amount 12-18 SOL, source is a clean on-ramp (MoonPay or Coinbase), recipient has exactly 1 prior signature
- **MEDIUM:** amount 8-25 SOL, source is any on-ramp, recipient has ≤ 1 prior signature
- **LOW:** amount 8-25 SOL, source is a hub or intermediary (noisy)

All tiers push to Telegram. Emoji reflects confidence. The user decides what to do with each.

### USDC flows

For v1, ignore USDC transfers entirely. Only process native SOL outflows. The L10 funding was SOL from MoonPay, and the historical pattern is SOL across all 10 launches.

If L11 deploys without our SOL alert firing, the deployer may have used MoonPay's USDC path. The MoonPay USDC ATA is `4FoRA1uLBcE31TC799djhLt3rqpGuh2gV9C5KdvLgUPg`. v2 work would add it to the watch list and extend detection to cover SPL transfers of $1,000-3,500 USDC to fresh wallets that then swap to SOL. Out of scope for v1.

---

## SQLite schema

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE monitored_wallets (
  address TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT NOT NULL,             -- 'onramp' | 'hub' | 'intermediary'
  added_at INTEGER NOT NULL,           -- epoch ms UTC
  last_processed_signature TEXT,
  last_processed_slot INTEGER
);

CREATE TABLE candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT UNIQUE NOT NULL,
  funded_amount_sol REAL NOT NULL,
  funding_source TEXT NOT NULL,        -- source wallet address
  funding_source_label TEXT,           -- 'MoonPay', 'Coinbase', etc
  funding_signature TEXT NOT NULL,
  funding_slot INTEGER NOT NULL,
  funding_timestamp INTEGER NOT NULL,  -- epoch ms UTC
  confidence TEXT NOT NULL,            -- 'HIGH' | 'MEDIUM' | 'LOW'
  status TEXT NOT NULL,                -- 'detected' | 'whitelisted' | 'rejected'
  detected_at INTEGER NOT NULL,        -- epoch ms UTC
  whitelisted_at INTEGER,              -- epoch ms UTC
  rejected_at INTEGER,                 -- epoch ms UTC
  alert_sent_at INTEGER,               -- PH3: epoch ms UTC, NULL if alert never sent (replay on next boot)
  prior_sig_count INTEGER              -- PH3: priorSigCount at detection, for faithful replay formatting
);

CREATE TABLE ignore_list (
  address TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  added_at INTEGER NOT NULL            -- epoch ms UTC
);

CREATE TABLE events (
  signature TEXT PRIMARY KEY,
  slot INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,          -- epoch ms UTC
  source_address TEXT NOT NULL,
  destination_address TEXT,
  amount_sol REAL,
  processed_at INTEGER NOT NULL        -- epoch ms UTC
);

CREATE INDEX idx_events_source ON events(source_address);
CREATE INDEX idx_events_dest ON events(destination_address);
CREATE INDEX idx_candidates_status ON candidates(status);
```

All timestamps are epoch milliseconds UTC, everywhere. Always.

Rejected candidates stay in the `candidates` table with `status='rejected'`. Their addresses are also added to `ignore_list` so the same wallet cannot be re-detected.

**PH3 migration note:** `alert_sent_at` and `prior_sig_count` are added to the live DB via `ALTER TABLE candidates ADD COLUMN …` inside `openDb` before any prepared statements are created. After the ALTER, `UPDATE candidates SET prior_sig_count = 1 WHERE prior_sig_count IS NULL` backfills existing rows (all historical detections had priorSigCount=1). New columns are nullable; rows created before PH3 ships get `alert_sent_at=NULL` and are replayed once on the first boot post-migration.

---

## Wallets.json — source of truth for monitored addresses

Committed at `monitor/data/wallets.json`. Loaded on daemon startup. Adding or removing wallets is a config change plus a daemon restart.

**Current committed set (23 wallets, reviewed and signed off 2026-04-18):**
- `onramps` (2): MoonPay MP1 + MP2
- `hubs` (1): `v49jgwyQy9zu4oeemnq3ytjRkyiJth5HKiXSstk8aV5`
- `intermediaries` (20): OG deployer `37XxihfsTW1EFSJJherWFRFWcAFhj4KQ66cXHiegSKg2` (1), L4–L10 prior fresh-wallet deployers (7), side funder `52eC8Uy5eFkwpGbDbXp1FoarxkR8MonwUvpm2WT9ni5B` (1), 10 RXRP Vector B wallets, plus CSEncqtq (CoinSpot Exchange Hot Wallet per `data/network-map.json`) placed here (LOW tier) rather than as on-ramp → 1+7+1+10+1 = 20
- `ignore`: initially empty; grows via `/reject`

**Divergences from original pre-deploy review:**
- **Coinbase Hot Wallets (CB1–CB10) deferred** per explicit user decision 2026-04-18. Rationale: confident L11 uses MoonPay given the L10 precedent (Coinbase → MoonPay switch between L9 and L10) plus 5 live MP candidates in a single day. If L11 uses Coinbase anyway, CBs can be added for L12.
- **Fireblocks `HVRcXaCFyUFG7iZLm3T1Qn8ZGDMHj3P3BpezUfWfRf2x` dropped** — only a 1-launch tie via L6 and very noisy.
- **CSEncqtq** placed in `intermediaries` (forces LOW tier) rather than as an on-ramp.

On daemon startup, `syncWalletsToDb` compares `wallets.json` to the `monitored_wallets` table. Insert new wallets (added_at=now), leave removed wallets in the table with no action (history preserved; they simply stop being subscribed). Subscribe filter is rebuilt from `wallets.json` every boot.

---

## Telegram interface

Single chat, hardcoded chat ID in env. Bot responds only to that chat (chat guard at `bot.ts:91-99` logs and drops any non-matching chat).

### Commands (registered via `bot.api.setMyCommands` on startup)

**Shipped:**
- `/status` — daemon uptime, WebSocket state + subscribe count, per-category last-event ages, active candidate count, mute state. In-memory + one SQL COUNT; no external calls.
- `/health` — end-to-end 5-probe liveness probe (SQLite read, Helius `getBalance` on MP1, WS connected + on-ramp freshness < 5min, detection synthetic payload, Telegram alert pipe). Burns ~1 Helius credit per invocation; do not loop.
- `/candidates` — list active candidates with tier emoji, id, confidence, amount, source label, age, address in `<code>` block, Solscan link per row. 4096-char truncation guard drops trailing rows in whole 4-line chunks and appends a `… and N more` footer.
- `/whitelist <id>` / `/unwhitelist <id>` — mark candidate whitelisted / undo. Unwhitelist is DB-only; does not unwind a Bloom paste.
- `/reject <id>` / `/unreject <id>` — mark candidate rejected + add to ignore_list / undo and remove from ignore_list.
- `/mute <duration>` / `/unmute` — parses `Ns`/`Nm`/`Nh`/`Nd` up to 7d cap; sets in-memory `muteUntil` that adds `disable_notification: true` to outbound pushes. In-memory only — restart clears.

**Post-L11 backlog (OPTIONAL):**
- PH7: `/wallets` — list monitored wallets grouped by category.
- PH8: `/stats` — candidate / event rollup counts.

### Candidate alert format

Address must be in a monospaced code block so it's one-tap copy on mobile for pasting into Bloom.

```
🟢 CANDIDATE DETECTED — C1

`2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB`

Amount: 13.443 SOL
Source: MoonPay MP1
Fresh: ✅ (1 prior sig)
Confidence: HIGH
```

Inline buttons via Grammy's `InlineKeyboard`:
```typescript
new InlineKeyboard()
  .text("✅ Whitelist", `wl:${candidateId}`)
  .text("❌ Reject", `rj:${candidateId}`)
  .url("🔍 Solscan", `https://solscan.io/account/${candidate.address}`);
```

Callback handlers on `wl:*` and `rj:*`. Acknowledge via `ctx.answerCallbackQuery()` immediately to dismiss the loading state.

**Research-button buttons (Bubblemaps / Nansen) considered and dropped:** Bubblemaps accepts wallet addresses but renders its cluster visualization from token-holder data — a priorSigCount=1 fresh wallet produces no actionable cluster. Nansen profiler on the same wallet has effectively no data. Would waste taps.

### Other pushes

- **Candidate whitelisted/rejected:** confirmation reply with address in `<code>` block again for convenience.
- **Stale on-ramp warning + recovery:** triggers when no on-ramp event received in `STALE_THRESHOLD_MS` (default 2h); recovery reports staleness duration.
- **WS-down warning + recovery:** sustained WS disconnect (>60s) pushes `⚠️ sendWsDownWarning`; `✅ sendWsRecovery` on next open. Flaps < 60s are silent.
- **RPC failure warning + recovery:** 5 consecutive `getSignaturesForAddress` failures (after `rpcCall`'s own 5-attempt retry with `Retry-After`) triggers `⚠️ sendRpcFailureWarning`; next successful call triggers `✅ sendRpcFailureRecovery`.
- **Daily heartbeat (`💓`):** uptime, WS state (`connected`/`disconnected`), active candidate count, per-category last-event ages. Cadence `HEARTBEAT_INTERVAL_MS` (default 24h).
- **Startup message:** `🟢` prefix + monitored-wallet count + existing-candidate count.

### Telegram 429 handling

`@grammyjs/auto-retry` retries 429s honoring `retry_after` (max 3 attempts, 30s cap). `@grammyjs/transformer-throttler` in front paces outbound sends so bursts (e.g., PH3 startup replay) don't produce 429s to begin with. Throttler-first, auto-retry-second ordering means retry attempts are themselves rate-limited.

---

## Configuration

Single `.env` at the **repo root** (`investigation/.env`), not committed. `.env.example` at the repo root is committed. The monitor loads it via an `import.meta.url`-resolved path, so cwd doesn't matter. In production systemd's `EnvironmentFile=` preloads `process.env` before launch.

Required env vars (monitor):
```
HELIUS_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Optional env vars (monitor):
```
DB_PATH=./data/l11.db                 # relative paths resolve from monitor/; absolute paths used as-is
LOG_LEVEL=info                        # trace | debug | info | warn | error | fatal
HEALTH_PORT=9479                      # loopback-only /health endpoint port
STALE_THRESHOLD_MS=7200000            # 2h — on-ramp silence that triggers stale alarm
STALENESS_CHECK_INTERVAL_MS=300000    # 5m — how often the staleness loop evaluates
HEARTBEAT_INTERVAL_MS=86400000        # 24h — daily Telegram heartbeat cadence
```

The staleness/heartbeat overrides exist so the timers can be dialed down (e.g. `STALE_THRESHOLD_MS=30000`) for local acceptance.

**VPS override in effect during L11 window (2026-04-19 → post-launch revisit):** `/opt/l11-monitor/.env` sets `STALE_THRESHOLD_MS=900000` (15 min) instead of the documented 2h default. Rationale: with L11 (Nukex) confirmed for Saturday April 25 2026 14:00–18:00 EST, the funding event is expected somewhere in the window April 24 16:00 UTC (26h max-gap floor) → April 25 11:00 UTC. A broken Helius subscription at T-6h is catastrophic — a 15-min page on true silence buys 105 extra minutes of response time vs. the 2h default. Cost: occasional false-positive pages during genuinely quiet MoonPay/Coinbase windows (US overnight + weekend lulls). Accept the noise through April 25, then revert to `7200000` after Nukex launches. `STALENESS_CHECK_INTERVAL_MS` stays at its 5m default.

The audit scripts also read this same `.env` for `NANSEN_API_KEY` and `ARKAN_API_KEY`. Those are NOT required for the monitor runtime.

On startup, the monitor validates its required env vars. Fail loudly if any missing. Missing audit keys are fine — the monitor never touches them.

---

## Acceptance test ✅ passed 2026-04-17

Replay the L10 funding event through the detection logic end-to-end.

**Pinned constants (verified on-chain via Helius RPC, 2026-04-16):**
- L10 deployer wallet: `2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB`
- Funding signature: `4hQpmGKE9irpwaEuzRL6kcK1c5uFGzfieaCAwXjvSSbLpUx4qGBKgZRpMvxuyspan7FrHEfNx8usvV9C6QS37UKu`
- Funder (MoonPay MP1): `Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6`
- Amount: 13.443 SOL (13,443,000,000 lamports)
- Slot: `406505247`
- blockTime: `1773550293` (2026-03-15 04:51:33 UTC)
- spl-memo on the tx: `7c61e6fde07f70c202784ed4c9884939` (likely MoonPay's internal reference — informational only, do NOT use for detection logic; on-chain memos are attacker-controllable per project rules)

Fixture captured to `monitor/test/fixtures/l10-rpc.json` via `capture-l10-fixture.ts`. `monitor/test/replay-l10.ts` runs 12 assertions and passes clean. Re-run after any detection change:

```bash
npx tsx monitor/test/replay-l10.ts
```

---

## Failure modes

- **Helius WebSocket drops silently** — detected by stale on-ramp event timer, triggers reconnect + backfill.
- **Helius WebSocket stays closed > 60s** — push `⚠️ sendWsDownWarning`; `✅ sendWsRecovery` when it reopens. Flaps < 60s are silent. Complements the slower on-ramp staleness alarm.
- **Freshness RPC (`getSignaturesForAddress`) fails 5 consecutive times** — push `⚠️ sendRpcFailureWarning`; recovery on next success. `rpcCall` itself retries up to 5 times per call (honoring `Retry-After`), so 5 consecutive freshness failures = 25 raw HTTP attempts.
- **Helius RPC 429** — `rpcCall` honors `Retry-After`, exponential backoff, never hammers.
- **Helius credit exhaustion** — track manually via dashboard, not programmatically in v1.
- **SQLite WAL grows large** — checkpoint manually if > 100MB (unlikely at our write volume).
- **Telegram 429** — `@grammyjs/auto-retry` retries honoring `retry_after` up to 3 attempts within a 30s cap.
- **Telegram 5xx / network blip at send time** — same: auto-retry covers it. On final failure, the candidate row's `alert_sent_at` stays NULL → PH3 startup replay covers the gap on next boot.
- **Daemon crash between SQLite persist and Telegram send** — PH3 startup replay covers it: un-alerted rows surface via `SELECT … WHERE status='detected' AND alert_sent_at IS NULL` and the push is fired-and-forgotten after `bot.start()` but before WS connect.
- **Daemon crash in general** — systemd restarts (`Restart=always`, `RestartSec=5`), startup backfill covers the gap for WS events.
- **VPS reboot** — systemd starts daemon at boot, backfill covers the gap.
- **Deployer funds from an on-ramp we're not monitoring** — cannot detect. Known gap.
- **Deployer funds via USDC instead of SOL** — cannot detect in v1. Known gap (see Detection logic § USDC flows).
- **Deployer funds via a cross-chain bridge** — cannot detect. Known gap.

---

## What NOT to build

- Deploy detection (too late to be useful — Bloom handles block-0 execution)
- Launch reporting, profit tracking, post-launch analytics
- Bundle wallet monitoring for confirmation
- Dry-run mode
- Multi-factor confidence scoring beyond the three-tier rules
- Auto-whitelisting (manual step for safety)
- Secondary RPC provider failover
- Offsite backup rotation
- UptimeRobot integration
- HA or hot standby
- Web UI
- Docker container
- USDC flow handling (v1)
- Credit burn API polling
- **Copy-trade backup detection (STRATEGY.md Vector C — wallets `BqP79WmkKFRytsrWCqY2ra4n5XzUxQjTf45rHy7rkgtC` and `231fshU82vSSeyytyCZJUEUG8Ti3UAgnDSoNFGTETCuK`).** Intentional v1 scope cut: vectors A and B are higher signal, and Vector C only catches launches at block-1 or later (already too late for Bloom's block-0 snipe).

---

## File layout

Monitor sources live at `investigation/monitor/`. Package boundary is root — `package.json`, `package-lock.json`, `node_modules/`, `.env`, `.env.example`, `.gitignore` all live one level up.

```
investigation/
  package.json                    # shared runtime + dev deps (audit + monitor)
  package-lock.json
  node_modules/                   # shared
  .env                            # gitignored; audit + monitor keys
  .env.example                    # committed
  .gitignore                      # covers monitor/data/l11.db* etc.
  src/audit/                      # audit scripts (pre-existing)
  monitor/
    src/
      index.ts                    # entrypoint, wires everything up
      config.ts                   # env loading and validation (loads root .env)
      paths.ts                    # MONITOR_ROOT / REPO_ROOT / resolveFromMonitor helper
      util.ts                     # Logger interface, errMessage, sleep w/ AbortSignal
      db.ts                       # better-sqlite3 setup, schema, persist/mutation helpers
      backfill.ts                 # on-reconnect catch-up via getSignaturesForAddress + getTransaction
      wallets.ts                  # wallets.json loader, sync to DB
      health.ts                   # staleness monitor + /health HTTP server + heartbeat scheduler
      selfcheck.ts                # /health command 5-probe runner
      helius/
        ws.ts                     # Enhanced WSS transactionSubscribe, reconnect w/ backoff
        rpc.ts                    # rpcCall (retry-aware) + getSignaturesForAddress + getTransaction
      detection/
        candidate.ts              # SOL transfer parse, filter, tier, Candidate type
        fresh.ts                  # fresh-wallet check (getSignaturesForAddress limit=2)
      telegram/
        bot.ts                    # grammy setup, command handlers, callback handlers
        push.ts                   # outbound alert formatters (candidate, startup, heartbeat, warnings)
        format.ts                 # TIER_EMOJI, escapeHtml, formatDuration, formatAge, formatLastEventLines
    test/
      replay-l10.ts               # detection acceptance (pinned L10 fixture, 12 assertions)
      replay-l10-dedup.ts         # DB dedup acceptance (11 assertions)
      commands.ts                 # parseMuteDuration, formatDuration, formatAge, listActiveCandidates, formatCandidatesBody truncation (54 assertions)
      candidate-actions.ts        # whitelist/reject/unwhitelist/unreject transitions + ignore_list wiring + PH3 replay + migration (53 assertions)
      health.ts                   # staleness state machine + /health HTTP server (15 assertions)
      selfcheck-synthetic.ts      # /health synthetic-detection probe
      smoke-alert.ts              # manual: push a synthetic candidate alert end-to-end
      capture-l10-fixture.ts      # one-off fixture capture via getTransaction
      fixtures/                   # pinned tx payloads
    data/
      l11.db                      # gitignored
      wallets.json                # committed (23 wallets)
    systemd/
      l11-monitor.service         # systemd unit for VPS
    tsconfig.json                 # monitor-scoped compile config (src -> dist)
    dist/                         # tsc output; gitignored
```

---

## systemd unit

Deployed at `/etc/systemd/system/l11-monitor.service` on the VPS:

```ini
[Unit]
Description=L11 Monitor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=l11
WorkingDirectory=/opt/l11-monitor
ExecStart=/usr/bin/node monitor/dist/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production
EnvironmentFile=/opt/l11-monitor/.env

[Install]
WantedBy=multi-user.target
```

---

## Deployment to VPS ✅ complete 2026-04-18

**Droplet:** DigitalOcean Premium (Intel 2 vCPU / 4GB / 120GB NVMe), NYC3, Ubuntu 24.04.3 LTS, `143.198.12.56`.

**Base packages + Node 20.20.2 LTS installed. `l11` system user created (uid 997, sudo group, passwordless sudo). Mac SSH key installed. `/opt/l11-monitor` owned by `l11:l11`. ufw enabled (deny in / allow out + 22/tcp), fail2ban enabled with sshd jail, SSH password auth disabled.**

**DB backup strategy.** DigitalOcean automated backups are not enabled (weekly cadence is too coarse for launch-window use). Daemon self-recovers from `l11.db` loss via forward-only bootstrap (monitored wallets get NULL cursor on new DB and skip backfill), but candidate history + ignore_list would be lost. Manual timestamped snapshots via `~/Desktop/db-backup/backup-db.sh` on the operator's Mac (`scp` with atomic `.partial` staging, saves to `~/Desktop/db-backup/l11-manual-YYYYMMDD-HHMM.db`). Recommended cadence during the L11 window: every 1–3 hours. For schema-changing deploys, take a pre-deploy snapshot before `systemctl restart`.

### Deploy sequence (for re-use on PH updates)

From Mac (after local verification). **Stage explicit paths** — do not use `git add -A` (risks committing `.env` or untracked backups):
```bash
git add monitor/ package.json package-lock.json MONITOR_BUILD_PLAN.md
git commit
git push
```

On VPS:
```bash
ssh l11@143.198.12.56
cd /opt/l11-monitor
git pull
npm ci
npm run monitor:build
sudo systemctl restart l11-monitor
sudo systemctl status l11-monitor
journalctl -u l11-monitor -n 100 --no-pager
curl -s http://127.0.0.1:9479/health
```

For schema-changing deploys (e.g. PH3), first pull a backup:
```bash
# from Mac
mkdir -p backups
scp l11@143.198.12.56:/opt/l11-monitor/monitor/data/l11.db ./backups/l11-pre-<change>-<date>.db
```

---

## Production hardening (shipped 2026-04-19)

PH1a through PH6 shipped as commit `5335ae2` ("PH1a-PH6: close silent-drop paths before L11 window"). Theme: close every silent-drop path for candidate alerts — a dropped alert at T-12h loses L11.

- **PH1a** — `@grammyjs/auto-retry` on Telegram sends (3 retries, 30s max delay). Before: a single 429 or 5xx silently dropped the alert.
- **PH1b** — `@grammyjs/transformer-throttler` in front of auto-retry (throttler-first, auto-retry-second). Paces outbound bursts at ~1/sec so retry attempts are themselves throttled.
- **PH2** — `/candidates` 4096-char truncation guard. Drops trailing rows in whole 4-line chunks, appends `… and N more` footer. Prevents Telegram rejecting the whole reply as the queue grows.
- **PH3** — Startup replay of un-alerted candidates (`status='detected' AND alert_sent_at IS NULL`) + idempotent `ALTER TABLE` migration adding `alert_sent_at` and `prior_sig_count`. Closes the "crash between SQLite persist and Telegram send" silent-drop path. Replay runs between `bot.start()` and `connectHeliusWs()` so it can't race with live re-detection.
- **PH4** — Heartbeat gains a `WS: connected|disconnected` line. At-a-glance WS state without needing `/status`.
- **PH5** — Startup message gets the `🟢` prefix for consistency with other pushes.
- **PH6** — `/unreject` and `/unwhitelist` undo commands. Recovery from a misfire on the reject/whitelist buttons without manual SQL. Unreject also removes the address from `ignore_list`.

Per-increment spec (Why / What / Verify) lives in the commit message and diff. See `git show 5335ae2`.

### Pending (OPTIONAL, post-L11)

- **PH7** — `/wallets` command: list monitored wallets grouped by category with the same 4096-char guard.
- **PH8** — `/stats` command: candidates by tier/status + 24h/7d rollups + events by source.

---

## Glossary of non-obvious terms

- **On-ramp sieve**: the core detection pattern — watching fiat on-ramp hot wallets for outflows in deployer funding range to fresh wallets.
- **Fresh wallet**: a Solana address with no prior on-chain history before the funding tx (which appears as ≤ 1 prior signature once the funding tx itself is on-chain).
- **Deployer wallet**: the wallet that will execute the pump.fun create instruction.
- **Hub wallet**: an internally-controlled wallet that funds fresh deployer wallets; primary example `v49jgwyQy9zu4oeemnq3ytjRkyiJth5HKiXSstk8aV5`.
- **Intermediary wallet**: a Vector B watch wallet historically involved in deployer funding chains (RXRP repump cluster, prior deployers, side funders).
- **Bloom bot**: Telegram-based snipe bot that executes block-0 purchases on whitelisted deployer wallets. Whitelisting is currently manual via address paste.
- **L10, L11**: launch number. L10 (XAIC, March 2026) was missed because no monitor was running. L11 is the next launch — **Nukex, Saturday April 25 2026, 14:00–18:00 EST** (confirmed via operator intel 2026-04-20).
- **Block 0**: the same Solana slot as the deploy tx. Bloom's goal.
- **PH1..PH6**: production-hardening increments shipped 2026-04-19 as commit `5335ae2`. PH7 and PH8 remain OPTIONAL post-L11 backlog.
