import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";
import { makePasswordHash } from "../src/auth.js";

const TEST_PASSWORD = "inspectflow";
const ROTATED_PASSWORD = "Inspectflow2!";
const createdUserIds = [];

function nextTestUsername(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createIsolatedUser(role, prefix, { mustRotatePassword = false } = {}) {
  const name = nextTestUsername(prefix);
  const inserted = await query(
    "INSERT INTO users (name, role, active) VALUES ($1,$2,true) RETURNING id, name, role",
    [name, role]
  );
  const user = inserted.rows[0];
  const hash = makePasswordHash(TEST_PASSWORD);
  await query(
    `INSERT INTO auth_local_credentials
       (user_id, password_salt, password_hash, failed_attempts, locked_until, must_rotate_password)
     VALUES ($1,$2,$3,0,NULL,false)`,
    [user.id, hash.salt, hash.hash]
  );
  if (mustRotatePassword) {
    await query(
      `UPDATE auth_local_credentials
       SET must_rotate_password=true
       WHERE user_id=$1`,
      [user.id]
    );
  }
  createdUserIds.push(Number(user.id));
  return user;
}

describe("Auth/session foundation", () => {
  afterEach(async () => {
    delete process.env.AUTH_LOGIN_RATE_LIMIT_MAX;
    delete process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS;
    delete process.env.AUTH_PASSWORD_ROTATION_TOKEN_TTL_MS;
    delete process.env.AUTH_SSO_ENABLED;
    delete process.env.SSO_PROXY_SECRET;
    delete process.env.AUTH_SSO_PROXY_SECRET;
    delete process.env.SSO_PROXY_SECRET_HEADER;
    delete process.env.AUTH_SSO_PROXY_SECRET_HEADER;
    delete process.env.ALLOW_LEGACY_ROLE_HEADER;
    while (createdUserIds.length > 0) {
      const userId = createdUserIds.pop();
      // Hard-delete test users to prevent orphaned row accumulation (RV-037).
      // auth_local_credentials rows are removed first to satisfy the FK constraint.
      await query("DELETE FROM auth_local_credentials WHERE user_id=$1", [userId]);
      await query("DELETE FROM auth_sessions WHERE user_id=$1", [userId]);
      await query("DELETE FROM users WHERE id=$1", [userId]);
    }
  });

  it("rejects role-header trust when compatibility mode is disabled", async () => {
    process.env.ALLOW_LEGACY_ROLE_HEADER = "false";
    const res = await request(app)
      .get("/api/users")
      .set("x-user-role", "Admin");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("supports login, me, and logout session lifecycle", async () => {
    const adminUser = await createIsolatedUser("Admin", "Auth Admin");
    const agent = request.agent(app);

    const login = await agent
      .post("/api/auth/login")
      .send({ username: adminUser.name, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ name: adminUser.name, role: "Admin" });

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ name: adminUser.name, role: "Admin" });

    const users = await agent.get("/api/users");
    expect(users.status).toBe(200);
    expect(Array.isArray(users.body)).toBe(true);

    const logout = await agent.post("/api/auth/logout");
    expect(logout.status).toBe(200);
    expect(logout.body).toMatchObject({ ok: true });
    expect(logout.headers["set-cookie"]?.[0]).toMatch(/inspectflow_session=;/);
    expect(logout.headers["set-cookie"]?.[0]).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT/);

    const afterLogout = await agent.get("/api/auth/me");
    expect(afterLogout.status).toBe(401);
    expect(afterLogout.body).toMatchObject({ error: "unauthenticated" });
  });

  it("requires password rotation before issuing a normal session when flagged", async () => {
    const user = await createIsolatedUser("Operator", "Auth Rotate", { mustRotatePassword: true });
    const agent = request.agent(app);

    const login = await agent
      .post("/api/auth/login")
      .send({ username: user.name, password: TEST_PASSWORD });

    expect(login.status).toBe(202);
    expect(login.body).toMatchObject({
      ok: true,
      action: "password_rotation_required",
      rotatePath: "/api/auth/rotate-password",
      mustRotatePassword: true,
      user: { name: user.name, role: "Operator" }
    });
    expect(login.headers["set-cookie"]?.[0]).toMatch(/inspectflow_session=;/);
    expect(login.body.rotationToken).toBeTruthy();
    const pendingSessions = await query(
      "SELECT COUNT(*)::int AS count FROM auth_sessions WHERE user_id = $1 AND revoked_at IS NULL",
      [user.id]
    );
    expect(pendingSessions.rows[0].count).toBe(0);

    const rotate = await agent
      .post("/api/auth/rotate-password")
      .send({
        rotationToken: login.body.rotationToken,
        nextPassword: ROTATED_PASSWORD
      });
    expect(rotate.status).toBe(200);
    expect(rotate.body.user).toMatchObject({ name: user.name, role: "Operator" });

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ name: user.name, role: "Operator" });
  });

  it("applies security headers and rate limits repeated login attempts", async () => {
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "2";
    process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS = "60000";

    const user = await createIsolatedUser("Operator", "Auth Rate Limit");
    const agent = request.agent(app);

    const first = await agent
      .post("/api/auth/login")
      .send({ username: user.name, password: "wrong-password" });
    expect(first.status).toBe(401);

    const second = await agent
      .post("/api/auth/login")
      .send({ username: user.name, password: "wrong-password" });
    expect(second.status).toBe(401);

    const limited = await agent
      .post("/api/auth/login")
      .send({ username: user.name, password: "wrong-password" });
    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
    // The IP-keyed loginRateLimitMiddleware fires before the per-username limiter
    // in the route handler, so the first 429 carries "rate_limit_exceeded".
    expect(["rate_limit_exceeded", "too_many_login_attempts"]).toContain(limited.body.error);

    const health = await request(app).get("/health");
    expect(health.status).toBe(200);
    expect(health.headers["x-content-type-options"]).toBe("nosniff");
    expect(health.headers["x-frame-options"]).toBe("DENY");
    expect(health.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("honors SSO headers only when the proxy secret matches", async () => {
    process.env.AUTH_SSO_ENABLED = "true";
    process.env.AUTH_SSO_PROXY_SECRET = "shared-sso-secret";

    const trusted = await request(app)
      .post("/api/auth/sso/login")
      .set("x-sso-proxy-secret", "shared-sso-secret")
      .set("x-forwarded-user", "J. Morris")
      .set("x-forwarded-role", "Operator")
      .send({});
    expect(trusted.status).toBe(200);
    expect(trusted.body).toMatchObject({
      ok: true,
      authSource: "sso",
      user: { name: "J. Morris", role: "Operator" }
    });

    const denied = await request(app)
      .post("/api/auth/sso/login")
      .set("x-sso-proxy-secret", "wrong-secret")
      .set("x-forwarded-user", "J. Morris")
      .set("x-forwarded-role", "Operator")
      .send({});
    expect(denied.status).toBe(400);
    expect(denied.body).toMatchObject({ error: "sso_principal_required" });
  });

  it("uses authenticated identity role for authorization even if role header is spoofed", async () => {
    process.env.ALLOW_LEGACY_ROLE_HEADER = "false";
    const operatorUser = await createIsolatedUser("Operator", "Auth Operator");
    const agent = request.agent(app);
    const login = await agent
      .post("/api/auth/login")
      .send({ username: operatorUser.name, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ role: "Operator" });

    const forbidden = await agent
      .post("/api/parts")
      .set("x-user-role", "Admin")
      .send({ id: "AUTH-TEST-001", description: "Unauthorized", revision: "A" });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toMatchObject({ error: "forbidden" });
  });
});
