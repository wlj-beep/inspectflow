# Contributing to InspectFlow

This repository supports two workflow modes:
- `PR Mode` (default): short-lived branch + pull request.
- `Solo Offline Direct Push Mode` (optional): direct commits/pushes to `main` for single-maintainer offline execution.

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

## Solo Offline Direct Push Mode (Optional)
Use this mode only when one trusted maintainer owns the repository and wants faster iteration.

### Enable in GitHub (Rulesets path)
1. Open repository `Settings`.
2. Open `Rules` -> `Rulesets`.
3. Open the ruleset that targets the default branch (`main`).
4. For direct push mode, disable or remove the requirement:
   - `Require a pull request before merging`.
5. Save changes.

### Enable in GitHub (Legacy Branch Protection path, if used)
1. Open repository `Settings`.
2. Open `Branches`.
3. Under `Branch protection rules`, edit the rule for `main`.
4. Uncheck:
   - `Require a pull request before merging`.
5. Save changes.

### Recommended minimal safeguards (keep fast, still safe)
- Keep repository private.
- Keep 2FA enabled on the GitHub account.
- Keep local pre-push gate:
  - `npm run coordination:check`
  - `npm run test`

### Direct push sequence
```bash
git switch main
git pull --ff-only origin main
npm run coordination:check
npm run test
git add -A
git commit -m "feat: <summary>"
git push origin main
```

### Security note
Private + single-user reduces collaboration risk, but does not remove risk:
- local machine compromise,
- credential/token leak,
- accidental destructive pushes.
Direct push mode trades review controls for speed.

## Recommended Cadence
- For active work, push at least daily so work is backed up and visible.
- Commit whenever a meaningful checkpoint is reached (passing tests, completed subtask, safe rollback point).
- Daily branches are not required; branch lifespan should be task-driven.
