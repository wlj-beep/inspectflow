# Operations Docs

## Purpose
Runbooks and templates for multi-agent orchestration, execution gates, and delivery evidence.

## Canonical Documents
- `multi-agent-playbook.md`: canonical operating model and execution sequence.
- `controller-prompts.md`: reusable controller/sub-agent prompt templates.
- `compact-prompt-packets.md`: low-token packet templates for deterministic sub-agent launches.
- `launch-checklist.md`: fast-start checklist for a clean multi-agent run.
- `cycle-control-ledger-template.md`: multi-agent run report template (gate + findings).
- `next-step-packet-template.md`: sub-agent task packet template.

## Artifacts
- Store run outputs under `docs/operations/cycles/` using `YYYY-MM-DD-C#` naming.
- Include at minimum:
  - one run report (ledger)
  - one task packet per active sub-agent track
  - a consolidated controller summary with gate status

## Report Generation
- Generate a run report with token/cost metrics:
  - `npm run ops:cycle:report -- --cycle 2026-03-31-C3 --window "09:00-11:00 ET" --controller codex-main --bl "BL-109,BL-112" --tracks "backend,frontend,verifier" --usage docs/operations/cycles/evidence/usage-1.json --usage docs/operations/cycles/evidence/usage-2.json --controllerPromptTokens 220 --acceptedChanges 6 --inputRatePerMillion 1.25 --outputRatePerMillion 10`
- Auto-discover usage data from an artifacts/log directory (recursive):
  - `npm run ops:cycle:report -- --cycle 2026-03-31-C3 --window "09:00-11:00 ET" --controller codex-main --bl "BL-109,BL-112" --tracks "backend,frontend,verifier" --usageDir docs/operations/cycles/evidence --controllerPromptTokens 220 --acceptedChanges 6 --inputRatePerMillion 1.25 --outputRatePerMillion 10`
- Convenience command with default evidence directory:
  - `npm run ops:cycle:report:auto -- --cycle 2026-03-31-C3 --window "09:00-11:00 ET" --controller codex-main --bl "BL-109,BL-112" --tracks "backend,frontend,verifier" --controllerPromptTokens 220 --acceptedChanges 6 --inputRatePerMillion 1.25 --outputRatePerMillion 10`
- Output default: `docs/operations/cycles/<cycle>-run-report.md`

## Historical Note
- Files under `docs/operations/cycles/` are historical execution snapshots.
- Do not treat cycle snapshots as policy source; use the canonical documents above.
