# Active Audit Tools

This directory contains the supported audit surface for current wallet review work.

## Supported

- `wallet-review.ts` — bounded wallet review runner. Dry-run by default; live calls require `--execute --question`.
- `primitive-integrity-scan.ts` — scan new writeups, handoffs, review artifacts, and proposed registry patches for shortened or malformed primitive usage.
- `claim-integrity-scan.ts` — scan new writeups, handoffs, review artifacts, and proposed registry patches for broad negative claims and known-registry wallet downshift risk.
- `claim-integrity-selftest.ts` — offline checks for claim-integrity guardrails used by `npm run audit:check`.
- `arkham-guardrails.ts` — Arkham budget and row-endpoint guardrails.
- `arkham-guardrails-selftest.ts` — offline guardrail checks used by `npm run audit:check`.
- `utils.ts` — shared provider helpers used by supported audit tools.

## Writeup Gate

Before treating a new investigation writeup or review artifact as trusted evidence, run:

```bash
npm run audit:primitive-integrity -- <file...>
npm run audit:claim-integrity -- <file...>
```

The primitive scan protects exact on-chain values. The claim scan protects the interpretation layer: it blocks broad negative relationship claims without scope and requires classified JSON investigation summaries to reconcile known `data/network-map.json` wallets before assigning conclusions.

## Archived

One-off discovery, probe, and historical verification scripts were moved to:

`archive/scripts/audit-legacy/`

Those scripts may contain hardcoded historical targets, live provider calls, old output shapes, or console truncation patterns. Treat them as methodology reference only unless they are re-reviewed and ported back into the supported audit surface.
