# Launch Checklist (Hub + Controllers, No Builder Interference)

Use this checklist when builders are already running and you need to activate oversight.

## Preconditions
1. Confirm active builder count is `<= 4` from `STATUS.md`.
2. Confirm builder ownership is unchanged (no reassignment by controllers).
3. Confirm controller charter is read-only.

## Start Sequence
1. Start or retain one `Control Hub` thread.
2. Start `Controller T`, `Controller D`, `Controller R` threads.
3. Paste prompts from `docs/operations/controller-prompts.md`.

## Baseline Cycle 0
1. Use `docs/operations/cycles/2026-03-14-C0-ledger.md` as initial merged ledger.
2. Dispatch builder packets:
   - `docs/operations/cycles/2026-03-14-C0-builder-packet-atlas.md`
   - `docs/operations/cycles/2026-03-14-C0-builder-packet-bridge.md`
   - `docs/operations/cycles/2026-03-14-C0-builder-packet-helix.md`
   - `docs/operations/cycles/2026-03-14-C0-builder-packet-signal-forge.md`
3. Schedule next cycle in 2 hours if any builder remains active.

## Operating Rules
- Controllers do not edit files or claim backlog items.
- Hub sets gate state and escalations only.
- Red gate freezes new starts immediately.
- Yellow gate permits in-flight work but blocks scope expansion for impacted BL items.

## Recurrence
- Every 2 hours while builders are active:
  1. Collect controller reports
  2. Publish merged ledger
  3. Publish refreshed builder packets
  4. Record gate state changes

