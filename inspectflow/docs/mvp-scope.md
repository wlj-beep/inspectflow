# R1 Scope (Former MVP Scope)

This file defines the R1 foundation release scope and forward-compatibility boundaries.

## Included in R1
- Secure local auth/session foundation replacing role-header trust as a security boundary.
- Operator, supervisor, quality, and admin workflows with full traceability and audit lineage.
- Work center and operation-routing controls suitable for production setup governance.
- Per-piece comments and quantity-adjustment history for production and quality context.
- CSV exports and starter AS9102-oriented quality output templates.
- Server-first on-prem deployment path with browser/PWA clients.
- Offline-capable update process and automated local backup/restore workflows.
- Soft commercial entitlement and seat visibility controls.

## Explicitly Deferred Beyond R1
- Advanced analytics suites and KPI intelligence (R3).
- Full multi-site aggregation and governance (R3).
- Extension SDK and partner ecosystem surfaces (R4).
- Optional hard-seat enforcement modes as paid controls (R2+).

## Forward-Compatibility Constraints
- R1 changes must preserve additive contracts for R2/R3 expansion.
- No schema or API changes that block moduleized quality/integration/analytics additions.
- Core data flows must remain stable under module enable/disable scenarios.
