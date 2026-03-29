# Stream Contract: OPS (Team Forge)

## Scope
Shop-floor workflows: jobs, operations, work centers, routing changes, operator entry ergonomics, and supervisor production control.

## Provides
- `OPS-WORKCENTER-v1`: work center master and assignment contract.
- `OPS-ROUTING-v1`: operation sequencing and reroute contract.
- `OPS-JOBFLOW-v1`: draft/incomplete/complete lifecycle control contract.
- `EDGE-SYNC-v1`: edge/standalone interoperability sync contract (`/api/edge-sync/contracts`, `/api/edge-sync/snapshot`, `/api/edge-sync/validate`) gated by EDGE module enablement.

## API Surface Notes
- `POST /api/operations/resequence`: re-sequences one or more operations for a part with revision trace updates.
- `POST /api/operations/:id/move`: moves an operation across parts/op numbers with source + target revision trace updates.
- Routing/work-center audit actors use authenticated identity role resolution (`PLAT-AUTH-v1`) with legacy header compatibility mode retained.

## Consumes
- `PLAT-AUTH-v1` and `PLAT-ENT-v1`.
- `QUAL-TRACE-v1` for traceability/audit overlays.

## Versioning Policy
- Preserve existing job and record workflow semantics unless explicitly versioned.

## Done Criteria
- Workflow behavior documented with state transitions.
- Supervisor/operator acceptance criteria covered in test matrix.
- Route and work center changes are auditable.
