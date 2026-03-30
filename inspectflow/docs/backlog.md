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
| BL-018 | R1 | COMM | CORE | Team Ledger | BL-015, BL-051 | COMM-SEAT-v1 | 90 | Soft seat visibility/warning behavior and audit trace are delivered via `COMM-SEAT-v1`, with `COMM-LICENSE-v1` entitlement metadata consumed as dependency context. |
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
| BL-030 | R1 | PLAT | CORE | Team Atlas | BL-015, BL-016, BL-017, BL-018, BL-019, BL-020, BL-021, BL-022, BL-023, BL-024, BL-025, BL-026, BL-027, BL-028, BL-029, BL-051 | PLAT-DEPLOY-v1 | 99 | R1 acceptance matrix automated and manual release evidence checklist completed. |
| BL-051 | R1 | PLAT | CORE | Team Atlas | BL-015 | PLAT-ENT-v1 | 89 | Entitlement and module-flag read contract is delivered as the authoritative gating source consumed by commercialization and multi-site controls. |
| BL-052 | R1 | PLAT | CORE | Team Atlas | None | PLAT-TEST-v1 | 97 | Standardized test platform is rebuilt end-to-end with live UI critical-path coverage, backend persistence checks, CI quality gates, and updated agent/testing runbooks. |
| BL-053 | R1 | PLAT | CORE | Team Atlas | BL-052, BL-019, BL-021 | PLAT-DEPLOY-v1 | 95 | Admin-safe technical ops APIs expose system health, DB/storage signals, backup status, and error/event summaries. |
| BL-054 | R1 | PLAT | CORE | Team Atlas | BL-053, BL-055, BL-057, BL-058 | PLAT-DEPLOY-v1 | 89 | Admin `Technical Ops` tab ships in-app for integration setup visibility, runtime status, failures/delays, and operational actions with usability-first layout. |
| BL-056 | R1 | PLAT | CORE | Team Atlas | BL-052 | PLAT-TEST-v1 | 94 | Repeatable 10x synthetic data generation and load test gate validates ingest/runtime behavior under increased workload. |
| BL-057 | R1 | PLAT | CORE | Team Atlas | BL-021, BL-053 | PLAT-BACKUP-v1 | 90 | On-prem data lifecycle management is explicit: retention, capacity visibility, backup footprint, and operator runbook controls. |
| BL-060 | R1 | PLAT | CORE | Team Atlas | BL-015, BL-028 | PLAT-AUTH-v1 | 84 | After successful authentication, UI identity controls show the signed-in user name only and remove post-login dropdown-style user selection. |
| BL-061 | R1 | PLAT | CORE | Team Atlas | BL-027, BL-028 | QUAL-EXPORT-v1 | 86 | Export-capable pages provide an optional "select records for export" mode that reveals row checkboxes only when enabled, updates actions to "Export selected ... CSV", and exports only the checked records. |

## R2 Backlog (Enterprise Expansion)

| ID | Release | Stream | Module | Owner Team | Dependencies | Interface Contract | Priority Score | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BL-031 | R2 | INT | INTEGRATION_SUITE | Team Bridge | BL-029 | INT-CONNECTOR-v2 | 93 | Connector runtime retry/replay and failure-policy controls implemented with deterministic run outcomes. |
| BL-032 | R2 | INT | INTEGRATION_SUITE | Team Bridge | BL-031 | INT-IDEMPOTENCY-v2 | 92 | External IDs and idempotency semantics applied across imported entities. |
| BL-033 | R2 | INT | INTEGRATION_SUITE | Team Bridge | BL-031, BL-032 | INT-INGEST-v1 | 88 | ERP/job adapter pack maps to canonical ingest contract without domain-side custom forks. |
| BL-034 | R2 | QUAL | QUALITY_PRO | Team Helix | BL-026, BL-027 | QUAL-FAI-v2 | 91 | First-article workflow depth supports part and lot scopes with guided trace linkage. |
| BL-035 | R2 | QUAL | QUALITY_PRO | Team Helix | BL-034 | QUAL-EXPORT-v1 | 87 | Customer-selectable export profile packs delivered with compatibility fixtures. |
| BL-036 | R2 | PLAT | CORE | Team Atlas | BL-016 | PLAT-AUTH-v1 | 82 | Optional AD/SSO integration path implemented without breaking local account mode. |
| BL-037 | R2 | COMM | QUALITY_PRO | Team Ledger | BL-018, BL-036, BL-051 | COMM-SEAT-v2 | 80 | Optional paid hard-seat modes (named/device/concurrent) implemented behind entitlement flags. |
| BL-038 | R2 | INT | INTEGRATION_SUITE | Team Bridge | BL-031 | INT-CONNECTOR-v2 | 84 | Integration observability/support bundle provides operator-safe troubleshooting and replay context. |
| BL-055 | R2 | INT | INTEGRATION_SUITE | Team Bridge | BL-031, BL-038, BL-053 | INT-CONNECTOR-v2 | 92 | Integration monitoring provides per-connector status, run outcomes, replay/error context, and connected service health indicators. |
| BL-058 | R2 | INT | INTEGRATION_SUITE | Team Bridge | BL-032, BL-033 | INT-IDEMPOTENCY-v2 | 96 | Duplicate/replay policy is enforced across all ingest entrypoints (manual/import/webhook/API) as idempotent skip + audit. |

## R3 Backlog (Intelligence and Multi-Site)

| ID | Release | Stream | Module | Owner Team | Dependencies | Interface Contract | Priority Score | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BL-039 | R3 | ANA | ANALYTICS_SUITE | Team Signal | BL-026, BL-031 | ANA-MART-v3 | 90 | Analytics marts built from traceable source contracts with reproducible transformations. |
| BL-040 | R3 | ANA | ANALYTICS_SUITE | Team Signal | BL-039 | ANA-KPI-v3 | 88 | Operator/supervisor KPI dashboards delivered with validated metric definitions. |
| BL-041 | R3 | ANA | ANALYTICS_SUITE | Team Signal | BL-039 | ANA-KPI-v3 | 86 | Machine and tool performance analytics include calibration-impact correlation views. |
| BL-042 | R3 | QUAL | QUALITY_PRO | Team Helix | BL-039, BL-041 | ANA-RISK-v3 | 85 | Quality anomaly and escalation workflows consume and integrate `ANA-RISK-v3` events with traceable evidence links; ANA owns the risk contract semantics. |
| BL-043 | R3 | ANA | MULTISITE | Team Signal | BL-039 | ANA-MART-v3 | 83 | Multi-site partition-aware analytics model implemented with site boundary safeguards. |
| BL-044 | R3 | PLAT | MULTISITE | Team Atlas | BL-043, BL-036, BL-051 | PLAT-AUTH-v1 | 82 | Multi-site access and reporting controls enforce site-level authorization separation. |
| BL-045 | R3 | ANA | ANALYTICS_SUITE | Team Signal | BL-040, BL-041, BL-042, BL-043, BL-044 | ANA-KPI-v3 | 79 | Analytics performance and cost controls meet defined SLO thresholds. |
| BL-059 | R3 | ANA | ANALYTICS_SUITE | Team Signal | BL-039, BL-040, BL-041, BL-042, BL-054 | ANA-KPI-v3 | 83 | Admin operational analytics and risk rollups provide high-level reporting without exposing restricted raw payloads. |

## R4 Backlog (Platform and Ecosystem)

| ID | Release | Stream | Module | Owner Team | Dependencies | Interface Contract | Priority Score | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BL-046 | R4 | PLAT | EDGE | Team Atlas | BL-029, BL-045 | PLAT-DEPLOY-v1 | 82 | Extension SDK boundary and policy-safe plugin runtime scaffolding delivered. |
| BL-047 | R4 | INT | INTEGRATION_SUITE | Team Bridge | BL-046 | INT-CONNECTOR-v2 | 78 | Partner connector kit and validation harness enables third-party integration onboarding. |
| BL-048 | R4 | OPS | EDGE | Team Forge | BL-046 | OPS-JOBFLOW-v1 | 77 | Edge/standalone edition interoperability sync model validated against core data contracts. |
| BL-049 | R4 | COMM | EDGE | Team Ledger | BL-046, BL-051 | COMM-LICENSE-v1 | 74 | Module policy/rules engine supports controlled feature activation by entitlement profile. |
| BL-050 | R4 | PLAT | EDGE | Team Atlas | BL-046, BL-047, BL-048, BL-049 | PLAT-DEPLOY-v1 | 73 | Ecosystem compatibility suite ensures extension/module upgrades do not regress core workflows. |

## R5 Backlog (UI/UX Modernization)

| ID | Release | Stream | Module | Owner Team | Dependencies | Interface Contract | Priority Score | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BL-062 | R5 | OPS | CORE | Team Forge | BL-028 | OPS-JOBFLOW-v1 | 96 | URL-driven navigation persists top-level view and admin subsection with shareable deep links and stable refresh behavior. |
| BL-063 | R5 | OPS | CORE | Team Forge | BL-062 | OPS-JOBFLOW-v1 | 95 | Admin information architecture is flattened with grouped left-sidebar navigation replacing sub-tab sprawl. |
| BL-064 | R5 | PLAT | CORE | Team Atlas | BL-028 | PLAT-UX-v1 | 94 | Toast/notification stack supports concurrent non-blocking status events with severity-aware persistence and dismissal. |
| BL-065 | R5 | OPS | CORE | Team Forge | BL-028 | OPS-JOBFLOW-v1 | 93 | Jobs and records tables support consistent page-size controls and pagination for large datasets. |
| BL-066 | R5 | PLAT | CORE | Team Atlas | BL-028 | PLAT-UX-v1 | 92 | Loading skeletons, actionable empty states, and visible focus rings are standardized across primary UI surfaces. |
| BL-067 | R5 | OPS | CORE | Team Forge | BL-028 | OPS-JOBFLOW-v1 | 90 | Operator flow shows explicit step progress and pinned specification headers throughout entry workflow. |
| BL-068 | R5 | OPS | CORE | Team Forge | BL-065 | OPS-JOBFLOW-v1 | 89 | Measurement entry supports compact/expanded density modes plus active row/column context highlighting. |
| BL-069 | R5 | OPS | CORE | Team Forge | BL-065 | OPS-JOBFLOW-v1 | 88 | Data tables expose unified filter bars with URL-synced state and quick clear controls. |
| BL-070 | R5 | PLAT | CORE | Team Atlas | BL-066 | PLAT-UX-v1 | 87 | Keyboard and assistive support is hardened (Escape modal close, arrow-cell nav, aria-live announcements). |
| BL-071 | R5 | PLAT | CORE | Team Atlas | BL-062, BL-064, BL-066 | PLAT-UX-v1 | 86 | Home dashboard becomes default landing view with role-tailored status cards and actionable alerts. |
| BL-072 | R5 | OPS | CORE | Team Forge | BL-067 | OPS-JOBFLOW-v1 | 89 | Operator lookup supports quick filter chips (part, operation, status) for one-click job narrowing. |
| BL-073 | R5 | OPS | CORE | Team Forge | BL-065, BL-072 | OPS-JOBFLOW-v1 | 88 | Operator lookup job list adds scalable pagination with persistent page size and total counts. |
| BL-074 | R5 | OPS | CORE | Team Forge | BL-067 | OPS-JOBFLOW-v1 | 87 | Measurement table keeps dimension/spec header rows sticky during scroll for constant tolerance visibility. |
| BL-075 | R5 | OPS | CORE | Team Forge | BL-068 | OPS-JOBFLOW-v1 | 87 | Measurement entry exposes live sticky summary footer with pass/fail/NA counts. |
| BL-076 | R5 | PLAT | CORE | Team Atlas | BL-070 | PLAT-UX-v1 | 86 | Keyboard shortcut reference overlay (`?`) is available globally with discoverable hotkeys. |
| BL-077 | R5 | PLAT | CORE | Team Atlas | BL-066 | PLAT-UX-v1 | 85 | Destructive actions use explicit confirmation dialog flow instead of immediate single-click execution. |
| BL-078 | R5 | OPS | CORE | Team Forge | BL-063 | OPS-JOBFLOW-v1 | 84 | Admin forms include section headings and inline help for domain-heavy inputs (sampling interval, IT number, revision). |
| BL-079 | R5 | PLAT | CORE | Team Atlas | BL-066 | PLAT-UX-v1 | 84 | High-risk entry forms validate on blur with field-level feedback before submit. |
| BL-080 | R5 | OPS | CORE | Team Forge | BL-068 | OPS-JOBFLOW-v1 | 83 | Measurement table adds preset column width controls (narrow/default/wide) to reduce drag-only dependency. |
| BL-081 | R5 | PLAT | CORE | Team Atlas | BL-071 | PLAT-UX-v1 | 82 | Header chrome provides role-specific visual context accents to reinforce active working mode. |

## Delivery Sequence Defaults
1. Complete R1 `PLAT`, `OPS`, `QUAL`, and `COMM` foundation items.
2. Freeze R1 contracts and run full acceptance matrix.
3. Execute R2 modules in parallel using stable R1 contracts.
4. Start R3 intelligence and multi-site work only after R2 contract maturity gate.
5. Use R4 as expansion track with compatibility-first governance.
