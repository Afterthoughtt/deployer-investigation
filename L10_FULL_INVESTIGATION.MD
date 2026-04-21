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
9. **Findings over receipts.** This doc records verdicts and load-bearing facts, not tool output. Wallet addresses stay — they are the output (target set / network-map entries / Bloom candidates). Transaction signatures, slot numbers, block times, program IDs, ATAs, raw token units, compute-unit counts, and source-file paths do NOT go in the write-up. Raw data lives on disk (`/tmp/*.json`) or is re-pulled from chain when needed. Per-wallet format: `Verdict` / `Why` (1–3 sentences, plain English) / `Skeptic gate`. Nothing else.

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

- `37XxihfsTW1EFSJJherWFRFWcAFhj4KQ66cXHiegSKg2` — Phase 1 surfaced: received 100% of deployer's XAIC allocation (`326,752,146.517271`) at deploy+44s via sig `AWcVaoy3se9i3WBtVoBtGa4qkyfPjKcVeX5T5pGTfwdQShFmoDF5tm74fgunapAxjHPq9e1xQBgHjjp9wLctAhj` (slot `406658827`). Tx uses unknown program `DeJBGdMFa1uynnnKiwrVioatTuHmNLpyFKnmB5kaFdzQ`. Cross-launch RXRP relevance flagged (MEMORY.md).

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

b. **Record finding only** under the per-wallet `### Independent finding` slot in this format: `Verdict` (one of six roles) / `Why` (1–3 sentences, plain English, name wallets when load-bearing) / `Skeptic gate` (upheld / overturned / insufficient + one-line reason). Do not paste raw chain-walker YAML — it lives in conversation/tool context and is discarded once the finding is recorded.

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

**Verdict:** deployer (already confirmed upstream; this phase produced behavior in the deploy window, not a classification).

**Why:**
- **Funding:** MoonPay → deployer via MP1, fingerprint matched. Funding-to-deploy gap = 16.82h, within the 12–17h behavioral profile.
- **Deploy:** confirmed at 2026-03-15 21:40:44 UTC. Deployer is first signer; tx contains the first `CreateV2` + create-time Buy for the XAIC mint. Deployer received 326,752,146.517271 XAIC (~32.67% of 1B supply).
- **Deploy SOL accounting:** user's 13.135802468 SOL claim is the **net bonding-curve spend**. On-chain wallet debit = 13.312777331 SOL, composed of claim (13.1358) + tx fee (0.0006878) + rent/account-creation (0.1763). Pre-balance 13.443 SOL; post-balance 0.130 SOL residual.
- **Post-deploy:** at deploy+44s, deployer moved 100% of its XAIC allocation to `37XxihfsTW1EFSJJherWFRFWcAFhj4KQ66cXHiegSKg2` via an unknown program (not pump.fun, not Bloom). No further deployer activity in the 30-min window; no additional `create_and_buy` calls from the deployer in that window.

**Skeptic gate:** n/a — deployer identity is already established in `data/network-map.json`; this phase only reconstructs deploy-window flow.

**Net-new target surfaced:** `37XxihfsTW1EFSJJherWFRFWcAFhj4KQ66cXHiegSKg2` (received full deployer XAIC allocation). Appended under §Additional wallets discovered; MEMORY.md flags potential cross-launch reuse with RXRP — to be tested in Phase 2.

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

### `37XxihfsTW1EFSJJherWFRFWcAFhj4KQ66cXHiegSKg2` (Phase 1 net-new — SPL dump recipient)

#### Independent finding
_To be filled in Phase 2 — fresh-context probe. Known: received the entire deployer XAIC allocation at deploy+44s. Open questions: funded-by; first activity; cross-launch presence (RXRP flagged in MEMORY.md); whether the allocation was redistributed further downstream; prior network-map.json membership._

#### Reconciliation
_To be filled in Phase 3._

---

## Phase-0 trade log

First 60 seconds post-deploy: 687 txs observed, 158 unique buyers. Bloom-Bot fingerprint = the `b1oomGG…NafWW1` router in the program list (established from DmA9Jab's snipe). Block-0 = deployer's create-time buy only; Block-1 = 6 buys.

**User sniper timeline — on-chain reconciliation:**

| # | Wallet | User claim | On-chain SOL | Supply | Bloom? | Block | Verdict vs. claim |
|---|---|---|---|---|---|---|---|
| 1 | `DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn` | 4.18765 SOL | 4.3745 | 66.04M | ✅ | +1 | ✅ confirmed |
| 2 | `6zZAKeF5zftUZHCkoWpno6MbaX2LrLwYBCFaEwLLaFDk` | 9.87654 SOL | 11.3021 | 117.45M | ✅ | +1 | ✅ confirmed |
| 3 | `7DkvxGJbv9qiNGqqE7VZ5jdg6SLDgBtem7NgaiPmnrzA` | 0.49382 SOL | 0.6471 | 4.82M | ✅ | +1 | ✅ confirmed |
| — | `TRCq57hZ4Eyy4aaNpYV2VCEWpK1hMcLPrkvwF4HRRAE` | (excluded) | 6.1621 | 51.97M | ✅ | +1 | present; excluded from investigation |
| 4 | `chrisVmt4xpnsvGsKrkzW4a2Si6xTTixUpzsk99ixWR` | 9.97530 SOL, Bloom | 10.7622 | 68.58M | ❌ | +1 | ⚠️ **NOT Bloom-routed** — contradicts user annotation |
| 5 | `D4tU7mrfyuw3yRGeeB643EfFQYXSAMKeiJ7mVeYicBNv` | 1.18518 SOL | 1.2741 | 6.93M | ✅ | +2 | ⚠️ block+2, not block+1 |

SOL-amount deltas (on-chain vs. claim, +4% to +31%) are consistent with Bloom tip + priority fees; not a contradiction. Supply shares all match user claims.

**NET-NEW first-minute buyers surfaced to Phase 2 scope:**

- **Bloom-routed (7, high priority):**
  - `7JgFx6uZpd8tQjW8FouSEhVgnei3gt1MddEkgYS1cwMm` — block+1, 0.0021 SOL (tiny probe / likely failed snipe).
  - `6cfUcAUFD9uxYD3BjLD5t6D67vRCBPPKVznBaUjrY6cz` — block+3, 0.9636 SOL, 4.54M XAIC.
  - `KisfjVS73uAVa8LStz3R8doXzx7YAAvTv1m3HXN23bf` — block+3, 1.2741 SOL, 6.29M XAIC.
  - `RjWYrgX2UaxMD95uPxMNjk7YKmMwMqMUfbLd29VVGke` — block+3, 1.5821 SOL, 8.15M XAIC.
  - `DtvF74cDFJskwxLGQ6fRrewCMzLVsbphrAUsheHQd6r8` — block+6, 1.3511 SOL, 3.93M XAIC.
  - `99JFWJ6TGWhEPuxjYUoHWGpd3EkH3QXvWPrcBCN5iy7e` — block+6, 7.1539 SOL, 22.97M XAIC.
  - `C1s6pzRd827CTgyTp8iupANsku791nHySPb6DyYurLin` — block+17, 0.2047 SOL, 0.38M XAIC.
- **Non-Bloom first-minute buyers (114):** low-priority retail noise; documented on disk but not individually appended as targets unless a later phase surfaces a specific tie-in.

**Block-1 intra-slot order** (earliest → latest): DmA9Jab (#1) → 6zZAKeF5 (#2) → setup/noise → 7Dkvx (#3) → setup/noise → TRCq (excluded) → chrisV (#4) → dust/noise. Snipers #1–#3 land first (Bloom-bot racing), TRCq 8th, chrisV 9th (non-Bloom → manual or custom-router, slower than bot traffic). D4tU7 (#5) lands at block+2.

**Curve-math reconciliation (why TRCq stays in scope):** end-of-block-1 aggregate XAIC bought = 635.61M (deployer 326.75 + five block-1 buys including TRCq). Implied SOL contributed to curve = 43.60; sum of gross wallet debits across block-0+1 = 46.28; overhead 2.68 SOL (~5.8%) consistent with pump.fun's 1% trading fee + Bloom priority tips. chrisV's 10.7622 SOL → 68.58M XAIC is self-consistent **only if** TRCq's prior 51.97M displacement is in the sequence.

**Material verdicts from Phase 0:**
1. User timeline is substantively correct; three corrections (chrisV is non-Bloom, D4tU7 is block+2, SOL-amount deltas are fee/tip overhead not discrepancies).
2. chrisV's non-Bloom routing changes its profile — may be a manually-operated or custom-router network wallet rather than a Bloom-bot user.
3. Block-0 shows no co-signer snipe — deployer is the only block-0 buyer.
4. 7 Bloom-routed NET-NEW buyers appended to Phase 2 scope under §Additional wallets.
5. Deploy SOL accounting reconciled: user's 13.135802468 SOL is net curve-spend, matches on-chain wallet debit when fee (0.0007 SOL) and rent (0.1763 SOL) are added.

## Phase-1 deployer flow

### MP1 → deployer funding behavioral envelope

- **Amount:** exactly 13.443000000 SOL (MP1 debit = deployer credit; p99.1 of MP1's ±1h fingerprint outflow distribution).
- **Time:** Sun 2026-03-15 **00:51:33 EDT** (04:51:33 UTC). Operator local-time signal: late-night Sunday.
- **Gap to deploy:** 16.82h (within 12–17h behavioral profile). Deployer wallet sat idle the entire window — **0 intermediate txs** between funding and deploy.
- **Deployer wallet state at funding:** brand new; the funding tx is the deployer's first tx ever. No prior activity of any kind.
- **MoonPay fingerprint re-verified on chain:** `SetComputeUnitLimit(14548)` ✓, 32-char hex memo `7c61e6fde07f70c202784ed4c9884939` ✓, fee-payer = sender = MP1 ✓.
- **Deploy time:** Sun 2026-03-15 **17:40:44 EDT** (21:40:44 UTC) — weekend-afternoon deploy.

### MP1 ±1h behavioral envelope (n = 555 sigs sampled)

- 478 outbound SOL transfers; **466 (97.5%) carry the MoonPay fingerprint** (CU=14548).
- 346 unique recipients in the 2h window → MP1 is a heavily-trafficked on-ramp hot wallet.
- Amount distribution is retail-heavy: 79% under 2 SOL, median 0.81 SOL. The 8–25 SOL "fresh-wallet-deployer" band contains **only 7 outflows** (including the deployer's).
- **Extrapolated rate:** ~84 fingerprint outflows/day in the 8–25 SOL band (needs ±24h validation).
- **6 sibling 8–25 SOL recipients within ±1h of the deployer's funding** (candidates for L10 co-operators or L-adjacent fresh wallets):
  - `AgHpQzR9Xgo4azHQ1QRHeWMZBScRV3sWgbC7wGBv2u7G` (−51 min, 10.703 SOL)
  - `4x7YtF2eWd1r7xQPDnZisf2psEA5GYKiU3e22x8xMHjx` (−32 min, 10.712 SOL)
  - `PRj9NxHpfLPVZGpBBunah4fMY3UAoKFP92XBCLroTxq` (+23 min, 21.652 SOL)
  - `B8Hb345RNkcVLSF1X8QSFaXhqGK8cqjYG5Y1s2RH3nme` (+47 min, 11.587 SOL)
  - `6qzbHM6epTnCXNoeVxqzShcGkDmBG5qw1ESRTbKyFiaA` (+53 min, 8.427 SOL)
  - `BwLZ3KgoK2Q8CwuXF17B8btu8Vwk9szjvbymrpkJdAW9` (+60 min, 10.331 SOL)

### Post-deploy SPL trace — 37X downstream (3-hop forward walk)

- Deployer → `37XxihfsTW1EFSJJherWFRFWcAFhj4KQ66cXHiegSKg2` → 11 hop-1 recipients → 12 hop-2 recipients → 1 hop-3 recipient.
- **99.9985% of the 326.75M XAIC allocation liquidated on PumpSwap AMM** between deploy+54s and deploy+5d19.5h.
- Realized SOL proceeds: **≥462 SOL lower bound** on XAIC-holder owner accounts; true total higher due to delegate-authority pattern (see below).
- **No CEX touch on any downstream branch** — all unknown-label wallets settling to the PumpSwap pool. No Coinbase/Binance/Kraken deposit wallets reached.
- **Dust still held:** 4,783 XAIC on `4916NkdubkfRyHkxkCR7rpVGz5dvzVdK161mg4jXDwRh`.
- **Delegate/authority pattern:** multiple hop-2 XAIC sells landed SOL proceeds on *different* wallets than the XAIC holders — candidate network-infrastructure beneficiaries:
  - `YAh1vvZPnuCjZ354LF8ria76cJaSEPvPyPYuRoxVkuH`
  - `8ncU5YW1CQwvr4gs7buH57bW58e86TDau4STrCJBuz8z`
  - `GMCJvYGf5Ex2ARiMquaBDqU6iKM8uiEQkB8jCnoNfHpC`
  - `CdeigPnaYwWLqqmZ9u4Spxk8nPaDFyFQwjNuGzuJjJP6`
  - `51FQwjrvo8J8zXUaKyAznJ5NYpoiTCuqAqCu3HAMB9NZ`
  - `FxGiN5NkigicwrnFshZEAUH9C13yrBALmgYxA9x8sfnQ`

### L11 predictive-value signals surfaced

- **Narrow monitor filter:** `CU=14548 MP1 outflow + amount ∈ [8, 25] SOL + recipient is fresh (0 prior txs)` → on the order of 10 candidates/day in the ±1h-extrapolated rate; should land in single digits after fresh-wallet filter.
- **Operator timezone/weekday hypothesis:** Sunday 00:51 EDT funding → Sunday 17:40 EDT deploy (weekend, late-night operator hours). Needs L4–L10 cross-check to confirm or refute as a real signal.
- **16.82h dormancy confirmed** against prior 12–17h profile; idle-wallet signature (zero intermediate txs) is itself a monitor signal — a fresh MP1-funded wallet that signs any tx before the 12h mark is probably NOT the deployer.

### Phase-1 open items (not yet walked)

1. **Full ±24h MP1 fingerprint-outflow sweep** — validate the ~84/day 8–25 SOL rate and surface any more 8–25 SOL siblings. Current data is ±1h only.
2. **Cross-reference the 6 identified ±2h siblings against `data/network-map.json`** — are any known wallets? Are any fresh-at-time with subsequent pump.fun deploys?
3. **Cross-launch MP1 funding analysis L4–L9** — was L10 the first time the operator used MP1 directly, or is this a recurring pattern? Extract each prior launch's funding tx + route.
4. **Operator timezone signal validation** — plot L4–L10 funding + deploy times in EDT; confirm or refute the Sunday-late-night / Sunday-afternoon pattern.
5. **6 delegate/authority beneficiary wallets from the 37X downstream** — cross-reference against network-map.json; probe those not yet known.
6. **37X itself** — fresh-context wallet probe still queued in Phase 2 (slot already scaffolded in the doc).
7. **Deployer's 316 post-deploy txs** — any network-relevant patterns beyond the single 37X SPL dump (bundle activity, LP operations, profit extraction paths).
8. **1-lamport dust-spray txs at deploy+3s** — the 18-recipient set may contain network-related co-recipients worth a cross-reference pass; previously dismissed as spam without verification.

## Summary

_To be filled after Phase 3. CONVERGENT / DIVERGENT / NET-NEW counts; open questions; proposed `network-map.json` writebacks; proposed `launch-details.json` writebacks._

---

## Next-session plan

Priority order. Each item = action + purpose + scope. User approval recorded 2026-04-20 end-of-session.

**1. Trace the 6 MP1 ±1h sibling wallets in their entirety.**
Action: full fresh-context investigation of each — upstream funding chain ≥2 hops (with horizontal sibling enumeration), downstream asset flow until terminal, wallet freshness at funding moment, whether it deployed a pump.fun token within 12–17h, cross-launch presence in `data/network-map.json`.
Purpose: these six wallets received 8–25 SOL MoonPay-fingerprint outflows from MP1 within ±1h of the deployer. If any is fresh-at-funding and deployed pump.fun within the 12–17h window, it confirms the L10 pattern is already recurring elsewhere AND validates the L11 monitor filter. Any already-known network wallet confirms prior classification.
Scope: `AgHpQzR9Xgo4azHQ1QRHeWMZBScRV3sWgbC7wGBv2u7G`, `4x7YtF2eWd1r7xQPDnZisf2psEA5GYKiU3e22x8xMHjx`, `PRj9NxHpfLPVZGpBBunah4fMY3UAoKFP92XBCLroTxq`, `B8Hb345RNkcVLSF1X8QSFaXhqGK8cqjYG5Y1s2RH3nme`, `6qzbHM6epTnCXNoeVxqzShcGkDmBG5qw1ESRTbKyFiaA`, `BwLZ3KgoK2Q8CwuXF17B8btu8Vwk9szjvbymrpkJdAW9`.

**2. Validate the operator time/weekday fingerprint across L4–L10.**
Action: extract each prior launch's funding-tx blockTime and deploy-tx blockTime from `data/launch-details.json` + `data/launch-history.json`. Convert to EDT (DST-aware). Tabulate weekday + hour.
Purpose: L10's pattern is Sunday 00:51 EDT funding → Sunday 17:40 EDT deploy. If L4–L9 cluster on weekends and US late-night-to-afternoon hours, we gain a hard L11 monitor-activation window (cut daily monitoring noise by ~70%). If they're scattered, this is L10-specific and not a signal.

**3. 37X fresh-context wallet probe (Phase 2 step already queued).**
Action: chain-walker probe — identity, funding chain ≥2 hops, first activity ever, prior network-map membership, RXRP cross-launch presence (MEMORY.md flags `37X` + `52e` as pending SPL analysis).
Purpose: 37X received 100% of L10's deployer XAIC allocation and fanned it out for liquidation — this is clearly network-adjacent infrastructure. chain-skeptic gate mandatory before any `network-map.json` write.

**4. Probe the 6 "profit-consolidation" wallets from the 37X downstream trace.**
Plain English: in the 37X → hop-2 fan-out, six of the hop-2 XAIC-holder wallets sold their tokens but the SOL proceeds landed on *different* wallets. That pattern means a single operator likely controls multiple XAIC-holder wallets while consolidating cash-out onto fewer "beneficiary" wallets. Those beneficiaries are probably where the operator's profit actually accumulates.
Action: cross-check each beneficiary against `data/network-map.json` first. Probe any that aren't already known.
Scope: `YAh1vvZPnuCjZ354LF8ria76cJaSEPvPyPYuRoxVkuH`, `8ncU5YW1CQwvr4gs7buH57bW58e86TDau4STrCJBuz8z`, `GMCJvYGf5Ex2ARiMquaBDqU6iKM8uiEQkB8jCnoNfHpC`, `CdeigPnaYwWLqqmZ9u4Spxk8nPaDFyFQwjNuGzuJjJP6`, `51FQwjrvo8J8zXUaKyAznJ5NYpoiTCuqAqCu3HAMB9NZ`, `FxGiN5NkigicwrnFshZEAUH9C13yrBALmgYxA9x8sfnQ`.

**5. Quick scan of the deployer's 316 post-deploy txs (brief).**
Action: filter for LP operations, additional on-chain hops beyond the 37X dump, and any bridge/CEX deposit. Expected 15 min, probably confirms "mostly bonding-curve noise".
Purpose: rule out any undocumented profit-extraction path.

**6. Verify the 1-lamport dust-spray recipient sets (brief, 5 min).**
Action: list the 18 recipients from each of the two dust-spray txs (slot 406658724); cross-reference against `data/network-map.json`. User estimate is 99% just pump.fun launch spam.
Purpose: cheap confirmation; flag any network-known recipient if anomaly surfaces.

**7. Phase 2 — remaining 11 user-listed wallets + 7 NET-NEW Bloom-match first-minute buyers.**
Execute per the plan's step-by-step order (`5tzFkiKs…` first), fresh-context per wallet. The 7 Phase-0 NET-NEW Bloom buyers (`7JgFx6uZ…`, `6cfUcAUF…`, `KisfjVS7…`, `RjWYrgX2…`, `DtvF74cD…`, `99JFWJ6T…`, `C1s6pzRd…`) get appended to the queue.

**Deferred to end of investigation (per user):**
- Full ±24h MP1 fingerprint-outflow sweep — do this once the monitor is loaded with all known wallets, so we can answer "of all 8–25 SOL MP1 recipients in a full day, how many are already-known actors vs. new" without re-scanning.
- Phase 3 cross-reference with existing `data/network-map.json`.
- Phase 4 writeback to `data/network-map.json` + `data/launch-details.json`.
