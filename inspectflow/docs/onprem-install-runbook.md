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
  - `deploy/onprem/run-operator-flow.sh`
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
4. Prepare or identify a known-good rollback backup under `var/backups`.
5. Run the single operator sequence:
   - `bash deploy/onprem/run-operator-flow.sh <bundle-directory> --rollback-dir <backup-directory>`

## Single Operator Flow
Use the wrapper when an operator needs one preflight -> start/health -> rollback-ready path instead of hopping between scripts.

Command:
- `bash deploy/onprem/run-operator-flow.sh <bundle-directory> --rollback-dir <backup-directory>`

Behavior:
- runs `deploy/onprem/preflight-update.sh`
- runs `deploy/onprem/start.sh`
- runs `deploy/onprem/healthcheck.sh`
- confirms rollback readiness and prints the exact `deploy/onprem/rollback.sh` command for the chosen backup

Notes:
- `--rollback-dir` is recommended because it pins the exact backup artifact to use if recovery is needed.
- If `--rollback-dir` is omitted, the script auto-detects the newest directory under `var/backups` and fails if none exists.
- The wrapper only reports success after preflight, startup, health, and rollback readiness all pass.

## Startup and Runtime
- Backend starts on `BACKEND_PORT` (default `4000`).
- Frontend uses Vite preview on `FRONTEND_PORT` (default `4173`).
- Import polling runs in the dedicated worker process (`npm run worker:imports --prefix backend`) with database advisory-lock leader semantics.
- Runtime PIDs:
  - `var/runtime/pids/backend.pid`
  - `var/runtime/pids/frontend.pid`
  - `var/runtime/pids/imports-worker.pid`
- Runtime logs:
  - `var/log/backend.log`
  - `var/log/frontend.log`
  - `var/log/imports-worker.log`

## Health Checks
- Backend endpoint: `GET /health` should return `{ ok: true, service: "inspectflow-backend" }`.
- Frontend endpoint should return HTTP `200`.
- Scripted health check:
  - `npm run deploy:onprem:health`
- Operator-flow verification:
  - `bash deploy/onprem/test-operator-flow.sh`

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
5. Run the single operator sequence for preflight, service startup, health, and rollback-ready confirmation:
   - `bash deploy/onprem/run-operator-flow.sh <bundle-directory> --rollback-dir <backup-directory>`
6. Apply update (auto-backup + rollback-on-failure):
   - `npm run deploy:onprem:update:apply -- <bundle-directory>`

### Update Safety Behavior
- `apply-update-bundle.sh` always creates a backup before applying payload changes.
- If extraction, migration, build, startup, or health checks fail, rollback is invoked automatically.
- `deploy:onprem:rollback` remains available for manual rollback at any time.

### Validation Evidence Commands
- Help and usage checks:
  - `bash deploy/onprem/run-operator-flow.sh --help`
  - `bash deploy/onprem/create-update-bundle.sh --help`
  - `bash deploy/onprem/verify-update-bundle.sh --help`
  - `bash deploy/onprem/preflight-update.sh --help`
  - `bash deploy/onprem/apply-update-bundle.sh --help`
- Non-destructive dry run:
  - `bash deploy/onprem/apply-update-bundle.sh <bundle-directory> --dry-run`
- Operator-flow regression check:
  - `bash deploy/onprem/test-operator-flow.sh`

## Operational Notes
- Keep `ALLOW_LEGACY_ROLE_HEADER=false` in production.
- Keep backup automation enabled (`scripts/backup`).
- Store environment files and backup roots on customer-controlled infrastructure.
