# Legacy Audit Scripts

These scripts were moved out of `src/audit` so the active audit surface only contains reusable, budget-gated tools.

Use these files as historical reference only. Before running any legacy script:

- inspect the provider calls and budget impact,
- confirm it does not use broad Arkham row or batch-intel surfaces,
- remove console truncation patterns before using output as a trusted artifact,
- run primitive-integrity checks on any new writeup or review artifact produced from the result.

The local `utils.ts` shim re-exports the current shared audit helpers so old imports continue to resolve when a script is deliberately run with `tsx` from this directory.
