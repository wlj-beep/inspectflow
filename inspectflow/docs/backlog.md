# Backlog (Active Build)

This backlog follows `docs/backlog-framework.md` and is organized for parallel team execution across releases.

## Baseline Preservation
- Historical v1-era backlog snapshot: `docs/backlog-v1-baseline-2026-03.md`
- Previously delivered baseline IDs (`BL-001` through `BL-014`) remain preserved in that snapshot and worklog history.

## R1 Backlog (Commercialization Foundation)

| ID | Release | Stream | Module | Owner Team | Dependencies | Interface Contract | Priority Score | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BL-015 | R1 | PLAT | CORE | Team Atlas | None | PLAT-AUTH-v1 | 98 | Local auth/session contract implemented and replaces role-header trust for protected flows. |
| BL-016 | R1 | PLAT | CORE | Team Atlas | BL-015 | PLAT-AUTH-v1 | 94 | Password/session policy hardening, lockout, and auth event audit coverage complete. |
| BL-017 | R1 | PLAT | CORE | Team Atlas | BL-015 | PLAT-AUTH-v1 | 93 | Capability enforcement migrated to authenticated identity path with backward-compatible transition handling. |
| BL-018 | R1 | COMM | CORE | Team Ledger | BL-015 | COMM-LICENSE-v1 | 90 | Site entitlement metadata and soft seat visibility/warning behavior live with audit trace. |
| BL-019 | R1 | PLAT | CORE | Team Atlas | None | PLAT-DEPLOY-v1 | 96 | Install packaging for server-first on-prem deployment documented and validated. |
| BL-020 | R1 | PLAT | CORE | Team Atlas | BL-019 | PLAT-DEPLOY-v1 | 92 | Signed offline update bundle workflow with preflight and rollback procedures validated. |
| BL-021 | R1 | PLAT | CORE | Team Atlas | BL-019 | PLAT-BACKUP-v1 | 95 | Automated local backup scheduling and restore validation workflow passes acceptance checklist. |
| BL-022 | R1 | OPS | CORE | Team Forge | BL-017 | OPS-WORKCENTER-v1 | 91 | Work center master data CRUD and operation assignment flows implemented with audit history. |
| BL-023 | R1 | OPS | CORE | Team Forge | BL-022 | OPS-ROUTING-v1 | 89 | Route resequencing and operation move workflows support production changes with revision trace. |
| BL-024 | R1 | OPS | CORE | Team Forge | BL-017 | OPS-JOBFLOW-v1 | 87 | Per-piece free-text comments captured, reviewed, and exported in core record flows. |
| BL-025 | R1 | OPS | CORE | Team Forge | BL-017 | OPS-JOBFLOW-v1 | 88 | Quantity adjustment workflow captures reason, actor, and before/after state. |
| BL-026 | R1 | QUAL | CORE | Team Helix | BL-024, BL-025 | QUAL-TRACE-v1 | 92 | Queryable trace chain by job/part/lot/piece/serial with correction lineage included. |
| BL-027 | R1 | QUAL | QUALITY_PRO | Team Helix | BL-026 | QUAL-EXPORT-v1 | 90 | CSV exports plus starter AS9102-oriented outputs available and acceptance-tested. |
| BL-028 | R1 | OPS | CORE | Team Forge | BL-015, BL-017 | OPS-JOBFLOW-v1 | 86 | Frontend decomposed into domain modules with stable API adapters and reduced monolith coupling. |
| BL-029 | R1 | PLAT | CORE | Team Atlas | BL-017 | PLAT-AUTH-v1 | 85 | Backend route logic extracted into stream-aligned services with contract tests. |
| BL-030 | R1 | PLAT | CORE | Team Atlas | BL-015 through BL-029 | PLAT-DEPLOY-v1 | 99 | R1 acceptance matrix automated and manual release evidence checklist completed. |

## R2 Backlog (Enterprise Expansion)

| ID | Release | Stream | Module | Owner Team | Dependencies | Interface Contract | Priority Score | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BL-031 | R2 | INT | INTEGRATION_SUITE | Team Bridge | BL-029 | INT-CONNECTOR-v2 | 93 | Connector runtime retry/replay and failure-policy controls implemented with deterministic run outcomes. |
| BL-032 | R2 | INT | INTEGRATION_SUITE | Team Bridge | BL-031 | INT-IDEMPOTENCY-v2 | 92 | External IDs and idempotency semantics applied across imported entities. |
| BL-033 | R2 | INT | INTEGRATION_SUITE | Team Bridge | BL-031, BL-032 | INT-INGEST-v1 | 88 | ERP/job adapter pack maps to canonical ingest contract without domain-side custom forks. |
| BL-034 | R2 | QUAL | QUALITY_PRO | Team Helix | BL-026, BL-027 | QUAL-FAI-v2 | 91 | First-article workflow depth supports part and lot scopes with guided trace linkage. |
| BL-035 | R2 | QUAL | QUALITY_PRO | Team Helix | BL-034 | QUAL-EXPORT-v1 | 87 | Customer-selectable export profile packs delivered with compatibility fixtures. |
| BL-036 | R2 | PLAT | CORE | Team Atlas | BL-016 | PLAT-AUTH-v1 | 82 | Optional AD/SSO integration path implemented without breaking local account mode. |
| BL-037 | R2 | COMM | QUALITY_PRO | Team Ledger | BL-018, BL-036 | COMM-SEAT-v2 | 80 | Optional paid hard-seat modes (named/device/concurrent) implemented behind entitlement flags. |
| BL-038 | R2 | INT | INTEGRATION_SUITE | Team Bridge | BL-031 | INT-CONNECTOR-v2 | 84 | Integration observability/support bundle provides operator-safe troubleshooting and replay context. |

## R3 Backlog (Intelligence and Multi-Site)

| ID | Release | Stream | Module | Owner Team | Dependencies | Interface Contract | Priority Score | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BL-039 | R3 | ANA | ANALYTICS_SUITE | Team Signal | BL-026, BL-031 | ANA-MART-v3 | 90 | Analytics marts built from traceable source contracts with reproducible transformations. |
| BL-040 | R3 | ANA | ANALYTICS_SUITE | Team Signal | BL-039 | ANA-KPI-v3 | 88 | Operator/supervisor KPI dashboards delivered with validated metric definitions. |
| BL-041 | R3 | ANA | ANALYTICS_SUITE | Team Signal | BL-039 | ANA-KPI-v3 | 86 | Machine and tool performance analytics include calibration-impact correlation views. |
| BL-042 | R3 | QUAL | QUALITY_PRO | Team Helix | BL-039, BL-041 | ANA-RISK-v3 | 85 | Quality anomaly and escalation workflows integrated with traceable evidence links. |
| BL-043 | R3 | ANA | MULTISITE | Team Signal | BL-039 | ANA-MART-v3 | 83 | Multi-site partition-aware analytics model implemented with site boundary safeguards. |
| BL-044 | R3 | PLAT | MULTISITE | Team Atlas | BL-043, BL-036 | PLAT-AUTH-v1 | 82 | Multi-site access and reporting controls enforce site-level authorization separation. |
| BL-045 | R3 | ANA | ANALYTICS_SUITE | Team Signal | BL-040 through BL-044 | ANA-KPI-v3 | 79 | Analytics performance and cost controls meet defined SLO thresholds. |

## R4 Backlog (Platform and Ecosystem)

| ID | Release | Stream | Module | Owner Team | Dependencies | Interface Contract | Priority Score | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BL-046 | R4 | PLAT | EDGE | Team Atlas | BL-029, BL-045 | PLAT-DEPLOY-v1 | 82 | Extension SDK boundary and policy-safe plugin runtime scaffolding delivered. |
| BL-047 | R4 | INT | INTEGRATION_SUITE | Team Bridge | BL-046 | INT-CONNECTOR-v2 | 78 | Partner connector kit and validation harness enables third-party integration onboarding. |
| BL-048 | R4 | OPS | EDGE | Team Forge | BL-046 | OPS-JOBFLOW-v1 | 77 | Edge/standalone edition interoperability sync model validated against core data contracts. |
| BL-049 | R4 | COMM | EDGE | Team Ledger | BL-046 | COMM-LICENSE-v1 | 74 | Module policy/rules engine supports controlled feature activation by entitlement profile. |
| BL-050 | R4 | PLAT | EDGE | Team Atlas | BL-046 through BL-049 | PLAT-DEPLOY-v1 | 73 | Ecosystem compatibility suite ensures extension/module upgrades do not regress core workflows. |

## Delivery Sequence Defaults
1. Complete R1 `PLAT`, `OPS`, `QUAL`, and `COMM` foundation items.
2. Freeze R1 contracts and run full acceptance matrix.
3. Execute R2 modules in parallel using stable R1 contracts.
4. Start R3 intelligence and multi-site work only after R2 contract maturity gate.
5. Use R4 as expansion track with compatibility-first governance.
