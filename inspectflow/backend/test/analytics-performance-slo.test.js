import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";

describe("Analytics performance/cost SLO controls (BL-045)", () => {
  it("returns ANA-KPI-v3 SLO status payload for admins", async () => {
    const rebuild = await request(app)
      .post("/api/analytics/marts/rebuild")
      .set("x-user-role", "Admin")
      .set("x-user-id", "10")
      .send({ triggerSource: "analytics-slo-test" });
    expect(rebuild.status).toBe(200);

    const slo = await request(app)
      .get("/api/analytics/performance/slo")
      .set("x-user-role", "Admin")
      .set("x-user-id", "10");
    expect(slo.status).toBe(200);
    expect(slo.body).toMatchObject({
      contractId: "ANA-KPI-v3",
      capabilityId: "BL-045-analytics-slo-v1",
      siteId: "default"
    });
    expect(Array.isArray(slo.body.checks)).toBe(true);
    expect(slo.body.checks.length).toBeGreaterThanOrEqual(4);
    expect(["pass", "warn", "fail"]).toContain(slo.body.overallStatus);
  });

  it("keeps SLO endpoint admin-only", async () => {
    const res = await request(app)
      .get("/api/analytics/performance/slo")
      .set("x-user-role", "Operator");
    expect(res.status).toBe(403);
  });
});
