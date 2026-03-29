# Quality Export Runbook

Implements BL-027 (`QUAL-EXPORT-v1`) with BL-066 bubbling export extensions. Provides CSV exports and starter AS9102-oriented outputs.

## Endpoints

### CSV Record Export (existing)

```
GET /api/records/:id/export
```

- Capability: `view_records`
- Response: `text/csv`
- Notes: includes per-piece comment/audit metadata and bubble-aware characteristic fields (`bubble_number`, `feature_type`, `gdt_class`, `tolerance_zone`, `feature_quantity`, `feature_units`, `feature_modifiers`, `source_characteristic_key`).

### AS9102 Starter Export (new)

```
GET /api/records/:id/export/as9102?profile=as9102-basic
```

- Capability: `view_records`
- Response: JSON
- Profiles: `as9102-basic` (default), `as9102-line-only`
- Errors:
  - `404` when record not found
  - `400 {"error":"unknown_profile"}` when profile is invalid

#### Response Shape (high-level)

```json
{
  "contractId": "QUAL-FAI-v2",
  "exportContractId": "QUAL-EXPORT-v1",
  "profile": { "id": "as9102-basic", "name": "AS9102 Basic", "version": "0.1.0", "templateIds": ["fai-summary-v1","fai-line-v1"] },
  "record": {
    "id": 123,
    "jobId": "J-10042",
    "partId": "1234",
    "partRevision": "A",
    "operationId": 12,
    "operationNumber": "20",
    "operationLabel": "Bore & Finish",
    "lot": "Lot A",
    "qty": 12,
    "status": "complete",
    "createdAt": "2026-03-14T18:00:00.000Z"
  },
  "input": {
    "part": { "id": "1234", "revision": "A", "description": "Hydraulic Cylinder Body" },
    "lot": "Lot A",
    "inspector": { "id": 1, "name": "J. Morris", "role": "Operator" },
    "stats": { "measured": 24, "failed": 1, "passRate": 0.9583 },
    "characteristics": [
      {
        "dimensionId": 42,
        "name": "Bore Diameter",
        "bubbleNumber": "20",
        "featureType": "size",
        "gdtClass": "position",
        "toleranceZone": "true_position",
        "quantity": 1,
        "units": "in",
        "modifiers": ["MMC"],
        "sourceCharacteristicKey": "CHAR-1234-020-BORE"
      }
    ]
  },
  "output": {
    "profileId": "as9102-basic",
    "profileName": "AS9102 Basic",
    "profileVersion": "0.1.0",
    "generatedAt": "2026-03-14T18:00:00.000Z",
    "artifacts": [
      { "templateId": "fai-summary-v1", "content": "..." },
      { "templateId": "fai-line-v1", "content": "..." }
    ]
  },
  "availableProfiles": [
    { "id": "as9102-basic", "name": "AS9102 Basic", "version": "0.1.0", "templateIds": ["fai-summary-v1","fai-line-v1"] },
    { "id": "as9102-line-only", "name": "AS9102 Line Only", "version": "0.1.0", "templateIds": ["fai-line-v1"] }
  ]
}
```

## Operational Notes

- Output is deterministic for the same record because the `generatedAt` timestamp is anchored to `records.created_at`.
- `stats` are derived from the record values (`record_values`), with pass rate computed as `(measured - failed) / measured`.
- Additional starter profiles can be added in `backend/src/services/quality/as9102Exports.js`.
