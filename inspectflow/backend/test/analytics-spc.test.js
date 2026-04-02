import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

function nextJobId(prefix = "J-SPC") {
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function createSpcFixture() {
  const partId = `SPC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const opNumber = "20";

  await query("INSERT INTO parts (id, description) VALUES ($1, $2)", [
    partId,
    "SPC test fixture"
  ]);
  const operation = await query(
    "INSERT INTO operations (part_id, op_number, label) VALUES ($1, $2, $3) RETURNING id",
    [partId, opNumber, "SPC Op"]
  );
  const operationId = Number(operation.rows[0].id);
  const dimension = await query(
    `INSERT INTO dimensions
      (operation_id, name, nominal, tol_plus, tol_minus, unit, sampling, input_mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [operationId, "SPC D1", 0, 1, 1, "mm", "100pct", "single"]
  );
  const dimensionId = Number(dimension.rows[0].id);
  return { partId, operationId, dimensionId };
}

async function createRecordForValue({
  partId,
  operationId,
  dimensionId,
  value,
  operatorUserId = 1,
  timestamp = null
}) {
  const jobId = nextJobId("J-SPC-RUN");
  const createJob = await request(app)
    .post("/api/jobs")
    .set("x-user-role", "Supervisor")
    .send({
      id: jobId,
      partId,
      partRevision: "A",
      operationId,
      lot: "Lot SPC",
      qty: 1,
      status: "open"
    });
  if (createJob.status !== 201) {
    return createJob;
  }

  const response = await request(app)
    .post("/api/records")
    .set("x-user-role", "Operator")
    .set("x-user-id", String(operatorUserId))
    .send({
      jobId,
      partId,
      operationId,
      lot: "Lot SPC",
      qty: 1,
      operatorUserId,
      status: "complete",
      values: [
        {
          dimensionId,
          pieceNumber: 1,
          value: String(value),
          isOot: false
        }
      ],
      tools: []
    });

  if (response.status === 201 && timestamp) {
    await query("UPDATE records SET timestamp=$2 WHERE id=$1", [response.body.id, timestamp]);
  }

  return response;
}

describe("SPC analytics control chart", () => {
  it("returns rule-based SPC signals and traceable drilldown links", async () => {
    const { partId, operationId, dimensionId } = await createSpcFixture();
    const baseTime = Date.now() - 60 * 60 * 1000;

    for (let i = 0; i < 8; i += 1) {
      const record = await createRecordForValue({
        partId,
        operationId,
        dimensionId,
        value: -1,
        timestamp: new Date(baseTime + i * 60_000).toISOString()
      });
      expect(record.status).toBe(201);
    }

    for (let i = 0; i < 8; i += 1) {
      const record = await createRecordForValue({
        partId,
        operationId,
        dimensionId,
        value: 1,
        timestamp: new Date(baseTime + (8 + i) * 60_000).toISOString()
      });
      expect(record.status).toBe(201);
    }

    const outlier = await createRecordForValue({
      partId,
      operationId,
      dimensionId,
      value: 10,
      timestamp: new Date(baseTime + 16 * 60_000).toISOString()
    });
    expect(outlier.status).toBe(201);

    const response = await request(app)
      .get(`/api/analytics/spc/control-chart?dimensionId=${dimensionId}&limit=50`)
      .set("x-user-role", "Operator");
    expect(response.status).toBe(200);
    expect(response.body.contractId).toBe("ANA-SPC-v1");
    expect(response.body.dimension.id).toBe(dimensionId);
    expect(response.body.stats.count).toBe(17);
    expect(Array.isArray(response.body.series)).toBe(true);
    expect(Array.isArray(response.body.drilldown.measurements)).toBe(true);
    expect(Array.isArray(response.body.signals.events)).toBe(true);
    expect(response.body.signals.outOfControlCount).toBe(1);
    expect(response.body.signals.summary.totalEvents).toBeGreaterThanOrEqual(3);

    const signalTypes = response.body.signals.events.map((event) => event.type);
    expect(signalTypes).toContain("beyond_control_limits");
    expect(signalTypes).toContain("run_above_centerline");
    expect(signalTypes).toContain("run_below_centerline");

    const outlierPoint = response.body.series.find(
      (point) => Number(point.recordId) === Number(outlier.body.id)
    );
    expect(outlierPoint).toBeTruthy();
    expect(outlierPoint.outOfControl).toBe(true);
    expect(outlierPoint.trace).toMatchObject({
      recordId: Number(outlier.body.id),
      dimensionId,
      pieceNumber: 1,
      recordPath: `/api/records/${outlier.body.id}`
    });
    expect(outlierPoint.trace.tracePath).toContain("/api/records/trace?");
    expect(Array.isArray(outlierPoint.signalIds)).toBe(true);
    expect(outlierPoint.signalIds.length).toBeGreaterThanOrEqual(1);

    const drilldownMeasurement = response.body.drilldown.measurements.find(
      (measurement) => Number(measurement.recordId) === Number(outlier.body.id)
    );
    expect(drilldownMeasurement).toMatchObject({
      recordId: Number(outlier.body.id),
      dimensionId,
      pieceNumber: 1,
      recordPath: `/api/records/${outlier.body.id}`
    });
    expect(drilldownMeasurement.measurementKey).toBe(`${outlier.body.id}:${dimensionId}:1`);

    const outlierSignal = response.body.signals.events.find(
      (event) => event.type === "beyond_control_limits"
    );
    expect(outlierSignal.measurements).toContainEqual(
      expect.objectContaining({
        recordId: Number(outlier.body.id),
        dimensionId,
        pieceNumber: 1
      })
    );
  });
});
