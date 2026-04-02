import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";

describe("customer proof center", () => {
  it("returns a redacted proof pack and shareable export summary", async () => {
    const res = await request(app)
      .get("/api/proof-center/summary")
      .set("x-user-role", "Admin");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      contractId: "ANA-PROOF-v1",
      dataSource: "live"
    });
    expect(Array.isArray(res.body.trustIndicators)).toBe(true);
    expect(res.body.trustIndicators).toHaveLength(4);
    expect(res.body.proofPack).toMatchObject({
      headline: expect.any(String),
      summary: expect.any(String)
    });
    expect(Array.isArray(res.body.proofPack.redactions)).toBe(true);
    expect(res.body.proofPack.redactions).toContain("raw measurement payloads");
    expect(res.body.shareableText).toContain("Redactions:");
    expect(res.body.shareableText).not.toContain("raw measurement payloads");
    expect(res.body.shareableText).toContain("Runtime SLO:");
    const expectedYield = `${Math.round(Number(res.body.kpiDashboard.kpis.firstPassYield || 0) * 100)}%`;
    expect(res.body.shareableText).toContain(`First-pass yield: ${expectedYield}.`);
    expect(res.body.kpiDashboard).toMatchObject({
      contractId: "ANA-KPI-v3"
    });
    expect(Array.isArray(res.body.kpiDashboard.breakdowns.byWorkCenter)).toBe(true);
    expect(res.body.kpiDashboard.breakdowns.byWorkCenter.length).toBeGreaterThan(0);
    expect(res.body.runtimeSlo.current.status).not.toBe("staged");
    expect(res.body.runtimeSlo).toMatchObject({
      contractId: "PLAT-SLO-v1",
      current: {
        status: expect.any(String),
        label: expect.any(String)
      },
      targets: {
        uptime: {
          targetPct: expect.any(Number)
        },
        importSuccess: {
          targetPct: expect.any(Number)
        }
      }
    });
    expect(Array.isArray(res.body.readOnlyDrilldowns)).toBe(true);
    expect(res.body.readOnlyDrilldowns.some((item) => item.id === "runtime-slo" && item.status)).toBe(true);
    expect(res.body.readOnlyDrilldowns.some((item) => item.deferredBy === "BL-108")).toBe(false);
    expect(res.body.ecosystem).toMatchObject({
      contractId: "PLAT-ECO-v1"
    });
    expect(res.body.ecosystem.summary).toMatchObject({
      totalChecks: expect.any(Number)
    });
    expect(res.body.kpiDashboard.breakdowns).not.toHaveProperty("byOperator");
    expect(res.body.readiness).toMatchObject({
      deploymentCompletion: expect.any(Object),
      adoptionMilestone: expect.any(Object),
      renewalRisk: expect.any(Object)
    });
  });

  it("streams a customer-safe proof export", async () => {
    const res = await request(app)
      .get("/api/proof-center/export")
      .set("x-user-role", "Admin");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.headers["content-disposition"]).toContain("inspectflow-proof-pack-default.txt");
    expect(res.text).toContain("Customer proof pack");
    expect(res.text).toContain("Redactions:");
    expect(res.text).toContain("Runtime SLO:");
    expect(res.text).not.toContain("deferred until BL-108");
    expect(res.text).not.toContain("raw measurement payloads");
  });
});
