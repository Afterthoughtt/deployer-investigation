# Session Handoff — 2026-04-25 Part 3 (7DkvxGJ + Fireblocks deep-dive)

Continuation focus, two threads:

1. **Probe `7DkvxGJbv9qiNGqqE7VZ5jdg6SLDgBtem7NgaiPmnrzA` to terminus** — verified L10 block-0 sniper, MP2-funded, Arkham-labeled `"7dkvxg" on Pump.fun` with 3 Created Token tags, currently dormant for L11. Decisive H1/H2 lead because it deploys pump.fun tokens itself in addition to sniping.
2. **Understand what "Fireblocks Custody" actually is** in our deployer-cashout chain — registry shows 4 Fireblocks-tagged addresses receiving $400K+ in deployer profits, on-chain trail ends there. Operator wants to know what this service is and whether the trail can be picked back up.

L11 has fired or is firing today (2026-04-25 14:00–18:00 EST). If launch already occurred when the next session starts, pull the actual L11 block-0 buyer set first and compare against the Tier-1 whitelist in §2.

---

## 1. The two open questions this handoff exists to answer

### 1.1 Is `7DkvxGJ` an operator-controlled wallet or an independent insider?

What's known:
- L10 XAIC block-0 sniper, T+1s same slot 406,658,718 as DmA9 + 6zZ + D4tU7mrf, all via Bloom Bot router `b1oomGGqPKGD6errbyfbVMBuzSC8WtAAYo8MwNafWW1` with same fee wallet `7HeD6sLLqAnKVRuSfc1Ko3BSPMNKWgGTiWLKXJF31vKM` (handoff Part 2 §2.2).
- Funded by MoonPay MP2 `5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1` (operator's L10 report). Same on-ramp as Figg + L10 deployer = shared backend.
- Arkham `arkhamLabel` = `"7dkvxg" on Pump.fun`, `populatedTags` include three Created Token tags:
  - `HEZdEXw8rirh9NhY9aqyDC3ExGzMs2hQRTRpASD8pump`
  - `zjZfVkorGxFT6TyHSv2a34SK9TuEEoh4az34jfUpump`
  - `CcDdm6YQX5Z6mrq68siqepNUSTjRWQ3McKR89aGFXray`
- `isUserAddress=false` per Arkham — but registry note says the flag marks bot-signing, not human absence.
- **NOT in operator's manually-curated `Sniper Network` userEntity** (operator confirmed mid-session that the userEntity is their own quick-triage list and explicitly said not to over-weight it).
- Currently dormant for L11: balance 0 SOL, last activity 2026-04-17 (sent 0.04 SOL). Has not been re-armed by SUSYE in the L11 window despite SUSYE arming 9 other wallets.

The decisive test for this wallet: **were the 3 Created Token mints sniped block-0 by Figg-cluster or SUSYE-side wallets?** If yes, `7DkvxGJ` is an operator side-deployer used for non-deployer-tracker pump.fun launches — H1 with high confidence. If no, it's likely an independent dev who happens to also snipe.

### 1.2 What is the Fireblocks the deployer cashes out to?

Per [data/results/investigation-notes.json](data/results/investigation-notes.json) profit-extraction map and Arkham labels surfaced this session, the deployer's profit chain ends at three+ "Fireblocks Custody"-labeled addresses:

- `Bra1HUNKj1tcM3iKnL3pHc2m1rXkXZ9JELq4ceivag34` — Arkham `arkhamLabel`=Fireblocks Custody, registry-tagged "deployer-network consolidation hub"
- `9cDDJ5g2wPqVZUZwpPuwqzxN7ouvc6QFauFwrX2TTTAX` — Arkham `arkhamLabel`=Fireblocks Custody, 31k SOL balance, registry note "L7 deployer drain destination, top outflows $31M USDC + 26M SOL + 20M USDT"
- `9exPdTUVTCz9EKvZjXkKJSTJ5fZzJuwJHnFptrUFHFNH` — Arkham `arkhamLabel`=Fireblocks Custody, registry "L7 deployer drain (516 SOL → 9cDDJ5g2)"
- `49mvMufixEbUMzZEUVAnbQ8hLLuEWy789XfKUNTz7wCv` — registry-tagged "Token Millionaire — Fireblocks Custody, sends $45.3M to Large Funding Source"; registry verdict (last reviewed 2026-03-31 per investigation-notes.json) marks this as outside the deployer's control surface — **re-verify this verdict at session start since the Fireblocks investigation may surface new evidence.**
- `7RLD6F9SiFvtdqW4bYpy4m8D3mum7xVdZUSjzv1TWJaf` — registry-tagged "Fireblocks 7RLD6F9S, role=profit_routing"; receives $4K from cold_usdc_2 (Route G), $2.6K from another network passthrough.

The investigation-notes.json explicit caveat (line 53):
> Arkham labels many wallets 'Fireblocks Custody' on Solana — broad label covering any wallet interacting with Fireblocks infrastructure. Does NOT mean same entity.

So "Fireblocks Custody" isn't one wallet — it's a label Arkham applies to many addresses that interact with Fireblocks infra. The on-chain trail ends because Fireblocks settles internally via ledger entries, not on-chain transfers.

What the operator wants to learn:
- **What kind of service is Fireblocks?** Custody platform, exchange, treasury manager?
- **Why does the deployer use it?** Compliance, off-ramp, OTC settlement, mixing?
- **Can we pick the trail back up?** Once funds enter Fireblocks Custody, where do they realistically go next (which exchanges, which off-ramps)?
- **Are the 4 Fireblocks-tagged addresses the same Fireblocks customer or 4 different customers?**

---

## 2. What was verified this session (Part 3) — audit-grade

### 2.1 SUSYE deployer mass-armed 9 wallets in a 12-minute window — decisive H1 evidence for the SUSYE/DmA9 half

Window: 2026-04-22 12:59:11 → 13:11:17 UTC. Single funder `2Zizao3xpJGsoUFdvTJjYL8LijtFxR9v36cNBeDJJVSz` (SUSYE deployer). Every transfer bracketed by 2Zi-prefixed vanity-cluster dust pings (`2Zi1apkSiDqArmrAwJdHwkVUn2BiqyiVV1ffG1tT3wSz` and `2Ziz3B9rt8dbS1QanWQLqmTa5Erw4r7q79MR3UCgJVSz`). Same fingerprint as DmA9's known L11 pre-arm — at scale.

| Address | Funded UTC | SOL | Note |
|---|---|---|---|
| `DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn` | 12:59:11 | 1.972 | known L11 pre-arm |
| `HGBDXXp4J92r3w8Dc4kcwz5ZSebmwXg7uVwtc1y2B8yr` | 12:59:53 | 1.717 | NEW |
| `F8apn98Fsy6ZX9ns3KLZHS4nNPxXf3nrxGkKrFXLfyx2` | 13:00:46 | 0.062 top-up | NEW; already had 2.1 SOL from CoinSpot 2026-03-15 |
| `6ryCG9unTP3wgSeh5yDJk34oHXPpeF5m7Cr8Y6Y7nrWY` | 13:02:38 | 1.600 | NEW |
| `HNtUfwrF2UnNBJBQ6VCCbTTRYHi8SuHDBzxf9i1CwEUU` | 13:04:01 | 1.787 | NEW; 2026-04-21 sent 5.054 SOL → `9a22FhBeMJq4nuuvBRCsW67vAwPdLUN8eGJwykaUf7TH` (DmA9 collector) — full L10→L11 cycle |
| `Ge2kdwU74jbHAUSEbTSosfrCJiNiAxH4LdH8jDxcc2KJ` | 13:05:05 | 1.500 | NEW |
| `DYJUQgcGLJNH3E4qhNFX2ZLnDFuz5kRgHamncsrNLzJb` | 13:05:49 | 1.900 | NEW |
| `GWoyRCBngoWXd7SDb9qs9m5BeFyjM3W4g3nLgwpppeiR` | 13:06:19 | 1.770 | NEW |
| `HyeRfQsb7iuCNdX2H2G9q6LyBmCaB3gF98tgHeEgycfw` | 13:06:55 | 0.930 | NEW |
| `GoS4PT6q1kxKAbxymAh3pEix8MD8zVV55amdgECJatTp` | 13:11:17 | 1.080 | NEW |

Plus Figg-side reload in same broader window:
- `22YY15fRseLSWfwaMDZaBn7XdByJqTYzjn7mYjM1j2wS` — Figg→1 SOL on 2026-04-24 16:47:34, then 11 SOL on 2026-04-25 12:57:49. Balance 12 SOL.
- `6zZAKeF5zftUZHCkoWpno6MbaX2LrLwYBCFaEwLLaFDk` — Figg→0.1 SOL trickle 2026-04-25 13:00:54, then 3.5 SOL reload 13:01:36 (4 minutes after the 22YY15 main load). Balance 3.6 SOL.

### 2.2 Arkham attribution sweep on 77 cluster + sniper + terminus + novel-operator addresses

Saved at [data/results/figg-phase-d-attribution-2026-04-25.json](data/results/figg-phase-d-attribution-2026-04-25.json) and [data/results/figg-phase-d-attribution-extracted-2026-04-25.json](data/results/figg-phase-d-attribution-extracted-2026-04-25.json).

Key labels found:
- `2eVVdqWN4t7umzXGxJ21uTpB5WrUyyQMYnkq6UHtg3ba` = **Rainbet Deposit** (gambling)
- `83Nf4kNbeaRSGwjYyStK4F3ctmH3v5Yar2GmWv9fJqf6` = **Rainbet Deposit** (gambling)
- `5HQZd9ovzAF1TLnHRAq1zcSnXC9HAp3EwhoxMHvo8rxB` = **Rainbet Hot Wallet** (entity=Rainbet, tag=Gambling)
- `2wGZCehkDBMDPLMNXJjFf7kjAm46MJV3t3htmGVa4S16` = **Kraken Deposit**
- `43PcTMd37rBVECXqPjqSHBaM2JMPbiFvpF2Eei8u3LyU` = **Coinbase Deposit**
- `Bra1HUNKj1tcM3iKnL3pHc2m1rXkXZ9JELq4ceivag34` = **Fireblocks Custody**
- `9cDDJ5g2wPqVZUZwpPuwqzxN7ouvc6QFauFwrX2TTTAX` = **Fireblocks Custody**
- `9exPdTUVTCz9EKvZjXkKJSTJ5fZzJuwJHnFptrUFHFNH` = **Fireblocks Custody**
- `HV1KXxWFaSeriyFvXyx48FqG9BoFbfinB8njCJonqP7K` (operator's L4 dev list) = **OKX DEX Router Authority** — NOT a wallet, drop from dev list
- `784bxhz6xUA88Rk6jb1aTU7FjjkoxAmASsrSDEry2Zvw` (operator's L10 dev list) = userEntity `Panther` (operator-tagged), first-funded by Bundle 5

### 2.3 Operator's "Sniper Network" userEntity caveat

Arkham userEntity `baf37731-8a94-4ba3-85db-0aa9bdc35532` named `Sniper Network` lists 26 addresses including Figg + 2Zizao3x (SUSYE) + DmA9 + 9a22FhBe + pNdKKMjG + 22YY15 + 19 others. Operator confirmed mid-session: **this is their own quick-triage tag, not deeply verified — do not over-weight it.** The 19 "new" members surfaced via this entity are operator-flagged candidates for further verification, not confirmed network.

Of those 19, 8 turned out to be live SUSYE-armed L11 candidates (covered in §2.1 above). Others either had post-L9/L10 profit-cycle history or were dormant/test wallets — see [data/results/figg-l11-armed-check-2026-04-25.json](data/results/figg-l11-armed-check-2026-04-25.json) tier_2_dormant_with_prior_cluster_history.

### 2.4 Operator-supplied "confirmed dev wallets" cross-reference

Operator provided a per-launch list of wallets that received SPL directly from the deployer wallet. Saved at [data/results/operator-known-dev-wallets-2026-04-25.json](data/results/operator-known-dev-wallets-2026-04-25.json).

- 33 unique addresses, 21 already in `data/network-map.json` (Bundle 1–6, Hub, OG Deployer, L4–L8 deployers, etc.).
- 12 net-new — top 3-launch recurrence: `FFvb2ZQrjzMAgDpvHs8jVA5nJjTs1NnXD6wqTC3FKVed` (L6, L7, L9). `HV1KXxWFaSeriyFvXyx48FqG9BoFbfinB8njCJonqP7K` resolved as OKX router (drop). Other 10 are 1-launch hits.
- **Zero overlap with Figg-cluster member set.** Deployer has NEVER directly distributed post-deploy SPL to a Figg-cluster wallet — but distribution to the L7 deployer (`HYMtCcfQTkBGw7uufDZtYHzg48pUmmBWPf5S44akPfdG`) and to the cross-cluster bridge `pNdKKMjGcx5m5AKuB79kYT5SpDSio4GFRj7xE1bosmU` is documented. SPL is one channel; SOL bridges are another.

### 2.5 H1 vs H2 — current verdict

**~70–75% H1.** The SUSYE/DmA9 half is unambiguously dev (mass-arming via single funder + dust signaling cannot be explained under H2). The Figg half is heavily H1-leaning — same Bloom config, same on-ramp (MP2), same-slot synchronized launches, multiple direct bridges — but cashout-chain divergence means H2-with-payment can't be ruled out yet.

**What would close to >90% H1:** any Figg-cluster terminus reaching `Bra1HUNKj1tcM3iKnL3pHc2m1rXkXZ9JELq4ceivag34` / `49mvMufixEbUMzZEUVAnbQ8hLLuEWy789XfKUNTz7wCv` / `J6YUyB4P4LFfHqWxJvfXQC7ktFKgvx8rzfJFEzTNJmcT` (Coinbase deposit) / a CB1–CB10 deposit / shared Fireblocks deposit, or a Nansen-/Arkham-labeled CEX account that both sides feed.

**What would push toward H2:** Figg-cluster terminuses ALL resolving to independent CEX/casino accounts with no overlap, AND a clear "rate-card" pattern where Figg's take is a fraction of deployer profit (paid-service shape).

---

## 3. L11 candidate set — Tier-1 fire-ready (state at session close 2026-04-25)

Add these 12 to the Bloom whitelist for L11 block-0 if not already done. Source: [data/results/figg-l11-armed-check-2026-04-25.json](data/results/figg-l11-armed-check-2026-04-25.json) section `tier_1_armed_l11_whitelist`.

| # | Address | SOL | Funder |
|---|---|---|---|
| 1 | `22YY15fRseLSWfwaMDZaBn7XdByJqTYzjn7mYjM1j2wS` | 12.0 | Figg |
| 2 | `6zZAKeF5zftUZHCkoWpno6MbaX2LrLwYBCFaEwLLaFDk` | 3.6 | Figg |
| 3 | `F8apn98Fsy6ZX9ns3KLZHS4nNPxXf3nrxGkKrFXLfyx2` | 2.07 | SUSYE |
| 4 | `DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn` | 1.999 | SUSYE |
| 5 | `DYJUQgcGLJNH3E4qhNFX2ZLnDFuz5kRgHamncsrNLzJb` | 1.9 | SUSYE |
| 6 | `HNtUfwrF2UnNBJBQ6VCCbTTRYHi8SuHDBzxf9i1CwEUU` | 1.8 | SUSYE |
| 7 | `GWoyRCBngoWXd7SDb9qs9m5BeFyjM3W4g3nLgwpppeiR` | 1.77 | SUSYE |
| 8 | `HGBDXXp4J92r3w8Dc4kcwz5ZSebmwXg7uVwtc1y2B8yr` | 1.73 | SUSYE |
| 9 | `6ryCG9unTP3wgSeh5yDJk34oHXPpeF5m7Cr8Y6Y7nrWY` | 1.6 | SUSYE |
| 10 | `Ge2kdwU74jbHAUSEbTSosfrCJiNiAxH4LdH8jDxcc2KJ` | 1.5 | SUSYE |
| 11 | `GoS4PT6q1kxKAbxymAh3pEix8MD8zVV55amdgECJatTp` | 1.08 | SUSYE |
| 12 | `HyeRfQsb7iuCNdX2H2G9q6LyBmCaB3gF98tgHeEgycfw` | 0.93 | SUSYE |

Refresh balances + last-tx at session start — values will be stale.

---

## 4. Next-session investigation plan

### 4.1 Thread A — `7DkvxGJ` deep-dive

Subject: `7DkvxGJbv9qiNGqqE7VZ5jdg6SLDgBtem7NgaiPmnrzA`

**A1 — Full transfer history.** `getWalletTransfers` paginate to terminus. Capture every inbound + outbound. Cost: ~3-5 pages × 100 cr = ~400 cr. Goal: full counterparty map, identify post-L10 profit drain destination, identify any deployer-network or Figg-cluster contact.

**A2 — Funder upstream verification.** `getWalletFundedBy` to confirm MP2 first-fund. If first-funder is something other than MP2, that changes the picture. Cost: 100 cr.

**A3 — The 3 Created Token mints.** For each of:
- `HEZdEXw8rirh9NhY9aqyDC3ExGzMs2hQRTRpASD8pump`
- `zjZfVkorGxFT6TyHSv2a34SK9TuEEoh4az34jfUpump`
- `CcDdm6YQX5Z6mrq68siqepNUSTjRWQ3McKR89aGFXray`

Pull early-buyer set. Use `getSignaturesForAsset` (10 cr) to get the first ~50 sigs of each token, then `parseTransactions` (100 cr per batch) on the first 10 sigs to identify block-0 buyers. Cost: ~500 cr.

**Decisive test:** if any block-0 buyer of `7DkvxGJ`'s 3 created tokens is in the Figg cluster (handoff §6) or is a known deployer-network wallet, that's H1-decisive — operator deploying his own non-tracked tokens via `7DkvxGJ` and self-sniping with his own infrastructure. If block-0 buyers are unrelated retail, `7DkvxGJ` is a token-deployer-who-also-snipes (likely H1-adjacent insider).

**A4 — Nansen counterparties.** `/profiler/address/counterparties` on `7DkvxGJ` (5 cr). Cheap aggregated view of top trading partners.

**A5 — Cross-reference with operator's dev list and Figg cluster.** Already done at session-close — `7DkvxGJ` is NOT in operator's confirmed-dev-wallet list and NOT in Figg-cluster member set. Re-confirm at start.

Estimated cost: ~1,200 Helius cr + 5 Nansen cr + ~30 Arkham label-bucket lookups (for any newly-surfaced terminus addresses).

### 4.2 Thread B — Fireblocks Custody investigation

This is partly a research thread, partly an on-chain investigation.

**B1 — Read all Fireblocks-tagged registry entries.** Re-read [data/network-map.json](data/network-map.json) for: `Bra1HUNKj1tcM3iKnL3pHc2m1rXkXZ9JELq4ceivag34`, `9cDDJ5g2wPqVZUZwpPuwqzxN7ouvc6QFauFwrX2TTTAX`, `9exPdTUVTCz9EKvZjXkKJSTJ5fZzJuwJHnFptrUFHFNH`, `49mvMufixEbUMzZEUVAnbQ8hLLuEWy789XfKUNTz7wCv`, and `7RLD6F9SiFvtdqW4bYpy4m8D3mum7xVdZUSjzv1TWJaf`. Plus [data/results/investigation-notes.json](data/results/investigation-notes.json) profit_extraction_map.

**B2 — Public research on what Fireblocks is.** WebSearch: "Fireblocks Custody what is it", "Fireblocks Network institutional custody", "Fireblocks supported exchanges", "Fireblocks settlement off-chain". Key things to learn for the operator:
- Is Fireblocks a custodian, a wallet platform, or a network?
- Who uses Fireblocks (hedge funds, exchanges, OTC desks, market makers)?
- How does Fireblocks Network settle internally — does the trail end on-chain by design?
- What exchanges/off-ramps does Fireblocks integrate with as standard?

**B3 — Distinguish the 4+ Fireblocks-tagged addresses.** Are they one Fireblocks customer (multiple wallets) or 4+ different customers? Test:
- `getWalletTransfers` on each, look at top counterparties — if they all share top counterparties, likely same customer. If counterparties are disjoint, different customers.
- Arkham `intelligence/address` on each (already in the saved Phase D output) — check if `userEntity` field exposes any internal grouping.
- Arkham `/counterparties/entity` (operator-confirmed working on Solana) on each Fireblocks-tagged address. Cost: ~40 cr per call.

**B4 — Profit volumes routed through Fireblocks (re-verify).** investigation-notes.json claims:
- Route C: $49K through `9exPdTUVTCz9EKvZjXkKJSTJ5fZzJuwJHnFptrUFHFNH` → `9cDDJ5g2wPqVZUZwpPuwqzxN7ouvc6QFauFwrX2TTTAX` in Jan 21–22 2026
- Route A: $50,257 from `Bra1HUNKj1tcM3iKnL3pHc2m1rXkXZ9JELq4ceivag34` → `49mvMufixEbUMzZEUVAnbQ8hLLuEWy789XfKUNTz7wCv` (Token Millionaire)
- `49mvMufixEbUMzZEUVAnbQ8hLLuEWy789XfKUNTz7wCv` sends $45.3M to "Large Funding Source"

Re-verify these volumes via `getWalletTransfers` (paginated) on each — confirm the registry numbers haven't drifted.

**B5 — Where does Fireblocks Custody settle to next?** This is the hardest question because Fireblocks settles off-chain by design. But on-chain we can see:
- Addresses Fireblocks Custody wallets eventually send to (might be exchange deposits, customer withdrawals, other Fireblocks customers)
- For `9cDDJ5g2wPqVZUZwpPuwqzxN7ouvc6QFauFwrX2TTTAX` the [data/results/figg-hop3-trace.json](data/results/figg-hop3-trace.json) already shows top outflows: $31M USDC to `3PEUyMXWeZHddYBwtd21S3WYK9AeoCEp9KkUTVX8smer`, $26M SOL to `FHEprhHtHPES6XVcmW7eBRbZAvASQRJcvEB7DFiuW7co`, $20M USDT to `FH9tJjXfkhi6zAgPTnkmccnhGdCYtyLX9psyYuRMXSij`. Probe these next-hop addresses for Arkham labels — they may be Fireblocks-internal or specific exchange deposits.

**B6 — Deliverable for the operator.** Plain-English explainer of what Fireblocks is, what the deployer is using it for, and whether the trail is realistically pickup-able. 1–2 paragraphs, no tables.

Estimated cost: ~800 Helius cr + ~15 Arkham label-bucket lookups + 0 Nansen.

### 4.3 Order of operations

1. Re-verify state on §3 Tier-1 wallets (cheap balance+sig check, ~12 cr) — L11 may have fired.
2. Pull L11 outcome if launch happened (deploy CA, block-0 buyer set).
3. Thread A — `7DkvxGJ` deep-dive in full.
4. Thread B — Fireblocks investigation in full.
5. Synthesize H1/H2 verdict update.

If both threads land H1-decisive evidence, propose registry patches:
- Add the 9 SUSYE-armed wallets to network-map under a new section like `susye_l11_sniper_rig`.
- Update `FiggKseFrgdsk4u3TLpbPFLJDKbahqkJQKEchKcwYsNZ` registry note to reflect SUSYE coordination evidence.
- Add `7DkvxGJ` and its 3 Created Tokens.
- Add Fireblocks-Custody clarifying note.

Per CLAUDE.md, registry patches require explicit ask before commit.

---

## 5. Caveats and known-incomplete items from this session

1. **The operator's `Sniper Network` userEntity is operator-self-tagged and not deeply verified.** Operator explicitly said do not over-weight it. The 19 "new" members it surfaced were investigated for L11 status — see §2.3 — but their inclusion in the entity is just a triage note, not authoritative.

2. **`Ay2RqYZe7sSemKNuvTr6LcSSMUV6LebYgJLBrpZhvHA` returned no transfers.** Closed account or never active. Per CLAUDE.md, zero sigs ≠ never existed. Worth a `getAccountInfo` check.

3. **Phase B (Figg-cluster terminus traces) and Phase C (DmA9/insider sniper outflow traces) NOT YET DONE.** These are the missing piece for the H1 vs H2 question (profit-terminus convergence). See SESSION_HANDOFF_2026-04-25_FIGG_DEEPDIVE.md §4.4 for the prior scope.

4. **Phase A (Figg full inflow enumeration) NOT YET DONE.** Specifically: the MP2 1.321 SOL seed event of 2025-07-08 has not been traced upstream. Outflow side (178 recipients, 7 cluster + 45 unknown_recurse + 126 dust) was already enumerated in [data/results/figg-recipients-classified.json](data/results/figg-recipients-classified.json) on 2026-04-23.

5. **`HGBDXXp4J92r3w8Dc4kcwz5ZSebmwXg7uVwtc1y2B8yr` profit-cycle pattern.** The L11-armed-check artifact's tier_1 entry for this wallet records `prior_funding` as "2026-01-30 CSEncqtq 2.857 + 1.142 SOL" because that's what showed in the limit=20 page. There may be a later CoinSpot inbound matching the L10 day pattern — re-verify with paginated history if probing further.

6. **Arkham datapoints: 1886 remaining as of session close.** Below the default 2000 reserve — future intelligence calls will be blocked unless `ARKHAM_DATAPOINT_RESERVE` is lowered. Note that label-bucket lookups (the ~1,900 budget) is a separate counter and is still healthy.

7. **No NEW Helius batchWalletIdentity attempts in this session.** Prior session reported all-Unknown across 20 cluster wallets; that probably hasn't changed.

8. **`data/network-map.json` not updated this session.** SUSYE-mass-arming finding, the 9 new SUSYE-armed wallets, the Sniper Network userEntity caveat, and the L11 Tier-1 set — all of these are NEW findings that should be reflected in the registry but require operator approval per project rule.

9. **Registry has stale L10 metadata in `data/launch-details.json`** (per Part 2 handoff §4.10) — flagged but out of scope.

10. **`/Users/error/Desktop/investigation/.env` lives at the parent investigation dir, not in the worktree.** Audit scripts need `DOTENV_CONFIG_PATH=/Users/error/Desktop/investigation/.env` prepended to invocation. See §6.1.

11. **`probe-arkham-shape.ts` and `probe-helius-wallet.ts` were created mid-session as quick debugging scripts.** Not core tooling — can be deleted or left in place. Operator preference.

---

## 6. Reference

### 6.1 How to invoke audit scripts in this worktree

```bash
DOTENV_CONFIG_PATH=/Users/error/Desktop/investigation/.env \
  ARKHAM_ALLOW_BATCH_INTEL=1 \
  ARKHAM_LABEL_LOOKUP_RUN_BUDGET=200 \
  npx tsx src/audit/<script>.ts --execute --question "<text>"
```

For Helius MCP tools (preferred for ad-hoc investigation): use directly via the Helius MCP — `getWalletTransfers`, `getWalletFundedBy`, `getBalance`, `getAccountInfo`, etc. Already verified working for this session.

### 6.2 Files written this session

- [data/results/operator-known-dev-wallets-2026-04-25.json](data/results/operator-known-dev-wallets-2026-04-25.json) — operator's per-launch dev list, cross-referenced
- [data/results/figg-phase-d-attribution-2026-04-25.json](data/results/figg-phase-d-attribution-2026-04-25.json) — Arkham 77-address batch (raw + parsed)
- [data/results/figg-phase-d-attribution-extracted-2026-04-25.json](data/results/figg-phase-d-attribution-extracted-2026-04-25.json) — bucketized labels (Sniper Network, gambling, CEX, Fireblocks)
- [data/results/figg-phase-d-new-members-2026-04-25.json](data/results/figg-phase-d-new-members-2026-04-25.json) — Arkham + Helius identity probe on 19 Sniper Network members
- [data/results/figg-l11-armed-check-2026-04-25.json](data/results/figg-l11-armed-check-2026-04-25.json) — **OPERATIONALLY CRITICAL** — Tier-1 L11 whitelist + SUSYE mass-arming finding
- New tooling: [src/audit/figg-phase-d-attribution.ts](src/audit/figg-phase-d-attribution.ts), [src/audit/figg-phase-d-new-members.ts](src/audit/figg-phase-d-new-members.ts), [src/audit/figg-l11-armed-check.ts](src/audit/figg-l11-armed-check.ts), [src/audit/probe-arkham-shape.ts](src/audit/probe-arkham-shape.ts), [src/audit/probe-helius-wallet.ts](src/audit/probe-helius-wallet.ts)

### 6.3 Reference primitives used this session

`7DkvxGJ` deep-dive subject + Created Tokens:
- `7DkvxGJbv9qiNGqqE7VZ5jdg6SLDgBtem7NgaiPmnrzA`
- `HEZdEXw8rirh9NhY9aqyDC3ExGzMs2hQRTRpASD8pump`
- `zjZfVkorGxFT6TyHSv2a34SK9TuEEoh4az34jfUpump`
- `CcDdm6YQX5Z6mrq68siqepNUSTjRWQ3McKR89aGFXray`

Fireblocks-tagged addresses (re-verify in registry at session start):
- `Bra1HUNKj1tcM3iKnL3pHc2m1rXkXZ9JELq4ceivag34`
- `9cDDJ5g2wPqVZUZwpPuwqzxN7ouvc6QFauFwrX2TTTAX`
- `9exPdTUVTCz9EKvZjXkKJSTJ5fZzJuwJHnFptrUFHFNH`
- `49mvMufixEbUMzZEUVAnbQ8hLLuEWy789XfKUNTz7wCv`
- `7RLD6F9SiFvtdqW4bYpy4m8D3mum7xVdZUSjzv1TWJaf`

`9cDDJ5g2wPqVZUZwpPuwqzxN7ouvc6QFauFwrX2TTTAX` top outflow addresses (from figg-hop3-trace.json — candidates for B5):
- `3PEUyMXWeZHddYBwtd21S3WYK9AeoCEp9KkUTVX8smer` ($31M USDC)
- `FHEprhHtHPES6XVcmW7eBRbZAvASQRJcvEB7DFiuW7co` ($26M SOL)
- `FH9tJjXfkhi6zAgPTnkmccnhGdCYtyLX9psyYuRMXSij` ($20M USDC)
- `C74G2Bn4WPuc9h5gWEingUkAusvnWVc2s2YRHWwAV9yB` ($18M SOL)
- `DmNv9S8iGbHkS8oGzx6BdsrQTLUsUQhESLSFs77zQ2n7` ($13M SOL)

SUSYE deployer + dust pingers:
- `2Zizao3xpJGsoUFdvTJjYL8LijtFxR9v36cNBeDJJVSz` (SUSYE deployer)
- `2Zi1apkSiDqArmrAwJdHwkVUn2BiqyiVV1ffG1tT3wSz` (vanity dust pinger)
- `2Ziz3B9rt8dbS1QanWQLqmTa5Erw4r7q79MR3UCgJVSz` (vanity dust pinger)

DmA9 profit collector (where operator-side profits drain):
- `9a22FhBeMJq4nuuvBRCsW67vAwPdLUN8eGJwykaUf7TH`

Bloom Bot infra (constant across all launches):
- `b1oomGGqPKGD6errbyfbVMBuzSC8WtAAYo8MwNafWW1` (router program)
- `7HeD6sLLqAnKVRuSfc1Ko3BSPMNKWgGTiWLKXJF31vKM` (fee wallet)

MoonPay on-ramps (shared between Figg + deployer):
- `Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6` (MP1 — funded L10 deployer)
- `5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1` (MP2 — seeded Figg + funded 7DkvxGJ)

CoinSpot deposit (deployer's primary on-ramp):
- `CSEncqtqbmNRjve42sNnbs5cCSmrjUNsAEwc17XY2RCs`

---

## 7. Credit accounting (this session)

- Helius credits used: ~5,000 (MCP getWalletTransfers x ~22, plus prior phase sweeps)
- Arkham datapoints used this session: ~200 (started ~2,000, ended ~1,886)
- Arkham label-bucket lookups used: ~115 of ~1,900 — bucket still healthy
- Nansen credits used: 0

Re-verify Arkham bucket per session via `GET /subscription/intel-usage` per CLAUDE.md.

---

## 8. Don't forget at session start

- Re-read `CLAUDE.md` and `STRATEGY.md` (registry priors are hypotheses, not starting truths — Claim Integrity rule).
- Re-read [data/network-map.json](data/network-map.json) entries for the four Fireblocks-tagged addresses in §1.2 BEFORE making any claim about Fireblocks.
- Re-fetch current state on §3 Tier-1 wallets (balances, recent sigs).
- Re-verify Arkham intel-usage budget (`GET /subscription/intel-usage`).
- Run `npm run audit:primitive-integrity -- <new files>` and `npm run audit:claim-integrity -- <new files>` before publishing any registry patch or writeup produced.
- L11 outcome: pull the actual L11 early-buyer set and compare to §3 Tier-1 predictions before doing anything else.
- For Fireblocks Thread B6 deliverable, give the operator plain-English prose, not a table — they want to learn what Fireblocks is, not just see labels.
