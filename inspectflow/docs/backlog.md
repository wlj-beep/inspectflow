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

## Recently Completed
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
