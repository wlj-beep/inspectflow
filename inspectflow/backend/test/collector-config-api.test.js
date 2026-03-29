/**
 * Collector configuration and tag mapping HTTP tests (BL-120)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";
import { createTestSession, cleanupTestUsers } from "./helpers/sessionFixtures.js";

const registeredUserIds = [];
const createdConfigIds = [];

async function cleanupConfigs() {
  for (const id of createdConfigIds) {
    await query("DELETE FROM collector_tag_mappings WHERE collector_id=$1", [id]);
    await query("DELETE FROM collector_configurations WHERE id=$1", [id]);
  }
  createdConfigIds.length = 0;
}

describe("Collector config API (BL-120)", () => {
  let adminCookie;
  let operatorCookie;

  beforeEach(async () => {
    const admin = await createTestSession("Admin");
    const operator = await createTestSession("Operator");
    adminCookie = admin.cookie;
    operatorCookie = operator.cookie;
    registeredUserIds.push(admin.userId, operator.userId);
  });

  afterEach(async () => {
    await cleanupConfigs();
    await cleanupTestUsers(registeredUserIds);
  });

  it("Admin can create a collector config", async () => {
    const res = await request(app)
      .post("/api/collector/configs")
      .set("Cookie", adminCookie)
      .send({ name: `test-opc-${Date.now()}`, sourceProtocol: "opc_ua" });

    expect(res.status).toBe(201);
    expect(res.body.source_protocol).toBe("opc_ua");
    expect(res.body.enabled).toBe(true);
    createdConfigIds.push(res.body.id);
  });

  it("Operator cannot create a collector config (403)", async () => {
    const res = await request(app)
      .post("/api/collector/configs")
      .set("Cookie", operatorCookie)
      .send({ name: `test-opc-${Date.now()}`, sourceProtocol: "opc_ua" });
    expect(res.status).toBe(403);
  });

  it("Unauthenticated request returns 401", async () => {
    const res = await request(app).get("/api/collector/configs");
    expect(res.status).toBe(401);
  });

  it("Invalid protocol returns 400 with supported list", async () => {
    const res = await request(app)
      .post("/api/collector/configs")
      .set("Cookie", adminCookie)
      .send({ name: `test-bad-${Date.now()}`, sourceProtocol: "zigbee" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("unsupported_protocol");
    expect(res.body.supported).toContain("opc_ua");
  });

  it("Duplicate name returns 409", async () => {
    const name = `dup-${Date.now()}`;
    const r1 = await request(app)
      .post("/api/collector/configs")
      .set("Cookie", adminCookie)
      .send({ name, sourceProtocol: "mqtt" });
    expect(r1.status).toBe(201);
    createdConfigIds.push(r1.body.id);

    const r2 = await request(app)
      .post("/api/collector/configs")
      .set("Cookie", adminCookie)
      .send({ name, sourceProtocol: "mqtt" });
    expect(r2.status).toBe(409);
  });

  it("connection_options with secret key is redacted in GET response", async () => {
    const r = await request(app)
      .post("/api/collector/configs")
      .set("Cookie", adminCookie)
      .send({
        name: `sec-test-${Date.now()}`,
        sourceProtocol: "mqtt",
        connectionOptions: { host: "broker.example.com", password: "s3cr3t" }
      });
    expect(r.status).toBe(201);
    createdConfigIds.push(r.body.id);

    const list = await request(app)
      .get("/api/collector/configs")
      .set("Cookie", adminCookie);
    const found = list.body.find((c) => c.id === r.body.id);
    expect(found).toBeTruthy();
    expect(found.connection_options.password).toBe("[REDACTED]");
    expect(found.connection_options.host).toBe("broker.example.com");
  });

  it("Admin can enable/disable via PATCH", async () => {
    const r = await request(app)
      .post("/api/collector/configs")
      .set("Cookie", adminCookie)
      .send({ name: `toggle-${Date.now()}`, sourceProtocol: "tcp", enabled: true });
    expect(r.status).toBe(201);
    createdConfigIds.push(r.body.id);

    const patch = await request(app)
      .patch(`/api/collector/configs/${r.body.id}/enabled`)
      .set("Cookie", adminCookie)
      .send({ enabled: false });
    expect(patch.status).toBe(200);
    expect(patch.body.enabled).toBe(false);
  });

  it("Admin can add a tag mapping (requires valid dim + job)", async () => {
    // Find first seeded job and dimension
    const jobRes = await query("SELECT id FROM jobs LIMIT 1");
    const dimRes = await query("SELECT d.id FROM dimensions d LIMIT 1");
    if (!jobRes.rows[0] || !dimRes.rows[0]) return; // skip if no seed data

    const r = await request(app)
      .post("/api/collector/configs")
      .set("Cookie", adminCookie)
      .send({ name: `mapping-test-${Date.now()}`, sourceProtocol: "opc_ua" });
    expect(r.status).toBe(201);
    createdConfigIds.push(r.body.id);

    const mapRes = await request(app)
      .post(`/api/collector/configs/${r.body.id}/tag-mappings`)
      .set("Cookie", adminCookie)
      .send({
        deviceId: "CNC-01",
        tagAddress: "ns=2;s=BoreDia",
        dimensionId: dimRes.rows[0].id,
        jobId: jobRes.rows[0].id,
        pieceNumber: 1
      });
    expect(mapRes.status).toBe(201);
    expect(mapRes.body.device_id).toBe("CNC-01");
  });
});
