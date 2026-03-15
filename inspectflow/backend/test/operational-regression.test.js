import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

function nextId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

async function getOperationId(partId, opNumber) {
  const { rows } = await query(
    "SELECT id FROM operations WHERE part_id=$1 AND op_number=$2 LIMIT 1",
    [partId, opNumber]
  );
  return rows[0]?.id;
}

async function getDimensionTool(operationId) {
  const { rows } = await query(
    `SELECT d.id AS dimension_id, t.id AS tool_id, t.it_num
     FROM dimensions d
     JOIN dimension_tools dt ON dt.dimension_id = d.id
     JOIN tools t ON t.id = dt.tool_id
     WHERE d.operation_id = $1
     ORDER BY d.id ASC, t.id ASC
     LIMIT 1`,
    [operationId]
  );
  return rows[0] || null;
}

async function createJob({ id, partId, partRevision = "A", operationId, lot = "Lot T", qty = 5, status = "open", role = "Supervisor" }) {
  return request(app)
    .post("/api/jobs")
    .set("x-user-role", role)
    .send({ id, partId, partRevision, operationId, lot, qty, status });
}

describe("Operational regression: stability + persistence", () => {
  it("creates a job and persists core job fields", async () => {
    const op20 = await getOperationId("1234", "20");
    expect(op20).toBeTruthy();

    const jobId = nextId("J-OPS");
    const created = await createJob({ id: jobId, partId: "1234", operationId: op20, lot: "Lot OPS", qty: 3 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ id: jobId, part_id: "1234", status: "open" });

    const { rows } = await query(
      "SELECT id, part_id, part_revision_code, operation_id, lot, qty, status FROM jobs WHERE id=$1",
      [jobId]
    );
    expect(rows[0]).toMatchObject({
      id: jobId,
      part_id: "1234",
      part_revision_code: "A",
      operation_id: op20,
      lot: "Lot OPS",
      qty: 3,
      status: "open"
    });
  });

  it("imports jobs via CSV and persists mapped operation", async () => {
    const op20 = await getOperationId("1234", "20");
    expect(op20).toBeTruthy();

    const jobId = nextId("J-CSV");
    const csv = [
      "job_id,part_id,part_revision,op_number,lot,qty,status",
      `${jobId},1234,A,020,Lot CSV,4,open`
    ].join("\n");

    const res = await request(app)
      .post("/api/imports/jobs/csv")
      .set("x-user-role", "Admin")
      .send({ csvText: csv });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ inserted: 1, failed: 0 });

    const { rows } = await query(
      "SELECT id, operation_id, lot, qty, status FROM jobs WHERE id=$1",
      [jobId]
    );
    expect(rows[0]).toMatchObject({
      id: jobId,
      operation_id: op20,
      lot: "Lot CSV",
      qty: 4,
      status: "open"
    });
  });

  it("submits a record and persists related rows (values, snapshots, tools)", async () => {
    const op20 = await getOperationId("1234", "20");
    expect(op20).toBeTruthy();

    const jobId = nextId("J-REC");
    const created = await createJob({ id: jobId, partId: "1234", operationId: op20, lot: "Lot REC", qty: 2 });
    expect(created.status).toBe(201);

    const dimTool = await getDimensionTool(op20);
    expect(dimTool?.dimension_id).toBeTruthy();

    const values = [
      { dimensionId: dimTool.dimension_id, pieceNumber: 1, value: "0.6250", isOot: false }
    ];
    const tools = dimTool?.tool_id
      ? [{ dimensionId: dimTool.dimension_id, toolId: dimTool.tool_id, itNum: dimTool.it_num }]
      : [];

    const submitted = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        jobId,
        partId: "1234",
        operationId: op20,
        lot: "Lot REC",
        qty: 2,
        operatorUserId: 1,
        status: "complete",
        oot: false,
        comment: "",
        values,
        tools,
        missingPieces: [],
        pieceComments: []
      });
    expect(submitted.status).toBe(201);
    const recordId = submitted.body.id;
    expect(recordId).toBeTruthy();

    const recordRes = await query(
      "SELECT id, job_id, status, oot FROM records WHERE id=$1",
      [recordId]
    );
    expect(recordRes.rows[0]).toMatchObject({ id: recordId, job_id: jobId, status: "complete", oot: false });

    const valueCount = await query(
      "SELECT COUNT(*)::INT AS count FROM record_values WHERE record_id=$1",
      [recordId]
    );
    expect(valueCount.rows[0]?.count).toBe(values.length);

    const dimCount = await query(
      "SELECT COUNT(*)::INT AS count FROM dimensions WHERE operation_id=$1",
      [op20]
    );
    const snapshotCount = await query(
      "SELECT COUNT(*)::INT AS count FROM record_dimension_snapshots WHERE record_id=$1",
      [recordId]
    );
    expect(snapshotCount.rows[0]?.count).toBe(dimCount.rows[0]?.count);

    const toolCount = await query(
      "SELECT COUNT(*)::INT AS count FROM record_tools WHERE record_id=$1",
      [recordId]
    );
    if (tools.length) {
      expect(toolCount.rows[0]?.count).toBe(1);
    } else {
      expect(toolCount.rows[0]?.count).toBe(0);
    }

    const jobStatus = await query("SELECT status FROM jobs WHERE id=$1", [jobId]);
    expect(jobStatus.rows[0]?.status).toBe("closed");
  });
});
