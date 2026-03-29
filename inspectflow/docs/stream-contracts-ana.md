# Stream Contract: ANA (Team Signal)

## Scope
Analytics and intelligence: KPI modeling, dashboards, anomaly detection, and performance trend analysis.

## Contract Map
| Contract ID | Producer | Consumers | Notes |
| --- | --- | --- | --- |
| `ANA-MART-v3` | `backend/src/services/analytics/martSchema.js` and `backend/src/services/analytics/martBuilder.js` | `backend/src/services/analytics/kpiDashboard.js`, `backend/src/services/analytics/calibrationImpact.js`, `backend/src/services/analytics/workforcePerformance.js`, `backend/src/services/analytics/spcAnalysis.js`, `backend/src/services/analytics/performanceSlo.js` | Site-partitioned mart facts and rollups. `MART_BUILD_TRANSFORM_VERSION` and `MART_INCREMENTAL_TRANSFORM_VERSION` derive from this contract ID. |
| `ANA-KPI-v3` | `backend/src/services/analytics/kpiContracts.js` and KPI dashboard builders | `backend/src/services/analytics/kpiDashboard.js`, `backend/src/services/analytics/calibrationImpact.js`, `backend/src/services/analytics/workforcePerformance.js`, `backend/src/services/analytics/spcAnalysis.js` | Canonical KPI contract for metrics, breakdowns, and dashboard outputs. |
| `ANA-RISK-v3` | `backend/src/future/analytics/anomalyRules.js` and risk builders | `backend/src/services/analytics/calibrationImpact.js` | Risk-event envelope used for anomaly and escalation flows. |

## Provides
- `ANA-MART-v3`: analytics mart schema contract.
- `ANA-KPI-v3`: KPI definition and query contract.
- `ANA-RISK-v3`: anomaly and risk event contract.
- `ANA-KPI-v3` operations extension: analytics SLO status contract (`GET /api/analytics/performance/slo`) for latency/error/storage budget tracking.

`ANA-MART-v3` multi-site surface (BL-043):
- Site-partitioned mart rows (`site_id`) with per-site rebuild/status isolation.
- Analytics APIs accept optional `siteId` scope (`/api/analytics/marts/*`, `/api/analytics/kpis/dashboard`, `/api/analytics/performance/calibration-impact*`).
- Site-boundary safeguards enforced by analytics scope policy (`ANALYTICS_MULTISITE_ENABLED`, `ANALYTICS_ALLOWED_SITE_IDS`) plus user site-access assignments (`/api/users/:id/sites`) for non-admin site authorization separation.

## Consumes
- `QUAL-TRACE-v1` and `QUAL-FAI-v2`.
- `OPS-JOBFLOW-v1`.
- `INT-CONNECTOR-v2` for ingestion reliability context.

## Versioning Policy
- `ANA-MART-v3` is the anchor contract for mart schema and transform-version names; breaking mart schema changes require a new contract ID and a matching docs update.
- `ANA-KPI-v3` KPI definitions are versioned to preserve report comparability across releases.
- `ANA-RISK-v3` stays aligned with the anomaly and escalation envelope contract used by calibration-impact flows.

## Done Criteria
- KPI outputs reproducible from source-of-truth data.
- Dashboard latency and accuracy SLOs defined and met.
- Cross-site analytics honors partition and authorization controls.
