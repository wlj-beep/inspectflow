# InspectFlow

Production MVP scaffold (on‑prem web app).

## Structure
- `frontend/` React UI (Vite-compatible scaffold)
- `backend/` Node/Express API
- `docs/` Project docs and plan
- `AGENTS.md` Agent instructions for context-efficient work

## Local Development
1. Install dependencies in each package:
   - `npm install` in `backend/`
   - `npm install` in `frontend/`
   - `npm install` in repo root (for the combined `dev` script)
2. Start both services:
   - `npm run dev` (from repo root)

### URLs (Localhost First)
- Frontend: `http://localhost:5173`
- API: `http://localhost:4000`

If you need LAN testing (phone/tablet), bind Vite to your LAN IP and set:
- `npm run dev -- --host 0.0.0.0` (from `frontend/`)
- `VITE_API_URL=http://<LAN-IP>:4000`
- `PLAYWRIGHT_BASE_URL=http://<LAN-IP>:5173` (for UI tests)

## Testing
### Test Database
Set a dedicated test DB URL in `backend/.env`:
```
DATABASE_URL_TEST=postgres://user:pass@localhost:5432/inspectflow_test
```

### Automated Smoke Tests
- API smoke: `npm run test:api` (root) or `npm run test` in `backend/`
- UI smoke: `npm run test:ui` (root) or `npm run test:ui` in `frontend/`

Playwright requires browser binaries:
- `npx playwright install`

## Notes
- Demo remains frozen in Downloads.
- This workspace is the active build target.

## Coordination and Deployment
- `docs/coordination-plan.md` defines agent roles, artifacts, and working rules.
- `STATUS.md` is the canonical global ranked queue for active backlog work.
- `docs/backlog.md` stores detailed backlog items keyed by `BL-###`.
- `WORKLOG.md` stores completed work history.
- `docs/deployment-governance.md` defines change controls and pre-deploy checks.
