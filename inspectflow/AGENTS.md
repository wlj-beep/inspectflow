# InspectFlow Agent Instructions (Multi-Agent First)

InspectFlow is an on-prem manufacturing inspection system that replaces paper-based measurement collection with a simple, readable, and reliable digital workflow. Core delivery priority is stable execution against ranked backlog work with clear evidence.

These instructions are optimized for context usage and forward progress.

## 1) Tier 1: Always-Loaded Constitution + Core Docs
- `context/constitution.md` (required, first)
- `README.md`
- `STATUS.md`
- `docs/backlog.md` (index; detailed release shards live under `docs/backlog/*.md`)
- `docs/backlog-intake-protocol.md` (required when evaluating new ideas for backlog insertion)
- `WORKLOG.md` (recent window; older history lives in `WORKLOG.archive-*.md`)
- `docs/architecture.md`
- `docs/mvp-scope.md`
- `docs/test-plan.md`

Criteria:
- Small bug fix or doc tweak: Section 1 is usually sufficient.
- Feature work or behavior changes: read Section 1 plus relevant files from Section 2.

Hard requirements:
- No coding without a prior claim in `STATUS.md`.
- Run multi-agent deployment preflight before non-trivial backlog work:
  - `npm run ops:multi-agent:check -- --bl "BL-###" --run-context-validate`
- Build a task context packet before non-trivial work:
  - `npm run context:build -- --task "<task summary>" --bl "BL-###" --signals "api,ui,auth"`

## 2) Tier 2: Specialist Agent Cards
Use specialist cards to scope ownership and checks:
- `context/specialists/backend-api.md`
- `context/specialists/frontend-ui.md`
- `context/specialists/integration-runtime.md`
- `context/specialists/analytics-quality.md`
- `context/specialists/platform-auth.md`
- `context/specialists/docs-contracts.md`
- `context/specialists/verifier.md`

## 3) Tier 3: Task-Scoped Retrieval (On Demand)
Use retrieval rules to load only context relevant to the task:
- `context/retrieval-map.json`
- Context packet compiler:
  - `npm run context:build -- --task "<task summary>" --bl "BL-###" --signals "..." --out docs/operations/context-packet.latest.md`
- Validation:
  - `npm run context:validate`

## 4) Task-Scoped Reading (When Tier 3 Indicates)
- Backend/API/data behavior:
  - `backend/src/index.js`
  - `backend/src/routes/*.js`
  - `backend/db/schema.sql`
  - `backend/db/seed.sql`
- Frontend/UI behavior:
  - `frontend/src/App.jsx`
  - `frontend/src/api/client.js`
  - `frontend/src/domains/**`
  - `frontend/src/legacy/InspectFlowDemo.jsx` only as a historical reference if a task explicitly calls for it
- Data model reference:
  - `docs/data-model.md`
- UI direction/workstream:
  - `docs/frontend-notes.md`

## 5) Multi-Agent Execution Protocol (Default and Exclusive)
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
6. Before handoff, update `STATUS.md`, `docs/backlog.md` / `docs/backlog/*.md` (if state changed), and `WORKLOG.md` plus archives (on completion).

Canonical operations docs:
- `docs/operations/multi-agent-playbook.md`
- `docs/operations/controller-prompts.md`
- `docs/operations/launch-checklist.md`

## 6) Avoid Unless Required
- Do not load the full legacy UI file unless actively editing it.
- Avoid scanning `node_modules` or build artifacts.

## 7) Runtime/Testing Defaults
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

## 8) Code Style and Conventions
- ESModules (`import`/`export`), semicolons, double quotes.
- 2-space indentation and concise functions.
- Follow nearby file patterns and naming conventions.
- Do not introduce new lint/format tooling unless requested.

## 9) Security Note (Important)
Protected APIs use local authenticated session identity as the security boundary.
- `x-user-role` may appear in legacy clients but is not authoritative in production.
- Compatibility header mode is opt-in via `ALLOW_LEGACY_ROLE_HEADER=true`.

## 10) Caution
- Avoid editing `frontend/src/legacy/InspectFlowDemo.jsx` unless explicitly requested; BL-077 treats it as retired legacy source, not active ownership.
- Change DB schema only with explicit request and a migration plan.

## 11) Global Queue Rules
- `STATUS.md` is the canonical execution queue.
- `docs/backlog.md` is the backlog index keyed by `BL-###` IDs, with detailed release shards under `docs/backlog/*.md`.
- `WORKLOG.md` is the recent completion log; older completion history is archived in `WORKLOG.archive-*.md`.
- Start from the highest-ranked eligible item in `STATUS.md`.
- Only the coordinator may change global `Rank` or `Priority`.
- Stale handoff rule: if `Updated` is older than 24 hours, another agent may claim the item after adding a handoff note in `STATUS.md`.
- **Handoff Notes rolling window**: STATUS.md Handoff Notes section must not exceed 10 rows. On each STATUS.md update, remove the oldest entries beyond 10 — they are preserved in `WORKLOG.md`.
- **WORKLOG.md archival trigger**: when `WORKLOG.md` exceeds 50 lines, move entries older than 30 days to `WORKLOG.archive-YYYY-MM-DD.md` (encoding the date range in the filename) and add a footer comment pointing to the archive.
- **Backlog shard completion trim**: when a BL item completes, replace its full acceptance text in the release shard with `Completed YYYY-MM-DD — see WORKLOG.md.` at the next STATUS.md update.

## 12) Forward Progress and Stop Conditions
- Default behavior: proceed with reasonable assumptions.
- Stop only when blocked by missing critical information or when a major product/architecture decision is required.
- State assumptions explicitly in the response.

## 13) Evidence Requirements (Mandatory)
- Report exact test commands executed and their results.
- Include evidence links/paths when running CI or generating artifacts.
- Any skipped gate must be explicitly called out with rationale.

## 14) Thread Hygiene
Start a new thread when:
- Switching to a different feature area.
- The request is unrelated to the thread's main purpose.
- The thread is long and key assumptions keep changing.

Stay in the same thread when:
- Iterating on the same feature or file set.
- The current plan still applies.

## 15) Context Budget Rules
Tier 1 files must be kept small enough to read in one shot. Violating these limits requires immediate remediation before other work continues.

- **Hard limit**: no Tier 1 file may exceed 200 lines or 40 KB. If a Read fails with a token-limit error, split or archive that file before any other work.
- **STATUS.md**: active queue rows + 10 Handoff Notes rows + static sections = target ≤ 30 lines total.
- **WORKLOG.md**: rolling window ≤ 50 lines. Archive trigger: when file exceeds 50 lines, move entries older than 30 days to `WORKLOG.archive-YYYY-MM-DD.md`.
- **backlog shards** (`docs/backlog/rN.md`): completed-item rows must use the one-line completion reference format; full acceptance text is retained only for open items.
- **Source files**: no single frontend or backend source file may exceed 2,000 lines or 120 KB. Decompose before adding features.
- **Test files**: no test file may exceed 900 lines. Extract shared fixtures/factories to `backend/test/helpers/` or `frontend/tests/helpers/` when this limit is approached.
- **CI gate**: `npm run context:budget` must pass on every PR. It checks all of the above and exits non-zero with remediation hints on failure.
