# On-Prem Install Runbook (`PLAT-DEPLOY-v1`)

Implements BL-019 and BL-020.

## Prerequisites
- OS with Bash and curl.
- Node.js + npm available in PATH.
- PostgreSQL client utilities available in PATH:
  - `psql`
  - `pg_dump`
  - `pg_restore`
- Local PostgreSQL database provisioned for InspectFlow.

## Packaging Artifacts
- Environment template: `deploy/onprem/.env.example`
- Install script: `deploy/onprem/install.sh`
- Runtime scripts:
  - `deploy/onprem/start.sh`
  - `deploy/onprem/stop.sh`
  - `deploy/onprem/healthcheck.sh`
  - `deploy/onprem/rollback.sh`
- Offline update scripts:
  - `deploy/onprem/create-update-bundle.sh`
  - `deploy/onprem/verify-update-bundle.sh`
  - `deploy/onprem/preflight-update.sh`
  - `deploy/onprem/apply-update-bundle.sh`

## Install Procedure
1. Copy `deploy/onprem/.env.example` to `deploy/onprem/.env`.
2. Update required values (`DATABASE_URL`, ports, auth defaults).
3. Run install:
   - `npm run deploy:onprem:install`
4. Start services:
   - `npm run deploy:onprem:start`
5. Verify service health:
   - `npm run deploy:onprem:health`

## Startup and Runtime
- Backend starts on `BACKEND_PORT` (default `4000`).
- Frontend uses Vite preview on `FRONTEND_PORT` (default `4173`).
- Runtime PIDs:
  - `var/runtime/pids/backend.pid`
  - `var/runtime/pids/frontend.pid`
- Runtime logs:
  - `var/log/backend.log`
  - `var/log/frontend.log`

## Health Checks
- Backend endpoint: `GET /health` should return `{ ok: true, service: "inspectflow-backend" }`.
- Frontend endpoint should return HTTP `200`.
- Scripted health check:
  - `npm run deploy:onprem:health`

## Rollback Procedure
1. Identify a known-good backup directory under `var/backups`.
2. Execute rollback with backup source:
   - `npm run deploy:onprem:rollback -- <backup-directory>`
3. Rollback script:
   - stops services
   - restores database from backup
   - restarts services
   - executes health checks

## Signed Offline Update Workflow (BL-020)
1. Configure signing settings in `deploy/onprem/.env`:
   - `INSPECTFLOW_UPDATE_SIGNING_KEY_FILE` (preferred)
   - or `INSPECTFLOW_UPDATE_SIGNING_KEY`
2. Build a signed bundle on the source system:
   - `npm run deploy:onprem:update:bundle:create -- <output-directory> --release-id <release-id>`
3. Transfer the bundle directory to the target system over approved offline media.
4. Verify bundle signature and checksums on target:
   - `npm run deploy:onprem:update:bundle:verify -- <bundle-directory>`
5. Run preflight checks on target:
   - `npm run deploy:onprem:update:preflight -- <bundle-directory>`
6. Apply update (auto-backup + rollback-on-failure):
   - `npm run deploy:onprem:update:apply -- <bundle-directory>`

### Update Safety Behavior
- `apply-update-bundle.sh` always creates a backup before applying payload changes.
- If extraction, migration, build, startup, or health checks fail, rollback is invoked automatically.
- `deploy:onprem:rollback` remains available for manual rollback at any time.

### Validation Evidence Commands
- Help and usage checks:
  - `bash deploy/onprem/create-update-bundle.sh --help`
  - `bash deploy/onprem/verify-update-bundle.sh --help`
  - `bash deploy/onprem/preflight-update.sh --help`
  - `bash deploy/onprem/apply-update-bundle.sh --help`
- Non-destructive dry run:
  - `bash deploy/onprem/apply-update-bundle.sh <bundle-directory> --dry-run`

## Operational Notes
- Keep `ALLOW_LEGACY_ROLE_HEADER=false` in production.
- Keep backup automation enabled (`scripts/backup`).
- Store environment files and backup roots on customer-controlled infrastructure.
