# Auth Session Foundation (`PLAT-AUTH-v1`)

Implements BL-015.

## Contract Summary
- Protected APIs now derive authorization role from authenticated session identity.
- Local account credentials are stored in `auth_local_credentials`.
- Session tokens are stored server-side (hashed) in `auth_sessions` and sent as HTTP-only cookies.
- Auth events are durably recorded in `auth_event_log` for success/failure/lockout/logout/password and entitlement change coverage.
- Role header trust is disabled by default in non-test environments.
- Transitional compatibility header mode can be enabled explicitly with `ALLOW_LEGACY_ROLE_HEADER=true`.

## Endpoints
- `GET /api/auth/users`: list active users available for local login selection.
- `POST /api/auth/login`: start session (`userId` or `username` + `password`).
- `POST /api/auth/sso/login`: optional SSO session start (`AUTH_SSO_ENABLED=true`; principal from trusted header/body).
- `POST /api/auth/logout`: revoke current session and clear cookie.
- `GET /api/auth/me`: current authenticated user.
- `GET /api/auth/session`: session validity check.
- `GET /api/auth/seats`: admin seat usage snapshot (`COMM-SEAT-v1`/`COMM-SEAT-v2`).
- `POST /api/auth/set-password`: authenticated password rotation.
- `POST /api/auth/reset-default-passwords`: admin credential reset workflow.
- `GET /api/auth/events`: admin auth event audit feed (`PLAT-AUTH-v1` evidence surface).
- `GET /api/auth/entitlements`: authenticated read of `PLAT-ENT-v1` contract state.
- `PUT /api/auth/entitlements`: admin update for module flags, seat-pack policy, and diagnostics opt-in.

## Security Defaults
- Cookie name: `inspectflow_session` (configurable with `AUTH_SESSION_COOKIE`).
- Session lifetime: 12h default (`AUTH_SESSION_TTL_HOURS`).
- Password minimum length: 8 characters (`AUTH_PASSWORD_MIN_LENGTH`).
- Failed login lockout: 5 attempts / 15 minutes (`AUTH_LOCKOUT_ATTEMPTS`, `AUTH_LOCKOUT_MINUTES`).

## OIDC Standardized SSO Mode (BL-082)
- Production standardization target is OIDC SSO-first.
- Required when `AUTH_SSO_ENABLED=true` outside test:
  - `AUTH_OIDC_ISSUER_URL`
  - `AUTH_OIDC_CLIENT_ID`
  - `AUTH_SSO_PROXY_SECRET`
- When enabled, `POST /api/auth/sso/login` accepts principal/role from trusted proxy headers:
  - `AUTH_SSO_PRINCIPAL_HEADER` (default `x-forwarded-user`)
  - `AUTH_SSO_ROLE_HEADER` (default `x-forwarded-role`)
- Optional role hint sources:
  - request body `role` only when `AUTH_SSO_ALLOW_BODY_PRINCIPAL=true` (or in test runtime).
- `AUTH_SSO_AUTO_PROVISION=false` by default. When enabled, unknown principals can be created as active users.
- `AUTH_SSO_DEFAULT_ROLE=Operator` controls fallback role for auto-provision.
- `AUTH_LOCAL_LOGIN_ENABLED` controls local login availability:
  - default `false` in production
  - default `true` outside production
  - when disabled, `POST /api/auth/login` returns `403 local_login_disabled`.
- `PLAT-ENT-v1` `seatPolicy` fields enable optional `COMM-SEAT-v2` hard-seat modes.
- Legacy `SSO_PROXY_SECRET` and `SSO_PROXY_SECRET_HEADER` env keys are deprecated. Use `AUTH_SSO_*` keys.
- Migration checker: `npm run auth:oidc:migration:check`.

## Auth Event Coverage (BL-016)
- `login_success`
- `login_failure`
- `login_locked`
- `logout`
- `password_changed`
- `password_change_failure`
- `password_reset_default`
- `entitlements_updated`
- `seat_soft_limit_warning`
- `seat_hard_limit_block`

Audit fields include actor/user/session linkage, request context (IP/user-agent), metadata, and timestamp.

## Entitlement Contract Surface (`PLAT-ENT-v1`, BL-051)
- Contract ID: `PLAT-ENT-v1` (single authoritative row in `platform_entitlements`).
- Module flags exposed as stable keys:
  - `CORE`
  - `QUALITY_PRO`
  - `INTEGRATION_SUITE`
  - `ANALYTICS_SUITE`
  - `MULTISITE`
  - `EDGE`
- Additional policy fields:
  - `licenseTier`
  - `seatPack`
  - `seatSoftLimit`
  - `seatPolicy` (`mode`, `enforced`, `hardLimit`, `namedUsers`, `allowedDevices`)
  - `diagnosticsOptIn`

## Local Seed Credentials
- Seeding now creates credentials for each seeded user.
- Default password: `INSPECTFLOW_DEFAULT_PASSWORD` (fallback `inspectflow`).
- Seeded credentials are marked with `must_rotate_password=true`.

## Transitional Compatibility Notes
- Compatibility role-header mode is intended only for tightly controlled transition/test contexts.
- Production deployment recommendation: keep `ALLOW_LEGACY_ROLE_HEADER=false`.
- Even when role headers are present, authenticated session role is authoritative when a session exists.
- Legacy SSO env aliases can be temporarily enabled only with `AUTH_ALLOW_LEGACY_SSO_ENV=true` during migration windows.
