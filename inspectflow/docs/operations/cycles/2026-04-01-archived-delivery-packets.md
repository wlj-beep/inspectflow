# Archived Delivery Packets

These packets document the 2026-04-01 delivery wave and are kept as a historical reference now that the live queue has been cleared.

Use these three packets as the historical coordination record for that wave.

## Coordination Rule
- Run at most 3 teams in parallel.
- Keep file ownership disjoint.
- Treat `STATUS.md` as the canonical queue record for that wave; the live queue is now empty.
- If a task is blocked by a dependency, keep the team on the unblocked subset and report the blocker instead of widening scope.

## Packet 1: Platform and Access

**Team:** Atlas  
**Focus:** entitlement, auth/login hardening, runtime SLOs, and commercial gating

**Assigned BL IDs**
- `BL-051`
- `BL-086`
- `BL-108`
- `BL-018`

**Goal**
Deliver the platform and access substrate that downstream commercial and multisite work depends on.

**Primary scope**
- Entitlement and module-flag contract behavior
- Login/account selection hardening
- Runtime SLO signals and technical ops surface
- Seat visibility and warning behavior

**Suggested file areas**
- `backend/src/services/platform/**`
- `backend/src/routes/auth.js`
- `backend/src/services/ops/technicalOps.js`
- `frontend/src/**auth**`
- `frontend/src/ui/**` only if needed for access/SLO presentation

**Acceptance**
- Entitlements remain the authoritative gating contract.
- Login no longer exposes the pre-auth user directory.
- Runtime SLO surfaces clearly expose the current operational posture.
- Seat warning behavior is still audit-traceable and compatible with entitlement reads.

**Prompt to hand to the team**
> You own the platform/access tranche for `BL-051`, `BL-086`, `BL-108`, and `BL-018`. Stay within platform/auth/ops surfaces and make the entitlement, login, and SLO substrate production-ready for downstream teams. Do not widen into frontend navigation or customer-proof work unless a direct dependency requires a tiny integration change. Return file paths, evidence, and any remaining blockers.

## Packet 2: Navigation and Operator UX

**Team:** Forge  
**Focus:** navigation, admin IA, operator flow, and table UX

**Assigned BL IDs**
- `BL-063`
- `BL-087`
- `BL-088`
- `BL-089`
- `BL-090`
- `BL-068`
- `BL-069`
- `BL-070`
- `BL-071`

**Goal**
Finish the remaining UX cleanup around admin navigation, operator density, dashboard behavior, and keyboard/accessibility polish.

**Primary scope**
- Admin sidebar and shell navigation
- Browser back/forward and deep-link behavior
- Shortcut overlay focus management
- Home dashboard role-tailoring
- Measurement table density/filtering

**Suggested file areas**
- `frontend/src/AppShell.jsx`
- `frontend/src/ui/navigation.js`
- `frontend/src/ui/AdminView.jsx`
- `frontend/src/ui/homeDashboard.jsx`
- `frontend/src/ui/operatorProgress.jsx`
- `frontend/src/ui/OperatorView.jsx`
- `frontend/src/ui/app.css`
- `frontend/src/ui/filterUrlState.js`

**Acceptance**
- Navigation is coherent and URL-driven.
- Admin IA is flattened and easy to scan.
- Global shortcuts do not interfere with text entry.
- Dashboard and measurement views feel role-aware and consistent.

**Prompt to hand to the team**
> You own the navigation and operator UX tranche for `BL-063`, `BL-087`, `BL-088`, `BL-089`, `BL-090`, `BL-068`, `BL-069`, `BL-070`, and `BL-071`. Stay in frontend/UI surfaces and keep the shell, admin IA, operator flow, and measurement-table experience cohesive. `BL-062` is already done, so build on that behavior rather than reworking it. Return file paths, evidence, and a clear note if any item remains blocked by a dependency.

## Packet 3: Customer, Reporting, and Ecosystem

**Team:** Helix / Bridge / Ledger  
**Focus:** customer-facing proof, reporting/export, and platform ecosystem expansion

**Assigned BL IDs**
- `BL-113`
- `BL-110`
- `BL-046`
- `BL-047`
- `BL-048`
- `BL-049`
- `BL-050`

**Goal**
Deliver the customer-facing proof/export experience and keep the ecosystem/edge expansion moving in parallel.

**Primary scope**
- Customer-friendly reporting and preview output
- Customer proof center
- Extension/partner runtime scaffolding
- Edge interoperability and entitlement-driven module policy
- Ecosystem compatibility suite

**Suggested file areas**
- `frontend/src/ui/**` for proof/export presentation
- `backend/src/services/platform/**` for entitlements/module policy
- `backend/src/services/integration/**` for extension/partner runtime work
- `backend/src/routes/**` and matching tests as needed

**Acceptance**
- Customer-facing outputs are easy to present and share.
- Proof-center views do not expose restricted internals.
- Ecosystem/edge scaffolding does not regress core workflows.
- Any work dependent on `BL-108` is deferred cleanly until that substrate is available.

**Prompt to hand to the team**
> You own the customer/reporting/ecosystem tranche for `BL-113`, `BL-110`, `BL-046`, `BL-047`, `BL-048`, `BL-049`, and `BL-050`. Prioritize the customer-facing proof/export experience, then carry the ecosystem/edge expansion forward without regressing existing workflows. If `BL-110` is still blocked by the runtime/reporting substrate, keep the team on `BL-113` and the R4 items while you wait. Return file paths, evidence, and blocker notes in a concise merge-ready format.

## Suggested Launch Order
1. Packet 1 and Packet 2 were intended to run in parallel.
2. Packet 3 was intended to start immediately for `BL-113` and the R4 items; `BL-110` could be held until its runtime dependency was ready.
3. Any spillover was meant to roll into the next wave only after each team had a narrow, merged finish line.
