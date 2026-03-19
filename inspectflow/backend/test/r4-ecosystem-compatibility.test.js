import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

const BASELINE_MODULE_FLAGS = {
  CORE: true,
  QUALITY_PRO: false,
  INTEGRATION_SUITE: false,
  ANALYTICS_SUITE: false,
  MULTISITE: false,
  EDGE: false
};

const createdConnectorIds = [];
const createdPluginIds = [];
const createdRunIds = [];

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
       SELECT id FROM users WHERE name IN ('S. Admin', 'J. Morris')
     )`
  );
}

async function cleanupArtifacts() {
  if (createdConnectorIds.length) {
    await query("DELETE FROM partner_connector_kits WHERE connector_id = ANY($1)", [createdConnectorIds]);
    createdConnectorIds.length = 0;
  }
  if (createdPluginIds.length) {
    await query("DELETE FROM platform_extensions WHERE plugin_id = ANY($1)", [createdPluginIds]);
    createdPluginIds.length = 0;
  }
  if (createdRunIds.length) {
    await query("DELETE FROM edge_sync_runs WHERE id = ANY($1)", [createdRunIds]);
    createdRunIds.length = 0;
  }
}

async function login(agent, username, password) {
  return agent.post("/api/auth/login").send({ username, password });
}

async function loginAdmin(agent) {
  const primary = await login(agent, "S. Admin", "inspectflow");
  if (primary.status === 200) return primary;
  const fallback = await login(agent, "S. Admin", "inspectflow-v2");
  if (fallback.status === 200) return fallback;
  return primary;
}

describe("R4 ecosystem compatibility suite (BL-050)", () => {
  beforeEach(async () => {
    await cleanupArtifacts();
    await resetEntitlementBaseline();
  });

  afterEach(async () => {
    await cleanupArtifacts();
    await resetEntitlementBaseline();
  });

  it("keeps core workflows healthy while extension and edge module surfaces are toggled", async () => {
    const admin = request.agent(app);
    const adminLogin = await loginAdmin(admin);
    expect(adminLogin.status).toBe(200);

    const edgeProfile = await admin
      .put("/api/auth/entitlements")
      .send({ modulePolicyProfile: "edge_ops" });
    expect(edgeProfile.status).toBe(200);
    expect(edgeProfile.body.moduleFlags.EDGE).toBe(true);

    const runtime = await admin.get("/api/extensions/runtime");
    expect(runtime.status).toBe(200);
    const allowedHook = runtime.body.sdkBoundary.allowedHooks[0];
    const allowedCapability = runtime.body.sdkBoundary.allowedCapabilities[0];
    expect(allowedHook).toBeTruthy();
    expect(allowedCapability).toBeTruthy();

    const pluginId = `r4-plugin-${Date.now()}`;
    createdPluginIds.push(pluginId);

    const registeredPlugin = await admin
      .post("/api/extensions/plugins")
      .send({
        pluginId,
        displayName: "R4 Compatibility Plugin",
        version: "1.0.0",
        hooks: [allowedHook],
        capabilities: [allowedCapability]
      });
    expect(registeredPlugin.status).toBe(200);
    expect(registeredPlugin.body.plugin.policyStatus).toBe("allowed");

    const enabledPlugin = await admin.post(`/api/extensions/plugins/${pluginId}/enable`);
    expect(enabledPlugin.status).toBe(200);
    expect(enabledPlugin.body.plugin.enabled).toBe(true);

    const connectorId = `r4-connector-${Date.now()}`;
    createdConnectorIds.push(connectorId);
    const connector = await admin
      .post("/api/partner-connectors")
      .send({
        connectorId,
        displayName: "R4 Compatibility Connector",
        version: "1.0.0",
        sourceTypes: ["api_pull"],
        importTypes: ["jobs", "measurements"],
        sdkPluginId: pluginId
      });
    expect(connector.status).toBe(200);
    expect(connector.body.validationStatus).toBe("valid");

    const snapshot = await admin.get("/api/edge-sync/snapshot");
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.contractId).toBe("EDGE-SYNC-v1");
    expect(snapshot.body.runId).toBeTruthy();
    createdRunIds.push(Number(snapshot.body.runId));

    const validated = await admin
      .post("/api/edge-sync/validate")
      .send(snapshot.body);
    expect(validated.status).toBe(200);
    expect(validated.body.validationStatus).toBe("valid");
    expect(validated.body.runId).toBeTruthy();
    createdRunIds.push(Number(validated.body.runId));

    const coreProfile = await admin
      .put("/api/auth/entitlements")
      .send({ modulePolicyProfile: "core_starter" });
    expect(coreProfile.status).toBe(200);
    expect(coreProfile.body.moduleFlags.EDGE).toBe(false);

    const blockedEdge = await admin.get("/api/edge-sync/contracts");
    expect(blockedEdge.status).toBe(403);
    expect(blockedEdge.body).toMatchObject({ error: "edge_module_disabled" });

    const coreUsers = await admin.get("/api/users");
    expect(coreUsers.status).toBe(200);
    expect(Array.isArray(coreUsers.body)).toBe(true);
    expect(coreUsers.body.length).toBeGreaterThan(0);
  });
});
