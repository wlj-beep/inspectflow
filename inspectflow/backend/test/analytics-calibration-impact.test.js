import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

function nextJobId(prefix = "J-CAL") {
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
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  const insertTool = await query(
    `INSERT INTO tools (name, type, it_num, active, visible)
     VALUES ($1, 'Variable', $2, true, true)
     RETURNING id, it_num`,
    [`CAL TOOL ${suffix}`, `IT-CAL-${suffix}`]
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

async function createRecordWithTool({ jobId, operationId, dimensionId, toolId, itNum, isOot, operatorUserId = 1 }) {
  return request(app)
    .post("/api/records")
    .set("x-user-role", "Operator")
    .set("x-user-id", String(operatorUserId))
    .send({
      jobId,
      partId: "1234",
      operationId,
      lot: "Lot CAL",
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

describe("Calibration impact analytics and BL-042 integration", () => {
  it("builds calibration-impact correlations and emits ANA-RISK-v3 escalations", async () => {
    const operationId = await getOperationId("1234", "20");
    expect(operationId).toBeTruthy();
    const dimensionId = await getFirstDimensionId(operationId);
    expect(dimensionId).toBeTruthy();
    const tool = await getAllowedToolForDimension(dimensionId);
    expect(tool).toBeTruthy();

    await query(
      "UPDATE tools SET calibration_due_date=$2 WHERE id=$1",
      [tool.id, "2026-03-15"]
    );

    const jobOntime = nextJobId("J-CAL-ON");
    const createdOntimeJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: jobOntime,
        partId: "1234",
        partRevision: "A",
        operationId,
        lot: "Lot CAL",
        qty: 1,
        status: "open"
      });
    expect(createdOntimeJob.status).toBe(201);

    const ontimeRecord = await createRecordWithTool({
      jobId: jobOntime,
      operationId,
      dimensionId,
      toolId: tool.id,
      itNum: tool.it_num,
      isOot: false
    });
    expect(ontimeRecord.status).toBe(201);

    const jobOverdue = nextJobId("J-CAL-OD");
    const createdOverdueJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: jobOverdue,
        partId: "1234",
        partRevision: "A",
        operationId,
        lot: "Lot CAL",
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

    await query("UPDATE records SET timestamp=$2 WHERE id=$1", [ontimeRecord.body.id, "2026-03-14T10:00:00.000Z"]);
    await query("UPDATE records SET timestamp=$2 WHERE id=$1", [overdueRecord.body.id, "2026-03-20T10:00:00.000Z"]);

    const rebuild = await request(app)
      .post("/api/analytics/marts/rebuild")
      .set("x-user-role", "Admin")
      .set("x-user-id", "10")
      .send({ triggerSource: "calibration-impact-test" });
    expect(rebuild.status).toBe(200);
    expect(rebuild.body.ok).toBe(true);

    const refresh = await request(app)
      .post("/api/analytics/performance/calibration-impact/refresh")
      .set("x-user-role", "Admin")
      .set("x-user-id", "10")
      .send({
        dateFrom: "2026-03-01T00:00:00.000Z",
        dateTo: "2026-03-31T23:59:59.999Z"
      });
    expect(refresh.status).toBe(200);
    expect(refresh.body.contractId).toBe("ANA-MSA-v1");
    expect(refresh.body.foundationContractId).toBe("ANA-KPI-v3");
    expect(refresh.body.riskIntegration.contractId).toBe("ANA-RISK-v3");
    expect(refresh.body.measurementSystemSummary).toMatchObject({
      contractId: "ANA-MSA-v1",
      correlatedToolCount: expect.any(Number),
      triggeredToolCount: expect.any(Number),
      overdueToolCount: expect.any(Number),
      toolHealthCounts: expect.any(Object),
      defectRiskCounts: expect.any(Object)
    });
    expect(refresh.body.remediationView).toMatchObject({
      contractId: "ANA-MSA-v1",
      viewId: "operator_safe_remediation_v1",
      summary: expect.any(Object),
      restrictions: expect.any(Array)
    });
    expect(Array.isArray(refresh.body.toolPerformance)).toBe(true);

    const toolRow = refresh.body.toolPerformance.find((row) => Number(row.toolId) === Number(tool.id));
    expect(toolRow).toBeTruthy();
    expect(toolRow.overdueMeasurementCount).toBeGreaterThanOrEqual(1);
    expect(toolRow.ontimeMeasurementCount).toBeGreaterThanOrEqual(1);
    expect(toolRow.overdueOotRate).toBeGreaterThan(toolRow.ontimeOotRate);
    expect(toolRow.toolHealth).toMatchObject({
      calibrationState: "overdue",
      defectRiskBand: "high",
      correlationStatus: "degrades_quality"
    });

    const remediationItem = refresh.body.remediationView.items.find((item) => Number(item.toolId) === Number(tool.id));
    expect(remediationItem).toBeTruthy();
    expect(remediationItem).toMatchObject({
      calibrationState: "overdue",
      defectRiskBand: "high",
      actionPriority: "urgent",
      linkedRiskEvent: {
        severity: "high"
      }
    });
    expect(Array.isArray(remediationItem.recommendedActions)).toBe(true);
    expect(remediationItem.recommendedActions.some((action) => action.code === "hold_tool_use")).toBe(true);
    expect(remediationItem.recommendedActions.every((action) => action.actorRole === "Operator" && action.safe === true)).toBe(true);

    expect(refresh.body.riskIntegration.triggeredCount).toBeGreaterThanOrEqual(1);
    const event = refresh.body.riskIntegration.events[0];
    const escalation = refresh.body.riskIntegration.escalations[0];
    expect(event.contractId).toBe("ANA-RISK-v3");
    expect(escalation.workflowContractId).toBe("QUAL-RISK-WORKFLOW-v1");
    expect(Array.isArray(escalation.evidence.traceLinks)).toBe(true);
    expect(escalation.evidence.traceLinks.length).toBeGreaterThan(0);

    const listOpen = await request(app)
      .get("/api/analytics/risk-events?status=open")
      .set("x-user-role", "Admin");
    expect(listOpen.status).toBe(200);
    const stored = listOpen.body.find((row) => row.dedupe_key === event.dedupeKey);
    expect(stored).toBeTruthy();
    expect(stored.contract_id).toBe("ANA-RISK-v3");
    expect(stored.escalation_record?.workflowContractId).toBe("QUAL-RISK-WORKFLOW-v1");

    const resolve = await request(app)
      .post(`/api/analytics/risk-events/${stored.id}/resolve`)
      .set("x-user-role", "Admin")
      .set("x-user-id", "10")
      .send({ resolutionNote: "calibration-risk reviewed" });
    expect(resolve.status).toBe(200);
    expect(resolve.body).toMatchObject({ ok: true, status: "resolved" });

    const listResolved = await request(app)
      .get("/api/analytics/risk-events?status=resolved")
      .set("x-user-role", "Admin");
    expect(listResolved.status).toBe(200);
    expect(listResolved.body.some((row) => Number(row.id) === Number(stored.id))).toBe(true);

    const remediationView = await request(app)
      .get("/api/analytics/performance/calibration-impact/remediation-view")
      .query({
        dateFrom: "2026-03-01T00:00:00.000Z",
        dateTo: "2026-03-31T23:59:59.999Z"
      })
      .set("x-user-role", "Operator");
    expect(remediationView.status).toBe(200);
    expect(remediationView.body).toMatchObject({
      contractId: "ANA-MSA-v1",
      remediationView: {
        viewId: "operator_safe_remediation_v1"
      }
    });
    expect(remediationView.body.remediationView.items.some((item) => Number(item.toolId) === Number(tool.id))).toBe(true);
  });

  it("keeps admin analytics restricted while allowing the operator-safe remediation view", async () => {
    const deniedRefresh = await request(app)
      .post("/api/analytics/performance/calibration-impact/refresh")
      .set("x-user-role", "Operator")
      .send({});
    expect(deniedRefresh.status).toBe(403);

    const allowedRemediationView = await request(app)
      .get("/api/analytics/performance/calibration-impact/remediation-view")
      .set("x-user-role", "Operator");
    expect(allowedRemediationView.status).toBe(200);
    expect(allowedRemediationView.body).toMatchObject({
      contractId: "ANA-MSA-v1",
      remediationView: {
        viewId: "operator_safe_remediation_v1"
      }
    });

    const deniedList = await request(app)
      .get("/api/analytics/risk-events")
      .set("x-user-role", "Operator");
    expect(deniedList.status).toBe(403);
  });
});
