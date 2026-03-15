import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";
import { makePasswordHash } from "../src/auth.js";

const TEST_PASSWORD = "inspectflow";
const createdUserIds = [];

function nextTestUsername(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createIsolatedUser(role, prefix) {
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
  createdUserIds.push(Number(user.id));
  return user;
}

describe("Auth/session foundation", () => {
  afterEach(async () => {
    delete process.env.ALLOW_LEGACY_ROLE_HEADER;
    while (createdUserIds.length > 0) {
      const userId = createdUserIds.pop();
      // Keep rows for this test run to avoid cross-file FK races with admin bulk password resets.
      await query("UPDATE users SET active=false WHERE id=$1", [userId]);
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

    const afterLogout = await agent.get("/api/auth/me");
    expect(afterLogout.status).toBe(401);
    expect(afterLogout.body).toMatchObject({ error: "unauthenticated" });
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
