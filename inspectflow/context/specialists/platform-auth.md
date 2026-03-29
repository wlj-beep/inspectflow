# Specialist Card: Platform/Auth

## Owns
- `backend/src/auth.js`
- `backend/src/routes/auth.js`
- `backend/src/services/platform/**`
- Session, entitlements, SSO, module policy

## Trigger Signals
- `auth`, `session`, `sso`, `entitlement`, `role`, `permission`, `module policy`

## Required Checks
- `npm run test:api`
- Auth-focused targeted tests

## Output Emphasis
- Boundary hardening, backward compatibility, and role-header safety assumptions.

