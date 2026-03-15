# Live CI Flake RCA (2026-03-15)

## Summary
The repeated CI failures were not a single defect. They were a compound failure made of:
1. Fragile assumptions in `frontend/tests/live.critical.spec.js` (hard-coded badge/revision/operation expectations).
2. Host inconsistency in CI/live runs (`127.0.0.1` frontend vs `localhost` API), which made auth/cookie behavior inconsistent.
3. Mock route interception becoming host-specific or too broad during attempted fixes, causing regressions.

## Failure Timeline (high level)
- Initial failures: strict UI assertions (`Live Data` badge) and hard-coded revision/operation values failed intermittently.
- Mid failures: attempts to fetch fixture data via direct API calls in test failed with unauthorized/non-OK responses in CI.
- Additional regressions: mock route broadened to `**/api/**`, accidentally intercepting frontend module paths like `/src/api/...`.

## Root Causes
### RC1: Non-deterministic live UI fixture assumptions
`live.critical.spec.js` assumed fixed revision/operation availability and immediate hydration timing.

### RC2: Host mismatch across UI/API in CI
Frontend base URL used `127.0.0.1`, while API URL used `localhost`. That split introduced unstable session/cookie behavior and inconsistent request context behavior in live runs.

### RC3: Mock interception scope drift
Mock interception was initially too narrow (single host), then too broad (`**/api/**`), which intercepted frontend source assets.

## Fixes Implemented
1. **CI host alignment**
   - `.github/workflows/ci.yml`
   - `VITE_API_URL` changed to `http://127.0.0.1:4000` to match Playwright base host family.

2. **Live script env normalization**
   - `inspectflow/scripts/run-ui-live-tests.sh`
   - Added:
     - `VITE_API_URL=${VITE_API_URL:-http://127.0.0.1:4000}`
     - `PLAYWRIGHT_API_URL=${PLAYWRIGHT_API_URL:-${VITE_API_URL}}`
   - Backend start now sets `ALLOW_LEGACY_ROLE_HEADER=true` for deterministic test-role access.

3. **Mock route hardening**
   - `inspectflow/frontend/tests/mocked.smoke.spec.js`
   - Route interception now targets only backend API hosts:
     - `http://localhost:4000/api/**`
     - `http://127.0.0.1:4000/api/**`
   - Avoids intercepting frontend module paths.

4. **Live test hardening**
   - `inspectflow/frontend/tests/live.critical.spec.js`
   - API URL default aligned to 127/VITE env.
   - Removed brittle checks and added guarded selection logic.
   - Added baseline/verification API calls with explicit Admin role header where needed.
   - Kept end-to-end critical assertions: admin job creation, operator CSV import, trace persistence.

## Verification
- Local `npm run test:standardized` passes with the updated suite.
- CI re-run required to confirm the same behavior in GitHub Actions.

## Prevention
1. Keep UI/API hostnames aligned in all test runners.
2. Avoid hard-coded ephemeral UI state assertions in required gates.
3. Keep mock routes constrained to explicit backend host/port patterns.
4. Treat live test fixture assumptions as a contract and document them alongside seed data.
