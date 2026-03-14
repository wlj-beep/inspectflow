# Frontend Agent Notes

Parallel frontend workstream has started.

## Current State
- Demo UI copied into new workspace as baseline.
- App now enforces auth-aware shell entry and renders legacy UI in authenticated mode.
- BL-028 modularization slice landed for `OPS-JOBFLOW-v1`:
  - domain constants extracted to `frontend/src/domains/jobflow/constants.js`,
  - API-to-view mappers extracted to `frontend/src/domains/jobflow/mappers.js`,
  - stable domain adapter extracted to `frontend/src/domains/jobflow/adapter.js`,
  - legacy shell bootstrap/session flows rewired through the domain adapter.

## Files
- `frontend/src/legacy/InspectFlowDemo.jsx`
- `frontend/src/App.jsx`
- `frontend/src/domains/jobflow/constants.js`
- `frontend/src/domains/jobflow/mappers.js`
- `frontend/src/domains/jobflow/adapter.js`

## Next Steps
- Continue splitting legacy UI domains into focused component modules (`operator`, `records`, `admin`).
- Move remaining mutation handlers onto domain adapter surfaces to reduce direct endpoint coupling.
- Decompose shared utility logic from legacy shell into domain-level libraries.
