# Stream Contract: COMM (Team Ledger)

## Scope
Commercialization controls: license metadata, entitlement policy, seat-pack rules, module activation logic, and update entitlement state.

## Provides
- `COMM-LICENSE-v1`: site license and module entitlement metadata contract.
- `COMM-SEAT-v1`: soft seat visibility/warning contract.
- `COMM-SEAT-v2`: optional paid hard-seat enforcement contract.

## Consumes
- `PLAT-ENT-v1` for runtime gating.
- `PLAT-AUTH-v1` for subject identity and seat attribution.

## Versioning Policy
- Entitlement behaviors must be backward-compatible within a customer major line.

## Done Criteria
- Entitlement decisions are transparent and auditable.
- Module activation does not break core workflows.
- License and seat state exposed for admin review and support diagnostics.
