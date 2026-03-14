# InspectFlow Agent Instructions (Context Window Priority)

InspectFlow is an on‑prem manufacturing inspection system that replaces paper-based measurement collection with a simple, readable, and reliable digital workflow. The MVP mirrors the demo workflows while adding role-based access (without authentication) and durable local storage via Postgres. Data stays on the customer’s local network.

These instructions optimize context usage. Read in order and use the criteria below to decide how far to go.

## 1) Always Read First (Small, High Signal)
- `README.md`
- `STATUS.md`
- `docs/backlog.md`
- `WORKLOG.md`
- `docs/architecture.md`
- `docs/mvp-scope.md`
- `docs/test-plan.md`

Criteria:
- Small bug fix or doc tweak: Section 1 is usually sufficient.
- Feature work or behavior changes: read Section 1 + the relevant parts of Section 2.

Coordination requirement:
- No coding without prior claim in `STATUS.md`.

## 2) Then Read Based on Task
- Backend API or data behavior:
  - `backend/src/index.js`
  - `backend/src/routes/*.js`
  - `backend/db/schema.sql`
  - `backend/db/seed.sql`
- Frontend UI behavior:
  - `frontend/src/App.jsx`
  - `frontend/src/api/client.js`
  - `frontend/src/legacy/InspectFlowDemo.jsx` (large file: read only the specific region you need)
- Data model reference:
  - `docs/data-model.md`
- UI direction/workstream:
  - `docs/frontend-notes.md`

## 3) Avoid Unless Required
- Do not load the full legacy UI file unless you are actively editing it.
- Avoid scanning `node_modules` or build artifacts.

## 4) Runtime/Testing Defaults
- Local dev is localhost-first:
  - Frontend: `http://localhost:5173`
  - API: `http://localhost:4000`
- Run both services: `npm run dev` from repo root.
- Smoke tests:
  - `npm run test` (root) runs API + UI smoke.
  - `npx playwright install` is a prerequisite for UI tests and must be run at least once.
- Test DB:
  - Use `DATABASE_URL_TEST` in `backend/.env` for repeatable tests.

## 5) Code Style / Conventions
- ESModules (`import`/`export`), semicolons, double quotes.
- 2‑space indentation and concise functions.
- Follow nearby file patterns and naming conventions.
- Do not introduce new lint/format tooling unless explicitly requested.

## 6) Security Note (Important)
⚠️ Protected APIs now use local authenticated session identity as the security boundary.
- `x-user-role` may appear in legacy clients but should not be treated as authoritative in production.
- Compatibility header mode is opt-in via `ALLOW_LEGACY_ROLE_HEADER=true` and is intended for controlled transition/testing only.

## 7) Do‑Not‑Touch / Caution
- Avoid editing `frontend/src/legacy/InspectFlowDemo.jsx` unless explicitly asked.
- Change DB schema only with explicit request and a migration plan.

## 8) Implementation Constraints
- R1 includes local auth/session; protected route enforcement must use authenticated identity.
- Legacy UI role selection is not an authentication substitute.
- Keep `docs/test-plan.md` aligned with major behavioral changes.

## 9) Git / Workflow
- No commit conventions specified.
- Do not create branches or commits unless explicitly asked.

## 10) When In Doubt
- Prefer docs over code for intent; use code for exact behavior.
- If a task spans frontend + backend, read both entrypoints before proposing a change.

## 11) Forward Progress / Decision Gates
- Default behavior: proceed with implementation using reasonable assumptions.
- Stop only when blocked (missing critical info) or when a major product/architecture decision requires user input.
- When you proceed with assumptions, state them clearly in the response.

## 12) Thread Hygiene / Context Windows
- Start a new thread when:
  - Switching to a different feature/area (frontend ↔ backend, testing ↔ UX, etc.).
  - The request is unrelated to the thread’s main purpose.
  - The thread is long and context is being repeatedly re‑explained.
  - Earlier assumptions no longer hold.
- Stay in the same thread when:
  - Iterating on the same feature or file set.
  - The active plan still applies.
  - You want continuity for a single milestone.
- Assistant behavior:
  - If a request appears to drift from the thread’s main purpose, call it out and prompt the user to start a new thread.

## 13) Global Priority + Claim Workflow
- `STATUS.md` is the canonical global execution queue.
- `docs/backlog.md` is the detailed backlog spec keyed by stable `BL-###` IDs.
- `WORKLOG.md` is the immutable completion log.
- Start from the highest-ranked eligible item in `STATUS.md`.
- Claim work before implementation by setting `Status`, `Owner`, and `Updated`.
- Soft claim policy: one lead owner is required; collaborators are allowed only when explicitly listed in `Owner`.
- Only the Coordinator may change global `Rank` or `Priority`.
- Stale handoff rule: if `Updated` is older than 24 hours, another agent may claim the item after adding a handoff note in `STATUS.md`.
- Completion flow: remove/close the active queue entry in `STATUS.md`, then append a dated result in `WORKLOG.md`.
