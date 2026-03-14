# InspectFlow Product Charter

## Purpose
Build and operate a local-first manufacturing inspection platform that is commercially sellable as a perpetual business product while preserving strict customer data control.

## Product Direction
- Pivot and extend the current codebase rather than rewrite from scratch.
- Deliver in release waves (`R1`, `R2`, `R3`, `R4`) with explicit compatibility gates.
- Keep core workflows stable while adding paid expansion modules.

## Release Objectives
- `R1`: commercialization foundation, traceability/compliance depth, deployment/update/backup reliability.
- `R2`: enterprise quality and integration hardening.
- `R3`: analytics and multi-site intelligence controls.
- `R4`: platform and ecosystem extensibility.

## Commercial Defaults
- Per-site perpetual core license.
- Seat-pack commercial packaging.
- R1 soft seat enforcement only (warnings/visibility/audit, no hard lockouts).
- Perpetual core updates included.
- Major paid modules and editions sold separately.

## Users and Operational Roles
- Operator: execute measurement workflows and report production issues.
- Supervisor: review and correct submissions, manage production continuity.
- Quality: verify measurement correctness, run traceability and quality outputs.
- Admin/Engineer: configure setup/routing/users/roles and govern system integrity.

## Success Criteria
1. Customers can run the system fully within their own network, including offline scenarios.
2. Traceability, correction lineage, and export outputs are production-ready.
3. Deployment, update, backup, and restore workflows are reliable and supportable.
4. Release-to-release changes preserve compatibility and reduce operational risk.
5. Parallel team delivery is possible through explicit stream ownership and contracts.

## Non-Negotiable Constraints
- Customer production data remains customer-controlled.
- Diagnostics telemetry is strict opt-in and excludes measurement payloads.
- Core product updates remain available without subscription requirement.
- Paid modules cannot compromise core workflow stability.
