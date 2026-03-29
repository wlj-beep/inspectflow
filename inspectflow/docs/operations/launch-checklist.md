# Launch Checklist (Multi-Agent)

Use this checklist before starting any non-trivial implementation run.

## Preconditions
1. Confirm the target `BL-###` row is claimed in `STATUS.md`.
2. Confirm dependencies for the item are satisfied or explicitly blocked.
3. Confirm acceptance criteria are clear in `docs/backlog.md`.
4. Run preflight check: `npm run ops:multi-agent:check -- --bl "BL-###" --run-context-validate`.
   - The preflight includes a dry-run `var:cleanup` pass so stale `var/load` and `var/update-bundles` artifacts are surfaced before work starts.
5. If config changed recently, restart Codex and record restart marker: `npm run ops:multi-agent:mark-restart`.

## Start Sequence
1. Open one controller session.
2. Build context packet: `npm run context:build -- --task "<summary>" --bl "BL-###" --signals "..."`.
3. Prepare sub-agent task packets using `docs/operations/next-step-packet-template.md`.
4. Spawn sub-agents for independent tracks only.
5. Require structured output contract from every sub-agent.

## Merge and Gate
1. Collect all sub-agent outputs.
2. Resolve overlap and conflicts.
3. Run final verification pass.
4. Publish run report using `docs/operations/cycle-control-ledger-template.md`.
5. Set gate status (`Green | Yellow | Red`) and list required mitigation.

## Closure
1. Update `STATUS.md`.
2. Update `docs/backlog.md` if item state or acceptance notes changed.
3. Append completion entry to `WORKLOG.md` when the item is done.
