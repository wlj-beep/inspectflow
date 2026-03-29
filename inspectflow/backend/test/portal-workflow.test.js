import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";
import { createTestSession, cleanupTestUsers } from "./helpers/sessionFixtures.js";

const trackedUserIds = [];
const trackedSupplierIds = [];
const trackedSupplierItemIds = [];
const trackedInspectionIds = [];
const trackedNcrIds = [];
const trackedCapaIds = [];
const trackedInviteIds = [];
const trackedCocIds = [];
const trackedPpapIds = [];

function unique(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

afterEach(async () => {
  for (const id of trackedInviteIds.splice(0)) {
    await query("DELETE FROM portal_document_access WHERE invitation_id=$1", [id]).catch(() => {});
    await query("DELETE FROM portal_capa_responses WHERE invitation_id=$1", [id]).catch(() => {});
    await query("DELETE FROM portal_sessions WHERE invitation_id=$1", [id]).catch(() => {});
    await query("DELETE FROM portal_invitations WHERE id=$1", [id]).catch(() => {});
  }

  for (const id of trackedInspectionIds.splice(0)) {
    await query("DELETE FROM incoming_inspections WHERE id=$1", [id]).catch(() => {});
  }

  for (const id of trackedCapaIds.splice(0)) {
    await query("DELETE FROM portal_capa_responses WHERE capa_id=$1", [id]).catch(() => {});
    await query("DELETE FROM capa_audit_log WHERE capa_id=$1", [id]).catch(() => {});
    await query("DELETE FROM capa_actions WHERE capa_id=$1", [id]).catch(() => {});
    await query("DELETE FROM capa_records WHERE id=$1", [id]).catch(() => {});
  }

  for (const id of trackedNcrIds.splice(0)) {
    await query("DELETE FROM ncr_audit_log WHERE ncr_id=$1", [id]).catch(() => {});
    await query("DELETE FROM nonconformances WHERE id=$1", [id]).catch(() => {});
  }

  for (const id of trackedCocIds.splice(0)) {
    await query("DELETE FROM certificates_of_conformance WHERE id=$1", [id]).catch(() => {});
  }

  for (const id of trackedPpapIds.splice(0)) {
    await query("DELETE FROM ppap_customer_approvals WHERE package_id=$1", [id]).catch(() => {});
    await query("DELETE FROM ppap_elements WHERE package_id=$1", [id]).catch(() => {});
    await query("DELETE FROM ppap_packages WHERE id=$1", [id]).catch(() => {});
  }

  for (const id of trackedSupplierItemIds.splice(0)) {
    await query("DELETE FROM supplier_items WHERE id=$1", [id]).catch(() => {});
  }

  for (const id of trackedSupplierIds.splice(0)) {
    await query("DELETE FROM suppliers WHERE id=$1", [id]).catch(() => {});
  }

  await cleanupTestUsers(trackedUserIds);
});

describe("External portal baseline (BL-122)", () => {
  it("supports supplier invite redemption, incoming-inspection visibility, and CAPA response submission", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const supplierCode = unique("SUP");
    const supplierName = `Supplier ${supplierCode}`;
    const partId = "1234";

    const { rows: supplierRows } = await query(
      `INSERT INTO suppliers (supplier_code, name, status)
       VALUES ($1, $2, 'approved')
       RETURNING id`,
      [supplierCode, supplierName]
    );
    const supplierId = Number(supplierRows[0].id);
    trackedSupplierIds.push(supplierId);

    const { rows: itemRows } = await query(
      `INSERT INTO supplier_items (supplier_id, part_id, item_code, active)
       VALUES ($1, $2, $3, true)
       RETURNING id`,
      [supplierId, partId, unique("ITEM")]
    );
    const supplierItemId = Number(itemRows[0].id);
    trackedSupplierItemIds.push(supplierItemId);

    const { rows: ncrRows } = await query(
      `INSERT INTO nonconformances (title, description, part_id, job_id, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ["Supplier Defect", "Incoming issue", partId, unique("JOB"), admin.userId]
    );
    const ncrId = Number(ncrRows[0].id);
    trackedNcrIds.push(ncrId);

    const { rows: capaRows } = await query(
      `INSERT INTO capa_records (title, problem_statement, status, source_ncr_id, created_by_user_id)
       VALUES ($1, $2, 'open', $3, $4)
       RETURNING id`,
      ["Supplier CAPA", "Containment needed", ncrId, admin.userId]
    );
    const capaId = Number(capaRows[0].id);
    trackedCapaIds.push(capaId);

    const { rows: inspectionRows } = await query(
      `INSERT INTO incoming_inspections
         (supplier_id, supplier_item_id, received_quantity, inspected_quantity, accepted_quantity, rejected_quantity,
          status, linked_ncr_id, created_by_user_id)
       VALUES ($1, $2, 100, 100, 90, 10, 'rejected', $3, $4)
       RETURNING id`,
      [supplierId, supplierItemId, ncrId, admin.userId]
    );
    trackedInspectionIds.push(Number(inspectionRows[0].id));

    const inviteRes = await request(app)
      .post("/api/portal/invitations")
      .set("Cookie", admin.cookie)
      .send({
        portalType: "supplier",
        email: "supplier.portal@example.com",
        supplierId
      });

    expect(inviteRes.status).toBe(201);
    const invitationId = Number(inviteRes.body.invitation.id);
    trackedInviteIds.push(invitationId);
    const inviteToken = inviteRes.body.inviteToken;
    expect(typeof inviteToken).toBe("string");

    const redeemRes = await request(app)
      .post("/api/portal/auth/redeem")
      .send({ inviteToken });
    expect(redeemRes.status).toBe(200);
    const portalToken = redeemRes.body.sessionToken;

    const inspectionsRes = await request(app)
      .get("/api/portal/supplier/incoming-inspections")
      .set("Authorization", `Bearer ${portalToken}`);
    expect(inspectionsRes.status).toBe(200);
    expect(inspectionsRes.body.records.length).toBeGreaterThan(0);
    expect(inspectionsRes.body.records[0].supplier_id).toBe(supplierId);

    const capaListRes = await request(app)
      .get("/api/portal/supplier/capa")
      .set("Authorization", `Bearer ${portalToken}`);
    expect(capaListRes.status).toBe(200);
    expect(capaListRes.body.records.some((item) => Number(item.id) === capaId)).toBe(true);

    const responseRes = await request(app)
      .post(`/api/portal/supplier/capa/${capaId}/respond`)
      .set("Authorization", `Bearer ${portalToken}`)
      .send({ responseText: "Supplier containment implemented; corrective action in progress." });
    expect(responseRes.status).toBe(201);
    expect(responseRes.body).toMatchObject({
      capa_id: capaId,
      status: "submitted"
    });

    const updateRes = await request(app)
      .post(`/api/portal/supplier/capa/${capaId}/respond`)
      .set("Authorization", `Bearer ${portalToken}`)
      .send({ responseText: "Updated 8D response attached." });
    expect(updateRes.status).toBe(201);
    expect(updateRes.body).toMatchObject({
      capa_id: capaId,
      status: "updated"
    });
  });

  it("supports customer invite redemption and CoC/PPAP/PSW document access", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const customerName = `Customer ${unique("C")}`;

    const { rows: cocRows } = await query(
      `INSERT INTO certificates_of_conformance
         (coc_number, customer_name, purchase_order, spec_reference, statement_template, statement_rendered, status, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'issued', $7)
       RETURNING id`,
      [
        `COC-${unique("N")}`,
        customerName,
        unique("PO"),
        "SPEC-1",
        "Conformance for {{customer}}",
        `Conformance for ${customerName}`,
        admin.userId
      ]
    );
    const cocId = Number(cocRows[0].id);
    trackedCocIds.push(cocId);

    const { rows: ppapRows } = await query(
      `INSERT INTO ppap_packages (part_id, customer_name, submission_level, status, notes, created_by_user_id)
       VALUES ('1234', $1, 3, 'approved', 'Portal package', $2)
       RETURNING id`,
      [customerName, admin.userId]
    );
    const ppapId = Number(ppapRows[0].id);
    trackedPpapIds.push(ppapId);

    await query(
      `INSERT INTO ppap_elements (package_id, element_code, status, notes)
       VALUES ($1, 'part_submission_warrant', 'complete', 'PSW complete')`,
      [ppapId]
    );

    await query(
      `INSERT INTO ppap_customer_approvals (package_id, decision, customer_reference, notes, decided_by_user_id)
       VALUES ($1, 'approved', $2, 'Portal approval', $3)`,
      [ppapId, unique("CUST-REF"), admin.userId]
    );

    const inviteRes = await request(app)
      .post("/api/portal/invitations")
      .set("Cookie", admin.cookie)
      .send({
        portalType: "customer",
        email: "customer.portal@example.com",
        customerName
      });

    expect(inviteRes.status).toBe(201);
    const invitationId = Number(inviteRes.body.invitation.id);
    trackedInviteIds.push(invitationId);

    const redeemRes = await request(app)
      .post("/api/portal/auth/redeem")
      .send({ inviteToken: inviteRes.body.inviteToken });
    expect(redeemRes.status).toBe(200);
    const portalToken = redeemRes.body.sessionToken;

    const docsRes = await request(app)
      .get("/api/portal/customer/documents")
      .set("Authorization", `Bearer ${portalToken}`);
    expect(docsRes.status).toBe(200);
    expect(docsRes.body.coc.some((item) => Number(item.id) === cocId)).toBe(true);
    expect(docsRes.body.ppap.some((item) => Number(item.id) === ppapId)).toBe(true);
    expect(docsRes.body.psw.some((item) => Number(item.packageId) === ppapId)).toBe(true);

    const cocDownload = await request(app)
      .get(`/api/portal/customer/documents/coc/${cocId}/download`)
      .set("Authorization", `Bearer ${portalToken}`);
    expect(cocDownload.status).toBe(200);
    expect(cocDownload.body).toMatchObject({
      type: "coc",
      document: {
        id: cocId
      }
    });

    const pswDownload = await request(app)
      .get(`/api/portal/customer/documents/psw/${ppapId}/download`)
      .set("Authorization", `Bearer ${portalToken}`);
    expect(pswDownload.status).toBe(200);
    expect(pswDownload.body).toMatchObject({
      type: "psw",
      psw: {
        packageId: ppapId
      }
    });
  });

  it("enforces invitation/session auth boundaries and revoke behavior", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const supplierCode = unique("SUP");
    const { rows: supplierRows } = await query(
      `INSERT INTO suppliers (supplier_code, name, status)
       VALUES ($1, $2, 'approved')
       RETURNING id`,
      [supplierCode, `Supplier ${supplierCode}`]
    );
    const supplierId = Number(supplierRows[0].id);
    trackedSupplierIds.push(supplierId);

    const inviteRes = await request(app)
      .post("/api/portal/invitations")
      .set("Cookie", admin.cookie)
      .send({
        portalType: "supplier",
        email: "revokable@example.com",
        supplierId
      });
    expect(inviteRes.status).toBe(201);
    const invitationId = Number(inviteRes.body.invitation.id);
    trackedInviteIds.push(invitationId);

    const revoked = await request(app)
      .post(`/api/portal/invitations/${invitationId}/revoke`)
      .set("Cookie", admin.cookie)
      .send({});
    expect(revoked.status).toBe(200);
    expect(revoked.body).toMatchObject({ id: invitationId, status: "revoked" });

    const redeemAfterRevoke = await request(app)
      .post("/api/portal/auth/redeem")
      .send({ inviteToken: inviteRes.body.inviteToken });
    expect(redeemAfterRevoke.status).toBe(403);
    expect(redeemAfterRevoke.body).toMatchObject({ error: "invite_revoked" });

    const noToken = await request(app).get("/api/portal/me");
    expect(noToken.status).toBe(401);
    expect(noToken.body).toMatchObject({ error: "portal_unauthenticated" });
  });
});
