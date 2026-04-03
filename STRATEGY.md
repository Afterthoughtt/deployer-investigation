# L11 Detection Strategy

## Objective
Identify the deployer's L11 fresh wallet **after it gets funded** but **before `create_and_buy`** fires. Feed that address into Bloom bot whitelist for block-0 snipe.

## Why This Is Hard Now
L1-L9: Deployer funded fresh wallets from within the network (hub, OG, prior deployers). Easy to catch — just watch known wallets for 8-25 SOL outflows to fresh addresses.

L10: Deployer switched to **direct from MoonPay → fresh wallet**. No network intermediary. Exchange hot wallets send to thousands of customers, so you can't just watch one wallet — you need filters.

The deployer varies the funding path every launch. Could revert to intermediaries, use MoonPay again, or switch to an entirely new on-ramp.

## Detection Vectors

### Vector A: MoonPay Sieve (PRIMARY)

**Rationale:** L10 used MoonPay MP1 → fresh wallet. Most likely path for L11.

**CRITICAL GAP: MoonPay wallet mapping is INCOMPLETE.** We have only confirmed ONE MoonPay hot wallet on Solana:

| Wallet | Address | Status |
|--------|---------|--------|
| MP1 | `Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6` | Confirmed — customer-facing, funded L10 deployer |
| MP4 | `AFKxebx96mnt1yn1ek6mcxeGDHmfrAWzo2h1fVdrrvWE` | Treasury only — funds MP1, do NOT monitor |
| MP2/MP3 | Unknown | NOT found on Solana in prior search — may exist under different labels |

Second discovery attempt (2026-04-02) via Arkham entity search + Arkham entity lookup + Nansen entity search found no additional Solana MoonPay wallets. Arkham returned the MoonPay entity but `addresses: null` (no address list exposed). Nansen confirmed entity name only. Gap confirmed — Vector A monitors MP1 only. If MoonPay rotates hot wallets, this vector has a blind spot.

**Filter criteria (ALL must match):**
- Amount: 8-25 SOL (L4+ range: 8.09-14.81, widened for safety)
- Recipient has 0 prior signatures (fresh wallet)
- Recipient has 0 prior balance

**Expected noise:** MoonPay processes thousands of transactions, but the specific fingerprint (8-25 SOL to a zero-history wallet) should have low false positive rate. Candidates can be manually reviewed in the 12-17h window before deploy.

**Credit cost:** Polling MP1 via `getSignaturesForAddress` (10 credits) + `getTransaction` for each new sig (10 credits each). At reasonable polling intervals (every 5-10 min), this is well within Helius Developer plan limits.

---

### Vector B: Network Intermediary Watch (SECONDARY)

**Rationale:** L4-L9 all used network intermediaries. Deployer could revert. These wallets already hold SOL.

**Wallet selection is TBD.** The candidates below are a starting point based on SOL balances and network centrality. Final watchlist needs to be determined — not all of these may be worth monitoring, and others from network-map.json may be better candidates.

**Candidate watchlist (wallets with SOL that could fund a fresh deployer):**

| Label | Address | SOL Balance | Role |
|-------|---------|-------------|------|
| GgFVQNY5 | `GgFVQNY5hck2WMFtpVeWi37yQKepyHLqLD8eZ3nmLvKH` | 112.7 | Collection wallet, relay chain convergence |
| 7RLD6F9S | `7RLD6F9SiFvtdqW4bYpy4m8D3mum7xVdZUSjzv1TWJaf` | 43.79 | Fireblocks, Hub-funded |
| jetnut_network | `FSbvLdrK1FuWJSNVfyguDQgvt93Zk92KnGxxSHoFjAyE` | 7.9 | Active trader, 13 network connections |
| cold_usdc_2 | `EAcUbdoiY8aCwJKdSo17fhU4uqMopW27K4oLqpstqfHe` | 1.97 | USDC converter, still active Mar 20 |
| eggsheeran | `DuCzGNzSorXNgWKbx6koWTjd4P1AQaZHrNAdQu6NWmR8` | ~0.05 | 35 network connections, critical node |

**Note:** Balances were last checked 2026-03-31 and will change. SOL balances should be re-verified before the monitor goes live. Additional candidates (hub, OG deployer, prior deployers with residual SOL) are in `data/network-map.json`.

**Signal quality:** If any of these wallets send 8-25 SOL to a zero-history address, that is extremely high signal. But the right watchlist still needs to be finalized.

**Credit cost:** `getBalance` polling (1 credit each). Only escalate to `getSignaturesForAddress` (10 credits) if balance decreases. Very cheap.

---

### Vector C: Copy-Trade Backup (INSURANCE)

**Rationale:** If A and B both miss, still get entry within seconds/minutes (not block-0).

**Wallet selection is TBD.** We know this is the right backup method, but which wallet(s) to copy has not been decided. Candidates below need evaluation.

**Strongest candidate — deployer's own trading wallet:**

| Label | Address | Status |
|-------|---------|--------|
| BqP79Wmk | `BqP79WmkKFRytsrWCqY2ra4n5XzUxQjTf45rHy7rkgtC` | Deployer's personal wallet. 0 SOL currently. Trades ALL 9 tokens across all 10 launches. L10: buyer #24 at +6 seconds ($689). |
| GoonPump | `231fshU82vSSeyytyCZJUEUG8Ti3UAgnDSoNFGTETCuK` | BqP79Wmk's funder. When GoonPump sends SOL to BqP79Wmk → launch is likely imminent. |

**Other candidates (unvetted):**

| Label | Address | Notes |
|-------|---------|-------|
| CoinSpot insider (token wallet) | `4916NkdubkfRyHkxkCR7rpVGz5dvzVdK161mg4jXDwRh` | Buys early but L10 activity unverified. May receive tokens via bundle rather than open market buy. |
| Cross-reference unknowns | See `data/results/cross-reference-report.json` | 19 unknown wallets appearing in 2-3 launches. Not profiled. Could contain reliable early buyers. |

**Decision needed:** Which wallet(s) provide the best copy-trade signal? BqP79Wmk is the most proven (10/10 launches), but its 0 SOL balance means it needs re-funding first — which is itself a signal.

---

## Timing

- **Cadence:** ~Monthly. L10 was March 15.
- **L11 expected:** Mid-April 2026 (~April 12-18)
- **Monitor must be live by:** April 10 at latest
- **Funding-to-deploy gap:** 12-17h (max observed: 26h)
- **Deploy window:** 18:00-23:43 UTC (L5+ pattern)

## Deployer Behavioral Fingerprint

| Parameter | Value |
|-----------|-------|
| Program | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` |
| Instruction | `create_and_buy` |
| Supply purchased | 30-35% |
| SOL spent (fresh wallet era) | 8.09-14.81 SOL |
| Bundle wallets | 6 (receive tokens within seconds of deploy) |
| On-ramp history | Coinbase (L1-L9), MoonPay (L10) |
| Token naming | XRP-themed memecoins |

## Architecture (TBD)

Polling vs. webhooks, alerting mechanism (Discord/Telegram/terminal), Bloom bot integration — to be decided in monitor development session.

## Data Files

All investigation findings are in these canonical files:
- `data/network-map.json` — wallet registry (70+ addresses, roles, labels, verdicts)
- `data/launch-history.json` — 10-launch behavioral profile + timeline
- `data/launch-details.json` — per-launch deployer flows + early buyer lists
- `data/results/investigation-notes.json` — profit extraction routes (7 routes, $400K+ total)
- `data/results/cross-reference-report.json` — cross-launch recurring wallet analysis

Investigation scripts and raw API results archived in `archive/`.
