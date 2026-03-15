# Release Test Plan

This plan governs acceptance from R1 through R4 and defines standardized test tiers that gate delivery.

## Standardized Test Tiers
Tier 0: Coordination gate
- Command: `npm run test:coordination`
- Purpose: queue integrity and dependency hygiene

Tier 1: API regression gate
- Command: `npm run test:api`
- Purpose: auth, permissions, workflow, and data contract regressions

Tier 2: UI mock regression gate
- Command: `npm run test:ui:mock`
- Purpose: UI workflow coverage with mocked APIs for fast feedback

Tier 3: UI live critical-path gate
- Command: `npm run test:ui:live`
- Purpose: end-to-end operator/admin flow that persists to the database
- Note: gate script prepares test DB and starts/stops the local API automatically

Standardized gate (required before release promotion):
- Command: `npm run test:standardized`

R1 acceptance matrix automation (required for BL-030 release closure):
- Command: `npm run test:r1:acceptance`
- Evidence artifact: `docs/operations/cycles/evidence/<YYYY-MM-DD>-r1-acceptance-matrix.txt`

## Release Acceptance Matrix

| Release | Required Suites | Gate Condition |
| --- | --- | --- |
| R1 | Security/auth regression, workflow regression, export regression, deployment backup/restore checks | All R1 critical paths pass with core module only |
| R2 | R1 suites + integration reliability suite + enterprise quality export suite | R2 modules pass without breaking R1 core |
| R3 | R1/R2 suites + analytics correctness suite + multi-site boundary suite | KPI and partition controls meet defined SLOs |
| R4 | Full matrix + extension compatibility suite | Platform extensions do not regress core or prior modules |

## Cross-Module Regression Policy
Run matrix dimensions for every release candidate:
1. CORE only
2. CORE + QUALITY_PRO
3. CORE + INTEGRATION_SUITE
4. CORE + QUALITY_PRO + INTEGRATION_SUITE
5. CORE + ANALYTICS_SUITE (R3+)
6. CORE + MULTISITE + ANALYTICS_SUITE (R3+)

## R1 Manual Acceptance Scenarios
1. Auth/session and role authorization behavior.
2. Operator end-to-end submission (manual and CSV-assisted paths).
3. Supervisor correction with complete audit lineage.
4. Quality traceability query by job/part/lot/piece and CSV export output.
5. Work center and operation routing management with revision history.
6. Local backup, restore, and offline update dry run.
7. Entitlement soft controls visibility and audit logging.

## Existing Functional Coverage (Retained)
- Capability enforcement across CRUD/workflow endpoints.
- Job lock ownership and force unlock controls.
- Submission validation for OOT comments and references.
- Revision progression and historical lookup.
- Import pathways: tools, part dimensions, jobs, measurements, unresolved manual resolution.

## Evidence Requirements Per Release Candidate
- CI run artifacts for standardized gates.
- Explicit pass/fail log for each tiered gate (`test:coordination`, `test:api`, `test:ui:mock`, `test:ui:live`).
- Manual execution checklist with role, input, expected result, and observed result.
- Export sample outputs and verification notes.
- Backup/restore and update workflow logs.
- Open defects list with release disposition.

## Failure Handling
- Any critical-path failure blocks release promotion.
- Known non-critical issues require documented risk acceptance and owner/date commitments.
