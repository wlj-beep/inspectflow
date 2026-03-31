import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";
import { makePasswordHash } from "../src/auth.js";

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

async function resetUserPassword(name, password) {
  const userId = await findUserIdByName(name);
  if (!userId) return;
  const hashed = makePasswordHash(password);
  await query(
    `INSERT INTO auth_local_credentials
       (user_id, password_salt, password_hash, failed_attempts, locked_until, must_rotate_password)
     VALUES ($1,$2,$3,0,NULL,false)
     ON CONFLICT (user_id) DO UPDATE
       SET password_salt=EXCLUDED.password_salt,
           password_hash=EXCLUDED.password_hash,
           failed_attempts=0,
           locked_until=NULL,
           must_rotate_password=false,
           password_updated_at=NOW()`,
    [userId, hashed.salt, hashed.hash]
  );
}

async function login(agent, username, password) {
  return agent
    .post("/api/auth/login")
    .send({ username, password });
}

async function loginAdminAgent(password = "inspectflow") {
  await resetUserPassword("S. Admin", password);
  await unlockUser("S. Admin");
  const admin = request.agent(app);
  const loginRes = await login(admin, "S. Admin", password);
  expect(loginRes.status).toBe(200);
  return admin;
}

const DEFAULT_ENTITLEMENTS = {
  licenseTier: "core",
  seatPack: 25,
  seatSoftLimit: 25,
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
    await unlockUser("S. Admin");
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

  it("records logout events for authenticated sessions", async () => {
    const actor = await loginAdminAgent();
    const me = await actor.get("/api/auth/me");
    expect(me.status).toBe(200);
    const userId = me.body.user.id;

    const observer = await loginAdminAgent();
    const before = await observer
      .get("/api/auth/events")
      .query({ eventType: "logout", userId, limit: 200 });
    expect(before.status).toBe(200);

    const logout = await actor.post("/api/auth/logout");
    expect(logout.status).toBe(200);

    const after = await observer
      .get("/api/auth/events")
      .query({ eventType: "logout", userId, limit: 200 });
    expect(after.status).toBe(200);
    expect(after.body.count).toBe(before.body.count + 1);
    expect(after.body.events[0]).toMatchObject({
      event_type: "logout",
      user_id: userId,
      metadata: { reason: "logout" }
    });
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
});
