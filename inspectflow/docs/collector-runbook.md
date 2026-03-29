# Collector (IoT Ingestion) Runbook

**Interface:** INT-IOT-v1 | **Backlog:** BL-120 | **Stream:** INT

---

## Overview

The collector subsystem allows InspectFlow to receive real-time measurement telemetry
from shop-floor devices (OPC-UA, MQTT, TCP) and auto-submit it as inspection records,
with an operator-facing queue for reviewing out-of-tolerance (OOT) readings.

Architecture summary:
- Collector configurations store connection metadata + tag-to-dimension mappings.
- Protocol adapters (pure parsing, no network) normalize each protocol's payload into
  canonical readings `{ deviceId, tagName, value, unit, timestamp, quality }`.
- The ingest pipeline resolves each reading to a dimension/job context via tag mappings,
  performs an OOT check, creates a `records` row via the `_iot_system` system user, and
  enqueues OOT readings for human review.
- All ingest runs are logged in `collector_runs` for diagnostics and replay tracking.

---

## Adding a New Collector (Admin)

### Step 1 — Create a collector configuration

```
POST /api/collector/configs
{ "name": "CNC-Line-1-OPC", "sourceProtocol": "opc_ua" }
```

Supported protocols: `opc_ua`, `mqtt`, `tcp`.

Optional fields: `connectionOptions` (JSONB — keys named `password`, `secret`, `token`, or
`api_key` are redacted in GET responses), `pollIntervalSeconds`, `enabled`.

### Step 2 — Add tag mappings

Each mapping links a device tag address to a specific dimension, job, and piece number.

```
POST /api/collector/configs/:id/tag-mappings
{
  "deviceId": "CNC-01",
  "tagAddress": "ns=2;s=BoreDia",
  "dimensionId": 42,
  "jobId": "J-2026-001",
  "pieceNumber": 1
}
```

- **OPC-UA:** `tagAddress` = full node ID (e.g. `ns=2;s=BoreDia`)
- **MQTT:** `tagAddress` = full MQTT topic (e.g. `factory/line-1/CNC-02/bore_dia`); `deviceId`
  is derived from topic segment 2 automatically
- **TCP:** `tagAddress` = tag name in the pipe-delimited frame (e.g. `BORE_DIA`)

Optional: `unitOverride` to force a specific unit string on stored records.

### Step 3 — Simulate / test a frame

Send a test payload without going through a real device:

```
POST /api/collector/configs/:id/ingest
{
  "sourceProtocol": "opc_ua",
  "rawInput": {
    "deviceId": "CNC-01",
    "readings": [
      { "nodeId": "ns=2;s=BoreDia", "value": 12.05, "unit": "mm",
        "timestamp": "2026-03-27T10:00:00Z", "quality": "good" }
    ]
  }
}
```

Returns: `{ ok, runId, totalReadings, insertedCount, ootCount, failedCount, errors }`.

### Step 4 — Check run history

```
GET /api/collector/runs?collectorId=<id>&status=error
```

Inspect the `errors` JSONB field in any failed run for root-cause codes.

---

## OOT Acknowledgment Workflow (Operator)

When a reading falls outside the dimension's tolerance band, it is queued in
`collector_oot_queue` with `status = 'pending'` and the record is still inserted with
`oot = true`.

### List pending OOT readings

```
GET /api/collector/oot-queue?status=pending
```

Optional filters: `status` (`pending` | `acknowledged` | `escalated`), `jobId`, `limit`.

### Acknowledge a reading

```
POST /api/collector/oot-queue/:id/acknowledge
{ "note": "Reviewed and accepted — within process capability" }
```

Updates status to `acknowledged` and writes an immutable `collector_oot_audit` row.

### Escalate a reading (Quality/Admin only)

```
POST /api/collector/oot-queue/:id/escalate
{ "note": "Needs engineering disposition — repeat OOT on same feature" }
```

Updates status to `escalated` and writes an audit row.

### View audit trail for one OOT item

```
GET /api/collector/oot-queue/:id/audit
```

Returns an array of `{ action, user_role, note, created_at }` entries.

---

## Troubleshooting

### `unresolvable_tag` in run errors

**Cause:** No `collector_tag_mappings` row matches the incoming `(collector_id, device_id, tag_address)` triple.

**Fix:** Add a tag mapping for the device/tag combination. Check for casing or whitespace
differences between the tag address in the mapping and what the device actually sends.
Use the `/ingest` simulate endpoint to verify the mapping resolves before connecting the
real device.

### Duplicate run / zero `insertedCount`

**Cause:** The ingest pipeline deduplicates readings within a single frame by
`(collectorId, deviceId, tagName, timestamp)`. If the device resends the same reading
with the same timestamp, it will be skipped.

**Fix:** This is expected behavior for idempotent replay. If readings are genuinely distinct
but sharing a timestamp, the device should include a monotonic sequence number in the tag
address or use higher-precision timestamps.

### `status: "error"` in collector_runs

**Cause:** All readings in the frame either failed tag resolution, had invalid values, or
the adapter rejected the frame entirely.

**Fix:** Inspect the `errors` JSONB field in `GET /api/collector/runs/:id`:
```json
[
  { "code": "unresolvable_tag: CNC-01/ns=2;s=BoreDia" },
  { "code": "adapter_parse_error", "detail": "missing_device_id" }
]
```

Cross-reference with the tag mapping list for the collector config.

### OOT audit row missing after acknowledge call

**Cause:** The acknowledge returned 409 (`already_actioned`), meaning the entry was
already acted on by another session.

**Fix:** Refresh the OOT queue list — the entry should show `acknowledged` or `escalated`
status. The audit trail (`GET /api/collector/oot-queue/:id/audit`) will confirm the prior
action.

### `connection_options` showing `[REDACTED]`

**Cause:** Keys named `password`, `secret`, `token`, `api_key`, or `apikey` are redacted
in all GET responses as a security control.

**Fix:** This is by design. Use the PUT config endpoint to update secrets — the stored
value is the unredacted JSONB; only responses mask sensitive keys.

### `_iot_system user not found` error in pipeline logs

**Cause:** The system user used for auto-submitted records was not seeded.

**Fix:** Run the seed script: `NODE_ENV=production npm run db:seed` or manually insert:
```sql
INSERT INTO users (name, role, active) VALUES ('_iot_system', 'Operator', false)
ON CONFLICT (name) DO NOTHING;
```

---

## DB Tables

| Table | Purpose |
|-------|---------|
| `collector_configurations` | Long-lived collector config + heartbeat state |
| `collector_tag_mappings` | Maps `(collector, device, tag)` → `(dimension, job, piece)` |
| `collector_runs` | Per-ingest-call run log with counts + error JSONB |
| `collector_oot_queue` | OOT reading queue with denormalized measurement fields |
| `collector_oot_audit` | Immutable audit trail for acknowledge/escalate/note actions |

---

## Role Access Matrix

| Capability | Operator | Quality | Supervisor | Admin |
|------------|----------|---------|------------|-------|
| List OOT queue | ✓ | ✓ | ✓ | ✓ |
| Acknowledge OOT | ✓ | ✓ | ✓ | ✓ |
| Escalate OOT | — | ✓ | ✓ | ✓ |
| View OOT audit | ✓ | ✓ | ✓ | ✓ |
| View run history | — | ✓ | ✓ | ✓ |
| Manage configs + mappings | — | — | — | ✓ |
| Simulate ingest | — | — | — | ✓ |
