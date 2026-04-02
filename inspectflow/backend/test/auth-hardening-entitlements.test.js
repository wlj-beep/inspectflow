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

async function findLatestActiveSessionId(userId) {
  const { rows } = await query(
    `SELECT id
     FROM auth_sessions
     WHERE user_id=$1 AND revoked_at IS NULL
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [userId]
  );
  return rows[0]?.id ? Number(rows[0].id) : null;
}

async function countLogoutEventsForSession(userId, sessionId) {
  const { rows } = await query(
    `SELECT COUNT(*)::INT AS count
     FROM auth_event_log
     WHERE event_type='logout' AND user_id=$1 AND session_id=$2`,
    [userId, sessionId]
  );
  return Number(rows[0]?.count || 0);
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
  seatPolicyOptionId: "soft_visibility",
  hardSeatEnabled: false,
  directoryAuthEnabled: false,
  directoryAuthMode: "local",
  directoryAuthLabel: null,
  directoryAuthIssuer: null,
  directoryAuthTenant: null,
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

  it("does not expose a pre-auth auth user directory and requires username-based login", async () => {
    const authUsers = await request(app).get("/api/auth/users");
    expect(authUsers.status).toBe(404);

    const loginWithUserId = await request(app)
      .post("/api/auth/login")
      .send({ userId: 1, password: "inspectflow" });
    expect(loginWithUserId.status).toBe(400);
    expect(loginWithUserId.body).toMatchObject({ error: "username_required" });
  });

  it("records logout events for authenticated sessions", async () => {
    const actor = await loginAdminAgent();
    const me = await actor.get("/api/auth/me");
    expect(me.status).toBe(200);
    const userId = me.body.user.id;
    const sessionId = await findLatestActiveSessionId(userId);
    expect(sessionId).toBeTruthy();

    const beforeCount = await countLogoutEventsForSession(userId, sessionId);

    const logout = await actor.post("/api/auth/logout");
    expect(logout.status).toBe(200);

    const afterCount = await countLogoutEventsForSession(userId, sessionId);
    expect(afterCount).toBe(beforeCount + 1);

    const { rows } = await query(
      `SELECT event_type, user_id, metadata
       FROM auth_event_log
       WHERE event_type='logout' AND user_id=$1 AND session_id=$2
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [userId, sessionId]
    );
    expect(rows[0]).toMatchObject({
      event_type: "logout",
      user_id: userId,
      metadata: { reason: "logout" }
    });
  });

  it("exposes the auth profile and enforces hard named-seat capacity", async () => {
    const admin = await loginAdminAgent();

    const profile = await admin.get("/api/auth/profile");
    expect(profile.status).toBe(200);
    expect(profile.body).toMatchObject({
      contractId: "PLAT-AUTH-v1",
      localAccountMode: true,
      directoryEnabled: false,
      mode: "local",
      providerLabel: "Local Accounts"
    });

    const enableHardSeats = await admin
      .put("/api/auth/entitlements")
      .send({
        seatPack: 1,
        seatSoftLimit: 1,
        seatPolicyOptionId: "named_seat",
        hardSeatEnabled: true,
        directoryAuthEnabled: true,
        directoryAuthMode: "hybrid",
        directoryAuthLabel: "Azure AD"
      });
    expect(enableHardSeats.status).toBe(200);
    expect(enableHardSeats.body.packaging).toMatchObject({
      hardSeatEnabled: true,
      authProfile: {
        directoryEnabled: true,
        mode: "hybrid",
        providerLabel: "Azure AD"
      },
      seatPolicy: {
        optionId: "named_seat",
        allocationMode: "named",
        hardSeatEnabled: true
      }
    });

    await admin.post("/api/auth/logout");
    const relogin = await login(admin, "S. Admin", "inspectflow");
    expect(relogin.status).toBe(200);
    expect(relogin.body.seatAssignment).toMatchObject({
      seatMode: "named",
      seatKey: expect.stringContaining("user:")
    });

    const blockedUser = request.agent(app);
    await resetUserPassword("A. Vasquez", "inspectflow");
    await unlockUser("A. Vasquez");
    const blockedLogin = await login(blockedUser, "A. Vasquez", "inspectflow");
    expect(blockedLogin.status).toBe(409);
    expect(blockedLogin.body).toMatchObject({ error: "seat_limit_reached" });

    await admin.put("/api/auth/entitlements").send(DEFAULT_ENTITLEMENTS);
    await admin.post("/api/auth/logout");
  });

  it("surfaces soft seat warnings in session state and audit logs without blocking login", async () => {
    const admin = await loginAdminAgent();

    const enableSoftSeatWarnings = await admin
      .put("/api/auth/entitlements")
      .send({
        seatPack: 5000,
        seatSoftLimit: 1,
        seatPolicyOptionId: "soft_buffer",
        hardSeatEnabled: false
      });
    expect(enableSoftSeatWarnings.status).toBe(200);
    expect(enableSoftSeatWarnings.body.packaging.seatPolicy).toMatchObject({
      optionId: "soft_buffer",
      warningThreshold: 1,
      contractId: "COMM-SEAT-v1",
      seatPack: 5000
    });

    const session = await admin.get("/api/auth/session");
    expect(session.status).toBe(200);
    expect(session.body.seatWarning).toMatchObject({
      contractId: "COMM-SEAT-v1",
      status: "warning",
      warningThreshold: 1,
      seatPack: 5000,
      auditable: true
    });

    const loginRes = await admin.post("/api/auth/logout");
    expect(loginRes.status).toBe(200);

    const relogin = await login(admin, "S. Admin", "inspectflow");
    expect(relogin.status).toBe(200);
    expect(relogin.body.seatWarning).toMatchObject({
      contractId: "COMM-SEAT-v1",
      status: "warning",
      warningThreshold: 1,
      seatPack: 5000
    });

    const audit = await admin
      .get("/api/auth/events")
      .query({ eventType: "seat_warning", limit: 10 });
    expect(audit.status).toBe(200);
    expect(audit.body.count).toBeGreaterThan(0);

    await admin.put("/api/auth/entitlements").send(DEFAULT_ENTITLEMENTS);
    await admin.post("/api/auth/logout");
  });

  it("exposes and updates PLAT-ENT-v1 contract", async () => {
    const admin = await loginAdminAgent();

    const current = await admin.get("/api/auth/entitlements");
    expect(current.status).toBe(200);
    expect(current.body.contractId).toBe("PLAT-ENT-v1");
    expect(current.body.moduleFlags).toMatchObject(DEFAULT_ENTITLEMENTS.moduleFlags);
    expect(current.body.packaging).toMatchObject({
      contractId: "COMM-PACKAGING-v1",
      licenseContractId: "COMM-LICENSE-v1",
      currentLicenseTier: "core"
    });
    expect(current.body.packaging.activeBundleIds).toEqual(["core_site"]);
    expect(current.body.packaging.seatPolicy).toMatchObject({
      optionId: "soft_visibility",
      contractId: "COMM-SEAT-v1",
      warningThreshold: 25
    });
    expect(current.body.packaging.bundleCatalog.map((bundle) => bundle.bundleId)).toEqual(
      expect.arrayContaining(["core_site", "quality_pro", "integration_suite", "analytics_suite", "multisite", "edge"])
    );
    expect(current.body.packaging.upgradePrompts.map((prompt) => prompt.promptId)).toEqual(
      expect.arrayContaining(["upgrade_quality_pro", "upgrade_integration_suite", "upgrade_analytics_suite"])
    );

    const updatedPayload = {
      licenseTier: "core_plus",
      seatPack: 30,
      seatSoftLimit: 28,
      diagnosticsOptIn: true,
      packaging: {
        bundleIds: ["quality_pro", "analytics_suite"],
        seatPolicyOptionId: "soft_buffer"
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
    expect(updated.body.moduleFlags).toMatchObject({
      CORE: true,
      QUALITY_PRO: true,
      INTEGRATION_SUITE: false,
      ANALYTICS_SUITE: true,
      MULTISITE: false,
      EDGE: false
    });
    expect(updated.body.packaging).toMatchObject({
      contractId: "COMM-PACKAGING-v1",
      currentLicenseTier: "core_plus"
    });
    expect(updated.body.packaging.activeBundleIds).toEqual(
      expect.arrayContaining(["core_site", "quality_pro", "analytics_suite"])
    );
    expect(updated.body.packaging.seatPolicy).toMatchObject({
      optionId: "soft_buffer",
      contractId: "COMM-SEAT-v1",
      warningThreshold: 28
    });
    expect(updated.body.packaging.upgradePrompts.map((prompt) => prompt.promptId)).not.toContain("upgrade_quality_pro");
    expect(updated.body.packaging.upgradePrompts.map((prompt) => prompt.promptId)).not.toContain("upgrade_analytics_suite");
    expect(updated.body.packaging.upgradePrompts.map((prompt) => prompt.promptId)).toEqual(
      expect.arrayContaining(["upgrade_integration_suite", "upgrade_multisite"])
    );

    const readBack = await admin.get("/api/auth/entitlements");
    expect(readBack.status).toBe(200);
    expect(readBack.body.moduleFlags).toMatchObject({
      CORE: true,
      QUALITY_PRO: true,
      INTEGRATION_SUITE: false,
      ANALYTICS_SUITE: true,
      MULTISITE: false,
      EDGE: false
    });
    expect(readBack.body.packaging.activeBundleIds).toEqual(
      expect.arrayContaining(["core_site", "quality_pro", "analytics_suite"])
    );

    const events = await admin
      .get("/api/auth/events")
      .query({ eventType: "entitlements_updated", limit: 5 });
    expect(events.status).toBe(200);
    expect(events.body.count).toBeGreaterThan(0);
    expect(events.body.events[0]?.metadata?.contractId).toBe("PLAT-ENT-v1");
    expect(events.body.events[0]?.metadata?.packaging).toMatchObject({
      contractId: "COMM-PACKAGING-v1",
      licenseContractId: "COMM-LICENSE-v1",
      activeBundleIds: expect.arrayContaining(["core_site", "quality_pro", "analytics_suite"]),
      seatPolicy: {
        optionId: "soft_buffer",
        contractId: "COMM-SEAT-v1",
        warningThreshold: 28
      }
    });
    expect(events.body.events[0]?.metadata?.packaging?.upgradePromptIds).toEqual(
      expect.arrayContaining(["upgrade_integration_suite", "upgrade_multisite"])
    );

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
