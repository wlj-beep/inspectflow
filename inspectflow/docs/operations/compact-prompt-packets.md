# Compact Prompt Packets

Use these packets when launching sub-agents to minimize token overhead while keeping output deterministic.

## Packet Format
- `BL IDs`: explicit IDs only
- `Goal`: one sentence
- `In-Scope Files`: explicit path list
- `Out-of-Scope Files`: explicit path list
- `Acceptance`: max 3 bullets
- `Checks`: max 3 commands
- `Output Schema`: fixed fields

## Controller Packet (Template)
- `BL IDs`: `<BL-###, ...>`
- `Goal`: deliver acceptance with one merged gate.
- `Tracks`: `<Backend|Frontend|Verifier|Docs>` (only required tracks)
- `Constraints`:
  - keep prompts <= target budgets
  - do not include full docs in messages
  - assign disjoint file ownership

## Backend Packet (Template)
- `BL IDs`: `<BL-###, ...>`
- `Goal`: `<single-sentence objective>`
- `In-Scope Files`: `<paths>`
- `Out-of-Scope Files`: `frontend/**`, `docs/**` (unless explicitly assigned)
- `Acceptance`:
  - `<criterion 1>`
  - `<criterion 2>`
- `Checks`:
  - `<command 1>`
  - `<command 2>`
- `Output Schema`: `BL IDs`, `Scope`, `Files`, `Evidence`, `Checks Run`, `Blockers`, `Next Action`

## Frontend Packet (Template)
- `BL IDs`: `<BL-###, ...>`
- `Goal`: `<single-sentence objective>`
- `In-Scope Files`: `<paths>`
- `Out-of-Scope Files`: `backend/**`, `docs/**` (unless explicitly assigned)
- `Acceptance`:
  - `<criterion 1>`
  - `<criterion 2>`
- `Checks`:
  - `<command 1>`
  - `<command 2>`
- `Output Schema`: `BL IDs`, `Scope`, `Files`, `Evidence`, `Checks Run`, `Blockers`, `Next Action`

## Verifier Packet (Template)
- `BL IDs`: `<BL-###, ...>`
- `Goal`: validate regressions/acceptance risks only
- `Checks`:
  - `<gate command 1>`
  - `<gate command 2>`
- `Output Schema`: `BL IDs`, `Scope`, `Evidence`, `Checks Run`, `Blockers`, `Next Action`, `Gate Recommendation`
