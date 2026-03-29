# BL-093 Frontend Migration Map

## Completed in this tranche
- `InspectFlowApp.jsx` helper de-duplication:
  - `fmtTs`, `normalizeOpNumber`, `revisionCodeToIndex`, `nextRevisionCode` moved to `src/shared/utils/jobflowCore.ts`.
- Shared component extraction:
  - `TypeBadge` -> `src/shared/components/TypeBadge.jsx`
  - `TableSkeletonRows` -> `src/shared/components/TableSkeletonRows.jsx`
  - `DataModeBanner` -> `src/shared/components/DataModeBanner.jsx`
  - `ToastStack` -> `src/shared/components/ToastStack.jsx`
- State boundary extraction:
  - transition toast orchestration moved to `src/domains/jobflow/hooks/useTransitionToasts.js`.
- Hardcoded seed removal in UI bootstrap:
  - removed baked-in initial parts/jobs/records/tools from app init.
  - added explicit empty defaults + `buildFallbackUsers(authUser)` in `src/domains/jobflow/domainConfig.js`.
- Quality gates introduced:
  - `frontend` scripts: `typecheck`, `lint`, `format`, `format:check`, `precommit`.
  - root scripts: `typecheck`, `lint`, `format:check`, `precommit`.
  - strict TS config: `frontend/tsconfig.json`.

## Next migration steps
- Move major admin/operator subviews from `InspectFlowApp.jsx` into domain-owned files by feature area (`admin/jobs`, `admin/records`, `operator/entry`, etc.).
- Introduce typed domain state interfaces and migrate high-risk state transitions to `.ts` modules.
- Replace test fixture ID-coupling in `frontend/tests/mocked.smoke.spec.js` with factories that assert labels/behavior instead of specific IDs.
- Add targeted unit tests for `jobflowCore` and extracted hook/component modules.
