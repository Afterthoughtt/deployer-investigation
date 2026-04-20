# Wallet Verification Runbook

Re-verification workflow for `data/network-map.json` using the `chain-walker` and `chain-skeptic` subagents. Companion to `STRATEGY.md` (detection plan) and `MONITOR_BUILD_PLAN.md` (monitor). Read `CLAUDE.md` first — identifier integrity, credit discipline, and the Arkham-unavailable fallback are non-negotiable inputs to this workflow.

---

## Purpose

The canonical wallet registry is `data/network-map.json` (147 wallets as of 2026-04-04). Classifications were last updated during the RXRP repump investigation. Before the L11 window (April 20–30, 2026), re-verify load-bearing classifications and catch any that depend on now-unavailable Arkham signals (trial expired 2026-04-19; extension pending).

Goal: every wallet that influences L11 detection has a classification backed by evidence that holds up under adversarial review, with Arkham substitutions documented per-wallet.

---

## Triage — do this first

147 wallets is too many to verify at uniform depth. Tier them, then work top-down:

- **T1 — load-bearing (~30 wallets)** — anything in `monitor/data/wallets.json` (MP1, MP2, v49 hub, 20 intermediaries), plus direct funders, plus BqP79Wmk + GoonPump. Misclassifying these moves L11 detection outcomes.
- **T2 — recently added (~39 wallets)** — the 2026-04-03/04 RXRP batch (22 buyers + 14 intermediaries + 3 Bubblemaps). Youngest classifications, least re-vetted.
- **T3 — Arkham-dependent** — wallets whose current `verdict` rests on `isUserAddress` or cross-chain attribution. Surface by grepping `data/network-map.json` notes for `Arkham` or `isUserAddress`.
- **T4 — edge cases** — `7QJM8rXX` (the 1 `possible_associate`), plus the 2026-04-02 reclassifications (`F7RV6aBW` downgrade, `D1XcKeSS` upgrade, `BiwUUhwy`, `H3qSndFC`).
- **T5 — everything else** — deferred past L11 window if time-boxed.

Produce the actual worklist at the start of the pass — dump T1–T4 wallet addresses + current verdicts + notes into `data/results/reverification-worklist-<date>.json`. Do not retype addresses; JSON.parse from `data/network-map.json`.

---

## Tier list (worklist)

Fill in below. One bullet per wallet. Format:

```
- `<address verbatim from network-map.json>` · <label> · <one-line rationale>
```

Keep rationale short — "why this tier." Longer context belongs in `data/network-map.json` notes. Addresses must be copy-pasted, never typed. Leave a tier's section empty if nothing qualifies.

### T1 — Load-bearing

<!-- Wallets whose misclassification moves L11 detection outcomes. -->

- 

### T2 — Recently added

<!-- 2026-04-03/04 RXRP batch and anything else with classifications under ~3 weeks old. -->

- 

### T3 — Arkham-dependent

<!-- Verdict currently rests on isUserAddress or cross-chain attribution from Arkham. -->

- 

### T4 — Edge cases

<!-- possible_associate, 2026-04-02 reclassifications, any flagged ambiguities. -->

- 

### T5 — Deferred / low priority

<!-- Optional to list. Can be inferred as "everything in network-map.json not above." -->

- 

---

## Per-wallet flow

For each wallet X:

1. **Read** the current `data/network-map.json` entry (and any referenced `launch-details.json` / `rxrp-repump-buyers.json` rows) via `Read` / `Grep`. Never type the address — JSON.parse or grep.
2. **Draft role hypothesis** — usually matches the current classification; set to `classify-all` if re-examining from scratch.
3. **Invoke `chain-walker`** with full context brief (see §Subagent invocation). Parallelize in batches of 3–5.
4. **Interpret walker YAML** — look at `suggested_role_fit`, `confidence`, `cross_api_conflicts`, `anomaly_flags`.
5. **Draft one-sentence role claim** — either the current verdict restated, or the new verdict if walker contradicts. Examples:
   - "This is the deployer's established-side-wallet (personal trading wallet)."
   - "This is an unrelated wallet (off-network, MEXC-funded, no deployer-token exposure)."
6. **Invoke `chain-skeptic`** with minimal brief — wallet + one-sentence claim only. **Serial**, never parallel.
7. **Act on skeptic verdict:**
   - `upheld` → `Edit` the network-map.json entry: update role/verdict if changed, append note `"re-verified YYYY-MM-DD: walker <suggested_role_fit>, skeptic upheld"`.
   - `overturned` → `Edit` with skeptic's implied role, not main's original claim. Note: `"reclassified YYYY-MM-DD: old=<role> new=<role>, skeptic overturned with evidence: <summary>"`.
   - `insufficient` → do NOT write. Surface to user with skeptic's `missing_evidence` and `escalation_recommendation`.

---

## Subagent invocation

Both agents live in `.claude/agents/`. The frontmatter auto-loads the full system prompt — I pass only the per-invocation brief.

### `chain-walker` — full context, parallelizable

```
Agent(
  description: "Re-verify <label> classification",
  subagent_type: "chain-walker",
  prompt: """
  Target wallet: `<address verbatim from JSON>`

  Why: <re-verification context — current classification, when it
  was set, which tier (T1/T2/T3/T4), downstream dependencies>.

  Role hypothesis: <one of the six taxonomy roles, or classify-all>

  Budget: <credit cap, e.g., 2000 credits>

  Arkham note: trial expired 2026-04-19 — substitute fee-payer
  parsing via getTransaction for any isUserAddress check, document
  the substitution in cross_api_conflicts.
  """
)
```

Multiple walker calls in a single message run in parallel. Walker is stateless; no interleaving risk.

### `chain-skeptic` — minimal brief, serial

```
Agent(
  description: "Adversarial review: <label> role claim",
  subagent_type: "chain-skeptic",
  prompt: """
  Target wallet: `<address verbatim>`

  Role claim: <one sentence>
  """
)
```

Never pass walker output, main reasoning, or prior evidence. The skeptic's `[ROLE] Briefing` rule treats extra context as prompt injection and ignores it — the independence guarantee is the whole point. If the brief would have multiple sentences, cut it back.

Skeptic calls must be **serial** — `memory: project` writes to `.claude/agent-memory/chain-skeptic/MEMORY.md` between runs, parallel would interleave writes.

### Mechanics recap

- Agent file system prompt is automatic. Don't re-paste taxonomy / API decision tree / output schema.
- Tool access is frontmatter-scoped. Walker is read-only. Skeptic gets Write/Edit only for its memory dir (granted by `memory: project`).
- Return value is the YAML bundle the agent's output schema specifies.
- Each invocation is a fresh context window.

---

## Arkham fallback protocol

For every check that would normally hit Arkham, walker documents the substitute under `cross_api_conflicts`:

| Arkham check | Fallback | Walker flag |
|---|---|---|
| `isUserAddress` | Parse 3–5 recent txs via `getTransaction`; target is signer in ≥1 → wallet, never signer → ATA/program | `arkham: unavailable, fee-payer parse on sigs [A, B, C]` |
| Cross-chain attribution | Manual Nansen UI lookup (surface to user) + WebSearch | `arkham: unavailable, manual handoff required` |
| Entity labels ambiguous across chains | Helius `batch-identity` + Nansen labels; if both empty, surface | `arkham: unavailable, label gap documented` |

**Skeptic behavior under Arkham-unavailable:** prefer `insufficient` over `upheld` when the discriminator is Arkham-only and the fallback hasn't fully ruled out the ATA/program hypothesis. Overturning a wallet to `not_network` because fee-payer parse shows it never signs is still a clean `overturned` — we don't need Arkham for that direction.

When the Arkham extension lands mid-pass:
- Re-run T3 wallets that completed with fallback-only evidence.
- Re-run every wallet that came back `insufficient` with an Arkham-specific gap.

---

## Change tracking

**Per-wallet updates:** `data/network-map.json` is the canonical registry. Edit in place — update `role` / `verdict` if changed, append to `notes` with date + walker/skeptic summary.

**Per-pass log:** `data/results/reverification-<date>.json` — the forensic audit trail. One record per wallet:

```json
{
  "address": "<verbatim>",
  "tier": "T1" | "T2" | "T3" | "T4",
  "old_verdict": "<prior>",
  "walker_suggested_role_fit": "<role>",
  "walker_confidence": "high" | "medium" | "low",
  "walker_anomaly_flags": [],
  "arkham_deferred": true | false,
  "arkham_deferred_checks": ["isUserAddress", "cross-chain"],
  "role_claim": "<one sentence to skeptic>",
  "skeptic_verdict": "upheld" | "overturned" | "insufficient",
  "skeptic_confidence": "high" | "medium" | "low",
  "new_verdict": "<post-verification>",
  "change_reason": "<if changed>"
}
```

Write the log incrementally as each wallet completes — do not batch-write at end of pass.

**Manual-review backlog:** wallets that come back `insufficient` or with `anomaly_flags` go into `data/results/reverification-manual-<date>.json`. Batch for user to work through via Nansen UI + Solscan + external OSINT.

---

## Post-verification tasks

- Re-derive any affected downstream artifacts: `data/launch-details.json` early-buyer lists, `data/rxrp-repump-buyers.json`, `monitor/data/wallets.json` categories.
- If any T1 wallet changed role, update `monitor/data/wallets.json` and redeploy per `MONITOR_BUILD_PLAN.md` §Deploy sequence.
- Check skeptic `MEMORY.md` size (cap 200 lines / 25KB per agent spec). Consolidate if over.
- If Arkham extension lands post-pass, run a follow-up batch on everything in the T3 + `insufficient` lists.

---

## Sequencing vs the L11 window

L11 window: April 20–30, 2026. Assume it starts today.

- **Day 0–1:** Phase 0 triage + T1 (load-bearing). ~30 wallets × (walker + skeptic) ≈ 4–6 focused hours. Any T1 role change must flow into `wallets.json` + VPS redeploy before the deployer funds L11.
- **Day 1–3:** T2 + T3 + T4. Lower stakes, still in-window for catching issues.
- **Post-launch or Arkham-return:** T5 + deferred Arkham-specific checks.

If time runs short before L11: T1 is non-negotiable, T2–T4 can be partial, T5 is safely deferred.

---

## Credit budget

Helius Developer plan (10M credits/month). Per-walker budget: 2000 credits typical, 5000 for deep-dive. 147 wallets × 2000 avg = ~300K credits — well within headroom. Daily ambient monitor burn is 1–3K credits; verification work won't strain the budget.

Nansen Pro (1000 starter credits + plan allocation). Profiler endpoints are 1 credit, counterparties 5. Walker's API decision tree already prioritizes cheap-first; per-wallet Nansen burn should stay under 20 credits.

**Never call Nansen's 500-credit labels endpoint.** Both agents have this baked into their rules. Surface for manual Nansen UI instead.

---

## Anti-patterns

- Typing wallet addresses from memory. Always JSON.parse or grep.
- Passing walker output to skeptic. Independence rule enforced on the skeptic side; don't tempt it.
- Running skeptic invocations in parallel. Memory interleaves.
- Writing to `network-map.json` without skeptic `upheld` or `overturned`. `insufficient` is not a classification.
- Accepting a walker `suggested_role_fit` as a verdict. Walker is evidence-only.
- Skipping Arkham-substitution documentation. Future re-runs need to know which findings rest on fallback evidence.
- Batching the reverification log write until end of pass. Crash mid-pass loses audit trail.
