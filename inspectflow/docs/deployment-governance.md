# Deployment Governance Plan

## Purpose
Define release controls for safe delivery from R1 through R4.

## Baseline Required Checks
1. `npm run release:path`
   - Runs `test:coordination`, `test:api`, `test:ui:mock`, `test:ui:live`, `gate:commercialization:load`, `gate:commercialization:rc`, and `ops:cycle:report:auto` in order.
   - Publishes a consolidated evidence bundle at `docs/operations/cycles/evidence/<timestamp>-release-path/`.
   - Writes a bundle manifest to `docs/operations/cycles/evidence/<timestamp>-release-path/manifest.md`.
2. Release-specific manual checks from `docs/test-plan.md`
3. Latest multi-agent run report shows no unresolved Red rows for in-scope BL IDs
4. Commercialization RC prerequisites remain mandatory when the release path runs:
   - `BL-084`, `BL-085`, and `BL-091` must already be marked completed before the RC gate closes.

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
- Signed bundle verification and update preflight checks pass before apply.
- Core traceability/export acceptance complete.
- No unresolved Red findings for R1 items in the latest multi-agent report.

### R2 Gate
- R1 gate remains green.
- Integration reliability and enterprise quality suites pass.
- Contract compatibility maintained for R1 consumers.
- Latest multi-agent report confirms no unresolved Red findings for promoted R2 items.

### R3 Gate
- R1/R2 gates remain green.
- Analytics correctness and multi-site boundary suites pass.
- Latest multi-agent report confirms no unresolved Red findings for ANA/INT dependencies.

### R4 Gate
- Full matrix (core + modules + extensions) passes.
- Extension compatibility and rollback paths validated.
- Latest multi-agent report confirms no unresolved Red findings across core and extension contracts.

## Rollback Policy
- Every production-impacting change must include rollback steps.
- Contract-affecting releases require version rollback compatibility notes.
- Data migrations require restore-tested fallback before release approval.

## Evidence and Records
- Record release evidence in PR and worklog references.
- Capture risk waivers with owner and expiration date.
- Keep release notes aligned with enabled modules and contract versions.
- Attach latest multi-agent run report and closure evidence for release sign-off.
- For the automated release path, attach the bundle directory produced by `npm run release:path`, including:
  - `manifest.md`
  - `release-path.log`
  - per-step `*.log` files
  - `commercialization-load-gate.txt`
  - `commercialization-load-summary.json`
  - `commercialization-rc-gate.txt`
  - `cycle-report.md`
  - `release-path-usage.json`
- For BL-020 offline updates, include evidence for:
  - `deploy:onprem:update:bundle:verify`
  - `deploy:onprem:update:preflight`
  - `deploy:onprem:update:apply --dry-run` (or full apply in staging)
  - rollback proof using `deploy:onprem:rollback` with a known backup artifact

## Stop-the-Line Policy
- A `Red` gate freezes new starts for impacted BL IDs immediately.
- In-flight mitigation may continue only for Red-clearing actions.
- Gate can reopen to `Yellow` or `Green` only after mitigation evidence is verified.
- Policy and templates: `docs/operations/multi-agent-playbook.md`.
