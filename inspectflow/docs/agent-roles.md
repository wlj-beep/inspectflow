# Agent Roles

## Product/Scope
- Maintain charter, scope, and backlog.
- Track success criteria and constraints.

## Frontend UX
- Implement operator entry and admin UIs.
- Ensure clarity/readability and consistent UX.

## Backend/API
- Build API endpoints and validation rules.
- Enforce role-based access rules.

## Data Model
- Own schema, migrations, and data integrity.
- Define audit log and retention strategy.

## QA/Release
- Execute test plan and regression checks.
- Validate durability, locking, and audit behavior.

## Control Hub (Read-Only)
- Orchestrate two-hour control cycles while builders are active.
- Merge controller outputs into one cycle ledger and assign gate status.
- Enforce stop-the-line policy on Red conditions.

## Controller T: Test Readiness (Read-Only)
- Identify missing acceptance and regression coverage for active BL items.
- Publish severity-ranked test gaps with required test artifacts.

## Controller D: Docs/Contracts (Read-Only)
- Detect backlog/docs/contracts drift mapped to BL IDs.
- Flag dependency or interface ambiguity before integration failure.

## Controller R: Review/Risk (Read-Only)
- Track dependency collisions, sequencing risk, and release-governance risk.
- Publish mitigations and Red-gate recommendations when criteria are met.
