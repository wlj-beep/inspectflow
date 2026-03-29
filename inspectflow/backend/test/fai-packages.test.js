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

async function getDimensionIds(operationId) {
  const { rows } = await query(
    "SELECT id, nominal FROM dimensions WHERE operation_id=$1 ORDER BY id ASC",
    [operationId]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    nominal: Number(row.nominal)
  }));
}

async function getUserIdByName(name) {
  const { rows } = await query(
    "SELECT id FROM users WHERE name=$1 LIMIT 1",
    [name]
  );
  return rows[0]?.id;
}

describe("FAI package workflow", () => {
  it("creates a record-scoped package, enforces readiness gating, and finalizes after signoff", async () => {
    const opId = await getOperationId("1234", "20");
    const dimIds = await getDimensionIds(opId);
    const operatorId = await getUserIdByName("J. Morris");
    const qualityId = await getUserIdByName("Q. Nguyen");

    expect(opId).toBeTruthy();
    expect(dimIds.length).toBeGreaterThan(1);
    expect(operatorId).toBeTruthy();
    expect(qualityId).toBeTruthy();

    const jobId = nextJobId("J-FAI-REC");
    const createJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: jobId,
        partId: "1234",
        partRevision: "A",
        operationId: opId,
        lot: "Lot FAI REC",
        qty: 2,
        status: "open"
      });
    expect(createJob.status).toBe(201);

    const submitRecord = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        jobId,
        partId: "1234",
        operationId: opId,
        lot: "Lot FAI REC",
        qty: 2,
        operatorUserId: operatorId,
        status: "complete",
        oot: false,
        comment: "",
        values: dimIds.map((dimension) => ({
          dimensionId: dimension.id,
          pieceNumber: 1,
          value: Number.isFinite(dimension.nominal) ? dimension.nominal.toFixed(4) : "0.0000",
          isOot: false
        })),
        tools: [],
        missingPieces: [],
        pieceComments: []
      });
    expect(submitRecord.status).toBe(201);
    const recordId = submitRecord.body.id;

    const createPackage = await request(app)
      .post("/api/quality/fai-packages")
      .set("x-user-role", "Operator")
      .send({ recordId });
    expect(createPackage.status).toBe(201);
    expect(createPackage.body.package).toMatchObject({
      contextType: "record",
      recordId,
      partId: "1234",
      lot: "Lot FAI REC",
      status: "open"
    });
    expect(createPackage.body.readiness.readyToFinalize).toBe(false);
    expect(createPackage.body.readiness.blockers).toContain("signoffs_pending");
    expect(createPackage.body.readiness.blockers).not.toContain("measurements_pending");
    expect(createPackage.body.characteristics).toHaveLength(dimIds.length);

    const packageId = createPackage.body.package.id;

    const listPackages = await request(app)
      .get(`/api/quality/fai-packages?recordId=${recordId}`)
      .set("x-user-role", "Quality");
    expect(listPackages.status).toBe(200);
    expect(listPackages.body.count).toBeGreaterThanOrEqual(1);
    expect(listPackages.body.packages.some((pkg) => pkg.id === packageId)).toBe(true);

    const operatorDenied = await request(app)
      .post(`/api/quality/fai-packages/${packageId}/signoffs`)
      .set("x-user-role", "Operator")
      .send({
        userId: operatorId,
        dimensionId: dimIds[0],
        disposition: "approved"
      });
    expect(operatorDenied.status).toBe(403);
    expect(operatorDenied.body).toMatchObject({ error: "forbidden" });

    const finalizeBlocked = await request(app)
      .post(`/api/quality/fai-packages/${packageId}/finalize`)
      .set("x-user-role", "Quality")
      .send({ userId: qualityId });
    expect(finalizeBlocked.status).toBe(409);
    expect(finalizeBlocked.body.error).toBe("package_not_ready");
    expect(finalizeBlocked.body.readiness.blockers).toContain("signoffs_pending");

    for (const dimension of dimIds) {
      const signoff = await request(app)
        .post(`/api/quality/fai-packages/${packageId}/signoffs`)
        .set("x-user-role", "Quality")
        .send({
          userId: qualityId,
          dimensionId: dimension.id,
          disposition: "approved",
          note: `approved ${dimension.id}`
        });
      expect(signoff.status).toBe(200);
      const signedCharacteristic = signoff.body.characteristics.find((item) => item.dimensionId === dimension.id);
      expect(signedCharacteristic?.signoff).toMatchObject({
        disposition: "approved",
        signedByUserId: qualityId,
        signedByRole: "Quality"
      });
    }

    const finalized = await request(app)
      .post(`/api/quality/fai-packages/${packageId}/finalize`)
      .set("x-user-role", "Quality")
      .send({ userId: qualityId });
    expect(finalized.status).toBe(200);
    expect(finalized.body.package).toMatchObject({
      id: packageId,
      status: "finalized",
      finalizedByUserId: qualityId,
      finalizedByRole: "Quality"
    });
    expect(finalized.body.readiness.readyToFinalize).toBe(true);
    expect(finalized.body.readiness.blockers).toEqual([]);
    expect(finalized.body.history.some((entry) => entry.eventType === "finalized")).toBe(true);

    const summary = await request(app)
      .get(`/api/quality/fai-packages/${packageId}/summary`)
      .set("x-user-role", "Supervisor");
    expect(summary.status).toBe(200);
    expect(summary.body.package).toMatchObject({ id: packageId, status: "finalized" });
    expect(summary.body.profile).toMatchObject({ id: "as9102-basic" });
    expect(summary.body.input.part.id).toBe("1234");
    expect(Array.isArray(summary.body.output.artifacts)).toBe(true);
    expect(summary.body.output.artifacts.length).toBeGreaterThan(0);
  });

  it("supports part+lot package scope and read access while keeping signoff/finalize restricted", async () => {
    const op10Id = await getOperationId("1234", "10");
    const dimIds = await getDimensionIds(op10Id);
    const operatorId = await getUserIdByName("J. Morris");
    const supervisorId = await getUserIdByName("D. Kowalski");

    expect(op10Id).toBeTruthy();
    expect(dimIds.length).toBeGreaterThan(0);
    expect(operatorId).toBeTruthy();
    expect(supervisorId).toBeTruthy();

    const jobId = nextJobId("J-FAI-PARTLOT");
    const createJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: jobId,
        partId: "1234",
        partRevision: "A",
        operationId: op10Id,
        lot: "Lot FAI PL",
        qty: 1,
        status: "open"
      });
    expect(createJob.status).toBe(201);

    const submitRecord = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        jobId,
        partId: "1234",
        operationId: op10Id,
        lot: "Lot FAI PL",
        qty: 1,
        operatorUserId: operatorId,
        status: "complete",
        oot: false,
        comment: "",
        values: dimIds.map((dimension) => ({
          dimensionId: dimension.id,
          pieceNumber: 1,
          value: Number.isFinite(dimension.nominal) ? dimension.nominal.toFixed(4) : "0.0000",
          isOot: false
        })),
        tools: [],
        missingPieces: [],
        pieceComments: []
      });
    expect(submitRecord.status).toBe(201);

    const createPackage = await request(app)
      .post("/api/quality/fai-packages")
      .set("x-user-role", "Operator")
      .send({
        partId: "1234",
        lot: "Lot FAI PL",
        operationId: op10Id,
        profileId: "as9102-line-only"
      });
    expect(createPackage.status).toBe(201);
    expect(createPackage.body.package).toMatchObject({
      contextType: "part_lot",
      partId: "1234",
      lot: "Lot FAI PL",
      operationId: op10Id,
      profileId: "as9102-line-only"
    });
    expect(createPackage.body.readiness.blockers).toContain("signoffs_pending");

    const packageId = createPackage.body.package.id;

    const readAsOperator = await request(app)
      .get(`/api/quality/fai-packages/${packageId}`)
      .set("x-user-role", "Operator");
    expect(readAsOperator.status).toBe(200);
    expect(readAsOperator.body.package.id).toBe(packageId);

    const summary = await request(app)
      .get(`/api/quality/fai-packages/${packageId}/summary`)
      .set("x-user-role", "Operator");
    expect(summary.status).toBe(200);
    expect(summary.body.profile).toMatchObject({ id: "as9102-line-only" });
    expect(summary.body.output.artifacts).toHaveLength(1);
    expect(summary.body.output.artifacts[0].templateId).toBe("fai-line-v1");

    const supervisorSignoff = await request(app)
      .post(`/api/quality/fai-packages/${packageId}/signoffs`)
      .set("x-user-role", "Supervisor")
      .send({
        userId: supervisorId,
        dimensionId: dimIds[0].id,
        disposition: "rejected",
        note: "needs review"
      });
    expect(supervisorSignoff.status).toBe(200);
    expect(supervisorSignoff.body.readiness.blockers).toContain("rejected_characteristics_present");
    expect(supervisorSignoff.body.readiness.blockers).toContain("signoffs_pending");

    const operatorFinalizeDenied = await request(app)
      .post(`/api/quality/fai-packages/${packageId}/finalize`)
      .set("x-user-role", "Operator")
      .send({ userId: operatorId });
    expect(operatorFinalizeDenied.status).toBe(403);
    expect(operatorFinalizeDenied.body).toMatchObject({ error: "forbidden" });
  });
});
