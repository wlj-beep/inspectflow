import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

function nextJobId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

async function getOperationId(partId, opNumber) {
  const { rows } = await query(
    "SELECT id FROM operations WHERE part_id=$1 AND op_number=$2 LIMIT 1",
    [partId, opNumber]
  );
  return rows[0]?.id;
}

async function createJob({ id, partId, operationId, lot = "Lot T", qty = 5, status = "open", role = "Supervisor" }) {
  return request(app)
    .post("/api/jobs")
    .set("x-user-role", role)
    .send({ id, partId, operationId, lot, qty, status });
}

async function getFirstDimensionId(operationId) {
  const { rows } = await query(
    "SELECT id FROM dimensions WHERE operation_id=$1 ORDER BY id ASC LIMIT 1",
    [operationId]
  );
  return rows[0]?.id;
}

async function getDimensionIdByName(operationId, name) {
  const { rows } = await query(
    "SELECT id FROM dimensions WHERE operation_id=$1 AND name=$2 LIMIT 1",
    [operationId, name]
  );
  return rows[0]?.id;
}

async function getToolIdByName(name) {
  const { rows } = await query(
    "SELECT id FROM tools WHERE name=$1 LIMIT 1",
    [name]
  );
  return rows[0]?.id;
}

async function getUserIdByName(name) {
  const { rows } = await query(
    "SELECT id FROM users WHERE name=$1 LIMIT 1",
    [name]
  );
  return rows[0]?.id;
}

describe("Backlog validation hardening", () => {
  it("requires role header for user list", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "missing_role" });
  });

  it("denies Operator access to admin CRUD endpoints", async () => {
    const op20 = await getOperationId("1234", "20");
    expect(op20).toBeTruthy();

    const cases = [
      request(app).post("/api/parts").set("x-user-role", "Operator").send({ id: "P-LOCK-1", description: "Blocked" }),
      request(app).post("/api/operations").set("x-user-role", "Operator").send({ partId: "1234", opNumber: "99", label: "Blocked" }),
      request(app).post("/api/dimensions").set("x-user-role", "Operator").send({
        operationId: op20,
        name: `Blocked Dim ${crypto.randomUUID().slice(0, 6)}`,
        nominal: 1,
        tolPlus: 0.01,
        tolMinus: 0.01,
        unit: "in",
        sampling: "100pct"
      }),
      request(app).post("/api/tools").set("x-user-role", "Operator").send({
        name: `Blocked Tool ${crypto.randomUUID().slice(0, 6)}`,
        type: "Variable",
        itNum: `IT-B-${crypto.randomUUID().slice(0, 4)}`
      }),
      request(app).post("/api/users").set("x-user-role", "Operator").send({
        name: `Blocked User ${crypto.randomUUID().slice(0, 6)}`,
        role: "Operator"
      }),
      request(app).post("/api/jobs").set("x-user-role", "Operator").send({
        id: nextJobId("J-BLOCK"),
        partId: "1234",
        operationId: op20,
        lot: "Lot B",
        qty: 2,
        status: "open"
      }),
      request(app).put("/api/roles/Operator").set("x-user-role", "Operator").send({
        capabilities: ["view_operator", "submit_records"]
      }),
      request(app).put("/api/records/1/value").set("x-user-role", "Operator").send({
        userId: 1,
        dimensionId: 1,
        pieceNumber: 1,
        value: "1.0000",
        isOot: false,
        reason: "blocked"
      })
    ];

    for (const reqPromise of cases) {
      const res = await reqPromise;
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: "forbidden" });
    }
  });

  it("enforces lock ownership and allows manage_jobs override unlock", async () => {
    const op20 = await getOperationId("1234", "20");
    expect(op20).toBeTruthy();

    const jobId = nextJobId("J-LOCK");
    const created = await createJob({ id: jobId, partId: "1234", operationId: op20 });
    expect(created.status).toBe(201);

    const lockAsOwner = await request(app)
      .post(`/api/jobs/${jobId}/lock`)
      .set("x-user-role", "Operator")
      .send({ userId: 1 });
    expect(lockAsOwner.status).toBe(200);
    expect(lockAsOwner.body).toMatchObject({ ok: true });

    const unlockByOtherOperator = await request(app)
      .post(`/api/jobs/${jobId}/unlock`)
      .set("x-user-role", "Operator")
      .send({ userId: 2 });
    expect(unlockByOtherOperator.status).toBe(409);
    expect(unlockByOtherOperator.body).toMatchObject({ error: "lock_mismatch" });

    const unlockBySupervisor = await request(app)
      .post(`/api/jobs/${jobId}/unlock`)
      .set("x-user-role", "Supervisor")
      .send({});
    expect(unlockBySupervisor.status).toBe(200);
    expect(unlockBySupervisor.body).toMatchObject({ ok: true, forced: true });

    const relockAsOtherOperator = await request(app)
      .post(`/api/jobs/${jobId}/lock`)
      .set("x-user-role", "Operator")
      .send({ userId: 2 });
    expect(relockAsOtherOperator.status).toBe(200);

    const cleanupUnlock = await request(app)
      .post(`/api/jobs/${jobId}/unlock`)
      .set("x-user-role", "Supervisor")
      .send({});
    expect(cleanupUnlock.status).toBe(200);

    const removed = await request(app)
      .delete(`/api/jobs/${jobId}`)
      .set("x-user-role", "Supervisor");
    expect(removed.status).toBe(200);
  });

  it("rejects invalid record dimension/tool references", async () => {
    const op20 = await getOperationId("1234", "20");
    expect(op20).toBeTruthy();

    const { rows: dimRows } = await query(
      "SELECT id FROM dimensions WHERE operation_id=$1 ORDER BY id ASC LIMIT 1",
      [op20]
    );
    const dimId = dimRows[0]?.id;
    expect(dimId).toBeTruthy();

    const { rows: disallowedToolRows } = await query(
      `SELECT t.id
       FROM tools t
       WHERE NOT EXISTS (
         SELECT 1
         FROM dimension_tools dt
         WHERE dt.dimension_id=$1 AND dt.tool_id=t.id
       )
       ORDER BY t.id ASC
       LIMIT 1`,
      [dimId]
    );
    const disallowedToolId = disallowedToolRows[0]?.id;
    expect(disallowedToolId).toBeTruthy();

    const jobId = nextJobId("J-REF");
    const created = await createJob({ id: jobId, partId: "1234", operationId: op20 });
    expect(created.status).toBe(201);

    const basePayload = {
      jobId,
      partId: "1234",
      operationId: op20,
      lot: "Lot T",
      qty: 3,
      operatorUserId: 1,
      status: "incomplete",
      oot: false,
      comment: "",
      missingPieces: []
    };

    const invalidDimension = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        ...basePayload,
        values: [{ dimensionId: 999999, pieceNumber: 1, value: "0.6250", isOot: false }],
        tools: []
      });
    expect(invalidDimension.status).toBe(400);
    expect(invalidDimension.body).toMatchObject({ error: "invalid_dimension_for_operation" });

    const invalidTool = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        ...basePayload,
        values: [],
        tools: [{ dimensionId: dimId, toolId: 999999, itNum: "IT-MISSING" }]
      });
    expect(invalidTool.status).toBe(400);
    expect(invalidTool.body).toMatchObject({ error: "invalid_tool_id" });

    const disallowedTool = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        ...basePayload,
        values: [],
        tools: [{ dimensionId: dimId, toolId: disallowedToolId, itNum: "IT-BADMAP" }]
      });
    expect(disallowedTool.status).toBe(400);
    expect(disallowedTool.body).toMatchObject({ error: "tool_not_allowed_for_dimension" });

    const removed = await request(app)
      .delete(`/api/jobs/${jobId}`)
      .set("x-user-role", "Supervisor");
    expect(removed.status).toBe(200);
  });

  it("allows Supervisor manage_jobs create/update/delete flow", async () => {
    const op30 = await getOperationId("1234", "30");
    expect(op30).toBeTruthy();

    const jobId = nextJobId("J-SUP");
    const created = await createJob({
      id: jobId,
      partId: "1234",
      operationId: op30,
      lot: "Lot SUP",
      qty: 6,
      status: "open",
      role: "Supervisor"
    });
    expect(created.status).toBe(201);

    const updated = await request(app)
      .put(`/api/jobs/${jobId}`)
      .set("x-user-role", "Supervisor")
      .send({
        partId: "1234",
        operationId: op30,
        lot: "Lot SUP-2",
        qty: 7,
        status: "draft"
      });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ id: jobId, lot: "Lot SUP-2", qty: 7, status: "draft" });

    const removed = await request(app)
      .delete(`/api/jobs/${jobId}`)
      .set("x-user-role", "Supervisor");
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({ ok: true });
  });

  it("validates missing piece reasons and allows 'Unable to Measure'", async () => {
    const op20 = await getOperationId("1234", "20");
    expect(op20).toBeTruthy();

    const jobId = nextJobId("J-MISS");
    const created = await createJob({ id: jobId, partId: "1234", operationId: op20, qty: 3 });
    expect(created.status).toBe(201);

    const basePayload = {
      jobId,
      partId: "1234",
      operationId: op20,
      lot: "Lot M",
      qty: 3,
      operatorUserId: 1,
      status: "incomplete",
      oot: false,
      comment: "",
      values: [],
      tools: []
    };

    const scrappedNoNc = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        ...basePayload,
        missingPieces: [{ pieceNumber: 1, reason: "Scrapped" }]
      });
    expect(scrappedNoNc.status).toBe(400);
    expect(scrappedNoNc.body).toMatchObject({ error: "scrapped_requires_nc" });

    const otherNoDetails = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        ...basePayload,
        missingPieces: [{ pieceNumber: 1, reason: "Other" }]
      });
    expect(otherNoDetails.status).toBe(400);
    expect(otherNoDetails.body).toMatchObject({ error: "other_requires_details" });

    const unableToMeasure = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        ...basePayload,
        missingPieces: [{ pieceNumber: 1, reason: "Unable to Measure" }]
      });
    expect(unableToMeasure.status).toBe(201);
    expect(unableToMeasure.body).toMatchObject({ job_id: jobId, status: "incomplete" });
  });

  it("records supervisor edits in audit log and exports edited CSV values", async () => {
    const op20 = await getOperationId("1234", "20");
    expect(op20).toBeTruthy();
    const dimId = await getFirstDimensionId(op20);
    expect(dimId).toBeTruthy();

    const jobId = nextJobId("J-AUD");
    const createdJob = await createJob({ id: jobId, partId: "1234", operationId: op20, qty: 3 });
    expect(createdJob.status).toBe(201);

    const submit = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        jobId,
        partId: "1234",
        operationId: op20,
        lot: "Lot A",
        qty: 3,
        operatorUserId: 1,
        status: "incomplete",
        oot: false,
        comment: "",
        values: [{ dimensionId: dimId, pieceNumber: 1, value: "0.6250", isOot: false }],
        tools: [],
        missingPieces: []
      });
    expect(submit.status).toBe(201);
    const recordId = submit.body.id;
    expect(recordId).toBeTruthy();

    const edit = await request(app)
      .put(`/api/records/${recordId}/value`)
      .set("x-user-role", "Supervisor")
      .send({
        userId: 4,
        dimensionId: dimId,
        pieceNumber: 1,
        value: "0.7000",
        isOot: true,
        reason: "verification adjustment"
      });
    expect(edit.status).toBe(200);
    expect(edit.body).toMatchObject({ ok: true });

    const audit = await request(app)
      .get(`/api/audit?recordId=${recordId}`)
      .set("x-user-role", "Supervisor");
    expect(audit.status).toBe(200);
    expect(Array.isArray(audit.body)).toBe(true);
    expect(audit.body.length).toBeGreaterThan(0);
    expect(audit.body[0]).toMatchObject({
      record_id: recordId,
      user_id: 4,
      before_value: "0.6250",
      after_value: "0.7000",
      reason: "verification adjustment"
    });

    const detail = await request(app)
      .get(`/api/records/${recordId}`)
      .set("x-user-role", "Supervisor");
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ id: recordId, oot: true });

    const csv = await request(app)
      .get(`/api/records/${recordId}/export`)
      .set("x-user-role", "Supervisor");
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text).toContain("record_id,dimension_id,dimension_name,piece_number,value,is_oot");
    expect(csv.text).toContain(`"${"0.7000"}"`);
  });

  it("allows Admin to read and persist role capabilities", async () => {
    const readRoles = await request(app)
      .get("/api/roles")
      .set("x-user-role", "Admin");
    expect(readRoles.status).toBe(200);
    const operatorRole = readRoles.body.find((r) => r.role === "Operator");
    expect(operatorRole).toBeTruthy();
    expect(Array.isArray(operatorRole.capabilities)).toBe(true);

    const writeSameCaps = await request(app)
      .put("/api/roles/Operator")
      .set("x-user-role", "Admin")
      .send({ capabilities: operatorRole.capabilities });
    expect(writeSameCaps.status).toBe(200);
    expect(writeSameCaps.body).toMatchObject({ role: "Operator" });
    expect(writeSameCaps.body.capabilities).toEqual(operatorRole.capabilities);
  });

  it("enforces pass/fail-only corrections for Go/No-Go measured dimensions", async () => {
    const op20 = await getOperationId("1234", "20");
    expect(op20).toBeTruthy();
    const dimId = await getDimensionIdByName(op20, "Bore Diameter");
    expect(dimId).toBeTruthy();
    const plugGaugeId = await getToolIdByName("Plug Gauge");
    expect(plugGaugeId).toBeTruthy();

    const jobId = nextJobId("J-GNG");
    const createdJob = await createJob({ id: jobId, partId: "1234", operationId: op20, qty: 2 });
    expect(createdJob.status).toBe(201);

    const submit = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        jobId,
        partId: "1234",
        operationId: op20,
        lot: "Lot G",
        qty: 2,
        operatorUserId: 1,
        status: "incomplete",
        oot: false,
        comment: "",
        values: [{ dimensionId: dimId, pieceNumber: 1, value: "PASS", isOot: false }],
        tools: [{ dimensionId: dimId, toolId: plugGaugeId, itNum: "IT-0074" }],
        missingPieces: []
      });
    expect(submit.status).toBe(201);
    const recordId = submit.body.id;

    const invalidEdit = await request(app)
      .put(`/api/records/${recordId}/value`)
      .set("x-user-role", "Supervisor")
      .send({
        userId: 4,
        dimensionId: dimId,
        pieceNumber: 1,
        value: "0.6200",
        reason: "should be blocked"
      });
    expect(invalidEdit.status).toBe(400);
    expect(invalidEdit.body).toMatchObject({ error: "invalid_value_for_mode" });

    const validEdit = await request(app)
      .put(`/api/records/${recordId}/value`)
      .set("x-user-role", "Supervisor")
      .send({
        userId: 4,
        dimensionId: dimId,
        pieceNumber: 1,
        value: "FAIL",
        reason: "verified with go/no-go"
      });
    expect(validEdit.status).toBe(200);
  });

  it("supports operator issue reporting and admin completion workflow", async () => {
    const operatorId = await getUserIdByName("J. Morris");
    const adminId = await getUserIdByName("S. Admin");
    expect(operatorId).toBeTruthy();
    expect(adminId).toBeTruthy();

    const created = await request(app)
      .post("/api/issues")
      .set("x-user-role", "Operator")
      .send({
        category: "app_functionality_issue",
        details: "UI became unresponsive when switching tabs.",
        userId: operatorId,
        partId: "1234",
        operationId: await getOperationId("1234", "20"),
        jobId: "J-10042"
      });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: "open", category: "app_functionality_issue" });
    const issueId = created.body.id;

    const listed = await request(app)
      .get("/api/issues")
      .set("x-user-role", "Admin");
    expect(listed.status).toBe(200);
    expect(Array.isArray(listed.body)).toBe(true);
    expect(listed.body.some((i) => i.id === issueId)).toBe(true);

    const completed = await request(app)
      .put(`/api/issues/${issueId}/complete`)
      .set("x-user-role", "Admin")
      .send({
        userId: adminId,
        resolutionNote: "Reviewed and actioned."
      });
    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({ id: issueId, status: "completed" });
  });
});
