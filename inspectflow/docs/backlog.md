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
- `BL-009` implemented.

### BL-006 (P2) Revision-Controlled Part Setup
- Implement revision-controlled part setups with progression `A-Z`, then `AA-ZZ`, and onward.
- Trigger new setup revisions when setup-critical fields change.
- Preserve and expose historical revisions for audit and lookup.
- In admin editing flows, show revision impact/next revision and require review before commit.

### BL-007 (P2) Part and Job Revision Inputs and Enforcement
- Add part-level revision as a first-class concept across lifecycle flows.
- Require revision input when creating parts and creating jobs.
- Enforce jobs can only be created for existing part+revision combinations.
- Support continued production against older revisions when needed.
- Rename part creation field label from `Part Description` to `Part Name`.

### BL-008 (P2) Part Setup Scalability
- Improve part setup UX for large catalogs (1000+ parts), including browse/search/filter/edit performance.
- Add bulk-management paths (for example import/upload and structured mass update workflows).

### BL-009 (P3) Users/Permissions UX Synchronization
- Make user-page permission descriptions realtime and derived from current role capability configuration.
- Keep summaries concise while reflecting capability changes immediately.

### BL-010 (P3) Tool Calibration and Location Tracking
- Add tool calibration expiration date.
- Add tool current location tracking (machine, user, job, vendor, out for calibration).
- Add tool home-location tracking.
- Add admin-managed location master data for valid location options.

## Recently Completed
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
