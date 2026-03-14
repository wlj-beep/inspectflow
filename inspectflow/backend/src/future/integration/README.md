# Future Integration Foundations (`INT-CONNECTOR-v2`, `INT-IDEMPOTENCY-v2`)

## Scope
Standalone R2 scaffolding for:
- `BL-031`: connector policy/runtime controls (retry/backoff/timeout/replay parsing + validation)
- `BL-032`: idempotency key semantics and canonical ingest envelope validation

## Modules
- `connectorPolicy.js`
  - `parseConnectorPolicy(rawPolicy)`
  - `validateConnectorPolicy(rawPolicy)`
  - `computeRetryDelayMs(policy, attemptNumber, options)`
  - `buildRetryPlan(policy, options)`
- `canonicalEnvelope.js`
  - `normalizeCanonicalEnvelope(envelope)`
  - `validateCanonicalEnvelope(envelope)`
- `idempotency.js`
  - `buildIdempotencyFingerprint(input)`
  - `createIdempotencyKey(input, options)`

## Safe-by-default behavior
- No runtime wiring into `backend/src/index.js` or active routes.
- No scheduler hooks.
- No database changes.

## Integration handoff notes
- Future merge target: connector runner service behind an explicit feature flag.
- Keep contract IDs pinned (`INT-CONNECTOR-v2`, `INT-IDEMPOTENCY-v2`) until promoted.
