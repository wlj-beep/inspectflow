# On-Prem Install Runbook (`PLAT-DEPLOY-v1`)

Implements BL-019.

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

## Operational Notes
- Keep `ALLOW_LEGACY_ROLE_HEADER=false` in production.
- Keep backup automation enabled (`scripts/backup`).
- Store environment files and backup roots on customer-controlled infrastructure.
