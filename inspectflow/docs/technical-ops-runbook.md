# Technical Ops Runbook

Implements BL-053, BL-054, BL-055, BL-057, and BL-059.

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

## Operational Checks

1. Validate runtime health and DB/storage signals:
   - `curl -sS -H 'x-user-role: Admin' http://127.0.0.1:4000/api/technical-ops/summary`
2. Validate integration monitoring:
   - `curl -sS -H 'x-user-role: Admin' http://127.0.0.1:4000/api/technical-ops/integrations/monitoring`
3. Validate lifecycle and retention policy:
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

## UI Path

- Sign in as Admin.
- Open `Admin` -> `Technical Ops`.
- Use:
  - Overview cards for runtime + backup signals.
  - Integration Monitoring table and per-integration run history.
  - Lifecycle controls to update retention and storage budgets.
  - Operational Analytics Rollup for risk-status/severity summaries.
