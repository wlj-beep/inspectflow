# Context Packet

Generated: 2026-03-21T02:23:13.222Z
Task: Implement all 3 context tiers for agent workflow
BL IDs: BL-000
Signals: implement, all, 3, context, tiers, for, agent, workflow, bl-000, coordination, api, ui, auth, integration, analytics, quality

## Load Order
1. Tier 1 constitution and core docs
2. Tier 2 specialist cards
3. Tier 3 task-scoped retrieval docs/code

## Tier 1
- context/constitution.md
- README.md
- STATUS.md
- docs/backlog.md
- docs/architecture.md
- docs/test-plan.md

## Tier 2
- docs-contracts: context/specialists/docs-contracts.md
- verifier: context/specialists/verifier.md
- backend-api: context/specialists/backend-api.md
- frontend-ui: context/specialists/frontend-ui.md
- integration-runtime: context/specialists/integration-runtime.md
- analytics-quality: context/specialists/analytics-quality.md
- platform-auth: context/specialists/platform-auth.md

## Tier 3
- docs/operations/multi-agent-playbook.md
- docs/operations/controller-prompts.md
- docs/operations/launch-checklist.md
- docs/backlog-intake-protocol.md
- backend/src/index.js
- backend/db/schema.sql
- docs/data-model.md
- docs/architecture.md
- frontend/src/App.jsx
- frontend/src/api/client.js
- docs/frontend-notes.md
- docs/mvp-scope.md
- docs/integration-strategy.md
- docs/integration-adapter-support-runbook.md
- backend/src/services/integration/connectorRuntime.js
- backend/src/services/integration/connectorRunPolicy.js
- backend/src/services/integration/canonicalEnvelope.js
- docs/analytics-mart-runbook.md
- docs/analytics-kpi-risk-workflow-runbook.md
- docs/quality-export-runbook.md
- backend/src/services/analytics/kpiDashboard.js
- backend/src/services/quality/as9102Exports.js
- docs/auth-session-foundation.md
- backend/src/auth.js
- backend/src/middleware/authSession.js
- backend/src/services/platform/modulePolicy.js
- backend/src/services/platform/entitlements.js

## Rule Matches
- coordination-core
- backend-core
- frontend-core
- integration-runtime
- analytics-quality
- platform-auth

