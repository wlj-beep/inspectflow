import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

function nextJobId(prefix = "J-SPC") {
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function nextItNum(prefix = "IT-SPC") {
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function getSeedOperationContext() {
  const { rows } = await query(
    `SELECT o.id, o.part_id, o.work_center_id
     FROM operations o
     JOIN dimensions d ON d.operation_id=o.id
     GROUP BY o.id, o.part_id, o.work_center_id
     ORDER BY o.id ASC
     LIMIT 1`
  );
  return rows[0] || null;
}

async function getFirstDimensionId(operationId) {
  const { rows } = await query(
    `SELECT id
     FROM dimensions
     WHERE operation_id=$1
     ORDER BY CASE WHEN COALESCE(input_mode, 'single')='single' THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
    [operationId]
  );
  return rows[0]?.id || null;
}

async function ensureToolForDimension(dimensionId) {
  const existing = await query(
    `SELECT t.id, t.it_num
     FROM dimension_tools dt
     JOIN tools t ON t.id=dt.tool_id
     WHERE dt.dimension_id=$1
     ORDER BY t.id ASC
     LIMIT 1`,
    [dimensionId]
  );
  if (existing.rows[0]) return existing.rows[0];

  const created = await query(
    `INSERT INTO tools (name, type, it_num, size, active, visible)
     VALUES ($1,$2,$3,$4,true,true)
     RETURNING id, it_num`,
    [`SPC Tool ${dimensionId}`, "Variable", nextItNum(), "N/A"]
  );
  const tool = created.rows[0];
  await query(
    "INSERT INTO dimension_tools (dimension_id, tool_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
    [dimensionId, tool.id]
  );
  return tool;
}

async function createExtraToolForDimension(dimensionId) {
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  const created = await query(
    `INSERT INTO tools (name, type, it_num, size, active, visible)
     VALUES ($1,$2,$3,$4,true,true)
     RETURNING id, it_num`,
    [`SPC Tool ${suffix}`, "Variable", `IT-SPC-${suffix}`, "N/A"]
  );
  const tool = created.rows[0];
  await query(
    "INSERT INTO dimension_tools (dimension_id, tool_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
    [dimensionId, tool.id]
  );
  return tool;
}

async function createSinglePieceRecord({
  jobId,
  partId,
  operationId,
  dimensionId,
  value,
  withTool,
  tool,
  extraTools = [],
  operatorUserId = 1
}) {
  const payload = {
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
        value,
        isOot: false
      }
    ]
  };

  const recordTools = [];
  if (withTool && tool?.id) {
    recordTools.push({
      dimensionId,
      toolId: Number(tool.id),
      itNum: tool.it_num
    });
  }
  for (const extraTool of extraTools) {
    if (!extraTool?.id) continue;
    recordTools.push({
      dimensionId,
      toolId: Number(extraTool.id),
      itNum: extraTool.it_num
    });
  }
  if (recordTools.length) {
    payload.tools = recordTools;
  }

  return request(app)
    .post("/api/records")
    .set("x-user-role", "Operator")
    .set("x-user-id", String(operatorUserId))
    .send(payload);
}

describe("SPC analytics (BL-071)", () => {
  it("returns SPC statistics, rule findings, and tooling/work-center context filters", async () => {
    const operation = await getSeedOperationContext();
    expect(operation?.id).toBeTruthy();
    expect(operation?.part_id).toBeTruthy();
    const partId = String(operation.part_id);
    const dimensionId = await getFirstDimensionId(operation.id);
    expect(dimensionId).toBeTruthy();
    const tool = await ensureToolForDimension(dimensionId);
    expect(tool?.id).toBeTruthy();
    const extraTool = await createExtraToolForDimension(dimensionId);
    expect(extraTool?.id).toBeTruthy();

    const sampleValues = [
      "0.6247",
      "0.6248",
      "0.6249",
      "0.6250",
      "0.6251",
      "0.6252",
      "0.6253",
      "0.6254"
    ];

    for (let i = 0; i < sampleValues.length; i += 1) {
      const jobId = nextJobId();
      const createdJob = await request(app)
        .post("/api/jobs")
        .set("x-user-role", "Supervisor")
        .send({
          id: jobId,
          partId,
          partRevision: "A",
          operationId: operation.id,
          lot: "Lot SPC",
          qty: 1,
          status: "open"
        });
      expect(createdJob.status).toBe(201);

      const submitted = await createSinglePieceRecord({
        jobId,
        partId,
        operationId: operation.id,
        dimensionId,
        value: sampleValues[i],
        withTool: i % 2 === 0,
        tool,
        extraTools: [extraTool]
      });
      expect(submitted.status).toBe(201);
    }

    const rebuild = await request(app)
      .post("/api/analytics/marts/rebuild")
      .set("x-user-role", "Admin")
      .set("x-user-id", "10")
      .send({ triggerSource: "spc-test-rebuild" });
    expect(rebuild.status).toBe(200);

    const base = await request(app)
      .get(`/api/analytics/performance/spc?dimensionId=${encodeURIComponent(dimensionId)}&rules=trend_of_6,point_beyond_3sigma&limit=500`)
      .set("x-user-role", "Supervisor")
      .set("x-user-id", "2");
    expect(base.status).toBe(200);
    expect(base.body).toMatchObject({
      contractId: "ANA-KPI-v3",
      capabilityId: "BL-071-spc-v1",
      analysisId: "spc_characteristic_v1"
    });
    expect(Number(base.body.sampleSize || 0)).toBeGreaterThanOrEqual(sampleValues.length);
    expect(typeof base.body.statistics?.mean).toBe("number");
    expect(base.body.statistics?.controlLimits).toBeTruthy();
    expect(Array.isArray(base.body.ruleFindings)).toBe(true);
    const trendRule = base.body.ruleFindings.find((row) => row.rule === "trend_of_6");
    expect(Number(trendRule?.count || 0)).toBeGreaterThan(0);

    const toolFiltered = await request(app)
      .get(`/api/analytics/performance/spc?dimensionId=${encodeURIComponent(dimensionId)}&toolId=${encodeURIComponent(tool.id)}&limit=500`)
      .set("x-user-role", "Supervisor")
      .set("x-user-id", "2");
    expect(toolFiltered.status).toBe(200);
    expect(Number(toolFiltered.body.sampleSize || 0)).toBeGreaterThan(0);
    for (const point of toolFiltered.body.points || []) {
      expect(Number(point.toolId)).toBe(Number(tool.id));
    }

    const extraToolFiltered = await request(app)
      .get(`/api/analytics/performance/spc?dimensionId=${encodeURIComponent(dimensionId)}&toolId=${encodeURIComponent(extraTool.id)}&limit=500`)
      .set("x-user-role", "Supervisor")
      .set("x-user-id", "2");
    expect(extraToolFiltered.status).toBe(200);
    expect(Number(extraToolFiltered.body.sampleSize || 0)).toBeGreaterThan(0);
    for (const point of extraToolFiltered.body.points || []) {
      expect(Number(point.toolId)).toBe(Number(extraTool.id));
    }

    if (operation.work_center_id) {
      const centerFiltered = await request(app)
        .get(`/api/analytics/performance/spc?dimensionId=${encodeURIComponent(dimensionId)}&workCenterId=${encodeURIComponent(operation.work_center_id)}&limit=500`)
        .set("x-user-role", "Supervisor")
        .set("x-user-id", "2");
      expect(centerFiltered.status).toBe(200);
      expect(Number(centerFiltered.body.sampleSize || 0)).toBeGreaterThan(0);
      for (const point of centerFiltered.body.points || []) {
        expect(String(point.workCenterId)).toBe(String(operation.work_center_id));
      }
    }
  });

  it("rejects invalid dimension filters and blocks operator access", async () => {
    const invalid = await request(app)
      .get("/api/analytics/performance/spc?dimensionId=bad")
      .set("x-user-role", "Supervisor")
      .set("x-user-id", "2");
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe("invalid_dimension_id");

    const forbidden = await request(app)
      .get("/api/analytics/performance/spc?dimensionId=1")
      .set("x-user-role", "Operator")
      .set("x-user-id", "1");
    expect(forbidden.status).toBe(403);
  });
});
