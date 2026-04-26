# Session Handoff — 2026-04-25 (PART 2, post-VPS-DB pull)

**Context:** L11 (Nukex) launches today **2026-04-25 14:00–18:00 EST** = 18:00–22:00 UTC. Funding window now closed; operator is now in pre-deploy detection mode.

**This handoff covers:** the second triage session that completed MP2 / RXRP / deferred-CoinSpot / MP1-spot-check from the morning handoff (`SESSION_HANDOFF_2026-04-25.md`), then pulled the live VPS DB and surfaced 16 new candidates detected since the 14:35 UTC backup. Pass A is done on all 16 new; Pass B/C/D is **NOT** done on the new ones — that's the most urgent open item for the next session.

---

## Live VPS DB state (pulled 2026-04-25T08:36 local = ~13:36 UTC)

File at `/tmp/l11-live.db`. Counts:

| Source | Detected | Rejected |
|---|---|---|
| MoonPay MP2 | 80 | 0 |
| MoonPay MP1 | 48 | 4 |
| CoinSpot | 14 | 14 |
| RXRP ChangeNOW | 1 | 0 |
| RXRP Robinhood | 1 | 0 |
| RXRP FTX-US-insider | 1 | 0 |
| **Total detected** | **145** | **18** |

Operator has rejected 18 ids since prior session: MP1 (149, 144, 136, 128) + CoinSpot (6, 21, 26, 34, 41, 45, 75, 82, 103, 112, 120, 127, 130, 133).

---

## Audited this session (full Pass A→D, in `data/current-wallet-review-scope.json` batch `monitor_candidate_review_2026_04_25`)

**3 confirmed keeps** (in addition to the 11 carried from the prior morning handoff — see "Carried keeps" below):

| Pri | id | address | balance | shape |
|---|---|---|---|---|
| 1 | 142 | `6iuvAFTxpWSWRuMheGVVfZ7gEHcv1ssCzFSDsZALhiiY` | 12.548 SOL | MP2, intact, INSIDE 12-26h window |
| 2 | 105 | `2zYi14tpQPjj2FsDFfnN4Y9B9qcTpHktEnQ8phnGNpCj` | 9.941 SOL | MP2, intact, dormant 38h |
| 3 | 43 | `HefCL8a29RDNWmGC85N3UVvDCRAkaG3Df9jKKTorVTSE` | 37.51 SOL | CoinSpot accumulator, 2 deposits from CSEncqtq (24.51 + 13.0), dormant 91h |

**75 rule-outs** (full per-wallet reasons in scope file `monitor_candidate_batches[0].rule_out_list`): 71 MP2 + 3 RXRP + 1 deferred CoinSpot (id 64).

**MP1 spot-check (5 wallets parsed):** memecoin/relay assumption confirmed — the 41 prior MP1 bulk-classified rule-outs from yesterday's batch can be confidently rejected. Findings at `monitor_candidate_batches[0].mp1_spot_check_findings`.

**Two new follow-up destinations recorded** (neither in network-map, neither investigated):
- `7q6rJvHaTt3m2ALP61SRcQgbPzr1w2yLFAmUiaRvkLJj` — received 16.767 SOL from RXRP id 86 (FTX-US-insider chain)
- `BUen8C3J8AsJQiWXfGfvDGCPzceaNRMEH4ctcKKu9Hm3` — received 19.9 SOL from MP1 id 77

---

## Carried keeps from prior morning session — re-verified intact this session

All balances unchanged from morning recheck except 3XKSFf (continues memecoin trading; downgraded). All other keeps holding:

| id | address | balance | source | note |
|---|---|---|---|---|
| ? | `3f15vuFsQ3f2NA2WFLJ53Ei2JKZV4H8G42rJwugpCCGZ` | 24.431 SOL | CoinSpot | priority 1, INSIDE window at recheck |
| 79 | `GzPBXxW2RG947ZUKKqrDmKu3XtZCjQGaqrNmtPHnTHTM` | 37.443 SOL | CoinSpot | unchanged |
| 110 | `HYRGi5jqhCNbHH2dHzyiKnqPHqEvoeqWSGWzt8mMEVys` | 8.129 SOL | CoinSpot | unchanged |
| 102 | `8JkcHNCX65ss5QRUm7BC9K11A53YdfCftkTLNyvpJNxe` | 19.001 SOL | CoinSpot | unchanged |
| 58 | `FdyTNua8UxgdbmZQ1pQdfaaHvnp4ayf1DZgA6BGScGvo` | 20.657 SOL | CoinSpot | unchanged |
| 46 | `39VqGYiwc4vvH2vBVESuXYfYoLCGeb6e6LyheDSP4FPv` | 20.484 SOL | CoinSpot | unchanged |
| 30 | `7Ey5AFpT7EiioeqY8zMvw9gaz78kC5PNSsRc6g7rF1iq` | 8.708 SOL | CoinSpot | unchanged |
| 70 | `6rHWN6qQksCMGxkZCCkSG64fEi8vBknTxt1keGH9izLv` | 10.666 SOL | MP1 | unchanged |
| 65 | `4aMinwtC8QFrTwQFPhPq7txie7WXGaQfpLVm52rzwkgb` | 11.580 SOL | MP1 | unchanged |
| 148 | `6uYzo6ZRYehusYyaaM8XbZE11da98hyaryBtDKVyB8Bb` | 8.139 SOL | MP1 | unchanged (Bitstamp pre-activated) |

**Demoted from keeps this session:** `3XKSFfV62MgUdy81YRZwuTS9JB6cF8R2jo9T1YEePauh` (id 97, CoinSpot) — balance dropped 0.92 SOL (11.968 → 11.050) since prior, consistent with morning-handoff downgrade to HOP CAT memecoin trader. Should be `/reject 97`.

**Note:** `2bRSMnmwRb1Z1yxDrb2ia5Jw4vesCTzhd6a28mSHTBAf` (id 134, prior "active CoinSpot relay 7 cycles/day") now at **0 SOL** — drained again. Not on either keep or rule-out list. Destination of latest cycle not parsed — deserves a parseTransactions on its most recent outflow if next session has budget.

---

## NEW candidates since 14:35 backup — Pass A done, Pass B/C/D NOT done

The most important section. 16 truly new ids; **3 of them are hot leads that must be investigated immediately**. Pass A balance only:

### Hot leads (intact / inflated — investigate FIRST)

| id | address | funded | balance | source | funded UTC | notes |
|---|---|---|---|---|---|---|
| **154** | `6WjeqJjspyTyFqEw12KVqg8niiYDdwM3acdMQKDqEa28` | 10.0 | **163.784 SOL** | CoinSpot | 2026-04-25T06:28:58Z | **MASSIVE INFLATED — 153.78 SOL extra inflow on top of CoinSpot's 10.0**. Highest priority. Could be a collection wallet of similar shape to GzPBX (37 SOL) and HefCL8a29 (37 SOL) but at much larger scale. Parse all sigs immediately. |
| **162** | `7Q46SeJ7TkTs1gqgTrHnUwsRhUrbGGnNR4MiD5PNC5xL` | 10.0 | **9.895 SOL** | MP2 | 2026-04-25T14:44:25Z | 99% intact, funded ~14:44 UTC — extremely fresh. Inside window for L11 (deploy 18-22 UTC = 3-7h post-funding). High-signal candidate. |
| **151** | `FtnvximrdUXhJpFxGM7Ji6Fh2bYm2cfr8s6R5W24E8fN` | 10.577 | **10.577 SOL** | MP1 | 2026-04-25T04:30:56Z | 100% intact, funded ~04:30 UTC = ~9h dormant. Inside window. |

### Partial / drained / dust (lower priority — Pass B to confirm before final rule-out)

| id | address | funded | balance | source | funded UTC | bucket |
|---|---|---|---|---|---|---|
| 147 | `8j32oEBp1yqwNaSrCExcnP5NJqNXztsH5ukcbJriSqZL` | 11.419 | 2.973 SOL (26%) | MP1 | 2026-04-24T19:26:46Z | partial — likely active trader |
| 150 | `J6a2VqQSraBRr152td9fn6AuVKAnNtyd1Y1Eavg6BwjB` | 13.296 | 0.013 SOL | MP2 | 2026-04-25T04:27:33Z | drained dust |
| 152 | `HVgBWS3e5cRVijW2dgt3D5e9UzBtdowT9paVVkZK4YpT` | 9.287 | 0.100 SOL | MP2 | 2026-04-25T06:00:29Z | drained partial |
| 153 | `G1mToDHoLNoF89JZqqGHEYTRBgu5464V8CRZmCiCqHFz` | 10.556 | 0.125 SOL | MP1 | 2026-04-25T06:27:43Z | drained partial |
| 155 | `UXq3hPsDgS6vLWT64a37wzJtU6spWMkzNhMTH24QYC7` | 11.430 | 0.005 SOL | MP2 | 2026-04-25T06:43:14Z | drained dust |
| 156 | `2UzMoao3HVPecdqjRBNqWTHAWs4AdodGF1qmigh34ijj` | 11.606 | 0.056 SOL | MP2 | 2026-04-25T08:30:54Z | drained partial |
| 157 | `73geo5aRjf8crxqiQjUDuErUfFZTVYLTT2hvr5M5W93k` | 10.216 | 0.467 SOL | MP1 | 2026-04-25T11:34:49Z | drained partial — funded only ~2h before recheck, fast drain suspicious |
| 158 | `3CmWbBTgKofJcDBtQDh8JmnVwNrpFw3M52tT1DUgEwTE` | 9.180 | 0.178 SOL | CoinSpot | 2026-04-25T11:50:03Z | drained partial |
| 159 | `F6WzKskH41GXh18TJiyu2EQpEkzrVE7rJP2iX7z1AA3R` | 11.405 | 0.114 SOL | MP2 | 2026-04-25T12:36:47Z | drained partial |
| 160 | `Bm7b52PQ7kU9jAVZ5RJZPEo8bFgsv3i7M9hfdu2Ka5xD` | 11.582 | 0.001 SOL | MP1 | 2026-04-25T13:12:04Z | drained dust |
| 161 | `AgpYtdhSiVUPZQC2k9gW2nApdYS1vgKXBngPzaYPH8HL` | 15.886 | 0 SOL | CoinSpot | 2026-04-25T14:39:54Z | fully drained — funded 14:39, drained by 14:44 = ~5min cashout |
| 163 | `CP7NwEsRAAs4LnUbiAebXgCfTq63exoJB7XYwetu8oL6` | 13.645 | 0 SOL | MP2 | 2026-04-25T14:44:57Z | fully drained — funded 14:44, drained instantly |

Note: id 148 (`6uYzo6ZRYe...`) is shown in this batch but is the prior-session keep — already audited.

### Mandatory next-session work

1. **Parse all sigs for id 154** (`6WjeqJjspyTyFqEw12KVqg8niiYDdwM3acdMQKDqEa28`) to identify the 153.78 SOL extra inflow. If from a known network-map wallet, it's a strong deployer-control signal. If from a random external wallet, downgrade. Cost ~100-200 cr.
2. **Parse drain sig for id 161** (`AgpYtdhSi...`, CoinSpot 15.886 SOL → 0 in 5 min) — this is the fastest drain I've seen this session. Could be sniper bot or instant cashout. Determines whether to add destination to follow-up.
3. **Parse drain sig for id 163** (`CP7NwEsR...`, MP2 13.645 SOL → 0 instant) — same reasoning.
4. **Parse drain sig for id 162** (`7Q46SeJ7...`) IF it drains before next session check — currently 99% intact at 14:44 funding, so just `getBalance` first to see if state changed.
5. **Pass B `getTransactionHistory`** on the partials/dusts (147, 150, 152, 153, 155, 156, 157, 158, 159, 160) to confirm trader pattern and rule them out. Cheap (~100 cr total).
6. **Re-balance keeps 151, 154, 162 hourly** through L11 deploy window close (~22:00 UTC). Any change → parse immediately.

---

## /reject block — pending operator action

These are confidently classified as rule-outs. Operator can paste these into the bot:

### From this session (75 ids — already in `monitor_candidate_review_2026_04_25.rule_out_list`)
```
/reject 2  /reject 3  /reject 7  /reject 9  /reject 10  /reject 13  /reject 15
/reject 16 /reject 18 /reject 19 /reject 22 /reject 23  /reject 25  /reject 27
/reject 28 /reject 29 /reject 33 /reject 35 /reject 36  /reject 38  /reject 47
/reject 48 /reject 49 /reject 50 /reject 53 /reject 56  /reject 57  /reject 59
/reject 60 /reject 61 /reject 62 /reject 63 /reject 66  /reject 67  /reject 68
/reject 71 /reject 72 /reject 74 /reject 76 /reject 78  /reject 80  /reject 81
/reject 83 /reject 84 /reject 85 /reject 87 /reject 89  /reject 90  /reject 94
/reject 95 /reject 104 /reject 106 /reject 107 /reject 108 /reject 109 /reject 111
/reject 113 /reject 115 /reject 119 /reject 121 /reject 122 /reject 125 /reject 132
/reject 135 /reject 137 /reject 138 /reject 139 /reject 140 /reject 141 /reject 143
/reject 146 /reject 24 /reject 40 /reject 86 /reject 64
```

### Prior MP1 batch tail (41 ids — handoff `SESSION_HANDOFF_2026-04-25.md`, validated by this session's spot-check)
```
/reject 1  /reject 4  /reject 5  /reject 8  /reject 11 /reject 12 /reject 14
/reject 17 /reject 20 /reject 31 /reject 32 /reject 37 /reject 39 /reject 42
/reject 44 /reject 51 /reject 52 /reject 54 /reject 55 /reject 69 /reject 73
/reject 77 /reject 88 /reject 91 /reject 92 /reject 93 /reject 96 /reject 98
/reject 99 /reject 100 /reject 101 /reject 114 /reject 116 /reject 117 /reject 118
/reject 123 /reject 124 /reject 126 /reject 129 /reject 145 /reject 147
```

### Demotion from prior CoinSpot keeps
```
/reject 97  # 3XKSFfV62MgUdy81YRZwuTS9JB6cF8R2jo9T1YEePauh — confirmed memecoin trader (HOP CAT), no longer a keep
```

### NEW candidates the next session can confidently reject after Pass B confirms (DO NOT BLIND-REJECT)
Hold these until Pass B confirms trader/relay pattern. Provisional rule-outs based on Pass A only:
- 150, 152, 153, 155, 156, 157, 158, 159, 160 — partial/dust drains
- 161, 163 — instant drains (after parse confirms cashout, not relay-to-deployer)
- 147 — heavy drain to 26%, likely trader (after parse)

**Total currently confident /reject: 117** (75 this session + 41 prior MP1 + 1 demotion). Next session can extend by ~12 after Pass B on the new partials.

---

## Open environmental notes

- **VPS SSH now working** via `~/.ssh/id_ed25519` (passphrase loaded into Apple Keychain via `ssh-add --apple-use-keychain`). Future sessions can `scp l11@143.198.12.56:/opt/l11-monitor/monitor/data/l11.db /tmp/` directly.
- **Helius credit burn this combined session: ~480 credits** (~450 from initial triage + ~16 from new-candidate Pass A + ~12 from prior-keep recheck). Plenty of headroom on the 10M/mo budget.
- **Known bot bug from prior handoff is unfixed:** `/candidates` listing fails with HTML parse error from literal `<id>` substrings in `monitor/src/telegram/format.ts:103`. Individual `/reject <n>` and `/whitelist <n>` work fine. Fix scheduled post-launch.
- **VPS `STALE_THRESHOLD_MS=900000` (15 min) override is still in effect** per morning handoff — revert to documented 7200000 (2h) after L11 launches.
- **2bRSMn... id 134** drained again (was prior session's "active CoinSpot relay 7 cycles/day"). Destination not parsed. If next session investigates, it may surface another collection wallet.

---

## What WAS NOT done in this session (handoff to next)

1. **Pass B/C/D on the 16 new candidates** — only Pass A complete. Hot leads 154, 162, 151 specifically need Pass D parse RIGHT AWAY.
2. **`/reject` block has not been issued in the bot** — operator will manually paste between sessions.
3. **Two follow-up destinations** (`7q6rJvHa...`, `BUen8C3J...`) recorded in scope file but not investigated.
4. **id 134 latest drain destination** not parsed.
5. **Bitstamp registry patch** mentioned in morning handoff (Hot Wallet `9D8xSHWqF9NJWqCtn3rNxYEox63aCbWxYzTMfMur7Cc9`) still pending — not applied to `data/network-map.json`.

---

## Reading checklist for next session (in this order)

1. `SESSION_HANDOFF_2026-04-25.md` (morning handoff, prior batches)
2. This file
3. `data/current-wallet-review-scope.json` → `monitor_candidate_batches[0]` (this session's batch)
4. `MONITOR_BUILD_PLAN.md` for monitor architecture if needed
5. Live VPS DB at `l11@143.198.12.56:/opt/l11-monitor/monitor/data/l11.db` (SSH now works)

Then immediately: Pass D on id 154 (`6WjeqJjspyTyFqEw12KVqg8niiYDdwM3acdMQKDqEa28`) — that 153.78 SOL inflow is the highest-signal unknown right now.
