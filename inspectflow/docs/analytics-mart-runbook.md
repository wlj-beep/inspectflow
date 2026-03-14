# Analytics Mart Runbook (`BL-039`)

## Scope
- Contract: `ANA-MART-v3`
- Runtime service: `backend/src/services/analytics/martBuilder.js`
- API surface: `backend/src/routes/analytics.js`

## Build Entry Points
- `POST /api/analytics/marts/rebuild` (requires `view_admin`)
  - Rebuilds:
    - `ana_mart_inspection_fact`
    - `ana_mart_connector_run_fact`
    - `ana_mart_job_rollup_day`
  - Transformation mode: full refresh, deterministic ordering.
- `GET /api/analytics/marts/status` (requires `view_admin`)
  - Returns latest build run metadata and current mart row counts.

## Source Contracts
- `QUAL-TRACE-v1`:
  - `records`, `record_values`, `record_dimension_snapshots`, `operations`, `audit_log`
- `INT-CONNECTOR-v2`:
  - `import_runs`
  - `import_external_entity_refs` for measurement run linkage (`source_run_id`)

## Reproducibility Model
- Each rebuild truncates mart tables and re-materializes from source tables in deterministic sort order.
- Build output snapshots record per-mart:
  - row count
  - ordered row fingerprint (`md5` over canonicalized row payloads)
- Build metadata persists in `ana_mart_build_runs` with:
  - source snapshot
  - output snapshot
  - transform version
  - actor/trigger provenance

## Validation
- Runtime coverage:
  - `backend/test/analytics-mart-runtime.test.js`
- Contract coverage:
  - `backend/test/analytics-contracts.test.js`

