# Conflict Audit 2026-03

This audit tracks document conflicts between prior MVP-era guidance and the long-term commercialization target state.

## Conflict Resolution Table

| Area | Prior State | Target Requirement | Resolution Applied | Status |
| --- | --- | --- | --- | --- |
| Charter scope | MVP framing centered on unauthenticated LAN workflow | Multi-release commercialization charter with local-first and module strategy | Updated `charter.md` to release-based charter and commercialization defaults | Closed |
| Scope framing | `mvp-scope.md` described excluded capabilities without forward path | R1 scope must explicitly preserve R2/R3 compatibility | Reframed `mvp-scope.md` as R1 scope with forward-compat constraints | Closed |
| Architecture narrative | Current architecture emphasized role-header gating convenience | End state requires real auth, entitlement model, update and module compatibility boundaries | Reworked `architecture.md` with current-vs-target and migration tracks | Closed |
| Risk register depth | Risks focused on MVP workflows only | Must include commercialization, licensing, update-chain, and module compatibility risk | Expanded `architecture-risks.md` with release-era risk set | Closed |
| Integration staging | Integrations listed without full release gating | Contracts/adapters must be phased by release | Updated `integration-strategy.md` with R1/R2/R3 adapter path | Closed |
| Test guidance | Manual flow checks focused on MVP | Need release acceptance matrix and cross-module regressions | Updated `test-plan.md` with release gates and matrix strategy | Closed |
| Coordination model | Single queue guidance only | Multi-team parallel execution with stream ownership and contracts | Updated `coordination-plan.md` + stream-contract docs | Closed |
| Deployment governance | Generic checks | Release gates and rollback rules per release | Updated `deployment-governance.md` with R1-R4 gates | Closed |
| Backlog structure | Flat completed-items log | Must be release-, stream-, and interface-aware for parallel teams | Refactored `backlog.md` and added `backlog-framework.md` | Closed |

## Audit Closure Criteria
- All items in table marked `Closed`.
- Core docs reference the same release vocabulary (`R1`, `R2`, `R3`, `R4`).
- Backlog metadata model is documented and applied.
- Queue/backlog ID compatibility remains valid (`BL-###`).

## Closure Result
All identified document conflicts for this phase are closed and reflected in the updated project documentation set.
