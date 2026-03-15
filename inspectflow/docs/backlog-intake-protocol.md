# Backlog Intake Evaluation Protocol

## Purpose
This protocol governs how new observations, improvement requests, and feature ideas are evaluated before they enter the tracked backlog.

Primary intent:
- Filter ideas with a realism-first gate.
- Prevent duplicate or redundant backlog entries.
- Keep intake work planning-only (no implementation execution during intake).

## Canonical Sources (Check Before Decision)
- `docs/backlog.md`
- `STATUS.md`
- `WORKLOG.md`
- `docs/coordination-plan.md`

## Evaluation Flow
1. Intake the request in plain language.
2. Run duplicate scan across backlog, active queue, and recent completions.
3. Apply realism gate (`Balanced`):
   - Value clarity
   - Dependency fit
   - Delivery risk
   - Acceptance-test clarity
4. Classify decision:
   - `Reject`: unrealistic now, duplicate, or already delivered.
   - `Defer`: potentially valid but blocked or underspecified.
   - `Accept`: ready for backlog entry now.
5. On `Accept` only, update planning artifacts:
   - Add the item to `docs/backlog.md` with full required metadata.
   - Append an intake decision entry to `WORKLOG.md`.

## Operating Rules
- Every new idea must pass duplicate + realism checks before backlog insertion.
- Intake stage is planning only:
  - Allowed: backlog/worklog/status/coordination doc updates.
  - Not allowed: feature implementation, migrations, production behavior changes.
- Recording default is locked to `Backlog + Worklog` for accepted items.

## Intake Checklist (Per Idea)
- Not already represented by an existing `BL-###` or active queue row.
- Dependencies are explicit and valid against current release sequencing.
- Release and stream fit are clear (`R1`-`R4`, `PLAT`/`OPS`/`QUAL`/`INT`/`ANA`/`COMM`).
- Acceptance statement is concrete, testable, and non-vague.
- Planning artifacts updated only when decision is `Accept`.

## Decision Logging Template
Use this structure when recording intake outcomes in `WORKLOG.md`:
- Date
- Decision (`Reject`, `Defer`, `Accept`)
- Idea summary
- Rationale (duplicate link, risk, dependencies, or acceptance clarity)
- If accepted: new backlog ID

## Default Assumptions
- "Brutally honest" means delivery realism is prioritized over idea preservation.
- If `STATUS.md` has no active queue rows, duplicate checks rely primarily on `docs/backlog.md` and recent `WORKLOG.md` history.
