import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

async function login(agent, username, password = "inspectflow") {
  return agent.post("/api/auth/login").send({ username, password });
}

async function resetAuthEntitlementBaseline() {
  await query(
    `UPDATE platform_entitlements
     SET seat_pack=25,
         seat_soft_limit=25,
         seat_policy='{"mode":"soft","enforced":false,"hardLimit":0,"namedUsers":[],"allowedDevices":[]}'::jsonb,
         module_flags='{"CORE":true,"QUALITY_PRO":false,"INTEGRATION_SUITE":false,"ANALYTICS_SUITE":false,"MULTISITE":false,"EDGE":false}'::jsonb,
         updated_at=NOW()
     WHERE id=1`
  );

  await query(
    `UPDATE auth_local_credentials
     SET failed_attempts=0,
         locked_until=NULL
     WHERE user_id IN (
       SELECT id
       FROM users
       WHERE name IN ('S. Admin', 'J. Morris')
     )`
  );
}

async function loginAdmin(agent) {
  await resetAuthEntitlementBaseline();

  const primary = await login(agent, "S. Admin", "inspectflow");
  if (primary.status === 200) return primary;
  const fallback = await login(agent, "S. Admin", "inspectflow-v2");
  if (fallback.status === 200) return fallback;
  return primary;
}

describe("Auth route contracts (BL-029)", () => {
  beforeEach(async () => {
    await resetAuthEntitlementBaseline();
  });

  afterEach(() => {
    delete process.env.ALLOW_LEGACY_ROLE_HEADER;
  });

  it("returns PLAT-ENT-v1 and COMM-SEAT-v1 contract payloads across login/session/me", async () => {
    const agent = request.agent(app);
    const loginRes = await login(agent, "J. Morris");
    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toMatchObject({
      ok: true,
      user: { name: "J. Morris", role: "Operator" },
      entitlements: { contractId: "PLAT-ENT-v1" },
      seatUsage: {
        contractId: "COMM-SEAT-v1",
        entitlementContractId: "PLAT-ENT-v1"
      }
    });

    const sessionRes = await agent.get("/api/auth/session");
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body.valid).toBe(true);
    expect(sessionRes.body.entitlements?.contractId).toBe("PLAT-ENT-v1");
    expect(sessionRes.body.seatUsage?.contractId).toBe("COMM-SEAT-v1");

    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.user).toMatchObject({ name: "J. Morris", role: "Operator" });
    expect(meRes.body.entitlements?.contractId).toBe("PLAT-ENT-v1");
    expect(meRes.body.seatUsage?.contractId).toBe("COMM-SEAT-v1");
  });

  it("enforces admin-only seat snapshot and returns COMM-SEAT-v1 payload", async () => {
    const operator = request.agent(app);
    const opLogin = await login(operator, "J. Morris");
    expect(opLogin.status).toBe(200);

    const opSeats = await operator.get("/api/auth/seats");
    expect(opSeats.status).toBe(403);
    expect(opSeats.body).toMatchObject({ error: "forbidden" });

    const admin = request.agent(app);
    const adminLogin = await loginAdmin(admin);
    expect(adminLogin.status).toBe(200);

    const adminSeats = await admin.get("/api/auth/seats");
    expect(adminSeats.status).toBe(200);
    expect(adminSeats.body).toMatchObject({
      contractId: "COMM-SEAT-v1",
      entitlementContractId: "PLAT-ENT-v1"
    });
    expect(typeof adminSeats.body.activeUsers).toBe("number");
    expect(typeof adminSeats.body.activeSessions).toBe("number");
  });

  it("returns PLAT-AUTH-v1 event feed contract and supports event-type filtering", async () => {
    const admin = request.agent(app);
    const loginRes = await loginAdmin(admin);
    expect(loginRes.status).toBe(200);

    const events = await admin
      .get("/api/auth/events")
      .query({ eventType: "login_success", limit: 10 });
    expect(events.status).toBe(200);
    expect(events.body.contractId).toBe("PLAT-AUTH-v1");
    expect(Array.isArray(events.body.events)).toBe(true);
    expect(events.body.count).toBeGreaterThan(0);
    expect(events.body.events.every((event) => event.event_type === "login_success")).toBe(true);
  });
});
