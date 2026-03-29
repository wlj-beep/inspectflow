import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";
import { createTestSession, cleanupTestUsers } from "./helpers/sessionFixtures.js";

const trackedUserIds = [];
const trackedIds = {
  documents: [],
  suppliers: [],
  programs: [],
  courses: [],
  cocs: []
};

async function createSession(role) {
  const session = await createTestSession(role);
  trackedUserIds.push(session.userId);
  return session;
}

afterEach(async () => {
  for (const id of trackedIds.cocs) await query("DELETE FROM certificates_of_conformance WHERE id=$1", [id]).catch(() => {});
  trackedIds.cocs.length = 0;

  for (const id of trackedIds.courses) await query("DELETE FROM training_courses WHERE id=$1", [id]).catch(() => {});
  trackedIds.courses.length = 0;

  for (const id of trackedIds.programs) {
    await query("DELETE FROM audit_reports WHERE schedule_id IN (SELECT id FROM audit_schedules WHERE program_id=$1)", [id]).catch(() => {});
    await query("DELETE FROM audit_findings WHERE schedule_id IN (SELECT id FROM audit_schedules WHERE program_id=$1)", [id]).catch(() => {});
    await query("DELETE FROM audit_checklist_items WHERE schedule_id IN (SELECT id FROM audit_schedules WHERE program_id=$1)", [id]).catch(() => {});
    await query("DELETE FROM audit_schedules WHERE program_id=$1", [id]).catch(() => {});
    await query("DELETE FROM audit_programs WHERE id=$1", [id]).catch(() => {});
  }
  trackedIds.programs.length = 0;

  for (const id of trackedIds.suppliers) {
    await query("DELETE FROM incoming_inspections WHERE supplier_id=$1", [id]).catch(() => {});
    await query("DELETE FROM supplier_items WHERE supplier_id=$1", [id]).catch(() => {});
    await query("DELETE FROM suppliers WHERE id=$1", [id]).catch(() => {});
  }
  trackedIds.suppliers.length = 0;

  for (const id of trackedIds.documents) {
    await query("DELETE FROM document_links WHERE document_id=$1", [id]).catch(() => {});
    await query("DELETE FROM document_approvals WHERE document_revision_id IN (SELECT id FROM document_revisions WHERE document_id=$1)", [id]).catch(() => {});
    await query("DELETE FROM document_revisions WHERE document_id=$1", [id]).catch(() => {});
    await query("DELETE FROM controlled_documents WHERE id=$1", [id]).catch(() => {});
  }
  trackedIds.documents.length = 0;

  await cleanupTestUsers(trackedUserIds);
});

describe("QMS expansion routes (BL-110..114)", () => {
  it("creates and lists controlled documents", async () => {
    const { cookie } = await createSession("Quality");
    const created = await request(app)
      .post("/api/qms/documents")
      .set("Cookie", cookie)
      .send({ documentNumber: "DOC-QA-001", title: "Incoming Inspection WI", category: "work_instruction" });
    expect(created.status).toBe(201);
    trackedIds.documents.push(created.body.id);

    const listed = await request(app).get("/api/qms/documents").set("Cookie", cookie);
    expect(listed.status).toBe(200);
    expect(listed.body.some((item) => item.id === created.body.id)).toBe(true);
  });

  it("creates supplier and scorecard path", async () => {
    const { cookie } = await createSession("Quality");
    const supplier = await request(app)
      .post("/api/qms/suppliers")
      .set("Cookie", cookie)
      .send({ supplierCode: "SUP-001", name: "Alpha Metals", status: "approved" });
    expect(supplier.status).toBe(201);
    trackedIds.suppliers.push(supplier.body.id);

    const inspection = await request(app)
      .post(`/api/qms/suppliers/${supplier.body.id}/inspections`)
      .set("Cookie", cookie)
      .send({ receivedQuantity: 100, inspectedQuantity: 100, acceptedQuantity: 98, rejectedQuantity: 2 });
    expect(inspection.status).toBe(201);

    const scorecard = await request(app).get(`/api/qms/suppliers/${supplier.body.id}/scorecard`).set("Cookie", cookie);
    expect(scorecard.status).toBe(200);
    expect(scorecard.body).toMatchObject({ inspections: 1, acceptedQuantity: 98, rejectedQuantity: 2 });
  });

  it("creates internal audit program", async () => {
    const { cookie } = await createSession("Quality");
    const program = await request(app)
      .post("/api/qms/internal-audits/programs")
      .set("Cookie", cookie)
      .send({ name: "QMS Annual Audit", scope: "ISO 9001", cadence: "annual" });
    expect(program.status).toBe(201);
    trackedIds.programs.push(program.body.id);

    const listed = await request(app).get("/api/qms/internal-audits/programs").set("Cookie", cookie);
    expect(listed.status).toBe(200);
    expect(listed.body.some((item) => item.id === program.body.id)).toBe(true);
  });

  it("creates training course", async () => {
    const { cookie } = await createSession("Quality");
    const created = await request(app)
      .post("/api/qms/training/courses")
      .set("Cookie", cookie)
      .send({ code: "TRN-CMM", title: "CMM Operation", refreshIntervalDays: 365 });
    expect(created.status).toBe(201);
    trackedIds.courses.push(created.body.id);

    const listed = await request(app).get("/api/qms/training/courses").set("Cookie", cookie);
    expect(listed.status).toBe(200);
    expect(listed.body.some((item) => item.id === created.body.id)).toBe(true);
  });

  it("creates and voids CoC", async () => {
    const { cookie: qualityCookie } = await createSession("Quality");
    const { cookie: adminCookie } = await createSession("Admin");

    const created = await request(app)
      .post("/api/qms/coc")
      .set("Cookie", qualityCookie)
      .send({ customerName: "ACME", purchaseOrder: "PO-100", specReference: "AS9102" });
    expect(created.status).toBe(201);
    trackedIds.cocs.push(created.body.id);

    const voided = await request(app)
      .post(`/api/qms/coc/${created.body.id}/void`)
      .set("Cookie", adminCookie)
      .send({ reason: "Superseded by corrected certificate" });
    expect(voided.status).toBe(200);
    expect(voided.body.status).toBe("void");
  });
});
