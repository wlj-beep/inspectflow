# Session Plan and To-Do: BL-173 Through BL-177

Date: 2026-03-28  
Owner: Controller (`@codex`)

## Mission
Complete the mandatory token-efficiency remediation tranche before any other backlog execution resumes.

## Priority Order (Must Execute In Order)
1. `BL-173` Frontend monolith decomposition (`InspectFlowApp.jsx`).
2. `BL-174` Operational docs segmentation (`WORKLOG`, backlog sharding/index).
3. `BL-175` Runtime artifact isolation and retention cleanup for `var/**`.
4. `BL-176` Test fixture/data-factory extraction and oversized test shrink.
5. `BL-177` Context budget enforcement gate (CI/local).

## Session To-Do
- [ ] Claim `BL-173` and split `InspectFlowApp.jsx` into bounded modules/hooks/components with parity tests.
- [ ] Claim `BL-174` and implement backlog/worklog segmentation plus index-first navigation updates.
- [ ] Claim `BL-175` and add `var/README.md`, retention policy, and cleanup automation wired to ops checks.
- [ ] Claim `BL-176` and extract shared test fixtures/factories from oversized test files.
- [ ] Implement `BL-177` guardrails: size/line/artifact budget check with actionable failures.
- [ ] Run targeted verification for each BL item and record evidence paths.
- [ ] Update `STATUS.md` ownership/state transitions and append `WORKLOG.md` completion notes.

## Parallelization Plan
- Worker A: `BL-173` (`frontend/src/domains/jobflow/**`, `frontend/tests/**`)
- Worker B: `BL-174` (`docs/backlog*`, `WORKLOG*`, coordination references)
- Worker C: `BL-175` (`var/**`, `scripts/**`, ops checks wiring)
- Worker D: `BL-176` (`frontend/tests/**`, `backend/test/**`)
- Controller: integration sequencing + `BL-177` final gate implementation once artifacts stabilize.
