# Status

Canonical global execution queue for active backlog work.

## Queue Rules
- `STATUS.md` is the single source of truth for global priority order and active ownership.
- Treat `docs/backlog.md` as the index-first navigation entry point; open `docs/backlog/*.md` for release detail and `WORKLOG.md` / `WORKLOG.archive-*.md` for completion history.
- No coding without prior claim in `STATUS.md`.
- Agents should start with the highest-ranked eligible item.
- Soft claim model: one lead owner is required for active work; collaborators may be listed in `Owner`.
- Only the Coordinator may reprioritize `Rank` or `Priority`.
- Stale handoff rule: if `Updated` is older than 24 hours, another agent may claim the item after adding a handoff note below.
- On completion, remove the item from this active queue and append the completion to `WORKLOG.md`.
- Stream/team tags are encoded in `Work Item` text only (schema remains unchanged).

| Rank | Item ID | Priority | Status | Owner | Updated | Work Item |
| --- | --- | --- | --- | --- | --- | --- |

## Active Gate Defaults
- For BL-058 acceptance, duplicate/replay behavior is fixed to idempotent skip plus audit trail updates (no strict hard-reject mode).

## Handoff Notes

| Date | Item ID | From | To | Note |
| --- | --- | --- | --- | --- |
| 2026-03-28 | BL-160..BL-186 | @codex | @owner | Completed 20-item easy-implementation tranche: auth-event metadata guardrails and role-audit event split, audit summary capability + pagination/limits + streaming CSV, analytics statement-timeout handling, soft-delete deactivate semantics, calendar-valid date normalization, schema-doc and analytics-contract documentation/validators, context-budget and shard/ignore tooling hardening, var retention/cleanup and artifact detector tooling, and rolling docs/index automation with focused regression coverage. |
| 2026-03-28 | BL-188..BL-207 | @codex | @owner | Completed token-enhancement wave-3 20-item tranche: added/validated inventory + largest-file/docs/tests + jobflow/var/policy/ignore report commands, aggregate `context:all:report`, CI report-mode gate, pretty/compact + strict/warn modes, markdown/code budget checkers, unified remediation summary + duplicate detector, and supporting ops docs (quick-reference, troubleshooting, session checklist). |
| 2026-03-28 | BL-172 | @codex | @owner | Completed timezone clarity hardening: DB pool now enforces UTC session timezone (`options: -c timezone=UTC`) with explicit verification tests (`backend/test/timezone-utc.test.js`), frontend timestamp rendering now uses shared UTC formatter with explicit `UTC` suffix (`formatTimestampWithZone`), and UI timestamp surfaces were migrated off locale-implicit `toLocale*` formatting (collector + formbuilder + shared `fmtTs`). |
| 2026-03-28 | BL-159 | @codex | @owner | Completed shared revision utility consolidation: canonical converters now live in shared frontend utility, backend re-exports from that source, and shared regression verifies parity/edge cases across both runtimes. |
| 2026-03-28 | BL-158 | @codex | @owner | Completed reset-default-password hardening: endpoint now requires explicit `userIds`, enforces max-50 contract with 422 on overflow, and emits per-user password-reset audit events in one transaction. |
| 2026-03-28 | BL-152 | @codex | @owner | Completed timing-safe compare enforcement: auth password verification uses `crypto.timingSafeEqual` across success/failure paths with regression coverage. |
| 2026-03-28 | BL-151 | @codex | @owner | Completed password-rotation token abuse controls: token attempts are counted, lock at threshold (3), and lock/attempt audit events are persisted with focused test coverage. |
| 2026-03-28 | BL-150 | @codex | @owner | Completed generic auth failure contract: login failure responses now return unified `invalid_credentials` without account-state disclosure, while detailed causes remain server-side/audited. |
| 2026-03-28 | BL-146 | @codex | @owner | Completed static analysis gate enforcement: CI now runs explicit frontend lint and backend security/lint gates via standardized scripts before test gates. |
| 2026-03-28 | BL-145 | @codex | @owner | Completed CSP hardening tranche: script-src unsafe-inline removed from frontend CSP in index and Vite dev/preview headers, directives aligned for stricter runtime policy with current UI constraints. |
| 2026-03-28 | BL-144 | @codex | @owner | Completed password complexity upgrade: policy now requires length>=12 plus uppercase/number/special with explicit validation error contract and updated tests. |
| 2026-03-28 | BL-143 | @codex | @owner | Completed API versioning foundation: `/api/v1` route surface mounted as primary contract and legacy `/api` alias now returns compatibility/deprecation headers. |
