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
| 1 | BL-015 | P0 | In Progress | @codex | 2026-03-14T13:22:11-04:00 | [PLAT-Team Atlas] Implement local auth/session foundation contract (`PLAT-AUTH-v1`). |
| 2 | BL-019 | P0 | In Progress | @codex | 2026-03-14T13:22:11-04:00 | [PLAT-Team Atlas] Deliver on-prem install packaging contract (`PLAT-DEPLOY-v1`). |
| 3 | BL-021 | P0 | In Progress | @codex | 2026-03-14T13:22:11-04:00 | [PLAT-Team Atlas] Implement automated backup/restore workflow (`PLAT-BACKUP-v1`). |
| 6 | BL-028 | P1 | Queued |  | 2026-03-14T13:20:00-04:00 | [OPS-Team Forge] Modularize frontend domains for parallel feature delivery (`OPS-JOBFLOW-v1`). |
| 7 | BL-031 | P3 | In Progress | @codex | 2026-03-14T13:27:23-04:00 | [INT-Team Bridge] Agent D isolated connector runtime hardening scaffolding (`INT-CONNECTOR-v2`) under `backend/src/services/integration/*`. |
| 8 | BL-032 | P3 | In Progress | @codex | 2026-03-14T13:27:23-04:00 | [INT-Team Bridge] Agent D isolated idempotency/external key scaffolding (`INT-IDEMPOTENCY-v2`) under `backend/src/services/idempotency/*`. |
| 9 | BL-034 | P3 | In Progress | @codex | 2026-03-14T13:26:14-04:00 | [QUAL-Team Helix] Agent C future-safe first-article engine scaffolding (`QUAL-FAI-v2`) in isolated `future/` modules only. |
| 10 | BL-035 | P3 | In Progress | @codex | 2026-03-14T13:26:14-04:00 | [QUAL-Team Helix] Agent C future-safe export profile pack scaffolding (`QUAL-EXPORT-v1`) in isolated `future/` modules only. |
| 11 | BL-039 | P3 | In Progress | @codex | 2026-03-14T13:27:23-04:00 | [ANA-Team Signal] Agent D isolated analytics mart scaffolding (`ANA-MART-v3`) under `backend/src/services/analytics/*`. |
| 12 | BL-040 | P3 | In Progress | @codex | 2026-03-14T13:27:23-04:00 | [ANA-Team Signal] Agent D isolated KPI contract scaffolding (`ANA-KPI-v3`) under `backend/src/services/analytics/*`. |
| 13 | BL-042 | P3 | In Progress | @codex | 2026-03-14T13:26:14-04:00 | [QUAL-Team Helix] Agent C future-safe anomaly/risk scaffolding (`ANA-RISK-v3`) in isolated `future/` modules only. |
| 16 | BL-033 | P3 | In Progress | @codex | 2026-03-14T13:27:23-04:00 | [INT-Team Bridge] Agent D ERP/job adapter contract path scaffolding (`INT-INGEST-v1`) via isolated adapter contract modules. |
| 17 | BL-038 | P3 | In Progress | @codex | 2026-03-14T13:27:23-04:00 | [INT-Team Bridge] Agent D observability/support bundle scaffolding (`INT-CONNECTOR-v2`) under `backend/src/services/observability/*`. |

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
| 2026-03-14 | BL-022 | @codex | @owner | Completed work center master CRUD, operation assignment endpoints, and assignment/work-center audit history. |
| 2026-03-14 | BL-024 | @codex | @owner | Completed per-piece comments in record submit/review/export flows with comment audit lineage and serial support. |
| 2026-03-14 | BL-025 | @codex | @owner | Completed quantity adjustment workflow with reason, actor, and before/after audit records. |
| 2026-03-14 | BL-026 | @codex | @owner | Completed traceability query service filters (job/part/lot/piece/serial) including correction and quantity-adjustment lineage. |
