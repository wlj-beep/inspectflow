import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { query } from "../src/db.js";
import { createTestSession, cleanupTestUsers } from "./helpers/sessionFixtures.js";

const BASELINE_MODULE_FLAGS = {
  CORE: true,
  QUALITY_PRO: false,
  INTEGRATION_SUITE: false,
  ANALYTICS_SUITE: false,
  MULTISITE: false,
  EDGE: false
};

async function resetEntitlementBaseline() {
  await query(
    `UPDATE platform_entitlements
     SET license_tier='core',
         seat_pack=25,
         seat_soft_limit=25,
         seat_policy='{"mode":"soft","enforced":false,"hardLimit":0,"namedUsers":[],"allowedDevices":[]}'::jsonb,
         diagnostics_opt_in=false,
         module_flags=$1::jsonb,
         module_policy_profile='core_starter',
         updated_at=NOW()
     WHERE id=1`,
    [JSON.stringify(BASELINE_MODULE_FLAGS)]
  );

  await query(
    `UPDATE auth_local_credentials
     SET failed_attempts=0,
         locked_until=NULL
     WHERE user_id IN (
       SELECT id
       FROM users
       WHERE name IN ('S. Admin', 'J. Morris')
     )`
  );
}

const createdUserIds = [];

describe("Module policy engine (BL-049)", () => {
  beforeEach(async () => {
    await resetEntitlementBaseline();
  });

  afterEach(async () => {
    await cleanupTestUsers(createdUserIds);
    await resetEntitlementBaseline();
  });

  it("returns module policy profile catalog for authenticated sessions", async () => {
    const operator = await createTestSession("Operator");
    createdUserIds.push(operator.userId);

    const profiles = await operator.agent.get("/api/auth/module-policy/profiles");
    expect(profiles.status).toBe(200);
    expect(profiles.body.contractId).toBe("COMM-LICENSE-v1");
    expect(Array.isArray(profiles.body.profiles)).toBe(true);
    expect(profiles.body.profiles.some((profile) => profile.id === "core_starter")).toBe(true);
  });

  it("enforces admin-only module policy evaluation", async () => {
    const operator = await createTestSession("Operator");
    createdUserIds.push(operator.userId);

    const evaluate = await operator
      .agent.post("/api/auth/module-policy/evaluate")
      .send({ profile: "edge_ops" });
    expect(evaluate.status).toBe(403);
    expect(evaluate.body).toMatchObject({ error: "forbidden" });
  });

  it("returns invalid profile errors for unknown policy profile IDs", async () => {
    const admin = await createTestSession("Admin");
    createdUserIds.push(admin.userId);

    const evaluate = await admin.agent
      .post("/api/auth/module-policy/evaluate")
      .send({ profile: "unknown_profile" });
    expect(evaluate.status).toBe(400);
    expect(evaluate.body).toMatchObject({ error: "invalid_module_profile" });
  });

  it("applies module policy profile and enforces dependency rules", async () => {
    const admin = await createTestSession("Admin");
    createdUserIds.push(admin.userId);

    const updated = await admin.agent
      .put("/api/auth/entitlements")
      .send({ modulePolicyProfile: "edge_ops" });
    expect(updated.status).toBe(200);
    expect(updated.body.modulePolicyProfile).toBe("edge_ops");
    expect(updated.body.moduleFlags).toMatchObject({
      CORE: true,
      EDGE: true
    });

    const evaluated = await admin
      .agent.post("/api/auth/module-policy/evaluate")
      .send({
        profile: "enterprise_all",
        moduleFlags: {
          CORE: true,
          QUALITY_PRO: true,
          INTEGRATION_SUITE: true,
          ANALYTICS_SUITE: false,
          MULTISITE: true,
          EDGE: true
        }
      });
    expect(evaluated.status).toBe(200);
    expect(evaluated.body.moduleFlags.MULTISITE).toBe(false);
    const codes = evaluated.body.findings.map((finding) => finding.code);
    expect(codes).toContain("multisite_requires_analytics");
  });
});
