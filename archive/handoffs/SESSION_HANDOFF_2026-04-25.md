# Session Handoff — 2026-04-25

L11 launch is **2026-04-25 14:00–18:00 EST (Nukex)**. Funding window: now → ~2026-04-25 11:00 UTC.

## Where we are

Completed first-pass triage of the **MoonPay MP1-funded candidates (48 total)** in the VPS monitor DB. Findings + per-wallet verdicts written to `data/current-wallet-review-scope.json` under `monitor_candidate_batches.moonpay_mp1_candidate_review_2026_04_24`. Both integrity scans pass on that file.

Credit burn this session: ~1,500 Helius credits across MP1 Pass A→D + 3XKSFf re-parse on the prior CoinSpot keep-list.

VPS DB state (operator-confirmed approximate; verify on live):
- MP1: **4 rejected** by operator (ids 149, 144, 136, 128 — the parsed memecoin / CEX cashout wallets)
- MP1: **41 still `detected`** but pending manual rejection per scope file `rule_out_list` (see breakdown below)
- MP1: **3 still `detected`** as the keep list — ids 70, 65, 148

## Combined keep list across all triaged batches

Three pre-existing CoinSpot keeps that should be revisited and the prior session's age-based confidence penalty dropped (see Cross-session feedback rule "Don't discount candidates for age alone"). Three new MP1 keeps with the same shape but past historical max — same confidence treatment.

| Priority | Source | Address | Why |
|---|---|---|---|
| 1 | CoinSpot | `3f15vuFsQ3f2NA2WFLJ53Ei2JKZV4H8G42rJwugpCCGZ` | 24.43 SOL intact, dormant, **inside 12–26h window at prior review** — recheck still inside |
| 2 | CoinSpot | `GzPBXxW2RG947ZUKKqrDmKu3XtZCjQGaqrNmtPHnTHTM` | D234 vanity-pair bracketing of 21.64 SOL inflow — operator-signal shape, not yet verified |
| – | CoinSpot | `2bRSMnmwRb1Z1yxDrb2ia5Jw4vesCTzhd6a28mSHTBAf` (id 134) | Active CoinSpot to G9X7F4 relay, 7 cycles in 1 day |
| 3 | CoinSpot | `HYRGi5jqhCNbHH2dHzyiKnqPHqEvoeqWSGWzt8mMEVys` | 8.13 SOL intact, ~32h dormant |
| 4 | CoinSpot | `8JkcHNCX65ss5QRUm7BC9K11A53YdfCftkTLNyvpJNxe` | 19.00 SOL intact, ~40h dormant |
| 5 | CoinSpot | `FdyTNua8UxgdbmZQ1pQdfaaHvnp4ayf1DZgA6BGScGvo` | 20.66 SOL intact, ~74h dormant |
| 6 | CoinSpot | `39VqGYiwc4vvH2vBVESuXYfYoLCGeb6e6LyheDSP4FPv` | 20.48 SOL intact, ~87h dormant |
| 7 | CoinSpot | `7Ey5AFpT7EiioeqY8zMvw9gaz78kC5PNSsRc6g7rF1iq` | 8.71 SOL intact, ~103h dormant |
| 8 | MP1 | `6rHWN6qQksCMGxkZCCkSG64fEi8vBknTxt1keGH9izLv` (id 70) | 10.666 SOL intact, **1 sig lifetime**, dormant ~74h, no pinger contact |
| 9 | MP1 | `4aMinwtC8QFrTwQFPhPq7txie7WXGaQfpLVm52rzwkgb` (id 65) | 11.580 SOL intact, **1 sig lifetime**, dormant ~75.7h, no pinger contact |
| 10 | MP1 | `6uYzo6ZRYehusYyaaM8XbZE11da98hyaryBtDKVyB8Bb` (id 148) | 8.139 SOL intact, fresh; pre-activated by Bitstamp Hot Wallet, then MoonPay; will enter window 2026-04-25T11–13Z if dormant |

The CoinSpot priority-3 entry from the prior session — `3XKSFfV62MgUdy81YRZwuTS9JB6cF8R2jo9T1YEePauh` — has been **downgraded to memecoin trader** in this session (parsed as HOP CAT pump.fun trader; the +1.969 SOL balance delta is fully explained by trade profit). Rule_out, not keep. The scope file's CoinSpot batch still lists it under `keep_list` — operator should manually reject it in the bot, OR the next session can stage a scope-file move.

## Pending operator actions in the bot

**41 MP1 wallets still need rejection.** The full list with brief reasons is in `data/current-wallet-review-scope.json` under `monitor_candidate_batches[2].rule_out_list` (45 entries total, minus the 4 already done = 41 remaining).

A copy-pasteable `/reject <id>` block was generated and sits in the prior session's transcript. Re-derive on demand from the scope file's `rule_out_list[*].monitor_id` field.

Plus 1 CoinSpot wallet to reject:
- `/reject <id>` for `3XKSFfV62MgUdy81YRZwuTS9JB6cF8R2jo9T1YEePauh` — verdict `memecoin_trader_hop_cat` (id is in the prior CoinSpot batch entry).

## Known bot bug — display only, non-blocking

`/candidates` listing fails to render in Telegram with `grammy error code=400 desc=Bad Request: can't parse entities: Unsupported start tag "id" at byte offset 3920`. Root cause: literal `<id>` substrings in the footer of `monitor/src/telegram/format.ts:103` are interpreted as HTML tags by Telegram. Bug only fires when the candidate list overflows and a footer is appended.

**Workaround:** Individual `/reject <id>` and `/whitelist <id>` commands return short single-line confirmations that do not trigger the bug — fully functional. After enough rejections, the list shrinks below the truncation threshold and the listing renders again.

**Fix (post-launch only — do not deploy 14h before launch):** escape `<id>` to `&lt;id&gt;` (or remove the angle brackets) at `monitor/src/telegram/format.ts:103`. Then `npm run monitor:build && scp dist & systemctl restart l11-monitor`.

## Open analytical findings (this session)

**1. Odin pinger family is broader than deployer-only — confirmed.** Two MP1 wallets confirmed as memecoin traders received 0-SOL pings from new odin siblings within hours of MoonPay funding. The prior CoinSpot session's interpretation that odin pings are deployer-controlled signal is **materially weakened**. Three new odin siblings observed (`odin2Nz2vGnusxtqJ4XGmbDjK8bGaDztA61eaVBbqE1`, `odinhdmLXrHtu9fz9sQfSC2mHbDQ9PbSQ4W3qiL6H9m`, `odinNbczS1tKZsFFkg3ZwvDLbdZCCNuY89ddfDEq5Hi`), all internally linked to existing sibling `odinZCYLkjzeAxhZ8uF6Eea1GF6iPczsPbKSEnh7A7s`. Odin family appears to be a generic fresh-wallet monitoring service (likely MEV/sniper). HYM-prefix tradecraft on L10 deployer remains the only confirmed deployer-controlled vanity signal.

**2. Tri-prefix vanity pinger is a broadcast pinger.** A failed multi-target dust transaction from `TriQKRfbS1v63hvHpLWNnb51VL9GvVeotTYYXSfUDHb` attempting 1-lamport pings to 20+ wallets was observed during the 3XKSFf re-parse — broadcaster behavior, not targeted-operator behavior. Reinforces conclusion #1.

**3. Bitstamp Hot Wallet identified.** `9D8xSHWqF9NJWqCtn3rNxYEox63aCbWxYzTMfMur7Cc9` is `Bitstamp Hot Wallet` per Helius `getWalletIdentity`, holding ~44,987 SOL. Pre-activated MP1 keep-list candidate id 148 with 0.135 SOL 11 minutes before MoonPay funding. **Proposed registry patch:** add to `data/network-map.json` with `role=cex_hot_wallet`, `label=Bitstamp Hot Wallet`, `source=helius_getWalletIdentity`, `source_date=2026-04-25`. Apply after reviewer approval.

**4. MoonPay fingerprint validated** on all 13 Pass-B sigs sampled — bounded confirmation only, not full-batch proof.

**5. MP1 base-rate is low.** Of 48 MP1 candidates, 0 inflated, 3 intact, 8 partial, 37 drained. Of the 4 drained candidates parsed, all 4 were SOL→token swaps via DFlow/Jupiter or fast CEX cashout. **The other 41 drained candidates were bulk-classified by Pass A balance only — not parsed individually.** A spot-check parse on 5–10 of the older drained wallets is warranted to verify the memecoin/CEX pattern holds across the age range; cost ~500–1,000 Helius credits.

## Outstanding triage queue

- **MoonPay MP2**: 73 candidates — `funding_source = 5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1`. Untriaged. Expect same dominant memecoin-trader shape as MP1; budget ~2,500–3,000 Helius credits for full coverage.
- **3 RXRP-chain singletons**: ids belonging to FTX US / ChangeNOW / Robinhood RXRP buyer chains. Untriaged.
- **MP1 spot-check parse** (deferred from this session): pick 5–10 of the older drained MP1 wallets and parseTransactions on their drain sigs to confirm or break the memecoin assumption.
- **Deferred CoinSpot wallets** (from prior session): id 43 `HefCL8a29RDNWmGC85N3UVvDCRAkaG3Df9jKKTorVTSE`, id 64 `FgsvEDugq8Qv78yVPDY3BSPGkjAnjhKZPS64bQkZX6Ut` — both still `detected`, awaiting follow-up.

Same methodology as MP1: Pass A `getBalance` (1 cr each) → Pass B `getSignaturesForAddress` (10 cr) on the focused subset → Pass C `getWalletTransfers` (100 cr) on standouts → Pass D `parseTransactions` (100 cr per batch) on drain signatures + cross-check counterparties against `data/network-map.json` and the analytical findings under `monitor_candidate_batches[*].vanity_pingers_follow_up` and `relay_destinations_follow_up`.

## Cross-check follow-ups not yet chased

- `EsShd4odrLj44pMnQkVKyGVmJrqT3dWRKb1wxseuSsoq` — 128's drain destination, ASCII memo `amit`. Helius getWalletIdentity returned `unknown`. Could be CEX, OTC desk, or another fresh relay. 1 `getWalletTransfers` (100 cr) would map outflows and likely settle it.
- `D234cojEJ5SXEvCmR65YVdB4woxTxgGgs7ypjdzyEcYk` and `D2345NtgdDgs5nyLzjAtGrRZVLMnd6gZnZGKe2FDEcYk` — D234 vanity-pair bracketing on CoinSpot priority-2 keep. Still not verified against deployer infrastructure.
- The 5 novel relay destinations and 6 vanity pinger families surfaced in the CoinSpot batch — still queued.

## How to access live state

```bash
# Pull live VPS DB + WAL + SHM
scp l11@143.198.12.56:/opt/l11-monitor/monitor/data/l11.db /tmp/
scp l11@143.198.12.56:/opt/l11-monitor/monitor/data/l11.db-wal /tmp/
scp l11@143.198.12.56:/opt/l11-monitor/monitor/data/l11.db-shm /tmp/
sqlite3 /tmp/l11.db "SELECT id, address, funded_amount_sol, funding_source_label, status FROM candidates WHERE status='detected' ORDER BY funding_timestamp DESC;"
```

Note: monitor schema stores `funding_timestamp`, `detected_at`, `whitelisted_at`, `rejected_at` in **milliseconds**, not seconds. Divide by 1000 before passing to `datetime(?, 'unixepoch')`.

Address index for cross-checks: walk `data/network-map.json` + `data/current-wallet-review-scope.json` for every base58 32–44 string. Resulting index has ~257 addresses (178 from network-map + 79 from scope-file findings as of this session).

## Don't forget

- `npm run audit:primitive-integrity -- <file>` and `npm run audit:claim-integrity -- <file>` after editing any review artifact. (Both pass on `data/current-wallet-review-scope.json` at session close.)
- `data/current-wallet-review-scope.json` is non-canonical; promote findings to `data/network-map.json` only via reviewed registry patch.
- L11 launch is later today — keep `3f15vuFsQ3f2NA2WFLJ53Ei2JKZV4H8G42rJwugpCCGZ` (CoinSpot priority 1) at the top of the watch list. It's the only candidate confirmed inside the 12–26h window at the most recent re-verification.
- Per the cross-session feedback rule "Don't discount candidates for age alone" (`memory/feedback_no_age_writeoffs.md`): age past historical 26h is not a rule-out reason; the deployer can change patterns. All current keep-list entries past 26h are kept on that basis.
- `/candidates` Telegram bot listing is broken — see "Known bot bug" above. Does not affect rejection workflow.
