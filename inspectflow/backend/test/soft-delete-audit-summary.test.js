import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";
import { createIsolatedTestUser, cleanupTestUsers, createTestSession } from "./helpers/sessionFixtures.js";

const trackedUserIds = [];
const trackedToolIds = [];
const trackedJobIds = [];
const trackedRecordIds = [];

function trackUser(user) {
  trackedUserIds.push(Number(user.userId ?? user.id));
  return user;
}

async function cleanupTrackedRows() {
  if (trackedUserIds.length > 0) {
    await query("DELETE FROM auth_event_log WHERE user_id = ANY($1::int[])", [trackedUserIds]);
  }

  for (const recordId of trackedRecordIds) {
    await query("DELETE FROM audit_log WHERE record_id=$1", [recordId]);
    await query("DELETE FROM records WHERE id=$1", [recordId]);
  }
  for (const jobId of trackedJobIds) {
    await query("DELETE FROM jobs WHERE id=$1", [jobId]);
  }
  for (const toolId of trackedToolIds) {
    await query("DELETE FROM tools WHERE id=$1", [toolId]);
  }

  await cleanupTestUsers(trackedUserIds);
  trackedToolIds.length = 0;
  trackedJobIds.length = 0;
  trackedRecordIds.length = 0;
}

afterEach(async () => {
  await cleanupTrackedRows();
});

function uniqueToken(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("soft-delete semantics and audit summary gating", () => {
  it("supports POST /deactivate for tools as the canonical soft-delete shape", async () => {
    const admin = trackUser(await createTestSession("Admin"));
    const createdTool = await query(
      `INSERT INTO tools (name, type, it_num, size, active, visible)
       VALUES ($1,$2,$3,$4,true,true)
       RETURNING id`,
      [uniqueToken("Gauge"), "Variable", uniqueToken("IT"), "1 in"]
    );
    const toolId = Number(createdTool.rows[0].id);
    trackedToolIds.push(toolId);

    const response = await request(app)
      .post(`/api/tools/${toolId}/deactivate`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, deactivated: true });

    const dbTool = await query("SELECT active, visible FROM tools WHERE id=$1", [toolId]);
    expect(dbTool.rows[0]).toMatchObject({ active: false, visible: false });
  });

  it("supports POST /deactivate for records and preserves the audit trail", async () => {
    const admin = trackUser(await createTestSession("Admin"));
    const operator = trackUser(await createIsolatedTestUser("Operator"));
    const opRes = await query(
      "SELECT id FROM operations WHERE part_id=$1 AND op_number=$2 LIMIT 1",
      ["1234", "20"]
    );
    const operationId = Number(opRes.rows[0]?.id);
    expect(operationId).toBeTruthy();

    const jobId = uniqueToken("JOB");
    trackedJobIds.push(jobId);
    await query(
      `INSERT INTO jobs (id, part_id, part_revision_code, operation_id, lot, qty, status)
       VALUES ($1,$2,'A',$3,$4,$5,'open')`,
      [jobId, "1234", operationId, uniqueToken("Lot"), 3]
    );

    const recordRes = await query(
      `INSERT INTO records
         (job_id, part_id, operation_id, lot, serial_number, qty, timestamp, operator_user_id, status, oot, comment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        jobId,
        "1234",
        operationId,
        uniqueToken("Lot"),
        uniqueToken("SN"),
        3,
        "2026-03-28T14:00:00.000Z",
        operator.id,
        "complete",
        false,
        "Soft delete target"
      ]
    );
    const recordId = Number(recordRes.rows[0].id);
    trackedRecordIds.push(recordId);

    const response = await request(app)
      .post(`/api/records/${recordId}/deactivate`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.deletedAt).toBeTruthy();

    const dbRecord = await query("SELECT deleted_at FROM records WHERE id=$1", [recordId]);
    expect(dbRecord.rows[0]?.deleted_at).toBeTruthy();

    const auditRows = await query(
      `SELECT field, reason, after_value
       FROM audit_log
       WHERE record_id=$1
       ORDER BY id DESC
       LIMIT 1`,
      [recordId]
    );
    expect(auditRows.rows).toHaveLength(1);
    expect(auditRows.rows[0]).toMatchObject({
      field: "deleted_at"
    });
    expect(String(auditRows.rows[0].reason || "")).toMatch(/^soft_delete:/);
    expect(auditRows.rows[0].after_value).toBeTruthy();
  });

  it("gates audit summary behind Admin or the view_audit_summary capability", async () => {
    const admin = trackUser(await createTestSession("Admin"));
    const operator = trackUser(await createTestSession("Operator"));

    const operatorDenied = await request(app)
      .get("/api/audit/summary")
      .set("Cookie", operator.cookie);
    expect(operatorDenied.status).toBe(403);
    expect(operatorDenied.body).toMatchObject({ error: "forbidden" });

    await query("DELETE FROM role_capabilities WHERE role='Quality' AND capability='view_admin'", []);
    await query(
      `INSERT INTO role_capabilities (role, capability)
       VALUES ('Quality', 'view_audit_summary')
       ON CONFLICT DO NOTHING`,
      []
    );

    try {
      const quality = trackUser(await createTestSession("Quality"));
      const qualitySummary = await request(app)
        .get("/api/audit/summary")
        .set("Cookie", quality.cookie);
      expect(qualitySummary.status).toBe(200);
      expect(qualitySummary.body).toMatchObject({
        total: expect.any(Number)
      });
      expect(Array.isArray(qualitySummary.body.byField)).toBe(true);

      const adminSummary = await request(app)
        .get("/api/audit/summary")
        .set("Cookie", admin.cookie);
      expect(adminSummary.status).toBe(200);
      expect(Array.isArray(adminSummary.body.byUser)).toBe(true);
    } finally {
      await query("DELETE FROM role_capabilities WHERE role='Quality' AND capability='view_audit_summary'", []);
      await query(
        `INSERT INTO role_capabilities (role, capability)
         VALUES ('Quality', 'view_admin')
         ON CONFLICT DO NOTHING`,
        []
      );
    }
  });
});
