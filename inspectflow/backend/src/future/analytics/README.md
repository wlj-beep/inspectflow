# Future Analytics Foundations (`ANA-MART-v3`, `ANA-KPI-v3`, `ANA-RISK-v3`)

## Scope
Standalone R3 scaffolding for:
- `BL-039`: analytics mart schema/query-shape contracts
- `BL-040`: KPI definition registry and query contracts
- `BL-042`: anomaly/risk rule evaluation library

## Modules
- `martContracts.js`
  - static mart definitions
  - query-shape contract validator
- `kpiRegistry.js`
  - KPI definition registry with mart-aware validation
  - KPI query-shape builder
- `anomalyRules.js`
  - reusable condition evaluator
  - sample rule pack
  - risk event envelope + dedupe key helpers for downstream escalation pipelines

## Safe-by-default behavior
- No dashboard wiring.
- No API route wiring.
- No scheduled background jobs.
- No schema migration execution.
