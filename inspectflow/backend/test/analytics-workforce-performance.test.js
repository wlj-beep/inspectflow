import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

function nextJobId(prefix = "J-WF") {
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

describe("Workforce performance analytics (BL-070)", () => {
  it("serves supervisor/admin performance dashboard payload", async () => {
    const operation = await getSeedOperationContext();
    expect(operation?.id).toBeTruthy();
    expect(operation?.part_id).toBeTruthy();
    const operationId = Number(operation.id);
    const partId = String(operation.part_id);
    const dimensionId = await getFirstDimensionId(operationId);
    expect(dimensionId).toBeTruthy();

    const jobId = nextJobId();
    const createJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: jobId,
        partId,
        partRevision: "A",
        operationId,
        lot: "Lot WF",
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
        lot: "Lot WF",
        qty: 1,
        operatorUserId: 1,
        status: "complete",
        values: [
          {
            dimensionId,
            pieceNumber: 1,
            value: "0.6250",
            isOot: false
          }
        ]
      });
    expect(submit.status).toBe(201);

    const supervisorRes = await request(app)
      .get("/api/analytics/performance/workforce")
      .set("x-user-role", "Supervisor")
      .set("x-user-id", "2");
    expect(supervisorRes.status).toBe(200);
    expect(supervisorRes.body).toMatchObject({
      contractId: "ANA-KPI-v3",
      capabilityId: "BL-070-supervisor-performance-v1",
      dashboardId: "supervisor_admin_performance_v1"
    });
    expect(Number(supervisorRes.body.summary?.totalPieces || 0)).toBeGreaterThan(0);
    expect(Array.isArray(supervisorRes.body.breakdowns?.byOperator)).toBe(true);
    expect(Array.isArray(supervisorRes.body.breakdowns?.dailyTrend)).toBe(true);
    expect(supervisorRes.body.production?.jobStatusCounts).toBeTruthy();

    const adminRes = await request(app)
      .get("/api/analytics/performance/workforce")
      .set("x-user-role", "Admin")
      .set("x-user-id", "10");
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.siteScope?.siteId).toBe("default");
  });

  it("keeps workforce performance endpoint inaccessible to operator role", async () => {
    const operatorRes = await request(app)
      .get("/api/analytics/performance/workforce")
      .set("x-user-role", "Operator")
      .set("x-user-id", "1");
    expect(operatorRes.status).toBe(403);
  });

  it("rejects impossible one-sided date windows", async () => {
    const futureWindow = await request(app)
      .get("/api/analytics/performance/workforce?dateFrom=2999-01-01T00:00:00.000Z")
      .set("x-user-role", "Supervisor")
      .set("x-user-id", "2");
    expect(futureWindow.status).toBe(400);
    expect(futureWindow.body.error).toBe("invalid_window_range");
  });
});
