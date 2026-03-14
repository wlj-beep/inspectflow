# Auth Session Foundation (`PLAT-AUTH-v1`)

Implements BL-015.

## Contract Summary
- Protected APIs now derive authorization role from authenticated session identity.
- Local account credentials are stored in `auth_local_credentials`.
- Session tokens are stored server-side (hashed) in `auth_sessions` and sent as HTTP-only cookies.
- Role header trust is disabled by default in non-test environments.
- Transitional compatibility header mode can be enabled explicitly with `ALLOW_LEGACY_ROLE_HEADER=true`.

## Endpoints
- `GET /api/auth/users`: list active users available for local login selection.
- `POST /api/auth/login`: start session (`userId` or `username` + `password`).
- `POST /api/auth/logout`: revoke current session and clear cookie.
- `GET /api/auth/me`: current authenticated user.
- `GET /api/auth/session`: session validity check.
- `POST /api/auth/set-password`: authenticated password rotation.

## Security Defaults
- Cookie name: `inspectflow_session` (configurable with `AUTH_SESSION_COOKIE`).
- Session lifetime: 12h default (`AUTH_SESSION_TTL_HOURS`).
- Password minimum length: 8 characters (`AUTH_PASSWORD_MIN_LENGTH`).
- Failed login lockout: 5 attempts / 15 minutes (`AUTH_LOCKOUT_ATTEMPTS`, `AUTH_LOCKOUT_MINUTES`).

## Local Seed Credentials
- Seeding now creates credentials for each seeded user.
- Default password: `INSPECTFLOW_DEFAULT_PASSWORD` (fallback `inspectflow`).
- Seeded credentials are marked with `must_rotate_password=true`.

## Transitional Compatibility Notes
- Compatibility role-header mode is intended only for tightly controlled transition/test contexts.
- Production deployment recommendation: keep `ALLOW_LEGACY_ROLE_HEADER=false`.
- Even when role headers are present, authenticated session role is authoritative when a session exists.
