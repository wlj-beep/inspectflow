# Technical Ops Runbook

Implements BL-053, BL-054, BL-055, BL-057, BL-059, and BL-104.

## API Endpoints (`view_admin`)

- `GET /api/technical-ops/summary`
- `GET /api/technical-ops/health`
- `GET /api/technical-ops/storage`
- `GET /api/technical-ops/backups`
- `GET /api/technical-ops/events`
- `GET /api/technical-ops/integrations/monitoring`
- `GET /api/technical-ops/integrations/:id/runs`
- `GET /api/technical-ops/lifecycle/summary`
- `POST /api/technical-ops/lifecycle/retention`
- `GET /api/analytics/admin/operational-rollup`

## Runtime SLO Contract

- `GET /api/technical-ops/summary` now exposes `runtimeSlo` with:
  - target uptime and import-success thresholds
  - alert thresholds for backup freshness, import issue counts, and storage budget usage
  - incident-response guidance with the runbook path and operator command sequence
- Treat `PLAT-SLO-v1` as the customer-safe runtime posture contract for downstream proof and compatibility surfaces.
- Use the summary payload as the evidence surface before escalating to broader release or capacity review.

## Operational Checks

1. Validate runtime health and DB/storage signals:
   - `curl -sS -H 'x-user-role: Admin' http://127.0.0.1:4000/api/technical-ops/summary`
2. Validate integration monitoring:
   - `curl -sS -H 'x-user-role: Admin' http://127.0.0.1:4000/api/technical-ops/integrations/monitoring`
3. Validate lifecycle retention and data-growth policy:
   - `curl -sS -H 'x-user-role: Admin' http://127.0.0.1:4000/api/technical-ops/lifecycle/summary`
4. Update lifecycle retention policy:
   - `curl -sS -X POST -H 'x-user-role: Admin' -H 'Content-Type: application/json' --data '{"backupRetentionDays":21,"targetBackupBudgetMb":3072,"targetLogBudgetMb":1536}' http://127.0.0.1:4000/api/technical-ops/lifecycle/retention`
5. Validate high-level operational analytics/risk rollups:
   - `curl -sS -H 'x-user-role: Admin' http://127.0.0.1:4000/api/analytics/admin/operational-rollup`

## Backup / Lifecycle Controls

- `npm run backup:create`
- `npm run backup:verify`
- `npm run backup:run-scheduled`
- `npm run test:load:gate` (BL-056 dry-run load gate)

## Data Growth Policy

- The lifecycle summary now includes a `dataGrowth` block with:
  - table-level index, partition, and archive recommendations for `records`, `import_runs`, `audit_log`, and `ana_risk_event_log`
  - current row-count footprint signals for those tables
  - rollback-safe operator notes for additive index builds, batched backfills, and delayed destructive cleanup
- Treat the endpoint as the evidence surface before any large-table maintenance:
  - confirm the target table is actually at or nearing its review threshold
  - use additive changes first (`CREATE INDEX CONCURRENTLY`-style builds, shadow partitions, archive targets)
  - keep source partitions, legacy indexes, and restore manifests in place through the rollback window before dropping anything
- Use `POST /api/technical-ops/lifecycle/retention` only for retention and storage-budget updates; data-growth recommendations are surfaced from backend policy and runbook guidance.

## UI Path

- Sign in as Admin.
- Open `Admin` -> `Technical Ops`.
- Use:
  - Overview cards for runtime + backup signals.
  - Integration Monitoring table and per-integration run history.
  - Lifecycle controls to update retention and storage budgets, and review the data-growth summary before large-table maintenance.
  - Operational Analytics Rollup for risk-status/severity summaries.
