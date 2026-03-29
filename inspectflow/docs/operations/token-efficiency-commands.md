# Token-Efficiency Commands

Use these commands when you need a fast scan of repo size, context budget, or token-bloat hotspots.
The names below match the repo scripts so you can copy them directly into a shell or CI step.

## Core Commands
- `npm run context:validate`: validate the context packet before a larger scan.
- `npm run context:budget`: enforce the current context budget policy.
- `npm run context:budget:report`: emit a machine-readable budget summary.
- `npm run context:budget:report:pretty`: emit the budget summary in formatted JSON.
- `npm run context:budget:report:compact`: emit the budget summary as compact JSON.
- `npm run context:all`: run the aggregate token-efficiency command set.
- `npm run context:all:report`: run the aggregate set with log-friendly headings.
- `npm run var:cleanup`: preview stale `var/load` and `var/update-bundles` candidates without deleting them.
- `npm run var:cleanup:apply`: delete the stale `var` candidates after review.
- `npm run context:shards:check`: verify docs/worklog shard links.
- `npm run context:shards:check:strict`: fail fast on broken shard links.
- `npm run context:shards:check:warn`: report broken shard links without failing CI.
- `npm run context:duplicates:check`: hash-based duplicate large-file scan over the configured threshold.
- `npm run context:remediation:summary`: consolidate token-check violations into one JSON payload.
- `npm run context:budget:markdown:check`: scan tracked markdown/text files for line-budget overruns.
- `npm run context:budget:code:jobflow-tests`: scan jobflow source and backend/frontend tests for line-budget overruns.
- `npm run context:untracked:check`: detect large untracked files that may bloat agent scans.

## Quick Reports
- `npm run context:inventory` or `node scripts/context/report-tracked-inventory.mjs`
- `npm run context:largest-tracked` or `node scripts/context/report-largest-tracked.mjs --limit 15`
- `npm run context:largest-docs` or `node scripts/context/report-largest-docs.mjs --limit 10`
- `npm run context:largest-tests` or `node scripts/context/report-largest-tests.mjs --limit 10`
- `npm run context:jobflow:sizes -- --limit 10` or `node scripts/context/report-jobflow-sizes.mjs --limit 10`
- `npm run context:var:retention:preview` or `node scripts/context/report-var-retention-preview.mjs --limit 10`
- `npm run context:duplicates:check` or `node scripts/context/detect-duplicate-large-files.mjs --threshold-kb 200`
- `npm run context:remediation:summary`
- `npm run context:budget:policy`
- `npm run context:ignore:validate`

## Guardrails
- Keep reports JSON-first when possible so agents can compare runs quickly.
- Prefer `--limit` for top-N reports and `--prefix` for scoped scans.
- Use `--strict` only in CI or release-prep workflows.
- Use `context:budget:report:pretty` for human review and `context:budget:report:compact` for artifacts.
- Start with `npm run context:all:report` when you need a repo-health snapshot, then drill into the specific report that points at the hotspot.
- If multiple checks fail at once, run `npm run context:remediation:summary` and use the flattened `violations` array to sort the fix order.
