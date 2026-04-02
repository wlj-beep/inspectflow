# Status

Canonical global execution queue for active backlog work. The live queue is currently empty.

## Queue Rules
- `STATUS.md` is the single source of truth for global priority order and active ownership.
- No coding without prior claim in `STATUS.md`.
- Agents should start with the highest-ranked eligible item.
- Soft claim model: one lead owner is required for active work; collaborators may be listed in `Owner`.
- Only the Coordinator may reprioritize `Rank` or `Priority`.
- Stale handoff rule: if `Updated` is older than 24 hours, another agent may claim the item after adding a handoff note below.
- On completion, remove the item from this active queue and append the completion to `WORKLOG.md`.
- Stream/team tags are encoded in `Work Item` text only (schema remains unchanged).

| Rank | Item ID | Priority | Status | Owner | Updated | Work Item |
| --- | --- | --- | --- | --- | --- | --- |
## Active Queue State
- No active queue items remain as of 2026-04-01.
- Add new work here before implementation starts; completed items stay in `WORKLOG.md`.

## Active Gate Defaults
- For BL-058 acceptance, duplicate/replay behavior is fixed to idempotent skip plus audit trail updates (no strict hard-reject mode).

## Handoff Notes

| Date | Item ID | From | To | Note |
| --- | --- | --- | --- | --- |
| 2026-04-01 | BL-119 | @codex | @owner | Completed responsive shell and layout cleanup for login, home, operator, and admin surfaces, with shared spacing/token cleanup and overflow checks. |
| 2026-04-01 | BL-120 | @codex | @owner | Completed shell modularity and context-budget reduction by splitting shell chrome and shared helpers into bounded modules. |
| 2026-04-01 | BL-121 | @codex | @owner | Completed shareable customer proof-pack handoff with redacted copy/share/download actions and presentation-ready proof text. |
| 2026-04-01 | BL-114 | @codex | @owner | Completed release-path automation with a single wrapper command, consolidated evidence bundle, and automatic cycle-report artifact generation. |
| 2026-04-01 | BL-115 | @codex | @owner | Completed automatic cycle-report generation through `ops:cycle:report:auto` with bundle storage and report traceability. |
| 2026-04-01 | BL-116 | @codex | @owner | Completed split release sequencing so fast feedback runs before the standardized gate and the commercialization gates stay in the final pass. |
| 2026-04-01 | BL-117 | @codex | @owner | Completed single on-prem preflight -> start/health -> rollback-ready operator flow wrapper and runbook update. |
| 2026-04-01 | BL-118 | @codex | @owner | Completed early prereq/artifact failure surfacing for commercialization gates and cycle-report enforcement. |
| 2026-04-01 | BL-020 | @codex | @owner | Completed signed offline update bundle workflow with preflight and rollback procedures. |
| 2026-04-01 | BL-023 | @codex | @owner | Completed route resequencing and operation move workflows with revision trace. |
| 2026-04-01 | BL-036 | @codex | @owner | Completed optional AD/SSO integration path without breaking local account mode. |
| 2026-04-01 | BL-037 | @codex | @owner | Completed optional paid hard-seat modes behind entitlement flags. |
| 2026-03-31 | BL-094 | @codex | @owner | Completed controlled document workflow with revisioned procedures/forms, release state, and reason-trail coverage. |
| 2026-03-31 | BL-095 | @codex | @owner | Completed training and competency tracking for released quality documents plus role/user completion gating. |
| 2026-03-31 | BL-096 | @codex | @owner | Completed supplier quality workflow with supplier-linked nonconformance intake, SCAR lifecycle, response tracking, and closure export. |
| 2026-03-31 | BL-097 | @codex | @owner | Completed FAI package workflow with characteristic-indexed balloon references and richer AS9102 package export. |
| 2026-03-31 | BL-100 | @codex | @owner | Completed measurement-system and calibration-impact analytics with tool-health correlation and operator-safe remediation views. |
| 2026-03-31 | BL-030 | @codex | @owner | Completed the R1 acceptance matrix automation and manual release evidence checklist with a dedicated cycle artifact and aligned release-test coverage. |
| 2026-03-31 | BL-084 | @codex | @owner | Completed runtime regression recovery for import/integration paths and support-bundle views with focused recovery and replay coverage. |
| 2026-03-31 | BL-085 | @codex | @owner | Completed backend test parsing and standardized gate health repair, including the live UI fallback for missing `DATABASE_URL_TEST`. |
| 2026-03-31 | BL-091 | @codex | @owner | Completed AS9102 export pass-rate semantics reconciliation and runbook parity for zero and partial measurement cases. |
| 2026-03-31 | BL-058 | @codex | @owner | Completed duplicate/replay idempotency enforcement across manual, API, and webhook ingest entrypoints with audit-traceable skips. |
| 2026-03-31 | BL-103 | @codex | @owner | Completed commercialization-target load/performance gate with deterministic evidence artifacts and reusable gate/self-test hooks. |
| 2026-03-31 | BL-104 | @codex | @owner | Completed data-growth policy surface with large-table footprint signals, index/partition/archive guidance, and rollback-safe operator notes. |
| 2026-03-31 | BL-105 | @codex | @owner | Completed customer activation toolkit with mapping templates, dry-run preflight reporting, and Admin Imports integration. |
| 2026-03-31 | BL-106 | @codex | @owner | Completed pilot-readiness scorecard endpoint and compact dashboard cue with deterministic customer-site scoring. |
| 2026-03-31 | BL-107 | @codex | @owner | Completed commercial packaging metadata contract with bundles, seat policy options, and upgrade prompt audit payloads. |
| 2026-03-31 | BL-102 | @codex | @owner | Completed connector dead-letter capture and replay guidance for terminal failures after BL-101 unblocked the queueing slice. |
| 2026-03-31 | BL-109 | @codex | @owner | Completed guided onboarding with a resettable demo path and explicit workflow CTA. |
| 2026-03-31 | BL-112 | @codex | @owner | Completed system trust indicator wording and coverage for backup freshness, update readiness, import health, and audit/log confidence. |
| 2026-03-31 | BL-111 | @codex | @owner | Completed the remaining premium-feel polish pass across shared widgets, navigation, theme labels, and supporting styles. |
| 2026-03-31 | BL-043 | @codex | @owner | Completed multi-site KPI boundary proof with stricter site-scoped regression coverage. |
| 2026-03-31 | BL-092 | @codex | @owner | Completed commercialization RC gate automation, self-test coverage, and gate evidence wiring for release closeout. |
| 2026-03-31 | BL-101 | @codex | @owner | Completed scheduler extraction with advisory-lock worker semantics, clean shutdown hooks, and on-prem startup wiring. |
| 2026-03-31 | BL-093 | @codex | @owner | Completed CAPA lifecycle foundation with staged transitions, evidence gates, and audit-lineage coverage. |
| 2026-03-31 | BL-098 | @codex | @owner | Completed metrology adapter canonical-envelope ingestion with deterministic reject metadata and replay-safe batch identity. |
| 2026-03-31 | BL-099 | @codex | @owner | Completed SPC analytics control-chart signals, traceable drilldown references, and regression coverage. |
| 2026-03-31 | BL-084 | @codex | @owner | Completed runtime regression recovery by restoring import/integration helper exports and validating recovery suites. |
| 2026-03-31 | BL-085 | @codex | @owner | Completed backend test-gate repair by fixing backlog-validation syntax and adding Vitest setup bootstrap. |
| 2026-03-31 | BL-091 | @codex | @owner | Completed AS9102 pass-rate correction for zero/partial capture with dedicated regression coverage. |
| 2026-03-30 | BL-082 | @codex | @owner | Completed shell-wrapper retirement: production now routes through `frontend/src/AppShell.jsx` directly and the legacy wrapper file has been removed. |
| 2026-03-30 | BL-017 | @codex | @owner | Completed capability migration: authenticated sessions now own capability checks, legacy role headers are opt-in for compatibility, and auth/routing regression coverage confirms spoofed headers do not override session identity. |
| 2026-03-30 | BL-060 | @codex | @owner | Completed authenticated header cleanup: signed-in sessions now render only the identity text and no longer show the post-login selector. |
| 2026-03-30 | BL-016 | @owner | @codex | Completed auth/session hardening: password-reset setup for tests, expanded logout audit assertions, and lockout/session coverage are merged. |
| 2026-03-30 | BL-061 | @owner | @codex | Completed export workflow: select-for-export mode, row checkboxes, and checked-record CSV export are merged and verified. |
| 2026-03-30 | BL-029 | @owner | @codex | Completed backend route decomposition: `registerAppRoutes` extraction and contract coverage are merged. |
| 2026-03-13 | BL-000 | @owner | @owner | Queue initialized for global ranking and claim coordination. |
| 2026-03-13 | BL-003 | @owner | @codex | Claimed after completing BL-001 and BL-002. |
| 2026-03-13 | BL-004 | @owner | @codex | Claimed after completing BL-003. |
| 2026-03-13 | BL-005 | @owner | @codex | Claimed after completing BL-004. |
| 2026-03-13 | BL-009 | @owner | @codex | Completed via live role-capability summaries on Users page. |
| 2026-03-13 | BL-006 | @codex | @owner | Completed revision-controlled setup history, revision progression, and admin revision review gating. |
| 2026-03-13 | BL-007 | @codex | @owner | Completed part/job revision-required flows and job part+revision API enforcement. |
| 2026-03-13 | BL-008 | @codex | @owner | Completed catalog-scale Part Setup filtering/pagination and structured bulk part-name update workflow. |
| 2026-03-13 | BL-010 | @codex | @owner | Completed tool calibration due-date + current/home location tracking with admin-managed location master data. |
| 2026-03-14 | BL-011 | @owner | @codex | Claimed after backlog expansion for jobs import, integration ingestion, and raw-data processing pipeline. |
| 2026-03-14 | BL-011 | @codex | @owner | Completed jobs CSV import endpoint/template/UI with upsert validation and row-level import feedback. |
| 2026-03-14 | BL-012 | @codex | @owner | Completed API/webhook/excel integration model with pull endpoints, run logs, and scheduler polling support. |
| 2026-03-14 | BL-013 | @codex | @owner | Completed measurement bulk ingest + operator per-job CSV import endpoints with templates and validation. |
| 2026-03-14 | BL-014 | @codex | @owner | Completed raw ingest normalization and unresolved-item manual resolution workflow in backend + Admin UI. |
| 2026-03-14 | BL-015 | @owner | @owner | Re-seeded queue after release-framework and multi-release backlog refactor. |
| 2026-03-14 | BL-015 | @codex | @owner | Completed `PLAT-AUTH-v1`: local auth endpoints (`/api/auth/*`), session middleware/cookies, capability enforcement tied to authenticated identity, and auth/protected-route regression coverage. |
| 2026-03-14 | BL-019 | @codex | @owner | Completed `PLAT-DEPLOY-v1`: on-prem install/start/stop/health/rollback packaging scripts under `deploy/onprem` with environment template and runbook. |
| 2026-03-14 | BL-021 | @codex | @owner | Completed `PLAT-BACKUP-v1`: automated backup/restore/verify scripts with retention + schedule entrypoint and structured audit logging runbook. |
| 2026-03-14 | BL-015 | @codex | @owner | Cycle C0 reconciliation published with acceptance evidence links: `docs/operations/cycles/2026-03-14-C0-atlas-reconciliation.md`. |
| 2026-03-14 | BL-019 | @codex | @owner | Cycle C0 reconciliation published with acceptance evidence links: `docs/operations/cycles/2026-03-14-C0-atlas-reconciliation.md`. |
| 2026-03-14 | BL-021 | @codex | @owner | Cycle C0 reconciliation published with acceptance evidence links: `docs/operations/cycles/2026-03-14-C0-atlas-reconciliation.md`. |
| 2026-03-14 | BL-022 | @codex | @owner | Completed work center master CRUD, operation assignment endpoints, and assignment/work-center audit history. |
| 2026-03-14 | BL-024 | @codex | @owner | Completed per-piece comments in record submit/review/export flows with comment audit lineage and serial support. |
| 2026-03-14 | BL-025 | @codex | @owner | Completed quantity adjustment workflow with reason, actor, and before/after audit records. |
| 2026-03-14 | BL-026 | @codex | @owner | Completed traceability query service filters (job/part/lot/piece/serial) including correction and quantity-adjustment lineage. |
| 2026-03-14 | BL-028 | @codex | @owner | Completed frontend modularization slice: extracted domain constants/mappers/adapter modules and rewired legacy shell bootstrap/session/record-detail flows to stable `domains/jobflow` adapter APIs. |
| 2026-03-14 | BL-031 | @codex | @owner | Completed `INT-CONNECTOR-v2`: wired connector runtime orchestration into configured integration and webhook execution paths with deterministic statusing, replay/idempotency metadata run-log persistence, and API regression coverage. |
| 2026-03-14 | BL-032 | @codex | @owner | Completed `INT-IDEMPOTENCY-v2`: persisted import idempotency ledger and external-entity reference mappings across tools/jobs/part-dimensions/measurements with runtime-enforced duplicate short-circuit semantics and regression coverage. |
| 2026-03-14 | BL-039 | @codex | @owner | Completed `ANA-MART-v3`: production mart build service and admin runtime endpoints now materialize analytics marts from traceable source contracts with deterministic rebuild snapshots and regression coverage. |
| 2026-03-14 | BL-041 | @owner | @codex | Activated queue claim after BL-039 completion to deliver calibration-impact analytics and BL-042 integration path. |
| 2026-03-14 | BL-052 | @owner | @codex | Claimed for full testing-platform overhaul: replace legacy smoke-only posture with standardized live UI + backend persistence gates and updated agent/testing runbooks. |
| 2026-03-14 | BL-052 | @codex | @owner | Completed `PLAT-TEST-v1` testing-platform overhaul: standardized tiered gates (`test:coordination`, `test:api`, `test:ui:mock`, `test:ui:live`, `test:standardized`), live UI critical-path coverage with persisted-record verification, focused backend persistence regression suite, CI standardized gate workflow, and agent/test-governance documentation refresh. |
| 2026-03-14 | BL-041 | @codex | @owner | Completed `ANA-KPI-v3` calibration-impact analytics (`/api/analytics/performance/calibration-impact*`) with BL-042 integration path: `ANA-RISK-v3` event + `QUAL-RISK-WORKFLOW-v1` escalation generation, durable `ana_risk_event_log` persistence/resolve endpoints, runbook, and regression coverage; BL-042 dependency is now cleared. |
| 2026-03-14 | BL-033 | @codex | @owner | Completed `INT-INGEST-v1` runtime integration: ERP job adapter pack (`erp_job_v1`) now maps external rows through canonical envelope contracts in managed imports, with adapter preview endpoint and regression coverage. |
| 2026-03-14 | BL-038 | @codex | @owner | Completed `INT-CONNECTOR-v2` observability integration: support bundles are persisted in import run runtime summaries and exposed through admin-safe retrieval endpoints (`/api/imports/runs/:id/support-bundle`, `/api/imports/support-bundles`) with regression coverage. |
| 2026-03-14 | BL-040 | @codex | @owner | Completed `ANA-KPI-v3` operator/supervisor dashboard runtime APIs (`/api/analytics/kpis/definitions`, `/api/analytics/kpis/dashboard`) with validated KPI contracts and mart-backed aggregate/breakdown/trend outputs. |
| 2026-03-14 | BL-042 | @codex | @owner | Completed `ANA-RISK-v3` + `QUAL-RISK-WORKFLOW-v1` lifecycle integration: risk-event acknowledge/escalate-to-issue/resolve workflows now persist actor metadata, linked issue IDs, and traceable escalation evidence with regression coverage. |
| 2026-03-15 | BL-027 | @codex | @owner | Completed `QUAL-EXPORT-v1` runtime path: retained record CSV export and shipped starter AS9102-oriented output endpoint (`/api/records/:id/export/as9102`) with profile rendering tests. |
| 2026-03-15 | BL-053 | @codex | @owner | Completed technical ops API foundation (`/api/technical-ops/{summary,health,storage,backups,events}`) with admin-safe health/DB/storage/backup/error summaries and regression coverage. |
| 2026-03-15 | BL-056 | @codex | @owner | Completed repeatable synthetic-load gate: deterministic 10x generator (`scripts/load/generate-synthetic-data.mjs`), load gate runner (`scripts/load/run-load-gate.sh`), and dry-run CI validation script (`npm run test:load:gate`). |
| 2026-03-15 | BL-058 | @codex | @owner | Completed idempotent duplicate/replay enforcement across ingest entrypoints by routing manual/API CSV imports through connector runtime + ledger with run-log audit metadata and dedicated entrypoint tests. |
| 2026-03-15 | BL-055 | @codex | @owner | Completed integration monitoring APIs (`/api/technical-ops/integrations/monitoring`, `/api/technical-ops/integrations/:id/runs`) with per-connector health indicators, run outcomes, replay context, and failure visibility. |
| 2026-03-15 | BL-057 | @codex | @owner | Completed on-prem lifecycle controls APIs (`/api/technical-ops/lifecycle/{summary,retention}`) with retention policy persistence, footprint/capacity visibility, and operator runbook command guidance. |
| 2026-03-15 | BL-054 | @codex | @owner | Completed Admin `Technical Ops` tab with function-first UX wired to technical ops/integration/lifecycle APIs and run-history controls. |
| 2026-03-15 | BL-059 | @codex | @owner | Completed admin operational analytics/risk rollup endpoint (`/api/analytics/admin/operational-rollup`) and UI integration in the Technical Ops tab with high-level status/severity summaries. |
| 2026-03-15 | BL-034 | @codex | @owner | Completed `QUAL-FAI-v2` first-article profile runtime path via record-scoped AS9102 export inputs (part + lot + inspector + measured/fail stats) and profile-selection endpoint behavior. |
| 2026-03-15 | BL-035 | @codex | @owner | Completed `QUAL-EXPORT-v1` profile-pack delivery with selectable starter profiles (`as9102-basic`, `as9102-line-only`) and runtime validation/error handling tests for unknown profile requests. |
| 2026-03-28 | BL-072 | @codex | @owner | Completed operator lookup quick chips for part/operation/status plus integrated search narrowing. |
| 2026-03-28 | BL-073 | @codex | @owner | Completed operator lookup pagination with page-size controls and match count feedback. |
| 2026-03-28 | BL-074 | @codex | @owner | Completed sticky measurement header rows for persistent dimension/spec/sampling context. |
| 2026-03-28 | BL-075 | @codex | @owner | Completed sticky live measurement summary footer with pass/fail/NA/measured totals. |
| 2026-03-28 | BL-076 | @codex | @owner | Completed `?` keyboard shortcut overlay with ESC close and default hotkey reference list. |
| 2026-03-28 | BL-077 | @codex | @owner | Completed confirm-dialog gating on destructive admin actions (user and location removal). |
| 2026-03-28 | BL-078 | @codex | @owner | Completed inline domain help text for revision/IT/sampling interval-heavy form fields. |
| 2026-03-28 | BL-079 | @codex | @owner | Completed on-blur validation hooks on core job/tool/part fields with inline error surfacing. |
| 2026-03-28 | BL-080 | @codex | @owner | Completed preset column width controls (narrow/default/wide) for measurement grid. |
| 2026-03-28 | BL-081 | @codex | @owner | Completed role-specific header accent theming and contextual mode label display. |
| 2026-03-29 | ISSUE-01 | @codex | @owner | Completed CORS hardening in backend boot: origin now resolves from explicit `FRONTEND_ORIGIN` allowlist and no longer defaults allow-all. |
| 2026-03-29 | ISSUE-02 | @codex | @owner | Completed auth pepper safety guard: session-token hashing now throws in non-test mode when `AUTH_TOKEN_PEPPER` is missing. |
| 2026-03-29 | ISSUE-06 | @codex | @owner | Completed HTTP security headers baseline by adding `helmet()` middleware in backend startup. |
| 2026-03-29 | ISSUE-07 | @codex | @owner | Completed login brute-force throttle baseline by adding `express-rate-limit` on `/api/auth/login`. |
| 2026-03-29 | ISSUE-08 | @codex | @owner | Completed non-test startup env validation for `DATABASE_URL`, `AUTH_TOKEN_PEPPER`, and `FRONTEND_ORIGIN` before app boot. |
