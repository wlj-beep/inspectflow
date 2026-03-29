/**
 * auth-users.test.js
 *
 * Verifies BL-135 (logout endpoint) and BL-147 (GET /api/auth/users):
 *   BL-135:
 *     - POST /api/auth/logout requires authentication (401 if unauthenticated)
 *     - Logout revokes the session token and clears the cookie
 *
 *   BL-147:
 *     - GET /api/auth/users returns 401 for unauthenticated callers
 *     - Authenticated callers receive { users, total, page, pageSize }
 *     - Each user entry contains only id and name (no role, active, etc.)
 *     - Pagination via page and pageSize query params works correctly
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { createTestSession, cleanupTestUsers } from "./helpers/sessionFixtures.js";

const createdUserIds = [];

let adminCookie;

beforeAll(async () => {
  const adminSession = await createTestSession("Admin");
  adminCookie = adminSession.cookie;
  createdUserIds.push(adminSession.userId);
});

afterAll(async () => {
  await cleanupTestUsers(createdUserIds);
});

// ---------------------------------------------------------------------------
// BL-135 — POST /api/auth/logout
// ---------------------------------------------------------------------------

describe("BL-135: POST /api/auth/logout", () => {
  it("returns 401 when called without a session cookie", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("revokes the session and clears the cookie for an authenticated user", async () => {
    // Create a dedicated session for this test so we don't break the shared adminCookie.
    const session = await createTestSession("Operator");
    createdUserIds.push(session.userId);

    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", session.cookie);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body).toMatchObject({ ok: true });

    // Cookie should be cleared (expires epoch 0).
    const setCookieHeader = logoutRes.headers["set-cookie"]?.[0] ?? "";
    expect(setCookieHeader).toMatch(/inspectflow_session=;/);
    expect(setCookieHeader).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT/);

    // The revoked session token must no longer be valid.
    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Cookie", session.cookie);
    expect(meRes.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// BL-147 — GET /api/auth/users
// ---------------------------------------------------------------------------

describe("BL-147: GET /api/auth/users — unauthenticated", () => {
  it("returns 401 with no session cookie", async () => {
    const res = await request(app).get("/api/auth/users");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("returns 401 with a bogus session cookie", async () => {
    const res = await request(app)
      .get("/api/auth/users")
      .set("Cookie", "inspectflow_session=totally-invalid-token");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });
});

describe("BL-147: GET /api/auth/users — authenticated", () => {
  it("returns 200 with the expected envelope shape", async () => {
    const res = await request(app)
      .get("/api/auth/users")
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("users");
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("page");
    expect(res.body).toHaveProperty("pageSize");
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it("returns only id and name per user — no role, active, or other fields", async () => {
    const res = await request(app)
      .get("/api/auth/users")
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeGreaterThan(0);

    for (const user of res.body.users) {
      expect(Object.keys(user).sort()).toEqual(["id", "name"]);
      expect(user).not.toHaveProperty("role");
      expect(user).not.toHaveProperty("active");
      expect(user).not.toHaveProperty("password_hash");
      expect(user).not.toHaveProperty("created_at");
    }
  });

  it("defaults to page=1 and pageSize=25", async () => {
    const res = await request(app)
      .get("/api/auth/users")
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(25);
  });

  it("respects explicit page and pageSize query params", async () => {
    const res = await request(app)
      .get("/api/auth/users?page=1&pageSize=1")
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(1);
    expect(res.body.users.length).toBeLessThanOrEqual(1);
    expect(typeof res.body.total).toBe("number");
  });

  it("caps pageSize at 100", async () => {
    const res = await request(app)
      .get("/api/auth/users?pageSize=9999")
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(100);
  });

  it("returns an empty users array for a page beyond the last result", async () => {
    const res = await request(app)
      .get("/api/auth/users?page=99999&pageSize=25")
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
    expect(typeof res.body.total).toBe("number");
  });
});
