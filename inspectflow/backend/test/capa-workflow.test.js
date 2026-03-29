import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";
import { createTestSession, cleanupTestUsers } from "./helpers/sessionFixtures.js";

const trackedUserIds = [];
const trackedCapaIds = [];
const trackedNcrIds = [];

async function createSession(role) {
  const session = await createTestSession(role);
  trackedUserIds.push(session.userId);
  return session;
}

afterEach(async () => {
  for (const id of trackedCapaIds) {
    await query("DELETE FROM capa_audit_log WHERE capa_id = $1", [id]).catch(() => {});
    await query("DELETE FROM capa_actions WHERE capa_id = $1", [id]).catch(() => {});
    await query("DELETE FROM capa_records WHERE id = $1", [id]).catch(() => {});
  }
  trackedCapaIds.length = 0;

  for (const id of trackedNcrIds) {
    await query("DELETE FROM ncr_audit_log WHERE ncr_id = $1", [id]).catch(() => {});
    await query("DELETE FROM nonconformances WHERE id = $1", [id]).catch(() => {});
  }
  trackedNcrIds.length = 0;

  await cleanupTestUsers(trackedUserIds);
});

describe("CAPA workflow — BL-109", () => {
  it("returns status options", async () => {
    const { cookie } = await createSession("Quality");
    const res = await request(app).get("/api/capa/status-options").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.statuses)).toBe(true);
    expect(res.body.statuses.some((item) => item.value === "effectiveness_verification")).toBe(true);
  });

  it("blocks operator from creating CAPA", async () => {
    const { cookie } = await createSession("Operator");
    const res = await request(app)
      .post("/api/capa")
      .set("Cookie", cookie)
      .send({ title: "Operator CAPA" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "forbidden" });
  });

  it("creates CAPA and supports list/detail", async () => {
    const { cookie } = await createSession("Quality");
    const create = await request(app)
      .post("/api/capa")
      .set("Cookie", cookie)
      .send({
        title: "Corrective action for recurring burr defect",
        problemStatement: "Multiple OOT records on edge burr",
        rootCauseMethod: "5whys"
      });

    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({ status: "open", root_cause_method: "5whys" });
    trackedCapaIds.push(create.body.id);

    const list = await request(app).get("/api/capa?page=1&pageSize=25").set("Cookie", cookie);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.records)).toBe(true);
    expect(list.body.records.some((row) => row.id === create.body.id)).toBe(true);

    const detail = await request(app).get(`/api/capa/${create.body.id}`).set("Cookie", cookie);
    expect(detail.status).toBe(200);
    expect(Array.isArray(detail.body.actions)).toBe(true);
    expect(Array.isArray(detail.body.auditLog)).toBe(true);
    expect(detail.body.auditLog[0]).toMatchObject({ event_type: "capa_created", to_status: "open" });
  });

  it("walks CAPA lifecycle and action tracking", async () => {
    const { cookie } = await createSession("Quality");

    const create = await request(app)
      .post("/api/capa")
      .set("Cookie", cookie)
      .send({
        title: "Drill diameter corrective action",
        dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
      });
    expect(create.status).toBe(201);
    const capaId = create.body.id;
    trackedCapaIds.push(capaId);

    const addAction = await request(app)
      .post(`/api/capa/${capaId}/actions`)
      .set("Cookie", cookie)
      .send({ title: "Retrain setup team", description: "Include tool offset verification." });
    expect(addAction.status).toBe(201);
    expect(addAction.body).toMatchObject({ status: "open" });

    const actionId = addAction.body.id;

    const actionDone = await request(app)
      .post(`/api/capa/${capaId}/actions/${actionId}/status`)
      .set("Cookie", cookie)
      .send({ status: "done" });
    expect(actionDone.status).toBe(200);
    expect(actionDone.body).toMatchObject({ status: "done" });

    const inProgress = await request(app)
      .post(`/api/capa/${capaId}/status`)
      .set("Cookie", cookie)
      .send({ status: "in_progress" });
    expect(inProgress.status).toBe(200);
    expect(inProgress.body.status).toBe("in_progress");

    const effectiveness = await request(app)
      .post(`/api/capa/${capaId}/status`)
      .set("Cookie", cookie)
      .send({ status: "effectiveness_verification" });
    expect(effectiveness.status).toBe(200);
    expect(effectiveness.body.status).toBe("effectiveness_verification");

    const notes = await request(app)
      .post(`/api/capa/${capaId}/effectiveness`)
      .set("Cookie", cookie)
      .send({ effectivenessNotes: "No repeat findings over 3 lots." });
    expect(notes.status).toBe(200);
    expect(notes.body.effectiveness_notes).toBe("No repeat findings over 3 lots.");

    const close = await request(app)
      .post(`/api/capa/${capaId}/status`)
      .set("Cookie", cookie)
      .send({ status: "closed" });
    expect(close.status).toBe(200);
    expect(close.body.status).toBe("closed");

    const detail = await request(app).get(`/api/capa/${capaId}`).set("Cookie", cookie);
    expect(detail.status).toBe(200);
    const events = detail.body.auditLog.map((item) => item.event_type);
    expect(events).toContain("capa_created");
    expect(events).toContain("capa_action_added");
    expect(events).toContain("capa_action_status_updated");
    expect(events).toContain("capa_status_updated");
    expect(events).toContain("capa_effectiveness_recorded");
  });

  it("rejects invalid status transitions", async () => {
    const { cookie } = await createSession("Quality");
    const create = await request(app)
      .post("/api/capa")
      .set("Cookie", cookie)
      .send({ title: "Transition checks" });
    expect(create.status).toBe(201);
    trackedCapaIds.push(create.body.id);

    const invalid = await request(app)
      .post(`/api/capa/${create.body.id}/status`)
      .set("Cookie", cookie)
      .send({ status: "closed" });

    expect(invalid.status).toBe(422);
    expect(invalid.body).toMatchObject({ error: "invalid_capa_transition" });
  });
});
