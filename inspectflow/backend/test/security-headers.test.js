import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/index.js";

describe("HTTP security headers", () => {
  it("sets required security headers on /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["content-security-policy"]).toMatch(/default-src 'none'/);
    expect(res.headers["content-security-policy"]).toMatch(/frame-ancestors 'none'/);
    expect(res.headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
    expect(res.headers["x-dns-prefetch-control"]).toBe("off");
    expect(res.headers["x-permitted-cross-domain-policies"]).toBe("none");
    expect(res.headers["permissions-policy"]).toMatch(/geolocation=\(\)/);
  });

  it("does not expose x-powered-by header", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("sets Cache-Control: no-store on API routes", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", ""); // unauthenticated — we just need the headers
    // Route returns 401 but headers should still be present
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("does not set Cache-Control: no-store on /health (non-API route)", async () => {
    const res = await request(app).get("/health");
    // /health is not under /api so Cache-Control: no-store should NOT be set by security middleware
    expect(res.headers["cache-control"]).not.toBe("no-store");
  });

  it("does not set HSTS on non-secure connections", async () => {
    const res = await request(app).get("/health");
    // Test runner uses HTTP without x-forwarded-proto=https, so HSTS should be absent
    expect(res.headers["strict-transport-security"]).toBeUndefined();
  });

  it("sets HSTS when request is marked as secure via x-forwarded-proto", async () => {
    const res = await request(app)
      .get("/health")
      .set("x-forwarded-proto", "https");
    expect(res.headers["strict-transport-security"]).toMatch(/max-age=\d+/);
    expect(res.headers["strict-transport-security"]).toMatch(/includeSubDomains/);
  });
});
