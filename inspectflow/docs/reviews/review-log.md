# Review Log

Immutable log of completed code review sessions. Each entry is anchored to a git commit hash.

The most recent row's `Commit Hash` is used by `scripts/review-since-last.sh` to scope delta review sessions.

## Rules
- Append only. Rows are never edited or deleted.
- `Commit Hash` must be the HEAD at the time the session findings file was finalized.
- `Session ID` format: `RV-S###` (global sequential counter).
- Stats columns reflect post-disposition counts (after owner approval pass).

## Session Log

| Date | Session ID | Mode | Scope | Commit Hash | Findings | Approved | Deferred | Rejected |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-03-26 | RV-S001 | Full | All modules (backend routes, services, analytics, integrations, frontend, tests, DB schema, docs) | b77fd19a99b59d31ebf130b70e0e9c63b61691a9 | 45 | 45 | 0 | 0 |
