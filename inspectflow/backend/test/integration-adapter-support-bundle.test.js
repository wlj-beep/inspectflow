import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

describe("Integration adapter-pack and support-bundle runtime", () => {
  it("previews ERP job adapter mapping with accepted and rejected rows", async () => {
    const suffix = crypto.randomUUID().slice(0, 5).toUpperCase();
    const preview = await request(app)
      .post("/api/imports/adapters/erp-jobs/preview")
      .set("x-user-role", "Admin")
      .send({
        rows: [
          {
            job_number: `J-ERP-${suffix}`,
            part_number: "1234",
            operation_number: "20",
            lot_number: "LOT-ERP",
            quantity: 5,
            status: "open",
            external_id: `ERP-JOB-${suffix}`
          },
          {
            job_number: `J-ERP-BAD-${suffix}`,
            part_number: "1234",
            operation_number: "bad",
            lot_number: "LOT-ERP",
            quantity: 0,
            status: "invalid"
          }
        ]
      });

    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      contractId: "INT-INGEST-v1",
      adapterPack: "erp_job_v1",
      totalRows: 2,
      accepted: 1,
      rejected: 1
    });
    expect(preview.body.rejectedRows[0]?.errors).toContain("invalid_op_number");
  });

  it("runs configured integration through ERP adapter pack and exposes support bundles", async () => {
    const suffix = crypto.randomUUID().slice(0, 5).toUpperCase();
    const integration = await request(app)
      .post("/api/imports/integrations")
      .set("x-user-role", "Admin")
      .send({
        name: `ERP Adapter ${suffix}`,
        sourceType: "api_pull",
        importType: "jobs",
        endpointUrl: null,
        enabled: true,
        options: {
          adapterPack: "erp_job_v1"
        }
      });
    expect(integration.status).toBe(201);

    const externalId = `ERP-JOB-${suffix}`;
    const jobId = `J-ERP-RUN-${suffix}`;
    const pull = await request(app)
      .post(`/api/imports/integrations/${integration.body.id}/pull`)
      .set("x-user-role", "Admin")
      .send({
        rows: [
          {
            job_number: jobId,
            part_number: "1234",
            part_revision: "A",
            operation_number: "20",
            lot_number: "LOT-ADAPT",
            quantity: 7,
            status: "open",
            external_id: externalId
          }
        ]
      });

    expect(pull.status).toBe(200);
    expect(pull.body.inserted).toBe(1);
    expect(pull.body.adapter).toMatchObject({
      adapterPack: "erp_job_v1",
      total: 1,
      accepted: 1,
      rejected: 0
    });
    expect(pull.body.runId).toBeTruthy();

    const storedJob = await query("SELECT id FROM jobs WHERE id=$1", [jobId]);
    expect(storedJob.rows[0]?.id).toBe(jobId);

    const supportBundle = await request(app)
      .get(`/api/imports/runs/${pull.body.runId}/support-bundle`)
      .set("x-user-role", "Admin");
    expect(supportBundle.status).toBe(200);
    expect(supportBundle.body.supportBundle?.schemaVersion).toBe("int-support-bundle-v1");
    expect(supportBundle.body.supportBundle?.envelope?.provenance?.adapter).toBe("erp_job_v1");

    const listBundles = await request(app)
      .get("/api/imports/support-bundles?limit=10")
      .set("x-user-role", "Admin");
    expect(listBundles.status).toBe(200);
    const listed = listBundles.body.find((item) => Number(item.runId) === Number(pull.body.runId));
    expect(listed).toBeTruthy();
    expect(listed.supportBundle?.schemaVersion).toBe("int-support-bundle-v1");
  });

  it("runs metrology adapter pack for measurements with deterministic mapping", async () => {
    const suffix = crypto.randomUUID().slice(0, 5).toUpperCase();
    const jobId = `J-CMM-${suffix}`;
    const batchKey = `CMM-BATCH-${suffix}`;
    const opRes = await query(
      "SELECT id FROM operations WHERE part_id=$1 AND op_number=$2",
      ["1234", "20"]
    );
    const operationId = opRes.rows[0]?.id;
    expect(operationId).toBeTruthy();
    await query(
      `INSERT INTO jobs (id, part_id, part_revision_code, operation_id, lot, qty, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT DO NOTHING`,
      [jobId, "1234", "A", operationId, "Lot CMM", 3, "open"]
    );

    const integration = await request(app)
      .post("/api/imports/integrations")
      .set("x-user-role", "Admin")
      .send({
        name: `CMM Adapter ${suffix}`,
        sourceType: "api_pull",
        importType: "measurements",
        endpointUrl: null,
        enabled: true,
        options: {
          adapterPack: "metrology_cmm_v1"
        }
      });
    expect(integration.status).toBe(201);

    const pull = await request(app)
      .post(`/api/imports/integrations/${integration.body.id}/pull`)
      .set("x-user-role", "Admin")
      .send({
        batch_key: batchKey,
        job_id: jobId,
        part_id: "1234",
        op_number: "20",
        results: [
          { dimension_name: "Bore Diameter", piece_number: 1, actual: 0.625, tool_it_num: "IT-0031" },
          { dimension_name: "Surface Finish", piece_number: 1, value: 31.8, tool_it_num: "IT-0063" }
        ]
      });

    expect(pull.status).toBe(200);
    expect(pull.body.inserted).toBe(1);
    expect(pull.body.adapter).toMatchObject({
      adapterPack: "metrology_cmm_v1",
      total: 2,
      accepted: 2,
      rejected: 0
    });

    const supportBundle = await request(app)
      .get(`/api/imports/runs/${pull.body.runId}/support-bundle`)
      .set("x-user-role", "Admin");
    expect(supportBundle.status).toBe(200);
    expect(supportBundle.body.supportBundle).toMatchObject({
      schemaVersion: "int-support-bundle-v1",
      envelope: {
        externalKeyPresent: true,
        provenance: {
          adapter: "metrology_cmm_v1"
        }
      }
    });

    const second = await request(app)
      .post(`/api/imports/integrations/${integration.body.id}/pull`)
      .set("x-user-role", "Admin")
      .send({
        batch_key: batchKey,
        job_id: jobId,
        part_id: "1234",
        op_number: "20",
        results: [
          { dimension_name: "Bore Diameter", piece_number: 1, actual: 0.625, tool_it_num: "IT-0031" },
          { dimension_name: "Surface Finish", piece_number: 1, value: 31.8, tool_it_num: "IT-0063" }
        ]
      });

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      inserted: 0,
      updated: 0,
      failed: 0,
      duplicate: true,
      runStatus: "success"
    });

    const ledger = await query(
      `SELECT source_type, import_type, external_key, hit_count
       FROM import_idempotency_ledger
       WHERE idempotency_key=$1`,
      [second.body.idempotencyKey]
    );
    expect(ledger.rows[0]).toMatchObject({
      source_type: "api_pull",
      import_type: "measurements",
      external_key: batchKey,
      hit_count: 2
    });
  });
});
