# Backup & Restore Runbook (`PLAT-BACKUP-v1`)

Implements BL-021.

## Scripts
- `scripts/backup/backup.sh`: create point-in-time backup and apply retention pruning.
- `scripts/backup/restore.sh <backup-dir>`: restore backup into target `DATABASE_URL`.
- `scripts/backup/verify-restore.sh <backup-dir>`: restore into ephemeral verification DB and run sanity checks.
- `scripts/backup/run-scheduled-backup.sh`: run backup + restore verification cycle.

## Auditable Logging
- All backup workflow scripts append structured JSON lines to:
  - `var/log/backup-workflow.log`
- Log fields include:
  - UTC timestamp
  - action
  - status
  - message
  - details

## Retention Defaults
- `BACKUP_RETENTION_DAYS=14` by default.
- `backup.sh` prunes backup directories older than the retention window.
- Retention is configurable via environment.

## Manual Operations
- Create backup:
  - `npm run backup:create`
- Verify restore integrity:
  - `npm run backup:verify -- <backup-directory>`
- Restore backup:
  - `npm run backup:restore -- <backup-directory>`

## Scheduled Operations
- Recommended scheduler target:
  - `npm run backup:run-scheduled`
- Cron example (daily at 01:30 local time):
  - `30 1 * * * cd /path/to/inspectflow && npm run backup:run-scheduled >> var/log/backup-cron.log 2>&1`

## Restore Verification Behavior
- `verify-restore.sh` creates a temporary verification database.
- Restores the selected backup into the temporary DB.
- Validates baseline table integrity (`users`, `jobs`, `records`, `part_setup_revisions` counts).
- Drops temporary verification DB on completion/failure.

## Recommended Restore Drill
1. Run `npm run backup:create`.
2. Run `npm run backup:verify -- <new-backup-dir>`.
3. Review `var/log/backup-workflow.log` for `status:"ok"` entries.
4. Record run in release evidence checklist.
