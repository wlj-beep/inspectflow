# Stream Contract: PLAT (Team Atlas)

## Scope
Platform foundations: auth, authorization enforcement, deployment/runtime reliability, backup/restore, update pipeline, and shared runtime safeguards.

## Provides
- `PLAT-AUTH-v1`: local account auth/session contract.
- `PLAT-ENT-v1`: entitlement and module-flag read contract.
- `PLAT-DEPLOY-v1`: install/health/preflight/update status contract.
- `PLAT-BACKUP-v1`: backup/restore execution and audit contract.

## Consumes
- `COMM-LICENSE-v1` for entitlement policy metadata.
- `OPS-DOMAIN-v1` and `QUAL-TRACE-v1` for coverage of audited actions.

## Versioning Policy
- Backward-compatible changes only inside a release.
- Breaking changes require next-release contract ID (for example `PLAT-AUTH-v2`).

## Done Criteria
- Contract documented and linked from backlog items.
- Security and rollback criteria validated.
- Test coverage includes failure mode handling.
