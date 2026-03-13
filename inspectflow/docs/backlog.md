# Backlog (Active Build)

## Structural Hardening (Priority)
- Implemented: server-side capability enforcement across CRUD + workflow endpoints.
- Implemented: record submission validation (payload shape, OOT comment requirement, reference checks).
- Implemented: job lock ownership enforcement with admin override unlock.
- Next: run end-to-end validation pass and capture any permission gaps.

## Backend
- Implemented: users/tools/parts/operations/dimensions/jobs CRUD
- Implemented: job lock/unlock
- Implemented: record submission + audit log
- Implemented: record export (CSV)
- Implemented: migrate/seed scripts

## Frontend
- Implemented: demo UI port into structured screens
- Implemented: role selector + user management table
- Implemented: measurement flow + job lock to API
- Implemented: supervisor record review + edit with audit reason
- Implemented: admin CRUD for parts/ops/dimensions/tools/jobs/users
- Implemented: record export (CSV) + audit log display

## Data
- Seed demo-like sample data

## QA
- Next: execute manual test plan for sampling, OOT, missing pieces, audit log, locks, role gating

## Recently Completed
- Enforced server-side capabilities for admin, job, and record actions.
- Added record payload validation and OOT comment enforcement.
- Hardened job unlock rules (owner-required unless admin override).
- Added Quality role support and role descriptions on Users page.
- Users page: switched to single "Save All" with unsaved changes warning.
- Tools lifecycle: replace deletes with Active/Selectable toggles and enforce open/draft job safety checks.
- Added role capability editor (Admin can modify what each role can access/do).
- Removed operator name input in Job Entry; Current User is authoritative.
- Added OOT submission confirmation.
- Added Records view for operators/supervisors with search + sort.
- Added filtered CSV export for records list.
- Added lot filter for records.
- Tool enhancements: size attribute + search includes size.
- Tool enhancements: common tool templates.
- Tool selection: manual IT # entry via type-to-select input.
- Measurement input UX: min/max range mode per dimension.
- Added error boundary to avoid blank-screen failures.
- Added unsaved-changes guard for Users/Roles/Parts tabs and tab navigation.
- Improved supervisor edit UX with highlighted target cell and clearer context.
- Applied consistent dropdown styling for new selection controls.
- Added error boundary and handled create flows to prevent blank-screen issues.
- Exported filtered/lot records to CSV (verify format in QA).
- Admin override for locked jobs + auto-timeout to draft/unlock.
- Track user sign-in/sign-out times (user sessions).
- Added "Unable to Measure" missing-piece reason.
- Job Builder: create jobs by part + lot, auto-generate job numbers with remeasure index.
- Standardized job numbering scheme (base + op + remeasure index).

## Backlog Additions (Post-Review)
