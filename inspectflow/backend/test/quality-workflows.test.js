import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

function nextDocNumber(prefix = "QDOC") {
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function getUserIdByName(name) {
  const { rows } = await query("SELECT id FROM users WHERE name=$1 LIMIT 1", [name]);
  return rows[0]?.id || null;
}

describe("quality workflow APIs", () => {
  it("creates and releases controlled documents, then gates training access", async () => {
    const adminId = await getUserIdByName("S. Admin");
    const qualityId = await getUserIdByName("Q. Nguyen");
    expect(adminId).toBeTruthy();
    expect(qualityId).toBeTruthy();

    const docNumber = nextDocNumber();
    const created = await request(app)
      .post("/api/quality/documents")
      .set("x-user-role", "Admin")
      .set("x-user-id", String(adminId))
      .send({
        docNumber,
        title: "Controlled Document Workflow",
        kind: "procedure",
        revisionCode: "A",
        changeReason: "Initial release for the controlled document workflow",
        content: { sections: ["scope", "release", "reason trail"] }
      });
    expect(created.status).toBe(201);
    expect(created.body.document).toMatchObject({
      docNumber,
      title: "Controlled Document Workflow",
      status: "draft"
    });

    const released = await request(app)
      .post(`/api/quality/documents/${created.body.document.id}/release`)
      .set("x-user-role", "Admin")
      .set("x-user-id", String(adminId))
      .send({ releaseNote: "Approved for production use" });
    expect(released.status).toBe(200);
    expect(released.body.document).toMatchObject({ status: "released" });

    const requirement = await request(app)
      .post(`/api/quality/documents/${created.body.document.id}/training/requirements`)
      .set("x-user-role", "Admin")
      .set("x-user-id", String(adminId))
      .send({ role: "Quality", mode: "hard", active: true });
    expect(requirement.status).toBe(201);
    expect(requirement.body.requirement).toMatchObject({
      role: "Quality",
      mode: "hard",
      active: true
    });

    const blockedAccess = await request(app)
      .get(`/api/quality/documents/${created.body.document.id}/training/access?userId=${qualityId}&role=Quality`)
      .set("x-user-role", "Admin")
      .set("x-user-id", String(adminId));
    expect(blockedAccess.status).toBe(200);
    expect(blockedAccess.body).toMatchObject({
      allowed: false,
      mode: "hard"
    });
    expect(blockedAccess.body.blockedReasons).toContain("training_incomplete");

    const completion = await request(app)
      .post(`/api/quality/documents/${created.body.document.id}/training/completions`)
      .set("x-user-role", "Admin")
      .set("x-user-id", String(adminId))
      .send({
        userId: qualityId,
        result: "complete",
        note: "Completed the release workflow review"
      });
    expect(completion.status).toBe(201);
    expect(completion.body.completion).toMatchObject({
      document_id: created.body.document.id,
      user_id: qualityId,
      result: "complete"
    });

    const allowedAccess = await request(app)
      .get(`/api/quality/documents/${created.body.document.id}/training/access?userId=${qualityId}&role=Quality`)
      .set("x-user-role", "Admin")
      .set("x-user-id", String(adminId));
    expect(allowedAccess.status).toBe(200);
    expect(allowedAccess.body).toMatchObject({
      allowed: true,
      mode: "hard"
    });

    const listed = await request(app)
      .get("/api/quality/documents?status=released")
      .set("x-user-role", "Admin")
      .set("x-user-id", String(adminId));
    expect(listed.status).toBe(200);
    expect(listed.body.documents.some((doc) => doc.docNumber === docNumber)).toBe(true);
  });

  it("tracks supplier SCAR lifecycle and exports closure evidence", async () => {
    const adminId = await getUserIdByName("S. Admin");
    expect(adminId).toBeTruthy();

    const issue = await request(app)
      .post("/api/issues")
      .set("x-user-role", "Admin")
      .set("x-user-id", String(adminId))
      .send({
        category: "tool_issue",
        details: "Supplier lot mismatch identified during incoming inspection",
        userId: adminId
      });
    expect(issue.status).toBe(201);

    const capa = await request(app)
      .post(`/api/issues/${issue.body.id}/capa`)
      .set("x-user-role", "Admin")
      .set("x-user-id", String(adminId))
      .send({
        userId: adminId,
        title: "Supplier discrepancy containment",
        severity: "high",
        problemStatement: "Incoming material mismatch requires supplier follow-up",
        ownerUserId: adminId,
        dueAt: "2026-04-10T00:00:00.000Z"
      });
    expect(capa.status).toBe(201);

    const supplierEvent = await request(app)
      .post("/api/quality/supplier-events")
      .set("x-user-role", "Admin")
      .set("x-user-id", String(adminId))
      .send({
        supplierName: "Northwind Castings",
        details: "SCAR initiated for incoming nonconforming lot",
        capaEventId: capa.body.id,
        responseDueAt: "2026-04-08T00:00:00.000Z"
      });
    expect(supplierEvent.status).toBe(201);
    expect(supplierEvent.body.event).toMatchObject({
      supplier_name: "Northwind Castings",
      status: "open"
    });

    const issued = await request(app)
      .post(`/api/quality/supplier-events/${supplierEvent.body.event.id}/transition`)
      .set("x-user-role", "Admin")
      .set("x-user-id", String(adminId))
      .send({ toStatus: "scar_issued", note: "SCAR issued to supplier" });
    expect(issued.status).toBe(200);
    expect(issued.body.event.status).toBe("scar_issued");

    const responded = await request(app)
      .post(`/api/quality/supplier-events/${supplierEvent.body.event.id}/transition`)
      .set("x-user-role", "Admin")
      .set("x-user-id", String(adminId))
      .send({ toStatus: "response_received", note: "Supplier response received" });
    expect(responded.status).toBe(200);
    expect(responded.body.event.status).toBe("response_received");

    const closed = await request(app)
      .post(`/api/quality/supplier-events/${supplierEvent.body.event.id}/transition`)
      .set("x-user-role", "Admin")
      .set("x-user-id", String(adminId))
      .send({
        toStatus: "closed",
        note: "Supplier corrective action accepted",
        closureEvidence: [{ type: "email", ref: "supplier-response-001" }]
      });
    expect(closed.status).toBe(200);
    expect(closed.body.event.status).toBe("closed");

    const exported = await request(app)
      .get(`/api/quality/supplier-events/${supplierEvent.body.event.id}/export`)
      .set("x-user-role", "Admin")
      .set("x-user-id", String(adminId));
    expect(exported.status).toBe(200);
    expect(exported.body.export).toMatchObject({
      contractId: "QUAL-SUPPLIER-v1",
      status: "closed"
    });
    expect(Array.isArray(exported.body.export.closureEvidence)).toBe(true);
    expect(exported.body.export.closureEvidence[0]).toMatchObject({ ref: "supplier-response-001" });
  });
});
