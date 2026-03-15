# Stream Contract: PLAT (Team Atlas)

## Scope
Platform foundations: auth, authorization enforcement, deployment/runtime reliability, backup/restore, update pipeline, and shared runtime safeguards.

## Provides
- `PLAT-AUTH-v1`: local account auth/session contract.
- `PLAT-AUTH-v1` optional extension: env-gated SSO session bootstrap path (`POST /api/auth/sso/login`) with local auth parity retained.
- `PLAT-ENT-v1`: entitlement and module-flag read contract.
- `PLAT-DEPLOY-v1`: install/health/preflight/update status contract.
- `PLAT-BACKUP-v1`: backup/restore execution and audit contract.

`PLAT-ENT-v1` API surface:
- `GET /api/auth/entitlements`: authenticated read contract for module gating consumers.
- `PUT /api/auth/entitlements`: admin policy update (`moduleFlags`, seat policy, diagnostics opt-in).

## Consumes
- `COMM-LICENSE-v1` for entitlement policy metadata.
- `OPS-WORKCENTER-v1` for audited work center action coverage.
- `OPS-ROUTING-v1` for audited routing action coverage.
- `OPS-JOBFLOW-v1` for audited job lifecycle action coverage.
- `QUAL-TRACE-v1` for coverage of audited actions.

## Versioning Policy
- Backward-compatible changes only inside a release.
- Breaking changes require next-release contract ID (for example `PLAT-AUTH-v2`).

## Done Criteria
- Contract documented and linked from backlog items.
- Security and rollback criteria validated.
- Test coverage includes failure mode handling.
- Auth events are auditable for login/session/password lifecycle transitions.
