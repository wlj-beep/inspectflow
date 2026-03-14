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
});
