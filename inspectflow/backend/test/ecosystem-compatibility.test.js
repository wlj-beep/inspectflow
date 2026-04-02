import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";

describe("ecosystem compatibility scaffold", () => {
  it("returns entitlement-driven compatibility checks with deferred BL-108 work", async () => {
    const res = await request(app)
      .get("/api/integration/ecosystem/compatibility")
      .set("x-user-role", "Admin");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      contractId: "PLAT-ECO-v1",
      policy: {
        mode: "entitlement-driven"
      },
      runtimeScaffold: {
        extensionRuntime: {
          status: "scaffolded"
        }
      }
    });
    expect(Array.isArray(res.body.checks)).toBe(true);
    expect(res.body.summary.totalChecks).toBe(res.body.checks.length);
    expect(res.body.summary.deferredChecks).toBeGreaterThanOrEqual(0);
    expect(res.body.checks.find((check) => check.id === "proof-drilldowns")).toMatchObject({
      status: "pass"
    });
    expect(res.body.checks.some((check) => check.deferredBy === "BL-108")).toBe(false);
  });
});
