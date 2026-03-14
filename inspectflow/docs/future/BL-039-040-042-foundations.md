# BL-039 / BL-040 / BL-042 Foundations

## Backlog references
- `BL-039` (`ANA-MART-v3`): mart contracts and reproducible transformations.
- `BL-040` (`ANA-KPI-v3`): KPI definition/query contracts.
- `BL-042` (`ANA-RISK-v3`): anomaly and escalation rule foundations.

## Delivered scaffolding
1. Analytics mart contract registry
- `backend/src/future/analytics/martContracts.js`
- Static mart definitions and query-shape validator.

2. KPI definition registry
- `backend/src/future/analytics/kpiRegistry.js`
- Mart-aware KPI validation and query-shape contract builder.

3. Anomaly rule evaluator
- `backend/src/future/analytics/anomalyRules.js`
- Rule condition evaluation library with sample rules.

## Not integrated yet
- No live dashboard API wiring.
- No scheduled scoring job or alert dispatch.
- No persisted anomaly event pipeline.
