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

**TWO confirmed MoonPay customer-facing wallets on Solana** (MP2 discovered 2026-04-03 via RXRP repump funder chain tracing):

| Wallet | Address | Status |
|--------|---------|--------|
| MP1 | `Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6` | Confirmed — customer-facing, funded L10 deployer + RXRP wallet 2Nzwpdro |
| MP2 | `5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1` | Confirmed — customer-facing, 1,952 SOL balance, separate supply chain (Binance 8). Funded RXRP intermediary FiggKseF |
| MP4 | `AFKxebx96mnt1yn1ek6mcxeGDHmfrAWzo2h1fVdrrvWE` | Treasury only — funds MP1 only, do NOT monitor |
| MP3 | Unknown | Still not found on Solana |

MP2 has a completely separate supply chain from MP1: funded by Binance 8, not by MP4 (Bitstamp/FalconX). This is why two prior searches failed — MP2 doesn't appear in MP4's outflows. Only found by tracing the deployer's RXRP repump wallet funding chains backward. **Both MP1 and MP2 must be monitored for L11.**

**Filter criteria — SOL path (primary, ALL must match):**
- Amount: 8-25 SOL (L4+ range: 8.09-14.81, widened for safety)
- Recipient has 0 prior signatures (fresh wallet)
- Recipient has 0 prior balance

**Filter criteria — USDC path (fallback):** If the deployer buys USDC via MoonPay instead of SOL, the USDC arrives from MP1's USDC ATA (`4FoRA1uLBcE31TC799djhLt3rqpGuh2gV9C5KdvLgUPg`), not MP1/MP2 directly. The recipient would then swap USDC → SOL on a DEX before deploying. Monitor MP1's USDC ATA for outflows of ~$1,000-3,500 USDC to fresh wallets. Lower likelihood than SOL path (all 10 historical launches used direct SOL funding), but would bypass the SOL sieve entirely if used.

**Expected noise:** MoonPay processes thousands of transactions, but the specific fingerprint (8-25 SOL to a zero-history wallet) should have low false positive rate. Candidates can be manually reviewed in the 12-17h window before deploy.

**Credit cost:** Polling MP1 + MP2 + MP1 USDC ATA via `getSignaturesForAddress` (10 credits each) + `getTransaction` for each new sig (10 credits each). At reasonable polling intervals (every 5-10 min), this is well within Helius Developer plan limits.

---

### Vector B: Network Intermediary Watch (SECONDARY)

**Rationale:** L4-L9 all used network intermediaries. Deployer could revert. These wallets already hold SOL.

**UPDATED 2026-04-04.** RXRP repump investigation revealed 14 intermediary wallets, 19 buyer wallets (22 total, 3 already known core), and 3 Bubblemaps cluster wallets. Several have significant SOL balances worth monitoring.

**Candidate watchlist (original network + RXRP repump wallets with active SOL):**

| Label | Address | SOL Balance | Role |
|-------|---------|-------------|------|
| 7JCe3GHw | `7JCe3GHwkEr3feHgtLXnmuJ1yB3A7coSeyynxTBgdG8k` | 224.7 | RXRP buyer, Coinbase-funded, Trading Bot |
| 7iVCXQn4 | `7iVCXQn4u6tiTEfNVqbWSEsRdEi69E9oYsSMiepuECwi` | 220.9 | RXRP buyer, Coinbase-funded, Trading Bot |
| GgFVQNY5 | `GgFVQNY5hck2WMFtpVeWi37yQKepyHLqLD8eZ3nmLvKH` | 112.7 | Collection wallet, relay chain convergence |
| 54Pz1e35 | `54Pz1e35z9uoFdnxtzjp7xZQoFiofqhdayQWBMN7dsuy` | 94.2 | RXRP buyer, user-labelled insider, FTX US chain |
| AZ57WTNM | `AZ57WTNMivT9gjifWcjMRB5K4Eti9P64zhqKEcoUae1x` | 47.6 | RXRP buyer, Robinhood-funded |
| 7RLD6F9S | `7RLD6F9SiFvtdqW4bYpy4m8D3mum7xVdZUSjzv1TWJaf` | 43.79 | Fireblocks, Hub-funded |
| 7cthuERB | `7cthuERBfeNaXrK3vhuKFVdg93X7wuT89MNyNaKgFoYh` | 27.9 | RXRP buyer, ChangeNOW-funded (no-KYC) |
| BvYi1ZV9 | `BvYi1ZV99g2Sr8qbZL7hf4zm2hdUnUC47dgcT5WZDZ9J` | 15.7 | RXRP buyer + L10 early buyer, Binance 8 chain |
| 6zZAKeF5 | `6zZAKeF5zftUZHCkoWpno6MbaX2LrLwYBCFaEwLLaFDk` | 10.1 | RXRP buyer, MoonPay MP2 chain, OG fee payer |
| FiggKseF | `FiggKseFrgdsk4u3TLpbPFLJDKbahqkJQKEchKcwYsNZ` | TBD | MP2 intermediary hub, feeds 3+ wallets |
| CSEncqtq | `CSEncqtqbmNRjve42sNnbs5cCSmrjUNsAEwc17XY2RCs` | TBD | Binance 6 intermediary, feeds 2 wallets |

**Note:** Balances checked 2026-04-03 for RXRP wallets. Older entries (GgFVQNY5, 7RLD6F9S) last checked 2026-03-31. All should be re-verified before monitor goes live.

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
| Cross-reference unknowns | See `data/results/cross-reference-report.json` | All resolved as of 2026-04-02. 1 remaining unresolved: 7QJM8rXX (2 network overlaps, MEXC-funded, ambiguous). |

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
| On-ramp history | Coinbase (L1-L9), MoonPay (L10), RXRP repump: Coinbase/MoonPay MP1+MP2/Bybit/Binance/Kraken/ChangeNOW/MEXC/Robinhood/FTX US |
| Token naming | XRP-themed memecoins |

## Architecture (TBD)

Polling vs. webhooks, alerting mechanism (Discord/Telegram/terminal), Bloom bot integration — to be decided in monitor development session.

## Data Files

All investigation findings are in these canonical files:
- `data/network-map.json` — wallet registry (~147 addresses, roles, labels, verdicts)
- `data/launch-history.json` — 10-launch behavioral profile + timeline
- `data/launch-details.json` — per-launch deployer flows + early buyer lists
- `data/results/investigation-notes.json` — profit extraction routes (7 routes, $400K+ total)
- `data/results/cross-reference-report.json` — cross-launch recurring wallet analysis
- `data/rxrp-repump-buyers.json` — RXRP repump 22 buyer wallets with buy sequence
- `data/results/rxrp-repump-screen-results.json` — RXRP repump screening results (19 wallets)

Investigation scripts and raw API results archived in `archive/`.
