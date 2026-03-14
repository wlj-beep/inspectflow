# Stream Contract: OPS (Team Forge)

## Scope
Shop-floor workflows: jobs, operations, work centers, routing changes, operator entry ergonomics, and supervisor production control.

## Provides
- `OPS-WORKCENTER-v1`: work center master and assignment contract.
- `OPS-ROUTING-v1`: operation sequencing and reroute contract.
- `OPS-JOBFLOW-v1`: draft/incomplete/complete lifecycle control contract.

## Consumes
- `PLAT-AUTH-v1` and `PLAT-ENT-v1`.
- `QUAL-TRACE-v1` for traceability/audit overlays.

## Versioning Policy
- Preserve existing job and record workflow semantics unless explicitly versioned.

## Done Criteria
- Workflow behavior documented with state transitions.
- Supervisor/operator acceptance criteria covered in test matrix.
- Route and work center changes are auditable.
