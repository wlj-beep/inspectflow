# Stream Contract: COMM (Team Ledger)

## Scope
Commercialization controls: license metadata, entitlement policy, seat-pack rules, module activation logic, and update entitlement state.

## Provides
- `COMM-LICENSE-v1`: site license and module entitlement metadata contract, including module policy profile selection for entitlement activation.
- `COMM-SEAT-v1`: soft seat visibility/warning contract.
- `COMM-SEAT-v2`: optional paid hard-seat enforcement contract.

`COMM-LICENSE-v1` surface:
- Entitlements persist `modulePolicyProfile` and resulting `moduleFlags` for audit-safe activation.
- Policy evaluation uses `/api/auth/module-policy/profiles` (list profiles) and `/api/auth/module-policy/evaluate` (preview module flag outcomes).

`COMM-SEAT-v1` surface:
- `GET /api/auth/seats`: admin seat-usage snapshot (`activeUsers`, `activeSessions`, `seatSoftLimit`, warning flags).
- Auth/session payloads (`/api/auth/login`, `/api/auth/me`, `/api/auth/session`) include `seatUsage`.
- `auth_event_log.event_type='seat_soft_limit_warning'` records warning-state login events with license/seat metadata for audit.

`COMM-SEAT-v2` surface:
- `PLAT-ENT-v1` includes `seatPolicy` (`mode`, `enforced`, `hardLimit`, `namedUsers`, `allowedDevices`) for hard-seat controls.
- Hard-seat enforcement applies at auth entrypoints (`/api/auth/login`, `/api/auth/sso/login`) when `seatPolicy.enforced=true` and `moduleFlags.QUALITY_PRO=true`.
- Supported modes: `named`, `device`, `concurrent`.
- Denied hard-seat attempts are audited as `auth_event_log.event_type='seat_hard_limit_block'`.

## Consumes
- `PLAT-ENT-v1` for runtime gating.
- `PLAT-AUTH-v1` for subject identity and seat attribution.

## Versioning Policy
- Entitlement behaviors must be backward-compatible within a customer major line.

## Done Criteria
- Entitlement decisions are transparent and auditable.
- Module activation does not break core workflows.
- License and seat state exposed for admin review and support diagnostics.
