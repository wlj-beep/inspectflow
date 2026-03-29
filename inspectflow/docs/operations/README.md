# Operations Docs

## Purpose
Runbooks and templates for multi-agent orchestration, execution gates, and delivery evidence.

## Canonical Documents
- `multi-agent-playbook.md`: canonical operating model and execution sequence.
- `controller-prompts.md`: reusable controller/sub-agent prompt templates.
- `context-infrastructure.md`: three-tier context loading policy and commands.
- `launch-checklist.md`: fast-start checklist for a clean multi-agent run.
- `cycle-control-ledger-template.md`: multi-agent run report template (gate + findings).
- `next-step-packet-template.md`: sub-agent task packet template.
- `cloud-saas-baseline.md`: single-tenant cloud deployment baseline and artifact map.
- `cloud-backup-env-contract.md`: object-storage backup environment contract.
- `cloud-first-run-admin-checklist.md`: first-run admin bootstrap checklist.
- `cloud-gov-cloud-notes.md`: AWS GovCloud and Azure Government deployment notes.
- `token-efficiency-commands.md`: quick reference for token/context scan commands and `context:all:report`.
- `token-efficiency-troubleshooting.md`: fast triage guide for token-check failures.
- `token-efficiency-session-checklist-template.md`: reusable checklist template for token-efficiency waves.
- `context-untracked-artifact-detector.md`: local command contract for large untracked artifact checks before review.
- Worklog archive helper: `npm run worklog:archive` for a dry-run preview and `npm run worklog:archive:apply` to move aged completion rows into the archive shard.
- Backlog navigation uses `docs/backlog.md` as the index and `docs/backlog/*.md` for release shards.
- Worklog navigation uses `WORKLOG.md` for the recent window and `WORKLOG.archive-*.md` for older history.

## Artifacts
- Store run outputs under `docs/operations/cycles/` using `YYYY-MM-DD-C#` naming.
- Include at minimum:
  - one run report (ledger)
  - one task packet per active sub-agent track
  - a consolidated controller summary with gate status

## Historical Note
- Files under `docs/operations/cycles/` are historical execution snapshots.
- Do not treat cycle snapshots as policy source; use the canonical documents above.
- Root-level `.agentignore` and `.rgignore` files intentionally hide runtime/vendor noise from agent scans while leaving source and docs visible.
