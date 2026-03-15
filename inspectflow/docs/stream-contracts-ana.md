# Stream Contract: ANA (Team Signal)

## Scope
Analytics and intelligence: KPI modeling, dashboards, anomaly detection, and performance trend analysis.

## Provides
- `ANA-MART-v3`: analytics mart schema contract.
- `ANA-KPI-v3`: KPI definition and query contract.
- `ANA-RISK-v3`: anomaly and risk event contract.

`ANA-MART-v3` multi-site surface (BL-043):
- Site-partitioned mart rows (`site_id`) with per-site rebuild/status isolation.
- Analytics APIs accept optional `siteId` scope (`/api/analytics/marts/*`, `/api/analytics/kpis/dashboard`, `/api/analytics/performance/calibration-impact*`).
- Site-boundary safeguards enforced by analytics scope policy (`ANALYTICS_MULTISITE_ENABLED`, `ANALYTICS_ALLOWED_SITE_IDS`) plus role checks for non-default site access.

## Consumes
- `QUAL-TRACE-v1` and `QUAL-FAI-v2`.
- `OPS-JOBFLOW-v1`.
- `INT-CONNECTOR-v2` for ingestion reliability context.

## Versioning Policy
- KPI definitions versioned to preserve report comparability across releases.

## Done Criteria
- KPI outputs reproducible from source-of-truth data.
- Dashboard latency and accuracy SLOs defined and met.
- Cross-site analytics honors partition and authorization controls.
