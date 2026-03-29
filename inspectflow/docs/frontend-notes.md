# Frontend Agent Notes

Parallel frontend workstream has started.

## Current State
- Frontend now centers on `frontend/src/App.jsx` and domain modules under `frontend/src/domains/**`.
- `frontend/src/legacy/InspectFlowDemo.jsx` has been retired from active ownership as part of BL-077 migration/removal.
- BL-028 modularization slice landed for `OPS-JOBFLOW-v1`:
  - domain constants extracted to `frontend/src/domains/jobflow/constants.js`,
  - API-to-view mappers extracted to `frontend/src/domains/jobflow/mappers.js`,
  - stable domain adapter extracted to `frontend/src/domains/jobflow/adapter.js`,
  - shell bootstrap/session flows rewired through the domain adapter.

## Files
- `frontend/src/App.jsx`
- `frontend/src/domains/jobflow/constants.js`
- `frontend/src/domains/jobflow/mappers.js`
- `frontend/src/domains/jobflow/adapter.js`

## Next Steps
- Continue splitting frontend UI domains into focused component modules (`operator`, `records`, `admin`).
- Move remaining mutation handlers onto domain adapter surfaces to reduce direct endpoint coupling.
- Decompose shared utility logic from the app shell into domain-level libraries.
