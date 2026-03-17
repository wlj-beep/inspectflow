# InspectFlow Project Context

## What This Project Is
InspectFlow is an on-premises manufacturing inspection system. It replaces paper-based
measurement collection with a digital workflow for factory floors. It is deployed as a
local network server, not as a cloud service.

## Tech Stack
- **Runtime**: Node.js 20, vanilla JavaScript with ES modules ("type": "module")
- **Backend**: Express 4.x, PostgreSQL 15 via the `pg` library
- **Frontend**: React 18, Vite build, JSX — no TypeScript anywhere
- **No ESLint, no Prettier, no TypeScript** — plain JS throughout
- **Testing**: Vitest (backend unit/integration), Playwright (frontend E2E)

## Authentication Architecture
Two paths exist. The session path is the secure one:

1. **Session path (primary)**: `attachAuthSession` middleware reads a cookie, looks up
   the session in PostgreSQL, and sets `req.auth = { sessionId, expiresAt, user }`.
   Routes that require auth call `requireAuthenticated` (checks `req.auth?.user?.id`).
   Routes that require specific permissions call `requireCapability("capability-name")`
   or `requireAnyCapability([...])`, which queries the `role_capabilities` table.

2. **Legacy header path**: If `ALLOW_LEGACY_ROLE_HEADER=true` (or `NODE_ENV=test`),
   a caller can pass `x-user-role` and `x-user-id` headers to bypass session auth.
   This is a test convenience that must never be enabled in production.
   `getActorRole(req)` checks session first, falls back to the header only if the flag allows it.

## RBAC Roles
Valid roles: `Operator`, `Quality`, `Supervisor`, `Admin`
Capabilities are stored in the `role_capabilities` table and resolved at request time.

## Stream Domain Architecture
The backend services are organized by stream. These should have clean boundaries:
- `PLAT` (Team Atlas): `services/platform/` — auth, deployment, backup/restore, licensing
- `OPS` (Team Forge): `services/ops/` — job and routing operations
- `QUAL` (Team Helix): `services/quality/` — traceability and quality outputs
- `INT` (Team Bridge): `services/integration/` — ingestion and connectors
- `ANA` (Team Signal): `services/analytics/` — analytics and risk intelligence
- `COMM` (Team Ledger): commercial licensing and seat enforcement (also under `services/platform/`)

The target state is that each stream's services only import from their own stream or from
explicitly contracted shared modules. Cross-stream direct imports are an architectural risk.

## Key Backend Files
- `inspectflow/backend/src/index.js` — Express app setup, CORS, middleware chain, route mounting
- `inspectflow/backend/src/auth.js` — Session token creation, hashing, validation
- `inspectflow/backend/src/db.js` — PostgreSQL pool, `query()` and `transaction()` exports
- `inspectflow/backend/src/middleware/authSession.js` — `attachAuthSession`, `requireAuthenticated`, `getActorRole`
- `inspectflow/backend/src/middleware/requireCapability.js` — RBAC enforcement
- `inspectflow/backend/src/routes/` — Express routers (12+ files; `imports.js` is ~2,593 lines)
- `inspectflow/backend/src/services/{platform,ops,quality,integration,analytics}/` — Domain services

## Key Frontend Files
- `inspectflow/frontend/src/legacy/InspectFlowDemo.jsx` — Large monolithic component (under decomposition)
- `inspectflow/frontend/src/api/` — Typed API client layer; sends `x-user-role` header for test compat
- `inspectflow/frontend/src/domains/` — New domain-based component structure (work in progress)

## Known Patterns to Look For
- All SQL queries should use parameterized form: `query("SELECT ... WHERE id=$1", [id])`
- Routes should be thin: delegate business logic to service modules, not inline
- `requireCapability` should wrap every route that reads or mutates sensitive data
- `cors({ origin: true })` in `index.js` is intentional for local network use but notable
- `AUTH_COOKIE_SECURE` is environment-gated (false in dev, should be true in prod)
- The `src/future/` directory contains pre-built modules not yet wired into main routes
