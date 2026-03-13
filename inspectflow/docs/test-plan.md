# MVP Manual Test Plan

This checklist validates the MVP requirements and is intended for manual execution.

## Automated Smoke Tests
1. Ensure `DATABASE_URL_TEST` is set in `backend/.env`.
2. Run `npm run test` from the repo root.

## Latest Validation Run (2026-03-12)
- Executed `npm run test` from repo root: API + UI suites passing.
- Added backend regression coverage for:
  - Capability enforcement across admin/workflow endpoints.
  - Job lock ownership rules and `manage_jobs` override unlock.
  - Record validation for invalid dimension/tool references.
  - Missing-piece reason requirements (`Scrapped`, `Other`, `Unable to Measure`).
  - Supervisor edit audit-log integrity and CSV export verification.
  - Role capability read/write persistence checks.
  - Part setup revision progression/history (`A..Z`, `AA..`) and historical revision lookup via API.
  - Part/job revision-required workflow validation and part+revision enforcement for job create/update APIs.
  - Bulk part-name update workflow (`/api/parts/bulk-update`) and large-catalog filtering controls in Part Setup.
  - Tool calibration/location tracking with admin-managed location master (`/api/tool-locations`) and location-in-use safeguards.

## Setup
1. Start Postgres.
2. Start backend (`npm run dev`) and frontend (`npm run dev`).
3. Ensure `Live Data` chip is green.
4. Select a current user in the header.

## Tests

1. Sampling logic coverage
   - Create a part/operation with one dimension each for `first_last`, `every_5`, `every_10`, and `100pct`.
   - Create jobs with different quantities (e.g., 1, 8, 12).
   - Verify sampling pieces match expected rows in the measurement grid.

2. OOT logic (asymmetric tolerances + comment gating)
   - Create a dimension with asymmetric tolerance (e.g., nominal 1.0000, tol +0.0050, tol -0.0010).
   - Enter an out-of-tolerance value.
   - Verify OOT banner appears and comment is required before submit.

3. Missing piece flow
   - Leave required sample values blank and attempt partial submit.
   - Verify missing-piece modal appears.
   - Choose `Scrapped` and confirm NC # is required.
   - Choose `Other` and confirm details are required.
   - Choose `Unable to Measure` and confirm submission allowed.

4. Role gating + capability editor
   - As Operator: Admin tab hidden; Records view visible.
   - As Quality: Admin tab visible; Jobs + Records available.
   - As Supervisor: Admin tab visible; Jobs + Records + job creation available.
   - As Admin: All admin tabs visible.
   - As Admin: open Roles tab and toggle a capability; verify UI visibility updates.

5. Audit log integrity
   - As Supervisor/Admin, open a record and edit a measurement value.
   - Provide a reason and save.
   - Verify audit log shows before/after, user, timestamp, and reason.

6. Job locking
   - Lock a job by loading it as User A.
   - Attempt to load the same job as User B and verify lock error.
   - Close or submit the job as User A and confirm lock is released.

7. Server-side permission enforcement
   - As Operator: attempt to create a Part/Operation/Dimension/Tool/User and verify the API rejects the action.
   - As Supervisor/Admin: verify job management actions succeed when `manage_jobs` is enabled.

8. Record submission validation
   - Submit an OOT record without a comment and verify the API rejects it.
   - Submit a record with an invalid dimension/tool reference and verify the API rejects it.

9. Record export
   - Open a record detail modal.
   - Click `Export CSV` and verify file downloads with values.
   - From Records list, apply a Lot filter and export filtered CSV.

10. Job Builder
   - Build jobs from Part + Lot with multiple operations.
   - Verify generated job numbers match base + op + remeasure index.
   - If lot exists, verify remeasure index increments.

11. Tool selection
   - Select Tool Name then type IT # to match an existing tool.
   - Verify invalid IT # shows warning and blocks submission.

12. Range input mode
   - Set a dimension input mode to `Range`.
   - Enter min/max values; verify OOT calculation and display.

13. Auto-timeout
   - Start a job entry and remain idle for 20 minutes.
   - Verify auto-save to draft and lock release.

14. Revision-controlled setup edits
   - As Admin, open `Part / Op Setup` and edit a setup-critical field (part name, operation label/number, dimension spec, or allowed tools).
   - Verify revision review confirmation appears before commit and shows current→next revision.
   - Verify part detail reflects incremented revision code after save.
   - Open a prior revision via API (`/api/parts/:id?revision=<code>`) and verify historical setup values are preserved.

15. Part/job revision input enforcement
   - In `Part / Op Setup`, verify creating a new part requires an initial revision entry.
   - In `Job Management`, verify creating a job requires selecting part revision.
   - Submit job create/update with an unknown part revision via API and verify it is rejected (`part_revision_not_found`).

16. Large-catalog setup controls and bulk updates
   - In `Part / Op Setup`, verify search filter and pagination reduce rendered part cards for large datasets.
   - Use bulk find/replace to apply name updates across filtered parts and verify summary results.
   - Verify updated parts receive new setup revisions and remain editable via normal per-part controls.

17. Tool calibration and location tracking
   - In `Tool Library`, create location master entries across machine/user/job/vendor/out-for-calibration types.
   - Create/update a tool with calibration due date, current location, and home location.
   - Verify deleting an in-use location is blocked (`location_in_use`), then clear tool references and verify delete succeeds.

## Notes
- If any test fails, capture the exact steps, user role, and any error message.
