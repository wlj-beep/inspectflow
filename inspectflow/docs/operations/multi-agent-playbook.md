# Multi-Agent Playbook (Canonical)

## Purpose
Provide one clear, repeatable operating model for delivering backlog work with Codex multi-agent mode.

## Prerequisites
1. Multi-agent is enabled in `~/.codex/config.toml`:
   - `[features]`
   - `multi_agent = true`
2. Codex has been restarted after config changes.
3. Work item is claimed in `STATUS.md`.

## Execution Model
- One controller session owns the run.
- Controller spawns parallel sub-agents with independent scopes.
- Every sub-agent is mapped to one or more explicit `BL-###` IDs.
- Controller consolidates outputs into one final report and gate decision.

## Recommended Track Split
Use only tracks that are needed:
- Backend/API implementation
- Frontend/UI implementation
- Integrations/analytics/quality implementation
- Verifier (tests/regression)
- Docs/contracts synchronization

## Standard Run Sequence
1. Confirm claimed `BL-###`, dependencies, and acceptance criteria.
2. Write bounded sub-agent task packets.
3. Spawn sub-agents in parallel.
4. Wait for all sub-agents and collect evidence.
5. Resolve overlap/conflicts, then integrate.
6. Run final verification.
7. Publish run report with gate (`Green | Yellow | Red`).
8. Update `STATUS.md`, `docs/backlog.md` (if needed), and `WORKLOG.md` (on completion).

## Gate Policy
- `Green`: acceptance met, no unresolved blocking risk.
- `Yellow`: progress allowed, but specific mitigation required before close.
- `Red`: stop new starts for impacted BL IDs until blocker is cleared.

## Evidence Requirements
Every sub-agent output must include:
- `BL-###` mapping
- files changed or reviewed
- tests/commands executed
- concrete evidence (`file:line`, failure output, or reproducible steps)
- blockers and required next action

## Prompt Discipline
- Keep prompts short and bounded.
- Assign ownership by file paths or contract boundaries.
- Require structured output so controller merge is deterministic.
- Ask sub-agents to avoid touching out-of-scope files.

## CSV/Batch Pattern
When analyzing many items:
- Use one row per isolated unit of work.
- Require structured JSON output per row (`id`, `status`, `findings`, `next_action`).
- Merge and de-duplicate findings in controller summary.
