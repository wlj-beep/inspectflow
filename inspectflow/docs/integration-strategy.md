# Integration Strategy

## Purpose
Define a release-aware integration path that supports customer data ownership and incremental enterprise connectivity without destabilizing core workflows.

## Principles
1. Canonical contracts first, adapters second.
2. Local-first processing remains default.
3. Idempotency and replay safety are required for production imports.
4. Integration failures must be observable and recoverable.

## Current Baseline
Implemented integration surfaces include:
- CSV ingestion paths for tools, part dimensions, jobs, and measurements.
- Integration configuration and pull/webhook run orchestration.
- Run logs and unresolved-item workflows for ambiguous measurement rows.

## Release Phasing

### R1 (Foundation)
- Consolidate current ingest behavior behind `INT-INGEST-v1`.
- Standardize row-level error schema and unresolved handoff semantics.
- Keep mixed-mode support: UI/manual flows + import flows.

### R2 (Enterprise Hardening)
- Implement `INT-CONNECTOR-v2` with retry, replay, and failure-policy controls.
- Add idempotent external keys via `INT-IDEMPOTENCY-v2`.
- Add adapter packs for ERP/MES sources while preserving canonical contracts.
- Provide governance controls for import conflict policy and setup revision coupling.
- Introduce partner connector kit + validation harness via `/api/partner-connectors` (validate/register/list) as the onboarding path for third-party connectors under `INT-CONNECTOR-v2`.

### R3 (Intelligence and Scale)
- Feed analytics contracts with validated ingestion provenance.
- Add cross-site ingestion controls aligned with site partition policy.

## Contract Boundary
- Canonical envelope fields:
  - source type,
  - import type,
  - external key,
  - actor/provenance,
  - payload version,
  - ingest timestamp,
  - idempotency token.

Adapters must map source-specific payloads into this envelope before domain processing.

## Reliability Requirements
- At-least-once delivery semantics for connector execution.
- Deduplication and replay safety at canonical ingest stage.
- Deterministic unresolved-item routing for ambiguous rows.
- Run-state visibility suitable for support and audit review.

## Runtime Execution Contract (`INT-CONNECTOR-v2`)
- Configured integration pulls and webhook imports execute through connector runtime orchestration.
- Runtime status is deterministic:
  - `success`: no row failures.
  - `partial`: at least one failure and at least one successful insert/update.
  - `error`: terminal failure with no successful row persistence.
- Duplicate replay attempts short-circuit via idempotency keys and return `duplicate=true` with no additional row writes.
- Run logs persist runtime attempt metadata (attempt count/details, idempotency key, replay metadata) in `import_runs.summary.runtime`.
- BL-081 simplification default:
  - Core operator/admin value surfaces remain active: integration config, run logs, unresolved queue.
  - Legacy partner/extension complexity is disabled by default and gated behind `INTEGRATION_LEGACY_PARTNER_SURFACES=true`.
  - When disabled, `/api/extensions` and `/api/partner-connectors` return `legacy_integration_surface_disabled`.

## Idempotency and External-ID Contract (`INT-IDEMPOTENCY-v2`)
- Connector idempotency keys persist in `import_idempotency_ledger` with first/last run linkage and hit counts for audit-safe replay tracking.
- Imported entity external IDs persist in `import_external_entity_refs` for `jobs`, `tools`, `part_dimensions`, and `measurements` payloads.
- Replayed payloads increment idempotency and external-reference hit counters without mutating domain entities a second time.

## Open Decisions (Managed by Release Gates)
- Exact overwrite/merge policies per domain object.
- Connector authentication profile templates by customer environment.
- Export webhook guarantees for downstream systems.

All open decisions must be resolved as backlog items with stream ownership.
