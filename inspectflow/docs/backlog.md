# Backlog (Index)

This is the agent-facing index-first entry point for backlog navigation. Open `docs/backlog/*.md` for detailed release tables after checking this page.

## Baseline Preservation
- Historical v1-era backlog snapshot: `docs/backlog-v1-baseline-2026-03.md`
- Previously delivered baseline IDs (`BL-001` through `BL-014`) remain preserved in that snapshot and worklog history.

## Release Shards
- `R1`: `docs/backlog/r1.md`
- `R2`: `docs/backlog/r2.md`
- `R3`: `docs/backlog/r3.md`
- `R4`: `docs/backlog/r4.md`
- `R5`: `docs/backlog/r5.md`
- `R6`: `docs/backlog/r6.md`
- `R7`: `docs/backlog/r7.md`
- `R8`: `docs/backlog/r8.md`

## Current Priority Tranche
- `BL-173`: frontend monolith decomposition
- `BL-174`: operational docs segmentation and index-first navigation
- `BL-175`: runtime artifact isolation and cleanup
- `BL-176`: test fixture extraction and file shrink
- `BL-177`: context budget enforcement gate

## 2026-03-21 Intake: Already Covered by Existing IDs
- SPC and capability analytics: `BL-071`
- Mobile/tablet operator UX: `BL-073`
- Incremental analytics mart updates: `BL-069`
- Structured FAI workflow: `BL-076`
- Global search: `BL-078`
- Audit log viewer UI: `BL-079`
- Seat/module admin UI: `BL-080`
- Integration-layer simplification + partner/edge de-defaulting: `BL-081`, `BL-083`
- OIDC consolidation / legacy auth-path deprecation: `BL-082`

## Delivery Sequence Defaults
1. Complete R1 `PLAT`, `OPS`, `QUAL`, and `COMM` foundation items.
2. Freeze R1 contracts and run full acceptance matrix.
3. Execute R2 modules in parallel using stable R1 contracts.
4. Start R3 intelligence and multi-site work only after R2 contract maturity gate.
5. Use R4 as expansion track with compatibility-first governance.
6. Execute R5 security/reliability hardening before broad external integration rollout.
