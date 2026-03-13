# Coordination Plan

## Goals
- Prevent duplicate or conflicting work across agents.
- Drive work by one global ranked priority queue.
- Ensure every change is reviewed and tested before merge or deploy.

## Roles
Coordinator Agent
- Owns intake, de-duplication, and queue ordering.
- Maintains ranked priority order in `STATUS.md`.
- Maintains `WORKLOG.md` completion history.
- Resolves overlap and sequencing conflicts.

Reviewer Agent
- Performs required code review for every change.
- Enforces PR checklist compliance and test evidence.
- Verifies rollback and risk notes for production-impacting changes.

## Required Artifacts
- `STATUS.md`: canonical global execution queue and active ownership state.
- `docs/backlog.md`: backlog detail and acceptance context keyed by `BL-###` IDs.
- `WORKLOG.md`: chronological merged-change and decision history.
- PR template: consistent change summary, test plan, risk, rollback, and coordination approvals.
- `CONTRIBUTING.md`: repository Git workflow standards (branching, commits, PR/merge policy).

## Working Rules
- No coding without prior claim in `STATUS.md`.
- Agents start with the highest-ranked eligible queue item.
- Soft claim policy: one lead owner per active item; collaborators allowed only when listed in `Owner`.
- Only the Coordinator may change queue `Rank` or `Priority`.
- If `Updated` is older than 24 hours, another agent may take over after recording a handoff note in `STATUS.md`.
- Every `STATUS.md` item must reference a valid `BL-###` entry in `docs/backlog.md`.
- Reviewer Agent approval is required before merge.

## Definition of Ready
- Item exists in `docs/backlog.md` with a stable `BL-###` ID.
- Item is ranked in `STATUS.md` with `Priority` and `Status` set.
- Lead owner is assigned for active states (`Claimed`, `In Progress`, `Blocked`).

## Definition of Done
- Change is merged or explicitly closed.
- Queue entry is removed/closed in `STATUS.md`.
- `WORKLOG.md` entry is appended with date, owner, and result.
- Tests pass or are explicitly waived with justification.
