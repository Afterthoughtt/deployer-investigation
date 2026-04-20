# L10 Full Investigation

## Goal

Intensive post-mortem of the L10 pump.fun launch (XAICASH) to produce a definitive record of: the first-minute trade set, the deployer's funding + post-deploy SPL redistribution, and the classification of every wallet in the user-drafted sniper timeline. Output feeds L11 monitor tuning and Bloom whitelist decisions.

## Launch fingerprint

| Field | Value |
|---|---|
| Token name | XAICASH |
| Token mint | `KfByHk48ecitUq8gXji2vr9smmRJKtqJwGAh2E9pump` |
| Deployer | `2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB` |
| Deploy time | `2026-03-15T21:40:44Z` (user stated `Mar 15 14:40:44 PST`; March 15 2026 is PDT, so `14:40:44 PDT = 21:40:44 UTC`) |
| User-claimed deploy buy | 13.135802468 SOL → ~327M / 1B supply. Bonding-curve sanity check: initial k = 30 × 1.073B = 32.19B; adding 13.1358 SOL → tokens bought = 1.073B − (32.19B / 43.1358) ≈ 326.75M ≈ 327M ✓ (also matches archive's `326,752,146.5 XAIC` figure). Verify exact amount from raw chain in Phase 0. |
| Pinned MP1 → deployer funding tx (from `MONITOR_BUILD_PLAN.md`) | `4hQpmGKE9irpwaEuzRL6kcK1c5uFGzfieaCAwXjvSSbLpUx4qGBKgZRpMvxuyspan7FrHEfNx8usvV9C6QS37UKu` |
| Candidate deploy signature (from `archive/raw-results/l10-early-buyers.json`, tool-output, not memory) | `5oTPtsDavgu5evFCpkmZGV2B3WXWdy967KwFeuome8ekCwjyof7UFVDZvqyW53cGaF3VkHLiHz5BFwfh25xCaM7e` |

## Operating principles

These MUST hold for every wallet in scope.

1. **Fresh-context rule.** For each target wallet, do not open `data/network-map.json`, `data/launch-details.json`, `data/launch-history.json`, `data/results/*.json`, or `archive/raw-results/*.json` for that wallet until its independent verdict is rendered and recorded in this document. Reconciliation with existing repo state is deferred to Phase 3.
2. **One wallet at a time.** Sequential execution; no parallel wallet dives. Prevents context bleed (e.g. "MP2 surfaced again" biasing the next read).
3. **Chain-walker briefs are minimal.** Each `chain-walker` invocation receives ONLY: the wallet address verbatim, a one-paragraph scenario brief, and a `classify-all` directive. No role hypothesis seeded, no prior labels, no mention of `network-map.json`, no mention of other target wallets in the same chain.
4. **Chain-skeptic mandatory gate.** Before any `network-map.json` write with `verdict: network` or any Bloom whitelist promotion, invoke `chain-skeptic` with address + single-sentence role claim (and nothing else). `insufficient` → escalate to user, do not force a guess.
5. **Raw chain > aggregated data.** For any timing-sensitive or amount-sensitive claim, pull `getTransaction` directly. Do not trust Nansen `tgm/dex-trades` alone — it missed the DmA9Jab L10 activity in the prior audit, which is itself now in doubt.
6. **Identifier integrity.** Addresses and signatures are copied from file or prior tool output, never retyped. All identifiers in code spans, full length, no truncation.
7. **No Arkham API calls** — trial expired (CLAUDE.md). **No Nansen 500-credit `/profiler/address/labels`** — surface wallets for manual Nansen UI lookup instead (CLAUDE.md). **Arkham web app is available to the user** (logged-in session, no API). When a verdict hinges on an Arkham-specific label, entity cluster, or transfer pattern that only the UI exposes, surface a focused single-wallet ask — either a one-line prompt the user can paste into the Arkham web session, or a prompt for the user's **Claude Chrome Extension** to run the lookup in-browser. Do not attempt to synthesize Arkham answers from memory.
8. **Read-only investigation.** No MCP with signing capability. No Bloom whitelist promotion during this phase — that's a separate step after the write-up lands.

## Target wallet scope

Copy-verbatim list. Do not retype downstream.

### User's sniper timeline (first-second post-deploy, user's draft to be verified)

| # | Wallet | Claimed SOL | Claimed supply | Claimed funder | User annotation |
|---|---|---|---|---|---|
| 1 | `DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn` | 4.18765 | ~66M | `CSEncqtqbmNRjve42sNnbs5cCSmrjUNsAEwc17XY2RCs` | Bloom Bot pre-whitelisted, snipes at block 0, <1s after launch |
| 2 | `6zZAKeF5zftUZHCkoWpno6MbaX2LrLwYBCFaEwLLaFDk` | 9.87654 | ~117M | `FiggKseFrgdsk4u3TLpbPFLJDKbahqkJQKEchKcwYsNZ` | Bloom Bot snipe |
| 3 | `7DkvxGJbv9qiNGqqE7VZ5jdg6SLDgBtem7NgaiPmnrzA` | 0.49382 | 4.8M | `5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1` | Bloom Bot snipe |
| — | `TRCq57hZ4Eyy4aaNpYV2VCEWpK1hMcLPrkvwF4HRRAE` | — | — | — | **Excluded by user.** Do not investigate. |
| 4 | `chrisVmt4xpnsvGsKrkzW4a2Si6xTTixUpzsk99ixWR` | 9.97530 | 69M | `27eJASWffRBt6Xyuxq4N2MmgqLZrvt6TUqJQw1QN1zby` | Chain is "very in-depth, requires a lot of research" — re-open with no prior verdict |
| 5 | `D4tU7mrfyuw3yRGeeB643EfFQYXSAMKeiJ7mVeYicBNv` | 1.18518 | 6.9M | `5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9` | Funder labeled Binance on Arkham/Solscan/Nansen |

### Funder chain (user's claims about upstream flow)

- `CSEncqtqbmNRjve42sNnbs5cCSmrjUNsAEwc17XY2RCs` — funds sniper #1; exchange-label disagreement: Solscan=Binance, Arkham=unlabeled, Nansen=Coinspot
- `FiggKseFrgdsk4u3TLpbPFLJDKbahqkJQKEchKcwYsNZ` — funds sniper #2; user flag: "definitely entity infrastructure, requires very in-depth analysis on all tx and funding patterns"
- `5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1` — funds Figg and sniper #3; user stated labels: Solscan="Binance 2", Arkham+Nansen="Moonpay"; MoonPay fingerprint test (CU 14548 + 32-char hex memo + fee-payer-is-sender) is the decisive validator
- `27eJASWffRBt6Xyuxq4N2MmgqLZrvt6TUqJQw1QN1zby` — funds chrisV; funded by `7D3HzSsNWaz17gNrcu9m7Kg74niUWikTTjAdiW65vCvD`
- `7D3HzSsNWaz17gNrcu9m7Kg74niUWikTTjAdiW65vCvD` — funder-of-funder for chrisV chain
- `5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9` — funds sniper #5; user-stated "labeled Binance on Arkham/Solscan/Nansen"

### Deployer

- `2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB` — L10 deployer, investigated for deploy-window activity + post-deploy SPL redistribution

### Additional wallets discovered during investigation

Any recipient of an SPL (XAIC) transfer from the deployer post-deploy, or any first-minute buyer surfaced in Phase 0 that the user did not list, is appended to the target set and receives the same fresh-context treatment.

## Execution phases

### Phase 0 — Raw-chain timeline ground truth

Chain-native adjudication of the deploy moment and the first-minute trade set. No Nansen, no cross-reference, no reading of existing wallet classifications.

Actions:
- Verify the candidate deploy signature `5oTPtsDavgu5evFCpkmZGV2B3WXWdy967KwFeuome8ekCwjyof7UFVDZvqyW53cGaF3VkHLiHz5BFwfh25xCaM7e` via Helius `getTransaction`. Confirm: (a) deployer is signer, (b) mint is `KfByHk48ecitUq8gXji2vr9smmRJKtqJwGAh2E9pump`, (c) blockTime maps to `2026-03-15T21:40:44Z`, (d) it is the first pump.fun `create_and_buy` for this mint.
- From the deploy tx's pre/post balances, confirm whether `13.135802468 SOL` is gross or net-of-fee. Record the fee if any.
- `getTransaction` on `DmA9Jab…`'s snipe first; record CPI program IDs + compute-budget + any memo as the Bloom-Bot fingerprint tuple. Use it to classify every other first-second trade.
- `getSignaturesForAddress` on the mint, `limit: 1000`, paginate backward until the first 60 seconds post-deploy are covered.
- For each sig in the window, `getTransaction` → extract signer, SOL in, XAIC out, program path, Bloom-match.
- Emit a trade log keyed by `(slot, tx index in block)` — intra-slot order matters since multiple snipes land in the same slot.
- Include every slot-0/slot-1 trade in the log, including `TRCq57hZ4Eyy4aaNpYV2VCEWpK1hMcLPrkvwF4HRRAE` (excluded from investigation, but its ΔSOL is needed to reconcile the curve math for chrisV).

### Phase 1 — Deployer-side flow reconstruction

Enumerate every SOL-in, SOL-out, and SPL-out for `2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB` across the deploy window. The post-deploy SPL redistribution set is catalogued nowhere on disk today — this is the net-new data.

Actions:
- Funding-in verification: pull the pinned MP1→deployer tx `4hQpmGKE9irpwaEuzRL6kcK1c5uFGzfieaCAwXjvSSbLpUx4qGBKgZRpMvxuyspan7FrHEfNx8usvV9C6QS37UKu` and validate the MoonPay fingerprint (CU 14548 + 32-char hex memo + fee-payer-is-sender).
- Deployer activity window: `getSignaturesForAddress` on the deployer from (deploy_block − 60s) to (deploy_block + 30min). `getTransaction` on each.
- Extract and tabulate:
  - SOL inflows (expected: MP1 funding + any pump.fun bonding-curve sell proceeds).
  - SOL outflows (destinations).
  - SPL (XAIC) outflows — recipient, amount, timestamp. Each unique recipient → appended to the target set.
  - Any additional `create_and_buy` calls by the deployer in the 30-minute window (user's "noise token" pattern). Record mints only; do not investigate further.
- Do NOT reconcile against `data/launch-details.json` `launches.L10.inflows`/`outflows` yet — that happens in Phase 3.

### Phase 2 — Per-wallet independent investigations

For each target wallet, sequential order. Wallets likely to share funder chains are separated so earlier dives don't contaminate later ones.

**Execution order:**

1. `5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9` — external exchange candidate, calibrates chain-walker output
2. `D4tU7mrfyuw3yRGeeB643EfFQYXSAMKeiJ7mVeYicBNv` — leaf node, funder independent of MP2 cluster
3. `7D3HzSsNWaz17gNrcu9m7Kg74niUWikTTjAdiW65vCvD` — root of chrisV chain
4. `27eJASWffRBt6Xyuxq4N2MmgqLZrvt6TUqJQw1QN1zby` — middle of chrisV chain
5. `chrisVmt4xpnsvGsKrkzW4a2Si6xTTixUpzsk99ixWR` — leaf of chrisV chain
6. `CSEncqtqbmNRjve42sNnbs5cCSmrjUNsAEwc17XY2RCs` — exchange-label disambiguation
7. `DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn` — sniper #1, downstream of CSEncqtq
8. `5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1` — MP2 candidate, root of MP2 cluster
9. `FiggKseFrgdsk4u3TLpbPFLJDKbahqkJQKEchKcwYsNZ` — MP2 intermediary hub (deep dive)
10. `6zZAKeF5zftUZHCkoWpno6MbaX2LrLwYBCFaEwLLaFDk` — sniper #2, downstream of Figg
11. `7DkvxGJbv9qiNGqqE7VZ5jdg6SLDgBtem7NgaiPmnrzA` — sniper #3, downstream of MP2
12. Any fresh wallet from Phase 0 (unexpected first-minute buyers) or Phase 1 (SPL recipients)

**Per-wallet workflow** — complete all steps for a wallet before moving on:

a. **Chain-walker probe** with minimal brief: address (verbatim) + neutral scenario brief ("target observed active near blockTime `2026-03-15T21:40:44Z`; classify-all; pull funding chain ≥2 hops, recent tx history, isUserAddress, cross-API label agreement"). Do not mention the mint, "pump.fun", "snipe", "deployer", or any trader/funder framing. No prior labels, no network-map content, no other-wallet context.

b. **Record raw chain-walker YAML** under the per-wallet `### Independent finding` slot below.

c. **Main-thread classification** from chain-walker YAML only. Six-role taxonomy: `fresh-deploy-wallet-candidate` / `fresh-side-wallet-candidate` / `established-side-wallet-candidate` / `intermediary` / `unrelated` / `insufficient-evidence`.

d. **Chain-skeptic gate** (mandatory if we'd want a `network` verdict). Invoke with ONLY address + one-sentence role claim. Record `upheld` / `overturned` / `insufficient`. On `overturned` or `insufficient`: no `network-map.json` write; log the unresolved state in this document. On `insufficient` specifically — before escalating as fully unresolved, draft a **single-wallet Arkham web-app question** (one sentence, answerable from the Arkham UI alone: e.g., "Is this address in an Arkham entity cluster with any of [list]?") and surface it to the user. User can answer from their live Arkham session or hand the prompt to their Claude Chrome Extension. Only after that lookup returns empty does the wallet stay `insufficient`.

e. **Move to next wallet.** Cross-reference deferred to Phase 3.

**Sibling enumeration is default** for every wallet in scope. Chain-walker's horizontal-enumeration rule (`.claude/agents/chain-walker.md` §Funding-chain trace protocol) fires at the target AND at every non-terminal upstream funder. Any sibling with `first_funding_from_source: true` gets appended to the target set and receives its own fresh-context probe in a later Phase-2 step.

**Special handling:**
- `5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1`: MoonPay fingerprint must be validated on ≥3 outbound transactions. Decisive test for MP2 identity.
- `CSEncqtqbmNRjve42sNnbs5cCSmrjUNsAEwc17XY2RCs`: chain-walker brief adds "three APIs label this address differently (Solscan=Binance, Arkham=unlabeled, Nansen=CoinSpot); resolve via upstream funding source + outbound-tx patterns."

Run chain-walker and chain-skeptic to completion at each wallet; do not truncate on credit cost. Expand the target set as sibling enumeration surfaces new wallets.

### Phase 3 — Cross-reference with existing repo state

Only after every wallet has an independent verdict recorded.

For each wallet, fill its `### Reconciliation` slot below with:
- Fresh verdict (Phase 2 output).
- Prior state in `data/network-map.json` (role, verdict, label, notes).
- Prior state in `data/launch-details.json`, `data/launch-history.json`, `data/results/*.json`, `archive/raw-results/*.json` for any L10-relevant context.

Mark each as:
- **CONVERGENT** — fresh verdict matches prior classification.
- **DIVERGENT** — fresh verdict conflicts. Document both; escalate to user; do NOT silently overwrite.
- **NET-NEW** — prior classification did not exist. Fresh verdict is authoritative pending user approval.

Known points of friction already visible and to be adjudicated here:
- `DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn` — existing note says L10 snipe "UNVERIFIED, not in first 405 trades"; user's new claim says snipe <1s. Phase 0 adjudicates; Phase 3 records.
- `chrisVmt4xpnsvGsKrkzW4a2Si6xTTixUpzsk99ixWR` — existing verdict: `not_network`. Phase 2's fresh verdict is authoritative for this investigation.

### Phase 4 — Writeback (user-gated)

Only executed on explicit user approval:
- **`data/network-map.json`**: add NET-NEW wallets that cleared chain-skeptic (role ∈ {deployer, intermediary, network_connected, onramp, insider}); upgrade `2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB` `notes` with the now-known L10 flow; fix DIVERGENT entries only if user confirms the reversal.
- **`data/launch-details.json`**: fill `launches.L10.inflows` (Phase 1) and `launches.L10.outflows` (Phase 1 SPL enumeration + Phase 0 trade log). Update `coinspot_insider_note` if Phase 0 overturned it.
- **`data/launch-history.json`**: touch only if `sol_spent: 13.31` or bundle timestamps are contradicted by Phase 0 raw data.
- **This document**: append Summary section after Phase 3 (CONVERGENT / DIVERGENT / NET-NEW counts + unresolved open questions).

### Phase 5 — Verification

- Re-run `monitor/test/replay-l10.ts` and `monitor/test/replay-l10-dedup.ts` — must still pass.
- Spot-check three Phase-0 tx hashes in Solscan UI against Helius payloads recorded here.
- For every `chain-skeptic` `upheld` verdict, confirm the chain-walker brief was not seeded with prior network-map content (audit the brief we sent).

## Explicit non-goals

- No Arkham API calls (trial expired). Arkham **web-app** lookups via the user (or user's Claude Chrome Extension) are allowed as a last-resort disambiguator on a per-wallet basis — see principle #7.
- No Nansen 500-credit labels endpoint calls.
- No deep dive on noise-token deploys from the same deployer in the L10 window — record mints only.
- No re-screening of the other 135+ already-catalogued network-map wallets — strictly the 12 in scope + SPL recipients + any first-minute trader Phase 0 surfaces.
- No Bloom whitelist promotion during this investigation.

## Per-wallet slots (filled in during Phase 2 and Phase 3)

### `2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB` (deployer)

#### Independent finding
_To be filled in after Phase 1._

#### Reconciliation
_To be filled in Phase 3._

---

### `5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9`

#### Independent finding
_To be filled in Phase 2 step 1._

#### Reconciliation
_To be filled in Phase 3._

---

### `D4tU7mrfyuw3yRGeeB643EfFQYXSAMKeiJ7mVeYicBNv`

#### Independent finding
_To be filled in Phase 2 step 2._

#### Reconciliation
_To be filled in Phase 3._

---

### `7D3HzSsNWaz17gNrcu9m7Kg74niUWikTTjAdiW65vCvD`

#### Independent finding
_To be filled in Phase 2 step 3._

#### Reconciliation
_To be filled in Phase 3._

---

### `27eJASWffRBt6Xyuxq4N2MmgqLZrvt6TUqJQw1QN1zby`

#### Independent finding
_To be filled in Phase 2 step 4._

#### Reconciliation
_To be filled in Phase 3._

---

### `chrisVmt4xpnsvGsKrkzW4a2Si6xTTixUpzsk99ixWR`

#### Independent finding
_To be filled in Phase 2 step 5._

#### Reconciliation
_To be filled in Phase 3._

---

### `CSEncqtqbmNRjve42sNnbs5cCSmrjUNsAEwc17XY2RCs`

#### Independent finding
_To be filled in Phase 2 step 6._

#### Reconciliation
_To be filled in Phase 3._

---

### `DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn`

#### Independent finding
_To be filled in Phase 2 step 7._

#### Reconciliation
_To be filled in Phase 3._

---

### `5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1`

#### Independent finding
_To be filled in Phase 2 step 8. Include MoonPay fingerprint verdict on ≥3 outbound txs._

#### Reconciliation
_To be filled in Phase 3._

---

### `FiggKseFrgdsk4u3TLpbPFLJDKbahqkJQKEchKcwYsNZ`

#### Independent finding
_To be filled in Phase 2 step 9. Include top-30 outbound counterparties with amounts + first-funding flags._

#### Reconciliation
_To be filled in Phase 3._

---

### `6zZAKeF5zftUZHCkoWpno6MbaX2LrLwYBCFaEwLLaFDk`

#### Independent finding
_To be filled in Phase 2 step 10._

#### Reconciliation
_To be filled in Phase 3._

---

### `7DkvxGJbv9qiNGqqE7VZ5jdg6SLDgBtem7NgaiPmnrzA`

#### Independent finding
_To be filled in Phase 2 step 11._

#### Reconciliation
_To be filled in Phase 3._

---

### Phase-0/Phase-1 discovered wallets

_Append per-wallet slots here as they surface. Same `#### Independent finding` + `#### Reconciliation` structure._

---

## Phase-0 trade log

_To be filled in Phase 0. Table: slot | blockTime | signer | SOL in | XAIC out | program path | Bloom-Bot signature present | block-0/1/later._

## Phase-1 deployer flow

_To be filled in Phase 1. Sections: SOL inflows | SOL outflows | SPL (XAIC) outflows | Noise-token deploys (mints only)._

## Summary

_To be filled after Phase 3. CONVERGENT / DIVERGENT / NET-NEW counts; open questions; proposed `network-map.json` writebacks; proposed `launch-details.json` writebacks._
