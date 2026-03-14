# Operations Docs

## Purpose
Runbooks and templates for agent orchestration, control cadence, and escalation governance.

## Documents
- `persistent-agent-cadence.md`: canonical operating model (`1` hub + `4` builders + `3` controllers).
- `controller-prompts.md`: verbatim prompts to launch non-coding control agents.
- `cycle-control-ledger-template.md`: required merged cycle ledger structure.
- `next-step-packet-template.md`: per-builder instruction packet template.
- `launch-checklist.md`: fast start sequence for activating hub/controllers without interfering with active builders.

## Cycle Artifacts
- Store cycle outputs under `docs/operations/cycles/` using `YYYY-MM-DD-C#` naming.
- Baseline package:
  - `cycles/2026-03-14-C0-ledger.md`
  - `cycles/2026-03-14-C0-builder-packet-atlas.md`
  - `cycles/2026-03-14-C0-builder-packet-bridge.md`
  - `cycles/2026-03-14-C0-builder-packet-helix.md`
  - `cycles/2026-03-14-C0-builder-packet-signal-forge.md`
