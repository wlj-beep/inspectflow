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

## Open Decisions (Managed by Release Gates)
- Exact overwrite/merge policies per domain object.
- Connector authentication profile templates by customer environment.
- Export webhook guarantees for downstream systems.

All open decisions must be resolved as backlog items with stream ownership.
