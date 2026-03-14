# Backup & Data Certainty Plan

## MVP
- All submissions and edits are durable writes to Postgres.
- Manual export available (CSV/PDF or JSON) to support customer IT backups.

## Production Requirement
- Automated local backups to a customer-controlled location.
- Backups triggered on schedule and/or critical events.
- Restore procedure documented and tested.

## Implemented Workflow (R1)
- See `backup-restore-runbook.md` for operational script details.
- Script package (`scripts/backup/`) provides:
  - backup creation with retention pruning,
  - restore execution,
  - restore verification against temporary database,
  - structured audit logging to `var/log/backup-workflow.log`.
