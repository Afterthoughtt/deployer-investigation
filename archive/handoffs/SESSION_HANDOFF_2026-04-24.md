# Session Handoff — 2026-04-24

L11 launch is **2026-04-25 14:00–18:00 EST (Nukex)**. Funding window: now → ~2026-04-25 11:00 UTC.

## Where we are

Completed first-pass triage of the **CoinSpot-funded candidates (25 of 147)** in the VPS monitor DB. Findings + per-wallet verdicts saved to `data/current-wallet-review-scope.json` under `monitor_candidate_batches.coinspot_candidate_review_2026_04_24`.

VPS DB state (post-triage):
- 14 rejected (drained / Kraken cashout / single-cycle / inflated-not-fresh / 4 active relays)
- 2 left `detected` deliberately for further investigation: id 43 `HefCL8a29RDNWmGC85N3UVvDCRAkaG3Df9jKKTorVTSE` (inflated, not fresh) and id 64 `FgsvEDugq8Qv78yVPDY3BSPGkjAnjhKZPS64bQkZX6Ut` (single CoinSpot receive, balance gone untracked)
- 134 still `detected` (the MoonPay batches and a few RXRP-chain singletons)

## CoinSpot batch — keep list (active L11 watch)

| Priority | Address | Why |
|---|---|---|
| 1 | `3f15vuFsQ3f2NA2WFLJ53Ei2JKZV4H8G42rJwugpCCGZ` | 24.43 SOL intact, dormant, **inside 12–26h window** |
| 2 | `GzPBXxW2RG947ZUKKqrDmKu3XtZCjQGaqrNmtPHnTHTM` | D234 vanity-pair bracketing of 21.64 SOL inflow — operator-signal shape, not yet verified |
| 3 | `3XKSFfV62MgUdy81YRZwuTS9JB6cF8R2jo9T1YEePauh` | Single odin-prefix ping post-funding — weak |
| - | `2bRSMnmwRb1Z1yxDrb2ia5Jw4vesCTzhd6a28mSHTBAf` (id 134) | **Active CoinSpot to G9X7F4 relay, 7 cycles in 1 day** |
| 4 | `HYRGi5jqhCNbHH2dHzyiKnqPHqEvoeqWSGWzt8mMEVys` | 8.13 SOL intact, ~32h dormant (just past 26h max) |
| 5 | `8JkcHNCX65ss5QRUm7BC9K11A53YdfCftkTLNyvpJNxe` | 19.00 SOL intact, ~40h dormant |
| 6 | `FdyTNua8UxgdbmZQ1pQdfaaHvnp4ayf1DZgA6BGScGvo` | 20.66 SOL intact, ~74h dormant |
| 7 | `39VqGYiwc4vvH2vBVESuXYfYoLCGeb6e6LyheDSP4FPv` | 20.48 SOL intact, ~87h dormant |
| 8 | `7Ey5AFpT7EiioeqY8zMvw9gaz78kC5PNSsRc6g7rF1iq` | 8.71 SOL intact, ~103h dormant |

## Deferred for second pass

- id 43 `HefCL8a29RDNWmGC85N3UVvDCRAkaG3Df9jKKTorVTSE` — had 24.51 SOL prior balance from 2026-04-09 CoinSpot inflow before the 13 SOL "funding"; passed fresh-by-sigs filter but not fresh-by-balance. 37.51 SOL sitting now, 3+ days dormant. Operator decided to leave for further investigation before reject.
- id 64 `FgsvEDugq8Qv78yVPDY3BSPGkjAnjhKZPS64bQkZX6Ut` — 8.08 SOL CoinSpot inflow on 2026-04-21, then balance fell to 0.074 with only 1 transfer recorded. Untracked SOL drain (likely token swap). Worth parsing for swap destination.

## Open analytical findings (from CoinSpot batch)

**1. HYM-prefix vanity dust-ping tradecraft on L10 deployer `2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB` — confirmed.** `HYM3vkUkXB8aR73d3JbLbuxmfAzM9isgGRxB8owciFdG` and `HYM1nkDaSdmNT5xgQ3fhrmHHM2VnanH4QSLFKsxGTVdG` dust-ping 2mZz 15–21s after each cashout to L7 deployer `HYMtCcfQTkBGw7uufDZtYHzg48pUmmBWPf5S44akPfdG` (which itself shares the HYM prefix). Same shape as registry's `signal_wallets_2zi_cluster`. **Proposed registry patch queued in `current-wallet-review-scope.json` `analytical_findings.hym_vanity_cluster_on_l10_deployer_confirmed.proposed_patch_outline`.** Apply after reviewer approval.

**2. D234 vanity pair bracketing on `GzPBXxW2RG947ZUKKqrDmKu3XtZCjQGaqrNmtPHnTHTM` — suggestive, not confirmed.** Follow-ups: pull `getWalletTransfers` on `D234cojEJ5SXEvCmR65YVdB4woxTxgGgs7ypjdzyEcYk` and `D2345NtgdDgs5nyLzjAtGrRZVLMnd6gZnZGKe2FDEcYk`, check funding sources against registry.

**3. Novel relay destinations not in registry** (5 addresses, save as follow-ups):
- `G9X7F4JzLzbSGMCndiBdWNi5YzZZakmtkdwq7xS3Q3FE`
- `3YxRuo3eHJaW6cHxP1rcsj5RsB1VuVByXstDjt7hwMov`
- `5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9`
- `5iEFdmkmdEbzfNmBdRioRUQJiPVNwsJaX4Nmh4HBZH9d`
- `848uo7nqHFKsgpvmPLbeYbKADuBXjoWPybJWkx8Wd1fk`

Each aggregates 16–89 SOL from CoinSpot via fresh-wallet relay. Suggest `getWalletTransfers` on each to map outflows.

**4. Vanity pinger families seen on drained wallets** (6 addresses):
- `CSEnvcsis81nh7guJHgAJCaNowjAKJ9jiFxfMSNZ2RCs` — CSEn-prefix sibling of the real CoinSpot hot wallet `CSEncqtqbmNRjve42sNnbs5cCSmrjUNsAEwc17XY2RCs`; appears on 4 drained candidates. Most interesting.
- `TriQKRfbS1v63hvHpLWNnb51VL9GvVeotTYYXSfUDHb` — Tri-prefix; 3 drained candidates.
- `pcLMffoEiUcgPsPH2sbi2QmS8bcqUZAx72Fv816bb7S` — pcLM-prefix; 1 ping.
- `848uF6kii7rehH4GL3bCsaprDvb8NnFtgU8MAn8Ud1fk` — 848 prefix + 1fk suffix sibling of relay destination `848uo7nqHFKsgpvmPLbeYbKADuBXjoWPybJWkx8Wd1fk`.
- `84113ZmXoGKLAWJh9T9Ub2NwTNPCyyJUaS9L1Nvpn1fk` — shared 1fk suffix.
- `odinv4uRcB4cFfNXpeEwJX5sDModAomNt371Nk4wF25` — odin-prefix sibling.

**5. Odin family expanding.** Known siblings now (6 total):
- `odin1cuJWUrEK49CFEEtSG789J6g8LanHqKPLVE6guG`
- `odin8eaAmRDqTwtYBxvPnQ8hHpi8Rxaybg6xVjWbRTb`
- `odinZCYLkjzeAxhZ8uF6Eea1GF6iPczsPbKSEnh7A7s`
- `odinFqDRznBzUHSGdZzkY78AgaCxFRoHe7GTvrvo4Dn`
- `odinrnLqM2dT4MJjC8vqTByeXyjFU2GQkwWEeSFpKgK`
- `odinv4uRcB4cFfNXpeEwJX5sDModAomNt371Nk4wF25`

Active investigation in `data/results/rxrp-priority-odin-recipient-summary-2026-04-24.json` and `data/results/rxrp-priority-odin-source-summary-2026-04-24.json`.

## Next batches (still untriaged)

- **MoonPay MP1**: 46 candidates — `funding_source = Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6`
- **MoonPay MP2**: 73 candidates — `funding_source = 5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1`
- **3 RXRP-chain singletons**: ids belonging to FTX US / ChangeNOW / Robinhood RXRP buyer chains

Same methodology as CoinSpot batch:
1. `getBalance` on all (1 cr each) → bucket intact / inflated / drained
2. `getTransactionHistory` signatures on intact + inflated (10 cr each)
3. `getWalletTransfers` on inflated + drained-with-relay-pattern (100 cr each)
4. Cross-check destinations and pingers against `data/network-map.json` + the new pinger/relay addresses captured above

Credit budget guidance: CoinSpot batch (25 wallets) burned 2,055 credits including the 2mZz cross-check. MP1+MP2 batches will be larger; expect ~4–6k credits for full coverage if patterns hold.

## How to access live state

```bash
# Pull live VPS DB + WAL + SHM (must include WAL or recent rejects won't show)
scp l11@143.198.12.56:/opt/l11-monitor/monitor/data/l11.db /tmp/
scp l11@143.198.12.56:/opt/l11-monitor/monitor/data/l11.db-wal /tmp/
scp l11@143.198.12.56:/opt/l11-monitor/monitor/data/l11.db-shm /tmp/
sqlite3 /tmp/l11.db "SELECT id, address, funded_amount_sol, funding_source_label, status FROM candidates WHERE status='detected' ORDER BY funding_timestamp DESC;"
```

Network-map address index for cross-checks: small Python snippet that walks `data/network-map.json` and indexes every `address` field; current registry has ~178 indexed addresses.

## Don't forget

- `npm run audit:primitive-integrity -- <file>` and `npm run audit:claim-integrity -- <file>` after editing any review artifact.
- `data/current-wallet-review-scope.json` is non-canonical; promote findings to `data/network-map.json` only via reviewed registry patch.
- L11 launch tomorrow afternoon — keep `3f15vuFsQ3f2NA2WFLJ53Ei2JKZV4H8G42rJwugpCCGZ` and the MoonPay candidates within the 12–26h window prioritized.
