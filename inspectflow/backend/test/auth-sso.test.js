import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

async function login(agent, username, password = "inspectflow") {
  return agent.post("/api/auth/login").send({ username, password });
}

async function removeUserByName(name) {
  await query("DELETE FROM users WHERE name=$1", [name]);
}

describe("Optional SSO auth path (BL-036)", () => {
  afterEach(async () => {
    delete process.env.AUTH_SSO_ENABLED;
    delete process.env.AUTH_SSO_AUTO_PROVISION;
    delete process.env.AUTH_SSO_PRINCIPAL_HEADER;
    delete process.env.AUTH_SSO_ROLE_HEADER;
    delete process.env.AUTH_SSO_DEFAULT_ROLE;
    await removeUserByName("SSO Auto 1");
  });

  it("keeps SSO endpoint disabled by default", async () => {
    const res = await request(app)
      .post("/api/auth/sso/login")
      .send({ principal: "J. Morris" });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "sso_disabled" });
  });

  it("supports SSO login when enabled and does not break local auth mode", async () => {
    process.env.AUTH_SSO_ENABLED = "true";

    const ssoAgent = request.agent(app);
    const ssoLogin = await ssoAgent
      .post("/api/auth/sso/login")
      .send({ principal: "J. Morris" });
    expect(ssoLogin.status).toBe(200);
    expect(ssoLogin.body).toMatchObject({
      ok: true,
      authSource: "sso",
      user: { name: "J. Morris", role: "Operator" }
    });

    const me = await ssoAgent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ name: "J. Morris", role: "Operator" });

    const localAgent = request.agent(app);
    const localLogin = await login(localAgent, "R. Tatum");
    expect(localLogin.status).toBe(200);
    expect(localLogin.body.user).toMatchObject({ name: "R. Tatum", role: "Operator" });
  });

  it("can auto-provision users when explicitly enabled", async () => {
    process.env.AUTH_SSO_ENABLED = "true";
    process.env.AUTH_SSO_AUTO_PROVISION = "true";

    const agent = request.agent(app);
    const ssoLogin = await agent
      .post("/api/auth/sso/login")
      .send({ principal: "SSO Auto 1", role: "Quality" });
    expect(ssoLogin.status).toBe(200);
    expect(ssoLogin.body.user).toMatchObject({ name: "SSO Auto 1", role: "Quality" });

    const lookup = await query("SELECT role, active FROM users WHERE name=$1 LIMIT 1", ["SSO Auto 1"]);
    expect(lookup.rows[0]).toMatchObject({ role: "Quality", active: true });
  });
});
