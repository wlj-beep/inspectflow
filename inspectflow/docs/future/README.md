# Future Foundations (R2/R3 Safe Scaffolding)

This folder contains standalone forward-looking foundations created by Agent C (Future Lab).

## Included backlog mappings
- `BL-031` / `BL-032`: integration connector policy + idempotency contracts
- `BL-034` / `BL-035`: first-article/export profile engine scaffolding
- `BL-039` / `BL-040` / `BL-042`: analytics mart/KPI/anomaly scaffolding

## Safety constraints
- Disabled by default.
- No runtime route wiring in current production paths.
- No destructive schema changes.
- SQL here is draft-only and additive.

## Implementation locations
- `backend/src/future/integration/*`
- `backend/src/future/quality/*`
- `backend/src/future/analytics/*`
- `backend/test/future-*.test.js`
