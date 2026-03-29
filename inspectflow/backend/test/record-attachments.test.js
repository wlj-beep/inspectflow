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

describe("record attachments (BL-074)", () => {
  it("stores submission attachments and exposes traceable attachment metadata", async () => {
    const opId = await getOperationId("1234", "20");
    const dimId = await getFirstDimensionId(opId);
    const operatorId = await getUserIdByName("J. Morris");
    expect(opId).toBeTruthy();
    expect(dimId).toBeTruthy();
    expect(operatorId).toBeTruthy();

    const jobId = nextJobId("J-ATT");
    const createJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: jobId,
        partId: "1234",
        partRevision: "A",
        operationId: opId,
        lot: "Lot ATT",
        qty: 2,
        status: "open"
      });
    expect(createJob.status).toBe(201);

    const filePayload = Buffer.from("fixture-image-content", "utf8").toString("base64");
    const submit = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        jobId,
        partId: "1234",
        operationId: opId,
        lot: "Lot ATT",
        qty: 2,
        operatorUserId: operatorId,
        status: "complete",
        oot: false,
        comment: "",
        values: [
          { dimensionId: dimId, pieceNumber: 1, value: "0.6250", isOot: false }
        ],
        tools: [],
        missingPieces: [],
        pieceComments: [],
        attachments: [
          {
            pieceNumber: 1,
            fileName: "piece-1.jpg",
            mediaType: "image/jpeg",
            dataBase64: filePayload,
            retentionDays: 90
          }
        ]
      });
    expect(submit.status).toBe(201);
    const recordId = submit.body.id;
    expect(recordId).toBeTruthy();

    const detail = await request(app)
      .get(`/api/records/${recordId}`)
      .set("x-user-role", "Supervisor");
    expect(detail.status).toBe(200);
    expect(Array.isArray(detail.body.attachments)).toBe(true);
    expect(detail.body.attachments.length).toBe(1);
    expect(detail.body.attachments[0]).toMatchObject({
      record_id: recordId,
      piece_number: 1,
      file_name: "piece-1.jpg",
      media_type: "image/jpeg"
    });

    const attachmentId = detail.body.attachments[0].id;
    const listRes = await request(app)
      .get(`/api/records/${recordId}/attachments`)
      .set("x-user-role", "Supervisor");
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(1);
    expect(listRes.body[0].data_base64).toBeUndefined();

    const fetchWithData = await request(app)
      .get(`/api/records/${recordId}/attachments/${attachmentId}`)
      .set("x-user-role", "Supervisor");
    expect(fetchWithData.status).toBe(200);
    expect(fetchWithData.body.data_base64).toBe(filePayload);
  });

  it("supports attachment upload after submission and retention updates", async () => {
    const opId = await getOperationId("1234", "20");
    const dimId = await getFirstDimensionId(opId);
    const operatorId = await getUserIdByName("J. Morris");
    const supervisorId = await getUserIdByName("D. Kowalski");
    expect(opId).toBeTruthy();
    expect(dimId).toBeTruthy();
    expect(operatorId).toBeTruthy();
    expect(supervisorId).toBeTruthy();

    const jobId = nextJobId("J-AT2");
    const createJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: jobId,
        partId: "1234",
        partRevision: "A",
        operationId: opId,
        lot: "Lot AT2",
        qty: 1,
        status: "open"
      });
    expect(createJob.status).toBe(201);

    const submit = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        jobId,
        partId: "1234",
        operationId: opId,
        lot: "Lot AT2",
        qty: 1,
        operatorUserId: operatorId,
        status: "complete",
        oot: false,
        comment: "",
        values: [
          { dimensionId: dimId, pieceNumber: 1, value: "0.6251", isOot: false }
        ],
        tools: [],
        missingPieces: [],
        pieceComments: []
      });
    expect(submit.status).toBe(201);
    const recordId = submit.body.id;

    const invalidPiece = await request(app)
      .post(`/api/records/${recordId}/attachments`)
      .set("x-user-role", "Operator")
      .send({
        userId: operatorId,
        pieceNumber: 2,
        fileName: "bad.jpg",
        mediaType: "image/jpeg",
        dataBase64: Buffer.from("x", "utf8").toString("base64")
      });
    expect(invalidPiece.status).toBe(400);
    expect(invalidPiece.body).toMatchObject({ error: "piece_number_out_of_range" });

    const invalidData = await request(app)
      .post(`/api/records/${recordId}/attachments`)
      .set("x-user-role", "Operator")
      .send({
        userId: operatorId,
        pieceNumber: 1,
        fileName: "bad.jpg",
        mediaType: "image/jpeg",
        dataBase64: "not-base64"
      });
    expect(invalidData.status).toBe(400);
    expect(invalidData.body).toMatchObject({ error: "invalid_attachment_data" });

    const added = await request(app)
      .post(`/api/records/${recordId}/attachments`)
      .set("x-user-role", "Operator")
      .send({
        userId: operatorId,
        pieceNumber: 1,
        fileName: "after-submit.png",
        mediaType: "image/png",
        dataBase64: Buffer.from("upload-after", "utf8").toString("base64"),
        retentionDays: 30
      });
    expect(added.status).toBe(201);
    expect(added.body.file_name).toBe("after-submit.png");
    const attachmentId = added.body.id;

    const operatorRetentionDenied = await request(app)
      .put(`/api/records/${recordId}/attachments/${attachmentId}/retention`)
      .set("x-user-role", "Operator")
      .send({
        userId: operatorId,
        retentionDays: 45
      });
    expect(operatorRetentionDenied.status).toBe(403);
    expect(operatorRetentionDenied.body).toMatchObject({ error: "forbidden" });

    const badRetention = await request(app)
      .put(`/api/records/${recordId}/attachments/${attachmentId}/retention`)
      .set("x-user-role", "Supervisor")
      .send({
        userId: supervisorId,
        retentionDays: 0
      });
    expect(badRetention.status).toBe(400);
    expect(badRetention.body).toMatchObject({ error: "invalid_retention_days" });

    const updatedRetention = await request(app)
      .put(`/api/records/${recordId}/attachments/${attachmentId}/retention`)
      .set("x-user-role", "Supervisor")
      .send({
        userId: supervisorId,
        retentionDays: 120
      });
    expect(updatedRetention.status).toBe(200);
    expect(updatedRetention.body.id).toBe(attachmentId);
    expect(updatedRetention.body.retention_until).toBeTruthy();
  });

  it("rejects malformed attachment payloads in submission and upload flows", async () => {
    const opId = await getOperationId("1234", "20");
    const dimId = await getFirstDimensionId(opId);
    const operatorId = await getUserIdByName("J. Morris");
    expect(opId).toBeTruthy();
    expect(dimId).toBeTruthy();
    expect(operatorId).toBeTruthy();

    const badJobId = nextJobId("J-ATT3");
    const createBadJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: badJobId,
        partId: "1234",
        partRevision: "A",
        operationId: opId,
        lot: "Lot ATT3",
        qty: 1,
        status: "open"
      });
    expect(createBadJob.status).toBe(201);

    const malformedSubmission = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        jobId: badJobId,
        partId: "1234",
        operationId: opId,
        lot: "Lot ATT3",
        qty: 1,
        operatorUserId: operatorId,
        status: "complete",
        oot: false,
        comment: "",
        values: [
          { dimensionId: dimId, pieceNumber: 1, value: "0.6252", isOot: false }
        ],
        tools: [],
        missingPieces: [],
        pieceComments: [],
        attachments: {}
      });
    expect(malformedSubmission.status).toBe(400);
    expect(malformedSubmission.body).toMatchObject({ error: "payload_arrays_required" });

    const okJobId = nextJobId("J-ATT4");
    const createOkJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: okJobId,
        partId: "1234",
        partRevision: "A",
        operationId: opId,
        lot: "Lot ATT4",
        qty: 1,
        status: "open"
      });
    expect(createOkJob.status).toBe(201);

    const submit = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        jobId: okJobId,
        partId: "1234",
        operationId: opId,
        lot: "Lot ATT4",
        qty: 1,
        operatorUserId: operatorId,
        status: "complete",
        oot: false,
        comment: "",
        values: [
          { dimensionId: dimId, pieceNumber: 1, value: "0.6253", isOot: false }
        ],
        tools: [],
        missingPieces: [],
        pieceComments: []
      });
    expect(submit.status).toBe(201);
    const recordId = submit.body.id;

    const malformedUpload = await request(app)
      .post(`/api/records/${recordId}/attachments`)
      .set("x-user-role", "Operator")
      .send({
        userId: operatorId,
        pieceNumber: 1,
        fileName: "after-submit.txt",
        mediaType: "text/plain",
        dataBase64: ""
      });
    expect(malformedUpload.status).toBe(400);
    expect(malformedUpload.body).toMatchObject({ error: "invalid_attachment_data" });
  });
});
