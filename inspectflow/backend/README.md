# InspectFlow Backend

## Setup
1. Create a Postgres database.
2. Set `DATABASE_URL` in `.env`:
   - Example: `postgres://user:pass@localhost:5432/inspectflow`
3. (Optional) Set a test DB in `.env`:
   - `DATABASE_URL_TEST=postgres://user:pass@localhost:5432/inspectflow_test`
4. Apply schema:
   - `npm run db:migrate`
5. Seed (optional):
   - `npm run db:seed`

## Run
- `npm install`
- `npm run dev`
 - `npm run test` (smoke tests against `DATABASE_URL_TEST`)

## Role Headers (MVP)
Role gating is enforced via request header:
- `x-user-role: Operator | Supervisor | Admin`

## API Routes (MVP)
- `/api/users`
- `/api/tools`
- `/api/parts`
- `/api/operations`
- `/api/dimensions`
- `/api/jobs`
- `/api/records`
  - `GET /api/records/:id/export` returns CSV
- `/api/audit`
