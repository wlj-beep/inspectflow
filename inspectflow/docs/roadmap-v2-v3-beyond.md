# Roadmap v2, v3, and Beyond

This document defines post-R1 priorities after completion of the commercialization and local-first foundation backlog.

## Release Map
- R1: commercialization foundation (server-first on-prem, traceability/compliance, entitlement soft controls).
- R2: enterprise quality and integration depth.
- R3: operational intelligence and multi-site controls.
- R4+: platform and ecosystem expansion.

## Prioritization Model
Use this priority order after R1 completion:
1. Customer risk reduction (security, data certainty, compliance output correctness).
2. Revenue leverage (paid module attach rate and enterprise expansion fit).
3. Cross-team dependency reduction (stabilize contracts and unblock parallel delivery).
4. Operational scalability (performance, supportability, deployment reliability).

## R2 (Enterprise Expansion)
### Outcomes
- Enable enterprise adoption without customer-specific forks.
- Increase quality-engineering value beyond basic record capture.
- Harden external data exchange contracts.

### Priority Epics
1. `QUAL`: first-article workflow depth, AS9102 starter-to-advanced output packs, lot/serial trace reporting.
2. `INT`: connector hardening, idempotent external keys, adapter contracts for ERP/job ingest.
3. `PLAT`: optional enterprise identity integration path (AD/SSO) on top of hardened local auth.
4. `COMM`: optional paid hard-seat enforcement modes while preserving R1 soft mode fallback.

### Entry Gate
- R1 interfaces are versioned and frozen for one release cycle.

### Exit Gate
- At least one enterprise pilot runs R2 capabilities without custom code branch divergence.

## R3 (Intelligence and Multi-Site)
### Outcomes
- Deliver measurable process-improvement value through analytics.
- Support controlled company-level insights across multiple sites.

### Priority Epics
1. `ANA`: analytics marts and KPI dashboards (operator quality, correction burden, cycle-time patterns).
2. `QUAL`: anomaly and risk workflows for outlier detection and escalation.
3. `MULTISITE`: bounded cross-site aggregation with strict site partition and authorization policy.

### Entry Gate
- R2 data contracts and connector reliability SLOs are met.

### Exit Gate
- Customer KPI tracking demonstrates repeatable ROI from analytics module adoption.

## R4 and Beyond (Platform)
### Outcomes
- Expand integration ecosystem and partner extensibility.
- Decouple module innovation from core release risk.

### Priority Epics
1. Extension SDK and policy-safe plugin boundaries.
2. Partner connector kits and validation suites.
3. Edge/standalone interoperability framework.

### Entry Gate
- R3 module boundaries and compatibility guarantees are stable.

### Exit Gate
- New module and partner capabilities ship without requiring core platform regressions.

## Dependency Gates Across Releases
- Gate A: security baseline and auth modernization complete.
- Gate B: deployment/update/restore reliability proven in customer-like environments.
- Gate C: contract versioning and backward compatibility tooling active.
- Gate D: release-level regression matrix covers core + all enabled modules.

## Reprioritization Triggers
Reprioritize release content when one of the following occurs:
- Regulatory or customer compliance change requires immediate quality/export update.
- Security posture change introduces high-severity risk.
- Core SLOs are violated by module growth.
- Revenue-impacting module adoption materially underperforms target.

## Planning Cadence
- Monthly: backlog scoring and dependency review by stream leads.
- Quarterly: release scope lock and gate-readiness review.
- Per release: post-release review with feedforward adjustments for the next release.
