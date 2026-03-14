# Integration Handoff (Agent D)

## Scope Delivered
- `BL-031` connector runtime hardening scaffolding.
- `BL-032` idempotency and external key scaffolding.
- `BL-033` ERP/job adapter contract-path scaffolding.
- `BL-038` integration observability/support bundle scaffolding.

## New Isolated Modules
- `backend/src/services/integration/canonicalEnvelope.js`
  - Canonical envelope normalization + validation aligned to `INT-INGEST-v1`.
  - Required fields: source/import type, payload version, ingest timestamp, payload, idempotency token.
- `backend/src/services/idempotency/idempotencyKey.js`
  - Deterministic stable stringify, idempotency hash generation, external entity key utility, in-memory duplicate ledger.
- `backend/src/services/integration/connectorRunPolicy.js`
  - Error classification (`network`, `remote_service`, `contract`, `unknown`), deterministic backoff/jitter, retry decision output, replay metadata format.
- `backend/src/services/integration/erpJobAdapter.js`
  - ERP job row normalization to canonical contract envelope for `jobs` imports.
  - Batch mapper emits accepted/rejected line-level contract outputs.
- `backend/src/services/observability/integrationSupportBundle.js`
  - Support-safe bundle formatter with metadata-only payload shape summaries.
  - Explicitly avoids emitting customer measurement values.

## Test Coverage Added
- `backend/test/integration-envelope.test.js`
- `backend/test/integration-runtime-policy.test.js`

## Runtime Wiring Prerequisites
1. Route-level integration:
   - Adopt `validateAndNormalizeCanonicalEnvelope` at import entrypoints before domain import handlers.
   - Generate/consume `createIdempotencyKey` at canonical ingest stage for dedupe policy.
2. Persistence:
   - Add additive storage for idempotency/replay state if durable dedupe is required across process restarts.
   - No destructive schema changes are proposed in this slice.
3. Connector execution:
   - Apply `buildConnectorRunDecision` to scheduler/manual pull error paths.
   - Persist `buildReplayMetadata` output in run diagnostics.
4. Support tooling:
   - Build downloadable support JSON from `buildIntegrationSupportBundle`.
   - Keep bundle generation behind admin/support capability checks.

## Safety Notes
- Features are scaffolding-only and not wired into active runtime paths.
- All support output remains metadata-only by design.

