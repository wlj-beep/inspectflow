# Backlog (Active Build)

## Implemented Baseline
- Server-side capability enforcement across CRUD and workflow endpoints.
- Record submission validation (payload shape, OOT comment requirement, reference checks).
- Job lock ownership enforcement with admin override unlock.
- End-to-end validation pass for role gating, workflow validation, and export coverage.
- Demo UI ported into structured screens with role selector, user management, measurement flow, supervisor edits, and admin CRUD.
- Record export (CSV), audit log capture/display, and migration/seed scripts.

## Active Backlog Items (ID Indexed)

### BL-001 (P0) UX Quality Hardening and Transition Stability
- Establish and enforce a UX-first quality bar across views and workflows.
- Eliminate white-screen transitions during create/update flows with explicit loading, success, and failure states.
- Add deployment-gated tests that cover loading and transition behavior to prevent blank-screen regressions.

### BL-002 (P0) Multi-Tool Measurement Handling per Dimension
- Support multiple IT numbers of the same tool type for a single dimension.
- Support mixed tool types for a single dimension (for example, partial hard-gage and partial variable measurement).
- Support multiple variable tools for one dimension while preserving existing validation integrity.

### BL-003 (P1) Regenerated Job-Family Numbering Consistency
- Complete duplicate/regenerated job logic so regenerated families reuse the original base job prefix.
- Ensure run index increments consistently across sibling operation jobs.
- Preserve pattern: initial run `base + operation + 01`; regenerated run `base + operation + 02`, etc.

### BL-004 (P1) Operation Number Range Normalization
- Support operation numbers from `001` to `999` consistently in setup, job creation, and job-number generation logic.
- Normalize validation and formatting rules across API and UI flows.

### BL-005 (P1) Inspection Snapshot and Historical Correctness
- Snapshot setup-critical values at job start (nominal, tolerances, sampling, and related setup metadata).
- Preserve historical inspection correctness when setup definitions are edited later.

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
