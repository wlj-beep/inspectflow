# Token-Efficiency Troubleshooting

Use this guide when a token-check, context scan, or repo-size report fails. Start with the consolidated view, then narrow to the specific command that named the violation.

## First Response
1. Run `npm run context:remediation:summary`.
2. Read the flattened `violations` array and note the first repeated offender type.
3. Re-run the underlying command directly if you need the full raw output.
4. Fix the smallest file or link set that removes the root cause.

## Common Failure Patterns
- `markdownLineBudget` or `codeLineBudget`: the summary will point at the longest offenders. Use `node scripts/context/report-largest-docs.mjs --limit 10` or `node scripts/context/report-largest-tests.mjs --limit 10` to find the biggest files, then split or shard the worst one.
- `broken-shard-link`: the docs point at a missing file or an outdated fragment. Repair the target, update the link, or move the historical content into the active shard tree.
- `large-untracked-file`: a generated artifact or local dump is sitting outside `var/`. Move it under an ignored runtime path or remove it from the repo root.
- `duplicate-large-file-group`: keep one canonical copy, delete the redundant blob, and refactor callers to reference the shared helper or source-of-truth file.
- `context:validate`: the context packet is missing or the shard references are stale. Rebuild the packet, then re-run the validator and the remediation summary.

## Fast Recovery Sequence
1. `npm run context:remediation:summary`
2. `npm run context:duplicates:check`
3. `npm run context:shards:check`
4. `npm run context:untracked:check`
5. `npm run context:budget`

## When To Escalate
- A fix would delete historical evidence that still needs to be referenced.
- The failing link is intentionally historical and should stay in a cycle archive.
- The same offender keeps reappearing after the obvious fix, which usually means a shared helper or package script still needs to be wired.

## Evidence To Capture
- The command that failed.
- The first offending file or link.
- The follow-up command that proves the fix.
- Any report JSON or console output that a reviewer can paste into a worklog or session note.
