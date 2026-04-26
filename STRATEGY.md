# Deployer Tracker Strategy & Investigation Framework

This file is the operational framework. `CLAUDE.md` covers identity, rules, and conventions. `MONITOR_BUILD_PLAN.md` covers the live daemon. Everything else (workflow, classification, provider playbook, detection vectors, current state) lives here.

---

## 1. Objective

Identify the deployer's L11 fresh wallet **after it gets funded** but **before `create_and_buy`** fires. Feed that address into the Bloom bot whitelist for a block-0 snipe.

Operational goal is **pre-deploy signal discovery**, not post-deploy attribution. Anything we learn about deployer infrastructure (treasury hubs, sniper-loading wallets, copy-trade candidates, re-arm events, control-channel dust, contamination paths) feeds that one objective.

---

## 2. L11 Confirmed Launch

Operator intel 2026-04-20 narrowed the prior April 20–30 community window to a date.

- **Token name:** Nukex
- **Date:** Saturday April 25, 2026
- **Stated window:** 14:00–18:00 EST (treat as 18:00–22:00 UTC if EDT, 19:00–23:00 UTC if strict EST — both inside the historical 18:00–23:43 UTC L5+ deploy window)
- **Funding-window inference:** with the 12–17h funding-to-deploy gap, expect funding between **April 25 01:00 UTC and April 25 11:00 UTC**. With the 26h max-observed gap, earliest plausible funding is **April 24 16:00 UTC**.
- **Monitor must be fully armed by:** **April 24 16:00 UTC**.

---

## 3. Investigation Philosophy

The next deployer wallet may be freshly funded through MoonPay or another on-ramp and may not be discoverable from old wallet history until funding or setup happens. Infrastructure work is still valuable because it uncovers the deployer's operational shadow — but that's instrumental to the pre-deploy signal goal, not the goal itself.

- **SOL/control-plane events are pre-deploy.** Funding, ATA/rent setup, Jito/priority-fee preparation, sniper re-arming, hub balance drops.
- **SPL/token transfers are post-deploy by default.** They prove control, map side wallets, expose obfuscation, and update the registry — but they usually arrive too late for entry. Treat as attribution evidence, not entry evidence.
- **Plan B is a proven deployer-controlled or deployer-adjacent sniper being loaded before launch.** Copy-trade candidates rank by transaction-level proof of deployer control, launch-window recurrence, funding provenance, current balance/re-arm state, and bot route similarity.
- **Figg outflows are first-class.** `FiggKseFrgdsk4u3TLpbPFLJDKbahqkJQKEchKcwYsNZ` to a fresh wallet in sniper-load size is launch preparation until proven otherwise (full cluster trace on the Figg entry in `data/network-map.json`).

---

## 4. Investigation Workflow

### 4.1 Three-pass review

Investigate any candidate wallet in three passes, escalating only when the prior pass produces a reason.

**Step 0 — verify the registry prior, don't inherit it.** Read the wallet's `data/network-map.json` entry at the start of every review. Treat the existing verdict, role, label, and notes as **a hypothesis to confirm against fresh on-chain data**, not a starting truth. The registry has been wrong before (past incidents: wrong-suffix addresses for CB1, hub_first_funder, FKjuwJzH, 2q8nSJgC's funder) — a stale prior carried forward silently becomes a false conclusion. If Pass A/B/C evidence disagrees with the prior, the grade follows the fresh evidence and the delta surfaces as a proposed registry change (`proposed_registry_change: true`).

**Pass A — cheap Helius screens (~1–10 credits each):**
- `getBalance` (current balance)
- `getTokenBalances` / `getTokenAccountsByOwner` (SPL holdings, returns all mints the wallet holds)
- `getTransactionHistory` in `signatures` or `raw` mode (recent activity)
- **Prior-launch participation check** — filter the wallet's token-account mint list against the 10 prior-launch CAs in `data/launch-history.json`. Any match → pull the earliest signature touching that token-account via `getSignaturesForAddress` and compute the delta against the launch's `created_utc`. Closed-ATA wallets miss here; if other evidence suggests participation, escalate to the Wallet API in Pass C.
- Stop here if the wallet is empty, dormant, off-cluster, AND never participated in a prior launch.

**Pass B — attribution and context (variable; bounded by guardrails):**
- For every counterparty surfaced during any transaction parse, cross-check against `data/network-map.json` before doing anything else. Matches trigger a separate review on that counterparty with its own classification block (per §4.4 lead-mining rules).
- Arkham `flow/address`, `history/address`, `portfolio/address`, `volume/address`, `transfers/histogram` — single-subject, time-bounded, no pagination
- Arkham `/transfers` rows only with Solana subject filter, explicit `limit ≤ 25`, time bound, no pagination
- Arkham single-address `intelligence/address` or `intelligence/address_enriched` only when attribution is the question (label-bucket scarce)
- Nansen profiler endpoints for corroboration: `current-balance`, `historical-balances`, `transactions`, `counterparties`, `related-wallets`
- Helius MCP for targeted single-tx parse or token-account ownership checks

**Pass C — expensive escalation (~100 credits each):**
- Helius Wallet API: `getWalletFundedBy`, `getWalletTransfers`, `getWalletHistory`, parsed `parseTransactions`
- Only for historically important wallets or wallets flagged by Pass A/B as worth the spend
- Also used to recover prior-launch participation when the cheap-path ATA check returns empty but other evidence suggests the wallet held and dumped the token (closed-ATA recovery)

**Default entrypoint:** `npm run audit:wallet-review -- ...` is dry-run by default. It prints the wallet list, investigation question, selected checks, and rough provider budget before any live call. Live calls require `--execute --question`. Older one-off scripts in `archive/scripts/audit-legacy/` are methodology reference only — don't reuse without inspecting their query shape and budget impact.

### 4.2 Operational scope vs canonical registry

- **`data/network-map.json`** is the canonical wallet registry. Single source of truth for known wallets, roles, verdicts, token accounts, program accounts, and notes.
- **`data/current-wallet-review-scope.json`** is the current operational shortlist for active reviews. Use it to narrow batches and live-call budgets. Not a registry replacement.
- Derived artifacts in `data/results/*.json` are evidence outputs. They may support a proposed network-map update but they do not silently replace or mutate the registry.
- Promotions to `data/network-map.json` require an explicit reviewed registry patch, never a silent merge.

### 4.3 Classification output schema

Every completed wallet investigation produces a classification block. The two axes are kept separate so a wallet can be a proven controller, a useful pre-signal hub, a copy-trade candidate, or post-deploy attribution evidence without one verdict hiding the rest.

```json
{
  "control_confidence": "confirmed | high | medium | low | unclassified",
  "operational_usefulness": "pre_deploy_signal | copy_trade_candidate | post_deploy_attribution | external_infra | do_not_use",
  "evidence_basis": [],
  "evidence_limits": [],
  "last_reviewed": "YYYY-MM-DD",
  "recommended_action": ""
}
```

**`control_confidence`:**
- `confirmed` — direct transaction-level evidence of deployer control or coordination (direct transfers with known deployer wallets, bidirectional settlement, token allocation plus SOL return, repeated launch-window coordination)
- `high` — multiple independent transaction-level links, repeated launch-window recurrence, or strong hub/sniper behavior with verified network counterparties
- `medium` — strong cluster adjacency, shared funder, bot-route similarity, or aggregate Nansen/Arkham overlap, but no direct deployer-wallet proof
- `low` — suspicious timing or partial overlap with a plausible independent explanation
- `unclassified` — not enough evidence, API-limited, stale, or not yet reviewed

**`operational_usefulness`:**
- `pre_deploy_signal` — can reveal fresh launch preparation before token creation
- `copy_trade_candidate` — proven or likely deployer-adjacent sniper/trader, useful if loaded before launch
- `post_deploy_attribution` — useful for proving control, side-wallet mapping, supply-obfuscation analysis, profit routing
- `external_infra` — fee wallets, token accounts, DEX pools, CEX deposits, bot routers, program accounts. Not control evidence by themselves.
- `do_not_use` — address poisoning, spoof vanity senders, known unrelated traders, stale false positives, resolved non-network wallets

**`evidence_basis` examples:** `direct_transfer_to_known_deployer`, `bidirectional_sol_flow`, `launch_window_recurrence`, `known_treasury_funding`, `bot_route_match`, `nansen_counterparty_match`, `arkham_bounded_transfer_match`, `prelaunch_rearm_signal`, `bundle_recipient_spl_transfer`, `prior_launch_open_market_buy_tight_timing`, `prior_launch_open_market_buy_loose_timing`, `prior_launch_multi_appearance_recurrence`, `counterparty_match_network_map`.

**Prior-launch participation grading ladder** (applied to the first wallet-involving transaction for each matched CA):

1. Wallet is signer on `create_and_buy` for the launch CA → `confirmed`. This is a deploy wallet; it should already be in network-map.
2. Wallet received the token as an **SPL transfer direct from the deploy wallet** (or from the deploy wallet's bundle source within ~1–2 blocks of deploy) → `confirmed` or `high`. Bundle recipients are explicitly selected by the deployer; this ranks higher than any open-market buy timing because the allocation is not publicly contestable. Single-launch hit is sufficient. Flag both `post_deploy_attribution` (for the original launch) and `pre_deploy_signal` (monitor for repeat L11 staging).
3. Open-market buy (swap via pump.fun / Jupiter / Raydium) at **0–10s** on L7–L10 → `high`.
4. Open-market buy at 0–10s on a single older launch (L4–L6) → `high` but weaker; needs other evidence to hit `confirmed`.
5. Open-market buy at **11–30s** on recent launches → `medium`.
6. Open-market buy at **30s+** or single appearance on L1–L3 → `low` or context-only.
7. Multi-launch appearance with mixed timings → aggregate toward `high` when two or more recent launches (L7–L10) are hit.

The first-tx parse is what distinguishes (2) from (3)–(6). Parse instruction type before grading: a `spl-token transfer` inbound is allocation, a swap is a buy.

The classification schema is guidance + an output shape. It is not yet a code-enforced field on registry entries. When proposing a registry patch, include the block as a structured note.

### 4.4 Lead mining rules

When reviewing a known wallet, leads are surfaced by fixed rules — never by ad-hoc judgment:

- known wallet funds an unknown wallet
- unknown wallet funds a known wallet
- shared funder with a known wallet
- known wallet reactivates after dormancy
- repeated counterparty overlap across multiple known wallets
- **any counterparty surfaced during a transaction parse that matches an entry in `data/network-map.json`** (not just repeated overlap — single-tx match is a lead)
- new collection-path sender into a known collection wallet
- new on-ramp route into a known wallet
- repeated appearance in launch-window time bands
- **appearance in any prior-launch `early_buyers` set or token-account history for a prior-launch CA** — membership alone is a lead; timing and instruction type drive grading per §4.3

Never auto-promote a lead into the cluster. Every lead becomes a separate review with its own classification block.

### 4.5 Writeup gate

Before publishing any investigation writeup, handoff, review artifact, or proposed registry patch:

```bash
npm run audit:primitive-integrity -- <file...>
npm run audit:claim-integrity   -- <file...>
```

The primitive scan protects exact on-chain values (no shortened/wildcarded/ellipsized addresses, sigs, mints, ATAs, slots). The claim scan protects the interpretation layer (no broad negative claims without scope; classified summaries reconcile with `data/network-map.json` before assigning conclusions). Fix every match before trusting the artifact. See `CLAUDE.md` for the underlying rules.

### 4.6 Context-window discipline

Raw provider responses do not belong in the model context by default. Store them on disk under `data/results/` and summarize.

- Wallet digest target: ~1,500 model tokens. If it can't fit, split the review into smaller evidence questions.
- Default display caps when surfacing results into the conversation: 10 signatures, 10 transfers, 10 token balances, 10 counterparties, 5 labels, 5 leads.
- Use progressive expansion: signature list → selected signature parse → evidence summary. Don't paste full parsed transactions unless that one transaction is the evidence.
- Use Helius `getTransactionHistory` in `signatures` or `raw` mode before parsed mode; parse only selected signatures.
- End every run with a compact handoff note (current hypotheses, spent credits, cached evidence locations, next cheapest useful query) — do **not** create a separate handoff doc; either update `data/current-wallet-review-scope.json` or surface the handoff in the conversation.

---

## 5. Pre-Deploy Signals to Prioritize

In rough rank order:

1. **MoonPay MP1/MP2 fresh-wallet funding** in deployer-size range (8–25 SOL) — primary fresh-wallet detection vector.
2. **Figg outflow to a fresh wallet** in sniper-load size — strongest known cluster pre-signal.
3. **Known sniper re-arming** (DmA9, 6zZ, BqP, Figg-cluster sniper set) — copy-trade candidates if loaded.
4. **Known hub or treasury → fresh wallet SOL load** in the relevant size range.
5. **Fresh wallet touching a known network wallet** before any token creation.
6. **Known network wallet dusting or funding fresh candidates** (control-channel signals — see the 2Zi-prefix vanity cluster precedent in `data/network-map.json`).
7. **Bot/router setup, ATA/rent activity, Jito tip or priority-fee preparation** by a wallet not yet active.
8. **Material SOL balance drops from proven hubs** during the funding window.

If SPL/token movement is what tips you off, the launch has probably already happened — for entry-relevant work, look for SOL and setup behavior before token creation.

---

## 6. Detection Vectors

### Vector A: MoonPay Sieve (PRIMARY)

**Rationale:** L10 used MoonPay MP1 → fresh wallet. Most likely path for L11.

**Two confirmed MoonPay customer-facing wallets on Solana** (MP2 discovered 2026-04-03 via RXRP repump funder chain tracing):

| Wallet | Address | Status |
|--------|---------|--------|
| MP1 | `Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6` | Confirmed customer-facing. Funded L10 deployer + RXRP wallet (2Nzwpdro entry in network-map.json). |
| MP2 | `5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1` | Confirmed customer-facing. Separate Binance-8 supply chain. Funded RXRP intermediary `FiggKseFrgdsk4u3TLpbPFLJDKbahqkJQKEchKcwYsNZ`. |
| MP4 | `AFKxebx96mnt1yn1ek6mcxeGDHmfrAWzo2h1fVdrrvWE` | Treasury only — funds MP1/MP2 refills. Do **not** monitor. |
| MP3 | — | **Confirmed non-existent** on Solana per Arkham 90d `/transfers?from=moonpay` enum 2026-04-21. MP1 + MP2 are the complete customer-facing SOL set. |
| MP5 candidate | `EGnQqe6MPvvNYWLPHtk9mKpbtEQkv4nA7nTeENtViM4z` | Arkham "Cold Wallet" (distinct from Hot Wallet label). 518.81 SOL + $240K USDC. One 2,000 SOL outflow in 90d = treasury-class. Pending verification. Do **not** monitor until verified customer-facing. |

MP2 has a completely separate supply chain from MP1 (Binance 8, not MP4/Bitstamp/FalconX). That's why two prior searches missed it — MP2 doesn't appear in MP4's outflows. Both MP1 and MP2 must be monitored for L11.

**Filter — SOL path (ALL must match):**
- Amount: 8–25 SOL (L4+ range was 8.09–14.81; widened for safety)
- Recipient: 0 prior signatures (fresh wallet)
- Recipient: 0 prior balance

**Filter — USDC path (fallback):** If the deployer buys USDC instead of SOL, USDC arrives from MP1's USDC ATA `4FoRA1uLBcE31TC799djhLt3rqpGuh2gV9C5KdvLgUPg`, not from MP1/MP2 directly. Recipient swaps USDC → SOL on a DEX before deploying. Monitor MP1's USDC ATA for outflows of ~$1,000–3,500 USDC to fresh wallets. Lower likelihood (10/10 historical launches used direct SOL), but it bypasses the SOL sieve.

**Expected noise:** MoonPay processes thousands of transactions, but the fingerprint (8–25 SOL to a zero-history wallet) has a low false-positive rate. Candidates can be triaged in the 12–17h pre-deploy window.

#### MoonPay on-chain fingerprint (validated 2026-04-19)

Every MoonPay-routed `system.transfer` on Solana — across MP1 and MP2 — carries a distinctive shape:

1. **`ComputeBudget.SetComputeUnitLimit = 14548`** (exact value, every observation)
2. `ComputeBudget.SetComputeUnitPrice` varies 15,000–29,386 µlam/CU (network-congestion-dependent; not a fingerprint dimension)
3. `system.transfer` from MoonPay wallet → recipient
4. `spl-memo` instruction with data matching `/^[0-9a-f]{32}$/` — a 128-bit UUID (MoonPay's internal transaction ID, unique per tx)
5. Fee payer = transfer source. (MoonPay pays the network fee; the `SetComputeUnitLimit = ceil(consumed × 1.10)` implementation detail is what produces 14,548 on this specific instruction set.)

**Empirical validation:**
- 10/10 matches on confirmed MoonPay transfers: L10 deployer funding ($1,186), 2 user control buys ($25 each), 2 friend control buys ($25 each), 5 live candidates from 2026-04-17 (C1–C5, spanning both MP1 and MP2, $680–$2,110)
- 0/33 matches on sampled outbound from 10 Coinbase hot wallets (CB1–CB10) and 1 Binance hot wallet (control sample). Coinbase never sets `SetComputeUnitLimit` and never emits memos. Binance sets CU Limit at 10,000–30,000 (not 14,548) and never emits memos.
- 0/126 matches across miscellaneous non-MoonPay incoming on two random wallets. Total non-MoonPay sample: 159 transactions, 0 collisions.

**Not tested against:** Topper, Banxa, Transak (the three Phantom on-ramps deprioritized per project scope). If the deployer pivots to one of those, our `accountInclude` filter misses regardless of fingerprint — orthogonal gap. Prior list included Ramp Network + Simplex + Mercuryo; those are not Phantom providers and were dropped from scope 2026-04-21.

**Operational uses:**
- Confirmation on existing MP1/MP2-triggered alerts — redundant for detection but catches the "MoonPay updated their signer program" edge case (value would drift away from 14,548).
- Discovery of MP3+ rotation. Any new Solana address producing the fingerprint to a fresh recipient is a MoonPay-hot-wallet candidate. Discovery requires broader chain scanning, not the WSS subscription — implement only if there's reason to believe MoonPay rotated.

**Not recommended as a runtime monitor filter.** Existing `accountInclude` on MP1+MP2 is already precise. Adding the fingerprint as a pre-alert gate adds code risk during a time-sensitive window with near-zero detection improvement.

**On-ramp pivot signatures (future cases):**
- **Transak** — per-user persistent Stream Wallets after L2 KYC. A Transak-funded wallet is not funded from a rotating pool. Detection: same unlabeled wallet repeatedly funding the same end-user wallet across multiple purchases → that upstream is a Transak Stream Wallet. Different pattern from MoonPay's static-pool model.
- **Topper / Banxa** — rotate per-transaction with no single public label. Detection requires Arkham entity clustering or a Nansen UI lookup; not readily fingerprintable from chain alone.
- **Coinbase Onramp** — fulfillment routes through the standard Coinbase Solana hot wallet pool already mapped under `onramp_hot_wallets.coinbase` in `data/network-map.json`. If the deployer reverts to Coinbase (L1–L9 history), CB1–CB10 catch it via `accountInclude`.
- **Stripe crypto onramp** — reportedly uses Coinbase or Fireblocks custody. Expect Coinbase-cluster attribution or an unlabeled Fireblocks omnibus wallet.

### Vector B: Network Intermediary Watch (SECONDARY)

**Rationale:** L4–L9 used network intermediaries. Deployer could revert. These wallets already hold SOL.

**Updated 2026-04-04** (RXRP repump investigation surfaced 14 intermediaries, 19 buyers, 3 Bubblemaps cluster wallets). The current Tier-A operational shortlist lives in `data/current-wallet-review-scope.json`. Highlights with significant SOL balances at last check:

| Label | Address | Last-known SOL | Role |
|-------|---------|----------------|------|
| 7JCe3GHw | `7JCe3GHwkEr3feHgtLXnmuJ1yB3A7coSeyynxTBgdG8k` | 224.7 | RXRP buyer, Coinbase-funded, Trading Bot |
| 7iVCXQn4 | `7iVCXQn4u6tiTEfNVqbWSEsRdEi69E9oYsSMiepuECwi` | 220.9 | RXRP buyer, Coinbase-funded, Trading Bot |
| GgFVQNY5 | `GgFVQNY5hck2WMFtpVeWi37yQKepyHLqLD8eZ3nmLvKH` | 112.7 | Collection wallet, relay chain convergence |
| 54Pz1e35 | `54Pz1e35z9uoFdnxtzjp7xZQoFiofqhdayQWBMN7dsuy` | 94.2 | RXRP buyer, user-labelled insider, FTX US chain |
| AZ57WTNM | `AZ57WTNMivT9gjifWcjMRB5K4Eti9P64zhqKEcoUae1x` | 47.6 | RXRP buyer, Robinhood-funded |
| 7RLD6F9S | `7RLD6F9SiFvtdqW4bYpy4m8D3mum7xVdZUSjzv1TWJaf` | 43.79 | Fireblocks, Hub-funded |
| 7cthuERB | `7cthuERBfeNaXrK3vhuKFVdg93X7wuT89MNyNaKgFoYh` | 27.9 | RXRP buyer, ChangeNOW-funded (no-KYC) |
| BvYi1ZV9 | `BvYi1ZV99g2Sr8qbZL7hf4zm2hdUnUC47dgcT5WZDZ9J` | 15.7 | RXRP buyer + L10 early buyer, Binance 8 chain |
| 6zZAKeF5 | `6zZAKeF5zftUZHCkoWpno6MbaX2LrLwYBCFaEwLLaFDk` | 0.013 | Figg-cluster L10 sniper, currently drained |
| FiggKseF | `FiggKseFrgdsk4u3TLpbPFLJDKbahqkJQKEchKcwYsNZ` | 16.62 | Sniper-cluster treasury (MP2-seeded) — first-class pre-signal source |
| CSEncqtq | `CSEncqtqbmNRjve42sNnbs5cCSmrjUNsAEwc17XY2RCs` | TBD | CoinSpot exchange hot wallet, feeds insider |

Balances last verified between 2026-03-31 and 2026-04-23. Re-verify before monitor goes live.

**Signal quality:** any of these wallets sending 8–25 SOL to a zero-history address is extremely high signal. Watchlist composition is operational; canonical roles live in `data/network-map.json`.

**Credit cost:** `getBalance` polling (1 credit each). Escalate to `getSignaturesForAddress` (10 credits) only if balance decreases. Very cheap.

### Vector C: Copy-Trade Backup (INSURANCE)

**Rationale:** if A and B both miss, still get entry within seconds/minutes (not block-0).

**Strongest copy-trade candidates:**

| Label | Address | Status |
|-------|---------|--------|
| BqP79Wmk | `BqP79WmkKFRytsrWCqY2ra4n5XzUxQjTf45rHy7rkgtC` | Deployer's personal trading wallet. Trades all 9 tokens across 10 launches. L10: buyer #24 at +6 seconds ($689). 0 SOL currently — refunding is itself a signal. |
| GoonPump | `231fshU82vSSeyytyCZJUEUG8Ti3UAgnDSoNFGTETCuK` | BqP79Wmk's funder. GoonPump → BqP79Wmk SOL transfer = launch likely imminent. |
| DmA9JabH | `DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn` | CoinSpot insider trading wallet. Sniped L9+L10 block-0 via BloomBot. **Re-armed for L11 by SUSYE deployer 2026-04-22 (1.972 SOL) bracketed by 2Zi-prefix vanity dust pings.** Highest-value copy-trade candidate if it stays loaded. |
| 4916Nkdu | `4916NkdubkfRyHkxkCR7rpVGz5dvzVdK161mg4jXDwRh` | CoinSpot insider token trading wallet. Receives bundled tokens from Bundle 1 only. May not show in open-market buys. |

**Decision still open:** which set to feed into a copy-trade execution engine. The DmA9JabH wallet (full primitive in the Vector C table above) is the strongest single candidate today; the BqP79Wmk wallet is the most launch-recurrent but requires re-funding first.

---

## 7. Deployer Behavioral Fingerprint

| Parameter | Value |
|-----------|-------|
| Program | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` |
| Instruction | `create_and_buy` |
| Supply purchased | 30–35% |
| SOL spent (fresh wallet era L4–L10) | 8.09–14.81 SOL (sieve widened to 8–25 for safety) |
| Funding-to-deploy gap | 12–17h (max observed: 26h) |
| Deploy window (L5+) | 18:00–23:43 UTC |
| Cadence | ~Monthly. L10 was March 15. L11 confirmed April 25 (Nukex). |
| Supply-distribution wallets | 6 (receive SPL transfers from deploy wallet within seconds of deploy, to obscure on-chain supply concentration — **not** Jito bundle members) |
| Deploy mechanic | pump.fun UI "dev buy" (in-mint-tx instruction, not a Jito bundle); sometimes a second wallet self-snipes additional supply at block 0–1 |
| On-ramp history | Coinbase (L1–L9), MoonPay (L10), RXRP repump used Coinbase/MoonPay MP1+MP2/Bybit/Binance/Kraken/ChangeNOW/MEXC/Robinhood/FTX US |
| Token naming | XRP-themed memecoins |

---

## 8. Provider Playbook

### 8.1 Helius

Cheap-screen-first. Escalate to expensive APIs only when cheap screens produce a reason.

| Class | Endpoints | Credits | When |
|-------|-----------|---------|------|
| Standard RPC | `getBalance`, `getAccountInfo` | 1 | Pass A. First-pass balance and account checks. |
| DAS | `getTokenBalances`, `getAssetsByOwner`, `getAsset`, `getTokenAccounts` | 10 | Pass A. SPL holdings, asset lookups. |
| Standard tx | `getSignaturesForAddress`, `getTransaction` | 10 | Pass A. Activity recency and individual tx parse. |
| Enhanced parse | `parseTransactions`, parsed `getTransactionHistory` | 100 | Pass C. Use `signatures`/`raw` mode first, parse selected only. |
| Wallet API | `getWalletIdentity`, `batchWalletIdentity`, `getWalletBalances`, `getWalletHistory`, `getWalletTransfers`, `getWalletFundedBy` | 100 | Pass C. Only after cheap screens flag the wallet. |

**Rate limits:** Standard RPC 50 req/s (no delays needed). Wallet API / Enhanced 10 req/s (add 100ms delays for bulk).

**MCP policy:** Standalone Helius MCP is approved for bounded read-only wallet investigation and Helius documentation checks. Live MCP work must name the wallet list, investigation question, and rough call budget before execution. No transaction sending, keygen/signup/onboarding, webhook mutation, API-key-setting, or signing-capable tools without explicit per-task approval. See `CLAUDE.md` for the full prohibitions list.

### 8.2 Arkham — red-zone posture

**Two separate scarce surfaces:** general API credits may be extended, but the intel label lookup bucket is hard-capped. Live state as of 2026-04-24: **8,077 / 10,000 intel label lookups used; 1,923 remaining** before the 2026-05-04 trial reset/end. Re-verify per session via `GET /subscription/intel-usage`.

**Two billing models:**
- Per-call endpoints charge a fixed weight.
- Per-row endpoints (`/transfers`, `/swaps`) charge `weight × rows returned`. Prior incident: 172 `/transfers` calls returned 69,845 rows at 2 credits/row = 139,690 credits — calls weren't the problem, rows were.

**Default guardrails** (`src/audit/utils.ts` + `src/audit/arkham-guardrails.ts`):
- `ARKHAM_LABEL_LOOKUP_RUN_BUDGET=0` blocks all label-bucket-consuming calls. Set to a small positive value only for an explicitly approved run.
- `ARKHAM_DATAPOINT_RESERVE=2000` blocks any label-bucket call once live remaining (from `X-Intel-Datapoints-Remaining`) would fall below reserve.
- Row endpoints require: Solana-only subject filter (`chain`/`chains=solana`), one of `base`/`from`/`to`, explicit `limit ≤ ARKHAM_ROW_LIMIT_MAX` (default 25), no pagination, time lower-bound or `timeLast`.
- `ARKHAM_ROW_CREDIT_RUN_BUDGET=200` caps row-billed credits per process.
- Batch intel requires `ARKHAM_ALLOW_BATCH_INTEL=1`.
- Pagination requires `ARKHAM_ALLOW_ROW_PAGINATION=1`.

**Cheap default surface (per-call, label-safe enough for default use):**

| Endpoint | Cost | Use |
|----------|------|-----|
| `/intelligence/address/{address}` | 1/call | First-pass exact-address intelligence |
| `/intelligence/address_enriched/{address}` | 2/call | Preferred enriched single-address attribution |
| `/intelligence/entity_predictions/{entity}` | 1/call | Attribution drift / entity expansion |
| `/history/address/{address}` | 1/call | Use before transfer rows when historical state is enough |
| `/portfolio/address/{address}` | 1/call | Cheap portfolio context |
| `/portfolio/timeSeries/address/{address}` | 2/call | Targeted historical balance |
| `/flow/address/{address}` | 2/call | Aggregate flow before row-level transfers |
| `/volume/address/{address}` | 1/call | Activity magnitude screening |
| `/transfers/histogram/simple` | 2/call | Probe before any `/transfers` rows |
| `/transfers/histogram` | 4/call | Use when simple histogram is insufficient |
| `/tx/{hash}`, `/transfers/tx/{hash}` | 2/call | Known transaction hashes only |
| `/counterparties/entity/{entity}` | 50/call | Use sparingly. Verified working on Solana 2026-04-21 — MoonPay entity returned 9 Solana upstream liquidity sources via `flow=in/out`. |
| `/counterparties/address/{address}` | 50/call | Solana support unverified on the current trial. |

Full reference in `docs/arkham_docs.md`. Forbidden by default: `POST /intelligence/address_enriched/batch/all` (1000/call), `POST /intelligence/address/batch/all` (500/call), broad `/transfers`, broad `/swaps`, `POST /ws/sessions` (500/call), update-feed polling, row pagination, row endpoints without time bounds.

**Solana-specific quirks:**
- Arkham clustering is not populated on Solana. Don't expect cluster-level attribution.
- Some addresses well-labeled in Nansen return null entity/label on Arkham. Observed 2026-04-21 P0.5: hub wallet `v49jgwyQy9zu4oeemnq3ytjRkyiJth5HKiXSstk8aV5` (Fireblocks Custody per prior Nansen) and `CSEncqtqbmNRjve42sNnbs5cCSmrjUNsAEwc17XY2RCs` (CoinSpot per prior Nansen) both null on Arkham. Cross-reference between providers when attribution matters.
- MoonPay-on-Solana attribution gap that existed pre-trial-expiry has closed — Arkham now labels MP1, MP2, MP4 correctly as MoonPay entity.

### 8.3 Nansen — corroboration role

Default role is corroboration, not source of truth. Use it to confirm balances, transactions, counterparties, related wallets, and PnL when Helius and Arkham leave a gap.

- Base URL: `https://api.nansen.ai/api/v1`. All endpoints `POST`. Auth: `apiKey` header.
- Rate limits: 20 req/s, 500 req/min (temporary 300/min incident limit noted in local docs). Add 1.5–2s delays between calls in bulk.
- Max 3–4 day date range on `/profiler/address/transactions`.

Allowed profiler endpoints (most cost 1 credit):
- `/profiler/address/current-balance`
- `/profiler/address/historical-balances`
- `/profiler/address/transactions`
- `/profiler/address/related-wallets`
- `/profiler/address/pnl-summary`, `/profiler/address/pnl` (optional, trader-quality context)
- `/profiler/address/counterparties` (5 credits)

Forbidden by default:
- `/profiler/address/labels` (500 credits) — duplicates Arkham's primary attribution role and free Nansen UI lookup. Critical use only.

Important quirks:
- Counterparty volumes are aggregated, not individual transactions. Always verify at tx level (Helius parse) before treating as evidence.
- Counterparties can include program accounts (bonding curves, pools, vaults) and token accounts (ATAs), not just wallets. Before profiling any counterparty: parse a tx involving it, check signer/fee-payer, and verify `isUserAddress` via Arkham. Past examples: DLGHPXKF and E2NnJHhc appeared as OG deployer counterparties but were its WSOL ATAs (use full primitives from `data/network-map.json` when citing).
- `tgm/dex-trades` does not support `trader_address` filter — silently returns empty. To check a wallet's trades on a token, pull all trades for the token and filter client-side, or use Helius.

### 8.4 Cost discipline

- Estimate cost before every live call. Cheap-first ordering: existing artifacts → Helius cheap screen → bounded Arkham flow/row evidence → targeted attribution only when it answers the wallet-space question.
- Autopagination off by default for every provider.
- Cache by provider + endpoint + normalized params + time window + primitive set. Reuse cached evidence before any repeat query.
- Stop at run/provider/wallet caps even if the investigation is incomplete. If a cap stops a branch, surface the wallet-space question still open — never silently narrow scope or convert "not enough coverage" into "not connected."
- Default run caps when not explicitly raised: Arkham 250 credits/run (with the row + label-bucket sub-caps above), Helius 500 credits/run, Nansen 100 credits/run.

---

## 9. Active State

### 9.1 Tier-A operational shortlist

Canonical list lives in `data/current-wallet-review-scope.json`. Eight Tier-A wallets at last update (2026-04-24):

1. `FiggKseFrgdsk4u3TLpbPFLJDKbahqkJQKEchKcwYsNZ` — pre-deploy outflow hub
2. `DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn` — copy-trade if re-armed
3. `2Zizao3xpJGsoUFdvTJjYL8LijtFxR9v36cNBeDJJVSz` — known re-arm source for DmA9
4. `6zZAKeF5zftUZHCkoWpno6MbaX2LrLwYBCFaEwLLaFDk` — MoonPay-chain sniper, copy-trade if re-armed
5. `BqP79WmkKFRytsrWCqY2ra4n5XzUxQjTf45rHy7rkgtC` — deployer personal trading wallet
6. `GgFVQNY5hck2WMFtpVeWi37yQKepyHLqLD8eZ3nmLvKH` — relay convergence wallet
7. `Bra1HUNKj1tcM3iKnL3pHc2m1rXkXZ9JELq4ceivag34` — deployer-network consolidation hub
8. `7ciGXut2rzyZeuRQjMZZ33gmyyT6JWaVKvEcTHNS5ny7` — largest Figg-cluster sniper

MP1 and MP2 are out-of-scope for review batches because the live monitor handles them. Revisit during monitor coverage review.

### 9.2 Strongest current evidence (summary; details in network-map.json)

- Figg cluster trace (see `network-map.json`, FiggKseFrgdsk4u3TLpbPFLJDKbahqkJQKEchKcwYsNZ entry): full trace of 481 outbound tx, 178 recipients. Eleven-plus sniper cluster on a ~10-month self-sustaining loop seeded by MP2 (1.321 SOL on 2025-07-08). Direct paths into known deployer wallets via two routes: (a) one-off Figg → L7 deployer (4.557 SOL); (b) Figg → pNd bridge → L9 deployer → Bra1 hub. Figg → fresh wallet in 1–15 SOL range = cluster sniper being loaded.
- 6zZAKeF5 L10 snipe verified (see `network-map.json`, 6zZAKeF5zftUZHCkoWpno6MbaX2LrLwYBCFaEwLLaFDk entry): block-0 BloomBot snipe of XAIC with full sig + amounts captured. Bidirectional Figg ↔ 6zZ profit cycling. Wallet currently drained.
- DmA9 L11 pre-arm (see `network-map.json`, DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn entry): 1.972 SOL from SUSYE deployer 2026-04-22 12:59:11 UTC, bracketed by dust pings from the 2Zi-prefix vanity cluster (catalogued under `signal_wallets_2zi_cluster`) — first internal-network funding (non-CoinSpot). Strongest single copy-trade candidate.
- MoonPay coverage (see §6 Vector A above): MP1 + MP2 are the complete confirmed customer-facing SOL set on Solana. MP3 confirmed non-existent. Both monitored by live daemon.

### 9.3 Known issues

- **`data/network-map.json` schema hygiene:** several Figg-cluster entries (e.g. `pNdKKMjG_bridge`, `83Nf4kNb_relay`, `9Qf2E4Ct_sniper2_accumulator`, `2wGZCehk_kraken_pre`) live under the `not_network` section while their `verdict` is `"network"`. Tools that treat `section === "not_network"` as unusable will undercount real Figg-cluster links. Do not silently move them; propose a reviewed schema patch.
- **Classification schema not yet code-enforced:** the `control_confidence` / `operational_usefulness` block in §4.3 is guidance + an output shape. It is not yet a field on registry entries.

---

## 10. Data Files

Canonical:
- `data/network-map.json` — wallet registry (~147 wallets, roles, labels, verdicts)
- `data/launch-history.json` + `data/launch-details.json` — 10-launch behavioral profile + per-launch deployer flows + early buyer lists

Operational:
- `data/current-wallet-review-scope.json` — current operational shortlist (non-canonical)
- `data/results/*.json` — evidence outputs from individual investigations

Historical:
- `data/results/investigation-notes.json` — profit extraction routes (7 routes, $400K+ total)
- `data/results/cross-reference-report.json` — cross-launch recurring wallet analysis
- `data/rxrp-repump-buyers.json` — RXRP repump 22 buyer wallets with buy sequence

Reference:
- `docs/arkham_docs.md` — full Arkham API (read on demand)
- `docs/nansen_docs.md` — full Nansen API (read on demand)
- Helius docs via the Helius MCP / skills / agents

---

## 11. Architecture

The live monitor (Helius Enhanced WSS daemon, SQLite + Telegram, deployed on VPS) is documented in `MONITOR_BUILD_PLAN.md`. Out of scope for this file.
