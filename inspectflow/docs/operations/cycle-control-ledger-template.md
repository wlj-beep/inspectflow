# Multi-Agent Run Report Template

Use this ledger format for each controller run.

## Header
- `Cycle`: e.g., `2026-03-14-C0`
- `Window`: e.g., `14:00-16:00 ET`
- `Controller`: `<session alias>`
- `BL Scope`: `BL-###, BL-###`
- `Sub-Agents Active`: list track aliases
- `Overall Gate`: `Green | Yellow | Red`

## Findings Table
| Cycle | Gate | Severity | BL IDs | Track | Evidence | Required Action | Due By | Block New Work (Y/N) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-03-14-C0 | Yellow | Medium | BL-000 | Backend | `backend/src/example.js:42` | Add missing validation test | 2026-03-14 18:00 ET | N |

## Gate Summary
- `Green`: no unresolved blocking findings.
- `Yellow`: mitigation required before closure.
- `Red`: stop new starts for impacted BL IDs until blocking rows are cleared.

## Sub-Agent Packet Links
- Link or embed one packet per active track using `docs/operations/next-step-packet-template.md`.
