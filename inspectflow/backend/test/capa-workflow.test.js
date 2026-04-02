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

describe("CAPA workflow foundation", () => {
  it("enforces staged CAPA evidence, role-safe transitions, and transition audit lineage", async () => {
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
        category: "dimension_issue",
        details: `CAPA test issue ${crypto.randomUUID().slice(0, 8)}`,
        userId: operatorId
      });
    expect(issueCreate.status).toBe(201);
    const issueId = Number(issueCreate.body.id);
    expect(issueId).toBeTruthy();

    const operatorCreate = await request(app)
      .post(`/api/issues/${issueId}/capa`)
      .set("x-user-role", "Operator")
      .send({
        userId: operatorId,
        title: "Operator should not create CAPA"
      });
    expect(operatorCreate.status).toBe(403);

    const capaCreate = await request(app)
      .post(`/api/issues/${issueId}/capa`)
      .set("x-user-role", "Quality")
      .send({
        userId: qualityId,
        title: "Investigate repeated OOT",
        severity: "high",
        problemStatement: "Repeated out-of-tolerance trend detected."
      });
    expect(capaCreate.status).toBe(201);
    const capaId = Number(capaCreate.body.id);
    expect(capaId).toBeTruthy();
    expect(capaCreate.body.status).toBe("open");
    expect(capaCreate.body.severity).toBe("high");

    const missingContainment = await request(app)
      .post(`/api/issues/capa/${capaId}/transition`)
      .set("x-user-role", "Quality")
      .send({
        userId: qualityId,
        toStatus: "containment",
        note: "Need containment evidence first"
      });
    expect(missingContainment.status).toBe(400);
    expect(missingContainment.body).toMatchObject({ error: "containment_plan_required" });

    const updateContainment = await request(app)
      .put(`/api/issues/capa/${capaId}`)
      .set("x-user-role", "Quality")
      .send({
        containmentPlan: "Segregate suspect lot and increase sampling.",
        ownerUserId: qualityId
      });
    expect(updateContainment.status).toBe(200);
    expect(updateContainment.body.containment_plan).toContain("Segregate");

    const invalidJump = await request(app)
      .post(`/api/issues/capa/${capaId}/transition`)
      .set("x-user-role", "Quality")
      .send({
        userId: qualityId,
        toStatus: "verification",
        note: "Trying to skip required phases"
      });
    expect(invalidJump.status).toBe(400);
    expect(invalidJump.body).toMatchObject({ error: "invalid_transition" });

    const movedContainment = await request(app)
      .post(`/api/issues/capa/${capaId}/transition`)
      .set("x-user-role", "Quality")
      .send({
        userId: qualityId,
        toStatus: "containment",
        note: "Contain suspect inventory"
      });
    expect(movedContainment.status).toBe(200);
    expect(movedContainment.body.status).toBe("containment");

    const movedInvestigation = await request(app)
      .post(`/api/issues/capa/${capaId}/transition`)
      .set("x-user-role", "Quality")
      .send({
        userId: qualityId,
        toStatus: "investigation",
        note: "Open formal investigation"
      });
    expect(movedInvestigation.status).toBe(200);
    expect(movedInvestigation.body.status).toBe("investigation");

    const missingRootCause = await request(app)
      .post(`/api/issues/capa/${capaId}/transition`)
      .set("x-user-role", "Quality")
      .send({
        userId: qualityId,
        toStatus: "corrective_action",
        note: "Need root cause first"
      });
    expect(missingRootCause.status).toBe(400);
    expect(missingRootCause.body).toMatchObject({ error: "root_cause_required" });

    const updateRootCause = await request(app)
      .put(`/api/issues/capa/${capaId}`)
      .set("x-user-role", "Quality")
      .send({
        rootCause: "Tool wear beyond expected threshold."
      });
    expect(updateRootCause.status).toBe(200);
    expect(updateRootCause.body.root_cause).toContain("Tool wear");

    const movedCorrectiveAction = await request(app)
      .post(`/api/issues/capa/${capaId}/transition`)
      .set("x-user-role", "Quality")
      .send({
        userId: qualityId,
        toStatus: "corrective_action",
        note: "Proceed to corrective action planning"
      });
    expect(movedCorrectiveAction.status).toBe(200);
    expect(movedCorrectiveAction.body.status).toBe("corrective_action");

    const qualityVerification = await request(app)
      .post(`/api/issues/capa/${capaId}/transition`)
      .set("x-user-role", "Quality")
      .send({
        userId: qualityId,
        toStatus: "verification",
        note: "Quality should not verify alone"
      });
    expect(qualityVerification.status).toBe(403);
    expect(qualityVerification.body).toMatchObject({ error: "forbidden" });

    const updateCorrectiveAction = await request(app)
      .put(`/api/issues/capa/${capaId}`)
      .set("x-user-role", "Quality")
      .send({
        correctiveActionPlan: "Replace tool and revise inspection frequency."
      });
    expect(updateCorrectiveAction.status).toBe(200);
    expect(updateCorrectiveAction.body.corrective_action_plan).toContain("Replace tool");

    const movedVerification = await request(app)
      .post(`/api/issues/capa/${capaId}/transition`)
      .set("x-user-role", "Supervisor")
      .send({
        userId: supervisorId,
        toStatus: "verification",
        note: "Supervisor reviewing implementation effectiveness"
      });
    expect(movedVerification.status).toBe(200);
    expect(movedVerification.body.status).toBe("verification");

    const supervisorClose = await request(app)
      .post(`/api/issues/capa/${capaId}/transition`)
      .set("x-user-role", "Supervisor")
      .send({
        userId: supervisorId,
        toStatus: "closed",
        note: "Supervisor should not close CAPA"
      });
    expect(supervisorClose.status).toBe(403);
    expect(supervisorClose.body).toMatchObject({ error: "forbidden" });

    const missingEffectiveness = await request(app)
      .post(`/api/issues/capa/${capaId}/transition`)
      .set("x-user-role", "Admin")
      .send({
        userId: adminId,
        toStatus: "closed",
        note: "Need effectiveness evidence first"
      });
    expect(missingEffectiveness.status).toBe(400);
    expect(missingEffectiveness.body).toMatchObject({ error: "effectiveness_notes_required" });

    const updateEffectiveness = await request(app)
      .put(`/api/issues/capa/${capaId}`)
      .set("x-user-role", "Admin")
      .send({
        effectivenessNotes: "Follow-up inspection lots remained within control for 3 consecutive runs."
      });
    expect(updateEffectiveness.status).toBe(200);
    expect(updateEffectiveness.body.effectiveness_notes).toContain("3 consecutive runs");

    const movedClosed = await request(app)
      .post(`/api/issues/capa/${capaId}/transition`)
      .set("x-user-role", "Admin")
      .send({
        userId: adminId,
        toStatus: "closed",
        note: "Close after effectiveness verification"
      });
    expect(movedClosed.status).toBe(200);
    expect(movedClosed.body.status).toBe("closed");

    const detail = await request(app)
      .get(`/api/issues/capa/${capaId}`)
      .set("x-user-role", "Admin");
    expect(detail.status).toBe(200);
    expect(Array.isArray(detail.body.transitions)).toBe(true);
    const transitions = detail.body.transitions.map((row) => row.to_status);
    expect(transitions).toEqual([
      "open",
      "containment",
      "investigation",
      "corrective_action",
      "verification",
      "closed"
    ]);
    expect(detail.body.transitions.map((row) => row.actor_role)).toEqual([
      "Quality",
      "Quality",
      "Quality",
      "Quality",
      "Supervisor",
      "Admin"
    ]);
    expect(detail.body.closed_by_user_id).toBe(adminId);

    const listClosed = await request(app)
      .get("/api/issues/capa?status=closed")
      .set("x-user-role", "Admin");
    expect(listClosed.status).toBe(200);
    expect(listClosed.body.some((row) => Number(row.id) === capaId)).toBe(true);
  });
});
