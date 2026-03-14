# Persistent Agent Cadence (4 Builders + 3 Read-Only Controllers)

## Purpose
Operationalize a continuous oversight model that supports parallel delivery without interfering with active builders.

## Topology
- `1` Control Hub thread (orchestrator)
- `4` Builder threads (feature execution)
- `3` Controller threads (non-coding oversight):
  - `Controller T`: test readiness
  - `Controller D`: docs/contracts drift
  - `Controller R`: review/risk

## Core Rules
1. Keep existing builder threads untouched while this model is active.
2. Controllers are read-only: no repo edits, no backlog ownership claims, no branch orchestration.
3. Controllers must map every finding to explicit `BL-###` IDs.
4. Control Hub is the only escalation authority for gate state changes.
5. New work starts are blocked whenever any Red gate is open.

## Cadence
- Run cycle every `2` hours when at least one builder is active.
- Run event-triggered cycle on blocker signals:
  - Builder reports unresolved dependency collision
  - Builder reports missing interface contract
  - Builder reports missing release-critical test coverage
  - Builder reports risk likely to slip release gate

## Gate Policy
- `Green`: proceed normally.
- `Yellow`: continue in-flight work; no scope expansion for impacted item until mitigation exists.
- `Red`: stop-the-line; freeze new starts until mitigation closes the Red condition.

## Capacity Guardrails
- Max active builders: `4`
- Max active controllers: `3`
- Temporary `4th` controller allowed only during release cutover week.
- If all gates are Green for `2` consecutive cycles, remain in same topology but switch controllers to lightweight reports.

## Cycle Protocol
1. Controllers publish findings for active BL items.
2. Hub merges findings into one `Cycle Control Ledger`.
3. Hub publishes builder-specific next-step packets.
4. Hub sets gate status and escalation state.
5. If Red exists, hub freezes new starts and routes mitigation packets.

## Baseline Cycle 0 (Immediate Launch)
1. Start/retain Control Hub thread.
2. Start Controller `T`, `D`, `R` threads.
3. Run Baseline Cycle 0 against currently active BL items.
4. Publish first merged ledger and next-step packets.
5. Schedule next cycle in two hours while builders remain active.

## Evidence and Artifacts
- Ledger template: `docs/operations/cycle-control-ledger-template.md`
- Next-step packet template: `docs/operations/next-step-packet-template.md`
- Prompt pack: `docs/operations/controller-prompts.md`

