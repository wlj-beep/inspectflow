# Cycle Control Ledger Template

Use this ledger format for each cadence cycle.

## Header
- `Cycle`: e.g., `2026-03-14-C0`
- `Window`: e.g., `14:00-16:00 ET`
- `Hub Owner`: Control Hub
- `Builders Active`: list thread aliases
- `Controllers Active`: `T`, `D`, `R`
- `Overall Gate`: `Green | Yellow | Red`

## Findings Table
| Cycle | Gate | Severity | BL IDs | Owner | Required Action | Due By | Block New Work (Y/N) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-03-14-C0 | Yellow | Medium | BL-000 | Team Name | Add missing acceptance test coverage | 2026-03-14 18:00 ET | N |

## Gate Summary
- `Green`: no blocking findings.
- `Yellow`: mitigation required before scope expansion on impacted items.
- `Red`: stop-the-line. Freeze new starts until Red rows are cleared.

## Next-Step Packet Dispatch
- Link or embed one packet per active builder using `docs/operations/next-step-packet-template.md`.

