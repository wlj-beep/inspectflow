import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

function nextJobId(prefix = "J-ANA-INC") {
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function getSeedOperationContext() {
  const { rows } = await query(
    `SELECT o.id, o.part_id
     FROM operations o
     JOIN dimensions d ON d.operation_id=o.id
     GROUP BY o.id, o.part_id
     ORDER BY o.id ASC
     LIMIT 1`
  );
  return rows[0] || null;
}

async function getFirstDimension(operationId) {
  const { rows } = await query(
    `SELECT id, name
     FROM dimensions
     WHERE operation_id=$1
     ORDER BY CASE WHEN COALESCE(input_mode, 'single')='single' THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
    [operationId]
  );
  return rows[0] || null;
}

describe("Analytics incremental refresh (BL-069)", () => {
  it("refreshes inspection mart after record submit without requiring manual rebuild", async () => {
    const operation = await getSeedOperationContext();
    expect(operation?.id).toBeTruthy();
    expect(operation?.part_id).toBeTruthy();
    const operationId = Number(operation.id);
    const partId = String(operation.part_id);
    const dimension = await getFirstDimension(operationId);
    expect(dimension?.id).toBeTruthy();

    const jobId = nextJobId("J-ANA-R");
    const createJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: jobId,
        partId,
        partRevision: "A",
        operationId,
        lot: "Lot ANA",
        qty: 1,
        status: "open"
      });
    expect(createJob.status).toBe(201);

    const submit = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .set("x-user-id", "1")
      .send({
        jobId,
        partId,
        operationId,
        lot: "Lot ANA",
        qty: 1,
        operatorUserId: 1,
        status: "complete",
        values: [
          {
            dimensionId: dimension.id,
            pieceNumber: 1,
            value: "0.6250",
            isOot: false
          }
        ]
      });
    expect(submit.status).toBe(201);

    const factRes = await query(
      "SELECT COUNT(*)::INT AS count FROM ana_mart_inspection_fact WHERE site_id='default' AND record_id=$1",
      [submit.body.id]
    );
    expect(Number(factRes.rows[0]?.count || 0)).toBeGreaterThan(0);

    const buildRes = await query(
      `SELECT transform_version, trigger_source, status
       FROM ana_mart_build_runs
       WHERE trigger_source='records.submit'
       ORDER BY id DESC
       LIMIT 1`
    );
    expect(buildRes.rows[0]?.transform_version).toBe("ANA-MART-v3-incremental-v1");
    expect(buildRes.rows[0]?.status).toBe("success");
  });

  it("refreshes connector + inspection marts after measurement import without manual rebuild", async () => {
    const operation = await getSeedOperationContext();
    expect(operation?.id).toBeTruthy();
    expect(operation?.part_id).toBeTruthy();
    const operationId = Number(operation.id);
    const partId = String(operation.part_id);
    const dimension = await getFirstDimension(operationId);
    expect(dimension?.id).toBeTruthy();

    const jobId = nextJobId("J-ANA-I");
    const createJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: jobId,
        partId,
        partRevision: "A",
        operationId,
        lot: "Lot ANA IMP",
        qty: 1,
        status: "open"
      });
    expect(createJob.status).toBe(201);

    const imported = await request(app)
      .post("/api/imports/measurements/bulk")
      .set("x-user-role", "Supervisor")
      .set("x-user-id", "2")
      .send({
        rows: [
          {
            job_id: jobId,
            part_id: partId,
            operation_id: operationId,
            operator_user_id: 1,
            piece_number: 1,
            dimension_id: dimension.id,
            value: "0.6250",
            is_oot: false
          }
        ]
      });

    expect(imported.status).toBe(200);
    expect(Number(imported.body.runId || 0)).toBeGreaterThan(0);

    const connectorFactRes = await query(
      "SELECT COUNT(*)::INT AS count FROM ana_mart_connector_run_fact WHERE site_id='default' AND run_id=$1",
      [Number(imported.body.runId)]
    );
    expect(Number(connectorFactRes.rows[0]?.count || 0)).toBe(1);

    const inspectionFactRes = await query(
      "SELECT COUNT(*)::INT AS count FROM ana_mart_inspection_fact WHERE site_id='default' AND job_id=$1",
      [jobId]
    );
    expect(Number(inspectionFactRes.rows[0]?.count || 0)).toBeGreaterThan(0);
  });
});
