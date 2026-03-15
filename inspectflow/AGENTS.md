# InspectFlow Agent Instructions (Multi-Agent First)

InspectFlow is an on-prem manufacturing inspection system that replaces paper-based measurement collection with a simple, readable, and reliable digital workflow. Core delivery priority is stable execution against ranked backlog work with clear evidence.

These instructions are optimized for context usage and forward progress.

## 1) Always Read First (Small, High Signal)
- `README.md`
- `STATUS.md`
- `docs/backlog.md`
- `docs/backlog-intake-protocol.md` (required when evaluating new ideas for backlog insertion)
- `WORKLOG.md`
- `docs/architecture.md`
- `docs/mvp-scope.md`
- `docs/test-plan.md`

Criteria:
- Small bug fix or doc tweak: Section 1 is usually sufficient.
- Feature work or behavior changes: read Section 1 plus relevant files from Section 2.

Hard requirement:
- No coding without a prior claim in `STATUS.md`.

## 2) Task-Scoped Reading
- Backend/API/data behavior:
  - `backend/src/index.js`
  - `backend/src/routes/*.js`
  - `backend/db/schema.sql`
  - `backend/db/seed.sql`
- Frontend/UI behavior:
  - `frontend/src/App.jsx`
  - `frontend/src/api/client.js`
  - `frontend/src/legacy/InspectFlowDemo.jsx` (only the region you edit)
- Data model reference:
  - `docs/data-model.md`
- UI direction/workstream:
  - `docs/frontend-notes.md`

## 3) Multi-Agent Execution Protocol (Default and Exclusive)
Use Codex multi-agent mode for all non-trivial work.

1. Claim one backlog item (`BL-###`) in `STATUS.md`.
2. Start one controller session and spawn parallel sub-agents for independent tracks.
3. Keep scopes non-overlapping (for example: API, UI, tests, docs/contracts).
4. Require each sub-agent output to include:
   - `BL-###`
   - files touched or reviewed
   - evidence (`file:line`, command/test output)
   - blockers and next action
5. Controller merges results, resolves conflicts, and drives completion.
6. Before handoff, update `STATUS.md`, `docs/backlog.md` (if state changed), and `WORKLOG.md` (on completion).

Canonical operations docs:
- `docs/operations/multi-agent-playbook.md`
- `docs/operations/controller-prompts.md`
- `docs/operations/launch-checklist.md`

## 4) Avoid Unless Required
- Do not load the full legacy UI file unless actively editing it.
- Avoid scanning `node_modules` or build artifacts.

## 5) Runtime/Testing Defaults
- Frontend: `http://localhost:5173`
- API: `http://localhost:4000`
- Run both services: `npm run dev` from repo root.
- Standardized test tiers (required gates):
  - Tier 0 (coordination): `npm run test:coordination`
  - Tier 1 (API regression): `npm run test:api`
  - Tier 2 (UI mock regression): `npm run test:ui:mock`
  - Tier 3 (UI live critical path): `npm run test:ui:live`
  - Standardized gate: `npm run test:standardized`
- UI prerequisites:
  - `npx playwright install` is required at least once for UI tests.
  - `npm run test:ui:live` auto-prepares test data and boots a local API instance for the live gate.
- Test DB:
  - Use `DATABASE_URL_TEST` in `backend/.env` for local test runs and live UI gating.

## 6) Code Style and Conventions
- ESModules (`import`/`export`), semicolons, double quotes.
- 2-space indentation and concise functions.
- Follow nearby file patterns and naming conventions.
- Do not introduce new lint/format tooling unless requested.

## 7) Security Note (Important)
Protected APIs use local authenticated session identity as the security boundary.
- `x-user-role` may appear in legacy clients but is not authoritative in production.
- Compatibility header mode is opt-in via `ALLOW_LEGACY_ROLE_HEADER=true`.

## 8) Caution
- Avoid editing `frontend/src/legacy/InspectFlowDemo.jsx` unless explicitly requested.
- Change DB schema only with explicit request and a migration plan.

## 9) Global Queue Rules
- `STATUS.md` is the canonical execution queue.
- `docs/backlog.md` is the detailed backlog keyed by `BL-###` IDs.
- `WORKLOG.md` is the immutable completion log.
- Start from the highest-ranked eligible item in `STATUS.md`.
- Only the coordinator may change global `Rank` or `Priority`.
- Stale handoff rule: if `Updated` is older than 24 hours, another agent may claim the item after adding a handoff note in `STATUS.md`.

## 10) Forward Progress and Stop Conditions
- Default behavior: proceed with reasonable assumptions.
- Stop only when blocked by missing critical information or when a major product/architecture decision is required.
- State assumptions explicitly in the response.

## 11) Evidence Requirements (Mandatory)
- Report exact test commands executed and their results.
- Include evidence links/paths when running CI or generating artifacts.
- Any skipped gate must be explicitly called out with rationale.

## 12) Thread Hygiene
Start a new thread when:
- Switching to a different feature area.
- The request is unrelated to the thread's main purpose.
- The thread is long and key assumptions keep changing.

Stay in the same thread when:
- Iterating on the same feature or file set.
- The current plan still applies.
