# Integration Adapter + Support Bundle Runbook

Contracts:
- `INT-INGEST-v1` (BL-033)
- `INT-CONNECTOR-v2` (BL-038)

## ERP Job Adapter Pack (`erp_job_v1`)

### Preview mapping
- Endpoint: `POST /api/imports/adapters/erp-jobs/preview`
- Capability: `view_admin`
- Input: ERP-style `rows`/`csvText` payload (`job_number`, `part_number`, `operation_number`, `lot_number`, `quantity`, `status`, optional `external_id`)
- Output: accepted/rejected row counts + row-level reject reasons.

### Runtime integration pull with adapter pack
- Configure integration with:
  - `importType: jobs`
  - `options.adapterPack: "erp_job_v1"`
- Execute pull:
  - `POST /api/imports/integrations/:id/pull`
- Behavior:
  - ERP rows are normalized to canonical `INT-INGEST-v1` envelopes.
  - Accepted rows flow through existing jobs import path.
  - Rejected rows are returned as adapter errors (no domain-side import fork).

## Support Bundle Retrieval

### Per-run bundle
- Endpoint: `GET /api/imports/runs/:id/support-bundle`
- Capability: `view_admin`
- Returns: metadata-only troubleshooting payload (`int-support-bundle-v1`) with retry attempts, error classification, replay-safe context.

### Recent bundle list
- Endpoint: `GET /api/imports/support-bundles?limit=25`
- Capability: `view_admin`
- Returns: latest run-aligned support bundles for operator-safe troubleshooting.

## Safety Notes
- Support bundles intentionally omit raw measurement values.
- Adapter rejects are explicit and auditable in run errors.
