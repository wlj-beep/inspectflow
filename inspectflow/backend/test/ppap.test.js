import crypto from "node:crypto";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { attachAuthSession } from "../src/middleware/authSession.js";
import ppapRouter from "../src/routes/ppap.js";
import { query } from "../src/db.js";
import { createTestSession, cleanupTestUsers } from "./helpers/sessionFixtures.js";

const trackedUserIds = [];
const trackedPackageIds = [];

function createPpapApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(attachAuthSession);
  app.use("/api/quality", ppapRouter);
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  });
  return app;
}

const app = createPpapApp();

function suffix() {
  return crypto.randomUUID().slice(0, 8);
}

async function getPartId() {
  const { rows } = await query("SELECT id FROM parts WHERE id=$1 LIMIT 1", ["1234"]);
  return rows[0]?.id;
}

afterEach(async () => {
  for (const packageId of trackedPackageIds.splice(0).reverse()) {
    await query("DELETE FROM ppap_packages WHERE id=$1", [packageId]).catch(() => {});
  }
  await cleanupTestUsers(trackedUserIds);
});

describe("PPAP workflow baseline (BL-118)", () => {
  it("creates a level-based package, initializes 18 element statuses, and promotes draft edits to in_review", async () => {
    const partId = await getPartId();
    expect(partId).toBeTruthy();

    const quality = await createTestSession("Quality");
    trackedUserIds.push(quality.userId);

    const created = await request(app)
      .post("/api/quality/ppap-packages")
      .set("Cookie", quality.cookie)
      .send({
        partId,
        customerName: "ACME Aerospace",
        submissionLevel: 1,
        notes: "Initial PPAP baseline"
      });

    expect(created.status).toBe(201);
    expect(created.body.package).toMatchObject({
      partId,
      customerName: "ACME Aerospace",
      submissionLevel: 1,
      status: "draft"
    });
    expect(created.body.elements).toHaveLength(18);
    expect(created.body.elements.filter((item) => item.status === "pending")).toHaveLength(1);
    expect(created.body.elements.filter((item) => item.status === "not_required")).toHaveLength(17);

    const packageId = created.body.package.id;
    trackedPackageIds.push(packageId);

    const edit = await request(app)
      .patch(`/api/quality/ppap-packages/${packageId}`)
      .set("Cookie", quality.cookie)
      .send({ notes: "Revised for customer review" });

    expect(edit.status).toBe(200);
    expect(edit.body.package).toMatchObject({
      id: packageId,
      status: "in_review",
      notes: "Revised for customer review"
    });

    const levelChange = await request(app)
      .patch(`/api/quality/ppap-packages/${packageId}`)
      .set("Cookie", quality.cookie)
      .send({ submissionLevel: 2 });

    expect(levelChange.status).toBe(200);
    expect(levelChange.body.package).toMatchObject({
      id: packageId,
      submissionLevel: 2,
      status: "in_review"
    });
    expect(levelChange.body.elements.filter((item) => item.status === "pending")).toHaveLength(11);
    expect(levelChange.body.readiness.blockers).toContain("required_elements_pending");

    const listed = await request(app)
      .get("/api/quality/ppap-packages")
      .set("Cookie", quality.cookie);

    expect(listed.status).toBe(200);
    expect(listed.body.packages.some((item) => item.id === packageId)).toBe(true);
  });

  it("updates element notes and attachment metadata, then submits and records customer approval", async () => {
    const partId = await getPartId();
    expect(partId).toBeTruthy();

    const quality = await createTestSession("Quality");
    trackedUserIds.push(quality.userId);

    const created = await request(app)
      .post("/api/quality/ppap-packages")
      .set("Cookie", quality.cookie)
      .send({
        partId,
        customerName: "Northwind",
        submissionLevel: 1,
        notes: "PPAP ready for PSW completion"
      });
    expect(created.status).toBe(201);
    const packageId = created.body.package.id;
    trackedPackageIds.push(packageId);

    const attachmentData = Buffer.from("psw-evidence", "utf8").toString("base64");
    const pswUpdate = await request(app)
      .put(`/api/quality/ppap-packages/${packageId}/elements/part_submission_warrant`)
      .set("Cookie", quality.cookie)
      .send({
        status: "complete",
        notes: "PSW completed and attached",
        attachmentName: "psw-evidence.txt",
        attachmentDataBase64: attachmentData
      });

    expect(pswUpdate.status).toBe(200);
    expect(pswUpdate.body.package.status).toBe("in_review");
    const pswElement = pswUpdate.body.elements.find((item) => item.elementCode === "part_submission_warrant");
    expect(pswElement).toMatchObject({
      status: "complete",
      notes: "PSW completed and attached"
    });
    expect(pswElement.attachment).toMatchObject({
      name: "psw-evidence.txt",
      hasData: true,
      byteSize: Buffer.from("psw-evidence", "utf8").length
    });
    expect(pswElement.attachment.dataBase64).toBeUndefined();

    const detailWithData = await request(app)
      .get(`/api/quality/ppap-packages/${packageId}?includeAttachmentData=true`)
      .set("Cookie", quality.cookie);
    expect(detailWithData.status).toBe(200);
    expect(detailWithData.body.elements.find((item) => item.elementCode === "part_submission_warrant").attachment.dataBase64)
      .toBe(attachmentData);

    const submit = await request(app)
      .post(`/api/quality/ppap-packages/${packageId}/submit`)
      .set("Cookie", quality.cookie);
    expect(submit.status).toBe(200);
    expect(submit.body.package.status).toBe("submitted");
    expect(submit.body.readiness.readyToSubmit).toBe(true);

    const approval = await request(app)
      .post(`/api/quality/ppap-packages/${packageId}/customer-approvals`)
      .set("Cookie", quality.cookie)
      .send({
        decision: "approved",
        customerReference: "CUST-APP-001",
        notes: "Customer signoff recorded"
      });
    expect(approval.status).toBe(201);
    expect(approval.body.package).toMatchObject({
      id: packageId,
      status: "approved"
    });
    expect(approval.body.approval).toMatchObject({
      decision: "approved",
      customerReference: "CUST-APP-001",
      notes: "Customer signoff recorded"
    });

    const psw = await request(app)
      .get(`/api/quality/ppap-packages/${packageId}/psw`)
      .set("Cookie", quality.cookie);
    expect(psw.status).toBe(200);
    expect(psw.body.contractId).toBe("QUAL-PPAP-PSW-v1");
    expect(psw.body.psw).toMatchObject({
      partId,
      customerName: "Northwind",
      submissionLevel: 1,
      packageStatus: "approved"
    });
    expect(psw.body.psw.elementStatuses).toHaveLength(18);
  });

  it("rejects unauthorized access and blocked status transitions", async () => {
    const partId = await getPartId();
    expect(partId).toBeTruthy();

    const quality = await createTestSession("Quality");
    const operator = await createTestSession("Operator");
    trackedUserIds.push(quality.userId, operator.userId);

    const created = await request(app)
      .post("/api/quality/ppap-packages")
      .set("Cookie", quality.cookie)
      .send({
        partId,
        customerName: "Blocked Corp",
        submissionLevel: 1,
        notes: "Negative-path package"
      });
    expect(created.status).toBe(201);
    const packageId = created.body.package.id;
    trackedPackageIds.push(packageId);

    const operatorView = await request(app)
      .get("/api/quality/ppap-packages")
      .set("Cookie", operator.cookie);
    expect(operatorView.status).toBe(403);
    expect(operatorView.body).toMatchObject({ error: "forbidden" });

    const prematureSubmit = await request(app)
      .post(`/api/quality/ppap-packages/${packageId}/submit`)
      .set("Cookie", quality.cookie);
    expect(prematureSubmit.status).toBe(409);
    expect(prematureSubmit.body).toMatchObject({ error: "package_not_ready" });
    expect(prematureSubmit.body.readiness.blockers).toContain("required_elements_pending");

    const prematureApproval = await request(app)
      .post(`/api/quality/ppap-packages/${packageId}/customer-approvals`)
      .set("Cookie", quality.cookie)
      .send({ decision: "approved", customerReference: "EARLY" });
    expect(prematureApproval.status).toBe(409);
    expect(prematureApproval.body).toMatchObject({
      error: "package_not_submitted",
      status: "draft"
    });
  });
});
