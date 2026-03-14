# BL-031 / BL-032 Foundations

## Backlog references
- `BL-031` (`INT-CONNECTOR-v2`): Connector runtime retry/replay/failure-policy controls.
- `BL-032` (`INT-IDEMPOTENCY-v2`): External IDs and idempotency semantics.

## Delivered scaffolding
1. Connector policy engine (`backend/src/future/integration/connectorPolicy.js`)
- Duration parsing (`ms`, `s`, `m`), strict range validation, retry strategy normalization.
- Deterministic retry plan generation for fixed/linear/exponential backoff.
- Validation facade to return contract-safe error payloads.

2. Canonical envelope + idempotency utilities
- `backend/src/future/integration/canonicalEnvelope.js`
- `backend/src/future/integration/idempotency.js`
- Canonical ingest envelope normalization and validation.
- Stable fingerprint generation and deterministic idempotency key creation.

## Not integrated yet
- No connector scheduler or run executor wiring.
- No unresolved-item queue integration.
- No persistence for idempotency keys yet.
