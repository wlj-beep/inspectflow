# Coordination Plan

## Goals
- Prevent duplicate or conflicting work across agents.
- Ensure every change is reviewed and tested before merge or deploy.
- Keep a single source of truth for work in progress and intent.

## Roles
Coordinator Agent
- Owns work intake and de-duplication.
- Assigns a single owner to each work item.
- Maintains `STATUS.md` and `WORKLOG.md`.
- Sequences merges to reduce conflicts.
- Verifies that required checks and approvals are complete before changes are accepted.

Reviewer Agent
- Performs required code review for every change.
- Enforces PR checklist compliance and test evidence.
- Verifies rollback and risk notes for production-impacting changes.
- Flags cross-cutting impacts and requests additional reviewers when needed.

## Required Artifacts
- `STATUS.md`: live snapshot of active work, owners, and intent.
- `WORKLOG.md`: brief, chronological record of decisions and merged changes.
- PR template: consistent change summary, test plan, risk, and rollback fields.

## Working Rules
- One work item, one owner, one branch.
- No parallel work on the same file set without explicit coordination.
- If overlap is detected, the Coordinator Agent decides sequencing.
- Reviewer Agent approval is required before merge.
- High-risk changes require explicit approval and documented rollback steps.

## Definition of Ready
- Clear scope and acceptance criteria.
- Owner assigned in `STATUS.md`.
- Dependencies identified.

## Definition of Done
- Tests pass or are explicitly waived with justification.
- Reviewer Agent approval recorded.
- `WORKLOG.md` entry added with outcome and date.
