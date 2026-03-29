/**
 * auth-rate-limiting.test.js
 *
 * Regression coverage for BL-131: IP-keyed sliding-window rate limiting on
 * POST /api/auth/login.
 *
 * Test plan:
 *   1. Requests within the limit succeed (return 401 for bad creds, not 429).
 *   2. Requests exceeding the limit receive 429 { error: "rate_limit_exceeded" }
 *      with a Retry-After header.
 *   3. Different IPs have independent counters.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { ipWindowStore } from "../src/middleware/loginRateLimit.js";

function setRateLimitEnv({ max = 3, windowMs = 60000 } = {}) {
  process.env.AUTH_LOGIN_RATE_LIMIT_MAX = String(max);
  process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS = String(windowMs);
}

// Generate unique IPs per test so the per-(IP+username) limiter in the route
// handler does not accumulate state across tests (only the IP-keyed middleware
// store is cleared in beforeEach).
let testIpCounter = 0;
function nextTestIp() {
  testIpCounter += 1;
  const a = Math.floor(testIpCounter / 256);
  const b = testIpCounter % 256;
  return `192.168.${a}.${b}`;
}

describe("Login IP rate limiting (BL-131)", () => {
  beforeEach(() => {
    // Start each test with a clean IP store so counters don't bleed across cases.
    ipWindowStore.clear();
  });

  afterEach(() => {
    delete process.env.AUTH_LOGIN_RATE_LIMIT_MAX;
    delete process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS;
    ipWindowStore.clear();
  });

  it("allows requests within the configured limit (returns 401 for bad creds, not 429)", async () => {
    setRateLimitEnv({ max: 5 });
    const ip = nextTestIp();

    // Fire 5 attempts — all within the limit. Each should get a non-429 response.
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .set("x-forwarded-for", ip)
        .send({ username: `rl-test-user-${ip}-${i}`, password: "wrong" });
      expect(res.status).not.toBe(429);
      expect(res.body.error).not.toBe("rate_limit_exceeded");
    }
  });

  it("returns 429 rate_limit_exceeded with Retry-After when limit is exceeded", async () => {
    setRateLimitEnv({ max: 2, windowMs: 60000 });
    const ip = nextTestIp();
    const body = { username: `rl-test-exceed-${ip}`, password: "wrong" };

    // Two requests within the limit — should NOT be 429.
    for (let i = 0; i < 2; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .set("x-forwarded-for", ip)
        .send(body);
      expect(res.status).not.toBe(429);
    }

    // Third request crosses the limit.
    const limited = await request(app)
      .post("/api/auth/login")
      .set("x-forwarded-for", ip)
      .send(body);

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ error: "rate_limit_exceeded" });
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("subsequent requests after the limit is hit continue to return 429", async () => {
    setRateLimitEnv({ max: 1, windowMs: 60000 });
    const ip = nextTestIp();
    const body = { username: `rl-test-persist-${ip}`, password: "wrong" };

    // First request — within limit.
    await request(app)
      .post("/api/auth/login")
      .set("x-forwarded-for", ip)
      .send(body);

    // Second and third — both should be 429.
    for (let i = 0; i < 2; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .set("x-forwarded-for", ip)
        .send(body);
      expect(res.status).toBe(429);
      expect(res.body).toMatchObject({ error: "rate_limit_exceeded" });
    }
  });

  it("different IPs have independent counters", async () => {
    setRateLimitEnv({ max: 1, windowMs: 60000 });
    const ipA = nextTestIp();
    const ipB = nextTestIp();
    const username = `rl-test-indep-${Date.now()}`;

    // IP A: one attempt — fills the limit.
    await request(app)
      .post("/api/auth/login")
      .set("x-forwarded-for", ipA)
      .send({ username, password: "wrong" });

    // IP A: next request should be rate limited.
    const limitedA = await request(app)
      .post("/api/auth/login")
      .set("x-forwarded-for", ipA)
      .send({ username, password: "wrong" });
    expect(limitedA.status).toBe(429);
    expect(limitedA.body).toMatchObject({ error: "rate_limit_exceeded" });

    // IP B: different IP — fresh counter, should NOT be rate limited.
    const notLimitedB = await request(app)
      .post("/api/auth/login")
      .set("x-forwarded-for", ipB)
      .send({ username, password: "wrong" });
    expect(notLimitedB.status).not.toBe(429);
    expect(notLimitedB.body.error).not.toBe("rate_limit_exceeded");
  });

  it("rate limiting applies only to the login route, not other auth endpoints", async () => {
    setRateLimitEnv({ max: 1, windowMs: 60000 });
    const ip = nextTestIp();
    const body = { username: `rl-test-scope-${ip}`, password: "wrong" };

    // Exhaust the login limit for this IP.
    await request(app)
      .post("/api/auth/login")
      .set("x-forwarded-for", ip)
      .send(body);
    const secondLogin = await request(app)
      .post("/api/auth/login")
      .set("x-forwarded-for", ip)
      .send(body);
    expect(secondLogin.status).toBe(429);

    // Health endpoint (different route, no rate limit) should still respond 200.
    const healthRes = await request(app)
      .get("/health")
      .set("x-forwarded-for", ip);
    expect(healthRes.status).toBe(200);

    // Logout endpoint (different auth route, no rate limit) should not return 429.
    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .set("x-forwarded-for", ip);
    expect(logoutRes.status).not.toBe(429);
  });
});
