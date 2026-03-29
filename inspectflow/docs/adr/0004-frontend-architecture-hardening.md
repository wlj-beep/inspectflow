# ADR 0004: Frontend Architecture Hardening Baseline (BL-093)

## Status
Accepted

## Context
`frontend/src/domains/jobflow/InspectFlowApp.jsx` accumulated most UI logic, helper utilities, fallback data, and transient UI state in a single monolith file. This increased coupling, duplicated core utilities (`fmtTs`, revision/op helpers), and made safe incremental migration difficult.

## Decision
Adopt a domain + shared split with strict TypeScript boundaries for new critical surfaces:
- Consolidate jobflow core helpers into typed shared utilities (`src/shared/utils/jobflowCore.ts`) and import them from both app and mappers.
- Move reusable UI primitives into shared components (`src/shared/components/*`) instead of inline component definitions.
- Extract transition toast state orchestration into a domain hook (`src/domains/jobflow/hooks/useTransitionToasts.js`) to isolate app-shell state transitions.
- Replace hardcoded seeded UI bootstrap data with explicit empty-state boot defaults and auth-aware fallback users (`src/domains/jobflow/domainConfig.js`).
- Enable strict TypeScript checks for migrated typed surfaces via `frontend/tsconfig.json` and enforce lint/format/typecheck scripts as quality gates.

## Consequences
- File concentration risk is reduced by moving non-view concerns out of `InspectFlowApp.jsx`.
- Shared behavior becomes reusable and easier to test across domains.
- Legacy JS remains in place for staged migration, while strict TS is active for migrated modules.
- UI fallback behavior no longer depends on baked-in seeded IDs/data assumptions.
