# InspectFlow Project Charter

## Purpose
Build a production-ready, on‑prem manufacturing inspection system that replaces paper-based measurement collection with a simple, readable, and reliable digital workflow. The MVP mirrors the demo workflows while adding role-based access (without authentication) and data durability on a local network.

## Goals
- Deliver an on‑prem web app (React UI + Node/Express API + Postgres).
- Preserve demo workflows and UX concepts while improving clarity and readability.
- Ensure durable writes for all submitted data.
- Provide role-based access control without login in MVP.

## Non-Goals (MVP)
- Hardware/tool integrations (CMM, gauges, OPC, etc.).
- ERP/MES integrations.
- SSO/AD authentication.
- Multi-site or multi-tenant support.

## Users and Roles
- Operator: Measurement entry only.
- Supervisor: Can edit operator-entered values, manage jobs/tools, and review incomplete submissions.
- Admin: Manages parts/operations/dimensions and user role list.

## Success Criteria
- Operators can complete end-to-end inspection flows identical to demo behavior.
- Supervisors can review and edit with audit history.
- Admin can define parts, operations, dimensions, tools, and user roles.
- Data is safely stored locally after each submit/edit.

## Constraints
- Data must remain on customer’s local network.
- Demo remains frozen; all development forks into a new workspace.
