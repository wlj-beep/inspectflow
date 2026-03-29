# `var/`

This directory stores generated runtime and workflow artifacts that should not be committed.

## Layout
- `var/load/`: generated load-test and import payloads.
- `var/update-bundles/`: generated update-bundle archives and manifests.
- `var/log/`: runtime logs.
- `var/runtime/`: PID files and local runtime state.
- `var/backups/`: backup artifacts produced by local backup workflows.

## Cleanup Policy
Use `npm run var:cleanup` for a dry-run report or `npm run var:cleanup:apply` to delete matched artifacts.
For a machine-readable preview, use `npm run context:var:retention:preview`.

The cleanup utility applies these rules to each immediate child unit under `var/load/` and `var/update-bundles/`:
- prune when the newest file in the unit is older than 10 days, or
- prune when the unit total size is 256 KiB or greater for `var/load/`, or 320 KiB or greater for `var/update-bundles/`.

The command is deterministic and defaults to dry-run. It never touches `var/log/`, `var/runtime/`, or `var/backups/`.
The multi-agent preflight (`npm run ops:multi-agent:check`) runs the dry-run cleanup automatically so stale payloads are surfaced before a review session starts.

## Notes
- `var/` remains ignored by git.
- Keep large generated payloads here instead of checked-in docs or fixtures.
- If a workflow needs a longer retention window, update the cleanup script and this document together.
