# Backlog Framework

## Purpose
This framework standardizes backlog design for parallel team execution across releases.

## Required Metadata Per Backlog Item
Each item must include:
1. `ID` (`BL-###`)
2. `Release` (`R1`, `R2`, `R3`, `R4`)
3. `Stream` (`PLAT`, `OPS`, `QUAL`, `INT`, `ANA`, `COMM`)
4. `Module` (`CORE`, `QUALITY_PRO`, `INTEGRATION_SUITE`, `ANALYTICS_SUITE`, `MULTISITE`, `EDGE`)
5. `Owner Team`
6. `Dependencies`
7. `Interface Contract`
8. `Priority Score`
9. `Acceptance`

## Stream-to-Team Defaults
- `PLAT` -> Team Atlas
- `OPS` -> Team Forge
- `QUAL` -> Team Helix
- `INT` -> Team Bridge
- `ANA` -> Team Signal
- `COMM` -> Team Ledger

## Priority Scoring
Use a 0-100 score:
- Customer risk reduction: 0-35
- Revenue impact: 0-30
- Dependency unlock value: 0-20
- Delivery confidence: 0-15

Higher score means earlier scheduling within the release.

## Dependency and Interface Rules
- Each item has exactly one owning stream/team.
- Dependencies must reference backlog IDs or contract IDs.
- Cross-team work requires a contract ID from `stream-contracts-*.md`.
- Contract changes must be backward-compatible within a release unless explicitly approved.

## Task Decomposition Rules
- Split epics into independently mergeable slices.
- Avoid combining unrelated interfaces in one item.
- Keep one item focused on one capability boundary.
- Include explicit acceptance criteria that can be tested in CI or manual release checks.

## Queue Compatibility Rules
- Keep `BL-###` format for all tracked items.
- `STATUS.md` remains the active queue with existing schema.
- Stream/team tags are appended in `Work Item` text only, not by schema changes.

## Definition of Ready
- All required metadata filled.
- Dependencies validated and not contradictory.
- Interface contract exists and has owner.
- Acceptance criteria are testable.

## Definition of Done
- Acceptance criteria pass.
- Contract changes documented.
- Backlog and queue state updated.
- Release notes/worklog entry created when applicable.
