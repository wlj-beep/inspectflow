# Status

Canonical global execution queue for active backlog work.

## Queue Rules
- `STATUS.md` is the single source of truth for global priority order and active ownership.
- No coding without prior claim in `STATUS.md`.
- Agents should start with the highest-ranked eligible item.
- Soft claim model: one lead owner is required for active work; collaborators may be listed in `Owner`.
- Only the Coordinator may reprioritize `Rank` or `Priority`.
- Stale handoff rule: if `Updated` is older than 24 hours, another agent may claim the item after adding a handoff note below.
- On completion, remove the item from this active queue and append the completion to `WORKLOG.md`.

| Rank | Item ID | Priority | Status | Owner | Updated | Work Item |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | BL-001 | P0 | Queued |  | 2026-03-13T09:00:00-04:00 | UX quality hardening: eliminate white-screen transitions and add deployment-gated transition tests. |
| 2 | BL-002 | P0 | Queued |  | 2026-03-13T09:00:00-04:00 | Multi-tool measurement handling for a single dimension (same-type and mixed-type tools). |
| 3 | BL-003 | P1 | Queued |  | 2026-03-13T09:00:00-04:00 | Regenerated job-family numbering must reuse base prefix and increment run index consistently. |
| 4 | BL-004 | P1 | Queued |  | 2026-03-13T09:00:00-04:00 | Normalize operation number support and validation across setup and job creation (`001`-`999`). |
| 5 | BL-005 | P1 | Queued |  | 2026-03-13T09:00:00-04:00 | Snapshot setup-critical values at job start to preserve historical inspection correctness. |
| 6 | BL-006 | P2 | Queued |  | 2026-03-13T09:00:00-04:00 | Revision-controlled part setup model with revision progression and approval flow. |
| 7 | BL-007 | P2 | Queued |  | 2026-03-13T09:00:00-04:00 | Part+revision lifecycle enforcement for part creation and job creation workflows. |
| 8 | BL-008 | P2 | Queued |  | 2026-03-13T09:00:00-04:00 | Large-catalog part setup UX and bulk-management workflows. |
| 9 | BL-009 | P3 | Queued |  | 2026-03-13T09:00:00-04:00 | Realtime user permission descriptions derived from current role capabilities. |
| 10 | BL-010 | P3 | Queued |  | 2026-03-13T09:00:00-04:00 | Tool calibration expiration and tool location/home-location tracking with location master data. |

## Handoff Notes

| Date | Item ID | From | To | Note |
| --- | --- | --- | --- | --- |
| 2026-03-13 | BL-000 | @owner | @owner | Queue initialized for global ranking and claim coordination. |
