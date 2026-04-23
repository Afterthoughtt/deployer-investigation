# L10 Investigation — Working Doc

Temporary. Canonical wallet facts → `data/network-map.json`. Launch-level facts → `data/launch-details.json`. Delete when L10 wraps.

## Status

| Phase | State |
|---|---|
| 0 – First-minute trade log | ✅ done |
| 1 – Deployer flow | ✅ done |
| 2 – Per-wallet probes | 🟡 in progress (6 MP1 siblings + 37X done; 6 beneficiaries + 18 Phase 2 wallets queued) |
| 3 – Cross-reference | ⏸ deferred |
| 4 – Writeback | ⏸ deferred |

## Closed

- **2mZ (L10 deployer)** — canonical entry in `network-map.json` `deployers.L10`. Post-deploy tail + dust-spray scanned 2026-04-20; no fresh-wallet leak (profit consolidated to L7 deployer — known behavior).
- **6 MP1 ±1h siblings (L10 funding window)** — all 6 adjudicated 2026-04-20. 0/6 match deployer M.O. Five unrelated (retail on-ramp / MoonPay custodial settlement / retail DeFi power-user / recurring retail funnel / retail self→self shuttle), one classified retail-flavor intermediary (`BwLZ3Kgo…`). MP1 8-25 SOL band ≠ deployer-only signal at the ±1h granularity — cohort is genuinely retail-heavy. Verdicts in findings section (lines 104-106, 153-171). MP1 sibling outflow cohort preserved in `/tmp/mp1_outflows.json` + `/tmp/mp1_outbound_window.json` pending network-map cross-check.
- **37X adversarial review (2026-04-21)** — initial "established-side-wallet-candidate" framing **OVERTURNED** (high conf). Independent review found 37X is the **L1 deployer** itself: signed the CREATE tx for L1 mint `2rQcoMECcsU3UBNfpsUxegnHc9js7usb2XagwUK3pump` at `2025-06-15T15:57:57Z` with `create_and_buy` fingerprint (37X as fee-payer, 0.396 SOL dev-buy, 13.98M tokens back to its ATA `CoZQLAgyvM7Hs49gfdEPcnjYA5RFh9rdPWKfyikmPFH4`). Network-map already correctly labels 37X as "OG Deployer" `infrastructure`/`network` — **no writeback needed**. The initial "recurring recipient of dev-buy allocations across L6-L9" observation is a secondary topological fact, not a primary role. Adversarial review also flagged 37X as higher-priority monitor target than side-wallets; repeat-CREATE event on 37X → Bloom whitelist promotion candidate. Follow-up probes (DuCz, 2mZz 2nd deploy, DeJBGdM bundler program) still pending — moved below.

## Next (ordered)

**1. 6 profit-consolidation beneficiaries from 37X downstream.** Hop-2 XAIC sells landed SOL proceeds on *different* wallets than the XAIC holders — originally hypothesized as operator-controlled beneficiaries. **⚠ Category-error risk surfaced 2026-04-21:** review of `GMCJvYGf…` returned *not a wallet* — it's a **GoonPump USDC/WSOL pool PDA** (`isUserAddress: false`, owned by `goonuddtQRrWqqn5nFyczVKaie28f3kDkHWkHtURSLE`), and its WSOL reserve ATA is `8ncU5YW1…`, another "beneficiary" in this list. If more of the 6 are pool reserves/ATAs/PDAs, the "operator beneficiaries" framing collapses into "XAIC was sold into public AMM liquidity and SOL came from the pools' reserves." Matches CLAUDE.md warning: "Nansen counterparties can include program accounts (bonding curves, pools, vaults) AND token accounts (ATAs), not just wallets." Verdicts below, full re-assessment once all 6 return.

- ✅ `YAh1vvZPnuCjZ354LF8ria76cJaSEPvPyPYuRoxVkuH` — **not a wallet** (ZeroFi AMM WSOL vault, `isUserAddress: false`, 165-byte SPL token account; initialized 2026-02-20 by same ZeroFi operator `wThDvoEs8SHQgfU4UHdDDwQduhU2Yo5xJbHNcYGAxvE` as CdeigPna — sibling vaults under `ZERor4xhbUycZ6gb9ntrhqscUcZmAbQDjEAtCf4hbZY`). Unrelated.
- ✅ `8ncU5YW1CQwvr4gs7buH57bW58e86TDau4STrCJBuz8z` — **not a wallet** (GoonFi v2 AMM pool WSOL ATA; `parsed.info.owner` = GMCJ PDA, ultimate program owner `goonuddtQRrWqqn5nFyczVKaie28f3kDkHWkHtURSLE`). Confirmed as pre-flagged. Unrelated.
- ✅ `GMCJvYGf5Ex2ARiMquaBDqU6iKM8uiEQkB8jCnoNfHpC` — **not a wallet** (GoonPump USDC/WSOL pool PDA, ~$353K USDC + ~$406K WSOL reserves). Unrelated (category error). No network-map entry needed.
- ✅ `CdeigPnaYwWLqqmZ9u4Spxk8nPaDFyFQwjNuGzuJjJP6` — **not a wallet** (Zeroswap AMM WSOL vault, `isUserAddress: false`, 165-byte SPL token account created 2025-12-22 by Zeroswap program `ZERor4xhbUycZ6gb9ntrhqscUcZmAbQDjEAtCf4hbZY`). Unrelated (category error).
- ✅ `51FQwjrvo8J8zXUaKyAznJ5NYpoiTCuqAqCu3HAMB9NZ` — **not a wallet** (BisonFi POOLSTAT PDA for `SOL-USDC-Pool1`, owned by program `BiSoNHVpsVZW2F7rx2eQ59yQwKxzU5NvBcmKshCSUypi`; created by BisonFi operator `Labu6tAuwzpTvoq6hq6p5r7AxMBgtbvpxW4mMHwXieo`, OKX-funded). Unrelated.
- ✅ `FxGiN5NkigicwrnFshZEAUH9C13yrBALmgYxA9x8sfnQ` — **not a wallet** (BisonFi WSOL ATA owned by `51FQwjrvo8J8zXUaKyAznJ5NYpoiTCuqAqCu3HAMB9NZ`, same cluster under operator `Labu6tAu…`). Unrelated.

**Summary (all 6 beneficiaries adjudicated, 2026-04-21): 6/6 are AMM pool infrastructure, not operator-controlled wallets.** Grouped by protocol:
- GoonFi v2 (`goonuddtQRrWqqn5nFyczVKaie28f3kDkHWkHtURSLE`): `GMCJvYGf…` pool PDA + `8ncU5YW1…` its WSOL reserve ATA.
- ZeroFi (`ZERor4xhbUycZ6gb9ntrhqscUcZmAbQDjEAtCf4hbZY`, operator `wThDvoEs8SHQgfU4UHdDDwQduhU2Yo5xJbHNcYGAxvE`): `CdeigPna…` + `YAh1vvZP…` WSOL vaults.
- BisonFi (`BiSoNHVpsVZW2F7rx2eQ59yQwKxzU5NvBcmKshCSUypi`, operator `Labu6tAuwzpTvoq6hq6p5r7AxMBgtbvpxW4mMHwXieo`): `51FQwjrv…` POOLSTAT PDA + `FxGiN5Nk…` its WSOL ATA.

**⚠ The "profit-consolidation beneficiaries" hypothesis collapsed in two ways:**
1. **Category error (all 6):** These are public AMM pool reserves. XAIC holders sold XAIC into these pools; SOL "landed on different wallets" because the pool reserves held WSOL. The operator-controlled wallets that actually received SOL were the **fee-payer/signer wallets of those swap transactions** — not investigated yet, and not in this list.
2. **Chronology error (BisonFi subset):** Review found BisonFi cluster was fully dormant until 2026-04-01. It was not operational on 2026-03-15, so cannot have received any L10 sell proceeds. Whatever source surfaced 51FQ/FxGiN5 as L10 beneficiaries was wrong about chronology too.

**Next (if revisiting this downstream branch):** re-do the 37X hop-2 analysis with `isUserAddress` verification on every surfaced counterparty, and re-target the actual XAIC-sell-tx signers — not the pool accounts. Also update CLAUDE.md pattern: the DLGHPXKF/E2NnJHhc warning is now 7+ instances demonstrating the ATA/PDA-as-counterparty failure mode (the original OG-deployer case plus these 6).

**2. Phase 2 — 11 user-listed wallets + 7 NET-NEW Bloom first-minute buyers.** Sequential, fresh-context, upstream-first → siblings → snipers.

Pre-validation against `data/network-map.json` (grep existence only, no verdict/label read) completed 2026-04-20:
- 6 already in network-map → Phase 3 CONVERGENT/DIVERGENT adjudication after fresh verdicts: chrisV, CSEncqtq, DmA9Jab, 5F1se, FiggKs, 6zZAKe
- 5 NET-NEW: 5tzFki, D4tU7, 7D3Hz, 27eJAS, 7Dkvx

**Phase 2 triage method change (2026-04-21):** per-target deep review burned too much context. Switched to batched RPC triage (`getBalance` + `getAccountInfo` + `getSignaturesForAddress` limit=1000) for remaining 13 wallets; only #1-#2 were deep-profiled.

User-listed (execution order):
1. ✅ `5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9` — **Binance Hot Wallet 2** (Helius + Arkham agree, 1.73M SOL, first-funded 2022-05-23). Phase 4: role=`onramp`, verdict=`not_network`. *(NET-NEW)*
2. ✅ `D4tU7mrfyuw3yRGeeB643EfFQYXSAMKeiJ7mVeYicBNv` — Initial verdict `unrelated`. First-funded 2026-03-04 by `5tzFki` (4.13 SOL across two legs). 2,365 sigs over 44 days = retail Bloom sniper; fired 7 PUMP_FUN swaps over 65s at L10 deploy via `b1oomGGqPKGD6errbyfbVMBuzSC8WtAAYo8MwNafWW1`. 8m42s post-deploy sent 9 SOL to same-operator sister `6U5EnkgZfSxwGaXDhuDxaxjZAmkiMoYvzgCPCtZJmzvs`. Phase 4: role=`insider`, verdict=`possible_associate`. *(NET-NEW)*
3. ✅ `7D3HzSsNWaz17gNrcu9m7Kg74niUWikTTjAdiW65vCvD` — Initial verdict `unrelated` (high conf). 2,007 sigs 2024-11-27 → 2026-03-02. **83 pump.fun deploys at 2-6% supply capture** (retail spray-and-pray, NOT the 30-35% adversary pattern). Funded by Bitstamp Exchange 2 + HitBTC (NOT MoonPay); NO MoonPay fingerprint on first-fund tx. Drained to chrisV on 2026-03-02 (2 weeks pre-L10). Reciprocal flow with `DekQbf7eLMUb2PRvGg3KtEDJLrevS9aSXg1rkbEM12mB`, chrisV, 27eJ = **self-owned retail cluster** (same operator, 4+ wallets). Cluster did snipe L10 via chrisV at block+1 but they're **external retail memecoin operators**, not operator-network insiders. Phase 4: role=`insider` (sniper cluster), verdict=`not_network`, label="Retail sniper cluster (7D3Hz / Dek / chrisV / 27eJ); Bitstamp+HitBTC-funded". *(NET-NEW)*
4. ✅ `27eJASWffRBt6Xyuxq4N2MmgqLZrvt6TUqJQw1QN1zby` — **closed account** (getAccountInfo null, 0 SOL, 1000+ lifetime sigs). Part of 7D3Hz retail cluster (reciprocal flow confirmed by 7D3Hz review). First-funded chrisV on 2025-07-30 (pre-L10). Phase 4: role=`insider` (cluster member), verdict=`not_network`, label="Retail sniper cluster member (7D3Hz sibling)". *(NET-NEW)*
5. ✅ `chrisVmt4xpnsvGsKrkzW4a2Si6xTTixUpzsk99ixWR` — **closed account** (getAccountInfo null, 0 SOL, 1000+ lifetime sigs). Sniper #4 via L10 block+1 snipe. 7D3Hz review confirmed chrisV is the **drain destination of the 7D3Hz retail cluster** (received 2.33 + 2.38 SOL on 2026-03-02; first-funded by 27eJ on 2025-07-30). Phase 3 CONVERGENT with existing network-map `verdict: not_network`; that classification is **upheld** — chrisV is external retail sniper, not network wallet. User's "non-Bloom-routed" observation stands (manual/custom-routed by the retail cluster's own tooling). *(existing)*
6. ✅ `CSEncqtqbmNRjve42sNnbs5cCSmrjUNsAEwc17XY2RCs` — **high-throughput hot wallet** (24,571.6 SOL, continuous activity, 1000+ sigs within past hours). Consistent with user's 3-API disagreement (Solscan=Binance, Nansen=CoinSpot, Arkham=—). Phase 4: role=`onramp`, verdict=`not_network`, label="CEX hot wallet — Binance or CoinSpot disambiguation pending manual Arkham UI lookup". *(existing)*
7. ✅ `DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn` — 0.028 SOL, 90 lifetime sigs since `2025-11-22T23:00:00Z` (≤4-month retail history; low-activity wallet). Sniper #1. Phase 3 DIVERGENT: existing network-map marks L10 snipe as "UNVERIFIED, not in first 405 trades"; Phase 0 confirmed block+1 at 4.3745 SOL — entry needs update. *(existing)*
8. ✅ `5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1` — **high-throughput hot wallet** (2,535.5 SOL, 1000+ sigs in past hours). MP2 candidate. Phase 4: role=`onramp`, verdict=`not_network`, label="Possible MoonPay Hot Wallet (MP2)". Dedicated MoonPay fingerprint validation (CU=14548 + 32-hex memo + fee-payer-is-sender on ≥3 outbound txs) recommended before finalizing label. *(existing)*
9. ✅ `FiggKseFrgdsk4u3TLpbPFLJDKbahqkJQKEchKcwYsNZ` — 16.62 SOL, 1000+ sigs since `2025-09-03T13:02:38Z` (7-month established wallet). User-described as "MP2 hub." Not a hot wallet by throughput (1000+ sigs over 7 months, not past hours). Could be a trader downstream of MP2. Phase 4: existing network-map entry needs user review. *(existing)*
10. ✅ `6zZAKeF5zftUZHCkoWpno6MbaX2LrLwYBCFaEwLLaFDk` — 0.0015 SOL (drained), 306 lifetime sigs since `2026-02-18T14:16:38Z`. Sniper #2; burner-pattern. Phase 3 CONVERGENT with existing entry. *(existing)*
11. ✅ `7DkvxGJbv9qiNGqqE7VZ5jdg6SLDgBtem7NgaiPmnrzA` — 0.57 SOL, 1000+ sigs since `2026-02-02T20:19:36Z`. Sniper #3, active trader. Phase 4: role=`insider`, verdict=`possible_associate`. *(NET-NEW)*
3. `7D3HzSsNWaz17gNrcu9m7Kg74niUWikTTjAdiW65vCvD` — chrisV funder-of-funder *(NET-NEW)*
4. `27eJASWffRBt6Xyuxq4N2MmgqLZrvt6TUqJQw1QN1zby` — chrisV direct funder *(NET-NEW)*
5. `chrisVmt4xpnsvGsKrkzW4a2Si6xTTixUpzsk99ixWR` — sniper #4, **non-Bloom-routed** (contradicts user claim) *(existing)*
6. `CSEncqtqbmNRjve42sNnbs5cCSmrjUNsAEwc17XY2RCs` — sniper #1 funder; three-API label disagreement (Solscan=Binance, Arkham=—, Nansen=CoinSpot) *(existing)*
7. `DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn` — sniper #1 *(existing)*
8. `5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1` — MP2 candidate. Validate MoonPay fingerprint (CU=14548 + 32-char hex memo + fee-payer-is-sender) on ≥3 outbound txs. *(existing)*
9. `FiggKseFrgdsk4u3TLpbPFLJDKbahqkJQKEchKcwYsNZ` — MP2 hub, deep dive *(existing)*
10. `6zZAKeF5zftUZHCkoWpno6MbaX2LrLwYBCFaEwLLaFDk` — sniper #2 *(existing)*
11. `7DkvxGJbv9qiNGqqE7VZ5jdg6SLDgBtem7NgaiPmnrzA` — sniper #3 *(NET-NEW)*

7 NET-NEW Bloom buyers (Phase 0 surfaced) — batched triage (2026-04-21):
- ✅ `7JgFx6uZpd8tQjW8FouSEhVgnei3gt1MddEkgYS1cwMm` — block+1, 0.0021 SOL snipe. Drained (0.0015 SOL), 1000+ sigs, oldest-in-sample `2026-03-15T19:49:34Z` = first tx <2h before L10 deploy (scenario=21:40:44). Fresh-at-snipe profile; sample-based first-tx needs confirmation via pagination but consistent with "failed snipe, then used repeatedly." Phase 4: role=`insider`, verdict=`possible_associate`.
- ✅ `6cfUcAUFD9uxYD3BjLD5t6D67vRCBPPKVznBaUjrY6cz` — block+3, 0.9636 SOL. Drained, 47 lifetime sigs since `2026-02-14T11:06:07Z`. Low-activity burner. Phase 4: role=`insider`, verdict=`not_network`.
- ✅ `KisfjVS73uAVa8LStz3R8doXzx7YAAvTv1m3HXN23bf` — block+3, 1.2741 SOL. Drained, 1000+ sigs, oldest-in-sample `2026-03-14T18:57:15Z` = first tx ~1 day before L10 (fresh at snipe). Phase 4: role=`insider`, verdict=`possible_associate`.
- ✅ `RjWYrgX2UaxMD95uPxMNjk7YKmMwMqMUfbLd29VVGke` — block+3, 1.5821 SOL. 9.86 SOL active; sample oldest `2026-04-08` (sample only — true first-tx older; needs paging). Phase 4: role=`insider`, verdict=tbd.
- ✅ `DtvF74cDFJskwxLGQ6fRrewCMzLVsbphrAUsheHQd6r8` — block+6, 1.3511 SOL. 6.37 SOL active, 1000+ sigs since `2026-01-22T01:48:30Z` — established trader. Phase 4: role=`insider`, verdict=`not_network`.
- ✅ `99JFWJ6TGWhEPuxjYUoHWGpd3EkH3QXvWPrcBCN5iy7e` — block+6, 7.1539 SOL. **closed account**, 48 sigs, first tx `2026-03-15T15:43:06Z` = **6h before L10 deploy**. Fresh-wallet snipe-and-close pattern — largest single snipe bag (7.15 SOL) of the 7 Bloom NET-NEW. Phase 4: role=`insider`, verdict=`possible_associate`, HIGHEST signal of the 7.
- ✅ `C1s6pzRd827CTgyTp8iupANsku791nHySPb6DyYurLin` — block+17, 0.2047 SOL. Drained, 1000+ sigs; sample oldest `2026-04-16` (sample only, true age unknown without paging). Phase 4: role=`insider`, verdict=tbd.

**Fresh-wallet-at-snipe signal count (high-value for L11):** 3 of 7 Bloom buyers + 3 of 11 user-listed (27eJAS / chrisV / 99JFWJ closed; KisfjV fresh +1d; 7JgFx fresh +2h; 99JFWJ fresh +6h) = **~5 fresh-at-snipe wallets among 18**. The fresh-at-snipe + Bloom-routed combination is a strong L11 monitor candidate filter (alongside the existing MP1 pre-create_and_buy signal).

**Excluded by user:** `TRCq57hZ4Eyy4aaNpYV2VCEWpK1hMcLPrkvwF4HRRAE` (but kept in Phase 0 curve-math reconciliation).

**3. 37X follow-up probes (surfaced during adversarial review).** 37X itself closed as OG Deployer (see Closed). Remaining threads:
- ✅ `DuCzGNzSorXNgWKbx6koWTjd4P1AQaZHrNAdQu6NWmR8` — Initial review said `unrelated`; **adversarial review UPHELD the counterclaim (2026-04-21, high conf)**. Independent Nansen counterparty analysis: 523 total counterparties, **27 are in network-map** (5.2%) — MP1, Bundles 1-6, OG Deployer, L4/L7/L8/L9 Deployers, L9 Funder, Hub Wallet, Collection Wallet, Coinbase Hot Wallets 2/6/7/8/9, Coinbase Deposit + Deposit 2, Cold USDC 2, D1XcKeSS, DcbyADbN, 8fCxXEEq. Bundle-5 inflow confirmed ($2,222 / 5 ix). Profit-routing outflows: $4,806 to Cold USDC 2, $1,808 to Coinbase Deposit, $84 to Coinbase Deposit 2. 0 PumpFun CREATEs across oldest 20 sigs — not a deployer, but a legitimate consolidator/router node. **Phase 4 writeback target:** role=`network_connected` (or `intermediary`), verdict=`network`, label="Consolidator (MP1-funded)", notes="MP1-funded 2025-02-05 with 0.15 SOL, 1,645-sig 14-month history, 27 network-map counterparties, receives Bundle distributions + operator-mint flows, routes profit to Coinbase Deposit / Cold USDC 2; 37X initial review's Nansen '9 prior deploys' figure neither confirmed (0 CREATE in oldest 20 sigs) nor fully refuted (sample <2% of activity)". **Resolves an older knowledge gap: the initial neutral classify-all review missed the network membership entirely because protocol barred reading network-map; the independent adversarial discovery proved the rule is load-bearing.**
- Check 2mZz's second deploy `E8pHVRYoB1c3VDaDHCTtuUyNH5GUdTaKy7UQCJmypump` (OOG, 2026-03-19) for same 100%-devbuy-to-37X forwarding pattern.
- Investigate program `DeJBGdMFa1uynnnKiwrVioatTuHmNLpyFKnmB5kaFdzQ` — if bespoke adversary deploy-bundler, wire into L11 monitor as signal.
- ✅ **Verify L6-L9 transfer-senders into 37X are those launches' deployers (2026-04-21)** — 4/4 upheld after correcting an off-by-one launch-numbering. Each of L7 (`HYMtCc…kPfdG`), L8 (`75YFxM…uugzE`), L9 (`3VmNQ8…GGot`), L10 (`2mZzsV…VMVB`) sent creator-allocation directly to 37X's ATA for that launch. **New structural finding:** 37X holds ATAs only for L1, L7, L8, L9, L10 — none for L2/L3/L4/L5/L6. Persistent "home wallet" routing pattern begins at L7 (first hub-funded launch), not L2. L11 monitor signal: if 2mZz or a successor deployer transfers dev-buy allocation to 37X at deploy+seconds, that is a confirmed operator M.O., not a fluke.

**4. ~~MP1 ±1h cohort network-map cross-check.~~ ✅ done 2026-04-21** — 277 unique MP1 recipients in ±1h L10 funding window (union of `/tmp/mp1_outflows.json` + `/tmp/mp1_outbound_window.json`) vs 147 network-map entries: **1 intersection, the L10 deployer `2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB` itself**. 0 other known network wallets received MP1 flow in this window. Confirms "retail-heavy cohort" observation — MP1 8-25 SOL band at ±1h granularity is not a deployer-only or network-enriched signal.

**5. launch-history.json fact update (queue for Phase 4).** L10 fan-out was 8 recipients, `post_deploy_sequence` says 6 — decrement/explain. Also add DST-aware `funding_to_launch_gap_hours: { min: 2.56, max: 26.41, median: 11.91, mean: 12.51 }` (see timezone table).

## Deferred

- Full ±24h MP1 fingerprint sweep (do after monitor is loaded with all known wallets).
- Phase 3 cross-reference with existing network-map.
- Phase 4 writeback to network-map + launch-details.

## Method (Phase 2)

Sequential. One wallet at a time.

- **Do not** read `network-map.json` / `launch-details.json` / prior `data/results` or `archive/raw-results` for a target wallet before a fresh verdict is recorded.
- **Review brief:** address + neutral scenario ("target active near 2026-03-15T21:40:44Z; classify-all"). No role hypothesis, no prior labels, no mention of other targets. Sibling enumeration at every non-terminal upstream funder.
- **Adversarial review** mandatory before any network-map write. On `insufficient`: draft a one-sentence Arkham web-app question for the user before marking unresolved.
- No Arkham API (trial expired). No Nansen 500-credit labels endpoint. Arkham web-app via user / Claude Chrome Extension = manual fallback only.

## Findings not yet in canonical sources

**Phase 0 — trade-log corrections (vs user sniper timeline):**
- chrisV is **non-Bloom-routed** — may be manual / custom-router network wallet.
- D4tU7 is block+2, not block+1.
- SOL-amount deltas +4% to +31% vs user claims = Bloom tip + priority fee overhead, not discrepancies.
- Block-0 = deployer's create-time buy only. Block-1 intra-slot order: DmA9Jab → 6zZAKeF5 → 7Dkvx → TRCq → chrisV.
- Block-1 curve-math is self-consistent only if TRCq's 51.97M XAIC is in the sequence — hence TRCq stays in scope despite user exclusion from probes.

**Phase 1 — MP1 ±1h envelope (n=555 sigs):** 478 outbound SOL transfers, 466 (97.5%) carry MoonPay fingerprint (CU=14548). 346 unique recipients in 2h window. Retail-heavy: 79% < 2 SOL, median 0.81 SOL. 8–25 SOL "fresh-wallet-deployer" band = 7 outflows (incl. deployer) → ~84/day extrapolated rate → narrow monitor-filter candidate.

**Phase 1 — 37X downstream (3-hop forward):** 99.9985% of XAIC allocation liquidated on PumpSwap between deploy+54s and deploy+5d19h. ≥462 SOL lower-bound proceeds. No CEX touch anywhere downstream. Dust remaining: 4,783 XAIC on `4916NkdubkfRyHkxkCR7rpVGz5dvzVdK161mg4jXDwRh`.

**Sibling #1 verdict — `AgHpQzR9Xgo4azHQ1QRHeWMZBScRV3sWgbC7wGBv2u7G`:** unrelated. First-ever tx was the 10.703 SOL MP1 inflow at `2026-03-15T04:00:14Z` (MP1 fingerprint confirmed: CU=14548, 32-char hex memo `4f1127c8575c78667580652da6fcf79d`, fee-payer-is-sender). **44-second** lag to only other lifetime tx — Axiom→PumpSwap buy of UGOR mint `6UbcthN4LAC4XWuz4FC1bUdgAzjvjaVwnHhy4Zp4WuZ2` (26,915.96 tokens, ATA `D5FdPeJvg4yY1bgivaV1ZXXr7H6yFrYsk9VwNzh23LDt` subsequently **frozen** by mint authority `9jqR1a5QMDf7Av9BhvCnkNKDWJEZUs1jfMM1DQ88wD2Y`). Zero pump.fun program invocations. 1000× faster than adversary's 12-17h dormancy profile. Retail honeypot victim. MP1 ±1h sibling cohort = 524 outflows, retail-normal distribution — no targeted-burst signal at this hop.

**Sibling #2 verdict — `4x7YtF2eWd1r7xQPDnZisf2psEA5GYKiU3e22x8xMHjx`:** unrelated. First-ever tx was the 10.712 SOL MP1 inflow at `2026-03-15T04:19:54Z` (MP1 fingerprint confirmed: CU=14548, 32-char hex memo `d65dc598eeb6e4b11c7aec91b7ef1927`, fee-payer-is-sender). **5m15s** lag to only target-signed tx — Jupiter-routed Meteora DLMM buy of Token-2022 mint `33dhma9QA7xefhVpA7c5vMrN826xcHanSHruUEKF2LmW` ("SOS"/Strategic Oil Supply), 301,643.14 tokens. 4 lifetime sigs total (1 funding, 1 swap, 2 unsolicited cNFT dusts). Zero pump.fun. No outflows. Same dis-confirmation shape as sibling #1. Only overlap with adversary M.O. = SOL amount in 8-25 band. MP1 ±1h sibling cohort (window ±04:19:54Z) = 341 outbound transfers, median 0.867 SOL, max 43.279 SOL (to `B8Hb345RNkcVLSF1X8QSFaXhqGK8cqjYG5Y1s2RH3nme` at `05:19:40Z` — different inflow than sibling #4's 11.587 SOL at +47 min; B8Hb has ≥2 MP1 inflows, will surface fresh when its turn comes).

**Operator timezone fingerprint (L4–L10, DST-aware):**

| Launch | Funded local | Deployed local | Gap (h) |
|---|---|---|---|
| L4 | Sun 01:57 EDT | Sun 13:51 EDT | 11.91 |
| L5 | Sun 11:55 EST | Sun 14:28 EST | **2.56** |
| L6 | Sun 14:02 EST | Sun 18:43 EST | **4.68** |
| L7 | Sat 14:56 EST | Sun 17:21 EST | **26.41** |
| L8 | Sat 05:46 EST | Sat 15:54 EST | 10.13 |
| L9 | Fri 01:41 EST | Fri 16:46 EST | 15.08 |
| L10 | Sun 00:51 EDT | Sun 17:40 EDT | 16.83 |

- **Deploy weekday:** 5/7 Sun, 1/7 Sat (L8), 1/7 Fri (L9) → 6/7 weekend. L11 scheduled Sat Apr 25 — matches L8 precedent.
- **Deploy hour (local):** 13:51–18:43 EST/EDT band. User's L11 window "14:00–18:00 EST" (= 18:00–22:00 UTC in April EDT) is inside this band.
- **Gap distribution:** min 2.56h (L5), max 26.41h (L7), median 11.91h, mean 12.51h. The profile's "12-17h average" substantially understates dispersion.
- **Fund hour bimodal:** overnight (00:51, 01:41, 01:57, 05:46) OR midday (11:55, 14:02, 14:56).
- **Same-day fund+deploy:** 6/7 launches; only L7 crossed into next day.

**⚠ Dormancy-gate contradiction:** L10 doc's "≥12h before deploy" gate (line 99) is derived from n=1 (L10 MoonPay). L4-L9 Coinbase empirical gaps include 2.56h (L5), 4.68h (L6), 10.13h (L8) — if L11 reverts to Coinbase, a 12h floor misses 3/6 prior launches. Reframe: dormancy gate is MoonPay-specific; Coinbase-funded fresh wallets have ~2-26h variance and need a different filter (likely amount + fresh-wallet + pump.fun-in-72h with NO dormancy floor).

**37X fresh-context verdict — `37XxihfsTW1EFSJJherWFRFWcAFhj4KQ66cXHiegSKg2`:** initial role-fit = established-side-wallet-candidate. **OVERTURNED on adversarial review 2026-04-21** — independent review found 37X is the **L1 deployer** itself (signed CREATE tx for L1 mint `2rQcoMECcsU3UBNfpsUxegnHc9js7usb2XagwUK3pump` at `2025-06-15T15:57:57Z` with `create_and_buy` fingerprint: 37X as fee-payer, 0.396 SOL dev-buy, 13.98M tokens back to its ATA `CoZQLAgyvM7Hs49gfdEPcnjYA5RFh9rdPWKfyikmPFH4`). Network-map already correctly labels 37X as OG Deployer `infrastructure`/`network` — no writeback. The initial findings below remain valid as secondary-topology observations (recurring dev-buy recipient across L6-L9), but 37X's primary role is deployer, not side-wallet. Key fresh-context findings:

- **Scenario reconciliation:** "100% of newly-minted supply" = 326,752,146 XAIC = 32.68% of total supply = 100% of creator 2mZz's dev-buy holding. Transfer sig `AWcVaoy3se9i3WBtVoBtGa4qkyfPjKcVeX5T5pGTfwdQShFmoDF5tm74fgunapAxjHPq9e1xQBgHjjp9wLctAhj` at `2026-03-15T21:41:28Z` (deploy+44s), Token-2022 `transferChecked` via program `DeJBGdMFa1uynnnKiwrVioatTuHmNLpyFKnmB5kaFdzQ` (not standard pump.fun — suspected adversary-specific deploy-bundler, flagged for monitor).
- **Target provenance:** first funded `2025-03-22T17:48:46Z` by Coinbase Hot Wallet `GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE` with 0.0217 SOL. Started self-deploying pump.fun tokens 3 days later. Currently 28 Nansen-counted deploys (DogwifXRP → NVIDIA6900). 3,639 lifetime sigs.
- **Fresh-context validation of 2mZz (L10 deployer) M.O.:** MP1-funded 2026-03-15T04:51:33Z (MP1 fingerprint: CU=14548, memo `7c61e6fde07f70c202784ed4c9884939`, fee-payer=sender), 16.82h lag, 32.68% dev-buy, no Jito bundle. All adversary-M.O. dimensions independently confirmed.
- **XAIC fan-out: 8 recipients** (not 6 as documented in `launch-history.json` `post_deploy_sequence`). 89.6% of allocation (~292.6M XAIC) distributed within 54 seconds of receipt, in the same block at `2026-03-15T21:42:22Z`. Recipients + Nansen prior-deploy counts:
  - `DuCzGNzSorXNgWKbx6koWTjd4P1AQaZHrNAdQu6NWmR8` (36.3M XAIC, **9 prior deploys**, MP1-first-funded `2025-02-05`) — strongest signal for older-generation deployer peer
  - `91CuNTxyGkUvMU8hgzBHSW8FPEHArt767dApEoVsLRn7` (32.8M, 2 prior deploys)
  - `9dda2gRVxkuQDvDQwpiSKUCgEk7TxAKDFKVZrfRqerta` (33.0M, 0 deploys) — Bundle 4 in existing network-map
  - `EvcWdhdjB2SG2x8hrsxSFuxbf5azu5rpPSmepismXMYc` (40.9M, 0 deploys) — Bundle 5
  - `B8aWJoDqZPSZkHQL7BuURR95ujox4oubgFR8g1q3kpzW` (39.2M, 0 deploys) — Bundle 1
  - `D7MsVpaXFP9sBCr8em4g4iGKYLBg2C2iwCAhBVUNHLXb` (33.0M, 2 deploys) — L4 Deployer (historical)
  - `v49jgwyQy9zu4oeemnq3ytjRkyiJth5HKiXSstk8aV5` (43.3M, 1 deploy) — Hub Wallet
  - `6M2Pp3vkmNaoq9idYsU8fcNZKUJnVqHuhtx8D5e6maB` (34.1M, 3 deploys) — Bundle 3
- **Habitual partial-forwarding pattern (second structural case):** `GytQthjDhj3pE9seoZ6ir35VBBH86U22ntkGJndQpump` ($CUPID, L9) — creator `3VmNQ8ForGkoBpvyHyfS31VQuQqWn4NuxTTsvf7bGGot` forwarded 21.1M CUPID (14.65% of creator dev-buy, 2.11% of total supply) to 37X at deploy+6s. Sig `3FCANef7c4SUEn4yxaNCERFfzBfeQHq5BmMSW3obJCg75EwDBb3o2KrD1GJqHhc71EpxxN3VNskq9g58HsEsJ7SQ`. Same shape, smaller fraction — 37X is habitually a recipient of creator dev-buy allocations across launches.
- **Closed-loop cluster evidence:** XAIC fan-out recipient `v49jgwyQy9zu4oeemnq3ytjRkyiJth5HKiXSstk8aV5` (Hub) first-funded `HYMtCcfQTkBGw7uufDZtYHzg48pUmmBWPf5S44akPfdG` (L7 Deployer), which received 15.6 SOL cashouts from creator `2mZz` on `2026-03-24` + `2026-04-11`. Two independent paths (fan-out / cashout) converge on the same cluster.
- **2mZz post-deploy dust-spray:** ~50 recipients of 0.001 SOL each 2026-03-22 → 2026-03-28. Adversary cluster signature.

**Follow-ups surfaced during 37X review** (moved to `Next` items #3, #5):
- Probe `DuCzGNzSorXNgWKbx6koWTjd4P1AQaZHrNAdQu6NWmR8` (older-gen peer candidate).
- Check 2mZz's second deploy `E8pHVRYoB1c3VDaDHCTtuUyNH5GUdTaKy7UQCJmypump` for same 100%-devbuy-to-37X shape.
- Investigate program `DeJBGdMFa1uynnnKiwrVioatTuHmNLpyFKnmB5kaFdzQ` (suspected bespoke deploy-bundler).
- Verify L6-L9 transfer-senders into 37X are those launches' deployers.
- `launch-history.json` `post_deploy_sequence` says 6 bundle wallets; L10 fanned to 8.

**Sibling #3 verdict — `PRj9NxHpfLPVZGpBBunah4fMY3UAoKFP92XBCLroTxq`:** unrelated (high conf). MoonPay custodial/settlement hot wallet — first-ever tx `2025-04-16T12:54:54Z` co-signed by MoonPay Hot Wallet 4 (`AFKxebx96mnt1yn1ek6mcxeGDHmfrAWzo2h1fVdrrvWE`) + Fireblocks Signer (`EbsUZEFAU23Z2SgAymFtU2hADLiyNLzaPLKiJfvpKnE7`) using durable nonce — canonical custodial treasury seed. 11-month history, 150k+ lifetime sigs. The 21.652 SOL inflow at `2026-03-15T05:14:16Z` is a **MoonPay off-ramp sell**, not a retail buy: SOL source = `GHBk3oRmrsb373qRAnzegd76dHuHiyLvJLkUYHzUfsWf` (ephemeral relay), upstream = `BetA9CwfHGkeGvH4FJv26cFMMe6MagishLHkUJ3TGV4N` (retail user), origin = Rainbet casino `5HQZd9ovzAF1TLnHRAq1zcSnXC9HAp3EwhoxMHvo8rxB` (22.108 SOL withdrawal). MP1 = co-signer/fee-payer only. **NEW fingerprint dimension:** MP1's full canonical fingerprint (CU=14548, 32-hex memo, fee-payer=sender) is present on the final hop, but SOL source is user-wallet not MP1 — this is a sell-side flow variant, distinct from the documented on-ramp buy pattern. **New MoonPay rotation surfaced:** `AFKxebx96mnt1yn1ek6mcxeGDHmfrAWzo2h1fVdrrvWE` = MP4 (Helius label). Post-funding: 1,820 SOL + 72,490 USDC fanned out over 72h (custodial-settlement throughput, not dormancy+deploy). Zero pump.fun across 150k+ sigs.

**Sibling #4 verdict — `B8Hb345RNkcVLSF1X8QSFaXhqGK8cqjYG5Y1s2RH3nme`:** unrelated (high conf). 17-month retail DeFi power-user (lifetime 457 sigs, first funded 2024-10-24). Received **12 MP1 inflows** across 13 months totaling 92.26 SOL — sustained retail on-ramp cadence, not a one-shot deploy seed. The briefed 11.587 SOL at `2026-03-15T05:38:20Z` (memo `e0c48aeb8b578da30224cab192c07ba4`) was preceded 18m40s earlier by a LARGER 43.279 SOL MP1 inflow at `05:19:40Z` — both same day, both fingerprint-matched. 74 seconds after the second inflow: 57.62 SOL Phantom RFQ swap into $WIF (dogwifhat mint `EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm`, 30,224.62 tokens) via Wintermute Liquidity Bot (`MfDuWeqSHEqTFVYZ7LoexgAK9dxk7cy4DFJWjWMGVWa`). Counterparty histogram: Jupiter 30, Jupiter Perpetuals 24, DFlow 16, Drift 14, OKX 19, Phantom RFQ 4. **Zero pump.fun invocations across 457 lifetime sigs.** **Another MoonPay rotation surfaced:** MP18 = `6aWmxmeQhsK1tuH4rDA2YaKpXcae4bmbuDAz2fMToRNY` (Helius label) in this wallet's historical funding chain.

**Sibling #6 verdict — `BwLZ3KgoK2Q8CwuXF17B8btu8Vwk9szjvbymrpkJdAW9`:** best-fit role = **intermediary** (self→self retail-MoonPay flavor, NOT network-intermediary). Pre-existing 37.19h before 05:51:08Z event (tx #13 of 24 lifetime). 4 MP1 inflows all MoonPay-fingerprint-matched: 10.567 (`2026-03-13T16:39:48Z`, memo `9c95403ef53665282639b9c13084ee56`), 10.331 (`2026-03-15T05:51:08Z`, memo `6972cf1fe34e5e93b6753064a602a9b1`), 5.285 (`2026-03-23T04:16:11Z`, memo `51347018b47c11483042a8ece0ce5d9a`), 1.965 (`2026-04-08T00:27:37Z`, memo `cdad91ba3481a9096413c4733ee22e75`). On the 2026-03-15 event: forwarded 10.000 SOL to `5f1rxMqkvhnCgH39y7uXdfPYx2H98KW7rxVBGHFE4oLF` at T+92s (first-funded by target itself `2026-03-13T16:48:17Z` — same-operator funnel). **Zero pump.fun, zero DEX, zero token handling across entire 24-sig lifetime**; only System + ComputeBudget programs ever touched. Classification soft — review flagged this could warrant manual Nansen UI lookup + downstream profile of `5f1rxMqk…`'s own outflows (to `EQ2Pq7ZgDSKE2gd41QRSyh3xVygGnnX3uAvEe35FFPpq` + `HBkQhs7fiKDtQG61BmwhxksZYFFfeqf1t8KkudVxFzvd`) to disambiguate retail-vs-network.

**Cohort observation from BwLZ ±1h MP1 enumeration (366 outflows, 276 unique recipients):** top-10 by total SOL includes three of our targets + the L10 deployer itself:
- `B8Hb345RNkcVLSF1X8QSFaXhqGK8cqjYG5Y1s2RH3nme` (sibling #4): 54.866 SOL across 2 txs
- `6qzbHM6epTnCXNoeVxqzShcGkDmBG5qw1ESRTbKyFiaA` (sibling #5): 24.202 SOL across 5 txs
- `2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB` (**L10 deployer**): 13.443 SOL ×1
- `BwLZ3KgoK2Q8CwuXF17B8btu8Vwk9szjvbymrpkJdAW9` (target, rank 11): 10.331 SOL

All 7 narrow-window ±60s siblings carry distinct 32-hex MoonPay memos → all independent MoonPay retail receive-wallets, not co-controlled. MP1 ±1h cohort is genuinely retail-heavy (median 0.78 SOL across 276 recipients).

**Sibling #5 verdict — `6qzbHM6epTnCXNoeVxqzShcGkDmBG5qw1ESRTbKyFiaA`:** unrelated (high conf). Pre-existing 10-month history (5,204 sigs at time of 8.427 SOL MP1 inflow `2026-03-15T05:44:51Z`, MP1 fingerprint confirmed: CU=14548, 32-hex memo `378da42acb5bfe21593fa3a2bf694827`, fee-payer-is-sender). Wallet is a recurring MoonPay customer — 22 MP1 deposits totaling 61.3 SOL in the 72h window, consistently forwarded (73s dormancy, 5000-lamport retention) to self-owned secondary `9L5Mid6vAE33wibUyz9PUmABtgrKd86uNFLeUVQGAG18` (target first-funded 9L5 on `2025-07-19` with 2.00 SOL — same-operator funnel). Zero pump.fun `create_and_buy` invocations across 5,740 lifetime sigs. Uses Lighthouse Protocol assertions (Phantom-wallet-style MEV protection).

**Bonus artifacts from sibling #5 review:**
- MoonPay fingerprint catalog extension: 10/10 structural match (CU=14548, 32-hex memo, fee-payer-is-sender) holds; CU_Price observation = 40,000 µlam/CU exceeds documented 15k-29k range. Per CLAUDE.md rules CU_Price is not a fingerprint dimension (congestion-dependent), but range should be widened.
- New behavioral artifact: `JATcFT2j762i7CAayBhQCGuKVstxgL3gWwQXKWtSPbj4` is a MoonPay internal liveness/heartbeat spray wallet — 1 lamport to 20 MoonPay-adjacent wallets per batch. Not previously catalogued. Not load-bearing for sibling #5 but worth noting for MoonPay-adjacency signals.

**L11 monitor-activation window (derived):**
- Target deploy: Sat 2026-04-25 18:00–22:00 UTC (user intel).
- Earliest plausible funding = deploy − 26.4h (p99) = Fri 2026-04-24 15:36 UTC. Confirms doc's existing `monitor_armed_deadline_utc: 2026-04-24T16:00:00Z` is well-placed.
- Latest plausible funding = deploy − 2.6h (p0) = Sat 2026-04-25 15:00 UTC.
- **Operational impact:** The runtime filter in `monitor/src/detection/candidate.ts` has NO dormancy gate — it fires on any 8-25 SOL fresh-wallet drop regardless of how quickly the fresh wallet acts. So L5/L6/L8-style short gaps (2.6-10h) would still generate an alert. The 12-17h figure used in `STRATEGY.md` + `MONITOR_BUILD_PLAN.md` is activation-window guidance only. Flagging for Phase 4 writeback: `launch-history.json` `behavioral_profile.funding_to_launch_gap_hours` should be updated to `{ min: 2.56, max: 26.41, median: 11.91, mean: 12.51 }` with DST-aware note.

## L11 monitor signals surfaced

- **Narrow MP1 filter:** `MP1 outflow + CU=14548 + amount ∈ [8, 25] SOL + recipient fresh (0 prior txs)` → ~10 candidates/day in extrapolated rate; single digits after fresh-wallet filter.
- **Dormancy gate (MoonPay-specific, n=1):** L10 MP1-funded deployer was 16h 49m dormant, 0 intermediate txs, funding tx = wallet's first tx ever. **Contradicted by timezone table for L4-L9 (Coinbase-funded):** empirical gaps include 2.56h (L5), 4.68h (L6), 10.13h (L8). If L11 reverts to Coinbase, a 12h floor misses 3/6 prior launches. Treat dormancy gate as MoonPay-conditioned only; Coinbase-funded fresh wallets need a different filter (amount + fresh-wallet + pump.fun-in-72h with NO dormancy floor). The "12-17h profile" formerly cited in `STRATEGY.md`/`MONITOR_BUILD_PLAN.md` is activation-window guidance, not a runtime gate — the runtime filter in `monitor/src/detection/candidate.ts` correctly has no dormancy gate.
- **Weekday/hour hypothesis (untested):** Sun 00:51 EDT funding → Sun 17:40 EDT deploy. Next item #2 validates or refutes.

## Phase 3 friction points (adjudicate during writeback)

- `DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn` — `network-map.json` currently labels its L10 snipe as "UNVERIFIED, not in first 405 trades". Phase 0 confirmed block+1 at 4.3745 SOL. Entry needs update.
- `chrisVmt4xpnsvGsKrkzW4a2Si6xTTixUpzsk99ixWR` — `network-map.json` currently has verdict `not_network`. User's new claim + Phase 0 confirmation put it in-scope; Phase 2 fresh verdict will be authoritative. Contradicts prior.

## Phase 3/4 method (when reached)

For each Phase 2 verdict vs. existing `network-map.json` state:
- **CONVERGENT** — matches prior. No action.
- **DIVERGENT** — conflicts. Document both, escalate to user, **never silent-overwrite**.
- **NET-NEW** — prior entry didn't exist. Authoritative pending user approval.

Phase 4 writebacks (user-gated): NET-NEW adversarially-cleared wallets → `network-map.json` (roles: deployer, intermediary, network_connected, onramp, insider). Launch-specific flows → `data/launch-details.json` `launches.L10.inflows`/`outflows`.
