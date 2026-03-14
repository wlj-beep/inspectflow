# Operations Docs

## Purpose
Runbooks and templates for multi-agent orchestration, execution gates, and delivery evidence.

## Canonical Documents
- `multi-agent-playbook.md`: canonical operating model and execution sequence.
- `controller-prompts.md`: reusable controller/sub-agent prompt templates.
- `launch-checklist.md`: fast-start checklist for a clean multi-agent run.
- `cycle-control-ledger-template.md`: multi-agent run report template (gate + findings).
- `next-step-packet-template.md`: sub-agent task packet template.

## Artifacts
- Store run outputs under `docs/operations/cycles/` using `YYYY-MM-DD-C#` naming.
- Include at minimum:
  - one run report (ledger)
  - one task packet per active sub-agent track
  - a consolidated controller summary with gate status

## Historical Note
- Files under `docs/operations/cycles/` are historical execution snapshots.
- Do not treat cycle snapshots as policy source; use the canonical documents above.
