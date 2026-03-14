# Backlog (Active Build)

## Implemented Baseline
- Server-side capability enforcement across CRUD and workflow endpoints.
- Record submission validation (payload shape, OOT comment requirement, reference checks).
- Job lock ownership enforcement with admin override unlock.
- End-to-end validation pass for role gating, workflow validation, and export coverage.
- Demo UI ported into structured screens with role selector, user management, measurement flow, supervisor edits, and admin CRUD.
- Record export (CSV), audit log capture/display, and migration/seed scripts.

## Active Backlog Items (ID Indexed)

Completed from active queue:
- `BL-001` implemented.
- `BL-002` implemented.
- `BL-003` implemented.
- `BL-004` implemented.
- `BL-005` implemented.
- `BL-006` implemented.
- `BL-007` implemented.
- `BL-008` implemented.
- `BL-009` implemented.
- `BL-010` implemented.
- `BL-011` implemented.
- `BL-012` implemented.
- `BL-013` implemented.
- `BL-014` implemented.

### BL-011 (P1) Jobs CSV Import
- Add a Jobs CSV import endpoint, template, and Admin UI flow similar to Tools and Part Dimensions imports.
- Support create/upsert behavior with validation for part/revision/operation references.
- Return row-level error context for invalid records.

### BL-012 (P1) Import Integrations (API/Webhook/Excel)
- Add backend integration hooks for all three import domains: tools, part dimensions, and jobs.
- Add pull-oriented integration endpoints/services to ingest payloads from future customer APIs/webhooks.
- Add initial live Excel-connection support path (poll + ingest) for customer-maintained sheets.

### BL-013 (P1) Measurement Data Ingestion
- Add bulk measurement ingestion APIs for external systems (multi-job, multi-operation payloads).
- Add operator-facing per-job/per-operation CSV upload for measured values.
- Provide measurement import templates and validation feedback.

### BL-014 (P2) Raw Data Processing + Manual Resolution
- Build an ingest processing engine that can normalize non-template/raw measurement data.
- Auto-clean/sort/recognize records and map data to app dimensions where confidence is high.
- Add unresolved-items workflow/tab with user override/manual assignment for ambiguous rows.

## Recently Completed
- BL-014: Added raw-ingest normalization with unresolved queue storage and Admin manual resolve/ignore workflow for ambiguous measurement rows.
- BL-013: Added bulk measurement ingestion APIs and operator-facing per-job CSV import path with measurement templates.
- BL-012: Added integration configuration + pull/webhook ingestion hooks, run logging, and scheduler-based polling support for API/Excel connectors.
- BL-011: Added Jobs CSV import endpoint/template/UI with upsert behavior and row-level validation feedback.
- BL-010: Added tool calibration due-date tracking, current/home location assignment, and admin-managed location master CRUD with Tool Library UI integration.
- BL-008: Added large-catalog Part Setup controls (search/filter/pagination) and a structured bulk part-name update workflow/API for mass updates.
- BL-007: Added required revision inputs for part/job creation, persisted job revision code, and enforced part+revision validation in job APIs and admin job flows.
- BL-006: Added revision-controlled setup snapshots with automatic progression (`A..Z`, `AA..` onward), revision history lookup, CSV/setup change-triggered revision capture, and admin revision-review confirmations before commit.
- BL-001: Added explicit loading/success/failure transition states for create/update flows and deployment-gated UI transition tests.
- BL-002: Added multi-tool-per-dimension capture (same-type and mixed-type) in operator flow, persistence, and record detail/export rendering.
- BL-003: Updated regenerated lot-family logic to reuse original base prefix and apply a consistent incremented run index across sibling operations.
- BL-004: Normalized operation number handling to `001`-`999` across setup validation and job-number generation paths.
- BL-005: Added setup-critical dimension snapshots on record persistence and switched record detail/export to snapshot-backed dimension metadata.
- Added sampling plan extensions: `first_middle_last` and `custom_interval` (`sampling_interval` support end-to-end).
- Added CSV import APIs and templates for tools and part-dimension setup ingestion.
- Added Admin `Data Imports` tab with template download/sample load/upload and post-import data refresh.
- Added integration strategy doc for API/webhook and staged import architecture.
- Added live Users-page role permission summaries derived from role capability configuration.
- Added quality role support and role descriptions on Users page.
- Switched Users page to single `Save All` with unsaved-changes warning.
- Added role capability editor (Admin can modify what each role can access/do).
- Removed operator name input in Job Entry; Current User is authoritative.
- Added OOT submission confirmation.
- Added Records view for operators/supervisors with search, sort, and lot filter.
- Added filtered CSV export for records list.
- Added tool size attribute and search support.
- Added common tool templates and manual IT# type-to-select input.
- Added min/max range mode per dimension.
- Added error boundary and hardened create/update flows against blank-screen failures.
- Added unsaved-changes guard for Users/Roles/Parts tabs and tab navigation.
- Improved supervisor edit UX with highlighted target cell and clearer context.
- Added deployment hardening tests for permission enforcement and workflow validation scenarios.
