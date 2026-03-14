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
- Rule match-mode support (`all`/`any`) for future workflow variants.
- Risk event envelope + dedupe-key helper for later escalation pipeline wiring.

4. Quality escalation workflow bridge
- `backend/src/future/quality/riskEscalation.js`
- Maps `ANA-RISK-v3` event envelopes to `QUAL-RISK-WORKFLOW-v1` escalation records.
- Produces `QUAL-TRACE-v1` evidence-link scaffolding for later case management integration.

## Not integrated yet
- No live dashboard API wiring.
- No scheduled scoring job or alert dispatch.
- No persisted anomaly event pipeline.
