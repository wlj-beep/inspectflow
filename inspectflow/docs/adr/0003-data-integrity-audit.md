# ADR 0003: Record Validation and Audit Integrity

## Status
Accepted

## Context
Record submission and supervisor edits must preserve auditability and avoid inconsistent data (invalid dimensions/tools, missing OOT comments, or malformed payloads).

## Decision
Validate record payload shape and references in the API before writes. Require OOT comments when `oot=true`. Wrap record value edits and audit log entries in a single transaction.

## Consequences
- Invalid payloads return 4xx errors early instead of failing at the DB layer.
- Audit log entries remain consistent with record edits.
- Clients must provide complete, validated record data for submissions.
