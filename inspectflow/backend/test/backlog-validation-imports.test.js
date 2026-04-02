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

describe("Backlog validation imports hardening", () => {
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
    expect(failed.body.deadLetter).toMatchObject({
      schemaVersion: "int-dead-letter-v1",
      reason: "terminal_failure",
      sourceType: "api_pull",
      importType: "jobs",
      replayControl: {
        replayable: true,
        strategy: "resubmit_with_new_token",
        requiresNewIdempotencyToken: true
      }
    });

    const runRes = await query(
      "SELECT status, summary FROM import_runs WHERE id=$1",
      [failed.body.runId]
    );
    expect(runRes.rows[0]?.status).toBe("error");
    expect(runRes.rows[0]?.summary?.runtime?.replayMetadata?.schemaVersion).toBe("int-connector-replay-v1");
    expect(runRes.rows[0]?.summary?.runtime?.deadLetter?.schemaVersion).toBe("int-dead-letter-v1");
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
