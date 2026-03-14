import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

function nextJobId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function nextPartId(prefix = "P-REV") {
  return `${prefix}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

async function getOperationId(partId, opNumber) {
  const { rows } = await query(
    "SELECT id FROM operations WHERE part_id=$1 AND op_number=$2 LIMIT 1",
    [partId, opNumber]
  );
  return rows[0]?.id;
}

async function createJob({ id, partId, partRevision = "A", operationId, lot = "Lot T", qty = 5, status = "open", role = "Supervisor" }) {
  return request(app)
    .post("/api/jobs")
    .set("x-user-role", role)
    .send({ id, partId, partRevision, operationId, lot, qty, status });
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
  it("requires authentication for user list", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
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
        partRevision: "A",
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

  it("supports first/middle/last and custom-interval sampling definitions", async () => {
    const op20 = await getOperationId("1234", "20");
    expect(op20).toBeTruthy();
    const name = `Sampling Dim ${crypto.randomUUID().slice(0, 6)}`;

    const created = await request(app)
      .post("/api/dimensions")
      .set("x-user-role", "Admin")
      .send({
        operationId: op20,
        name,
        nominal: 1.0,
        tolPlus: 0.01,
        tolMinus: 0.01,
        unit: "in",
        sampling: "first_middle_last",
        inputMode: "single",
        toolIds: []
      });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ sampling: "first_middle_last" });

    const invalidCustom = await request(app)
      .put(`/api/dimensions/${created.body.id}`)
      .set("x-user-role", "Admin")
      .send({
        name,
        nominal: 1.0,
        tolPlus: 0.01,
        tolMinus: 0.01,
        unit: "in",
        sampling: "custom_interval",
        inputMode: "single",
        toolIds: []
      });
    expect(invalidCustom.status).toBe(400);
    expect(invalidCustom.body).toMatchObject({ error: "invalid_sampling_interval" });

    const validCustom = await request(app)
      .put(`/api/dimensions/${created.body.id}`)
      .set("x-user-role", "Admin")
      .send({
        name,
        nominal: 1.0,
        tolPlus: 0.01,
        tolMinus: 0.01,
        unit: "in",
        sampling: "custom_interval",
        samplingInterval: 3,
        inputMode: "single",
        toolIds: []
      });
    expect(validCustom.status).toBe(200);
    expect(validCustom.body).toMatchObject({ sampling: "custom_interval", sampling_interval: 3 });
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

  it("creates setup revisions on setup-critical changes and exposes historical lookup", async () => {
    const partId = nextPartId();

    const createdPart = await request(app)
      .post("/api/parts")
      .set("x-user-role", "Admin")
      .send({ id: partId, description: "Revision Test Part", revision: "A" });
    expect(createdPart.status).toBe(201);

    const createdOp = await request(app)
      .post("/api/operations")
      .set("x-user-role", "Admin")
      .send({ partId, opNumber: "010", label: "Revision Op" });
    expect(createdOp.status).toBe(201);
    const operationId = createdOp.body.id;

    const createdDim = await request(app)
      .post("/api/dimensions")
      .set("x-user-role", "Admin")
      .send({
        operationId,
        name: "Revision Diameter",
        nominal: 1.0,
        tolPlus: 0.01,
        tolMinus: 0.01,
        unit: "in",
        sampling: "100pct",
        inputMode: "single",
        toolIds: []
      });
    expect(createdDim.status).toBe(201);

    const beforeUpdate = await request(app)
      .get(`/api/parts/${encodeURIComponent(partId)}`)
      .set("x-user-role", "Admin");
    expect(beforeUpdate.status).toBe(200);
    const beforeRevision = beforeUpdate.body.currentRevision;
    expect(beforeRevision).toBeTruthy();

    const targetOp = beforeUpdate.body.operations.find((op) => String(op.opNumber) === "010");
    expect(targetOp).toBeTruthy();
    const targetDim = targetOp.dimensions.find((d) => d.name === "Revision Diameter");
    expect(targetDim).toBeTruthy();
    const originalTolPlus = Number(targetDim.tolPlus ?? targetDim.tol_plus);

    const updatedDim = await request(app)
      .put(`/api/dimensions/${targetDim.id}`)
      .set("x-user-role", "Admin")
      .send({
        name: targetDim.name,
        nominal: Number(targetDim.nominal),
        tolPlus: originalTolPlus + 0.002,
        tolMinus: Number(targetDim.tolMinus ?? targetDim.tol_minus),
        unit: targetDim.unit,
        sampling: targetDim.sampling,
        samplingInterval: targetDim.samplingInterval ?? targetDim.sampling_interval ?? null,
        inputMode: targetDim.inputMode ?? targetDim.input_mode ?? "single",
        toolIds: targetDim.toolIds || []
      });
    expect(updatedDim.status).toBe(200);

    const afterUpdate = await request(app)
      .get(`/api/parts/${encodeURIComponent(partId)}`)
      .set("x-user-role", "Admin");
    expect(afterUpdate.status).toBe(200);
    expect(afterUpdate.body.currentRevision).toBeTruthy();
    expect(afterUpdate.body.currentRevision).not.toBe(beforeRevision);
    expect(Array.isArray(afterUpdate.body.revisions)).toBe(true);
    expect(afterUpdate.body.revisions.length).toBeGreaterThanOrEqual(2);

    const historical = await request(app)
      .get(`/api/parts/${encodeURIComponent(partId)}?revision=${beforeRevision}`)
      .set("x-user-role", "Admin");
    expect(historical.status).toBe(200);
    expect(historical.body).toMatchObject({ selectedRevision: beforeRevision, readOnlyRevision: true });
    const historicalOp = historical.body.operations.find((op) => String(op.opNumber) === "010");
    expect(historicalOp).toBeTruthy();
    const historicalDim = historicalOp.dimensions.find((d) => d.name === "Revision Diameter");
    expect(historicalDim).toBeTruthy();
    expect(Number(historicalDim.tolPlus ?? historicalDim.tol_plus)).toBeCloseTo(originalTolPlus, 6);
  });

  it("requires explicit revision input for part and job creation", async () => {
    const missingPartRevision = await request(app)
      .post("/api/parts")
      .set("x-user-role", "Admin")
      .send({ id: nextPartId("P-NOREV"), description: "No Revision Part" });
    expect(missingPartRevision.status).toBe(400);
    expect(missingPartRevision.body).toMatchObject({ error: "revision_required" });

    const op20 = await getOperationId("1234", "20");
    expect(op20).toBeTruthy();
    const invalidJobRevision = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: nextJobId("J-REV"),
        partId: "1234",
        partRevision: "ZZZZ",
        operationId: op20,
        lot: "Lot Rev",
        qty: 3,
        status: "open"
      });
    expect(invalidJobRevision.status).toBe(400);
    expect(invalidJobRevision.body).toMatchObject({ error: "part_revision_not_found" });
  });

  it("supports bulk part-name updates for filtered mass-management workflows", async () => {
    const partId = nextPartId("P-BULK");
    const createdPart = await request(app)
      .post("/api/parts")
      .set("x-user-role", "Admin")
      .send({ id: partId, description: "Bulk Old Name", revision: "A" });
    expect(createdPart.status).toBe(201);

    const bulkUpdate = await request(app)
      .post("/api/parts/bulk-update")
      .set("x-user-role", "Admin")
      .send({
        updates: [{ id: partId, description: "Bulk New Name" }]
      });
    expect(bulkUpdate.status).toBe(200);
    expect(bulkUpdate.body).toMatchObject({ ok: true, updated: 1 });

    const partAfter = await request(app)
      .get(`/api/parts/${encodeURIComponent(partId)}`)
      .set("x-user-role", "Admin");
    expect(partAfter.status).toBe(200);
    expect(partAfter.body).toMatchObject({ description: "Bulk New Name" });
    expect(Array.isArray(partAfter.body.revisions)).toBe(true);
    expect(partAfter.body.revisions.length).toBeGreaterThanOrEqual(2);
  });

  it("tracks tool calibration and location with admin-managed location master data", async () => {
    const suffix = crypto.randomUUID().slice(0, 6);
    const homeName = `Home ${suffix}`;
    const currentName = `Current ${suffix}`;

    const createdHome = await request(app)
      .post("/api/tool-locations")
      .set("x-user-role", "Admin")
      .send({ name: homeName, locationType: "machine" });
    expect(createdHome.status).toBe(201);

    const createdCurrent = await request(app)
      .post("/api/tool-locations")
      .set("x-user-role", "Admin")
      .send({ name: currentName, locationType: "out_for_calibration" });
    expect(createdCurrent.status).toBe(201);

    const toolId = await getToolIdByName("Outside Micrometer");
    expect(toolId).toBeTruthy();

    const updatedTool = await request(app)
      .put(`/api/tools/${toolId}`)
      .set("x-user-role", "Admin")
      .send({
        calibrationDueDate: "2026-12-31",
        currentLocationId: createdCurrent.body.id,
        homeLocationId: createdHome.body.id
      });
    expect(updatedTool.status).toBe(200);
    expect(updatedTool.body.id).toBe(toolId);
    expect(String(updatedTool.body.calibration_due_date || "")).toContain("2026-12-31");
    expect(updatedTool.body.current_location_id).toBe(createdCurrent.body.id);
    expect(updatedTool.body.home_location_id).toBe(createdHome.body.id);

    const blockedDelete = await request(app)
      .delete(`/api/tool-locations/${createdCurrent.body.id}`)
      .set("x-user-role", "Admin");
    expect(blockedDelete.status).toBe(409);
    expect(blockedDelete.body).toMatchObject({ error: "location_in_use" });

    const clearedTool = await request(app)
      .put(`/api/tools/${toolId}`)
      .set("x-user-role", "Admin")
      .send({
        currentLocationId: null,
        homeLocationId: null
      });
    expect(clearedTool.status).toBe(200);

    const deletedCurrent = await request(app)
      .delete(`/api/tool-locations/${createdCurrent.body.id}`)
      .set("x-user-role", "Admin");
    expect(deletedCurrent.status).toBe(200);
    expect(deletedCurrent.body).toMatchObject({ ok: true });
  });

  it("imports tools from CSV payload", async () => {
    const suffix = crypto.randomUUID().slice(0, 6);
    const toolName = `Import Tool ${suffix}`;
    const csv = [
      "name,type,it_num,size,active,visible",
      `${toolName},Variable,IT-IMP-${suffix},0-4 in,true,true`
    ].join("\n");

    const res = await request(app)
      .post("/api/imports/tools/csv")
      .set("x-user-role", "Admin")
      .send({ csvText: csv });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, inserted: 1 });

    const check = await query("SELECT id FROM tools WHERE name=$1", [toolName]);
    expect(check.rows[0]).toBeTruthy();
  });

  it("imports part dimensions from CSV payload with custom interval sampling", async () => {
    const partId = `IMP-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const csv = [
      "part_id,part_name,op_number,op_label,dimension_name,nominal,tol_plus,tol_minus,unit,sampling,sampling_interval,input_mode,tool_it_nums",
      `${partId},Imported Part,010,Rough Turn,Imported Diameter,1.0000,0.0050,0.0050,in,custom_interval,3,single,IT-0042`
    ].join("\n");

    const res = await request(app)
      .post("/api/imports/part-dimensions/csv")
      .set("x-user-role", "Admin")
      .send({ csvText: csv });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, totalRows: 1 });

    const opRes = await query(
      "SELECT id FROM operations WHERE part_id=$1 AND op_number='010' LIMIT 1",
      [partId]
    );
    expect(opRes.rows[0]).toBeTruthy();
    const dimRes = await query(
      "SELECT sampling, sampling_interval FROM dimensions WHERE operation_id=$1 AND name='Imported Diameter' LIMIT 1",
      [opRes.rows[0].id]
    );
    expect(dimRes.rows[0]?.sampling).toBe("custom_interval");
    expect(Number(dimRes.rows[0]?.sampling_interval)).toBe(3);
  });

  it("imports jobs from CSV payload with row-level error reporting", async () => {
    const suffix = crypto.randomUUID().slice(0, 5).toUpperCase();
    const validJobId = `J-IMP-${suffix}`;
    const csv = [
      "job_id,part_id,part_revision,op_number,lot,qty,status",
      `${validJobId},1234,A,020,Lot Import,8,open`,
      `J-IMP-BAD-${suffix},1234,A,999,Lot Import,5,open`
    ].join("\n");

    const res = await request(app)
      .post("/api/imports/jobs/csv")
      .set("x-user-role", "Admin")
      .send({ csvText: csv });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ inserted: 1, failed: 1 });
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors[0]?.error).toContain("operation_not_found");

    const check = await query("SELECT id FROM jobs WHERE id=$1", [validJobId]);
    expect(check.rows[0]).toBeTruthy();
  });

  it("ingests measurement CSV and tracks unresolved rows for manual resolution", async () => {
    const op20 = await getOperationId("1234", "20");
    expect(op20).toBeTruthy();
    const jobId = nextJobId("J-MEAS");
    const created = await createJob({ id: jobId, partId: "1234", operationId: op20, qty: 3, role: "Supervisor" });
    expect(created.status).toBe(201);

    const csv = [
      "record_key,job_id,operation_ref,piece_number,dimension_name,value,operator_user_id,status,comment",
      `batch-a,${jobId},020,1,Bore Diameter,0.6250,1,complete,bulk import`,
      `batch-a,${jobId},020,1,Unknown Feature,0.5000,1,complete,bulk import`
    ].join("\n");

    const ingest = await request(app)
      .post("/api/imports/measurements/bulk")
      .set("x-user-role", "Admin")
      .send({ csvText: csv });
    expect(ingest.status).toBe(200);
    expect(ingest.body.inserted).toBe(1);
    expect(Number(ingest.body.unresolvedCount || 0)).toBeGreaterThanOrEqual(1);

    const unresolved = await query(
      "SELECT id FROM import_unresolved_items WHERE status='open' ORDER BY id DESC LIMIT 1"
    );
    expect(unresolved.rows[0]).toBeTruthy();

    const resolve = await request(app)
      .post(`/api/imports/unresolved/${unresolved.rows[0].id}/resolve`)
      .set("x-user-role", "Admin")
      .send({
        assignment: {
          jobId,
          operationRef: "020",
          dimensionName: "Bore Diameter",
          pieceNumber: 2,
          value: "0.6248",
          operatorUserId: 1,
          status: "complete"
        }
      });
    expect(resolve.status).toBe(200);
    expect(resolve.body).toMatchObject({ ok: true });

    const unresolvedCheck = await query(
      "SELECT status FROM import_unresolved_items WHERE id=$1",
      [unresolved.rows[0].id]
    );
    expect(unresolvedCheck.rows[0]?.status).toBe("resolved");
  });

  it("supports operator-facing per-job CSV measurement import", async () => {
    const op30 = await getOperationId("1234", "30");
    expect(op30).toBeTruthy();
    const jobId = nextJobId("J-OPCSV");
    const created = await createJob({ id: jobId, partId: "1234", operationId: op30, qty: 4, role: "Supervisor" });
    expect(created.status).toBe(201);

    const lock = await request(app)
      .post(`/api/jobs/${jobId}/lock`)
      .set("x-user-role", "Operator")
      .send({ userId: 1 });
    expect(lock.status).toBe(200);

    const csv = [
      "piece_number,dimension_name,value,is_oot,tool_it_nums,missing_reason,nc_num,details",
      "1,Thread Pitch Dia,0.5001,false,IT-0082,,,"
    ].join("\n");

    const imported = await request(app)
      .post(`/api/imports/jobs/${jobId}/measurements/csv`)
      .set("x-user-role", "Operator")
      .send({
        csvText: csv,
        operatorUserId: 1
      });
    expect(imported.status).toBe(200);
    expect(imported.body.inserted).toBe(1);
  });

  it("runs configured integrations for jobs imports", async () => {
    const suffix = crypto.randomUUID().slice(0, 5).toUpperCase();
    const jobId = `J-INT-${suffix}`;

    const created = await request(app)
      .post("/api/imports/integrations")
      .set("x-user-role", "Admin")
      .send({
        name: `Jobs Feed ${suffix}`,
        sourceType: "api_pull",
        importType: "jobs",
        endpointUrl: null,
        enabled: true
      });
    expect(created.status).toBe(201);

    const pull = await request(app)
      .post(`/api/imports/integrations/${created.body.id}/pull`)
      .set("x-user-role", "Admin")
      .send({
        csvText: [
          "job_id,part_id,part_revision,op_number,lot,qty,status",
          `${jobId},1234,A,020,Lot Int,6,open`
        ].join("\n")
      });
    expect(pull.status).toBe(200);
    expect(pull.body.inserted).toBe(1);
    expect(pull.body.runId).toBeTruthy();
    expect(pull.body.duplicate).toBe(false);
    expect(Array.isArray(pull.body.runtimeAttempts)).toBe(true);
  });

  it("deduplicates repeated integration pulls via connector runtime idempotency", async () => {
    const suffix = crypto.randomUUID().slice(0, 5).toUpperCase();
    const jobId = `J-IDEM-${suffix}`;

    const created = await request(app)
      .post("/api/imports/integrations")
      .set("x-user-role", "Admin")
      .send({
        name: `Idempotent Feed ${suffix}`,
        sourceType: "api_pull",
        importType: "jobs",
        endpointUrl: null,
        enabled: true
      });
    expect(created.status).toBe(201);

    const payload = {
      csvText: [
        "job_id,part_id,part_revision,op_number,lot,qty,status",
        `${jobId},1234,A,020,Lot Idem,4,open`
      ].join("\n")
    };

    const first = await request(app)
      .post(`/api/imports/integrations/${created.body.id}/pull`)
      .set("x-user-role", "Admin")
      .send(payload);
    expect(first.status).toBe(200);
    expect(first.body.inserted).toBe(1);
    expect(first.body.duplicate).toBe(false);

    const second = await request(app)
      .post(`/api/imports/integrations/${created.body.id}/pull`)
      .set("x-user-role", "Admin")
      .send(payload);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      inserted: 0,
      updated: 0,
      failed: 0,
      duplicate: true,
      runStatus: "success"
    });

    const jobCount = await query(
      "SELECT COUNT(*)::INT AS count FROM jobs WHERE id=$1",
      [jobId]
    );
    expect(jobCount.rows[0]?.count).toBe(1);

    const ledger = await query(
      `SELECT source_type, import_type, hit_count, first_run_id, last_run_id, first_status, last_status
       FROM import_idempotency_ledger
       WHERE idempotency_key=$1`,
      [second.body.idempotencyKey]
    );
    expect(ledger.rows[0]).toMatchObject({
      source_type: "api_pull",
      import_type: "jobs",
      hit_count: 2,
      first_run_id: first.body.runId,
      last_run_id: second.body.runId,
      first_status: "success",
      last_status: "success"
    });

    const externalRef = await query(
      `SELECT import_type, entity_type, external_id, hit_count
       FROM import_external_entity_refs
       WHERE import_type='jobs' AND entity_type='job' AND external_id=$1`,
      [jobId]
    );
    expect(externalRef.rows[0]).toMatchObject({
      import_type: "jobs",
      entity_type: "job",
      external_id: jobId,
      hit_count: 2
    });
  });

  it("persists external-id mappings and idempotency hits for webhook entity imports", async () => {
    const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
    const toolName = `Webhook Tool ${suffix}`;
    const externalId = `TOOL-EXT-${suffix}`;
    const payload = {
      idempotencyToken: `tok_tool_${suffix}`,
      csvText: [
        "name,type,it_num,size,active,visible,external_id",
        `${toolName},Variable,IT-WH-${suffix},0.250,true,true,${externalId}`
      ].join("\n")
    };

    const first = await request(app)
      .post("/api/imports/webhooks/tools")
      .send(payload);
    expect(first.status).toBe(200);
    expect(first.body.inserted).toBe(1);
    expect(first.body.duplicate).toBe(false);

    const second = await request(app)
      .post("/api/imports/webhooks/tools")
      .send(payload);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      inserted: 0,
      updated: 0,
      failed: 0,
      duplicate: true,
      runStatus: "success"
    });

    const refs = await query(
      `SELECT import_type, entity_type, external_id, source_type, hit_count
       FROM import_external_entity_refs
       WHERE import_type='tools' AND entity_type='tool' AND external_id=$1`,
      [externalId]
    );
    expect(refs.rows[0]).toMatchObject({
      import_type: "tools",
      entity_type: "tool",
      external_id: externalId,
      source_type: "webhook",
      hit_count: 2
    });

    const ledger = await query(
      `SELECT source_type, import_type, hit_count
       FROM import_idempotency_ledger
       WHERE idempotency_key=$1`,
      [second.body.idempotencyKey]
    );
    expect(ledger.rows[0]).toMatchObject({
      source_type: "webhook",
      import_type: "tools",
      hit_count: 2
    });
  });

  it("captures replay metadata for terminal integration failures", async () => {
    const suffix = crypto.randomUUID().slice(0, 5).toUpperCase();
    const created = await request(app)
      .post("/api/imports/integrations")
      .set("x-user-role", "Admin")
      .send({
        name: `Replay Feed ${suffix}`,
        sourceType: "api_pull",
        importType: "jobs",
        endpointUrl: null,
        enabled: true
      });
    expect(created.status).toBe(201);

    const failed = await request(app)
      .post(`/api/imports/integrations/${created.body.id}/pull`)
      .set("x-user-role", "Admin")
      .send({ csvText: "job_id,part_id,op_number,lot,qty,status" });
    expect(failed.status).toBe(400);
    expect(failed.body.runStatus).toBe("error");
    expect(failed.body.replayMetadata).toMatchObject({
      schemaVersion: "int-connector-replay-v1",
      sourceType: "api_pull",
      importType: "jobs"
    });

    const runRes = await query(
      "SELECT status, summary FROM import_runs WHERE id=$1",
      [failed.body.runId]
    );
    expect(runRes.rows[0]?.status).toBe("error");
    expect(runRes.rows[0]?.summary?.runtime?.replayMetadata?.schemaVersion).toBe("int-connector-replay-v1");
  });

  it("supports work center master CRUD and operation assignment audit history", async () => {
    const adminId = await getUserIdByName("S. Admin");
    expect(adminId).toBeTruthy();

    const partId = nextPartId("P-WC");
    const createdPart = await request(app)
      .post("/api/parts")
      .set("x-user-role", "Admin")
      .send({ id: partId, description: "Work Center Test Part", revision: "A" });
    expect(createdPart.status).toBe(201);

    const createdOp = await request(app)
      .post("/api/operations")
      .set("x-user-role", "Admin")
      .send({ partId, opNumber: "010", label: "WC Assign Target" });
    expect(createdOp.status).toBe(201);
    const operationId = createdOp.body.id;
    expect(operationId).toBeTruthy();

    const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
    const createdWorkCenter = await request(app)
      .post("/api/operations/work-centers")
      .set("x-user-role", "Admin")
      .send({
        code: `WC-${suffix}`,
        name: `Work Center ${suffix}`,
        description: "Assignment test center",
        userId: adminId,
        reason: "initial setup"
      });
    expect(createdWorkCenter.status).toBe(201);
    const workCenterId = createdWorkCenter.body.id;
    expect(workCenterId).toBeTruthy();

    const assigned = await request(app)
      .put(`/api/operations/${operationId}/work-center`)
      .set("x-user-role", "Admin")
      .send({
        workCenterId,
        userId: adminId,
        reason: "route update"
      });
    expect(assigned.status).toBe(200);
    expect(assigned.body).toMatchObject({
      id: operationId,
      work_center_id: workCenterId,
      auditRecorded: true
    });

    const opHistory = await request(app)
      .get(`/api/operations/${operationId}/work-center-history`)
      .set("x-user-role", "Admin");
    expect(opHistory.status).toBe(200);
    expect(Array.isArray(opHistory.body)).toBe(true);
    expect(opHistory.body.length).toBeGreaterThanOrEqual(1);
    expect(opHistory.body[0]).toMatchObject({
      operation_id: operationId,
      after_work_center_id: workCenterId,
      reason: "route update"
    });

    const wcHistory = await request(app)
      .get(`/api/operations/work-centers/${workCenterId}/history`)
      .set("x-user-role", "Admin");
    expect(wcHistory.status).toBe(200);
    expect(Array.isArray(wcHistory.body)).toBe(true);
    expect(wcHistory.body.some((r) => r.action === "create")).toBe(true);
    expect(wcHistory.body.some((r) => r.action === "assign")).toBe(true);

    const blockedDelete = await request(app)
      .delete(`/api/operations/work-centers/${workCenterId}`)
      .set("x-user-role", "Admin")
      .send({ userId: adminId, reason: "should fail while assigned" });
    expect(blockedDelete.status).toBe(409);
    expect(blockedDelete.body).toMatchObject({ error: "work_center_in_use" });

    const cleared = await request(app)
      .put(`/api/operations/${operationId}/work-center`)
      .set("x-user-role", "Admin")
      .send({
        workCenterId: null,
        userId: adminId,
        reason: "clear assignment"
      });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({
      id: operationId,
      work_center_id: null,
      auditRecorded: true
    });

    const deleted = await request(app)
      .delete(`/api/operations/work-centers/${workCenterId}`)
      .set("x-user-role", "Admin")
      .send({ userId: adminId, reason: "cleanup" });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toMatchObject({ ok: true });
  });

  it("captures per-piece comments across operator/review/export flows", async () => {
    const op20 = await getOperationId("1234", "20");
    expect(op20).toBeTruthy();
    const dimId = await getFirstDimensionId(op20);
    expect(dimId).toBeTruthy();

    const jobId = nextJobId("J-PCOM");
    const createdJob = await createJob({ id: jobId, partId: "1234", operationId: op20, qty: 3, role: "Supervisor" });
    expect(createdJob.status).toBe(201);

    const submitted = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        jobId,
        partId: "1234",
        operationId: op20,
        lot: "Lot PCOM",
        serialNumber: `SN-${crypto.randomUUID().slice(0, 6)}`,
        qty: 3,
        operatorUserId: 1,
        status: "incomplete",
        oot: false,
        comment: "",
        values: [
          { dimensionId: dimId, pieceNumber: 1, value: "0.6250", isOot: false },
          { dimensionId: dimId, pieceNumber: 2, value: "0.6251", isOot: false }
        ],
        tools: [],
        missingPieces: [],
        pieceComments: [
          { pieceNumber: 1, comment: "First-piece setup witness", serialNumber: "SN-PCOM-1" },
          { pieceNumber: 2, comment: "Minor burr removed", serialNumber: "SN-PCOM-2" }
        ]
      });
    expect(submitted.status).toBe(201);
    const recordId = submitted.body.id;
    expect(recordId).toBeTruthy();

    const detailBefore = await request(app)
      .get(`/api/records/${recordId}`)
      .set("x-user-role", "Supervisor");
    expect(detailBefore.status).toBe(200);
    expect(Array.isArray(detailBefore.body.pieceComments)).toBe(true);
    expect(detailBefore.body.pieceComments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ piece_number: 1, comment: "First-piece setup witness", serial_number: "SN-PCOM-1" }),
        expect.objectContaining({ piece_number: 2, comment: "Minor burr removed", serial_number: "SN-PCOM-2" })
      ])
    );

    const reviewUpdate = await request(app)
      .put(`/api/records/${recordId}/piece-comment`)
      .set("x-user-role", "Supervisor")
      .send({
        userId: 4,
        pieceNumber: 2,
        comment: "Verified and accepted after deburr",
        serialNumber: "SN-PCOM-2-REV",
        reason: "quality review update"
      });
    expect(reviewUpdate.status).toBe(200);
    expect(reviewUpdate.body).toMatchObject({
      record_id: recordId,
      piece_number: 2,
      comment: "Verified and accepted after deburr",
      serial_number: "SN-PCOM-2-REV"
    });

    const detailAfter = await request(app)
      .get(`/api/records/${recordId}`)
      .set("x-user-role", "Supervisor");
    expect(detailAfter.status).toBe(200);
    expect(Array.isArray(detailAfter.body.pieceCommentAudit)).toBe(true);
    expect(detailAfter.body.pieceCommentAudit.some((row) => row.reason === "quality review update")).toBe(true);

    const csv = await request(app)
      .get(`/api/records/${recordId}/export`)
      .set("x-user-role", "Supervisor");
    expect(csv.status).toBe(200);
    expect(csv.text).toContain("piece_comment");
    expect(csv.text).toContain("piece_serial_number");
    expect(csv.text).toContain("Verified and accepted after deburr");
    expect(csv.text).toContain("SN-PCOM-2-REV");
  });

  it("captures quantity adjustment reason, actor, and before/after state", async () => {
    const op30 = await getOperationId("1234", "30");
    expect(op30).toBeTruthy();
    const jobId = nextJobId("J-QTY");
    const createdJob = await createJob({ id: jobId, partId: "1234", operationId: op30, qty: 4, role: "Supervisor" });
    expect(createdJob.status).toBe(201);

    const adjusted = await request(app)
      .post(`/api/jobs/${jobId}/quantity-adjustments`)
      .set("x-user-role", "Supervisor")
      .send({
        userId: 4,
        afterQty: 6,
        reason: "verified recount after setup hold"
      });
    expect(adjusted.status).toBe(201);
    expect(adjusted.body).toMatchObject({
      job_id: jobId,
      before_qty: 4,
      after_qty: 6,
      actor_user_id: 4,
      reason: "verified recount after setup hold"
    });

    const listed = await request(app)
      .get(`/api/jobs/${jobId}/quantity-adjustments`)
      .set("x-user-role", "Supervisor");
    expect(listed.status).toBe(200);
    expect(Array.isArray(listed.body)).toBe(true);
    expect(listed.body[0]).toMatchObject({
      job_id: jobId,
      before_qty: 4,
      after_qty: 6
    });

    const jobDetail = await request(app)
      .get(`/api/jobs/${jobId}`)
      .set("x-user-role", "Supervisor");
    expect(jobDetail.status).toBe(200);
    expect(jobDetail.body).toMatchObject({ id: jobId, qty: 6 });
    expect(Array.isArray(jobDetail.body.quantityAdjustments)).toBe(true);
    expect(jobDetail.body.quantityAdjustments.length).toBeGreaterThanOrEqual(1);
  });

  it("returns traceability chain by job/part/lot/piece/serial with correction lineage", async () => {
    const op20 = await getOperationId("1234", "20");
    expect(op20).toBeTruthy();
    const dimId = await getFirstDimensionId(op20);
    expect(dimId).toBeTruthy();

    const jobId = nextJobId("J-TRACE");
    const createdJob = await createJob({ id: jobId, partId: "1234", operationId: op20, lot: "Lot TRACE", qty: 3, role: "Supervisor" });
    expect(createdJob.status).toBe(201);

    const submit = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        jobId,
        partId: "1234",
        operationId: op20,
        lot: "Lot TRACE",
        serialNumber: "SN-TRACE-ROOT",
        qty: 3,
        operatorUserId: 1,
        status: "incomplete",
        oot: false,
        comment: "",
        values: [
          { dimensionId: dimId, pieceNumber: 1, value: "0.6250", isOot: false },
          { dimensionId: dimId, pieceNumber: 2, value: "0.6252", isOot: false }
        ],
        tools: [],
        missingPieces: [],
        pieceComments: [
          { pieceNumber: 1, comment: "trace comment 1", serialNumber: "SN-TRACE-1" },
          { pieceNumber: 2, comment: "trace comment 2", serialNumber: "SN-TRACE-2" }
        ]
      });
    expect(submit.status).toBe(201);
    const recordId = submit.body.id;

    const valueEdit = await request(app)
      .put(`/api/records/${recordId}/value`)
      .set("x-user-role", "Supervisor")
      .send({
        userId: 4,
        dimensionId: dimId,
        pieceNumber: 2,
        value: "0.7000",
        reason: "trace verification correction"
      });
    expect(valueEdit.status).toBe(200);

    const pieceEdit = await request(app)
      .put(`/api/records/${recordId}/piece-comment`)
      .set("x-user-role", "Supervisor")
      .send({
        userId: 4,
        pieceNumber: 2,
        comment: "trace comment corrected",
        serialNumber: "SN-TRACE-2-REV",
        reason: "trace comment correction"
      });
    expect(pieceEdit.status).toBe(200);

    const qtyAdjust = await request(app)
      .post(`/api/jobs/${jobId}/quantity-adjustments`)
      .set("x-user-role", "Supervisor")
      .send({
        userId: 4,
        afterQty: 4,
        reason: "trace quantity correction"
      });
    expect(qtyAdjust.status).toBe(201);

    const traceByJob = await request(app)
      .get(`/api/records/trace?jobId=${encodeURIComponent(jobId)}`)
      .set("x-user-role", "Supervisor");
    expect(traceByJob.status).toBe(200);
    expect(traceByJob.body.count).toBeGreaterThanOrEqual(1);
    const traceRecord = traceByJob.body.records.find((r) => r.job?.id === jobId);
    expect(traceRecord).toBeTruthy();
    expect(traceRecord.values.length).toBeGreaterThanOrEqual(2);
    expect(traceRecord.pieceComments.length).toBeGreaterThanOrEqual(2);
    expect(traceRecord.corrections.some((row) => row.piece_number === 2)).toBe(true);
    expect(traceRecord.pieceCommentCorrections.some((row) => row.piece_number === 2)).toBe(true);
    expect(traceRecord.quantityAdjustments.length).toBeGreaterThanOrEqual(1);

    const traceByPiece = await request(app)
      .get(`/api/records/trace?jobId=${encodeURIComponent(jobId)}&pieceNumber=2`)
      .set("x-user-role", "Supervisor");
    expect(traceByPiece.status).toBe(200);
    expect(traceByPiece.body.count).toBeGreaterThanOrEqual(1);
    const pieceScoped = traceByPiece.body.records[0];
    expect(pieceScoped.values.every((row) => Number(row.piece_number) === 2)).toBe(true);
    expect(pieceScoped.pieceComments.every((row) => Number(row.piece_number) === 2)).toBe(true);

    const traceBySerial = await request(app)
      .get("/api/records/trace?serial=SN-TRACE-2-REV")
      .set("x-user-role", "Supervisor");
    expect(traceBySerial.status).toBe(200);
    expect(traceBySerial.body.count).toBeGreaterThanOrEqual(1);
    expect(traceBySerial.body.records.some((r) => r.job?.id === jobId)).toBe(true);
  });
});
