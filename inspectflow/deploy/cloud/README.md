# Cloud Deployment Baseline

This directory holds the starter artifacts for the BL-119 single-tenant cloud path.

## What Is Here
- `docker-compose.yml`: local or VM-style baseline with PostgreSQL, backend, frontend, and an optional local backup runner.
- `backend.Dockerfile`: backend runtime image with the backup scripts and PostgreSQL client tools included.
- `frontend.Dockerfile`: SPA image with Caddy serving the app and proxying `/api/*` to the backend.
- `Caddyfile`: public-edge config for the frontend image.
- `.env.example`: starter environment contract for the compose path.
- `helm/`: Kubernetes chart scaffold for a managed-database deployment.
- `terraform/`: cloud primitives scaffold for database and encrypted backup storage.

## Compose Path
1. Copy `.env.example` into a local env file or export the variables in your shell.
   - Example: `cp deploy/cloud/.env.example deploy/cloud/.env`
2. Set the required values:
   - `POSTGRES_PASSWORD`
   - `AUTH_TOKEN_PEPPER`
   - `CLOUD_CADDY_SITE`
   - `CLOUD_PUBLIC_ORIGIN`
3. Start the stack:
   - `docker compose --env-file deploy/cloud/.env -f deploy/cloud/docker-compose.yml up -d --build`
4. Check the public health endpoint:
   - `curl -fsS http://localhost:8080/health`
5. Run a local backup cycle:
   - `docker compose --env-file deploy/cloud/.env -f deploy/cloud/docker-compose.yml --profile backup run --rm backup`

## Helm Path
- Use the chart in `deploy/cloud/helm/` when the workload runs behind Kubernetes ingress and a managed PostgreSQL database.
- The chart assumes the frontend image serves the SPA and proxies `/api/*` to the backend service.
- The chart includes a scheduled backup job that writes into a shared runtime PVC.

## Terraform Path
- Use the module in `deploy/cloud/terraform/` to provision:
  - encrypted database and backup KMS keys
  - a private S3 backup bucket
  - PostgreSQL database and security group wiring
- Feed the Terraform outputs into the Helm and backup env contracts.

## Runtime Notes
- `CLOUD_CADDY_SITE` controls the frontend edge listener. Use `:80` for internal HTTP or a real host name for TLS-enabled public access.
- `AUTH_COOKIE_SECURE` must be `true` once the public edge is on HTTPS.
- `INSPECTFLOW_SEED_ON_INSTALL` should be left `true` only for the first boot, then set to `false`.
- Keep `FRONTEND_ORIGIN` exact. It must match the public origin used by browsers.
