# Deployment Governance Plan

## Purpose
Define release controls for safe delivery from R1 through R4.

## Baseline Required Checks
1. `npm run coordination:check`
2. `npm run test:api`
3. `npm run test:ui`
4. Release-specific manual checks from `docs/test-plan.md`

## Delivery Modes
- `PR Mode` (default): merge through pull requests on protected `main`.
- `Solo Offline Direct Push Mode` (optional): direct push to `main` permitted for a single maintainer.

If Direct Push Mode is enabled, keep baseline required checks mandatory before each push.

## Change Classes
- Standard: low-risk, no contract changes.
- Normal: behavior or data-impacting change.
- High impact: security, deployment/update, backup/restore, or contract-version change.

## Release Gates

### R1 Gate
- Auth/session enforcement active.
- Backup/restore and offline update workflow validated.
- Core traceability/export acceptance complete.

### R2 Gate
- R1 gate remains green.
- Integration reliability and enterprise quality suites pass.
- Contract compatibility maintained for R1 consumers.

### R3 Gate
- R1/R2 gates remain green.
- Analytics correctness and multi-site boundary suites pass.

### R4 Gate
- Full matrix (core + modules + extensions) passes.
- Extension compatibility and rollback paths validated.

## Rollback Policy
- Every production-impacting change must include rollback steps.
- Contract-affecting releases require version rollback compatibility notes.
- Data migrations require restore-tested fallback before release approval.

## Evidence and Records
- Record release evidence in PR and worklog references.
- Capture risk waivers with owner and expiration date.
- Keep release notes aligned with enabled modules and contract versions.
