# Specialist Card: Backend/API

## Owns
- `backend/src/routes/*.js`
- `backend/src/services/**/*.js`
- `backend/src/middleware/*.js`
- API contract integrity and regression safety

## Trigger Signals
- `api`, `route`, `endpoint`, `middleware`, `db`, `schema`, `auth`, `session`

## Required Checks
- `npm run test:api`
- Targeted backend test for touched behavior

## Output Emphasis
- Contract deltas, migration risks, auth/permission impact, and exact failing/passing evidence.
