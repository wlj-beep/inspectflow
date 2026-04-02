# Backlog Triage Session Plan - 2026-03-30-C2

## Header
- `Cycle`: `2026-03-30-C2`
- `Controller`: `@codex`
- `BL Scope`: `BL-016, BL-029, BL-060, BL-061`
- `Sub-Agents Active`: `None`
- `Overall Gate`: `Completed`
- `Queue Sync`: cleared in `STATUS.md`

## Controller Prompt
You are the controller for InspectFlow multi-agent backlog delivery. Decompose the claimed BL scope into independent sub-agent tracks, run them in parallel, and merge results into one consolidated run report. Keep progress focused on backlog completion. Require each track to return BL mapping, files reviewed/changed, evidence, test or command results, blockers, and next actions. Deduplicate overlapping findings, resolve conflicts, and assign a final gate status when the run is complete.

## Outcome
- `BL-016` completed with auth/session hardening coverage in `backend/test/auth-hardening-entitlements.test.js`, including password reset, lockout safety, and expanded logout audit assertions.
- `BL-029` completed with backend route extraction in `backend/src/routes/registerAppRoutes.js`, updated app wiring in `backend/src/index.js`, and contract coverage in `backend/test/stream-routes-contract.test.js`.
- `BL-060` completed with signed-in identity cleanup in `frontend/src/AppShell.jsx` and `frontend/src/legacy/InspectFlowDemo.jsx`, plus supporting styling in `frontend/src/ui/app.css`.
- `BL-061` completed with select-for-export mode and checked-record CSV export support in `frontend/src/ui/AdminRecords.jsx` and `frontend/src/legacy/InspectFlowDemo.jsx`, verified by `frontend/tests/header-and-export.spec.js`.
- Verification passed with `npx vitest run test/auth-hardening-entitlements.test.js test/stream-routes-contract.test.js` and `npx playwright test tests/header-and-export.spec.js`.

## Track Packets

### Security Backend
- `Cycle`: `2026-03-30-C2`
- `Track`: `backend`
- `Assigned BL IDs`: `BL-016`
- `Scope`: `backend/src/auth.js`, `backend/src/routes/auth.js`, and auth-focused tests or verification helpers.
- `Out of Scope`: route decomposition, frontend identity changes, and export workflow changes.
- `Required Actions`:
  1. Tighten auth/session policy behavior where needed for password strength, lockout, and auth-event audit coverage.
  2. Add or update tests that prove the accepted hardening behavior.
- `Required Evidence`:
  - file/line references
  - command/test output
- `Escalate If`:
  - the change requires a schema migration or a larger contract bump
- `Expected Deliverables`:
  - backend auth edits
  - verification evidence
  - next-action summary for the controller

### Frontend Export
- `Cycle`: `2026-03-30-C2`
- `Track`: `frontend`
- `Assigned BL IDs`: `BL-061`
- `Scope`: `frontend/src/ui/AdminRecords.jsx`, `frontend/tests/mocked.smoke.spec.js`, and export-related UI helpers.
- `Out of Scope`: backend auth behavior, identity-control changes, and unrelated admin/table features.
- `Required Actions`:
  1. Add optional select-for-export mode with row checkboxes and checked-record export behavior.
  2. Update user-facing export actions and labels so the checked-record flow is obvious.
- `Required Evidence`:
  - file/line references for export-mode UI changes
  - focused UI verification output or reproducible steps
- `Escalate If`:
  - the export flow requires backend API support not already available
- `Expected Deliverables`:
  - updated export UI files
  - verification evidence
  - note on any follow-up UI polish

### Frontend Identity
- `Cycle`: `2026-03-30-C2`
- `Track`: `frontend`
- `Assigned BL IDs`: `BL-060`
- `Scope`: `frontend/src/AppShell.jsx`, `frontend/src/legacy/InspectFlowDemo.jsx`, and the shared identity-control header pieces.
- `Out of Scope`: backend auth behavior, export workflow changes, and unrelated admin/table features.
- `Required Actions`:
  1. Remove the post-login dropdown-style user selection affordance.
  2. Show only the signed-in user name when authenticated while preserving the protected-action path.
- `Required Evidence`:
  - file/line references for identity-control UI changes
  - focused UI verification output or reproducible steps
- `Escalate If`:
  - the UI change requires backend API support not already available
- `Expected Deliverables`:
  - updated identity UI files
  - verification evidence
  - note on any follow-up UI polish

## Controller Notes
- Keep the tracks focused and avoid overlapping file ownership.
- Prefer small, reviewable changes that preserve current behavior outside the acceptance slices.
- Verification has already passed; retain the notes below as the completed run record.
