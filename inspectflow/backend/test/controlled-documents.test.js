import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

async function getUserIdByName(name) {
  const { rows } = await query(
    "SELECT id FROM users WHERE name=$1 LIMIT 1",
    [name]
  );
  return rows[0]?.id;
}

async function getAnyUserIdByRole(role) {
  const { rows } = await query(
    "SELECT id FROM users WHERE role=$1 AND active=true ORDER BY id ASC LIMIT 1",
    [role]
  );
  return rows[0]?.id;
}

describe("controlled document workflow", () => {
  it("tracks revisioned procedures through CAPA-linked approval and release flow", async () => {
    const operatorId = (await getUserIdByName("J. Morris")) || (await getAnyUserIdByRole("Operator"));
    const qualityId = (await getUserIdByName("Q. Nguyen")) || (await getAnyUserIdByRole("Quality"));
    const supervisorId = (await getUserIdByName("D. Kowalski")) || (await getAnyUserIdByRole("Supervisor"));
    const adminId = (await getUserIdByName("S. Admin")) || (await getAnyUserIdByRole("Admin"));
    expect(operatorId).toBeTruthy();
    expect(qualityId).toBeTruthy();
    expect(supervisorId).toBeTruthy();
    expect(adminId).toBeTruthy();

    const issueCreate = await request(app)
      .post("/api/issues")
      .set("x-user-role", "Operator")
      .send({
        category: "app_functionality_issue",
        details: `Controlled doc issue ${crypto.randomUUID().slice(0, 8)}`,
        userId: operatorId
      });
    expect(issueCreate.status).toBe(201);
    const issueId = Number(issueCreate.body.id);

    const capaCreate = await request(app)
      .post(`/api/issues/${issueId}/capa`)
      .set("x-user-role", "Quality")
      .send({
        userId: qualityId,
        title: "Document corrective action guidance",
        severity: "high",
        problemStatement: "Operators need a controlled update to the corrective action procedure."
      });
    expect(capaCreate.status).toBe(201);
    const capaId = Number(capaCreate.body.id);

    const documentNumber = `PROC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const documentCreate = await request(app)
      .post(`/api/issues/capa/${capaId}/documents`)
      .set("x-user-role", "Quality")
      .send({
        userId: qualityId,
        documentNumber,
        documentType: "procedure",
        title: "Containment Procedure",
        content: "1. Segregate suspect lots.\n2. Increase sampling.",
        changeReason: "Initial controlled procedure for corrective action rollout."
      });
    expect(documentCreate.status).toBe(201);
    expect(documentCreate.body.documentType).toBe("procedure");
    expect(documentCreate.body.activeRevisionCode).toBeNull();
    expect(documentCreate.body.latestRevision).toMatchObject({
      revisionCode: "A",
      status: "draft",
      changeReason: "Initial controlled procedure for corrective action rollout."
    });
    const documentId = Number(documentCreate.body.id);
    const revisionAId = Number(documentCreate.body.latestRevision.id);

    const qualityApprove = await request(app)
      .post(`/api/issues/documents/${documentId}/revisions/${revisionAId}/approve`)
      .set("x-user-role", "Quality")
      .send({
        userId: qualityId,
        reason: "Quality cannot self-approve released guidance."
      });
    expect(qualityApprove.status).toBe(403);
    expect(qualityApprove.body).toMatchObject({ error: "forbidden" });

    const supervisorApprove = await request(app)
      .post(`/api/issues/documents/${documentId}/revisions/${revisionAId}/approve`)
      .set("x-user-role", "Supervisor")
      .send({
        userId: supervisorId,
        reason: "Supervisor verified the work instruction wording."
      });
    expect(supervisorApprove.status).toBe(200);
    expect(supervisorApprove.body.latestRevision).toMatchObject({
      revisionCode: "A",
      status: "approved"
    });

    const qualityRelease = await request(app)
      .post(`/api/issues/documents/${documentId}/revisions/${revisionAId}/release`)
      .set("x-user-role", "Quality")
      .send({
        userId: qualityId,
        reason: "Quality cannot release controlled procedure."
      });
    expect(qualityRelease.status).toBe(403);
    expect(qualityRelease.body).toMatchObject({ error: "forbidden" });

    const adminRelease = await request(app)
      .post(`/api/issues/documents/${documentId}/revisions/${revisionAId}/release`)
      .set("x-user-role", "Admin")
      .send({
        userId: adminId,
        reason: "Release for corrective action deployment."
      });
    expect(adminRelease.status).toBe(200);
    expect(adminRelease.body.activeRevisionCode).toBe("A");
    expect(adminRelease.body.activeRevision).toMatchObject({
      revisionCode: "A",
      status: "released"
    });

    const revisionCreate = await request(app)
      .post(`/api/issues/documents/${documentId}/revisions`)
      .set("x-user-role", "Quality")
      .send({
        userId: qualityId,
        title: "Containment Procedure",
        content: "1. Segregate suspect lots.\n2. Increase sampling.\n3. Require supervisor sign-off.",
        changeReason: "Add explicit supervisor sign-off to the containment workflow."
      });
    expect(revisionCreate.status).toBe(201);
    expect(revisionCreate.body.activeRevisionCode).toBe("A");
    expect(revisionCreate.body.latestRevision).toMatchObject({
      revisionCode: "B",
      status: "draft",
      changeReason: "Add explicit supervisor sign-off to the containment workflow."
    });
    const revisionBId = Number(revisionCreate.body.latestRevision.id);

    const approveRevisionB = await request(app)
      .post(`/api/issues/documents/${documentId}/revisions/${revisionBId}/approve`)
      .set("x-user-role", "Supervisor")
      .send({
        userId: supervisorId,
        reason: "Supervisor approved the revised sign-off requirement."
      });
    expect(approveRevisionB.status).toBe(200);
    expect(approveRevisionB.body.latestRevision).toMatchObject({
      revisionCode: "B",
      status: "approved"
    });

    const releaseRevisionB = await request(app)
      .post(`/api/issues/documents/${documentId}/revisions/${revisionBId}/release`)
      .set("x-user-role", "Admin")
      .send({
        userId: adminId,
        reason: "Release revision B as the effective corrective action procedure."
      });
    expect(releaseRevisionB.status).toBe(200);
    expect(releaseRevisionB.body.activeRevisionCode).toBe("B");
    expect(releaseRevisionB.body.activeRevision).toMatchObject({
      revisionCode: "B",
      status: "released"
    });

    const detail = await request(app)
      .get(`/api/issues/documents/${documentId}`)
      .set("x-user-role", "Admin");
    expect(detail.status).toBe(200);
    expect(detail.body.documentNumber).toBe(documentNumber);
    expect(detail.body.revisions.map((row) => ({ code: row.revisionCode, status: row.status }))).toEqual([
      { code: "A", status: "superseded" },
      { code: "B", status: "released" }
    ]);
    expect(detail.body.changeTrail.map((row) => `${row.revisionCode}:${row.action}`)).toEqual([
      "A:created",
      "A:approved",
      "A:released",
      "B:created",
      "B:approved",
      "A:superseded",
      "B:released"
    ]);
    expect(detail.body.changeTrail[0]?.reason).toContain("Initial controlled procedure");
    expect(detail.body.changeTrail[3]?.reason).toContain("supervisor sign-off");
    expect(detail.body.linkedCapa).toMatchObject({
      id: capaId,
      title: "Document corrective action guidance"
    });

    const capaDetail = await request(app)
      .get(`/api/issues/capa/${capaId}`)
      .set("x-user-role", "Admin");
    expect(capaDetail.status).toBe(200);
    expect(Array.isArray(capaDetail.body.controlledDocuments)).toBe(true);
    expect(capaDetail.body.controlledDocuments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: documentId,
          documentNumber,
          documentType: "procedure",
          activeRevisionCode: "B",
          latestRevisionCode: "B",
          latestRevisionStatus: "released",
          releaseState: "released"
        })
      ])
    );

    const capaDocuments = await request(app)
      .get(`/api/issues/capa/${capaId}/documents`)
      .set("x-user-role", "Admin");
    expect(capaDocuments.status).toBe(200);
    expect(capaDocuments.body.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: documentId,
          activeRevisionCode: "B",
          latestRevisionStatus: "released"
        })
      ])
    );
  });
});
