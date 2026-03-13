# Deployment Governance Plan

This plan defines the minimum controls required before any deployment.

## Repository Controls
- Protect `main` and any release branches.
- Require pull request reviews and status checks.
- Require review from code owners once defined.
- Require conversation resolution before merge.
- Restrict who can push to protected branches.
- Disable force-push to protected branches.

## Change Classification
- Standard: low risk, repeatable changes. Reviewer Agent approval required.
- Normal: moderate risk or data-impacting changes. Reviewer Agent approval plus Coordinator Agent sign-off.
- Emergency: urgent fixes. Reviewer Agent approval required; document justification and follow-up review.

## Required Checks
- Coordination queue validation (`npm run coordination:check`).
- API smoke tests (`npm run test:api`) or repo root `npm run test`.
- UI smoke tests (`npm run test:ui`) for UI-impacting changes.
- Manual tests from `docs/test-plan.md` when behavior changes.

## Deployment Flow
1. Validate required checks and Reviewer Agent approval.
2. Confirm rollback steps for any production-impacting change.
3. Deploy to staging or a pilot environment if available.
4. Deploy to production only after validation and Coordinator Agent sign-off.

## Records
- Each change must have a PR summary and a `WORKLOG.md` entry.
- Capture test evidence and any risk notes in the PR.
