/**
 * auth-boundary.test.js
 *
 * Verifies authentication and authorization boundaries:
 *   - Unauthenticated requests to protected routes return 401.
 *   - Operator role cannot access admin-only routes (403).
 *   - Admin role can access admin-only routes (200 / expected response).
 *   - Invalid / expired session token returns 401.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { createTestSession, cleanupTestUsers } from "./helpers/sessionFixtures.js";

const createdUserIds = [];

let adminCookie;
let operatorCookie;

beforeAll(async () => {
  const adminSession = await createTestSession("Admin");
  adminCookie = adminSession.cookie;
  createdUserIds.push(adminSession.userId);

  const operatorSession = await createTestSession("Operator");
  operatorCookie = operatorSession.cookie;
  createdUserIds.push(operatorSession.userId);
});

afterAll(async () => {
  await cleanupTestUsers(createdUserIds);
});

// ---------------------------------------------------------------------------
// Unauthenticated access
// ---------------------------------------------------------------------------

describe("Unauthenticated requests return 401", () => {
  it("GET /api/users with no session cookie returns 401", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("GET /api/analytics/marts/status with no session cookie returns 401", async () => {
    const res = await request(app).get("/api/analytics/marts/status");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("POST /api/parts with no session cookie returns 401", async () => {
    const res = await request(app)
      .post("/api/parts")
      .send({ id: "BOUNDARY-TEST-001", description: "Should be rejected", revision: "A" });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("GET /api/auth/me with no session cookie returns 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });
});

// ---------------------------------------------------------------------------
// Invalid / expired session token
// ---------------------------------------------------------------------------

describe("Invalid or expired session token returns 401", () => {
  it("GET /api/auth/me with a bogus session cookie value returns 401", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", "inspectflow_session=totally-invalid-token-value");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("GET /api/users with a bogus session cookie value returns 401", async () => {
    const res = await request(app)
      .get("/api/users")
      .set("Cookie", "inspectflow_session=bogus-session-xyz");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });
});

// ---------------------------------------------------------------------------
// Operator cannot access admin-only routes
// ---------------------------------------------------------------------------

describe("Operator role cannot access admin-only routes (403)", () => {
  it("GET /api/analytics/marts/status returns 403 for Operator", async () => {
    const res = await request(app)
      .get("/api/analytics/marts/status")
      .set("Cookie", operatorCookie);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "forbidden" });
  });

  it("POST /api/analytics/marts/rebuild returns 403 for Operator", async () => {
    const res = await request(app)
      .post("/api/analytics/marts/rebuild")
      .set("Cookie", operatorCookie)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "forbidden" });
  });

  it("GET /api/analytics/performance/slo returns 403 for Operator", async () => {
    const res = await request(app)
      .get("/api/analytics/performance/slo")
      .set("Cookie", operatorCookie);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "forbidden" });
  });

  it("POST /api/parts with Operator role returns 403", async () => {
    const res = await request(app)
      .post("/api/parts")
      .set("Cookie", operatorCookie)
      .send({ id: "BOUNDARY-OP-001", description: "Operator create attempt", revision: "A" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "forbidden" });
  });
});

// ---------------------------------------------------------------------------
// Admin role can access admin-only routes
// ---------------------------------------------------------------------------

describe("Admin role can access admin-only routes", () => {
  it("GET /api/analytics/marts/status returns 200 for Admin", async () => {
    const res = await request(app)
      .get("/api/analytics/marts/status")
      .set("Cookie", adminCookie);
    // Mart status returns 200 with a status payload (mart may be empty in test DB).
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it("GET /api/users returns 200 for Admin", async () => {
    const res = await request(app)
      .get("/api/users")
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/auth/me returns 200 for Admin session", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: "Admin" });
  });

  it("GET /api/analytics/performance/slo returns 200 for Admin", async () => {
    const res = await request(app)
      .get("/api/analytics/performance/slo")
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Role escalation attempt is blocked
// ---------------------------------------------------------------------------

describe("Role escalation via header is blocked when legacy mode is off", () => {
  it("Operator cannot spoof Admin via x-user-role header", async () => {
    const res = await request(app)
      .get("/api/analytics/marts/status")
      .set("Cookie", operatorCookie)
      .set("x-user-role", "Admin");
    // Session-auth is authoritative; header override must not elevate access.
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "forbidden" });
  });
});
