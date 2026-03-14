# Architecture

## Current State (Working Tree Baseline)
- Frontend: React app with large legacy shell component and API adapters.
- Backend: Node/Express monolith route layer with Postgres persistence.
- Deployment: single-site on-prem assumptions with localhost-first tooling.
- Access control: capability checks are implemented, but request role-header trust is not a production security boundary.
- Data capabilities: records, audit logs, revisions, import pipelines, unresolved-item workflows.

## Target State
- Server-first local network architecture with secure auth/session enforcement.
- Modular frontend architecture by domain area (operator, jobs, quality, admin, imports).
- Backend service boundaries by stream (`PLAT`, `OPS`, `QUAL`, `INT`, `ANA`, `COMM`).
- Contracted interfaces for cross-team delivery and release-level backward compatibility.
- Operational platform features: install/update/backup/restore with auditable controls.
- Module-aware runtime where paid modules extend but do not destabilize core behavior.

## Current vs Target Delta
1. Security
- Current: role header indicates capability context.
- Target: authenticated identity, role capability enforcement, entitlement-aware policy layer.

2. Composition
- Current: high route and UI concentration in monolithic files.
- Target: service/domain modularization with contract boundaries.

3. Commercialization
- Current: no explicit licensing/entitlement runtime policy.
- Target: site license metadata, seat-pack visibility controls, module activation contracts.

4. Operations
- Current: manual-oriented reliability practices.
- Target: standardized deployment packs, offline update bundles, automated backup/restore verification.

## Migration Path (Pivot, Not Rebuild)
### Phase A (R1 Foundation)
- Introduce auth/session and entitlement read contracts.
- Extract backend route logic into domain services by stream.
- Begin frontend shell decomposition by domain slices.
- Add work center/routing and traceability/export completeness.

### Phase B (R2 Expansion)
- Harden integration adapters and idempotent external keys.
- Add enterprise quality depth (first article and export profiles).
- Add optional AD/SSO integration path and paid hard-seat controls.

### Phase C (R3 Intelligence)
- Add analytics marts and KPI contracts.
- Add multi-site aggregation boundaries and governance controls.

### Phase D (R4 Platform)
- Add extension SDK boundaries and partner integration surfaces.
- Introduce edge interoperability model for standalone edition.

## Stream/Contract Ownership
- `PLAT` (Team Atlas): auth, deployment/update, backup/restore.
- `OPS` (Team Forge): job and routing operations.
- `QUAL` (Team Helix): traceability and quality outputs.
- `INT` (Team Bridge): ingestion and connectors.
- `ANA` (Team Signal): analytics and risk intelligence.
- `COMM` (Team Ledger): license and entitlement policies.

See `stream-contracts-*.md` for authoritative interface details.
