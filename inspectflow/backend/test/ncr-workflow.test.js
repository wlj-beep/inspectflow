import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";
import {
  createTestSession,
  cleanupTestUsers
} from "./helpers/sessionFixtures.js";

const trackedUserIds = [];
const trackedNcrIds = [];

vi.setConfig({ testTimeout: 20000 });

async function createNcrSession(role) {
  const session = await createTestSession(role);
  trackedUserIds.push(session.userId);
  return session;
}

afterEach(async () => {
  // Remove NCRs (audit log cascades via FK if desired, but we delete explicitly)
  for (const id of trackedNcrIds) {
    await query("DELETE FROM ncr_audit_log WHERE ncr_id = $1", [id]).catch(() => {});
    await query("DELETE FROM nonconformances WHERE id = $1", [id]).catch(() => {});
  }
  trackedNcrIds.length = 0;
  await cleanupTestUsers(trackedUserIds);
});

describe("NCR workflow — BL-108", () => {
  it("GET /dispositions returns supported disposition values", async () => {
    const { cookie } = await createNcrSession("Quality");
    const res = await request(app)
      .get("/api/ncr/dispositions")
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.dispositions)).toBe(true);
    const values = res.body.dispositions.map((item) => item.value);
    expect(values).toContain("use_as_is");
    expect(values).toContain("rework");
    expect(values).toContain("reject");
    expect(values).toContain("scrap");
    expect(values).toContain("return");
  });

  it("returns 401 when unauthenticated tries to create NCR", async () => {
    const res = await request(app)
      .post("/api/ncr")
      .send({ title: "Test NCR" });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("returns 403 when Operator tries to create NCR", async () => {
    const { cookie } = await createNcrSession("Operator");
    const res = await request(app)
      .post("/api/ncr")
      .set("Cookie", cookie)
      .send({ title: "Operator NCR attempt" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "forbidden" });
  });

  it("creates NCR with status=open (201) as Quality user", async () => {
    const { cookie } = await createNcrSession("Quality");
    const res = await request(app)
      .post("/api/ncr")
      .set("Cookie", cookie)
      .send({ title: "Dimensional OOT on P/N 12345", description: "Dia. exceeds spec" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: "Dimensional OOT on P/N 12345",
      status: "open"
    });
    trackedNcrIds.push(res.body.id);
  });

  it("returns 400 when title is missing", async () => {
    const { cookie } = await createNcrSession("Quality");
    const res = await request(app)
      .post("/api/ncr")
      .set("Cookie", cookie)
      .send({ description: "Missing title" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "title_required" });
  });

  it("returns 422 for invalid transition (open → dispositioned, skipping pending_disposition)", async () => {
    const { cookie } = await createNcrSession("Quality");
    const create = await request(app)
      .post("/api/ncr")
      .set("Cookie", cookie)
      .send({ title: "Invalid transition NCR" });
    expect(create.status).toBe(201);
    const ncrId = create.body.id;
    trackedNcrIds.push(ncrId);

    const res = await request(app)
      .post(`/api/ncr/${ncrId}/disposition`)
      .set("Cookie", cookie)
      .send({ disposition: "scrap" });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: "invalid_ncr_transition" });
  });

  it("returns 422 when trying to close an open NCR directly (skipping dispositioned)", async () => {
    const { cookie: qualityCookie } = await createNcrSession("Quality");
    const { cookie: adminCookie } = await createNcrSession("Admin");

    const create = await request(app)
      .post("/api/ncr")
      .set("Cookie", qualityCookie)
      .send({ title: "Cannot close open NCR" });
    expect(create.status).toBe(201);
    const ncrId = create.body.id;
    trackedNcrIds.push(ncrId);

    const closeRes = await request(app)
      .post(`/api/ncr/${ncrId}/close`)
      .set("Cookie", adminCookie);
    expect(closeRes.status).toBe(422);
    expect(closeRes.body).toMatchObject({ error: "invalid_ncr_transition" });
  });

  it("walks the full state machine: open → pending_disposition → dispositioned → closed with audit trail", async () => {
    const { cookie: qualityCookie } = await createNcrSession("Quality");
    const { cookie: adminCookie } = await createNcrSession("Admin");

    // Create
    const create = await request(app)
      .post("/api/ncr")
      .set("Cookie", qualityCookie)
      .send({ title: "Full walk NCR", description: "Test full walk" });
    expect(create.status).toBe(201);
    expect(create.body.status).toBe("open");
    const ncrId = create.body.id;
    trackedNcrIds.push(ncrId);

    // Transition: open → pending_disposition
    const pendRes = await request(app)
      .post(`/api/ncr/${ncrId}/pending-disposition`)
      .set("Cookie", qualityCookie);
    expect(pendRes.status).toBe(200);
    expect(pendRes.body.status).toBe("pending_disposition");

    // Transition: pending_disposition → dispositioned
    const dispRes = await request(app)
      .post(`/api/ncr/${ncrId}/disposition`)
      .set("Cookie", qualityCookie)
      .send({ disposition: "rework", notes: "Minor rework required" });
    expect(dispRes.status).toBe(200);
    expect(dispRes.body.status).toBe("dispositioned");
    expect(dispRes.body.disposition).toBe("rework");
    expect(dispRes.body.disposition_notes).toBe("Minor rework required");

    // Transition: dispositioned → closed (Admin only)
    const closeRes = await request(app)
      .post(`/api/ncr/${ncrId}/close`)
      .set("Cookie", adminCookie);
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.status).toBe("closed");
    expect(closeRes.body.closed_at).toBeTruthy();

    // Verify audit log populated at each transition
    const getRes = await request(app)
      .get(`/api/ncr/${ncrId}`)
      .set("Cookie", adminCookie);
    expect(getRes.status).toBe(200);
    expect(getRes.body.status).toBe("closed");

    const auditLog = getRes.body.auditLog;
    expect(Array.isArray(auditLog)).toBe(true);
    expect(auditLog).toHaveLength(4); // created, pending_disposition, dispositioned, closed

    expect(auditLog[0]).toMatchObject({ event_type: "ncr_created", to_status: "open" });
    expect(auditLog[1]).toMatchObject({
      event_type: "ncr_pending_disposition",
      from_status: "open",
      to_status: "pending_disposition"
    });
    expect(auditLog[2]).toMatchObject({
      event_type: "ncr_dispositioned",
      from_status: "pending_disposition",
      to_status: "dispositioned"
    });
    expect(auditLog[3]).toMatchObject({
      event_type: "ncr_closed",
      from_status: "dispositioned",
      to_status: "closed"
    });
  });

  it("returns 403 when Operator tries to disposition an NCR", async () => {
    const { cookie: qualityCookie } = await createNcrSession("Quality");
    const { cookie: operatorCookie } = await createNcrSession("Operator");

    const create = await request(app)
      .post("/api/ncr")
      .set("Cookie", qualityCookie)
      .send({ title: "Operator disposition attempt" });
    expect(create.status).toBe(201);
    const ncrId = create.body.id;
    trackedNcrIds.push(ncrId);

    // Move to pending_disposition first
    await request(app)
      .post(`/api/ncr/${ncrId}/pending-disposition`)
      .set("Cookie", qualityCookie);

    // Operator tries to disposition — must be forbidden
    const dispRes = await request(app)
      .post(`/api/ncr/${ncrId}/disposition`)
      .set("Cookie", operatorCookie)
      .send({ disposition: "scrap" });
    expect(dispRes.status).toBe(403);
    expect(dispRes.body).toMatchObject({ error: "forbidden" });
  });

  it("returns 403 when Quality user tries to close (Admin only)", async () => {
    const { cookie: qualityCookie } = await createNcrSession("Quality");

    const create = await request(app)
      .post("/api/ncr")
      .set("Cookie", qualityCookie)
      .send({ title: "Quality cannot close" });
    expect(create.status).toBe(201);
    const ncrId = create.body.id;
    trackedNcrIds.push(ncrId);

    // Walk to dispositioned
    await request(app)
      .post(`/api/ncr/${ncrId}/pending-disposition`)
      .set("Cookie", qualityCookie);
    await request(app)
      .post(`/api/ncr/${ncrId}/disposition`)
      .set("Cookie", qualityCookie)
      .send({ disposition: "use_as_is" });

    // Quality tries to close
    const closeRes = await request(app)
      .post(`/api/ncr/${ncrId}/close`)
      .set("Cookie", qualityCookie);
    expect(closeRes.status).toBe(403);
    expect(closeRes.body).toMatchObject({ error: "forbidden" });
  });

  it("allows Supervisor to void an active NCR with audit trail", async () => {
    const { cookie: qualityCookie } = await createNcrSession("Quality");
    const { cookie: supervisorCookie } = await createNcrSession("Supervisor");

    const create = await request(app)
      .post("/api/ncr")
      .set("Cookie", qualityCookie)
      .send({ title: "Supervisor void flow" });
    expect(create.status).toBe(201);
    const ncrId = create.body.id;
    trackedNcrIds.push(ncrId);

    const voidRes = await request(app)
      .post(`/api/ncr/${ncrId}/void`)
      .set("Cookie", supervisorCookie)
      .send({ reason: "Duplicate NCR opened in error" });
    expect(voidRes.status).toBe(200);
    expect(voidRes.body).toMatchObject({
      status: "closed",
      disposition: "void",
      disposition_notes: "Duplicate NCR opened in error"
    });

    const getRes = await request(app)
      .get(`/api/ncr/${ncrId}`)
      .set("Cookie", supervisorCookie);
    expect(getRes.status).toBe(200);
    expect(Array.isArray(getRes.body.auditLog)).toBe(true);
    const lastEvent = getRes.body.auditLog[getRes.body.auditLog.length - 1];
    expect(lastEvent).toMatchObject({
      event_type: "ncr_voided",
      to_status: "closed"
    });
  });

  it("GET / lists NCRs with pagination", async () => {
    const { cookie } = await createNcrSession("Admin");

    const c1 = await request(app)
      .post("/api/ncr")
      .set("Cookie", cookie)
      .send({ title: "List NCR 1" });
    const c2 = await request(app)
      .post("/api/ncr")
      .set("Cookie", cookie)
      .send({ title: "List NCR 2" });
    expect(c1.status).toBe(201);
    expect(c2.status).toBe(201);
    trackedNcrIds.push(c1.body.id, c2.body.id);

    const res = await request(app)
      .get("/api/ncr?page=1&pageSize=10")
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ncrs");
    expect(Array.isArray(res.body.ncrs)).toBe(true);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(10);
  });
});
