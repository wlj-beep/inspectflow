/**
 * End-to-end integration tests for the collector ingest pipeline.
 * BL-120 (INT-IOT-v1)
 *
 * Tests cover:
 *   - Happy path: OPC-UA reading inserted as record (is_oot=false)
 *   - OOT path: out-of-tolerance reading inserts record + OOT queue entry
 *   - Unresolvable tag: reading skipped (failedCount++)
 *   - Unknown protocol: pipeline returns ok=false immediately
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { query, pool } from "../src/db.js";
import { ingestTelemetryFrame } from "../src/services/collector/collectorIngestPipeline.js";

// Track created IDs for cleanup
const state = {
  partIds: [],
  operationIds: [],
  dimensionIds: [],
  jobIds: [],
  collectorIds: [],
  tagMappingIds: [],
  recordIds: [],
  ootQueueIds: [],
  runIds: []
};

// ---- Seed helpers ----

async function seedPart(id = `P-IOT-${Date.now()}`) {
  await query(
    "INSERT INTO parts (id, description) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
    [id, "IoT pipeline test part"]
  );
  state.partIds.push(id);
  return id;
}

async function seedOperation(partId) {
  const { rows } = await query(
    "INSERT INTO operations (part_id, op_number, label) VALUES ($1, $2, $3) RETURNING id",
    [partId, `OP-${Date.now()}`, "IoT test op"]
  );
  const id = rows[0].id;
  state.operationIds.push(id);
  return id;
}

async function seedDimension(operationId, { nominal = 12.0, tolPlus = 0.2, tolMinus = 0.2 } = {}) {
  const { rows } = await query(
    `INSERT INTO dimensions
       (operation_id, name, nominal, tol_plus, tol_minus, unit, sampling, input_mode)
     VALUES ($1, $2, $3, $4, $5, 'mm', '100pct', 'single')
     RETURNING id`,
    [operationId, `BoreDia-${Date.now()}`, nominal, tolPlus, tolMinus]
  );
  const id = rows[0].id;
  state.dimensionIds.push(id);
  return id;
}

async function seedJob(partId, operationId, { status = "open" } = {}) {
  const id = `J-IOT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await query(
    "INSERT INTO jobs (id, part_id, operation_id, lot, qty, status) VALUES ($1,$2,$3,$4,$5,$6)",
    [id, partId, operationId, "LOT-001", 10, status]
  );
  state.jobIds.push(id);
  return id;
}

async function seedCollectorConfig(protocol = "opc_ua") {
  const { rows } = await query(
    `INSERT INTO collector_configurations (name, source_protocol)
     VALUES ($1, $2)
     RETURNING id`,
    [`cfg-iot-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, protocol]
  );
  const id = rows[0].id;
  state.collectorIds.push(id);
  return id;
}

async function seedTagMapping(collectorId, dimensionId, jobId, { deviceId = "CNC-01", tagAddress = "ns=2;s=BoreDia" } = {}) {
  const { rows } = await query(
    `INSERT INTO collector_tag_mappings
       (collector_id, device_id, tag_address, dimension_id, job_id, piece_number)
     VALUES ($1,$2,$3,$4,$5,1)
     RETURNING id`,
    [collectorId, deviceId, tagAddress, dimensionId, jobId]
  );
  const id = rows[0].id;
  state.tagMappingIds.push(id);
  return id;
}

// ---- Cleanup ----

async function cleanup() {
  // OOT audit before oot_queue (FK)
  if (state.ootQueueIds.length) {
    for (const id of state.ootQueueIds) {
      await query("DELETE FROM collector_oot_audit WHERE oot_queue_id=$1", [id]);
      await query("DELETE FROM collector_oot_queue WHERE id=$1", [id]);
    }
    state.ootQueueIds.length = 0;
  }

  // record_values + snapshots before records and before dimensions (FK)
  if (state.recordIds.length) {
    for (const id of state.recordIds) {
      await query("DELETE FROM record_values WHERE record_id=$1", [id]);
      await query("DELETE FROM record_dimension_snapshots WHERE record_id=$1", [id]);
      await query("DELETE FROM records WHERE id=$1", [id]);
    }
    state.recordIds.length = 0;
  }
  // Also purge any untracked records created by failed tests (by job_id)
  for (const jId of state.jobIds) {
    const { rows: recRows } = await query("SELECT id FROM records WHERE job_id=$1", [jId]);
    for (const rec of recRows) {
      await query("DELETE FROM record_values WHERE record_id=$1", [rec.id]);
      await query("DELETE FROM record_dimension_snapshots WHERE record_id=$1", [rec.id]);
      await query("DELETE FROM records WHERE id=$1", [rec.id]);
    }
  }

  // collector_runs
  if (state.runIds.length) {
    for (const id of state.runIds) {
      await query("DELETE FROM collector_runs WHERE id=$1", [id]);
    }
    state.runIds.length = 0;
  }

  // tag mappings before collector config (FK)
  if (state.tagMappingIds.length) {
    for (const id of state.tagMappingIds) {
      await query("DELETE FROM collector_tag_mappings WHERE id=$1", [id]);
    }
    state.tagMappingIds.length = 0;
  }

  if (state.collectorIds.length) {
    for (const id of state.collectorIds) {
      await query("DELETE FROM collector_configurations WHERE id=$1", [id]);
    }
    state.collectorIds.length = 0;
  }

  // dimensions before operations (FK)
  if (state.dimensionIds.length) {
    for (const id of state.dimensionIds) {
      await query("DELETE FROM dimensions WHERE id=$1", [id]);
    }
    state.dimensionIds.length = 0;
  }

  if (state.jobIds.length) {
    for (const id of state.jobIds) {
      await query("DELETE FROM records WHERE job_id=$1", [id]);
      await query("DELETE FROM jobs WHERE id=$1", [id]);
    }
    state.jobIds.length = 0;
  }

  if (state.operationIds.length) {
    for (const id of state.operationIds) {
      await query("DELETE FROM operations WHERE id=$1", [id]);
    }
    state.operationIds.length = 0;
  }

  if (state.partIds.length) {
    for (const id of state.partIds) {
      await query("DELETE FROM parts WHERE id=$1", [id]);
    }
    state.partIds.length = 0;
  }
}

// ---- Tests ----

describe("Collector ingest pipeline (BL-120)", () => {
  let collectorId;
  let dimensionId;
  let jobId;

  beforeEach(async () => {
    const partId = await seedPart();
    const operationId = await seedOperation(partId);
    dimensionId = await seedDimension(operationId, { nominal: 12.0, tolPlus: 0.2, tolMinus: 0.2 });
    jobId = await seedJob(partId, operationId, { status: "open" });
    collectorId = await seedCollectorConfig("opc_ua");
    await seedTagMapping(collectorId, dimensionId, jobId, {
      deviceId: "CNC-01",
      tagAddress: "ns=2;s=BoreDia"
    });
  });

  afterEach(cleanup);

  it("happy path: in-tolerance reading creates record with oot=false", async () => {
    const result = await ingestTelemetryFrame({
      collectorId,
      sourceProtocol: "opc_ua",
      rawInput: {
        deviceId: "CNC-01",
        readings: [
          {
            nodeId: "ns=2;s=BoreDia",
            value: 12.05,   // within ±0.2 of nominal 12.0
            unit: "mm",
            timestamp: new Date().toISOString(),
            quality: "good"
          }
        ]
      },
      triggerMode: "manual"
    });

    expect(result.ok).toBe(true);
    expect(result.insertedCount).toBe(1);
    expect(result.ootCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.runId).toBeTruthy();
    state.runIds.push(result.runId);

    // Verify record row
    const { rows: recRows } = await query(
      "SELECT id, oot FROM records WHERE job_id=$1 ORDER BY id DESC LIMIT 1",
      [jobId]
    );
    expect(recRows.length).toBe(1);
    expect(recRows[0].oot).toBe(false);
    state.recordIds.push(recRows[0].id);

    // Verify record_values row
    const { rows: valRows } = await query(
      "SELECT value, is_oot FROM record_values WHERE record_id=$1",
      [recRows[0].id]
    );
    expect(valRows.length).toBe(1);
    expect(Number(valRows[0].value)).toBeCloseTo(12.05);
    expect(valRows[0].is_oot).toBe(false);

    // No OOT queue entry
    const { rows: ootRows } = await query(
      "SELECT id FROM collector_oot_queue WHERE job_id=$1",
      [jobId]
    );
    expect(ootRows.length).toBe(0);
  });

  it("OOT path: out-of-tolerance reading creates record + OOT queue entry", async () => {
    const result = await ingestTelemetryFrame({
      collectorId,
      sourceProtocol: "opc_ua",
      rawInput: {
        deviceId: "CNC-01",
        readings: [
          {
            nodeId: "ns=2;s=BoreDia",
            value: 12.999,  // > nominal(12.0) + tol_plus(0.2) = 12.2 → OOT
            unit: "mm",
            timestamp: new Date().toISOString(),
            quality: "good"
          }
        ]
      },
      triggerMode: "push"
    });

    expect(result.ok).toBe(true);
    expect(result.insertedCount).toBe(1);
    expect(result.ootCount).toBe(1);
    state.runIds.push(result.runId);

    // Verify record row has oot=true
    const { rows: recRows } = await query(
      "SELECT id, oot FROM records WHERE job_id=$1 ORDER BY id DESC LIMIT 1",
      [jobId]
    );
    expect(recRows[0].oot).toBe(true);
    state.recordIds.push(recRows[0].id);

    // Verify OOT queue entry was created
    const { rows: ootRows } = await query(
      `SELECT id, status, measured_value, job_id FROM collector_oot_queue
       WHERE job_id=$1 ORDER BY id DESC LIMIT 1`,
      [jobId]
    );
    expect(ootRows.length).toBe(1);
    expect(ootRows[0].status).toBe("pending");
    expect(Number(ootRows[0].measured_value)).toBeCloseTo(12.999);
    state.ootQueueIds.push(ootRows[0].id);
  });

  it("unresolvable tag skips reading and increments failedCount", async () => {
    const result = await ingestTelemetryFrame({
      collectorId,
      sourceProtocol: "opc_ua",
      rawInput: {
        deviceId: "CNC-99",         // no mapping for this device
        readings: [
          {
            nodeId: "ns=2;s=Unknown",
            value: 5.0,
            unit: "mm",
            timestamp: new Date().toISOString(),
            quality: "good"
          }
        ]
      },
      triggerMode: "manual"
    });

    state.runIds.push(result.runId);
    expect(result.insertedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.errors.some((e) => e.includes("unresolvable_tag"))).toBe(true);
  });

  it("unknown protocol returns ok=false without inserting records", async () => {
    const result = await ingestTelemetryFrame({
      collectorId,
      sourceProtocol: "zigbee",  // not supported
      rawInput: {},
      triggerMode: "manual"
    });

    state.runIds.push(result.runId);
    expect(result.ok).toBe(false);
    expect(result.insertedCount).toBe(0);
    expect(result.errors).toContain("unknown_protocol");
  });

  it("collector_runs row is written for each ingest call", async () => {
    const result = await ingestTelemetryFrame({
      collectorId,
      sourceProtocol: "opc_ua",
      rawInput: {
        deviceId: "CNC-01",
        readings: [
          {
            nodeId: "ns=2;s=BoreDia",
            value: 12.1,
            unit: "mm",
            timestamp: new Date().toISOString(),
            quality: "good"
          }
        ]
      },
      triggerMode: "scheduled"
    });

    expect(result.runId).toBeTruthy();
    state.runIds.push(result.runId);

    const { rows } = await query(
      `SELECT id, source_protocol, trigger_mode, status, inserted_count, oot_count
       FROM collector_runs WHERE id=$1`,
      [result.runId]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].source_protocol).toBe("opc_ua");
    expect(rows[0].trigger_mode).toBe("scheduled");
    expect(rows[0].status).toBe("success");
    expect(rows[0].inserted_count).toBe(1);
    expect(rows[0].oot_count).toBe(0);

    // Cleanup record
    const { rows: recRows } = await query(
      "SELECT id FROM records WHERE job_id=$1 ORDER BY id DESC LIMIT 1",
      [jobId]
    );
    if (recRows[0]) state.recordIds.push(recRows[0].id);
  });

  it("MQTT frame: reading resolved via tag mapping (topic = tagAddress)", async () => {
    // Seed a separate mapping for MQTT with topic as tagAddress
    const mqttCollectorId = await seedCollectorConfig("mqtt");
    const topic = "factory/line-1/CNC-01/bore_dia";
    await seedTagMapping(mqttCollectorId, dimensionId, jobId, {
      deviceId: "CNC-01",
      tagAddress: topic
    });

    const result = await ingestTelemetryFrame({
      collectorId: mqttCollectorId,
      sourceProtocol: "mqtt",
      rawInput: {
        topic,
        payload: "12.10",
        timestamp: new Date().toISOString(),
        qos: 1
      },
      triggerMode: "push"
    });

    state.runIds.push(result.runId);
    expect(result.ok).toBe(true);
    expect(result.insertedCount).toBe(1);

    const { rows: recRows } = await query(
      "SELECT id FROM records WHERE job_id=$1 ORDER BY id DESC LIMIT 1",
      [jobId]
    );
    if (recRows[0]) state.recordIds.push(recRows[0].id);
  });

  it("TCP frame: reading resolved via tag mapping", async () => {
    const tcpCollectorId = await seedCollectorConfig("tcp");
    await seedTagMapping(tcpCollectorId, dimensionId, jobId, {
      deviceId: "CNC-01",
      tagAddress: "BORE_DIA"
    });

    const result = await ingestTelemetryFrame({
      collectorId: tcpCollectorId,
      sourceProtocol: "tcp",
      rawInput: `device_id=CNC-01|tag=BORE_DIA|value=12.05|unit=mm|ts=${Date.now()}`,
      triggerMode: "push"
    });

    state.runIds.push(result.runId);
    expect(result.ok).toBe(true);
    expect(result.insertedCount).toBe(1);

    const { rows: recRows } = await query(
      "SELECT id FROM records WHERE job_id=$1 ORDER BY id DESC LIMIT 1",
      [jobId]
    );
    if (recRows[0]) state.recordIds.push(recRows[0].id);
  });
});
