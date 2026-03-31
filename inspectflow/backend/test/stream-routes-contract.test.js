import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";

describe("Stream route composition contract", () => {
  it("keeps the stream-aligned route groups mounted after router extraction", async () => {
    const health = await request(app).get("/health");
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({ ok: true, service: "inspectflow-backend" });

    const authUsers = await request(app).get("/api/auth/users");
    expect(authUsers.status).toBe(200);

    const jobs = await request(app).get("/api/jobs").set("x-user-role", "Admin");
    expect(jobs.status).toBe(200);

    const records = await request(app).get("/api/records").set("x-user-role", "Admin");
    expect(records.status).toBe(200);

    const analytics = await request(app).get("/api/analytics/kpis/definitions").set("x-user-role", "Admin");
    expect(analytics.status).toBe(200);

    const imports = await request(app).get("/api/imports/templates").set("x-user-role", "Admin");
    expect(imports.status).toBe(200);
  });
});
