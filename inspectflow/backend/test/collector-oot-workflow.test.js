/**
 * OOT acknowledgment queue HTTP tests (BL-120)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";
import { createTestSession, cleanupTestUsers } from "./helpers/sessionFixtures.js";

const registeredUserIds = [];
const createdOotIds = [];

async function seedOotEntry(status = "pending") {
  // Insert a minimal OOT queue entry directly for testing the workflow API
  const { rows } = await query(
    `INSERT INTO collector_oot_queue
       (job_id, dimension_id, piece_number, measured_value, nominal, tol_plus, tol_minus,
        unit, device_id, tag_address, reading_timestamp, status)
     VALUES ('J-TEST-OOT', 1, 1, 12.999, 12.000, 0.200, 0.200, 'mm', 'CNC-01', 'ns=2;s=X', NOW(), $1)
     RETURNING id`,
    [status]
  );
  const id = rows[0].id;
  createdOotIds.push(id);
  return id;
}

async function cleanupOotEntries() {
  for (const id of createdOotIds) {
    await query("DELETE FROM collector_oot_audit WHERE oot_queue_id=$1", [id]);
    await query("DELETE FROM collector_oot_queue WHERE id=$1", [id]);
  }
  createdOotIds.length = 0;
}

describe("OOT acknowledgment queue API (BL-120)", () => {
  let adminCookie;
  let qualityCookie;
  let operatorCookie;
  let adminUserId;

  beforeEach(async () => {
    const admin = await createTestSession("Admin");
    const quality = await createTestSession("Quality");
    const operator = await createTestSession("Operator");
    adminCookie = admin.cookie;
    qualityCookie = quality.cookie;
    operatorCookie = operator.cookie;
    adminUserId = admin.userId;
    registeredUserIds.push(admin.userId, quality.userId, operator.userId);
  });

  afterEach(async () => {
    await cleanupOotEntries();
    await cleanupTestUsers(registeredUserIds);
  });

  it("Unauthenticated GET /oot-queue returns 401", async () => {
    const res = await request(app).get("/api/collector/oot-queue");
    expect(res.status).toBe(401);
  });

  it("Admin can list OOT queue", async () => {
    await seedOotEntry("pending");
    const res = await request(app)
      .get("/api/collector/oot-queue?status=pending")
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("items");
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it("Operator can list OOT queue", async () => {
    const res = await request(app)
      .get("/api/collector/oot-queue")
      .set("Cookie", operatorCookie);
    expect(res.status).toBe(200);
  });

  it("Admin can acknowledge a pending OOT entry", async () => {
    const id = await seedOotEntry("pending");
    const res = await request(app)
      .post(`/api/collector/oot-queue/${id}/acknowledge`)
      .set("Cookie", adminCookie)
      .send({ note: "Reviewed and accepted" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("acknowledged");
    expect(res.body.acknowledged_by_role).toBe("Admin");
  });

  it("Audit entry is written after acknowledge", async () => {
    const id = await seedOotEntry("pending");
    await request(app)
      .post(`/api/collector/oot-queue/${id}/acknowledge`)
      .set("Cookie", adminCookie)
      .send({ note: "OK" });

    const auditRes = await request(app)
      .get(`/api/collector/oot-queue/${id}/audit`)
      .set("Cookie", adminCookie);

    expect(auditRes.status).toBe(200);
    expect(auditRes.body).toHaveLength(1);
    expect(auditRes.body[0].action).toBe("acknowledged");
    expect(auditRes.body[0].note).toBe("OK");
  });

  it("Acknowledging an already-acknowledged entry returns 409", async () => {
    const id = await seedOotEntry("pending");
    await request(app)
      .post(`/api/collector/oot-queue/${id}/acknowledge`)
      .set("Cookie", adminCookie)
      .send({});

    const second = await request(app)
      .post(`/api/collector/oot-queue/${id}/acknowledge`)
      .set("Cookie", adminCookie)
      .send({});
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("already_actioned");
  });

  it("Quality can escalate a pending OOT entry", async () => {
    const id = await seedOotEntry("pending");
    const res = await request(app)
      .post(`/api/collector/oot-queue/${id}/escalate`)
      .set("Cookie", qualityCookie)
      .send({ note: "Needs engineering review" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("escalated");
  });

  it("Audit entry is written after escalate", async () => {
    const id = await seedOotEntry("pending");
    await request(app)
      .post(`/api/collector/oot-queue/${id}/escalate`)
      .set("Cookie", qualityCookie)
      .send({ note: "Escalated" });

    const auditRes = await request(app)
      .get(`/api/collector/oot-queue/${id}/audit`)
      .set("Cookie", adminCookie);

    expect(auditRes.status).toBe(200);
    expect(auditRes.body[0].action).toBe("escalated");
  });

  it("GET oot-queue supports status filter", async () => {
    const pendingId = await seedOotEntry("pending");
    const res = await request(app)
      .get("/api/collector/oot-queue?status=acknowledged")
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    const ids = res.body.items.map((i) => i.id);
    expect(ids).not.toContain(pendingId);
  });
});
