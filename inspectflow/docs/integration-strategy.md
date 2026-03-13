# Integration Strategy (Post-MVP + MVP Onramp)

## Why This Is High Priority
Customers will request inbound/outbound integrations for:
- Tool master/calibration systems
- ERP/MRP job and operation data
- Dimension/tolerance sources (for example drawing/inspection extraction outputs)

To avoid rework, integration seams must be part of the current architecture, even if full external connectivity is phased.

## MVP Onramp Implemented
- CSV ingestion endpoints:
  - `POST /api/imports/tools/csv`
  - `POST /api/imports/part-dimensions/csv`
- Import templates:
  - `docs/templates/tools-import-template.csv`
  - `docs/templates/part-dimensions-import-template.csv`
- Template metadata endpoint:
  - `GET /api/imports/templates`

These enable immediate customer bootstrap via managed file imports while preserving current UI workflows.

## Near-Term Refactor Targets
1. Introduce import service boundaries
- Move parsing and validation from route handlers into service modules (`services/imports/*`).
- Standardize row-level error objects for partial-failure reporting.

2. Add idempotent external keys
- Add optional `external_id` columns to tools/jobs/parts/operations/dimensions.
- Use external keys for merge/update safety during repeated imports.

3. Add import job tracking
- Persist import runs (`imports` table) with status, counts, failures, actor, and source metadata.
- Support dry-run validation mode before commit.

4. Add outbound webhook/event envelope
- Emit canonical domain events for:
  - Job created/updated/closed
  - Record submitted/edited
  - Tool updated
  - Part setup updated
- Start with local event log + replay endpoint, then optional webhook delivery.

## ERP Integration Path
- Define canonical inbound contract for jobs:
  - part/revision, operation, lot, qty, due/start windows, priority.
- Add source adapter layer:
  - `adapters/erp/sap/*`
  - `adapters/erp/msfo/*`
  - shared normalization pipeline.
- Preserve mixed-mode support:
  - Manual UI job creation remains available.
  - Source-tracked jobs are marked with provenance metadata.

## Dimension Ingestion Path
- Support CSV now (implemented) and XLSX adapter next.
- Keep operation assignment explicit in import schema (`op_number`, `op_label`) to prevent ambiguous mapping.
- Future adapters:
  - SolidWorks Inspection exports
  - Other feature-extraction outputs normalized into the same contract.

## Open Design Decisions
- Conflict policy: overwrite vs require approval for existing setup changes.
- Revision coupling: imports that affect setup-critical fields must create revisions (once revision system is implemented).
- Webhook delivery guarantees: at-least-once with idempotency key is recommended.

