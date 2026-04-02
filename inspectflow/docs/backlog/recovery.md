## Recovery Backlog (Audit Follow-Ups)

| ID | Release | Stream | Module | Owner Team | Dependencies | Interface Contract | Priority Score | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BL-084 | R2 | INT | INTEGRATION_SUITE | Team Bridge | BL-031, BL-032, BL-053, BL-055, BL-058 | INT-CONNECTOR-v2 | 99 | Restore import/integration runtime so manual CSV imports, integration pulls, idempotent replays, and support-bundle views all return successful results with regression tests passing. |
| BL-085 | R1 | PLAT | CORE | Team Atlas | BL-052 | PLAT-TEST-v1 | 98 | Repair backend test parsing and standardized gate health so `npm run test:api` and `npm run test:ui:mock` are executable, and the release gates surface regressions instead of masking them. |
| BL-086 | R1 | PLAT | CORE | Team Atlas | BL-015, BL-083 | PLAT-AUTH-v1 | 96 | Remove the pre-auth user directory from login; support username entry or filtered lookup and keep the chosen identity visible only after validation. |
| BL-087 | R5 | PLAT | CORE | Team Atlas | BL-062 | PLAT-UX-v1 | 95 | Make shell navigation fully URL-driven with browser back/forward restore for top-level view and admin sub-tabs. |
| BL-088 | R5 | PLAT | CORE | Team Atlas | BL-070, BL-076 | PLAT-UX-v1 | 94 | Scope the global shortcut overlay to keyboard intent only, add focus trap and restore, and keep `?` from stealing text input. |
| BL-089 | R5 | PLAT | CORE | Team Atlas | BL-071, BL-081 | PLAT-UX-v1 | 93 | Turn the home dashboard into a role-tailored landing surface with the right primary action per role and clearer card copy. |
| BL-090 | R5 | OPS | CORE | Team Forge | BL-063, BL-082 | OPS-JOBFLOW-v1 | 92 | Simplify admin IA so the left navigation is the primary control surface and duplicate or empty sub-tab chrome is removed or made functional. |
| BL-091 | R1 | QUAL | CORE | Team Helix | BL-027, BL-061 | QUAL-EXPORT-v1 | 97 | Correct export semantics so records with no measured values never report a perfect pass rate; add regression coverage for zero-measurement and partial-measurement cases. |

