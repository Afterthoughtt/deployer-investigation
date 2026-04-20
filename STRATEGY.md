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

#### MoonPay on-chain fingerprint (validated 2026-04-19)

Every MoonPay-routed system.transfer on Solana, across MP1 **and** MP2, carries a distinctive transaction shape:

1. **`ComputeBudget.SetComputeUnitLimit = 14548`** (exact value, across all observations)
2. **`ComputeBudget.SetComputeUnitPrice`** varies 15,000–29,386 µlam/CU (network-congestion-dependent; not a fingerprint dimension)
3. **`system.transfer`** from MoonPay wallet → recipient
4. **`spl-memo`** instruction with data matching `/^[0-9a-f]{32}$/` — a 128-bit UUID (MoonPay's internal transaction ID), unique per tx
5. **Fee payer = transfer source** (MoonPay pays the network fee; the `SetComputeUnitLimit = ceil(consumed × 1.10)` implementation detail is what produces 14,548 on this specific instruction set)

**Empirical validation:**
- **10/10 matches** on confirmed MoonPay transfers: L10 deployer funding ($1,186), 2 user control buys ($25 each), 2 friend control buys ($25 each), 5 live candidates from 2026-04-17 (C1-C5, spanning both MP1 and MP2, $680–$2,110).
- **0/33 matches** on sampled outbound transfers from 10 Coinbase hot wallets (CB1-CB10) and 1 Binance hot wallet (`5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9`). Coinbase never sets `SetComputeUnitLimit` at all and never emits memos. Binance sets CU Limit at 10,000–30,000 (not 14,548) and also never emits memos.
- **0/126 matches** across miscellaneous non-MoonPay incoming transfers on two random wallets. Total non-MoonPay sample: 159 transactions, 0 collisions.

**NOT tested against:** Transak, Ramp Network, Simplex, Banxa (the four on-ramps still in `onramp_hot_wallets.unmapped`). If the deployer pivots to one of those, our `accountInclude` filter misses it regardless of fingerprint — this is an orthogonal gap.

**Operational uses:**
- **Confirmation** on existing MP1/MP2-triggered alerts — redundant for detection, but catches the "MoonPay updated their signer program" edge case (value would drift away from 14,548). If a MoonPay-sender event ever fails the fingerprint, that's a signal we need to re-verify MoonPay's current infrastructure.
- **Discovery of MP3+ rotation.** Any new Solana address producing the fingerprint to a fresh recipient is a MoonPay-hot-wallet candidate. Discovery requires broader chain scanning (not part of the WSS subscription) — implement only if we have reason to believe MoonPay rotated.

**NOT recommended as a runtime filter in the monitor.** Existing `accountInclude` on MP1+MP2 is already precise. Adding the fingerprint as a pre-alert gate adds code risk during a time-sensitive window with near-zero detection improvement.

**On-ramp pivot signatures to watch for (future L11+ cases):**

If the deployer abandons MoonPay for a different on-ramp, the observable on-chain shape changes per provider:

- **Transak** uses per-user persistent "Stream Wallets" after L2 KYC. A Transak-funded wallet is NOT funded from a rotating pool — the user's Stream Wallet is their persistent fulfillment address. Detection: if the same unlabeled wallet repeatedly funds the same end-user wallet over multiple purchases, that upstream wallet is a Transak Stream Wallet. Different pattern from MoonPay's static-pool model.
- **Ramp Network / Banxa / Simplex / Mercuryo** rotate per-transaction with no single public label. Detection requires Arkham entity clustering or a Nansen UI lookup — not readily fingerprintable from chain alone.
- **Coinbase Onramp** (distinct from Coinbase CEX withdrawals, but on-chain they look identical): fulfillment routes through the standard Coinbase Solana hot wallet pool already mapped in `data/network-map.json` under `onramp_hot_wallets.coinbase`. If the deployer reverts to Coinbase (L1–L9 history), we'd see CB1–CB10 as the funder — no fingerprint needed, `accountInclude` catches it.
- **Stripe crypto onramp** reportedly uses Coinbase or Fireblocks custody — expect Coinbase-cluster attribution or an unlabeled Fireblocks omnibus wallet.

**Verification scripts** (for re-running if we need to re-verify later):
- `src/audit/verify-l10-moonpay.ts` — re-extracts L10 baseline
- `src/audit/verify-control-moonpay.ts` — runs against arbitrary wallet addresses passed as CLI args
- `src/audit/fingerprint-candidates.ts` — checks the 5 live candidates in `l11.db`
- `src/audit/fingerprint-other-onramps.ts` — stress-tests against Coinbase + Binance outbound

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
- **L11 CONFIRMED (operator intel, 2026-04-20):** Token name **Nukex**, Saturday **April 25, 2026**, **14:00–18:00 EST** (as stated; April 25 is within US DST so treat as 18:00–22:00 UTC if EDT, 19:00–23:00 UTC if strict EST — both fall inside the historical 18:00–23:43 UTC L5+ deploy window).
- **Funding-window inference:** with the 12–17h funding-to-deploy gap, expect the funding event between **April 25 01:00 UTC and April 25 11:00 UTC** (envelope across both EST/EDT interpretations). With the 26h max-observed gap, earliest plausible funding is **April 24 16:00 UTC**.
- **Monitor must be fully armed by:** **April 24 16:00 UTC** at the latest.
- **Funding-to-deploy gap:** 12-17h (max observed: 26h)
- **Deploy window:** 18:00-23:43 UTC (L5+ pattern)

## Deployer Behavioral Fingerprint

| Parameter | Value |
|-----------|-------|
| Program | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` |
| Instruction | `create_and_buy` |
| Supply purchased | 30-35% |
| SOL spent (fresh wallet era) | 8.09-14.81 SOL |
| Supply-distribution wallets | 6 (receive SPL transfers from deploy wallet within seconds of deploy, to obscure on-chain supply concentration — NOT Jito bundle members) |
| Deploy mechanic | pump.fun UI "dev buy" (in-mint-tx instruction, not a Jito bundle); sometimes a second wallet self-snipes additional supply at block 0-1 |
| On-ramp history | Coinbase (L1-L9), MoonPay (L10), RXRP repump: Coinbase/MoonPay MP1+MP2/Bybit/Binance/Kraken/ChangeNOW/MEXC/Robinhood/FTX US |
| Token naming | XRP-themed memecoins |

## Architecture (TBD)

Polling vs. webhooks, alerting mechanism (Discord/Telegram/terminal), Bloom bot integration — to be decided in monitor development session.

## Data Files

All investigation findings are in these canonical files:
- `data/network-map.json` — wallet registry (~94 catalogued wallets, roles, labels, verdicts)
- `data/launch-history.json` — 10-launch behavioral profile + timeline
- `data/launch-details.json` — per-launch deployer flows + early buyer lists
- `data/results/investigation-notes.json` — profit extraction routes (7 routes, $400K+ total)
- `data/results/cross-reference-report.json` — cross-launch recurring wallet analysis
- `data/rxrp-repump-buyers.json` — RXRP repump 22 buyer wallets with buy sequence
- `data/results/rxrp-repump-screen-results.json` — RXRP repump screening results (19 wallets)

Investigation scripts and raw API results archived in `archive/`.
