import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";
import {
  buildBaseRecordPayload,
  createJob,
  getDimensionIdByName,
  getFirstDimensionId,
  getToolIdByName,
  getUserIdByName,
  nextJobId,
  nextPartId,
  requireOperationId
} from "./helpers/backlogValidationHelpers.js";
import { roleHeader } from "./helpers/sessionAuthHelpers.js";

describe("Backlog validation hardening", () => {
  it("requires authentication for user list", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("denies Operator access to admin CRUD endpoints", async () => {
    const op20 = await requireOperationId("1234", "20");

    const cases = [
      request(app).post("/api/parts").set(roleHeader("Operator")).send({ id: "P-LOCK-1", description: "Blocked" }),
      request(app).post("/api/operations").set(roleHeader("Operator")).send({ partId: "1234", opNumber: "99", label: "Blocked" }),
      request(app).post("/api/dimensions").set(roleHeader("Operator")).send({
        operationId: op20,
        name: `Blocked Dim ${crypto.randomUUID().slice(0, 6)}`,
        nominal: 1,
        tolPlus: 0.01,
        tolMinus: 0.01,
        unit: "in",
        sampling: "100pct"
      }),
      request(app).post("/api/tools").set(roleHeader("Operator")).send({
        name: `Blocked Tool ${crypto.randomUUID().slice(0, 6)}`,
        type: "Variable",
        itNum: `IT-B-${crypto.randomUUID().slice(0, 4)}`
      }),
      request(app).post("/api/users").set(roleHeader("Operator")).send({
        name: `Blocked User ${crypto.randomUUID().slice(0, 6)}`,
        role: "Operator"
      }),
      request(app).post("/api/jobs").set(roleHeader("Operator")).send({
        id: nextJobId("J-BLOCK"),
        partId: "1234",
        operationId: op20,
        lot: "Lot B",
        qty: 2,
        status: "open"
      }),
      request(app).put("/api/roles/Operator").set(roleHeader("Operator")).send({
        capabilities: ["view_operator", "submit_records"]
      }),
      request(app).put("/api/records/1/value").set(roleHeader("Operator")).send({
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
    const op20 = await requireOperationId("1234", "20");

    const jobId = nextJobId("J-LOCK");
    const created = await createJob({ id: jobId, partId: "1234", operationId: op20 });
    expect(created.status).toBe(201);

    const lockAsOwner = await request(app)
      .post(`/api/jobs/${jobId}/lock`)
      .set(roleHeader("Operator"))
      .send({ userId: 1 });
    expect(lockAsOwner.status).toBe(200);
    expect(lockAsOwner.body).toMatchObject({ ok: true });

    const unlockByOtherOperator = await request(app)
      .post(`/api/jobs/${jobId}/unlock`)
      .set(roleHeader("Operator"))
      .send({ userId: 2 });
    expect(unlockByOtherOperator.status).toBe(409);
    expect(unlockByOtherOperator.body).toMatchObject({ error: "lock_mismatch" });

    const unlockBySupervisor = await request(app)
      .post(`/api/jobs/${jobId}/unlock`)
      .set(roleHeader("Supervisor"))
      .send({});
    expect(unlockBySupervisor.status).toBe(200);
    expect(unlockBySupervisor.body).toMatchObject({ ok: true, forced: true });

    const relockAsOtherOperator = await request(app)
      .post(`/api/jobs/${jobId}/lock`)
      .set(roleHeader("Operator"))
      .send({ userId: 2 });
    expect(relockAsOtherOperator.status).toBe(200);

    const cleanupUnlock = await request(app)
      .post(`/api/jobs/${jobId}/unlock`)
      .set(roleHeader("Supervisor"))
      .send({});
    expect(cleanupUnlock.status).toBe(200);

    const removed = await request(app)
      .delete(`/api/jobs/${jobId}`)
      .set(roleHeader("Supervisor"));
    expect(removed.status).toBe(200);
  });

  it("rejects invalid record dimension/tool references", async () => {
    const op20 = await requireOperationId("1234", "20");

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

    const basePayload = buildBaseRecordPayload({ jobId, operationId: op20, lot: "Lot T", qty: 3 });

    const invalidDimension = await request(app)
      .post("/api/records")
      .set(roleHeader("Operator"))
      .send({
        ...basePayload,
        values: [{ dimensionId: 999999, pieceNumber: 1, value: "0.6250", isOot: false }],
        tools: []
      });
    expect(invalidDimension.status).toBe(400);
    expect(invalidDimension.body).toMatchObject({ error: "invalid_dimension_for_operation" });

    const invalidTool = await request(app)
      .post("/api/records")
      .set(roleHeader("Operator"))
      .send({
        ...basePayload,
        values: [],
        tools: [{ dimensionId: dimId, toolId: 999999, itNum: "IT-MISSING" }]
      });
    expect(invalidTool.status).toBe(400);
    expect(invalidTool.body).toMatchObject({ error: "invalid_tool_id" });

    const disallowedTool = await request(app)
      .post("/api/records")
      .set(roleHeader("Operator"))
      .send({
        ...basePayload,
        values: [],
        tools: [{ dimensionId: dimId, toolId: disallowedToolId, itNum: "IT-BADMAP" }]
      });
    expect(disallowedTool.status).toBe(400);
    expect(disallowedTool.body).toMatchObject({ error: "tool_not_allowed_for_dimension" });

    const removed = await request(app)
      .delete(`/api/jobs/${jobId}`)
      .set(roleHeader("Supervisor"));
    expect(removed.status).toBe(200);
  });

  it("allows Supervisor manage_jobs create/update/delete flow", async () => {
    const op30 = await requireOperationId("1234", "30");

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
      .set(roleHeader("Supervisor"))
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
      .set(roleHeader("Supervisor"));
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({ ok: true });
  });

  it("validates missing piece reasons and allows 'Unable to Measure'", async () => {
    const op20 = await requireOperationId("1234", "20");

    const jobId = nextJobId("J-MISS");
    const created = await createJob({ id: jobId, partId: "1234", operationId: op20, qty: 3 });
    expect(created.status).toBe(201);

    const basePayload = buildBaseRecordPayload({ jobId, operationId: op20, lot: "Lot M", qty: 3, values: [], tools: [] });

    const scrappedNoNc = await request(app)
      .post("/api/records")
      .set(roleHeader("Operator"))
      .send({
        ...basePayload,
        missingPieces: [{ pieceNumber: 1, reason: "Scrapped" }]
      });
    expect(scrappedNoNc.status).toBe(400);
    expect(scrappedNoNc.body).toMatchObject({ error: "scrapped_requires_nc" });

    const otherNoDetails = await request(app)
      .post("/api/records")
      .set(roleHeader("Operator"))
      .send({
        ...basePayload,
        missingPieces: [{ pieceNumber: 1, reason: "Other" }]
      });
    expect(otherNoDetails.status).toBe(400);
    expect(otherNoDetails.body).toMatchObject({ error: "other_requires_details" });

    const unableToMeasure = await request(app)
      .post("/api/records")
      .set(roleHeader("Operator"))
      .send({
        ...basePayload,
        missingPieces: [{ pieceNumber: 1, reason: "Unable to Measure" }]
      });
    expect(unableToMeasure.status).toBe(201);
    expect(unableToMeasure.body).toMatchObject({ job_id: jobId, status: "incomplete" });
  });

  it("supports first/middle/last and custom-interval sampling definitions", async () => {
    const op20 = await requireOperationId("1234", "20");
    const name = `Sampling Dim ${crypto.randomUUID().slice(0, 6)}`;

    const created = await request(app)
      .post("/api/dimensions")
      .set(roleHeader("Admin"))
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
      .set(roleHeader("Admin"))
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
      .set(roleHeader("Admin"))
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
    const op20 = await requireOperationId("1234", "20");
    const dimId = await getFirstDimensionId(op20);
    expect(dimId).toBeTruthy();

    const jobId = nextJobId("J-AUD");
    const createdJob = await createJob({ id: jobId, partId: "1234", operationId: op20, qty: 3 });
    expect(createdJob.status).toBe(201);

    const submit = await request(app)
      .post("/api/records")
      .set(roleHeader("Operator"))
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
      .set(roleHeader("Supervisor"))
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
      .set(roleHeader("Supervisor"));
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
      .set(roleHeader("Supervisor"));
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ id: recordId, oot: true });

    const csv = await request(app)
      .get(`/api/records/${recordId}/export`)
      .set(roleHeader("Supervisor"));
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text).toContain("record_id,dimension_id,dimension_name,piece_number,value,is_oot");
    expect(csv.text).toContain(`"${"0.7000"}"`);
  });

  it("allows Admin to read and persist role capabilities", async () => {
    const readRoles = await request(app)
      .get("/api/roles")
      .set(roleHeader("Admin"));
    expect(readRoles.status).toBe(200);
    const operatorRole = readRoles.body.find((r) => r.role === "Operator");
    expect(operatorRole).toBeTruthy();
    expect(Array.isArray(operatorRole.capabilities)).toBe(true);

    const writeSameCaps = await request(app)
      .put("/api/roles/Operator")
      .set(roleHeader("Admin"))
      .send({ capabilities: operatorRole.capabilities });
    expect(writeSameCaps.status).toBe(200);
    expect(writeSameCaps.body).toMatchObject({ role: "Operator" });
    expect(writeSameCaps.body.capabilities).toEqual(operatorRole.capabilities);
  });

  it("enforces pass/fail-only corrections for Go/No-Go measured dimensions", async () => {
    const op20 = await requireOperationId("1234", "20");
    const dimId = await getDimensionIdByName(op20, "Bore Diameter");
    expect(dimId).toBeTruthy();
    const plugGaugeId = await getToolIdByName("Plug Gauge");
    expect(plugGaugeId).toBeTruthy();

    const jobId = nextJobId("J-GNG");
    const createdJob = await createJob({ id: jobId, partId: "1234", operationId: op20, qty: 2 });
    expect(createdJob.status).toBe(201);

    const submit = await request(app)
      .post("/api/records")
      .set(roleHeader("Operator"))
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
      .set(roleHeader("Supervisor"))
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
      .set(roleHeader("Supervisor"))
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
      .set(roleHeader("Operator"))
      .send({
        category: "app_functionality_issue",
        details: "UI became unresponsive when switching tabs.",
        userId: operatorId,
        partId: "1234",
        operationId: await requireOperationId("1234", "20"),
        jobId: "J-10042"
      });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: "open", category: "app_functionality_issue" });
    const issueId = created.body.id;

    const listed = await request(app)
      .get("/api/issues")
      .set(roleHeader("Admin"));
    expect(listed.status).toBe(200);
    expect(Array.isArray(listed.body)).toBe(true);
    expect(listed.body.some((i) => i.id === issueId)).toBe(true);

    const completed = await request(app)
      .put(`/api/issues/${issueId}/complete`)
      .set(roleHeader("Admin"))
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
      .set(roleHeader("Admin"))
      .send({ id: partId, description: "Revision Test Part", revision: "A" });
    expect(createdPart.status).toBe(201);

    const createdOp = await request(app)
      .post("/api/operations")
      .set(roleHeader("Admin"))
      .send({ partId, opNumber: "010", label: "Revision Op" });
    expect(createdOp.status).toBe(201);
    const operationId = createdOp.body.id;

    const createdDim = await request(app)
      .post("/api/dimensions")
      .set(roleHeader("Admin"))
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
      .set(roleHeader("Admin"));
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
      .set(roleHeader("Admin"))
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
      .set(roleHeader("Admin"));
    expect(afterUpdate.status).toBe(200);
    expect(afterUpdate.body.currentRevision).toBeTruthy();
    expect(afterUpdate.body.currentRevision).not.toBe(beforeRevision);
    expect(Array.isArray(afterUpdate.body.revisions)).toBe(true);
    expect(afterUpdate.body.revisions.length).toBeGreaterThanOrEqual(2);

    const historical = await request(app)
      .get(`/api/parts/${encodeURIComponent(partId)}?revision=${beforeRevision}`)
      .set(roleHeader("Admin"));
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
      .set(roleHeader("Admin"))
      .send({ id: nextPartId("P-NOREV"), description: "No Revision Part" });
    expect(missingPartRevision.status).toBe(400);
    expect(missingPartRevision.body).toMatchObject({ error: "revision_required" });

    const op20 = await requireOperationId("1234", "20");
    const invalidJobRevision = await request(app)
      .post("/api/jobs")
      .set(roleHeader("Supervisor"))
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
      .set(roleHeader("Admin"))
      .send({ id: partId, description: "Bulk Old Name", revision: "A" });
    expect(createdPart.status).toBe(201);

    const bulkUpdate = await request(app)
      .post("/api/parts/bulk-update")
      .set(roleHeader("Admin"))
      .send({
        updates: [{ id: partId, description: "Bulk New Name" }]
      });
    expect(bulkUpdate.status).toBe(200);
    expect(bulkUpdate.body).toMatchObject({ ok: true, updated: 1 });

    const partAfter = await request(app)
      .get(`/api/parts/${encodeURIComponent(partId)}`)
      .set(roleHeader("Admin"));
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
      .set(roleHeader("Admin"))
      .send({ name: homeName, locationType: "machine" });
    expect(createdHome.status).toBe(201);

    const createdCurrent = await request(app)
      .post("/api/tool-locations")
      .set(roleHeader("Admin"))
      .send({ name: currentName, locationType: "out_for_calibration" });
    expect(createdCurrent.status).toBe(201);

    const toolId = await getToolIdByName("Outside Micrometer");
    expect(toolId).toBeTruthy();

    const updatedTool = await request(app)
      .put(`/api/tools/${toolId}`)
      .set(roleHeader("Admin"))
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
      .set(roleHeader("Admin"));
    expect(blockedDelete.status).toBe(409);
    expect(blockedDelete.body).toMatchObject({ error: "location_in_use" });

    const clearedTool = await request(app)
      .put(`/api/tools/${toolId}`)
      .set(roleHeader("Admin"))
      .send({
        currentLocationId: null,
        homeLocationId: null
      });
    expect(clearedTool.status).toBe(200);

    const deletedCurrent = await request(app)
      .delete(`/api/tool-locations/${createdCurrent.body.id}`)
      .set(roleHeader("Admin"));
    expect(deletedCurrent.status).toBe(200);
    expect(deletedCurrent.body).toMatchObject({ ok: true });
  });


});
