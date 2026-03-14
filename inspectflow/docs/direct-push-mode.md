# Direct Push Mode (Solo Offline)

Use this document when you intentionally want direct pushes to `main` (no PR gate) for faster single-maintainer iteration.

## When This Mode Is Appropriate
- You are the only maintainer actively pushing.
- Repository is private.
- You want lower process overhead while working offline.

## GitHub Setting Changes

### If your repository uses Rulesets
1. GitHub -> repository -> `Settings`.
2. `Rules` -> `Rulesets`.
3. Open the ruleset that applies to `main`.
4. Disable or remove the rule:
   - `Require a pull request before merging`.
5. Save.

### If your repository uses legacy Branch Protection rules
1. GitHub -> repository -> `Settings`.
2. `Branches`.
3. Edit the rule for `main`.
4. Turn off:
   - `Require a pull request before merging`.
5. Save.

## Validation Steps
Run from repo root:
```bash
npm run coordination:check
npm run test
```

Then test direct push path:
```bash
git switch main
git pull --ff-only origin main
git push origin main
```

Expected result: push succeeds without `GH013` PR-rule rejection.

## Recommended Minimal Safety Controls
- Keep GitHub account 2FA enabled.
- Keep repo private.
- Use small commits with clear messages.
- Keep regular local backups and/or periodic tags.

## Rollback
If needed:
1. Re-enable PR requirement in GitHub settings.
2. Revert bad commit(s) with `git revert <sha>` and push.
