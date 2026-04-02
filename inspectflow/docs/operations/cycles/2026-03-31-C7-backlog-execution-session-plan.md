# Backlog Execution Session Plan - 2026-03-31-C7

## Header
- `Cycle`: `2026-03-31-C7`
- `Controller`: `@codex`
- `BL Scope`: `BL-030, BL-084, BL-085, BL-091, BL-058`
- `Sub-Agents Active`: `BL-030 release evidence`, `BL-084/BL-058 recovery`, `BL-085 gate health`, `BL-091 export semantics`
- `Overall Gate`: `Completed`
- `Queue Sync`: cleared in `STATUS.md`

## Session Goal
Deliver the five highest-priority unfinished backlog items, starting with the R1 release-evidence tranche and then closing the recovery and regression follow-ups that unblock the standardized gate and release closeout.

## Outcomes
- `BL-030`: R1 acceptance matrix and manual release evidence checklist are fully automated and reproducible.
- `BL-084`: import/integration runtime recovery is verified with support-safe runtime and support-bundle behavior.
- `BL-085`: backend test parsing and standardized gate health are reliable from the repo root, including live UI fallback behavior.
- `BL-091`: AS9102 export semantics report non-perfect pass rates when no or only partial measurements exist.
- `BL-058`: duplicate/replay behavior remains idempotent across all ingest entrypoints with audit-traceable skips.

## Verification
- `npm run test:coordination`
- `npm run test:api`
- `npm run test:ui:mock`
- `npm run test:ui:live`
- `npm run test:standardized`
- `npm run gate:commercialization:rc`
- Targeted backend and release-script tests for each tranche item as needed

## Notes
- The active queue was reseeded after C6, and the chosen items were the highest-priority unfinished backlog rows at the time of claim.
- `scripts/run-ui-live-tests.sh` falls back to the local test database URL when `DATABASE_URL_TEST` is unset, matching the commercialization RC gate behavior.
- `npm run test:standardized` passed after the queue format correction, validating the claim/update flow and live UI fallback in one run.
