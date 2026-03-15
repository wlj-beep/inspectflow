import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

async function login(agent, username, password = "inspectflow") {
  return agent.post("/api/auth/login").send({ username, password });
}

async function loginAdminAgent() {
  const admin = request.agent(app);
  let loginRes = await login(admin, "S. Admin", "inspectflow");
  if (loginRes.status !== 200) {
    loginRes = await login(admin, "S. Admin", "inspectflow-v2");
  }
  expect(loginRes.status).toBe(200);
  return admin;
}

describe("Analytics multi-site partition safeguards (BL-043)", () => {
  afterEach(() => {
    delete process.env.ANALYTICS_ALLOWED_SITE_IDS;
    delete process.env.ANALYTICS_MULTISITE_ENABLED;
  });

  it("blocks non-default site analytics scope when MULTISITE entitlement is disabled", async () => {
    process.env.ANALYTICS_MULTISITE_ENABLED = "false";
    const admin = await loginAdminAgent();

    const status = await admin
      .get("/api/analytics/marts/status")
      .query({ siteId: "site-b" });
    expect(status.status).toBe(403);
    expect(status.body).toMatchObject({ error: "multisite_not_enabled" });
  });

  it("supports site-partitioned admin analytics scope and blocks non-admin cross-site reads", async () => {
    process.env.ANALYTICS_ALLOWED_SITE_IDS = "default,site-b";
    process.env.ANALYTICS_MULTISITE_ENABLED = "true";
    const admin = await loginAdminAgent();

    const rebuild = await admin
      .post("/api/analytics/marts/rebuild")
      .send({ triggerSource: "multisite-partition-test", siteId: "site-b" });
    expect(rebuild.status).toBe(200);
    expect(rebuild.body.siteId).toBe("site-b");
    expect(rebuild.body.siteScope?.siteId).toBe("site-b");

    const siteRows = await query(
      "SELECT COUNT(*)::INT AS count FROM ana_mart_inspection_fact WHERE site_id=$1",
      ["site-b"]
    );
    expect(Number(siteRows.rows[0]?.count || 0)).toBeGreaterThan(0);

    const operator = request.agent(app);
    const operatorLogin = await login(operator, "J. Morris");
    expect(operatorLogin.status).toBe(200);
    const forbiddenBeforeGrant = await operator
      .get("/api/analytics/kpis/dashboard")
      .query({ siteId: "site-b" });
    expect(forbiddenBeforeGrant.status).toBe(403);
    expect(["site_scope_forbidden", "multisite_not_enabled"]).toContain(forbiddenBeforeGrant.body?.error);

    const users = await admin.get("/api/users");
    expect(users.status).toBe(200);
    const operatorUser = users.body.find((row) => row.name === "J. Morris");
    expect(operatorUser?.id).toBeTruthy();

    const grant = await admin
      .put(`/api/users/${operatorUser.id}/sites`)
      .send({ siteIds: ["default", "site-b"], defaultSiteId: "default" });
    expect(grant.status).toBe(200);

    const allowedAfterGrant = await operator
      .get("/api/analytics/kpis/dashboard")
      .query({ siteId: "site-b" });
    expect(allowedAfterGrant.status).toBe(200);
    expect(allowedAfterGrant.body.siteScope?.siteId).toBe("site-b");

    await admin
      .put(`/api/users/${operatorUser.id}/sites`)
      .send({ siteIds: ["default"], defaultSiteId: "default" });
  });
});
