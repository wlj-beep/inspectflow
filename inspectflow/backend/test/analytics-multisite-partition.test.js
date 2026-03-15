import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

describe("Analytics multi-site partition safeguards (BL-043)", () => {
  afterEach(() => {
    delete process.env.ANALYTICS_ALLOWED_SITE_IDS;
    delete process.env.ANALYTICS_MULTISITE_ENABLED;
  });

  it("blocks non-default site analytics scope when MULTISITE entitlement is disabled", async () => {
    process.env.ANALYTICS_MULTISITE_ENABLED = "false";
    const status = await request(app)
      .get("/api/analytics/marts/status")
      .set("x-user-role", "Admin")
      .set("x-user-id", "10")
      .query({ siteId: "site-b" });
    expect(status.status).toBe(403);
    expect(status.body).toMatchObject({ error: "multisite_not_enabled" });
  });

  it("supports site-partitioned admin analytics scope and blocks non-admin cross-site reads", async () => {
    process.env.ANALYTICS_ALLOWED_SITE_IDS = "default,site-b";
    process.env.ANALYTICS_MULTISITE_ENABLED = "true";

    const rebuild = await request(app)
      .post("/api/analytics/marts/rebuild")
      .set("x-user-role", "Admin")
      .set("x-user-id", "10")
      .send({ triggerSource: "multisite-partition-test", siteId: "site-b" });
    expect(rebuild.status).toBe(200);
    expect(rebuild.body.siteId).toBe("site-b");
    expect(rebuild.body.siteScope?.siteId).toBe("site-b");

    const siteRows = await query(
      "SELECT COUNT(*)::INT AS count FROM ana_mart_inspection_fact WHERE site_id=$1",
      ["site-b"]
    );
    expect(Number(siteRows.rows[0]?.count || 0)).toBeGreaterThan(0);

    const users = await request(app)
      .get("/api/users")
      .set("x-user-role", "Admin")
      .set("x-user-id", "10");
    expect(users.status).toBe(200);
    const operatorUser = users.body.find((row) => row.name === "J. Morris");
    expect(operatorUser?.id).toBeTruthy();

    const forbiddenBeforeGrant = await request(app)
      .get("/api/analytics/kpis/dashboard")
      .set("x-user-role", "Operator")
      .set("x-user-id", String(operatorUser.id))
      .query({ siteId: "site-b" });
    expect(forbiddenBeforeGrant.status).toBe(403);

    const grant = await request(app)
      .put(`/api/users/${operatorUser.id}/sites`)
      .set("x-user-role", "Admin")
      .set("x-user-id", "10")
      .send({ siteIds: ["default", "site-b"], defaultSiteId: "default" });
    expect(grant.status).toBe(200);

    const allowedAfterGrant = await request(app)
      .get("/api/analytics/kpis/dashboard")
      .set("x-user-role", "Operator")
      .set("x-user-id", String(operatorUser.id))
      .query({ siteId: "site-b" });
    expect(allowedAfterGrant.status).toBe(200);
    expect(allowedAfterGrant.body.siteScope?.siteId).toBe("site-b");

    await request(app)
      .put(`/api/users/${operatorUser.id}/sites`)
      .set("x-user-role", "Admin")
      .set("x-user-id", "10")
      .send({ siteIds: ["default"], defaultSiteId: "default" });
  });
});
