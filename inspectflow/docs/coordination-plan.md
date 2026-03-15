# Coordination Plan

## Goals
- Enable parallel delivery across specialized streams.
- Preserve one canonical ranked queue and stable backlog IDs.
- Prevent interface drift and integration conflicts.
- Keep execution focused on end-to-end backlog completion.

## Canonical Artifacts
- `STATUS.md`: active ranked queue.
- `docs/backlog.md`: release-aware backlog with metadata.
- `docs/backlog-framework.md`: required metadata and scoring model.
- `docs/backlog-intake-protocol.md`: mandatory pre-backlog intake gate.
- `docs/stream-contracts-*.md`: cross-stream interface contracts.
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
1. No coding without a valid claimed backlog item in `STATUS.md`.
2. `STATUS.md` remains schema-stable and globally ranked.
3. Stream/team tags appear in `Work Item` text only.
4. Cross-stream work must reference a contract ID.
5. Breaking contract changes require version bump and release approval.
6. Completed work updates backlog state and appends `WORKLOG.md`.
7. Multi-agent execution is mandatory for non-trivial work: one controller plus parallel sub-agents.
8. Sub-agent scopes must be independent and BL-mapped.
9. Every finding/deliverable must include evidence (`file:line`, command/test output, or explicit reproduction steps).

## Workflow Mode
- Default workflow is PR-based with protected `main`.
- For solo offline execution, direct push mode may be enabled temporarily per `docs/direct-push-mode.md`.

## Multi-Agent Delivery Model
- Use one controller session to orchestrate bounded sub-agent tasks.
- Default cap: up to `4` concurrent implementation sub-agents plus one verifier/doc pass.
- If scope crosses multiple streams, assign one sub-agent per stream boundary.
- Controller owns deduplication, merge sequencing, and blocker escalation.
- Controllers and sub-agents may edit code when their assigned track requires it; read-only oversight-only topology is retired.

## Intake and Prioritization
- New requests are mapped to release (`R1`-`R4`) and stream.
- Intake must follow `docs/backlog-intake-protocol.md` before any backlog insertion.
- Candidate ideas require duplicate scan across `docs/backlog.md`, `STATUS.md`, and recent `WORKLOG.md` entries.
- Realism gate outcome must be one of `Reject`, `Defer`, or `Accept`.
- Only `Accept` outcomes may create a new `BL-###` row in `docs/backlog.md`.
- Accepted intake items must be recorded in `WORKLOG.md` (default recording path: backlog + worklog).
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
- Latest multi-agent run report has no unresolved Red gate for the delivered BL IDs.

## Operating Assets
- `docs/operations/multi-agent-playbook.md`
- `docs/operations/controller-prompts.md`
- `docs/operations/cycle-control-ledger-template.md`
- `docs/operations/next-step-packet-template.md`
- `docs/operations/launch-checklist.md`
