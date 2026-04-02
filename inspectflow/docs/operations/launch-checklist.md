# Launch Checklist (Multi-Agent)

Use this checklist before starting any non-trivial implementation run.

## Preconditions
1. Confirm the target `BL-###` row is claimed in `STATUS.md`.
2. Confirm dependencies for the item are satisfied or explicitly blocked.
3. Confirm acceptance criteria are clear in `docs/backlog.md`.
4. Confirm multi-agent mode is enabled and Codex has been restarted.

## Start Sequence
1. Open one controller session.
2. Prepare sub-agent task packets using `docs/operations/next-step-packet-template.md`.
3. Spawn sub-agents for independent tracks only.
4. Require structured output contract from every sub-agent.

## Merge and Gate
1. Collect all sub-agent outputs.
2. Resolve overlap and conflicts.
3. Run final verification pass.
4. Publish run report using `docs/operations/cycle-control-ledger-template.md` or generate it with `npm run ops:cycle:report -- ...`.
5. Set gate status (`Green | Yellow | Red`) and list required mitigation.
6. Record token and cost metrics for controller + sub-agent prompts and completions.

## Closure
1. Update `STATUS.md`.
2. Update `docs/backlog.md` if item state or acceptance notes changed.
3. Append completion entry to `WORKLOG.md` when the item is done.
