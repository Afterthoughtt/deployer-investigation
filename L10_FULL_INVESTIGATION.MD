Deployer Detection    Critical wallet infrastructure:  

1. 2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB This is the most recent entity wallet that was funded and deployed. it was  used for the most recent project launch (XAICASH ca: KfByHk48ecitUq8gXji2vr9smmRJKtqJwGAh2E9pump)  We should run a full investigation into this wallet, specifically all tx's around the time of this deploy (note: this entity has a pattern to sometimes launch additional tokens afterwards to see if he can catch snipers etc after a successful launch, these tokens are just noise)  I will establish a timeline to the best of my ability, you will verify my reports and cross reference them.   Mar 15 14:40:44 (PST) - The token is first deployed via pump.fun. the dev deploys the token with a 13.135802468 Solana buy. Roughly 327M tokens of the 1B supply.  (refer to the quick reference at the bottom of this document on the mechanism)  Mar 15 14:40:45 - DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn then snipes the token for 4.18765 SOL or 66M supply. This transaction was <1s after launch. This wallet used Bloom Bot to whitelist the deployer ahead of time to then snipe the launch at block 0.  This wallet was funded by CSEncqtqbmNRjve42sNnbs5cCSmrjUNsAEwc17XY2RCs (its still somewhat unclear what exchange this is from (Solscan lists it as Binance, Arkham has no specific label for it, and Nansen labels it as Coinspot.  100% confidence this is related to our entity, if not his network then someone close to him.    Mar 15 14:40:45 - 6zZAKeF5zftUZHCkoWpno6MbaX2LrLwYBCFaEwLLaFDk also snipes the token for 9.87654 SOL or 117M supply. This wallet was also used as a sniper via Bloom Bot.   This wallet was funded by FiggKseFrgdsk4u3TLpbPFLJDKbahqkJQKEchKcwYsNZ (This wallet is definitely entity infrastructure and requires a very in-depth and detailed analysis on all tx and funding patterns)  5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1 is the wallet that funded Figg, solscan labels this as "Binance 2" Arkham AND nansen label it as "Moonpay" We could find out by matching the CU Limit/32-hex moonpay identifiers.    Mar 15 14:40:45 - 7DkvxGJbv9qiNGqqE7VZ5jdg6SLDgBtem7NgaiPmnrzA also snipes with Bloom Bot, although a much smaller transaction 0.49382 SOL or 4.8M supply. This wallet was also funded by 5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1.    *Mar 15 14:40:45 - TRCq57hZ4Eyy4aaNpYV2VCEWpK1hMcLPrkvwF4HRRAE buys next, also via Bloom **IGNORE THIS WALLET, I KNOW THE ENTITY IT IS NOT IN THE NETWORK**   Mar 15 14:40:45 - chrisVmt4xpnsvGsKrkzW4a2Si6xTTixUpzsk99ixWR purchases 9.97530 SOL or 69M supply. This looks to be once again a Bloom Bot snipe.   This wallet was funded by 27eJASWffRBt6Xyuxq4N2MmgqLZrvt6TUqJQw1QN1zby I believe.   27eJASWffRBt6Xyuxq4N2MmgqLZrvt6TUqJQw1QN1zby was funded by 7D3HzSsNWaz17gNrcu9m7Kg74niUWikTTjAdiW65vCvD  This network is very in-depth and requires a lot of research.    Mar 15 14:40:45 - D4tU7mrfyuw3yRGeeB643EfFQYXSAMKeiJ7mVeYicBNv buys 1.18518 Sol or 6.9M supply. Funded by 5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9 (labeled as Binance on arkham/solscan/nansen)    As we know, the deployer always buys a lot of supply and then sends the SPL off to "side wallets" this is done to reduce his overall supply visually and to attract more buyers. WE must investigate where he send the tokens to, and if those wallets are known entities, or if they are new wallets linked to his network.                                        
# Pump.fun Token Mint & Dev Buy — Quick Reference

**Official docs:** [github.com/pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs)
**Program ID:** `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` (mainnet + devnet)

## Minting (`create` / `create_v2`)

One instruction does all of it:

- Creates SPL mint (legacy Token for `create`, Token-2022 for `create_v2`)
- Creates bonding-curve PDA: seeds `["bonding-curve", mint]`
- Writes metadata (Metaplex or Token-2022)
- **Mints full 1B supply to the bonding curve at creation**

Args: `(name, symbol, uri, creator)` + `(is_mayhem_mode, is_cashback_enabled)` for v2. **No buy/allocation parameter exists.**

## Bonding curve (Uniswap V2 style, virtual + real reserves)

| Field | Initial value |
|---|---|
| `token_total_supply` | 1,000,000,000 |
| `virtual_token_reserves` | 1,073,000,000 |
| `virtual_sol_reserves` | 30 SOL |
| `real_token_reserves` | 793,100,000 (tradable) |
| `real_sol_reserves` | 0 |

~206.9M tokens reserved for PumpSwap LP seed on graduation. `complete = true` when `real_token_reserves == 0`, then permissionless `migrate` moves liquidity to PumpSwap and burns LP.

## Dev pre-buy

**No protocol-level pre-buy exists.** Achieved by atomically bundling `create` + `buy` in the same transaction (or Jito bundle, up to 5 signer wallets). Dev becomes first buyer on the curve. All-or-nothing atomicity.

Key docs quirk: `creator` pubkey in `create` is **not required to be a signer**. This enables the "free create" flow where a third party (the `user`) pays rent and executes create + first buy, while `creator` in metadata is someone else.

---

# Investigation Appendix — 6zZAKeF5 (added 2026-04-22)

## Verified primitives (L10 snipe)

- **Snipe tx:** `cK1gTcho2hP4fUad3xCEUNqT7cCbYeT1EdmUUJyJC9yuGnyKHNDwMJw3D5bt2HcSJvtCa9ua1yk7XvKVK5AzK9t`
- **Timestamp:** `2026-03-15T21:40:45Z` — matches user's Mar 15 14:40:45 PDT exactly.
- **Fee payer & signer:** `6zZAKeF5zftUZHCkoWpno6MbaX2LrLwYBCFaEwLLaFDk` (signed directly, not a bundle payer).
- **SOL out:** `9.876543209 SOL` → pump.fun bonding curve. ✓ matches claim.
- **Tokens in:** `117,450,117.443767 KfByHk48ecitUq8gXji2vr9smmRJKtqJwGAh2E9pump` (≈117M XAIC). ✓ matches claim.
- **Total SOL cost with priority:** `11.302 SOL` (9.876 buy + 0.70 Jito tip + 0.10 BloomBot fee + 0.093 creator fee + 0.0296 platform fee + 0.002 ATA rent).
- **Priority:** network fee `0.50 SOL`. CU limit `131,938`. CU price `3,789,620,882 µlamports`.
- **Router used:** `b1oomGGqPKGD6errbyfbVMBuzSC8WtAAYo8MwNafWW1` (BloomBot) wrapping `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` (pump.fun). ✓ BloomBot confirmed.
- **BloomBot fee recipient:** `7HeD6sLLqAnKVRuSfc1Ko3BSPMNKWgGTiWLKXJF31vKM` (0.10 SOL, ~1%).
- **Jito tip recipient:** `nozUacTVWub3cL4mJmGCYjKZTnE9RbdY5AP46iQgbPJ`.

## Follow-on txs (same snipe cycle)

- **Sell tx (+5m 13s):** `63jvNYFTaLe4FBGzFjAwcQP3vTa8g2KxizqRroPKw4gnZGm8sK9u3CpFJ3yk82B39S8p1rcQ9WUTGaWJhpqatV2S` — full 117.45M XAIC dumped for `42.22 WSOL` via `FLASHX8DrLbgeR8FcfNV1F5krxYcYMUdBkrP1EPBtxB9` (Axiom.trade FlashX) + `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` (PumpSwap AMM). Cluster pattern: **BloomBot for buys, Axiom for sells.**
- **Profit drain to Figg (+27m 16s):** `tzzSANuAc9JFjCaBkU5yfyD8KMQ7XfTX3QWGGcdd9q5J489WTgdk5RBjTAiNsa52hcXuHSKnh2eKjC6DP3YB2jT` — **6zZ sent `40.812293643 SOL` directly back to FiggKseF.** Net snipe profit ≈31 SOL routed upstream.

## Funding chain (verified)

- **MP2 → Figg seed tx:** `NLkdmST51Yw8omYDpwSsSAQjwHikCgjcCpfN5SEPwucjxAMgVa5VpWA4yroYTbDkAgB1GvDVVLH3WUCNJ4FyXGh` on `2025-07-08T20:59:56Z`. MP2 (`5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1`) sent **1.321 SOL** to Figg. (Helius `getWalletFundedBy` displayed 0.000000001 SOL due to display rounding — actual on-chain value is 1.321 SOL.)
- **Figg → 6zZ dust-activation:** `3Hc8zEdxgVd4JCHNqY8xV2Sgf2QS9cZ4ToNwrGJZXUn7fymcHcrsnJ61Ysm5eDTttspDkHJD2KP4KaMwRsRYs2f9` on `2026-02-18T14:16:38Z` for 5 lamports. Real SOL funding came later via repeated load/drain cycles with Figg.

## Cluster discovery (new)

**FiggKseF is the treasury of a multi-sniper cluster, NOT just a passive intermediary.** Confirmed wallets:

1. **Sniper #1 — `6zZAKeF5zftUZHCkoWpno6MbaX2LrLwYBCFaEwLLaFDk`** (our target) — activated 2026-02-18, L10 snipe verified above. Currently drained (0.013 SOL).
2. **Sniper #2 — `7ciGXut2rzyZeuRQjMZZ33gmyyT6JWaVKvEcTHNS5ny7`** — **NEW**. Activated 2025-07-19 (11 days after Figg was seeded; 7 months before 6zZ). Same bidirectional SOL pattern with Figg: loads of 4.2/6/6/9.1 SOL followed by 3.33/3.92 SOL profit returns. Currently drained (0 SOL).
3. **Candidate #3 — `2NSGR9SMDei1BHS9XmgygbNcGfrfdfHe4QUAgtaeWyev`** — small 0.61 SOL round-trip with Figg.
4. **Candidate — `HYMtCcfQTkBGw7uufDZtYHzg48pUmmBWPf5S44akPfdG`** — received 4.56 SOL from Figg 58 minutes after 6zZ's L10 snipe and 30 minutes after the profit drain. Timing suggestive.
5. **Small counterparty — `2eVVdqWN4t7umzXGxJ21uTpB5WrUyyQMYnkq6UHtg3ba`** — 0.618 SOL + 0.123 SOL outflows.

Figg currently holds **16.62 SOL** liquid + 110.26 `mɔ` tokens. Self-sustaining on snipe profits for ~1 month (no recent MP2 top-ups in the last 93 transfers). Figg itself signs trade txs — actively traded `CGEDT9QZ...pump` (net ~1 SOL profit Apr 11–13) and `4DPhcyAf...pump` (0.62 SOL sale Mar 11). **Contradicts prior `isUserAddress=false` classification — re-verify.**

## Cross-reference against all 10 deployer launches

6zZ's first activity is `2026-02-18`, so L1–L9 are all pre-activation. Scanning 6zZ's full pump.fun trade log against the 10 launch CAs in `data/launch-history.json`: **only L10 (`KfByHk48...E9pump`) matches**. 6zZ was purpose-built for L10. It did snipe many other non-deployer pump.fun tokens at 0.50-SOL priority (e.g. `HkY2n1zF...pump` 2026-03-12, `DEPTJe2R...` 2026-03-07, `AEC9hbJk...` 2026-03-05) — broader BloomBot-sniper activity, not deployer launches.

## Open items (not closed)

1. **MoonPay fingerprint gap:** the MP2→Figg seed on 2025-07-08 has `CU=496`, not the `CU=14548 + 32-char hex memo` signature we calibrated on 2026-04 transfers. Our fingerprint was established on post-2025 data; MoonPay's tx-construction pipeline changed at some point. Any historical hop (pre-2026) may be missed by the runtime detector. Worth backfilling fingerprint calibration across 2025 data before trusting Vector A on archival lookups.
2. **Sniper #2 (`7ciGXut2`) history:** unverified whether it sniped L7/L8/L9 (its 7-month activation predates those launches). A full launch-participation cross-ref is warranted and is the single highest-value follow-up.
3. **`FiggKseF` re-classification:** prior `isUserAddress=false` contradicts observed trade tx. Re-pull Arkham `isUserAddress` for Figg and the cluster wallets.
4. **Downstream candidates:** `2NSGR9SM`, `HYMtCcfQ`, `2eVVdqWN`, `59KMRTZa` need targeted profiling (balance, funded-by, trade history, launch-CA overlap).
5. **`mɔ` token (`2f85jQ3ZA5L4c9YFxfYBXYkmCBmfnwnBVznETJuCcxYG`):** identify origin + sender intent. Showed up in Figg Apr 13.
6. **Drain event reconciliation:** 6zZ went from 10.08 SOL (prior snapshot) to 0.013 SOL today. The 19.15-SOL Apr-7 drain to Figg + fees + 40.81-SOL post-L10 drain account for the delta — full ledger walk would tighten the timeline.
7. **L11 monitoring priority:** **FiggKseF is the highest-value wallet in the current network-map for L11 pre-signal.** Any outbound SOL transfer from Figg to a never-before-seen wallet in the 3–15 SOL range is a candidate sniper being loaded. Recommend wiring the monitor to watch Figg outflows explicitly.

## Predictive-value summary

- **6zZAKeF5 itself — low L11 predictive value.** Already known, drained, wallet-specific pattern captured. Useful primarily as proof that the Figg cluster executes block-0 BloomBot snipes.
- **FiggKseF — highest L11 predictive value in the current network-map.** Live treasury with 16.6 SOL liquid, 9 months of uninterrupted operation, proven pattern of funding fresh sniper wallets via dust-then-load. Monitoring its outflows is the single most valuable L11 signal.
- **BloomBot router ID (`b1oomGGqPKGD6errbyfbVMBuzSC8WtAAYo8MwNafWW1`) — high value.** Enables enumerating any wallet's block-0 snipe history programmatically — lets us proactively flag new Figg-funded wallets as snipers the moment they execute their first BloomBot tx.


 