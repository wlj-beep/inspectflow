# ADR 0002: Job Lock Ownership and Overrides

## Status
Accepted

## Context
Jobs are locked to prevent concurrent measurement entry. The UI includes an admin force-unlock action and an operator auto-unlock on submit/draft. Server-side checks must prevent unrelated users from unlocking active locks.

## Decision
Require lock ownership for operator unlocks, and allow forced unlocks only for roles with `manage_jobs`. Lock acquisition remains optimistic for the same user and denies other users when an active lock exists.

## Consequences
- Operators cannot unlock another user's active lock.
- Admin/Supervisor can recover from stuck locks.
- Unlock requests should include `userId` for operator flows.
