# Calibration Impact Analytics Runbook (`BL-041`)

## Scope
- Contract: `ANA-KPI-v3`
- Upstream dependency: `ANA-MART-v3` mart materialization
- BL-042 integration contract: `ANA-RISK-v3` event + `QUAL-RISK-WORKFLOW-v1` escalation payloads

## API Endpoints
- `GET /api/analytics/performance/calibration-impact` (`view_admin`)
  - Returns machine/tool performance metrics and calibration-impact correlation summary.
- `POST /api/analytics/performance/calibration-impact/refresh` (`view_admin`)
  - Recomputes the same metrics and persists triggered `ANA-RISK-v3` events to `ana_risk_event_log`.
- `GET /api/analytics/risk-events` (`view_admin`)
  - Lists risk events by status (`open`, `acknowledged`, `resolved`).
- `POST /api/analytics/risk-events/:id/resolve` (`view_admin`)
  - Marks a risk event as resolved with optional resolution note.

## Correlation Logic
- Tool performance rows are computed from:
  - `ana_mart_inspection_fact`
  - `record_tools`
  - `tools`
- Calibration impact compares:
  - `overdue_oot_rate` (measurements after tool due date)
  - `ontime_oot_rate` (measurements on/before due date)
  - `oot_rate_delta = overdue_oot_rate - ontime_oot_rate`

## BL-042 Integration
- Triggered tool-risk rows generate:
  - `ANA-RISK-v3` event envelopes
  - `QUAL-RISK-WORKFLOW-v1` escalation records (with `QUAL-TRACE-v1` evidence links)
- Persisted in:
  - `ana_risk_event_log.event_envelope`
  - `ana_risk_event_log.escalation_record`

## Validation
- Runtime/API coverage:
  - `backend/test/analytics-calibration-impact.test.js`

