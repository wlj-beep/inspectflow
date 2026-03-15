import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

const createdPluginIds = [];
let runtimeBoundary;
let originalModuleFlags;

async function fetchModuleFlags() {
  const { rows } = await query(
    "SELECT module_flags FROM platform_entitlements WHERE id=1 LIMIT 1"
  );
  return rows[0]?.module_flags || {};
}

async function setModuleFlags(moduleFlags) {
  await query(
    `UPDATE platform_entitlements
     SET module_flags=$1::jsonb,
         updated_at=NOW()
     WHERE id=1`,
    [JSON.stringify(moduleFlags || {})]
  );
}

function adminReq(method, path) {
  return request(app)
    [method](path)
    .set("x-user-role", "Admin")
    .set("x-user-id", "10");
}

beforeAll(async () => {
  originalModuleFlags = await fetchModuleFlags();
  const runtimeRes = await adminReq("get", "/api/extensions/runtime");
  expect(runtimeRes.status).toBe(200);
  runtimeBoundary = runtimeRes.body.sdkBoundary;
});

afterAll(async () => {
  if (originalModuleFlags) {
    await setModuleFlags(originalModuleFlags);
  }
  if (createdPluginIds.length) {
    await query("DELETE FROM platform_extensions WHERE plugin_id = ANY($1)", [createdPluginIds]);
  }
});

describe("Extension runtime scaffolding", () => {
  it("allows admin to read runtime boundary", async () => {
    const res = await adminReq("get", "/api/extensions/runtime");
    expect(res.status).toBe(200);
    expect(res.body.contractId).toBe("PLAT-DEPLOY-v1");
    expect(res.body.sdkContractId).toBe("EDGE-SDK-v1");
    expect(Array.isArray(res.body.sdkBoundary.allowedHooks)).toBe(true);
    expect(Array.isArray(res.body.sdkBoundary.allowedCapabilities)).toBe(true);
    expect(res.body.sdkBoundary.maxLimits).toMatchObject({
      hooks: expect.any(Number),
      capabilities: expect.any(Number)
    });
  });

  it("rejects non-admin access", async () => {
    const res = await request(app)
      .get("/api/extensions/runtime")
      .set("x-user-role", "Operator")
      .set("x-user-id", "1");
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "forbidden" });
  });

  it("registers blocked plugin when EDGE is disabled", async () => {
    await setModuleFlags({
      CORE: true,
      QUALITY_PRO: false,
      INTEGRATION_SUITE: false,
      ANALYTICS_SUITE: false,
      MULTISITE: false,
      EDGE: false
    });

    const pluginId = `edge-disabled-${Date.now()}`;
    createdPluginIds.push(pluginId);

    const res = await adminReq("post", "/api/extensions/plugins").send({
      pluginId,
      displayName: "Edge Disabled",
      version: "1.0.0",
      hooks: runtimeBoundary.allowedHooks.slice(0, 2),
      capabilities: runtimeBoundary.allowedCapabilities.slice(0, 2)
    });

    expect(res.status).toBe(200);
    expect(res.body.plugin.policyStatus).toBe("blocked");
    expect(res.body.plugin.enabled).toBe(false);
    const codes = res.body.plugin.policyFindings.map((f) => f.code);
    expect(codes).toContain("module_disabled");
  });

  it("registers allowed plugin when EDGE enabled and then enables it", async () => {
    await setModuleFlags({
      CORE: true,
      QUALITY_PRO: false,
      INTEGRATION_SUITE: false,
      ANALYTICS_SUITE: false,
      MULTISITE: false,
      EDGE: true
    });

    const pluginId = `edge-allowed-${Date.now()}`;
    createdPluginIds.push(pluginId);

    const res = await adminReq("post", "/api/extensions/plugins").send({
      pluginId,
      displayName: "Edge Allowed",
      version: "1.0.0",
      hooks: runtimeBoundary.allowedHooks.slice(0, 2),
      capabilities: runtimeBoundary.allowedCapabilities.slice(0, 2)
    });

    expect(res.status).toBe(200);
    expect(res.body.plugin.policyStatus).toBe("allowed");

    const enableRes = await adminReq("post", `/api/extensions/plugins/${pluginId}/enable`);
    expect(enableRes.status).toBe(200);
    expect(enableRes.body.plugin.enabled).toBe(true);
  });

  it("blocks disallowed hooks and capabilities", async () => {
    await setModuleFlags({
      CORE: true,
      QUALITY_PRO: false,
      INTEGRATION_SUITE: false,
      ANALYTICS_SUITE: false,
      MULTISITE: false,
      EDGE: true
    });

    const pluginId = `edge-invalid-${Date.now()}`;
    createdPluginIds.push(pluginId);

    const res = await adminReq("post", "/api/extensions/plugins").send({
      pluginId,
      displayName: "Edge Invalid",
      version: "1.0.0",
      hooks: ["onEvil"],
      capabilities: ["root_access"]
    });

    expect(res.status).toBe(200);
    expect(res.body.plugin.policyStatus).toBe("blocked");
    const codes = res.body.plugin.policyFindings.map((f) => f.code);
    expect(codes).toContain("hook_not_allowed");
    expect(codes).toContain("capability_not_allowed");
  });
});
