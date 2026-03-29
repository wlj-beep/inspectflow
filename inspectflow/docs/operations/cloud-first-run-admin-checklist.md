# First-Run Admin Checklist

## Purpose
Use this checklist when bringing up a new single-tenant cloud environment for the first time.

## Bootstrap Values
Set these before the first boot:
- `INSPECTFLOW_SEED_ON_INSTALL=true`
- `INSPECTFLOW_DEFAULT_PASSWORD`
  - Temporary only.
  - Must meet the password policy enforced by the backend.
- `AUTH_TOKEN_PEPPER`
  - Required in non-test runtime.
  - Use a long random secret.
- `FRONTEND_ORIGIN`
  - Exact public origin used by the browser.
- `AUTH_COOKIE_SECURE`
  - `false` only for local HTTP validation.
  - `true` once HTTPS is live.
- `AUTH_COOKIE_SAMESITE`
  - `lax` for same-origin deployments.
  - `none` only when cookies must cross a browser site boundary.
- `AUTH_COOKIE_DOMAIN`
  - Leave empty unless a shared parent domain is intentionally used.
- `AUTH_LOGIN_RATE_LIMIT_MAX`
  - Recommended baseline: `10`.
- `AUTH_LOGIN_RATE_LIMIT_WINDOW_MS`
  - Recommended baseline: `900000`.

## Initial Admin Flow
1. Deploy the stack with the bootstrap values.
2. Confirm the seed data created the initial `S. Admin` account.
3. Sign in with the temporary password.
4. Create or confirm the real production admin owner account.
5. Rotate the bootstrap password immediately.
6. Verify that the new admin can sign in.
7. Set `INSPECTFLOW_SEED_ON_INSTALL=false`.
8. Redeploy and confirm the environment still starts cleanly.

## Steady-State Requirements
- The bootstrap password must not remain in any shared notes or ticketing system.
- The seed-on-install flag must be off after first boot.
- Any browser-origin mismatch must be fixed before users are invited.
- If SSO is enabled later, keep at least one break-glass local admin account.

## Operator Notes
- `S. Admin` is the seeded admin account in the starter data.
- The first-run admin user should own the environment before any regular users are invited.
- If the password rotation flow fails, stop and fix the environment before introducing real data.
