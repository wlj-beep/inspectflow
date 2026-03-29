# Cloud Backup Environment Contract

## Purpose
This contract defines the backup environment variables for the cloud baseline. The current backup scripts still write locally first; object storage is the durable sync target.

## Shared Variables
- `BACKUP_ROOT`
  - Local filesystem path that receives backup directories.
  - Compose default: `/app/var/backups`
  - Helm default: `/app/var/backups`
- `BACKUP_LOG_FILE`
  - Structured JSON log file for backup runs.
  - Compose default: `/app/var/log/backup-workflow.log`
- `BACKUP_RETENTION_DAYS`
  - Local retention window used by the backup scripts and lifecycle policy.
  - Default: `14`
- `INSPECTFLOW_ENV_FILE`
  - Optional path that backup scripts source before running.
  - Set to `/dev/null` for containerized runs where all values are injected by the orchestrator.

## Object-Storage Sync Contract
Use the following provider-agnostic shape for the sync job:
- `BACKUP_STORAGE_PROVIDER`
  - `s3` or `azure-blob`
- `BACKUP_STORAGE_BUCKET_OR_CONTAINER`
  - Bucket name for S3-compatible targets.
  - Container name for Azure Blob targets.
- `BACKUP_STORAGE_PREFIX`
  - Object prefix inside the bucket/container.
  - Use a tenant-specific prefix, for example `inspectflow/prod`.
- `BACKUP_STORAGE_REGION`
  - Region name for the target storage account.
  - For sovereign clouds, use the sovereign region name, not the commercial default.
- `BACKUP_STORAGE_ENDPOINT`
  - Optional custom endpoint for GovCloud, Azure Government, or S3-compatible storage.
- `BACKUP_STORAGE_PATH_STYLE`
  - `true` when the target requires path-style addressing.
- `BACKUP_STORAGE_TLS_VERIFY`
  - `true` for normal production, `false` only for controlled break-glass validation.

## Credentials
Prefer workload identity over static secrets:
- AWS
  - Use an IAM role attached to the compute runtime when possible.
  - Fallbacks: `BACKUP_STORAGE_ACCESS_KEY_ID`, `BACKUP_STORAGE_SECRET_ACCESS_KEY`, `BACKUP_STORAGE_SESSION_TOKEN`.
- Azure
  - Use managed identity when possible.
  - Fallbacks: `BACKUP_STORAGE_ACCOUNT_NAME`, `BACKUP_STORAGE_SAS_TOKEN`.

## Encryption and Retention
- Use a KMS-managed key or customer-managed key for the object store.
- Keep the bucket/container private.
- Enable versioning where the provider supports it.
- Apply lifecycle expiration that matches or exceeds `BACKUP_RETENTION_DAYS`.

## Operational Flow
1. Run the local backup script to create a backup directory under `BACKUP_ROOT`.
2. Verify the restore locally before syncing.
3. Sync the backup directory to object storage.
4. For a restore, pull the backup directory from object storage first, then run the restore script.

## Example AWS Shape
```bash
BACKUP_STORAGE_PROVIDER=s3
BACKUP_STORAGE_BUCKET_OR_CONTAINER=inspectflow-prod-backups
BACKUP_STORAGE_PREFIX=inspectflow/prod
BACKUP_STORAGE_REGION=us-gov-west-1
BACKUP_STORAGE_ENDPOINT=https://s3.us-gov-west-1.amazonaws.com
BACKUP_STORAGE_PATH_STYLE=false
BACKUP_STORAGE_TLS_VERIFY=true
```

## Example Azure Shape
```bash
BACKUP_STORAGE_PROVIDER=azure-blob
BACKUP_STORAGE_BUCKET_OR_CONTAINER=inspectflowprodbackups
BACKUP_STORAGE_PREFIX=inspectflow/prod
BACKUP_STORAGE_REGION=usgovvirginia
BACKUP_STORAGE_ENDPOINT=https://inspectflowprodbackups.blob.core.usgovcloudapi.net
BACKUP_STORAGE_TLS_VERIFY=true
```
