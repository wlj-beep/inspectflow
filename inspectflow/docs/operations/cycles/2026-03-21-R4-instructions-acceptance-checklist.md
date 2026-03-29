# R4 Instructions Workflow Acceptance Checklist (2026-03-21)

- Scope: `BL-075` versioned work/measurement instructions and operator acknowledgment tracking.
- Runner: `npm run test:r4:instructions`
- Evidence log: `docs/operations/cycles/evidence/2026-03-21-r4-instructions-acceptance-matrix.txt`

## Acceptance Gates

- [x] Coordination gate passes (`npm run test:coordination`).
- [x] Backend test DB setup passes (`npm run db:test:setup --prefix backend`).
- [x] Instruction versioning contract suite passes (`backend/test/instruction-versions.test.js`).
- [x] Permission boundary suite passes with instruction/attachment auth checks (`backend/test/permissions.test.js`).
- [x] Frontend mocked operator/admin instruction flows pass (`frontend/tests/mocked.smoke.spec.js`, instruction + mock coverage).

## Notes

- Backend endpoints now support operation-level instruction version history, draft updates, publish promotion, and operator acknowledgment for job/record contexts.
- Frontend operator flow enforces instruction acknowledgment before submit when required.
- Admin flow supports creating/publishing instruction versions with media links from Part/Op setup.
