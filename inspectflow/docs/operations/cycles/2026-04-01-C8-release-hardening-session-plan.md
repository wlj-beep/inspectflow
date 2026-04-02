# Release Hardening Session Plan - 2026-04-01-C8

## Header
- `Cycle`: `2026-04-01-C8`
- `Controller`: `@codex`
- `BL Scope`: `BL-114, BL-115, BL-116, BL-117, BL-118`
- `Sub-Agents Active`: `BL-114 release-path bundle`, `BL-115 cycle-report artifact`, `BL-116 gate sequencing`, `BL-117 on-prem flow`, `BL-118 fail-fast guards`
- `Overall Gate`: `Completed`
- `Queue Sync`: cleared in `STATUS.md`

## Session Goal
Land the release-hardening tranche in parallel without touching the already-closed queue items, using separate orchestration, deployment, and guardrail slices that can complete independently.

## Outcomes
- `BL-114`: one release command runs the fast-feedback tests, standardized gate, commercialization gates, and publishes one consolidated evidence bundle.
- `BL-115`: every cycle run automatically produces the cycle report through `ops:cycle:report:auto` and stores it with the evidence bundle.
- `BL-116`: fast feedback is separated from full-gate validation, with touchpoint-scoped tests first, the standardized gate second, and load/RC checks last.
- `BL-117`: on-prem deployment follows a single preflight -> start/health -> rollback-ready sequence.
- `BL-118`: missing environment prerequisites and missing evidence artifacts fail before the full test path starts.

## Verification
- `npm run test:coordination`
- `npm run test:api`
- `npm run test:ui:mock`
- `npm run test:ui:live`
- `npm run test:standardized`
- `npm run gate:commercialization:load`
- `npm run gate:commercialization:rc`
- `npm run ops:cycle:report:auto -- --cycle 2026-04-01-C8 --window "09:00-11:00 ET" --controller codex-main --bl "BL-114,BL-115,BL-116,BL-117,BL-118" --tracks "release,onprem,guards" --controllerPromptTokens 220 --acceptedChanges 5 --inputRatePerMillion 1.25 --outputRatePerMillion 10`

## Notes
- The new tasks were intentionally split so that the release wrapper, on-prem wrapper, and fail-fast validation logic could move in parallel.
- Keep the related completion-only items BL-020, BL-023, BL-036, and BL-037 isolated from this tranche unless a change explicitly depends on them.
