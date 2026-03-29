# Helm Baseline

This chart is the Kubernetes path for the BL-119 cloud baseline.

## Assumptions
- A managed PostgreSQL database already exists.
- An ingress controller is installed.
- `cert-manager` or an equivalent TLS flow is available.
- The frontend container serves the SPA and proxies `/api/*` to the backend container.
- Backups are written to a shared runtime PVC and can be synced to object storage by an external job.

## Install
1. Copy `values.yaml` and replace the environment-specific values.
2. Install:
   - `helm install inspectflow ./deploy/cloud/helm -f my-values.yaml`
3. Watch rollout:
   - `helm status inspectflow`

## Upgrade
- `helm upgrade inspectflow ./deploy/cloud/helm -f my-values.yaml`

## Notes
- Keep `backend.secrets.databaseUrl` and `backend.secrets.authTokenPepper` in a secret manager if the chart is reused across environments.
- Keep `backend.env.inspectflowSeedOnInstall=false` after first run.
- Set `global.publicOrigin` to the exact public origin used by the ingress host.
