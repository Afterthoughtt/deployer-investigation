# L10 Investigation — Working Doc

Temporary. Canonical wallet facts → `data/network-map.json`. Launch-level facts → `data/launch-details.json`. Delete when L10 wraps.

## Status

| Phase | State |
|---|---|
| 0 – First-minute trade log | ✅ done |
| 1 – Deployer flow | ✅ done |
| 2 – Per-wallet probes | ⏸ queued |
| 3 – Cross-reference | ⏸ deferred |
| 4 – Writeback | ⏸ deferred |

## Closed

- **2mZ (L10 deployer)** — canonical entry in `network-map.json` `deployers.L10`. Post-deploy tail + dust-spray scanned 2026-04-20; no fresh-wallet leak (profit consolidated to L7 deployer — known behavior).

## Next (ordered)

**1. 6 MP1 ±1h siblings — fresh-context each.** Tests whether the 8–25 SOL MP1 fresh-wallet-deployer pattern is already recurring. Any sibling fresh-at-funding + deploying pump.fun within 12–17h validates the L11 monitor filter.
- `AgHpQzR9Xgo4azHQ1QRHeWMZBScRV3sWgbC7wGBv2u7G` (−51 min, 10.703 SOL)
- `4x7YtF2eWd1r7xQPDnZisf2psEA5GYKiU3e22x8xMHjx` (−32 min, 10.712 SOL)
- `PRj9NxHpfLPVZGpBBunah4fMY3UAoKFP92XBCLroTxq` (+23 min, 21.652 SOL)
- `B8Hb345RNkcVLSF1X8QSFaXhqGK8cqjYG5Y1s2RH3nme` (+47 min, 11.587 SOL)
- `6qzbHM6epTnCXNoeVxqzShcGkDmBG5qw1ESRTbKyFiaA` (+53 min, 8.427 SOL)
- `BwLZ3KgoK2Q8CwuXF17B8btu8Vwk9szjvbymrpkJdAW9` (+60 min, 10.331 SOL)

**2. Operator timezone fingerprint L4–L10.** Extract each prior launch's funding-tx + deploy-tx blockTimes from `data/launch-details.json` / `launch-history.json`, convert DST-aware to EDT, tabulate weekday + hour. L10 anchor: Sun 00:51 EDT funding → Sun 17:40 EDT deploy. If L4–L9 cluster similarly, L11 gains a monitor-activation window (cuts daily noise).

**3. 37X fresh-context probe.** `37XxihfsTW1EFSJJherWFRFWcAFhj4KQ66cXHiegSKg2` received 100% of L10 XAIC allocation at deploy+44s. Cross-launch presence flagged vs RXRP in MEMORY.md. Chain-skeptic gate mandatory before any network-map write.

**4. 6 profit-consolidation beneficiaries from 37X downstream.** Hop-2 XAIC sells landed SOL proceeds on *different* wallets than the XAIC holders — operator-controlled beneficiaries. Cross-check vs network-map first, probe unknowns.
- `YAh1vvZPnuCjZ354LF8ria76cJaSEPvPyPYuRoxVkuH`
- `8ncU5YW1CQwvr4gs7buH57bW58e86TDau4STrCJBuz8z`
- `GMCJvYGf5Ex2ARiMquaBDqU6iKM8uiEQkB8jCnoNfHpC`
- `CdeigPnaYwWLqqmZ9u4Spxk8nPaDFyFQwjNuGzuJjJP6`
- `51FQwjrvo8J8zXUaKyAznJ5NYpoiTCuqAqCu3HAMB9NZ`
- `FxGiN5NkigicwrnFshZEAUH9C13yrBALmgYxA9x8sfnQ`

**5. Phase 2 — 11 user-listed wallets + 7 NET-NEW Bloom first-minute buyers.** Sequential, fresh-context, upstream-first → siblings → snipers.

User-listed (execution order):
1. `5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9` — sniper #5 funder, exchange candidate
2. `D4tU7mrfyuw3yRGeeB643EfFQYXSAMKeiJ7mVeYicBNv` — sniper #5 (block+2, not +1)
3. `7D3HzSsNWaz17gNrcu9m7Kg74niUWikTTjAdiW65vCvD` — chrisV funder-of-funder
4. `27eJASWffRBt6Xyuxq4N2MmgqLZrvt6TUqJQw1QN1zby` — chrisV direct funder
5. `chrisVmt4xpnsvGsKrkzW4a2Si6xTTixUpzsk99ixWR` — sniper #4, **non-Bloom-routed** (contradicts user claim)
6. `CSEncqtqbmNRjve42sNnbs5cCSmrjUNsAEwc17XY2RCs` — sniper #1 funder; three-API label disagreement (Solscan=Binance, Arkham=—, Nansen=CoinSpot)
7. `DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn` — sniper #1
8. `5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1` — MP2 candidate. Validate MoonPay fingerprint (CU=14548 + 32-char hex memo + fee-payer-is-sender) on ≥3 outbound txs.
9. `FiggKseFrgdsk4u3TLpbPFLJDKbahqkJQKEchKcwYsNZ` — MP2 hub, deep dive
10. `6zZAKeF5zftUZHCkoWpno6MbaX2LrLwYBCFaEwLLaFDk` — sniper #2
11. `7DkvxGJbv9qiNGqqE7VZ5jdg6SLDgBtem7NgaiPmnrzA` — sniper #3

7 NET-NEW Bloom buyers (Phase 0 surfaced, appended to queue):
- `7JgFx6uZpd8tQjW8FouSEhVgnei3gt1MddEkgYS1cwMm` — block+1, 0.0021 SOL (probe / likely failed snipe)
- `6cfUcAUFD9uxYD3BjLD5t6D67vRCBPPKVznBaUjrY6cz` — block+3, 0.9636 SOL
- `KisfjVS73uAVa8LStz3R8doXzx7YAAvTv1m3HXN23bf` — block+3, 1.2741 SOL
- `RjWYrgX2UaxMD95uPxMNjk7YKmMwMqMUfbLd29VVGke` — block+3, 1.5821 SOL
- `DtvF74cDFJskwxLGQ6fRrewCMzLVsbphrAUsheHQd6r8` — block+6, 1.3511 SOL
- `99JFWJ6TGWhEPuxjYUoHWGpd3EkH3QXvWPrcBCN5iy7e` — block+6, 7.1539 SOL
- `C1s6pzRd827CTgyTp8iupANsku791nHySPb6DyYurLin` — block+17, 0.2047 SOL

**Excluded by user:** `TRCq57hZ4Eyy4aaNpYV2VCEWpK1hMcLPrkvwF4HRRAE` (but kept in Phase 0 curve-math reconciliation).

## Deferred

- Full ±24h MP1 fingerprint sweep (do after monitor is loaded with all known wallets).
- Phase 3 cross-reference with existing network-map.
- Phase 4 writeback to network-map + launch-details.

## Method (Phase 2)

Sequential. One wallet at a time.

- **Do not** read `network-map.json` / `launch-details.json` / prior `data/results` or `archive/raw-results` for a target wallet before a fresh verdict is recorded.
- **Chain-walker brief:** address + neutral scenario ("target active near 2026-03-15T21:40:44Z; classify-all"). No role hypothesis, no prior labels, no mention of other targets. Sibling enumeration at every non-terminal upstream funder.
- **Chain-skeptic gate** mandatory before any network-map write. On `insufficient`: draft a one-sentence Arkham web-app question for the user before marking unresolved.
- No Arkham API (trial expired). No Nansen 500-credit labels endpoint. Arkham web-app via user / Claude Chrome Extension = manual fallback only.
- Full protocol: `.claude/agents/chain-walker.md`.

## Findings not yet in canonical sources

**Phase 0 — trade-log corrections (vs user sniper timeline):**
- chrisV is **non-Bloom-routed** — may be manual / custom-router network wallet.
- D4tU7 is block+2, not block+1.
- SOL-amount deltas +4% to +31% vs user claims = Bloom tip + priority fee overhead, not discrepancies.
- Block-0 = deployer's create-time buy only. Block-1 intra-slot order: DmA9Jab → 6zZAKeF5 → 7Dkvx → TRCq → chrisV.
- Block-1 curve-math is self-consistent only if TRCq's 51.97M XAIC is in the sequence — hence TRCq stays in scope despite user exclusion from probes.

**Phase 1 — MP1 ±1h envelope (n=555 sigs):** 478 outbound SOL transfers, 466 (97.5%) carry MoonPay fingerprint (CU=14548). 346 unique recipients in 2h window. Retail-heavy: 79% < 2 SOL, median 0.81 SOL. 8–25 SOL "fresh-wallet-deployer" band = 7 outflows (incl. deployer) → ~84/day extrapolated rate → narrow monitor-filter candidate.

**Phase 1 — 37X downstream (3-hop forward):** 99.9985% of XAIC allocation liquidated on PumpSwap between deploy+54s and deploy+5d19h. ≥462 SOL lower-bound proceeds. No CEX touch anywhere downstream. Dust remaining: 4,783 XAIC on `4916NkdubkfRyHkxkCR7rpVGz5dvzVdK161mg4jXDwRh`.

## L11 monitor signals surfaced

- **Narrow MP1 filter:** `MP1 outflow + CU=14548 + amount ∈ [8, 25] SOL + recipient fresh (0 prior txs)` → ~10 candidates/day in extrapolated rate; single digits after fresh-wallet filter.
- **Dormancy gate:** fresh MP1-funded wallet that signs *any* tx before 12h post-funding is probably NOT the deployer. L10 = 16h 49m dormant, 0 intermediate txs between funding and deploy, funding tx was the wallet's first tx ever. Consistent with 12–17h profile from L4–L9.
- **Weekday/hour hypothesis (untested):** Sun 00:51 EDT funding → Sun 17:40 EDT deploy. Next item #2 validates or refutes.

## Phase 3 friction points (adjudicate during writeback)

- `DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn` — `network-map.json` currently labels its L10 snipe as "UNVERIFIED, not in first 405 trades". Phase 0 confirmed block+1 at 4.3745 SOL. Entry needs update.
- `chrisVmt4xpnsvGsKrkzW4a2Si6xTTixUpzsk99ixWR` — `network-map.json` currently has verdict `not_network`. User's new claim + Phase 0 confirmation put it in-scope; Phase 2 fresh verdict will be authoritative. Contradicts prior.

## Phase 3/4 method (when reached)

For each Phase 2 verdict vs. existing `network-map.json` state:
- **CONVERGENT** — matches prior. No action.
- **DIVERGENT** — conflicts. Document both, escalate to user, **never silent-overwrite**.
- **NET-NEW** — prior entry didn't exist. Authoritative pending user approval.

Phase 4 writebacks (user-gated): NET-NEW chain-skeptic-cleared wallets → `network-map.json` (roles: deployer, intermediary, network_connected, onramp, insider). Launch-specific flows → `data/launch-details.json` `launches.L10.inflows`/`outflows`.
