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

async function getFirstDimensionId(operationId) {
  const { rows } = await query(
    "SELECT id FROM dimensions WHERE operation_id=$1 ORDER BY id ASC LIMIT 1",
    [operationId]
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

describe("Permissions and validation", () => {
  it("rejects record list without auth", async () => {
    const res = await request(app).get("/api/records");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("rejects part creation without manage_parts", async () => {
    const res = await request(app)
      .post("/api/parts")
      .set("x-user-role", "Operator")
      .send({ id: "TEST-001", description: "Test Part" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "forbidden" });
  });

  it("requires OOT comment for record submission", async () => {
    const res = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        jobId: "J-10042",
        partId: "1234",
        operationId: 1,
        lot: "Lot A",
        qty: 5,
        operatorUserId: 1,
        status: "complete",
        oot: true,
        values: [],
        tools: [],
        missingPieces: []
      });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "comment_required_for_oot" });
  });

  it("requires userId for operator unlock", async () => {
    const res = await request(app)
      .post("/api/jobs/J-10042/unlock")
      .set("x-user-role", "Operator")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "user_required" });
  });

  it("enforces attachment view and edit boundaries by role", async () => {
    const opId = await getOperationId("1234", "20");
    const dimId = await getFirstDimensionId(opId);
    const operatorId = await getUserIdByName("J. Morris");
    const qualityId = await getUserIdByName("Q. Nguyen");
    expect(opId).toBeTruthy();
    expect(dimId).toBeTruthy();
    expect(operatorId).toBeTruthy();
    expect(qualityId).toBeTruthy();

    const jobId = nextJobId("J-PERM-ATT");
    const createJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: jobId,
        partId: "1234",
        partRevision: "A",
        operationId: opId,
        lot: "Lot PERM",
        qty: 1,
        status: "open"
      });
    expect(createJob.status).toBe(201);

    const filePayload = Buffer.from("permission-boundary", "utf8").toString("base64");
    const submit = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        jobId,
        partId: "1234",
        operationId: opId,
        lot: "Lot PERM",
        qty: 1,
        operatorUserId: operatorId,
        status: "complete",
        oot: false,
        comment: "",
        values: [
          { dimensionId: dimId, pieceNumber: 1, value: "0.6254", isOot: false }
        ],
        tools: [],
        missingPieces: [],
        pieceComments: [],
        attachments: [
          {
            pieceNumber: 1,
            fileName: "perm-piece.jpg",
            mediaType: "image/jpeg",
            dataBase64: filePayload,
            retentionDays: 90
          }
        ]
      });
    expect(submit.status).toBe(201);
    const recordId = submit.body.id;

    const operatorView = await request(app)
      .get(`/api/records/${recordId}/attachments`)
      .set("x-user-role", "Operator");
    expect(operatorView.status).toBe(200);
    expect(operatorView.body.length).toBe(1);

    const qualityView = await request(app)
      .get(`/api/records/${recordId}/attachments`)
      .set("x-user-role", "Quality");
    expect(qualityView.status).toBe(200);
    expect(qualityView.body.length).toBe(1);

    const qualityUpload = await request(app)
      .post(`/api/records/${recordId}/attachments`)
      .set("x-user-role", "Quality")
      .send({
        userId: qualityId,
        pieceNumber: 1,
        fileName: "quality-followup.png",
        mediaType: "image/png",
        dataBase64: Buffer.from("quality-followup", "utf8").toString("base64"),
        retentionDays: 45
      });
    expect(qualityUpload.status).toBe(201);

    const attachmentId = qualityUpload.body.id;
    const operatorRetentionDenied = await request(app)
      .put(`/api/records/${recordId}/attachments/${attachmentId}/retention`)
      .set("x-user-role", "Operator")
      .send({
        userId: operatorId,
        retentionDays: 30
      });
    expect(operatorRetentionDenied.status).toBe(403);
    expect(operatorRetentionDenied.body).toMatchObject({ error: "forbidden" });

    const qualityRetention = await request(app)
      .put(`/api/records/${recordId}/attachments/${attachmentId}/retention`)
      .set("x-user-role", "Quality")
      .send({
        userId: qualityId,
        retentionDays: 120
      });
    expect(qualityRetention.status).toBe(200);
    expect(qualityRetention.body.id).toBe(attachmentId);
  });
});
