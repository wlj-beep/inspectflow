# Future Foundations (R2/R3 Safe Scaffolding)

This folder contains standalone forward-looking foundations created by Agent C (Future Lab).

## Included backlog mappings
- `BL-031` / `BL-032`: integration connector policy + idempotency contracts
- `BL-034` / `BL-035`: first-article/export profile engine scaffolding
- `BL-039` / `BL-040` / `BL-042`: analytics mart/KPI/anomaly scaffolding + quality escalation bridge

## Reconciliation Docs
- `ANA-v3-vocabulary-map.md`: canonical ANA mart/KPI field vocabulary alignment across analytics scaffold families.

## Safety constraints
- Disabled by default.
- No runtime route wiring in current production paths.
- No destructive schema changes.
- SQL here is draft-only and additive.

## Authoritative path
- Active scaffolding path: `backend/src/services/*`.
- Legacy/experimental path retained for incubator snapshots: `backend/src/future/*`.

## Implementation locations
- Active scaffolding: `backend/src/services/integration/*`, `backend/src/services/idempotency/*`, `backend/src/services/observability/*`, `backend/src/services/analytics/*`
- Legacy/experimental scaffolding retained: `backend/src/future/integration/*`, `backend/src/future/quality/*`, `backend/src/future/analytics/*`
- Tests: `backend/test/integration-*.test.js`, `backend/test/analytics-*.test.js`, `backend/test/future-*.test.js`
