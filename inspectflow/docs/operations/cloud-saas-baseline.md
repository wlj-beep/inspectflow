# Cloud/SaaS Deployment Baseline (`PLAT-CLOUD-v1`)

## Purpose
This baseline defines the practical starter shape for single-tenant cloud deployments of InspectFlow. It keeps the deployment model explicit: one tenant, one database, one public edge, one backup pipeline, and a clear first-run admin bootstrap flow.

## Artifact Map
- `deploy/cloud/docker-compose.yml`: VM-friendly baseline for local validation and small single-tenant runs.
- `deploy/cloud/helm/`: Kubernetes deployment path with managed PostgreSQL and ingress TLS.
- `deploy/cloud/terraform/`: infrastructure scaffold for encrypted database and backup storage.
- `docs/operations/cloud-backup-env-contract.md`: backup and object-storage environment contract.
- `docs/operations/cloud-first-run-admin-checklist.md`: first-run bootstrap checklist.
- `docs/operations/cloud-gov-cloud-notes.md`: AWS GovCloud and Azure Government deployment notes.

## Baseline Topology
1. Public edge
   - Compose path: Caddy terminates or forwards traffic at the frontend image.
   - Helm path: Kubernetes ingress terminates TLS and forwards to the frontend service.
2. Application tier
   - Backend API runs as a separate service and talks only to PostgreSQL.
   - Frontend serves the SPA and forwards `/api/*` to the backend.
3. Data tier
   - Compose path uses bundled PostgreSQL for the starter stack.
   - Helm/Terraform path expects a managed PostgreSQL instance.
4. Backup tier
   - Backups are created locally first.
   - Object storage is the durable off-box target.
5. Bootstrap tier
   - `S. Admin` from seed data is the first login path.
   - Temporary bootstrap values are rotated immediately after first sign-in.

## Runtime Contract
Required values for a production-grade single-tenant deployment:
- `DATABASE_URL`
- `FRONTEND_ORIGIN`
- `AUTH_TOKEN_PEPPER`
- `AUTH_COOKIE_SECURE`
- `AUTH_COOKIE_SAMESITE`
- `AUTH_SESSION_TTL_HOURS`
- `INSPECTFLOW_DEFAULT_PASSWORD`
- `INSPECTFLOW_SEED_ON_INSTALL`
- `BACKUP_ROOT`
- `BACKUP_LOG_FILE`
- `BACKUP_RETENTION_DAYS`

Recommended production defaults:
- `AUTH_COOKIE_SECURE=true`
- `AUTH_COOKIE_SAMESITE=lax` for same-origin deployments
- `INSPECTFLOW_SEED_ON_INSTALL=false` after the first run
- `AUTH_LOGIN_RATE_LIMIT_MAX=10`
- `AUTH_LOGIN_RATE_LIMIT_WINDOW_MS=900000`

## Validation Steps
1. Bring the stack up.
2. Confirm `GET /health` returns `{ ok: true, service: "inspectflow-backend" }`.
3. Sign in with the initial admin account.
4. Rotate the initial admin password.
5. Create or confirm a production admin owner account.
6. Run a backup cycle and confirm a restore verification passes.
7. Move the environment from bootstrap mode to steady-state mode.

## Non-Goals
- No multi-tenant control plane.
- No application route changes.
- No schema changes.
- No hidden auth shortcuts. The deployment env must match the app runtime contract.
