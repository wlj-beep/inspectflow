# InspectFlow Backend

## Setup
1. Create a Postgres database.
2. Set `DATABASE_URL` in `.env`:
   - Example: `postgres://user:pass@localhost:5432/inspectflow`
3. (Optional) Set a test DB in `.env`:
   - `DATABASE_URL_TEST=postgres://user:pass@localhost:5432/inspectflow_test`
4. Apply schema:
   - `npm run db:migrate`
5. Seed (optional):
   - `npm run db:seed`

## Run
- `npm install`
- `npm run dev`
 - `npm run test` (smoke tests against `DATABASE_URL_TEST`)

## Railway Deployment Notes
- Set service root to `backend/` (monorepo deploys from repo root by default).
- Required env:
  - `DATABASE_URL`
- Recommended env:
  - `FRONTEND_ORIGIN=https://<your-frontend-host>`
- If frontend and backend are on different domains:
  - `AUTH_COOKIE_SAMESITE=none`
  - `AUTH_COOKIE_SECURE=true`
  - `FRONTEND_ORIGIN` must match your frontend host exactly
- Railway start command in `railway.json` runs:
  - `npm run db:migrate && npm start`

## Auth + Integration Runtime Flags
- OIDC SSO standardization (`BL-082`):
  - `AUTH_SSO_ENABLED=true` (required in production).
  - `AUTH_OIDC_ISSUER_URL`, `AUTH_OIDC_CLIENT_ID` required when SSO is enabled outside test.
  - `AUTH_LOCAL_LOGIN_ENABLED=false` recommended for production OIDC-only operation.
  - Legacy `SSO_PROXY_SECRET*` env keys are deprecated in favor of `AUTH_SSO_PROXY_SECRET*`.
  - Run `npm run auth:oidc:migration:check` to audit migration readiness.
- Auth event metadata is allowlisted at write time.
  - Keep metadata limited to audit-safe fields.
  - Do not include passwords, tokens, or PII in auth event metadata.
- Integration simplification (`BL-081`):
  - `INTEGRATION_LEGACY_PARTNER_SURFACES=false` by default (outside test).
  - Set `true` to temporarily re-enable `/api/extensions` and `/api/partner-connectors` legacy surfaces.

## Role Headers (MVP)
Role gating is enforced via request header:
- `x-user-role: Operator | Supervisor | Admin`

## API Routes (MVP)
- `/api/users`
- `/api/tools`
  - `POST /api/tools/:id/deactivate` is the canonical soft-delete endpoint.
  - `DELETE /api/tools/:id` remains a compatibility alias.
- `/api/parts`
- `/api/operations`
- `/api/dimensions`
- `/api/jobs`
- `/api/records`
  - `POST /api/records/:id/deactivate` is the canonical soft-delete endpoint.
  - `DELETE /api/records/:id` remains a compatibility alias.
  - `GET /api/records/:id/export` returns CSV
- `/api/audit`
  - `GET /api/audit/summary` requires `view_audit_summary` or an Admin session.
