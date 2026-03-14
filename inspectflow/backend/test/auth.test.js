import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";

describe("Auth/session foundation", () => {
  afterEach(() => {
    delete process.env.ALLOW_LEGACY_ROLE_HEADER;
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
    const agent = request.agent(app);

    const login = await agent
      .post("/api/auth/login")
      .send({ username: "S. Admin", password: "inspectflow" });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ name: "S. Admin", role: "Admin" });

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ name: "S. Admin", role: "Admin" });

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
    const agent = request.agent(app);
    const login = await agent
      .post("/api/auth/login")
      .send({ username: "J. Morris", password: "inspectflow" });
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
