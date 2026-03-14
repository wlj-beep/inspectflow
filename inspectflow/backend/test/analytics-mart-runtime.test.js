import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

function nextJobId(prefix = "J-MART") {
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function rebuildMarts(triggerSource) {
  return request(app)
    .post("/api/analytics/marts/rebuild")
    .set("x-user-role", "Admin")
    .set("x-user-id", "10")
    .send({ triggerSource });
}

function stableSourceSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function getOperationId(partId, opNumber) {
  const numeric = Number(opNumber);
  const raw = Number.isInteger(numeric) ? String(numeric) : String(opNumber);
  const values = Array.from(new Set([
    raw,
    raw.padStart(3, "0")
  ]));
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

describe("Analytics mart runtime build (BL-039)", () => {
  it("rebuilds marts from traceable source contracts with reproducible output snapshots", async () => {
    const operationId = await getOperationId("1234", "020");
    expect(operationId).toBeTruthy();
    const dimensionId = await getFirstDimensionId(operationId);
    expect(dimensionId).toBeTruthy();

    const jobId = nextJobId();
    const createdJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: jobId,
        partId: "1234",
        partRevision: "A",
        operationId,
        lot: "Lot MART",
        qty: 3,
        status: "open"
      });
    expect(createdJob.status).toBe(201);

    const createdRecord = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .set("x-user-id", "1")
      .send({
        jobId,
        partId: "1234",
        operationId,
        lot: "Lot MART",
        qty: 3,
        operatorUserId: 1,
        status: "complete",
        values: [
          {
            dimensionId,
            pieceNumber: 1,
            value: "0.6250",
            isOot: false
          }
        ]
      });
    expect(createdRecord.status).toBe(201);

    const correctedRecord = await request(app)
      .put(`/api/records/${createdRecord.body.id}/value`)
      .set("x-user-role", "Quality")
      .set("x-user-id", "3")
      .send({
        userId: 3,
        dimensionId,
        pieceNumber: 1,
        value: "0.6244",
        reason: "mart reproducibility correction"
      });
    expect(correctedRecord.status).toBe(200);

    const suffix = crypto.randomUUID().slice(0, 5).toUpperCase();
    const webhookPayload = {
      idempotencyToken: `tok_mart_${suffix}`,
      csvText: [
        "name,type,it_num,size,active,visible,external_id",
        `Mart Tool ${suffix},Variable,IT-MART-${suffix},0.375,true,true,TOOL-MART-${suffix}`
      ].join("\n")
    };
    const webhookRun = await request(app)
      .post("/api/imports/webhooks/tools")
      .send(webhookPayload);
    expect(webhookRun.status).toBe(200);

    const duplicateWebhookRun = await request(app)
      .post("/api/imports/webhooks/tools")
      .send(webhookPayload);
    expect(duplicateWebhookRun.status).toBe(200);
    expect(duplicateWebhookRun.body.duplicate).toBe(true);

    const firstBuild = await rebuildMarts("test-runtime");
    expect(firstBuild.status).toBe(200);
    expect(firstBuild.body).toMatchObject({
      ok: true,
      status: "success",
      transformVersion: "ANA-MART-v3-transform-v1"
    });
    expect(firstBuild.body.outputSnapshot?.inspection?.rows).toBeGreaterThan(0);
    expect(firstBuild.body.outputSnapshot?.connectorRuns?.rows).toBeGreaterThan(0);

    expect(firstBuild.body.outputSnapshot?.inspection?.rows).toBe(firstBuild.body.sourceSnapshot?.measurementRows);
    expect(firstBuild.body.outputSnapshot?.connectorRuns?.rows).toBe(firstBuild.body.sourceSnapshot?.connectorRuns);

    const secondBuild = await rebuildMarts("test-runtime-repeat");
    expect(secondBuild.status).toBe(200);
    expect(secondBuild.body.ok).toBe(true);
    expect(secondBuild.body.outputSnapshot?.inspection?.rows).toBe(secondBuild.body.sourceSnapshot?.measurementRows);
    expect(secondBuild.body.outputSnapshot?.connectorRuns?.rows).toBe(secondBuild.body.sourceSnapshot?.connectorRuns);
    if (stableSourceSnapshot(firstBuild.body.sourceSnapshot, secondBuild.body.sourceSnapshot)) {
      expect(secondBuild.body.outputSnapshot).toEqual(firstBuild.body.outputSnapshot);
    }

    const statusRes = await request(app)
      .get("/api/analytics/marts/status")
      .set("x-user-role", "Admin");
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.transformVersion).toBe("ANA-MART-v3-transform-v1");
    expect(Number(statusRes.body.latestBuild?.id)).toBeGreaterThanOrEqual(secondBuild.body.buildId);
    expect(statusRes.body.latestBuild?.status).toBe("success");
    expect(statusRes.body.martCounts.inspectionEvents).toBeGreaterThan(0);
  });

  it("requires admin capability to rebuild or view mart status", async () => {
    const statusRes = await request(app)
      .get("/api/analytics/marts/status")
      .set("x-user-role", "Operator");
    expect(statusRes.status).toBe(403);

    const rebuildRes = await request(app)
      .post("/api/analytics/marts/rebuild")
      .set("x-user-role", "Operator")
      .send({});
    expect(rebuildRes.status).toBe(403);
  });
});
