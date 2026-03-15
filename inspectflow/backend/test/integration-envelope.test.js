import { describe, it, expect } from "vitest";
import {
  validateAndNormalizeCanonicalEnvelope
} from "../src/services/integration/canonicalEnvelope.js";
import {
  createIdempotencyKey,
  createIdempotencyLedger,
  checkAndRegisterIdempotencyKey
} from "../src/services/idempotency/idempotencyKey.js";
import {
  mapErpJobRecordToEnvelope,
  mapErpJobBatchToCanonical
} from "../src/services/integration/erpJobAdapter.js";

describe("Integration envelope and idempotency scaffolding", () => {
  it("normalizes aliases into canonical envelope fields", () => {
    const result = validateAndNormalizeCanonicalEnvelope({
      source_type: "api",
      import_type: "job",
      external_key: "ERP:job:J-100",
      payload_version: "2.1",
      ingest_timestamp: "2026-02-01T10:00:00.000Z",
      payload: { rows: 1 }
    });

    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({
      sourceType: "api_pull",
      importType: "jobs",
      externalKey: "ERP:job:J-100",
      payloadVersion: "2.1",
      ingestTimestamp: "2026-02-01T10:00:00.000Z"
    });
  });

  it("accepts manual CSV and operator CSV source aliases", () => {
    const manualCsv = validateAndNormalizeCanonicalEnvelope({
      sourceType: "manual_csv",
      importType: "tools",
      externalKey: "tools:batch:1",
      payload: { csvText: "name,type,it_num\nA,Variable,IT-1" }
    }, { requireExternalKey: true });
    expect(manualCsv.ok).toBe(true);
    expect(manualCsv.value?.sourceType).toBe("manual");

    const operatorCsv = validateAndNormalizeCanonicalEnvelope({
      sourceType: "operator_csv",
      importType: "measurements",
      externalKey: "measurements:batch:1",
      payload: { rows: [{ piece_number: 1 }] }
    }, { requireExternalKey: true });
    expect(operatorCsv.ok).toBe(true);
    expect(operatorCsv.value?.sourceType).toBe("manual");

    const manualResolution = validateAndNormalizeCanonicalEnvelope({
      sourceType: "manual_resolution",
      importType: "measurements",
      externalKey: "measurements:resolve:1",
      payload: { rows: [{ piece_number: 2 }] }
    }, { requireExternalKey: true });
    expect(manualResolution.ok).toBe(true);
    expect(manualResolution.value?.sourceType).toBe("manual");
  });

  it("can enforce external key requirements", () => {
    const result = validateAndNormalizeCanonicalEnvelope({
      sourceType: "manual",
      importType: "measurements",
      payload: { rows: [] }
    }, { requireExternalKey: true });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("external_key_required");
  });

  it("generates deterministic idempotency keys and duplicate detection", () => {
    const keyA = createIdempotencyKey({
      sourceType: "api_pull",
      importType: "jobs",
      externalKey: "jobs:job:J-200",
      payloadVersion: "1.0",
      idempotencyToken: "tok_abc",
      payloadFingerprint: { id: "J-200", qty: 5 }
    });
    const keyB = createIdempotencyKey({
      sourceType: "api_pull",
      importType: "jobs",
      externalKey: "jobs:job:J-200",
      payloadVersion: "1.0",
      idempotencyToken: "tok_abc",
      payloadFingerprint: { qty: 5, id: "J-200" }
    });

    expect(keyA).toBe(keyB);

    const ledger = createIdempotencyLedger();
    expect(checkAndRegisterIdempotencyKey({ key: keyA, ledger })).toMatchObject({ duplicate: false });
    expect(checkAndRegisterIdempotencyKey({ key: keyA, ledger })).toMatchObject({ duplicate: true });
  });

  it("maps ERP job rows into canonical ingest envelopes", () => {
    const mapped = mapErpJobRecordToEnvelope({
      job_id: "J-300",
      part_number: "P-100",
      op_number: "20",
      lot: "LOT-5",
      quantity: 10,
      status: "open"
    }, { ingestTimestamp: "2026-02-01T12:00:00.000Z" });

    expect(mapped.ok).toBe(true);
    expect(mapped.value).toMatchObject({
      sourceType: "api_pull",
      importType: "jobs",
      payload: {
        entityType: "job",
        entity: {
          id: "J-300",
          partId: "P-100",
          opNumber: "020",
          qty: 10
        }
      }
    });
  });

  it("returns row-level adapter rejects for invalid ERP rows", () => {
    const mapped = mapErpJobBatchToCanonical([
      { job_id: "J-400", part_id: "P-1", op_number: "10", lot: "A", qty: 1, status: "open" },
      { job_id: "J-401", part_id: "P-1", op_number: "x", lot: "A", qty: 0, status: "bad" }
    ]);

    expect(mapped.total).toBe(2);
    expect(mapped.accepted).toHaveLength(1);
    expect(mapped.rejected).toHaveLength(1);
    expect(mapped.rejected[0].errors).toContain("invalid_op_number");
  });
});
