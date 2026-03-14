# Coordination Plan

## Goals
- Enable parallel development across specialized teams.
- Preserve one canonical queue and stable backlog IDs.
- Prevent interface drift and integration conflicts.

## Canonical Artifacts
- `STATUS.md`: active ranked queue.
- `docs/backlog.md`: release-aware backlog with metadata.
- `docs/backlog-framework.md`: required metadata and scoring model.
- `docs/stream-contracts-*.md`: cross-team interface contracts.
- `WORKLOG.md`: historical completion record.

## Stream Ownership
- `PLAT` -> Team Atlas
- `OPS` -> Team Forge
- `QUAL` -> Team Helix
- `INT` -> Team Bridge
- `ANA` -> Team Signal
- `COMM` -> Team Ledger

Each backlog item has exactly one owning stream/team.

## Working Rules
1. No coding without a valid claimed/queued backlog item.
2. `STATUS.md` remains schema-stable and globally ranked.
3. Stream/team tags are included in `Work Item` text only.
4. Cross-team work must reference a contract ID.
5. Breaking contract changes require version bump and release approval.
6. Completed work updates backlog state and appends `WORKLOG.md`.

## Workflow Mode
- Default workflow is PR-based with protected `main`.
- For solo offline execution, direct push mode may be enabled temporarily per `docs/direct-push-mode.md`.

## Parallel Delivery Model
- Teams may run in parallel when dependencies are contract-satisfied.
- Contract-providing team owns interface test fixtures.
- Consuming teams cannot bypass unresolved dependency items.

## Intake and Prioritization
- New requests are mapped to release (`R1`-`R4`) and stream.
- Priority scoring follows `docs/backlog-framework.md`.
- Coordinator maintains final rank order in `STATUS.md`.

## Definition of Ready
- Required metadata complete.
- Dependencies explicit and valid.
- Interface contract exists and is owned.
- Acceptance criteria testable.

## Definition of Done
- Acceptance criteria pass.
- Contract updates documented.
- Queue/backlog state updated.
- Worklog entry added for completed deliverables.
