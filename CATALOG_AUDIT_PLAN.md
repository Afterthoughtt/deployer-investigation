# Catalog Audit Plan

**Goal:** review every wallet in `data/network-map.json` (144 entries), classify each as `watch` / `archive` / `drop`, and regenerate `monitor/data/wallets.json` from the `watch` subset.

**Deadline:** classification complete + monitor updated before **Fri 2026-04-24**. L11 launches **Sat 2026-04-25**.

---

## Why this is needed

The L10 post-mortem surfaced problems that shook trust in the catalog:

- 6 entries in `profit_routing` are AMM pool PDAs/ATAs, not wallets
- `7ciGXut2rzyZeuRQjMZZ33gmyyT6JWaVKvEcTHNS5ny7` is marked `not_network` but its funder `FiggKseFrgdsk4u3TLpbPFLJDKbahqkJQKEchKcwYsNZ` is a confirmed MoonPay MP2 intermediary — one misclassification that broke trust in the whole registry
- Retail sniper cluster (chrisV / 7D3Hz / 27eJ / Dek) previously classified as insiders
- Multi-API label disagreements unresolved (e.g. `CSEncqtqbmNRjve42sNnbs5cCSmrjUNsAEwc17XY2RCs`: Solscan=Binance, Nansen=CoinSpot, Arkham=null)
- Stale balance notes with no timestamps ("Hub Wallet — Drained, 0.05 SOL" — when?)
- No way to tell a verified entry from a single-API guess

---

## Classification

Three values. Two new fields added to each entry.

| value     | meaning                                                                    | monitor effect                                        |
| --------- | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| `watch`   | active wallet, useful for L11 detection                                    | included in `monitor/data/wallets.json`               |
| `archive` | real wallet but not useful pre-L11 (dormant, post-launch only, peripheral) | stays in catalog as historical context, not monitored |
| `drop`    | not a wallet (PDA / ATA / program), or confirmed misclassification         | removed from catalog entirely                         |

**New fields:** `monitor_action` (one of the three above), `last_verified` (ISO date).
**Existing fields unchanged:** `address`, `label`, `role`, `verdict`, `notes`.

No numerical scores.

---

## What I check per wallet

Three checks, in order:

1. **Is it a wallet?** Helius `getAccountInfo`. If `owner ≠ 11111111111111111111111111111111` (System Program), it's a token account / pool / program → `drop`.
2. **Still active?** Helius `getBalance` + latest signature timestamp. Drained + dormant > 60 days → likely `archive`.
3. **Does the label hold?** Cross-check Helius / Arkham / Nansen labels against the current `role` + `notes`. If they agree, confirm. If they disagree, run the role-specific behavior check below and re-bucket.

### Role-specific behavior check (only when step 3 needs it)

| claimed role           | check                                                                                                | evidence bar                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `onramp`               | Arkham `GET /counterparties/address/<w>?chains=solana&flow=out&timeLast=7d&usdGte=1&limit=100`       | ≥100 unique recipients in 7d; labeled by ≥2 of {Helius, Arkham, Nansen}              |
| `hub` / `intermediary` | Helius `getWalletTransfers limit=100`                                                                | ≥1 historical outflow in 8–25 SOL band to an address that subsequently became active |
| `deployer`             | Helius `getTransactionHistory` → grep pump.fun program `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | signed a `create_and_buy` instruction                                                |
| `insider`              | Helius `getWalletTransfers` × `data/launch-details.json` timestamps                                  | confirmed buy in first 60s of at least one L1–L10 launch                             |
| `bundle`               | Helius `getTokenBalances` + mint timestamps                                                          | received SPL mint shortly after a deployer's `create_and_buy`                        |
| `profit_routing`       | Helius `getWalletHistory`                                                                            | receives SOL/USDC from deployer post-launch and routes onward                        |

Output per wallet: two-to-three sentence note, `monitor_action`, `last_verified`.

---

## Order of work

144 wallets across 12 buckets. Per-wallet review for the core ~42 that most directly affect L11 detection; bulk pass for the remaining ~100.

| Priority | Bucket                                                                                                           | Count | Approach                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------- |
| 1        | `deployers` (L4–L10)                                                                                             | 7     | Per-wallet, sign-off each                                                                |
| 2        | `infrastructure` (Hub, OG, Collection, Large Funder, Hub First Funder, L9 Funder)                                | 6     | Per-wallet, sign-off each                                                                |
| 3        | `onramp_hot_wallets.moonpay` (MP1, MP2, MP5 candidate, MP1 USDC ATA)                                             | 4     | Per-wallet. Coinbase deferred per your call.                                             |
| 4        | `rxrp_repump_network.intermediaries` (live-SOL subset)                                                           | ~10   | Per-wallet. **Start here with Figg.**                                                    |
| 5        | Copy-trade pair: `BqP79WmkKFRytsrWCqY2ra4n5XzUxQjTf45rHy7rkgtC` + `231fshU82vSSeyytyCZJUEUG8Ti3UAgnDSoNFGTETCuK` | 2     | Per-wallet                                                                               |
| 6        | `side_projects` + `insiders`                                                                                     | ~13   | Per-wallet                                                                               |
| 7        | `og_deployer_token_accounts`                                                                                     | 2     | Bulk `drop` — known ATAs, not wallets                                                    |
| 8        | `bundle_wallets` + `profit_routing` + `profit_cashout`                                                           | ~24   | Bulk pass — most → `archive` (post-launch, not pre-launch). Flag any PDA/ATA for `drop`. |
| 9        | Remainder of `rxrp_repump_network` + `network_connected` + `possible_associates`                                 | ~50   | Bulk pass — most → `archive`                                                             |
| 10       | `not_network`                                                                                                    | 26    | Bulk pass — already graveyard. Spot-check; most → `drop`                                 |

**Per-wallet review (priorities 1–6, ~42 wallets):** I show you the three checks, the proposed note, and the proposed `monitor_action`. You approve, change, or reject. Next wallet.

**Bulk pass (priorities 7–10, ~102 wallets):** I produce a summary table per bucket (address + proposed action + one-line reason). You scan it and flag rows to override, then I apply the bucket.

**Starting wallet:** `FiggKseFrgdsk4u3TLpbPFLJDKbahqkJQKEchKcwYsNZ` — RXRP intermediary, low volume, good low-risk template.

---

## Rules

- **Never overwrite a prior classification.** If the new `monitor_action` contradicts the old `verdict`, move the prior classification into `notes` with a date tag (e.g. `reclassified 2026-04-22: was not_network, corrected to archive — see evidence below`). The next session can audit the audit.
- **Arkham calls pin `limit`** (≤100 for `/counterparties/address`, ≤100 for `/transfers`) so the max datapoint cost per call is bounded by construction. No runtime abort gates needed.
- **Never call `/counterparties/address`** on CEX hot wallets, known ATAs, or pump.fun program accounts — wasted datapoints.
- **When stuck:** if evidence is genuinely ambiguous, I **stop and ask you**. No guessing. This should happen for only a handful of wallets.

---

## Finish line

1. Every entry in `data/network-map.json` has `monitor_action` + `last_verified` set.
2. `monitor/data/wallets.json` is regenerated from the `watch` subset. Diff against the current 23-wallet list shown to you before deploy.
3. Monitor restarted with the new list before Fri 2026-04-24 16:00 UTC.

---

## References

- `data/network-map.json` — target of the audit
- `monitor/data/wallets.json` — derived view, 23 wallets currently
- `STRATEGY.md` — L11 detection strategy (MoonPay sieve, intermediaries, copy-trade)
- `L10_FULL_INVESTIGATION.MD` — post-mortem that motivated this audit
- `docs/arkham_docs.md`, `docs/nansen_docs.md` — API references (Helius tooling/docs via MCP)
