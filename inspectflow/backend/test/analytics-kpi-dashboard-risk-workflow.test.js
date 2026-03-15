import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

function nextJobId(prefix = "J-KPI") {
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function getOperationId(partId, opNumber) {
  const numeric = Number(opNumber);
  const raw = Number.isInteger(numeric) ? String(numeric) : String(opNumber);
  const values = Array.from(new Set([raw, raw.padStart(3, "0")]));
  const { rows } = await query(
    "SELECT id FROM operations WHERE part_id=$1 AND op_number = ANY($2) LIMIT 1",
    [partId, values]
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
  const { rows } = await query(
    `SELECT t.id, t.it_num
     FROM dimension_tools dt
     JOIN tools t ON t.id=dt.tool_id
     WHERE dt.dimension_id=$1
     ORDER BY t.id DESC
     LIMIT 1`,
    [dimensionId]
  );
  return rows[0] || null;
}

async function createRecordWithTool({ jobId, operationId, dimensionId, toolId, itNum, isOot, operatorUserId = 1 }) {
  return request(app)
    .post("/api/records")
    .set("x-user-role", "Operator")
    .set("x-user-id", String(operatorUserId))
    .send({
      jobId,
      partId: "1234",
      operationId,
      lot: "Lot KPI",
      qty: 1,
      operatorUserId,
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

describe("KPI dashboards and risk escalation workflow", () => {
  it("serves ANA-KPI-v3 dashboard data to operator/supervisor roles", async () => {
    const defs = await request(app)
      .get("/api/analytics/kpis/definitions")
      .set("x-user-role", "Operator");
    expect(defs.status).toBe(200);
    expect(defs.body.contractId).toBe("ANA-KPI-v3");
    expect(Array.isArray(defs.body.definitions)).toBe(true);
    expect(defs.body.definitions.length).toBeGreaterThanOrEqual(5);

    const operatorDashboard = await request(app)
      .get("/api/analytics/kpis/dashboard")
      .set("x-user-role", "Operator");
    expect(operatorDashboard.status).toBe(200);
    expect(operatorDashboard.body).toMatchObject({
      contractId: "ANA-KPI-v3",
      dashboardId: "operator_supervisor_kpi_v1"
    });
    const firstPassYield = operatorDashboard.body.kpis.first_pass_yield;
    expect(
      firstPassYield === null || typeof firstPassYield === "number"
    ).toBe(true);
    expect(Array.isArray(operatorDashboard.body.breakdowns.byWorkCenter)).toBe(true);

    const supervisorDashboard = await request(app)
      .get("/api/analytics/kpis/dashboard")
      .set("x-user-role", "Supervisor");
    expect(supervisorDashboard.status).toBe(200);
    expect(Array.isArray(supervisorDashboard.body.breakdowns.byOperator)).toBe(true);

    const unauthenticated = await request(app).get("/api/analytics/kpis/dashboard");
    expect(unauthenticated.status).toBe(401);
  });

  it("supports BL-042 risk acknowledge and escalate-to-issue lifecycle", async () => {
    const operationId = await getOperationId("1234", "20");
    expect(operationId).toBeTruthy();
    const dimensionId = await getFirstDimensionId(operationId);
    expect(dimensionId).toBeTruthy();
    const tool = await getAllowedToolForDimension(dimensionId);
    expect(tool).toBeTruthy();

    await query("UPDATE tools SET calibration_due_date=$2 WHERE id=$1", [tool.id, "2026-05-15"]);

    const ontimeJob = nextJobId("J-KPI-ON");
    const overdueJob = nextJobId("J-KPI-OD");
    const createOn = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: ontimeJob,
        partId: "1234",
        partRevision: "A",
        operationId,
        lot: "Lot KPI",
        qty: 1,
        status: "open"
      });
    expect(createOn.status).toBe(201);
    const createOd = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: overdueJob,
        partId: "1234",
        partRevision: "A",
        operationId,
        lot: "Lot KPI",
        qty: 1,
        status: "open"
      });
    expect(createOd.status).toBe(201);

    const ontimeRecord = await createRecordWithTool({
      jobId: ontimeJob,
      operationId,
      dimensionId,
      toolId: tool.id,
      itNum: tool.it_num,
      isOot: false
    });
    expect(ontimeRecord.status).toBe(201);

    const overdueRecord = await createRecordWithTool({
      jobId: overdueJob,
      operationId,
      dimensionId,
      toolId: tool.id,
      itNum: tool.it_num,
      isOot: true
    });
    expect(overdueRecord.status).toBe(201);

    await query("UPDATE records SET timestamp=$2 WHERE id=$1", [ontimeRecord.body.id, "2026-05-14T10:00:00.000Z"]);
    await query("UPDATE records SET timestamp=$2 WHERE id=$1", [overdueRecord.body.id, "2026-05-20T10:00:00.000Z"]);

    const rebuild = await request(app)
      .post("/api/analytics/marts/rebuild")
      .set("x-user-role", "Admin")
      .set("x-user-id", "10")
      .send({ triggerSource: "kpi-risk-workflow-test" });
    expect(rebuild.status).toBe(200);

    const refresh = await request(app)
      .post("/api/analytics/performance/calibration-impact/refresh")
      .set("x-user-role", "Admin")
      .set("x-user-id", "10")
      .send({
        dateFrom: "2026-05-01T00:00:00.000Z",
        dateTo: "2026-05-31T23:59:59.999Z"
      });
    expect(refresh.status).toBe(200);
    expect(refresh.body.riskIntegration.triggeredCount).toBeGreaterThanOrEqual(1);
    const dedupeKey = refresh.body.riskIntegration.events[0]?.dedupeKey;
    expect(dedupeKey).toBeTruthy();

    const openEvents = await request(app)
      .get("/api/analytics/risk-events?status=open")
      .set("x-user-role", "Admin");
    expect(openEvents.status).toBe(200);
    const target = openEvents.body.find((row) => row.dedupe_key === dedupeKey) || openEvents.body[0];
    expect(target).toBeTruthy();

    const ack = await request(app)
      .post(`/api/analytics/risk-events/${target.id}/acknowledge`)
      .set("x-user-role", "Admin")
      .set("x-user-id", "10")
      .send({ acknowledgementNote: "triaged by quality" });
    expect(ack.status).toBe(200);
    expect(ack.body).toMatchObject({ ok: true, status: "acknowledged" });

    const escalate = await request(app)
      .post(`/api/analytics/risk-events/${target.id}/escalate-issue`)
      .set("x-user-role", "Admin")
      .set("x-user-id", "10")
      .send({});
    expect(escalate.status).toBe(200);
    expect(Number(escalate.body.issueId)).toBeGreaterThan(0);

    const issueCheck = await query(
      "SELECT id, category, status, submitted_by_user_id FROM issue_reports WHERE id=$1",
      [escalate.body.issueId]
    );
    expect(issueCheck.rows[0]).toMatchObject({
      id: Number(escalate.body.issueId),
      category: "tolerance_issue",
      status: "open",
      submitted_by_user_id: 10
    });

    const resolve = await request(app)
      .post(`/api/analytics/risk-events/${target.id}/resolve`)
      .set("x-user-role", "Admin")
      .set("x-user-id", "10")
      .send({ resolutionNote: "closed after disposition" });
    expect(resolve.status).toBe(200);
    expect(resolve.body).toMatchObject({ ok: true, status: "resolved" });

    const resolvedEvents = await request(app)
      .get("/api/analytics/risk-events?status=resolved")
      .set("x-user-role", "Admin");
    expect(resolvedEvents.status).toBe(200);
    const resolved = resolvedEvents.body.find((row) => Number(row.id) === Number(target.id));
    expect(resolved?.linked_issue_id).toBe(Number(escalate.body.issueId));
  });
});
