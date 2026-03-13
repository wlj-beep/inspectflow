# Contributing to InspectFlow

This repository uses a short-lived branch + pull request workflow.

## Branching Standard
- `main` is protected and releasable at all times.
- All work happens on a feature branch and merges via PR.
- Branch naming:
  - `codex/<scope>-<YYYY-MM-DD>` for agent-driven changes.
  - `feature/<scope>-<ticket>` or `fix/<scope>-<ticket>` for human-authored changes.
- Keep branches short-lived (target: 1-3 days). Rebase/merge from `main` frequently.

## Commit Standard
- Commit by logical unit of change, not by time. Keep commits reviewable.
- Aim for atomic commits that compile/test on their own when feasible.
- Suggested format: `<type>(<scope>): <summary>`
  - Examples: `feat(imports): add tools csv import endpoint`, `fix(records): enforce edit mode validation`
- Avoid committing generated/cache artifacts (`.npm-cache`, `node_modules`, test reports, coverage).

## PR Standard
- Open a PR from your branch into `main`.
- Keep PRs scoped; split unrelated work into separate PRs.
- Required before merge:
  - CI green.
  - PR template fully completed.
  - Risk and rollback notes documented.
  - Queue/docs artifacts updated (`STATUS.md`, `WORKLOG.md`, `docs/backlog.md`) when applicable.

## Merge Strategy
- Preferred: **Squash merge** to keep `main` linear and readable.
- Use merge commits only when preserving branch history is intentionally required.
- Do not push directly to `main`.

## Recommended Cadence
- For active work, push at least daily so work is backed up and visible.
- Commit whenever a meaningful checkpoint is reached (passing tests, completed subtask, safe rollback point).
- Daily branches are not required; branch lifespan should be task-driven.
