# Token-Efficiency Session Checklist

Use this template at the start of a token-efficiency wave.

## Session Header
- Date:
- Owner:
- Wave or BL IDs:
- Goal:
- Working branch or workspace:

## Preflight
- [ ] Confirm the active queue items in `STATUS.md`.
- [ ] Confirm the relevant backlog shard entries.
- [ ] Run `npm run context:remediation:summary` to capture the current violation mix.
- [ ] Run the relevant budget, shard, duplicate, and untracked checks for the wave.
- [ ] Note any known legacy links, historical shards, or ignored runtime paths.

## Execution
- [ ] Keep changes scoped to the active wave.
- [ ] Split large files before adding new ones.
- [ ] Favor report commands before enforcement changes.
- [ ] Record changed files as you go.
- [ ] Capture the first command output that shows the fix taking effect.

## Validation
- [ ] Run `npm run context:budget`.
- [ ] Run `npm run context:budget:report`.
- [ ] Run `npm run context:remediation:summary`.
- [ ] Run `npm run context:duplicates:check`.
- [ ] Run `npm run context:shards:check`.
- [ ] Run `npm run context:untracked:check`.
- [ ] Run the relevant build or test command for touched files.

## Evidence Log
| Field | Value |
| --- | --- |
| Primary command | |
| Secondary command | |
| Evidence artifact path | |
| Failure / fix summary | |
| Reviewer-ready note | |

## Closeout
- [ ] Update the session plan with completion notes.
- [ ] Add evidence paths to the worklog or cycle report.
- [ ] Remove completed items from the active queue.
