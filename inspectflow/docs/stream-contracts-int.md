# Stream Contract: INT (Team Bridge)

## Scope
Integration and ingestion: ERP/job ingest, connector orchestration, idempotent payload handling, unresolved-item workflows, and run-state telemetry.

## Provides
- `INT-INGEST-v1`: normalized ingest envelope contract.
- `INT-CONNECTOR-v2`: connector runtime, retry, and run-log contract.
- `INT-IDEMPOTENCY-v2`: external key and dedupe semantics.

## Consumes
- `OPS-WORKCENTER-v1` and `OPS-ROUTING-v1` for mapping context.
- `QUAL-TRACE-v1` for downstream traceability linkage.
- `PLAT-DEPLOY-v1` for scheduler/runtime policy.

## Versioning Policy
- Upstream adapter-specific mapping remains isolated from canonical ingest contracts.

## Done Criteria
- Partial-failure behavior deterministic and documented.
- Reprocessing and replay behavior tested.
- Unresolved-item handoff remains operator/admin actionable.
