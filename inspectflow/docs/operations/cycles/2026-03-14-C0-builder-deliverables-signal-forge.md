# Signal/Forge Deliverables Packet

- `Cycle`: `2026-03-14-C0`
- `Builder`: `Signal/Forge`
- `Scope Executed`: `BL-039`, `BL-040` contract-drift mitigation + `BL-028` readiness artifacts
- `Prepared`: `2026-03-14 17:30 ET`
- `Gate Recommendation`: `Green (for BL-039/BL-040 scaffold parity)`

## 1) Exact Files Changed

1. `backend/src/services/analytics/anaV3Vocabulary.js`
2. `backend/src/services/analytics/kpiMetricDictionary.js`
3. `backend/src/future/analytics/martContracts.js`
4. `backend/src/future/analytics/kpiRegistry.js`
5. `backend/src/services/analytics/martSchema.js`
6. `backend/src/services/analytics/kpiContracts.js`
7. `backend/test/analytics-contracts.test.js`
8. `backend/test/future-analytics-kpi.test.js`
9. `docs/future/ANA-v3-vocabulary-map.md`
10. `docs/operations/cycles/2026-03-14-C0-builder-deliverables-signal-forge.md`
11. `docs/operations/cycles/evidence/2026-03-14-C0-signal-forge-coordination-check.txt`
12. `docs/operations/cycles/evidence/2026-03-14-C0-signal-forge-targeted-tests.txt`

## 2) Canonical Vocabulary Table

### ANA-MART-v3 canonical fields

| Mart ID | Canonical Dimensions | Canonical Measures | Time Field |
| --- | --- | --- | --- |
| `inspection_event_mart_v1` | `site_id`, `job_id`, `part_id`, `operation_id`, `lot`, `work_center_id`, `operator_user_id` | `measurement_count`, `oot_count`, `pass_count`, `rework_count` | `event_at` |
| `connector_run_mart_v1` | `site_id`, `connector_id`, `status` | `run_count`, `failure_count`, `replayed_count`, `processed_count`, `avg_latency_ms` | `run_ended_at` |

### ANA-KPI-v3 canonical metric mapping

| KPI ID | Mart Measure | Numerator Key | Denominator Key |
| --- | --- | --- | --- |
| `first_pass_yield` | `pass_count` | `pass_pieces` | `total_pieces` |
| `oot_rate` | `oot_count` | `oot_pieces` | `total_pieces` |
| `correction_burden_index` | `rework_count` | `correction_events` | `total_pieces` |
| `connector_replay_rate` | `replayed_count` | `connector_replayed_runs` | `connector_total_runs` |
| `connector_failure_rate` | `failure_count` | `connector_failed_runs` | `connector_total_runs` |

Alias policy and deprecations are documented in `docs/future/ANA-v3-vocabulary-map.md`.

## 3) Mismatch List Resolved

| Drift Point | Before | Resolved State |
| --- | --- | --- |
| ANA-MART vocabulary mismatch (`future` vs `services`) | `camelCase` query fields in `martContracts.js` vs mixed/legacy table columns in `martSchema.js` | Both surfaces consume `anaV3Vocabulary.js` canonical mart definitions; `martSchema` parity check enforces required columns; `martContracts` normalizes aliases deterministically. |
| ANA-KPI metric-key mismatch (`future` vs `services`) | Registry used `passCount`/`ootCount` style measures and partial KPI set; service contracts used `acceptedPieces`/`ootPieces` style ratio metrics | Both surfaces now share canonical metric keys (`pass_pieces`, `oot_pieces`, etc.) plus explicit alias map; both now expose the same 5 KPI IDs and aligned measure/metric mapping. |
| Alias ambiguity | Implicit, undocumented synonym handling | Explicit alias maps are centralized in `anaV3Vocabulary.js`, reflected in tests, and documented with deprecation notes. |

## 4) Test Evidence

### Command: `npm run coordination:check`
- Evidence file: `docs/operations/cycles/evidence/2026-03-14-C0-signal-forge-coordination-check.txt`
- Snippet:

```text
> inspectflow@0.1.0 coordination:check
> node scripts/validate-coordination.mjs

Coordination validation passed.
```

### Command: `cd backend && NODE_ENV=test npx vitest run test/analytics-contracts.test.js test/future-analytics-kpi.test.js`
- Evidence file: `docs/operations/cycles/evidence/2026-03-14-C0-signal-forge-targeted-tests.txt`
- Snippet:

```text
✓ test/analytics-contracts.test.js (5 tests)
✓ test/future-analytics-kpi.test.js (5 tests)
Test Files  2 passed (2)
Tests  10 passed (10)
```

## 5) Runtime Integration Statement

Runtime integration is still blocked.

No wiring was added to:
- `backend/src/index.js`
- active route registration/runtime endpoints
- frontend runtime flows

No destructive DDL was introduced; mart SQL draft generation remains additive-only (`CREATE TABLE IF NOT EXISTS`, additive indexes).

## 6) BL-028 Readiness Artifact Status

BL-028 readiness artifact is updated by virtue of a cleared analytics drift baseline and attached evidence. BL-028 runtime work remains out of scope and not started in this packet.
