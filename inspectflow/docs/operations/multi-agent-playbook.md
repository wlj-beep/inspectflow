# Multi-Agent Playbook (Canonical)

## Purpose
Provide one clear, repeatable operating model for delivering backlog work with Codex multi-agent mode.

## Prerequisites
1. Multi-agent is enabled in `~/.codex/config.toml`:
   - `[features]`
   - `multi_agent = true`
2. Codex has been restarted after config changes and restart marker is set:
   - `npm run ops:multi-agent:mark-restart`
3. Preflight passes for claimed scope:
   - `npm run ops:multi-agent:check -- --bl "BL-###" --run-context-validate`
4. Work item is claimed in `STATUS.md`.
5. Context packet generated for the claimed scope:
   - `npm run context:build -- --task "<summary>" --bl "BL-###" --signals "api,ui,auth"`

## Three-Tier Context Policy
- Tier 1 (always loaded): `context/constitution.md` + core project docs.
- Tier 2 (specialists): role cards from `context/specialists/*.md`.
- Tier 3 (on-demand): task-scoped retrieval paths from `context/retrieval-map.json`.

Load order is mandatory: Tier 1 -> Tier 2 -> Tier 3.

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
2. Build context packet and include it in the run handoff.
3. Write bounded sub-agent task packets.
4. Spawn sub-agents in parallel.
5. Wait for all sub-agents and collect evidence.
6. Resolve overlap/conflicts, then integrate.
7. Run final verification.
8. Publish run report with gate (`Green | Yellow | Red`).
9. Update `STATUS.md`, `docs/backlog.md` / `docs/backlog/*.md` (if needed), and `WORKLOG.md` or archive shards (on completion).

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
