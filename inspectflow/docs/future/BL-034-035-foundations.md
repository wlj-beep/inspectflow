# BL-034 / BL-035 Foundations

## Backlog references
- `BL-034` (`QUAL-FAI-v2`): first-article workflow depth.
- `BL-035` (`QUAL-EXPORT-v1`): customer-selectable export profile packs.

## Delivered scaffolding
1. Export profile engine (`backend/src/future/quality/exportProfileEngine.js`)
- Config-driven template registry.
- Profile-to-template compatibility validation.
- First-article artifact rendering with formatter hooks.
- Pack-level validation contract (`validateExportProfilePack`).
- Deterministic compatibility checksum snapshots (`createExportCompatibilitySnapshot`).

2. Fixture-backed profile/template packs
- `backend/test/fixtures/future/export/*`
- Compatibility fixtures for profile definitions and expected output rendering.

## Not integrated yet
- No Admin UX for profile management.
- No export endpoints wired into existing quality routes.
- No persisted profile storage.
