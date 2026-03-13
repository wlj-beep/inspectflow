# ADR 0001: Authorization Strategy (MVP)

## Status
Accepted

## Context
The MVP has no authentication. The UI already uses `role_capabilities` to gate navigation and actions. We need server-side enforcement without introducing auth or breaking workflows.

## Decision
Use the `x-user-role` header as a workflow hint and enforce access through `role_capabilities` in the API. All sensitive endpoints (admin CRUD, job management, record submit/edit) require explicit capabilities. The users list remains readable to support user selection in an unauthenticated UI.

## Consequences
- Capability changes take effect immediately in API behavior.
- This is not a security boundary; production must replace it with authenticated identity + authorization.
- API consumers must send `x-user-role` for protected routes.
