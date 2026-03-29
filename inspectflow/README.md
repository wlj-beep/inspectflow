# InspectFlow

Production MVP scaffold (on-prem web app)..

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

### Hosted Frontend/API Wiring
- Frontend API base is:
  - `VITE_API_URL` when provided at frontend build time
  - otherwise `http://localhost:4000` in dev
  - otherwise relative (`/api/...`) in production builds
- If frontend and API are hosted on different domains, set `VITE_API_URL` in the frontend host.
- If frontend and API are same origin behind one domain/reverse proxy, leave `VITE_API_URL` unset.

### Local Auth
- Protected APIs now require authenticated session identity.
- Login in UI with a seeded user and local password.
- Default seeded password is `inspectflow` unless overridden by `INSPECTFLOW_DEFAULT_PASSWORD`.

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

### Standardized Tests (Required Gates)
- Coordination gate: `npm run test:coordination`
- API regression gate: `npm run test:api` (root) or `npm run test` in `backend/`
- UI mock regression gate: `npm run test:ui:mock`
- UI live critical-path gate: `npm run test:ui:live`
- Full standardized gate: `npm run test:standardized`

Live UI gate requirements:
- `DATABASE_URL_TEST` must be configured
- `npm run test:ui:live` handles test DB setup and backend startup automatically

Playwright requires browser binaries:
- `npx playwright install`

## Notes
- The active frontend build target is `frontend/src/App.jsx` plus `frontend/src/domains/**`.
- `frontend/src/legacy/InspectFlowDemo.jsx` is retired historical source from the BL-077 migration/removal.
- This workspace is the active build target.

## Coordination and Deployment
- `docs/coordination-plan.md` defines queue governance and multi-agent delivery rules.
- `docs/operations/multi-agent-playbook.md` is the canonical operating playbook.
- `docs/operations/controller-prompts.md` provides reusable controller/sub-agent prompt templates.
- Multi-agent deployment preflight: `npm run ops:multi-agent:check -- --bl "BL-###" --run-context-validate`.
- `STATUS.md` is the canonical global ranked queue for active backlog work.
- `docs/backlog.md` is the backlog index; detailed release shards live under `docs/backlog/*.md`.
- `WORKLOG.md` stores the recent completion window; older history lives in `WORKLOG.archive-*.md`.
- `docs/deployment-governance.md` defines change controls and pre-deploy checks.
- `CONTRIBUTING.md` defines Git branching, commit, and PR best practices for this repo.
- `docs/direct-push-mode.md` documents optional solo/offline direct push workflow for `main`.

## On-Prem and Backup Operations
- On-prem install/runbook: `docs/onprem-install-runbook.md`
- Backup/restore runbook: `docs/backup-restore-runbook.md`
- Install package scripts: `deploy/onprem/*.sh`
- Backup workflow scripts: `scripts/backup/*.sh`
