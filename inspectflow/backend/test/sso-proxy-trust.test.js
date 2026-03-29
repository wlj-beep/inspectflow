import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

// These tests validate that proxy header trust is correctly gated by AUTH_SSO_PROXY_SECRET (BL-138).

const SSO_PROXY_SECRET = "test-sso-secret-16ch"; // 20 chars — meets the ≥16 requirement

async function resetEntitlementBaseline() {
  await query(
    `UPDATE platform_entitlements
     SET seat_pack=25,
         seat_soft_limit=25,
         seat_policy='{"mode":"soft","enforced":false,"hardLimit":0,"namedUsers":[],"allowedDevices":[]}'::jsonb,
         updated_at=NOW()
     WHERE id=1`
  );
  await query(
    `UPDATE auth_local_credentials
     SET failed_attempts=0, locked_until=NULL
     WHERE user_id IN (SELECT id FROM users WHERE name IN ('S. Admin', 'J. Morris', 'R. Tatum'))`
  );
}

describe("SSO proxy header trust (BL-138)", () => {
  beforeEach(async () => {
    await resetEntitlementBaseline();
    process.env.AUTH_SSO_ENABLED = "true";
    process.env.AUTH_SSO_PROXY_SECRET = SSO_PROXY_SECRET;
  });

  afterEach(() => {
    delete process.env.AUTH_SSO_ENABLED;
    delete process.env.AUTH_SSO_PROXY_SECRET;
    delete process.env.SSO_PROXY_SECRET;
  });

  it("request with correct proxy secret trusts forwarded principal header and logs in", async () => {
    const res = await request(app)
      .post("/api/auth/sso/login")
      .set("x-sso-proxy-secret", SSO_PROXY_SECRET)
      .set("x-forwarded-user", "J. Morris")
      .set("x-forwarded-role", "Operator")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      authSource: "sso",
      user: { name: "J. Morris" }
    });
  });

  it("request with wrong proxy secret ignores forwarded headers and returns 400 (no principal in body)", async () => {
    const res = await request(app)
      .post("/api/auth/sso/login")
      .set("x-sso-proxy-secret", "wrong-secret-value")
      .set("x-forwarded-user", "J. Morris")
      .set("x-forwarded-role", "Operator")
      .send({});
    // Proxy headers are not trusted; no body principal either → sso_principal_required
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "sso_principal_required" });
  });

  it("missing proxy secret header ignores forwarded headers and returns 400 (no principal in body)", async () => {
    const res = await request(app)
      .post("/api/auth/sso/login")
      .set("x-forwarded-user", "J. Morris")
      .set("x-forwarded-role", "Operator")
      .send({});
    // No proxy secret header at all; forwarded user is not trusted → sso_principal_required
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "sso_principal_required" });
  });
});
