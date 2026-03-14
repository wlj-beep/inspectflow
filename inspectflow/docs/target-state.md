# Target State

## Purpose
InspectFlow is a local-first manufacturing quality and traceability platform sold as a perpetual business software product. Customers retain full control of production data, deploy inside their own environments, and receive ongoing core updates without subscription lock-in.

## Non-Negotiable Product Requirements
1. Customer production data remains customer-controlled and customer-accessible at all times.
2. The product must run in environments with no outbound internet access.
3. Multi-device usage inside a customer company network is supported by default in the primary deployment model.
4. Local backup and restore workflows are first-class product capabilities.
5. Core product updates remain available without recurring subscription fees.
6. New paid modules and major editions must integrate without destabilizing core workflows.
7. Traceability and auditability are mandatory across operator, supervisor, quality, and admin actions.
8. Diagnostics telemetry is strict opt-in and excludes customer measurement payloads.

## Commercial Model Defaults
- Base license: per-site perpetual license.
- Usage model: seat-pack commercial packaging.
- R1 enforcement: soft entitlement controls (visibility/warnings/audit), no hard lockouts.
- Updates: perpetual core updates included.
- Expansion revenue: paid modules/editions (for example `QUALITY_PRO`, `ANALYTICS_SUITE`, `MULTISITE`).

## Deployment Defaults
- Primary release model: central on-prem server plus browser/PWA clients on workstation, tablet, and phone.
- Secondary model (later release): standalone edge/single-device edition with controlled interoperability.
- Offline updates: signed update bundles installable without internet access.

## Data and Diagnostics Policy
- Production data classes: measurements, part/job routing context, user-entered comments, audit trails.
- Diagnostic data classes: app health counters, error signatures, performance timings, feature usage counts.
- Diagnostic safeguards:
  - default OFF,
  - explicit customer opt-in,
  - no raw measurement values,
  - no part/lot/customer-identifying payload exports unless explicitly approved by customer policy.

## Architecture Guardrails
- Keep domain model stable and evolve through additive contracts.
- Enforce one owning stream/team per backlog item.
- Require interface contracts for cross-team dependencies.
- Keep release compatibility matrix for all paid modules.
- Prefer pivot/refactor over rewrite unless objective migration-cost thresholds are exceeded.

## Release Guardrails
- R1: commercialization foundation, traceability, compliance, reliability.
- R2: enterprise quality depth and integration hardening.
- R3: analytics and multi-site intelligence.
- R4+: platform ecosystem and extension surfaces.

## Decision Defaults
When requirements are ambiguous, default decisions are:
- local-first over cloud-first,
- backward-compatible over breaking,
- auditable over opaque,
- interface stability over short-term velocity,
- modular release increments over monolithic rewrites.
