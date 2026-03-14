# Status

Canonical global execution queue for active backlog work.

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
| 9 | BL-034 | P3 | Blocked | @codex | 2026-03-14T17:25:18-04:00 | [QUAL-Team Helix] Blocked by BL-027 (dependency incomplete). Remaining acceptance gap: BL-027 export acceptance evidence is required before `QUAL-FAI-v2` first-article workflow hardening proceeds. |
| 10 | BL-035 | P3 | Blocked | @codex | 2026-03-14T17:25:18-04:00 | [QUAL-Team Helix] Blocked by BL-034 (dependency incomplete). Remaining acceptance gap: BL-034 must complete acceptance before `QUAL-EXPORT-v1` profile-pack delivery can proceed. |

## Handoff Notes

| Date | Item ID | From | To | Note |
| --- | --- | --- | --- | --- |
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
| 2026-03-14 | BL-041 | @codex | @owner | Completed `ANA-KPI-v3` calibration-impact analytics (`/api/analytics/performance/calibration-impact*`) with BL-042 integration path: `ANA-RISK-v3` event + `QUAL-RISK-WORKFLOW-v1` escalation generation, durable `ana_risk_event_log` persistence/resolve endpoints, runbook, and regression coverage; BL-042 dependency is now cleared. |
| 2026-03-14 | BL-033 | @codex | @owner | Completed `INT-INGEST-v1` runtime integration: ERP job adapter pack (`erp_job_v1`) now maps external rows through canonical envelope contracts in managed imports, with adapter preview endpoint and regression coverage. |
| 2026-03-14 | BL-038 | @codex | @owner | Completed `INT-CONNECTOR-v2` observability integration: support bundles are persisted in import run runtime summaries and exposed through admin-safe retrieval endpoints (`/api/imports/runs/:id/support-bundle`, `/api/imports/support-bundles`) with regression coverage. |
| 2026-03-14 | BL-040 | @codex | @owner | Completed `ANA-KPI-v3` operator/supervisor dashboard runtime APIs (`/api/analytics/kpis/definitions`, `/api/analytics/kpis/dashboard`) with validated KPI contracts and mart-backed aggregate/breakdown/trend outputs. |
| 2026-03-14 | BL-042 | @codex | @owner | Completed `ANA-RISK-v3` + `QUAL-RISK-WORKFLOW-v1` lifecycle integration: risk-event acknowledge/escalate-to-issue/resolve workflows now persist actor metadata, linked issue IDs, and traceable escalation evidence with regression coverage. |
