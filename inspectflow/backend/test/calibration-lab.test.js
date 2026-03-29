import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";
import { createTestSession, cleanupTestUsers } from "./helpers/sessionFixtures.js";

const trackedToolIds = [];
const trackedScheduleIds = [];
const trackedEventIds = [];
const trackedImpactIds = [];
const trackedPartIds = [];
const trackedOperationIds = [];
const trackedJobIds = [];
const trackedRecordIds = [];
const trackedUserIds = [];

function suffix() {
  return crypto.randomUUID().slice(0, 8);
}

async function createTool(namePrefix = "Calibration Tool") {
  const toolName = `${namePrefix} ${suffix()}`;
  const { rows } = await query(
    `INSERT INTO tools (name, type, it_num, active, visible)
     VALUES ($1, $2, $3, true, true)
     RETURNING id`,
    [toolName, "Variable", `IT-${suffix()}`]
  );
  const id = Number(rows[0].id);
  trackedToolIds.push(id);
  return id;
}

async function createRecallFixture(operatorUserId) {
  const partId = `CAL-PART-${suffix().toUpperCase()}`;
  const operationLabel = `Calibration Op ${suffix()}`;
  const jobId = `CAL-JOB-${suffix().toUpperCase()}`;

  const partRows = await query(
    "INSERT INTO parts (id, description) VALUES ($1, $2) RETURNING id",
    [partId, "Calibration fixture part"]
  );
  trackedPartIds.push(partRows.rows[0].id);

  const operationRows = await query(
    "INSERT INTO operations (part_id, op_number, label) VALUES ($1, $2, $3) RETURNING id",
    [partId, "10", operationLabel]
  );
  const operationId = Number(operationRows.rows[0].id);
  trackedOperationIds.push(operationId);

  const jobRows = await query(
    `INSERT INTO jobs (id, part_id, part_revision_code, operation_id, lot, qty, status)
     VALUES ($1, $2, 'A', $3, $4, $5, 'open')
     RETURNING id`,
    [jobId, partId, operationId, `LOT-${suffix()}`, 1]
  );
  trackedJobIds.push(jobRows.rows[0].id);

  const recordRows = await query(
    `INSERT INTO records
       (job_id, part_id, operation_id, lot, serial_number, qty, operator_user_id, status, oot, comment)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'complete', false, $8)
     RETURNING id`,
    [jobId, partId, operationId, `LOT-${suffix()}`, null, 1, operatorUserId, "Calibration impact fixture"]
  );
  const recordId = Number(recordRows.rows[0].id);
  trackedRecordIds.push(recordId);

  return { partId, operationId, jobId, recordId };
}

afterEach(async () => {
  for (const id of trackedImpactIds.splice(0).reverse()) {
    await query("DELETE FROM calibration_recall_impacts WHERE id=$1", [id]).catch(() => {});
  }
  for (const id of trackedEventIds.splice(0).reverse()) {
    await query("DELETE FROM calibration_events WHERE id=$1", [id]).catch(() => {});
  }
  for (const id of trackedScheduleIds.splice(0).reverse()) {
    await query("DELETE FROM calibration_schedules WHERE id=$1", [id]).catch(() => {});
  }
  for (const id of trackedRecordIds.splice(0).reverse()) {
    await query("DELETE FROM records WHERE id=$1", [id]).catch(() => {});
  }
  for (const id of trackedJobIds.splice(0).reverse()) {
    await query("DELETE FROM jobs WHERE id=$1", [id]).catch(() => {});
  }
  for (const id of trackedOperationIds.splice(0).reverse()) {
    await query("DELETE FROM operations WHERE id=$1", [id]).catch(() => {});
  }
  for (const id of trackedPartIds.splice(0).reverse()) {
    await query("DELETE FROM parts WHERE id=$1", [id]).catch(() => {});
  }
  for (const id of trackedToolIds.splice(0).reverse()) {
    await query("DELETE FROM tools WHERE id=$1", [id]).catch(() => {});
  }
  await cleanupTestUsers(trackedUserIds);
});

describe("Calibration lab routes (BL-115)", () => {
  it("creates schedules, records events with certificate metadata, and summarizes overdue tools", async () => {
    const quality = await createTestSession("Quality");
    trackedUserIds.push(quality.userId);

    const toolId = await createTool();

    const scheduleRes = await request(app)
      .post("/api/calibration/schedules")
      .set("Cookie", quality.cookie)
      .send({
        toolId,
        intervalDays: 30,
        lastCalibratedAt: "2026-03-01T12:00:00.000Z",
        active: true
      });

    expect(scheduleRes.status).toBe(201);
    expect(scheduleRes.body).toMatchObject({
      tool_id: toolId,
      interval_days: 30,
      active: true
    });
    trackedScheduleIds.push(Number(scheduleRes.body.id));

    const eventRes = await request(app)
      .post("/api/calibration/events")
      .set("Cookie", quality.cookie)
      .send({
        toolId,
        scheduleId: scheduleRes.body.id,
        performedAt: "2026-03-15T09:00:00.000Z",
        result: "pass",
        certificateName: "NIST-TRACE-2026-001",
        certificateDataBase64: "Y2VydGlmaWNhdGU=",
        notes: "Passed with nominal drift"
      });

    expect(eventRes.status).toBe(201);
    expect(eventRes.body).toMatchObject({
      tool_id: toolId,
      schedule_id: scheduleRes.body.id,
      result: "pass",
      certificate_name: "NIST-TRACE-2026-001",
      certificate_data_base64: "Y2VydGlmaWNhdGU="
    });
    expect(eventRes.body.schedule_next_due_at).toContain("2026-04-14");
    trackedEventIds.push(Number(eventRes.body.id));

    await query(
      "UPDATE calibration_schedules SET next_due_at=$2 WHERE id=$1",
      [scheduleRes.body.id, "2026-03-01T00:00:00.000Z"]
    );

    const overdueRes = await request(app)
      .get("/api/calibration/overdue-summary")
      .set("Cookie", quality.cookie);

    expect(overdueRes.status).toBe(200);
    expect(overdueRes.body.overdue_schedule_count).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(overdueRes.body.overdueSchedules)).toBe(true);
    expect(overdueRes.body.overdueSchedules.some((row) => Number(row.id) === Number(scheduleRes.body.id))).toBe(true);
  });

  it("returns failed-tool recall impacts for failed calibration events", async () => {
    const quality = await createTestSession("Quality");
    const operator = await createTestSession("Operator");
    trackedUserIds.push(quality.userId, operator.userId);

    const toolId = await createTool("Recall Tool");
    const scheduleRes = await request(app)
      .post("/api/calibration/schedules")
      .set("Cookie", quality.cookie)
      .send({
        toolId,
        intervalDays: 60,
        lastCalibratedAt: "2026-03-10T08:00:00.000Z",
        active: true
      });
    expect(scheduleRes.status).toBe(201);
    trackedScheduleIds.push(Number(scheduleRes.body.id));

    const eventRes = await request(app)
      .post("/api/calibration/events")
      .set("Cookie", quality.cookie)
      .send({
        toolId,
        scheduleId: scheduleRes.body.id,
        performedAt: "2026-03-20T09:30:00.000Z",
        result: "fail",
        certificateName: "FAILED-CERT-9",
        certificateDataBase64: "ZmFpbGVkLWNlcnQ=",
        notes: "Calibration did not meet tolerance"
      });
    expect(eventRes.status).toBe(201);
    trackedEventIds.push(Number(eventRes.body.id));

    const { recordId } = await createRecallFixture(operator.userId);
    const impactRows = await query(
      `INSERT INTO calibration_recall_impacts
         (calibration_event_id, record_id, tool_id, status, notes)
       VALUES ($1, $2, $3, 'open', $4)
       RETURNING id`,
      [eventRes.body.id, recordId, toolId, "Potentially affected shipment"]
    );
    trackedImpactIds.push(Number(impactRows.rows[0].id));

    const impactsRes = await request(app)
      .get(`/api/calibration/failed-tool-recall-impact?toolId=${toolId}`)
      .set("Cookie", quality.cookie);

    expect(impactsRes.status).toBe(200);
    expect(Array.isArray(impactsRes.body)).toBe(true);
    expect(impactsRes.body.length).toBe(1);
    expect(impactsRes.body[0]).toMatchObject({
      calibration_event_id: Number(eventRes.body.id),
      record_id: recordId,
      tool_id: toolId,
      result: "fail",
      certificate_name: "FAILED-CERT-9"
    });
  });

  it("requires a calibration role for the lab endpoints", async () => {
    const operator = await createTestSession("Operator");
    trackedUserIds.push(operator.userId);

    const deniedSchedule = await request(app)
      .post("/api/calibration/schedules")
      .set("Cookie", operator.cookie)
      .send({
        toolId: 1,
        intervalDays: 30
      });
    expect(deniedSchedule.status).toBe(403);

    const deniedSummary = await request(app)
      .get("/api/calibration/overdue-summary")
      .set("Cookie", operator.cookie);
    expect(deniedSummary.status).toBe(403);

    const deniedImpact = await request(app)
      .get("/api/calibration/failed-tool-recall-impact")
      .set("Cookie", operator.cookie);
    expect(deniedImpact.status).toBe(403);
  });
});
