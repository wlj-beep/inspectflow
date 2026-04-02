# R1 Acceptance Matrix - 2026-03-31-C7

This artifact closes the BL-030 release-evidence tranche for the current session.

## Standardized Gate Coverage
- `npm run test:coordination`
- `npm run test:api`
- `npm run test:ui:mock`
- `npm run test:ui:live`
- `npm run test:standardized`

## R1 Manual Acceptance Checklist
1. Auth/session and role authorization behavior.
   - Covered by `backend/test/auth*.test.js` and the standardized API/UI gates.
2. Operator end-to-end submission, manual and CSV-assisted.
   - Covered by import and record-path regression suites.
3. Supervisor correction with complete audit lineage.
   - Covered by workflow and audit regression suites.
4. Quality traceability query and CSV export output.
   - Covered by quality trace/export regression suites.
5. Work center and routing management with revision history.
   - Covered by ops workflow regression suites.
6. Local backup, restore, and offline update dry run.
   - Covered by release and on-prem scripts in `deploy/onprem` and `scripts/backup`.
7. Entitlement soft controls visibility and audit logging.
   - Covered by auth/entitlements regression suites and the standardized UI gate.

## Release Evidence
- `STATUS.md` seeds the active queue for the tranche.
- `WORKLOG.md` records the completed items after closure.
- `scripts/release/run-commercialization-rc-gate.sh` and its self-test enforce the dependency evidence path for BL-084, BL-085, and BL-091.
- `docs/quality-export-runbook.md` now matches the non-perfect pass-rate semantics used by the AS9102 export tests.

## Notes
- The matrix is intentionally aligned to the long-form acceptance coverage already documented in `docs/test-plan.md`.
- This cycle artifact exists to keep the manual checklist and automated gate evidence in one place for the tranche record.
