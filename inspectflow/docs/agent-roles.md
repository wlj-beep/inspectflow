# Agent Roles (Multi-Agent Model)

Use these roles as reusable sub-agent tracks under one controller session.

## Controller (Orchestrator)
- Owns plan, decomposition, and merge order.
- Keeps sub-agent scopes non-overlapping.
- Enforces BL mapping, evidence quality, and gate decisions.
- Produces one consolidated run report with final next actions.

## Implementer: Backend/API
- Builds API, validation, and data-layer changes.
- Flags contract or migration impacts early.
- Provides targeted tests and evidence for changed paths.

## Implementer: Frontend/UX
- Builds operator/admin UI flows and interaction fixes.
- Keeps behavior aligned with role/capability constraints.
- Provides UI verification steps and test evidence.

## Implementer: Integrations/Analytics/Quality (As Needed)
- Owns stream-specific module changes (`INT`, `ANA`, `QUAL`).
- Preserves core compatibility and contract boundaries.
- Reports upstream/downstream dependency risks explicitly.

## Verifier (Quality Gate)
- Runs focused test suites and regression checks.
- Confirms acceptance criteria and identifies residual risk.
- Recommends `Green`, `Yellow`, or `Red` gate status with rationale.

## Docs and Contracts Steward
- Updates backlog/docs/contracts that changed with implementation.
- Detects drift between code, acceptance criteria, and stream contracts.
- Ensures completion evidence is present in queue/worklog artifacts.
