# Architecture

## Overview
On‑prem, single-site deployment:
- React frontend (browser-based)
- Node/Express API server
- Postgres database

MVP is intentionally unauthenticated; the API relies on the `x-user-role` header for capability gating. This is a workflow convenience, not a security boundary.

## Data Flow
1. Operator selects current user (role-bound) and job.
2. UI loads part/operation/dimensions and renders measurement grid.
3. Operator submits results; server persists record and updates job status.
4. Supervisor reviews records, edits values if needed, and audit entries are recorded.

## Role-Based Access (No Auth in MVP)
- Current user is selected from a managed user list.
- UI gates navigation and actions based on role:
  - Operator: entry only
  - Supervisor: edit + review
  - Admin: parts/ops/tools/users

Server-side enforcement uses `role_capabilities` to validate access for:
- Admin CRUD (parts, operations, dimensions, tools, users, roles)
- Job management and lock overrides
- Record submission and supervisor edits

## Job Locking
- When a job is loaded for entry, it is locked to a single active user session.
- Unlock on submit, save draft, or explicit release.
- Operators may only unlock their own locks; admins/supervisors can force unlock for stuck jobs.

## Validation & Data Integrity
- API validates record payload shape, reference integrity (dimensions/tools), and OOT comment requirements.
- Writes that update records and audit log entries are transactional to keep before/after history consistent.

## Backup & Durability
- All submissions and edits are durable writes to Postgres.
- MVP provides manual export; production requires automated local backups.

## Forward Compatibility (Post-MVP)
- Authentication/SSO: replace `x-user-role` header with authenticated identity + authorization layer.
- Integrations: define import boundaries for ERP/MES and tool data capture without altering core inspection flow.
- Multi-site: separate site boundaries and data partitions before any tenancy model change.
