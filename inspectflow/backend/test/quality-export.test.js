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

describe("quality export endpoints", () => {
  it("exports CSV and AS9102 starter output for a record", async () => {
    const opId = await getOperationId("1234", "20");
    expect(opId).toBeTruthy();

    const dimId = await getFirstDimensionId(opId);
    expect(dimId).toBeTruthy();

    const operatorId = await getUserIdByName("J. Morris");
    expect(operatorId).toBeTruthy();

    const jobId = nextJobId("J-EXP");
    const createJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: jobId,
        partId: "1234",
        partRevision: "A",
        operationId: opId,
        lot: "Lot EXP",
        qty: 2,
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
        lot: "Lot EXP",
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
        pieceComments: []
      });
    expect(submit.status).toBe(201);
    const recordId = submit.body.id;
    expect(recordId).toBeTruthy();

    const csv = await request(app)
      .get(`/api/records/${recordId}/export`)
      .set("x-user-role", "Supervisor");
    expect(csv.status).toBe(200);
    expect(csv.text).toContain("record_id,dimension_id,dimension_name,piece_number,value,is_oot");
    expect(csv.text).toContain(String(recordId));

    const as9102 = await request(app)
      .get(`/api/records/${recordId}/export/as9102?profile=as9102-basic`)
      .set("x-user-role", "Supervisor");
    expect(as9102.status).toBe(200);
    expect(as9102.body.profile).toMatchObject({
      id: "as9102-basic",
      name: "AS9102 Basic",
      version: "0.1.0"
    });
    expect(as9102.body.input?.part?.id).toBe("1234");
    expect(Array.isArray(as9102.body.output?.artifacts)).toBe(true);
    expect(as9102.body.output.artifacts.length).toBeGreaterThan(0);
    const summary = as9102.body.output.artifacts.find((a) => a.templateId === "fai-summary-v1");
    expect(summary?.content || "").toContain("Part:");

    const lineOnly = await request(app)
      .get(`/api/records/${recordId}/export/as9102?profile=as9102-line-only`)
      .set("x-user-role", "Supervisor");
    expect(lineOnly.status).toBe(200);
    expect(lineOnly.body.profile).toMatchObject({
      id: "as9102-line-only",
      name: "AS9102 Line Only",
      version: "0.1.0"
    });
    expect(lineOnly.body.record?.partId).toBe("1234");
    expect(lineOnly.body.record?.lot).toBe("Lot EXP");
    expect(Array.isArray(lineOnly.body.output?.artifacts)).toBe(true);
    expect(lineOnly.body.output.artifacts.length).toBe(1);
    expect(lineOnly.body.output.artifacts[0]?.templateId).toBe("fai-line-v1");

    const unknownProfile = await request(app)
      .get(`/api/records/${recordId}/export/as9102?profile=missing-profile`)
      .set("x-user-role", "Supervisor");
    expect(unknownProfile.status).toBe(400);
    expect(unknownProfile.body).toMatchObject({ error: "unknown_profile" });
  });

  it("reports non-perfect pass rate when no measurements were captured", async () => {
    const opId = await getOperationId("1234", "20");
    expect(opId).toBeTruthy();

    const operatorId = await getUserIdByName("J. Morris");
    expect(operatorId).toBeTruthy();

    const jobId = nextJobId("J-EXP-ZERO");
    const createJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: jobId,
        partId: "1234",
        partRevision: "A",
        operationId: opId,
        lot: "Lot EXP Zero",
        qty: 2,
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
        lot: "Lot EXP Zero",
        qty: 2,
        operatorUserId: operatorId,
        status: "incomplete",
        oot: false,
        comment: "",
        values: [],
        tools: [],
        missingPieces: [{ pieceNumber: 1, reason: "Unable to Measure" }],
        pieceComments: []
      });
    expect(submit.status).toBe(201);
    const recordId = submit.body.id;
    expect(recordId).toBeTruthy();

    const as9102 = await request(app)
      .get(`/api/records/${recordId}/export/as9102?profile=as9102-basic`)
      .set("x-user-role", "Supervisor");
    expect(as9102.status).toBe(200);
    expect(as9102.body.input?.stats).toMatchObject({
      measured: 0,
      failed: 0,
      passRate: 0
    });
  });
});
