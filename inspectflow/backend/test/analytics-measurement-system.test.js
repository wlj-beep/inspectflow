import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

function nextJobId(prefix = "J-MSA") {
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function getOperationId(partId, opNumber) {
  const { rows } = await query(
    "SELECT id FROM operations WHERE part_id=$1 AND op_number=$2 LIMIT 1",
    [partId, opNumber]
  );
  return rows[0]?.id || null;
}

async function getFirstDimensionId(operationId) {
  const { rows } = await query(
    "SELECT id FROM dimensions WHERE operation_id=$1 ORDER BY id ASC LIMIT 1",
    [operationId]
  );
  return rows[0]?.id || null;
}

async function getAllowedToolForDimension(dimensionId) {
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  const insertTool = await query(
    `INSERT INTO tools (name, type, it_num, active, visible)
     VALUES ($1, 'Variable', $2, true, true)
     RETURNING id, it_num`,
    [`MSA TOOL ${suffix}`, `IT-MSA-${suffix}`]
  );
  const tool = insertTool.rows[0] || null;
  if (!tool) return null;
  await query(
    `INSERT INTO dimension_tools (dimension_id, tool_id)
     VALUES ($1, $2)
     ON CONFLICT (dimension_id, tool_id) DO NOTHING`,
    [dimensionId, tool.id]
  );
  return tool;
}

async function createRecordWithTool({ jobId, operationId, dimensionId, toolId, itNum, isOot }) {
  return request(app)
    .post("/api/records")
    .set("x-user-role", "Operator")
    .set("x-user-id", "1")
    .send({
      jobId,
      partId: "1234",
      operationId,
      lot: "Lot MSA",
      qty: 1,
      operatorUserId: 1,
      status: "complete",
      values: [
        {
          dimensionId,
          pieceNumber: 1,
          value: isOot ? "0.6240" : "0.6250",
          isOot
        }
      ],
      tools: [
        {
          dimensionId,
          toolId,
          itNum
        }
      ]
    });
}

describe("measurement-system analytics", () => {
  it("correlates tool health with defects and produces operator-safe remediation guidance", async () => {
    const operationId = await getOperationId("1234", "20");
    expect(operationId).toBeTruthy();
    const dimensionId = await getFirstDimensionId(operationId);
    expect(dimensionId).toBeTruthy();
    const tool = await getAllowedToolForDimension(dimensionId);
    expect(tool).toBeTruthy();

    await query("UPDATE tools SET calibration_due_date=$2 WHERE id=$1", [tool.id, "2026-03-15"]);

    const jobOnTime = nextJobId("J-MSA-ON");
    const createdOnTimeJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: jobOnTime,
        partId: "1234",
        partRevision: "A",
        operationId,
        lot: "Lot MSA",
        qty: 1,
        status: "open"
      });
    expect(createdOnTimeJob.status).toBe(201);

    const onTimeRecord = await createRecordWithTool({
      jobId: jobOnTime,
      operationId,
      dimensionId,
      toolId: tool.id,
      itNum: tool.it_num,
      isOot: false
    });
    expect(onTimeRecord.status).toBe(201);

    const jobOverdue = nextJobId("J-MSA-OD");
    const createdOverdueJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: jobOverdue,
        partId: "1234",
        partRevision: "A",
        operationId,
        lot: "Lot MSA",
        qty: 1,
        status: "open"
      });
    expect(createdOverdueJob.status).toBe(201);

    const overdueRecord = await createRecordWithTool({
      jobId: jobOverdue,
      operationId,
      dimensionId,
      toolId: tool.id,
      itNum: tool.it_num,
      isOot: true
    });
    expect(overdueRecord.status).toBe(201);

    await query("UPDATE records SET timestamp=$2 WHERE id=$1", [onTimeRecord.body.id, "2026-03-14T10:00:00.000Z"]);
    await query("UPDATE records SET timestamp=$2 WHERE id=$1", [overdueRecord.body.id, "2026-03-20T10:00:00.000Z"]);

    const rebuild = await request(app)
      .post("/api/analytics/marts/rebuild")
      .set("x-user-role", "Admin")
      .set("x-user-id", "10")
      .send({ triggerSource: "measurement-system-test" });
    expect(rebuild.status).toBe(200);

    const refresh = await request(app)
      .get("/api/analytics/performance/measurement-system?dateFrom=2026-03-01T00:00:00.000Z&dateTo=2026-03-31T23:59:59.999Z")
      .set("x-user-role", "Admin")
      .set("x-user-id", "10");
    expect(refresh.status).toBe(200);
    expect(refresh.body.contractId).toBe("ANA-MSA-v1");
    expect(refresh.body.summary.toolCount).toBeGreaterThan(0);
    expect(refresh.body.summary.flaggedToolCount).toBeGreaterThan(0);
    expect(refresh.body.toolHealth.some((row) => Number(row.toolId) === Number(tool.id))).toBe(true);
    const remediation = refresh.body.remediations.find((row) => Number(row.toolId) === Number(tool.id));
    expect(remediation).toBeTruthy();
    expect(["medium", "high"]).toContain(remediation.severity);
    expect(Array.isArray(refresh.body.correlations)).toBe(true);
    expect(refresh.body.sourceRiskIntegration.contractId).toBe("ANA-RISK-v3");
  });
});
