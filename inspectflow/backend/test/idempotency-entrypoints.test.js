import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
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

async function createJob({ id, partId, operationId, qty = 3, role = "Supervisor" }) {
  return request(app)
    .post("/api/jobs")
    .set("x-user-role", role)
    .send({
      id,
      partId,
      partRevision: "A",
      operationId,
      lot: "Lot I",
      qty,
      status: "open"
    });
}

describe("idempotency entrypoint enforcement", () => {
  it("deduplicates repeated manual jobs CSV imports with audit linkage", async () => {
    const jobId = nextJobId("J-IDEM-MAN");
    const payload = {
      csvText: [
        "job_id,part_id,part_revision,op_number,lot,qty,status",
        `${jobId},1234,A,020,Lot Manual,5,open`
      ].join("\n")
    };

    const first = await request(app)
      .post("/api/imports/jobs/csv")
      .set("x-user-role", "Admin")
      .send(payload);
    expect(first.status).toBe(200);
    expect(first.body.duplicate).toBe(false);
    expect(first.body.inserted).toBe(1);
    expect(first.body.runId).toBeTruthy();

    const second = await request(app)
      .post("/api/imports/jobs/csv")
      .set("x-user-role", "Admin")
      .send(payload);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      duplicate: true,
      inserted: 0,
      updated: 0,
      failed: 0,
      runStatus: "success"
    });

    const countRes = await query("SELECT COUNT(*)::INT AS count FROM jobs WHERE id=$1", [jobId]);
    expect(countRes.rows[0]?.count).toBe(1);

    const ledger = await query(
      `SELECT source_type, import_type, hit_count, first_run_id, last_run_id
       FROM import_idempotency_ledger
       WHERE idempotency_key=$1`,
      [second.body.idempotencyKey]
    );
    expect(ledger.rows[0]).toMatchObject({
      source_type: "manual_csv",
      import_type: "jobs",
      hit_count: 2,
      first_run_id: first.body.runId,
      last_run_id: second.body.runId
    });
  });

  it("deduplicates repeated measurements bulk imports", async () => {
    const operationId = await getOperationId("1234", "20");
    expect(operationId).toBeTruthy();

    const jobId = nextJobId("J-IDEM-BULK");
    const created = await createJob({ id: jobId, partId: "1234", operationId, qty: 2 });
    expect(created.status).toBe(201);

    const payload = {
      csvText: [
        "record_key,job_id,operation_ref,piece_number,dimension_name,value,operator_user_id,status",
        `batch-bulk,${jobId},020,1,Bore Diameter,0.6250,1,complete`
      ].join("\n")
    };

    const first = await request(app)
      .post("/api/imports/measurements/bulk")
      .set("x-user-role", "Admin")
      .send(payload);
    expect(first.status).toBe(200);
    expect(first.body.duplicate).toBe(false);
    expect(first.body.inserted).toBe(1);

    const second = await request(app)
      .post("/api/imports/measurements/bulk")
      .set("x-user-role", "Admin")
      .send(payload);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      duplicate: true,
      inserted: 0,
      updated: 0,
      failed: 0,
      runStatus: "success"
    });

    const records = await query("SELECT COUNT(*)::INT AS count FROM records WHERE job_id=$1", [jobId]);
    expect(records.rows[0]?.count).toBe(1);
  });

  it("deduplicates repeated operator per-job CSV imports", async () => {
    const operationId = await getOperationId("1234", "30");
    expect(operationId).toBeTruthy();

    const jobId = nextJobId("J-IDEM-OP");
    const created = await createJob({ id: jobId, partId: "1234", operationId, qty: 2 });
    expect(created.status).toBe(201);

    const lock = await request(app)
      .post(`/api/jobs/${jobId}/lock`)
      .set("x-user-role", "Operator")
      .send({ userId: 1 });
    expect(lock.status).toBe(200);

    const payload = {
      operatorUserId: 1,
      csvText: [
        "piece_number,dimension_name,value,is_oot,tool_it_nums",
        "1,Thread Pitch Dia,0.5001,false,IT-0082"
      ].join("\n")
    };

    const first = await request(app)
      .post(`/api/imports/jobs/${jobId}/measurements/csv`)
      .set("x-user-role", "Operator")
      .send(payload);
    expect(first.status).toBe(200);
    expect(first.body.duplicate).toBe(false);
    expect(first.body.inserted).toBe(1);

    const second = await request(app)
      .post(`/api/imports/jobs/${jobId}/measurements/csv`)
      .set("x-user-role", "Operator")
      .send(payload);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      duplicate: true,
      inserted: 0,
      updated: 0,
      failed: 0,
      runStatus: "success"
    });

    const ledger = await query(
      `SELECT source_type, import_type, hit_count
       FROM import_idempotency_ledger
       WHERE idempotency_key=$1`,
      [second.body.idempotencyKey]
    );
    expect(ledger.rows[0]).toMatchObject({
      source_type: "operator_csv",
      import_type: "measurements",
      hit_count: 2
    });
  });
});
