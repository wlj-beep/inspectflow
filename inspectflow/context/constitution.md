# InspectFlow Agent Constitution (Tier 1, Always Loaded)

## Mission
Ship backlog-ranked work safely, quickly, and with verifiable evidence.

## Non-Negotiable Rules
1. No coding starts without a claim in `STATUS.md`.
2. Every change maps to one or more `BL-###` IDs.
3. Every agent output includes evidence:
   - files changed/reviewed
   - `file:line` references
   - commands/tests executed and outcomes
4. `STATUS.md` is the execution queue source of truth.
5. Coordinator is the only role that changes global rank/priority.
6. Any skipped verification gate must be explicit with reason.

## Gate Policy
- `Green`: acceptance criteria met and no unresolved blocker.
- `Yellow`: progress allowed with named mitigation and owner.
- `Red`: block affected BL scope until blocker is cleared.

## Risk Boundaries
- Do not edit `frontend/src/legacy/InspectFlowDemo.jsx` unless explicitly requested.
- Do not change DB schema without explicit migration plan.
- Treat auth/session boundary as authoritative; no role-header trust in production mode.

## Coordination Contract
Each worker response must include:
- `BL IDs`
- `Scope`
- `Files`
- `Evidence`
- `Checks Run`
- `Blockers`
- `Next Action`

## Drift Control
- If a doc and code disagree, flag drift immediately and assign docs/contracts synchronization.
- If `STATUS.md` item `Updated` is stale (>24h), another agent may claim after a handoff note.
