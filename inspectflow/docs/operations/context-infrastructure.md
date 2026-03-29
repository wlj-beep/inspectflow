# Three-Tier Context Infrastructure

## Objective
Run every non-trivial agent workflow with predictable context load order to reduce drift and context-window waste.

## Tiers
1. Tier 1 (Always Loaded)
   - `context/constitution.md`
   - core repo docs from `context/retrieval-map.json` defaults
2. Tier 2 (Specialists)
   - role cards in `context/specialists/*.md`
3. Tier 3 (On-Demand Retrieval)
   - task-scoped docs/code selected by `context/retrieval-map.json`

## Commands
- Validate map:
  - `npm run context:validate`
- Build packet:
  - `npm run context:build -- --task "<summary>" --bl "BL-###" --signals "api,ui,auth"`
- Default packet output:
  - `docs/operations/context-packet.latest.md`

## Controller Workflow
1. Claim BL scope in `STATUS.md`.
2. Build context packet.
3. Spawn only specialists indicated by Tier 2 + Tier 3 signals.
4. Require output contract from all workers.
5. Run gate checks and publish final `Green|Yellow|Red`.
