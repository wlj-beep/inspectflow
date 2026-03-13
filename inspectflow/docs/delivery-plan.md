# Delivery Plan

## Phase 0: Foundation
- Create workspace and docs.
- Confirm MVP scope and data model.

## Phase 1: Backend Skeleton
- Project setup (Node/Express).
- Postgres schema and migrations.
- CRUD endpoints for users, tools, parts, operations, dimensions, jobs.

## Phase 2: Core Workflow
- Job lookup + load.
- Measurement grid with sampling logic and Go/No-Go mode.
- Submit flows: close job, partial submit, save draft.

## Phase 3: Supervisor/Admin
- Records list + record detail view.
- Supervisor edits + audit log capture.
- Admin config screens: parts/ops/dims/tools/users.

## Phase 4: Hardening
- Job locking.
- Data durability verification.
- Manual export (CSV/PDF placeholder).

## Phase 5: Validation
- Test plan execution.
- UX pass for clarity/readability.

## Backlog (Post-MVP)
- Integrations (tool data capture, ERP/MES import).
- Authentication/SSO.
- Automated backup scheduler.
- Multi-site support.
