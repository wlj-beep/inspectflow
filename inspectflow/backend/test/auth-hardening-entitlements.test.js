import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

async function findUserIdByName(name) {
  const { rows } = await query("SELECT id FROM users WHERE name=$1 LIMIT 1", [name]);
  return rows[0]?.id ? Number(rows[0].id) : null;
}

async function unlockUser(name) {
  const userId = await findUserIdByName(name);
  if (!userId) return;
  await query(
    `UPDATE auth_local_credentials
     SET failed_attempts=0,
         locked_until=NULL
     WHERE user_id=$1`,
    [userId]
  );
}

async function removeUserByName(name) {
  await query("DELETE FROM users WHERE name=$1", [name]);
}

async function login(agent, username, password) {
  return agent
    .post("/api/auth/login")
    .send({ username, password });
}

async function loginAdminAgent(password = "inspectflow") {
  const admin = request.agent(app);
  const loginRes = await login(admin, "S. Admin", password);
  expect(loginRes.status).toBe(200);
  return admin;
}

const DEFAULT_ENTITLEMENTS = {
  licenseTier: "core",
  seatPack: 25,
  seatSoftLimit: 25,
  seatPolicy: {
    mode: "soft",
    enforced: false,
    hardLimit: 0,
    namedUsers: [],
    allowedDevices: []
  },
  diagnosticsOptIn: false,
  moduleFlags: {
    CORE: true,
    QUALITY_PRO: false,
    INTEGRATION_SUITE: false,
    ANALYTICS_SUITE: false,
    MULTISITE: false,
    EDGE: false
  }
};

describe("Auth hardening + entitlement contract", () => {
  afterEach(async () => {
    delete process.env.ALLOW_LEGACY_ROLE_HEADER;
    await unlockUser("A. Vasquez");
    await removeUserByName("C. HardSeat");
  });

  it("records login failure and lockout events", async () => {
    await unlockUser("A. Vasquez");

    const operator = request.agent(app);
    let lastResponse = null;
    for (let idx = 0; idx < 5; idx += 1) {
      lastResponse = await login(operator, "A. Vasquez", "wrong-password");
    }

    expect(lastResponse.status).toBe(423);
    expect(lastResponse.body).toMatchObject({ error: "account_locked" });

    const userId = await findUserIdByName("A. Vasquez");
    expect(userId).toBeTruthy();

    const admin = await loginAdminAgent();
    const locked = await admin
      .get("/api/auth/events")
      .query({ eventType: "login_locked", userId, limit: 10 });
    expect(locked.status).toBe(200);
    expect(locked.body.count).toBeGreaterThan(0);

    const failures = await admin
      .get("/api/auth/events")
      .query({ eventType: "login_failure", userId, limit: 10 });
    expect(failures.status).toBe(200);
    expect(failures.body.count).toBeGreaterThan(0);
  });

  it("exposes and updates PLAT-ENT-v1 contract", async () => {
    const admin = await loginAdminAgent();

    const current = await admin.get("/api/auth/entitlements");
    expect(current.status).toBe(200);
    expect(current.body.contractId).toBe("PLAT-ENT-v1");
    expect(current.body.moduleFlags).toMatchObject(DEFAULT_ENTITLEMENTS.moduleFlags);

    const updatedPayload = {
      licenseTier: "core_plus",
      seatPack: 30,
      seatSoftLimit: 28,
      diagnosticsOptIn: true,
      moduleFlags: {
        CORE: true,
        QUALITY_PRO: true,
        INTEGRATION_SUITE: false,
        ANALYTICS_SUITE: true,
        MULTISITE: false,
        EDGE: false
      }
    };

    const updated = await admin
      .put("/api/auth/entitlements")
      .send(updatedPayload);
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      contractId: "PLAT-ENT-v1",
      licenseTier: "core_plus",
      seatPack: 30,
      seatSoftLimit: 28,
      diagnosticsOptIn: true
    });
    expect(updated.body.moduleFlags).toMatchObject(updatedPayload.moduleFlags);

    const readBack = await admin.get("/api/auth/entitlements");
    expect(readBack.status).toBe(200);
    expect(readBack.body.moduleFlags).toMatchObject(updatedPayload.moduleFlags);

    const events = await admin
      .get("/api/auth/events")
      .query({ eventType: "entitlements_updated", limit: 5 });
    expect(events.status).toBe(200);
    expect(events.body.count).toBeGreaterThan(0);
    expect(events.body.events[0]?.metadata?.contractId).toBe("PLAT-ENT-v1");

    await admin.put("/api/auth/entitlements").send(DEFAULT_ENTITLEMENTS);
  });

  it("records password change and reset events", async () => {
    const admin = await loginAdminAgent();

    const setPassword = await admin
      .post("/api/auth/set-password")
      .send({ currentPassword: "inspectflow", nextPassword: "inspectflow-v2" });
    expect(setPassword.status).toBe(200);

    await admin.post("/api/auth/logout");

    const relogin = await login(admin, "S. Admin", "inspectflow-v2");
    expect(relogin.status).toBe(200);

    const reset = await admin.post("/api/auth/reset-default-passwords").send({});
    expect(reset.status).toBe(200);
    expect(reset.body.userCount).toBeGreaterThan(0);

    await admin.post("/api/auth/logout");

    const loginDefaultAgain = await login(admin, "S. Admin", "inspectflow");
    expect(loginDefaultAgain.status).toBe(200);

    const events = await admin
      .get("/api/auth/events")
      .query({ limit: 50 });
    expect(events.status).toBe(200);
    const eventTypes = events.body.events.map((event) => event.event_type);
    expect(eventTypes).toContain("password_changed");
    expect(eventTypes).toContain("password_reset_default");
  });

  it("surfaces soft seat usage warnings and records COMM-SEAT-v1 audit events", async () => {
    const admin = await loginAdminAgent();

    await admin.put("/api/auth/entitlements").send({
      ...DEFAULT_ENTITLEMENTS,
      seatPack: 25,
      seatSoftLimit: 1
    });

    const op1 = request.agent(app);
    const op2 = request.agent(app);

    const op1Login = await login(op1, "J. Morris", "inspectflow");
    expect(op1Login.status).toBe(200);
    expect(op1Login.body.seatUsage?.contractId).toBe("COMM-SEAT-v1");
    expect(op1Login.body.seatUsage?.softLimitWarning).toBe(true);

    const op2Login = await login(op2, "R. Tatum", "inspectflow");
    expect(op2Login.status).toBe(200);
    expect(op2Login.body.seatUsage?.softLimitWarning).toBe(true);
    expect(op2Login.body.seatUsage?.softLimitExceeded).toBe(true);
    expect(Number(op2Login.body.seatUsage?.activeUsers || 0)).toBeGreaterThanOrEqual(2);

    const seats = await admin.get("/api/auth/seats");
    expect(seats.status).toBe(200);
    expect(seats.body).toMatchObject({
      contractId: "COMM-SEAT-v1",
      entitlementContractId: "PLAT-ENT-v1",
      seatSoftLimit: 1,
      softLimitWarning: true
    });

    const seatEvents = await admin
      .get("/api/auth/events")
      .query({ eventType: "seat_soft_limit_warning", limit: 10 });
    expect(seatEvents.status).toBe(200);
    expect(seatEvents.body.count).toBeGreaterThan(0);
    expect(seatEvents.body.events[0]?.metadata?.contractId).toBe("COMM-SEAT-v1");

    await admin.put("/api/auth/entitlements").send(DEFAULT_ENTITLEMENTS);
  });

  it("enforces COMM-SEAT-v2 named/device/concurrent hard-seat modes behind entitlement flags", async () => {
    const admin = await loginAdminAgent();
    const hardSeatModuleFlags = {
      ...DEFAULT_ENTITLEMENTS.moduleFlags,
      QUALITY_PRO: true
    };

    await admin.put("/api/auth/entitlements").send({
      ...DEFAULT_ENTITLEMENTS,
      moduleFlags: hardSeatModuleFlags,
      seatPolicy: {
        mode: "named",
        enforced: true,
        hardLimit: 0,
        namedUsers: ["J. Morris"],
        allowedDevices: []
      }
    });

    const namedAllowed = await login(request.agent(app), "J. Morris", "inspectflow");
    expect(namedAllowed.status).toBe(200);
    const namedBlocked = await login(request.agent(app), "R. Tatum", "inspectflow");
    expect(namedBlocked.status).toBe(403);
    expect(namedBlocked.body).toMatchObject({ error: "seat_user_not_entitled" });

    await admin.put("/api/auth/entitlements").send({
      ...DEFAULT_ENTITLEMENTS,
      moduleFlags: hardSeatModuleFlags,
      seatPolicy: {
        mode: "device",
        enforced: true,
        hardLimit: 0,
        namedUsers: [],
        allowedDevices: ["bench-1"]
      }
    });

    const deviceAllowed = await request(app)
      .post("/api/auth/login")
      .send({ username: "J. Morris", password: "inspectflow", deviceId: "bench-1" });
    expect(deviceAllowed.status).toBe(200);
    const deviceBlocked = await request(app)
      .post("/api/auth/login")
      .send({ username: "J. Morris", password: "inspectflow", deviceId: "bench-9" });
    expect(deviceBlocked.status).toBe(403);
    expect(deviceBlocked.body).toMatchObject({ error: "seat_device_not_entitled" });

    const created = await admin
      .post("/api/users")
      .send({ name: "C. HardSeat", role: "Operator", password: "inspectflow" });
    expect(created.status).toBe(201);

    await admin.put("/api/auth/entitlements").send({
      ...DEFAULT_ENTITLEMENTS,
      moduleFlags: hardSeatModuleFlags,
      seatPolicy: {
        mode: "concurrent",
        enforced: true,
        hardLimit: 1,
        namedUsers: [],
        allowedDevices: []
      }
    });

    const concurrentBlocked = await login(request.agent(app), "C. HardSeat", "inspectflow");
    expect(concurrentBlocked.status).toBe(403);
    expect(concurrentBlocked.body).toMatchObject({ error: "seat_concurrent_limit_reached" });

    const events = await admin
      .get("/api/auth/events")
      .query({ eventType: "seat_hard_limit_block", limit: 20 });
    expect(events.status).toBe(200);
    expect(events.body.count).toBeGreaterThan(0);
    expect(["named", "device", "concurrent"]).toContain(events.body.events[0]?.metadata?.mode);

    await admin.put("/api/auth/entitlements").send(DEFAULT_ENTITLEMENTS);
  });
});
