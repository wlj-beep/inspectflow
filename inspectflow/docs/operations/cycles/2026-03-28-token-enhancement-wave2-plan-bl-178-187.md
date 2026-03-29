# Session Plan and To-Do: BL-178 Through BL-187

Date: 2026-03-28  
Owner: Controller (`@codex`)

## Mission
Execute the next 10 token-enhancement items to reduce agent scan noise, enforce context budgets, and continue decomposing large context hotspots.

## Priority Order
1. `BL-178` Further `InspectFlowApp.jsx` decomposition.
2. `BL-179` Policy-driven context-budget config.
3. `BL-180` Machine-readable budget reporting.
4. `BL-181` Agent/review ignore manifests.
5. `BL-182` Mocked smoke helper module split.
6. `BL-183` Shared backend session-auth test helpers.
7. `BL-184` Backlog/worklog shard-link validator.
8. `BL-185` Worklog rolling archive helper.
9. `BL-186` Large untracked artifact detector.
10. `BL-187` CI wiring for token-efficiency checks.

## Session To-Do
- [ ] `BL-178`: Extract next major admin panel(s) from `InspectFlowApp.jsx`.
- [ ] `BL-179`: Introduce `scripts/context/budget.config.json` and migrate gate to consume it.
- [ ] `BL-180`: Add `context:budget:report` command with JSON output.
- [ ] `BL-181`: Add `.agentignore` and `.rgignore` with docs update.
- [ ] `BL-182`: Split `frontend/tests/helpers/mockedSmokeFixtures.js` into smaller modules.
- [ ] `BL-183`: Add backend session-auth helper and migrate backlog-validation specs.
- [ ] `BL-184`: Add shard-link validator command and wire to coordination checks.
- [ ] `BL-185`: Add `WORKLOG` rolling archive helper script.
- [ ] `BL-186`: Add large untracked artifact detection command.
- [ ] `BL-187`: Wire all token checks into CI.

## Parallelization Ownership
- Worker 1: `BL-178` frontend domain extraction (`frontend/src/domains/jobflow/**`).
- Worker 2: `BL-179` context budget config (`scripts/context/enforce-context-budget.mjs`, config file).
- Worker 3: `BL-180` budget report command (`scripts/context/**` new report tool).
- Worker 4: `BL-181` ignore manifests and docs pointers (`.agentignore`, `.rgignore`, docs note).
- Worker 5: `BL-182` mocked smoke helper split (`frontend/tests/helpers/**`).
- Worker 6: `BL-183` backend test auth helper migration (`backend/test/**`).
- Worker 7: `BL-184` shard-link validator (`scripts/context/**`, docs wiring).
- Worker 8: `BL-185` worklog archive helper (`scripts/**`, `WORKLOG*` tooling docs).
- Worker 9: `BL-186` artifact detector (`scripts/context/**`).
- Worker 10: `BL-187` CI integration (`.github/workflows/ci.yml`, package script wiring as needed).
