# KPI Dashboard + Risk Workflow Runbook

Contracts:
- `ANA-KPI-v3` (BL-040)
- `ANA-RISK-v3` + `QUAL-RISK-WORKFLOW-v1` integration (BL-042)

## KPI Dashboard APIs

### KPI definitions
- `GET /api/analytics/kpis/definitions`
- Capabilities: `submit_records` or `view_jobs` or `manage_jobs` or `view_admin`
- Returns contract-aligned KPI definitions and formulas.

### KPI dashboard payload
- `GET /api/analytics/kpis/dashboard`
- Query params: `dateFrom`, `dateTo`, `limit`
- Capabilities: `submit_records` or `view_jobs` or `manage_jobs` or `view_admin`
- Returns:
  - aggregate canonical metrics
  - computed KPI values
  - work-center/operator breakdowns
  - daily trend series

## Risk Event Lifecycle APIs

### List events
- `GET /api/analytics/risk-events?status=open|acknowledged|resolved`
- Capability: `view_admin`

### Acknowledge event
- `POST /api/analytics/risk-events/:id/acknowledge`
- Capability: `view_admin`
- Records ack actor/time/note and sets status to `acknowledged`.

### Escalate event to issue workflow
- `POST /api/analytics/risk-events/:id/escalate-issue`
- Capability: `view_admin`
- Requires authenticated/declared actor user id.
- Creates linked `issue_reports` row (`tolerance_issue`) with trace-context details.

### Resolve event
- `POST /api/analytics/risk-events/:id/resolve`
- Capability: `view_admin`
- Finalizes event as `resolved` with actor and resolution note.

## Data Model Notes
- `ana_risk_event_log` now tracks:
  - acknowledge actor/time/note
  - linked quality issue id
  - resolve actor/time/note
- Linked issue relationship is auditable and non-destructive (`ON DELETE SET NULL`).
