# Work Log

Short, chronological record of merged changes and decisions.

| Date | Change | Owner | Reference |
| --- | --- | --- | --- |
| 2026-03-12 | Added coordination and deployment governance docs | @owner | PR/Issue link |
| 2026-03-13 | Added global ranked queue + claim workflow (`STATUS.md` canonical, `BL-###` backlog IDs, coordination validator, and CI enforcement) | @owner | PR/Issue link |
| 2026-03-13 | Completed BL-001 through BL-005 (transition-state UX/test hardening, multi-tool dimension handling, regenerated family numbering, operation number normalization, and record setup snapshots) | @codex | PR/Issue link |
| 2026-03-13 | Standardized Git workflow practices: branch/commit/PR policy (`CONTRIBUTING.md`), stricter PR template, and removed tracked npm cache artifacts with ignore guards | @codex | PR/Issue link |
| 2026-03-13 | Added sampling-plan extensions (`first_middle_last`, `custom_interval`), CSV import APIs/templates, Admin Data Imports tab, integration strategy docs, and live role-permission summaries (BL-009) | @codex | PR/Issue link |
| 2026-03-13 | Completed BL-006 with part setup revision history (`A..Z`, `AA..` progression), setup-change-triggered revision snapshots across admin + CSV import paths, revision lookup APIs, and admin revision-review gating in Part/Op setup UI | @codex | PR/Issue link |
| 2026-03-13 | Completed BL-007 by requiring revision input for part and job creation, persisting job revision, enforcing part+revision validation in jobs API, and wiring revision-aware Part/Job admin forms | @codex | PR/Issue link |
| 2026-03-13 | Completed BL-008 with large-catalog Part Setup controls (search/filter/pagination) and structured bulk part-name updates via new `POST /api/parts/bulk-update` + UI workflow | @codex | PR/Issue link |
| 2026-03-13 | Completed BL-010 with tool calibration due-date tracking, current/home location assignment, admin location master CRUD (`/api/tool-locations`), and Tool Library UI support for calibration/location management | @codex | PR/Issue link |
| 2026-03-14 | Completed BL-011 through BL-014: jobs CSV import, API/webhook/excel integration runner with polling + run logs, measurement bulk/operator CSV ingestion, and raw-data unresolved queue with manual resolve/ignore workflow | @codex | PR/Issue link |
| 2026-03-14 | Implemented multi-release documentation and backlog framework (`target-state`, roadmap, conflict audit, stream contracts, refactored backlog metadata, and release-seeded queue) | @codex | PR/Issue link |
