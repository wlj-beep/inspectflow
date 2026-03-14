# ANA v3 Vocabulary Map (BL-039 / BL-040)

## Scope
This document is the canonical vocabulary baseline for analytics scaffolding only:

- `backend/src/future/analytics/*`
- `backend/src/services/analytics/*`

Runtime integration remains blocked. No route/index/frontend wiring is authorized by this map.

## Canonical IDs

| Surface | Canonical ID |
| --- | --- |
| Mart contract/schema | `ANA-MART-v3` |
| KPI contract/registry | `ANA-KPI-v3` |

## Canonical Mart Vocabulary

### `inspection_event_mart_v1`

| Type | Canonical Names |
| --- | --- |
| Dimensions | `site_id`, `job_id`, `part_id`, `operation_id`, `lot`, `work_center_id`, `operator_user_id` |
| Measures | `measurement_count`, `oot_count`, `pass_count`, `rework_count` |
| Time field | `event_at` |

### `connector_run_mart_v1`

| Type | Canonical Names |
| --- | --- |
| Dimensions | `site_id`, `connector_id`, `status` |
| Measures | `run_count`, `failure_count`, `replayed_count`, `processed_count`, `avg_latency_ms` |
| Time field | `run_ended_at` |

## Canonical KPI Metric Dictionary

| Canonical Metric Key | KPI Usage |
| --- | --- |
| `pass_pieces` | `first_pass_yield` numerator |
| `total_pieces` | denominator for piece-based ratio KPIs |
| `oot_pieces` | `oot_rate` numerator |
| `correction_events` | `correction_burden_index` numerator |
| `connector_replayed_runs` | `connector_replay_rate` numerator |
| `connector_failed_runs` | `connector_failure_rate` numerator |
| `connector_total_runs` | denominator for connector ratio KPIs |

## KPI-to-Mart Canonical Mapping

| KPI ID | Mart ID | Mart Measure | Numerator Metric Key | Denominator Metric Key |
| --- | --- | --- | --- | --- |
| `first_pass_yield` | `inspection_event_mart_v1` | `pass_count` | `pass_pieces` | `total_pieces` |
| `oot_rate` | `inspection_event_mart_v1` | `oot_count` | `oot_pieces` | `total_pieces` |
| `correction_burden_index` | `inspection_event_mart_v1` | `rework_count` | `correction_events` | `total_pieces` |
| `connector_replay_rate` | `connector_run_mart_v1` | `replayed_count` | `connector_replayed_runs` | `connector_total_runs` |
| `connector_failure_rate` | `connector_run_mart_v1` | `failure_count` | `connector_failed_runs` | `connector_total_runs` |

## Alias Policy

Canonical names are persisted and emitted by contracts. Aliases are accepted only for compatibility, then normalized immediately.

### Accepted Mart Field Aliases (selected)

| Alias | Canonical |
| --- | --- |
| `siteId` | `site_id` |
| `jobId` | `job_id` |
| `partId` | `part_id` |
| `operationId` / `op_number` | `operation_id` |
| `workcenterId` | `work_center_id` |
| `operatorId` | `operator_user_id` |
| `eventAt` / `sampled_at` | `event_at` |
| `measurementCount` | `measurement_count` |
| `ootCount` | `oot_count` |
| `passCount` | `pass_count` |
| `reworkCount` | `rework_count` |
| `connectorId` | `connector_id` |
| `runEndedAt` / `finished_at` | `run_ended_at` |
| `runCount` | `run_count` |
| `failureCount` / `unresolved_count` | `failure_count` |
| `replayedRuns` | `replayed_count` |
| `processedCount` | `processed_count` |
| `avgLatencyMs` / `duration_ms` | `avg_latency_ms` |

### Accepted KPI Metric Aliases

| Canonical Metric | Accepted Aliases |
| --- | --- |
| `pass_pieces` | `passCount`, `acceptedPieces` |
| `total_pieces` | `totalPieces` |
| `oot_pieces` | `ootCount`, `ootPieces` |
| `correction_events` | `correctionEvents`, `reworkCount` |
| `connector_replayed_runs` | `replayedRuns` |
| `connector_failed_runs` | `failedRuns`, `failureCount` |
| `connector_total_runs` | `totalRuns`, `runCount` |

## Deprecation Notes

1. CamelCase contract fields are compatibility aliases only and are deprecated for new scaffolding edits.
2. Legacy field names (`sampled_at`, `finished_at`, `unresolved_count`, `duration_ms`) are deprecated in ANA output surfaces.
3. Legacy KPI metric keys (`acceptedPieces`, `ootPieces`, `failedRuns`, `totalRuns`) are deprecated as primary identifiers; canonical snake_case keys are authoritative.
4. Runtime activation is blocked until this map is signed off by ANA/INT/QUAL owners.
