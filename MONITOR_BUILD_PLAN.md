# L11 Monitor — Build Plan

## Purpose

Build a persistent daemon that detects the deployer wallet funding event before launch and pushes a Telegram alert so the wallet can be whitelisted in Bloom bot for block-0 execution.

**The daemon's only job is pre-launch wallet identification.** Once the candidate is whitelisted in Bloom, the daemon's role is done. It does not detect deploys, track launches, or do post-launch reporting. Those are too late to be useful.

L10 was missed because no monitor was running at the time. We are building this from scratch ahead of L11 (window: April 20–30, 2026, per community intel) and designing it source-agnostic across fiat on-ramps so the deployer can't dodge us by switching providers (as they did from Coinbase → MoonPay between L9 and L10).

Wallet map, deployer history, insider networks, and API docs are all in this repo. Read them before writing code. Do not re-derive what is already documented.

---

## How to work on this codebase

These are instructions for Claude Code. Follow them.

### Build in small, runnable increments

Do not write the whole daemon and then try to run it. Build one component, run it, verify it works end-to-end with real output, then move to the next. Every increment must be runnable on its own.

Order:
1. Config loader + env validation — prove it loads the Helius key, Telegram token, chat ID
2. SQLite schema + migrations — prove the DB opens and tables exist
3. Wallets.json loader — prove the starting wallet set loads correctly
4. Helius WebSocket connection — prove it connects, subscribes, and receives at least one real event from a busy on-ramp wallet
5. Reconnect + backfill logic — prove it recovers when you kill the connection mid-run
6. Candidate detection — prove it correctly identifies an 8-25 SOL outflow to a fresh wallet
7. SQLite candidate insertion + dedup — prove no double-insertion on reconnect
8. Telegram bot skeleton — prove it pushes a test message to the right chat
9. Alert wiring — candidate detected produces a Telegram alert with inline buttons
10. Telegram commands: /status, /candidates, /whitelist, /reject, /mute
11. Health self-check and daily heartbeat

### Stop and verify after every increment

After each increment, stop writing code. Run the thing. Show the output. Confirm it matches expectation before continuing.

If a step depends on live data, use real data. Do not mock Helius or Telegram. Mocks hide the bugs that actually matter for this system.

### Know how to start and run the daemon end-to-end

Before writing any feature code, establish the run command and verify it works with a minimal skeleton. The user needs to be able to:

```bash
# Local development
npm run dev

# Production on the VPS
systemctl start l11-monitor
systemctl status l11-monitor
journalctl -u l11-monitor -f
```

If you add a new dependency, new env var, or new build step, update the run instructions in this document and confirm the daemon still starts cleanly.

### Do not over-engineer

- No abstract base classes, factories, or DI frameworks. This is a single-process daemon.
- No ORM. Raw SQL through better-sqlite3 prepared statements.
- No GraphQL, no tRPC, no Express. Grammy handles Telegram. A minimal `http.createServer` on localhost handles the health endpoint.
- No Docker unless it earns its place. Node + systemd is simpler.
- No MCP servers.
- No tests beyond the acceptance test described below. This is a single-user tool with a short lifespan and manual verification.

### Ask before assuming

If a wallet, API behavior, or threshold is unclear, stop and ask. Do not guess. The cost of being wrong is a missed launch. The cost of asking is 30 seconds.

### Full wallet addresses, always

Never reconstruct a wallet address from a truncated prefix. Copy full addresses directly from raw API responses or from the repo's wallet map (`data/network-map.json`). Address suffix fabrication has caused real errors on this project before.

---

## Stack

- Node.js LTS
- tsx for dev execution
- TypeScript, strict mode
- better-sqlite3 with WAL mode
- grammy for Telegram
- Helius Developer plan ($24.50/mo): Enhanced WSS `transactionSubscribe` with `accountInclude` filter, plus RPC for backfill
- pino for structured logging
- dotenv for config
- systemd for process management (no pm2)

**Credit budget (Helius Developer plan, 10M credits/month):** estimated burn ~45–90K credits/month for normal operation — Enhanced WS data streaming at 3 credits / 0.1 MB, with ~30 monitored wallets producing ~50–100 MB/day of parsed transaction data. Reconnect-backfill (`getSignaturesForAddress` at 10 credits, `getTransaction` at 10 credits) adds margin. Normal-day operation leaves >100x headroom. Track actual burn on the Helius dashboard, not programmatically in v1.

Deployment target: a small always-on Linux VM. DigitalOcean Premium Droplet (2 vCPU / 4GB / NVMe), NYC region, Ubuntu 24.04 LTS recommended; Hetzner / Vultr / Linode work the same way. Hardening: ufw, fail2ban, SSH key only, automated weekly DO backups enabled.

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

WebSockets drop. The daemon must:
- Reconnect with exponential backoff (start 1s, cap 60s, reset on successful receive)
- Re-register all subscriptions on reconnect
- Track `last_processed_signature` per monitored address in SQLite
- On reconnect, for each monitored address:
  - Call `getSignaturesForAddress` with `until: last_processed_signature` to get missed signatures
  - For each missed signature, call `getTransaction` to fetch the full parsed tx
  - Run through the same candidate detection logic as live events
  - Update `last_processed_signature` as events flow
- Deduplicate against SQLite `events` table before inserting candidates

This logic is where this class of daemon fails silently. Build it before anything downstream and test it by killing the connection mid-run.

**New-wallet bootstrap policy:** when a wallet is added to `wallets.json` for the first time (no row in `monitored_wallets`), the daemon goes **forward-only** for that wallet — it does NOT backfill historical signatures. We're predicting future funding events, not retro-detecting past ones. Backfill applies only to existing wallets that were watched before a disconnect.

### Health self-check

Track `last_event_received_at` per wallet category. **Only the on-ramp category drives the staleness alarm:** if no on-ramp wallet has produced an event in 2 hours, push a Telegram warning. On-ramp hot wallets (MoonPay, Coinbase) globally always have traffic in any 2-hour window — silence means our subscription is broken. Hub and intermediary wallets (`v49jgwyQ…`, RXRP repump intermediaries) can sit idle for days legitimately, so they do not gate the alarm.

Expose `GET /health` on 127.0.0.1 only. Returns 200 if WebSocket connected and at least one on-ramp event received in last 2 hours, else 503.

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

- HIGH: amount 12-18 SOL, source is a clean on-ramp (MoonPay or Coinbase), recipient has exactly 1 prior signature
- MEDIUM: amount 8-25 SOL, source is any on-ramp, recipient has ≤ 1 prior signature
- LOW: amount 8-25 SOL, source is a hub or intermediary (noisy)

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
  rejected_at INTEGER                  -- epoch ms UTC
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

---

## Wallets.json — source of truth for monitored addresses

Committed to the repo at `monitor/data/wallets.json`. Loaded on daemon startup. Adding or removing wallets is a config change plus a daemon restart.

Minimal placeholder shape (replace with the full reviewed set before deploy):

```json
{
  "onramps": [
    { "address": "Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6", "label": "MoonPay MP1" },
    { "address": "5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1", "label": "MoonPay MP2" }
  ],
  "hubs": [
    { "address": "v49jgwyQy9zu4oeemnq3ytjRkyiJth5HKiXSstk8aV5", "label": "v49 hub" }
  ],
  "intermediaries": [],
  "ignore": [
    { "address": "Ed4UGBWK4UpwBKiGFkM2uQMTPpahPwxgxEWjJTRXuAJv", "reason": "shared trading bot infrastructure" }
  ]
}
```

Pull all on-ramp, hub, and intermediary addresses verbatim from `data/network-map.json` in this repo. Do not invent them, do not retype from a truncated prefix. The registry contains 10 Coinbase Hot Wallets, MoonPay MP1/MP2 (MP4 is treasury — do NOT monitor), and the Vector B intermediaries listed in `STRATEGY.md`.

**Pre-deploy review gate (BLOCKING):** the daemon ships with the minimal placeholder set above so coding isn't blocked, but `wallets.json` MUST be reviewed and signed off by the user before the daemon goes to production. The full reviewed set should include:
- All 10 Coinbase Hot Wallets (`onramps.coinbase.CB1` through `CB10` in `network-map.json`)
- MoonPay MP1 + MP2
- Hub `v49jgwyQy9zu4oeemnq3ytjRkyiJth5HKiXSstk8aV5`
- OG deployer `37XxihfsTW1EFSJJherWFRFWcAFhj4KQ66cXHiegSKg2` (funded L6)
- Prior fresh-wallet deployers L4–L10 (any of them could fund the next launch)
- Side funder `52eC8Uy5eFkwpGbDbXp1FoarxkR8MonwUvpm2WT9ni5B` (funded L9)
- The high-balance RXRP repump intermediaries from STRATEGY.md Vector B (`7JCe3GHw…`, `7iVCXQn4…`, `GgFVQNY5…`, `54Pz1e35…`, `AZ57WTNM…`, `7RLD6F9S…`, `7cthuERB…`, `BvYi1ZV9…`, `6zZAKeF5…`, `FiggKseF…`, `CSEncqtq…` — verify each from `network-map.json` before adding)

Open question for the user during review: keep `HVRcXaCFyUFG7iZLm3T1Qn8ZGDMHj3P3BpezUfWfRf2x` (Fireblocks Custody, only 1-launch tie via L6, very noisy) or drop it. If kept, force its candidates to LOW tier.

On daemon startup, compare `wallets.json` to the `monitored_wallets` table. Insert new wallets, mark removed wallets as inactive (don't delete, preserve history). Update the subscribe filter accordingly.

---

## Telegram interface

Single chat, hardcoded chat ID in env. Bot responds only to that chat.

### Commands (registered via `bot.api.setMyCommands` on startup)

- `/status` — daemon uptime, WebSocket state, active candidates count, last event received timestamp
- `/candidates` — list active candidates with confidence, source, amount, age
- `/whitelist <id>` — mark candidate whitelisted
- `/reject <id>` — mark candidate rejected, add to ignore list
- `/mute <duration>` — silence non-critical alerts (e.g. `/mute 2h`)
- `/unmute` — cancel mute

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
  .text("✅ Whitelist", `wl:${candidate.id}`)
  .text("❌ Reject", `rj:${candidate.id}`)
  .url("🔍 Solscan", `https://solscan.io/account/${candidate.address}`);
```

Callback handlers on `wl:*` and `rj:*`. Acknowledge the callback immediately (Grammy: `ctx.answerCallbackQuery()`) to dismiss the loading state.

### Other pushes

- Candidate whitelisted: confirmation, includes the address in code block again for convenience
- Health warning: WebSocket stale, reconnect failing repeatedly
- Daily heartbeat: uptime, candidate count, last event age

---

## Configuration

`.env` file at project root, not committed. `.env.example` is committed.

Required env vars:
```
HELIUS_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
DB_PATH=./data/l11.db
LOG_LEVEL=info
```

On startup, validate all env vars exist. Fail loudly if any missing.

Nansen is not required for runtime. It was used in prior investigation to build the wallet map, but the daemon itself doesn't call Nansen.

---

## Acceptance test

Before deploying to a host, verify by replaying the L10 funding event through the detection logic end-to-end.

**Pinned constants (verified on-chain via Helius RPC, 2026-04-16):**
- L10 deployer wallet: `2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB`
- Funding signature: `4hQpmGKE9irpwaEuzRL6kcK1c5uFGzfieaCAwXjvSSbLpUx4qGBKgZRpMvxuyspan7FrHEfNx8usvV9C6QS37UKu`
- Funder (MoonPay MP1): `Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6`
- Amount: 13.443 SOL (13,443,000,000 lamports)
- Slot: `406505247`
- blockTime: `1773550293` (2026-03-15 04:51:33 UTC)
- spl-memo on the tx: `7c61e6fde07f70c202784ed4c9884939` (likely MoonPay's internal reference — informational only, do NOT use for detection logic; on-chain memos are attacker-controllable per project rules)

Fetch the funding tx via Helius `getTransaction`, feed it through the candidate detection code path, confirm:
- Detected as candidate
- Confidence correctly assigned (HIGH — amount 13.443 ∈ 12–18 band, source is MoonPay MP1 on-ramp, recipient previously had 0 prior signatures)
- Source labeled as "MoonPay MP1"
- Amount parsed as 13.443 SOL
- Recipient flagged as fresh wallet
- SQLite insert succeeds
- Telegram alert fires with correct format and working inline buttons (Whitelist / Reject / Solscan)

If the replay produces the correct alert, the system is ready. If not, fix and re-run.

---

## Failure modes to handle explicitly

- Helius WebSocket drops silently — detected by stale on-ramp event timer, triggers reconnect + backfill
- Helius RPC 429 — exponential backoff, never hammer
- Helius credit exhaustion — track manually via dashboard, not programmatically in v1
- SQLite WAL grows large — checkpoint manually if > 100MB (unlikely at our write volume)
- Telegram 429 — respect `retry_after`, grammy handles this
- Daemon crash — systemd restarts, startup backfill covers the gap
- VPS reboot — systemd starts daemon at boot, backfill covers the gap
- Deployer funds from an on-ramp we're not monitoring — cannot detect. Known gap.
- Deployer funds via USDC instead of SOL — cannot detect in v1. Known gap (see Detection logic § USDC flows).
- Deployer funds via a cross-chain bridge — cannot detect. Known gap.

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
- Tests beyond the acceptance test
- USDC flow handling (v1)
- Credit burn API polling
- **Copy-trade backup detection (STRATEGY.md Vector C — wallets `BqP79WmkKFRytsrWCqY2ra4n5XzUxQjTf45rHy7rkgtC` and `231fshU82vSSeyytyCZJUEUG8Ti3UAgnDSoNFGTETCuK`).** Intentional v1 scope cut: vectors A and B are higher signal, and Vector C only catches launches at block-1 or later (already too late for Bloom's block-0 snipe).

---

## File layout

Self-contained Node package at `investigation/monitor/` (top-level beside `src/`, `data/`, `docs/`):

```
monitor/
  src/
    index.ts              # entrypoint, wires everything up
    config.ts             # env loading and validation
    db.ts                 # better-sqlite3 setup, migrations, prepared statements
    helius/
      ws.ts               # WebSocket connection, reconnect, backfill
      rpc.ts              # getSignaturesForAddress, getTransaction
    detection/
      candidate.ts        # candidate detection logic
      fresh.ts            # fresh-wallet check
    telegram/
      bot.ts              # grammy setup, command handlers, callback handlers
      push.ts             # outbound alert formatters
    health.ts             # /health endpoint, event freshness tracker
    log.ts                # pino setup
    wallets.ts            # wallets.json loader, sync to DB
  data/
    l11.db                # gitignored
    wallets.json          # committed
  systemd/
    l11-monitor.service   # systemd unit for VPS
  .env.example            # committed
  .env                    # gitignored
  package.json
  tsconfig.json
```

The monitor has its own `package.json` and `tsconfig.json` separate from the audit scripts in `investigation/src/audit/` so the daemon's runtime deps stay minimal.

---

## systemd unit

Place at `/etc/systemd/system/l11-monitor.service` on the VPS:

```ini
[Unit]
Description=L11 Monitor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=l11
WorkingDirectory=/opt/l11-monitor
ExecStart=/usr/bin/node dist/index.js
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

## Deployment to VPS

Once acceptance test passes locally:

1. Provision a small Linux VM (DigitalOcean Premium Droplet 2 vCPU / 4GB recommended; Hetzner / Vultr / Linode equivalents work too). Ubuntu 24.04 LTS, NYC region (or closest to user)
2. Harden: ufw allow 22, fail2ban, disable root, SSH key only
3. Create `l11` system user, `/opt/l11-monitor` directory owned by that user
4. Install Node LTS, git
5. Clone repo, `npm ci` inside `monitor/`, build with `tsc`
6. Install `.env` with production credentials (scp over, chmod 600, chown l11)
7. Place systemd unit, `systemctl daemon-reload && systemctl enable --now l11-monitor`
8. `journalctl -u l11-monitor -f` to tail logs
9. Verify Telegram heartbeat and startup message arrive
10. Enable provider's automated weekly backups (DO has a checkbox in the control panel)

---

## Glossary of non-obvious terms

- **On-ramp sieve**: the core detection pattern — watching fiat on-ramp hot wallets for outflows in deployer funding range to fresh wallets
- **Fresh wallet**: a Solana address with no prior on-chain history before the funding tx (which appears as ≤ 1 prior signature once the funding tx itself is on-chain)
- **Deployer wallet**: the wallet that will execute the pump.fun create instruction
- **Hub wallet**: an internally-controlled wallet that funds fresh deployer wallets; primary example `v49jgwyQy9zu4oeemnq3ytjRkyiJth5HKiXSstk8aV5`
- **Intermediary wallet**: a Vector B watch wallet that has historically been involved in deployer funding chains (RXRP repump cluster, prior deployers, side funders)
- **Bloom bot**: Telegram-based snipe bot that executes block-0 purchases on whitelisted deployer wallets. Whitelisting is currently manual via address paste.
- **L10, L11**: launch number. L10 (XAIC, March 2026) was missed because no monitor was running. L11 is the next launch (window April 20–30, 2026).
- **Block 0**: the same Solana slot as the deploy tx. Bloom's goal.
