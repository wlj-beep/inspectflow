import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

const createdPlugins = [];
const createdConnectors = [];

const adminHeaders = {
  "x-user-role": "Admin",
  "x-user-id": "10"
};

const operatorHeaders = {
  "x-user-role": "Operator",
  "x-user-id": "1"
};

async function insertPlugin({ pluginId, enabled, policyStatus }) {
  await query(
    `INSERT INTO platform_extensions
       (plugin_id, display_name, version, sdk_version, manifest_json, policy_status, policy_findings_json, enabled, required_module)
     VALUES ($1,$2,$3,'EDGE-SDK-v1',$4,$5,'[]'::jsonb,$6,'EDGE')
     ON CONFLICT (plugin_id) DO UPDATE
       SET policy_status=EXCLUDED.policy_status,
           enabled=EXCLUDED.enabled,
           updated_at=NOW()`,
    [pluginId, `Plugin ${pluginId}`, "1.0.0", {}, policyStatus, enabled]
  );
  createdPlugins.push(pluginId);
}

async function cleanup() {
  if (createdConnectors.length) {
    await query("DELETE FROM partner_connector_kits WHERE connector_id = ANY($1)", [createdConnectors]);
  }
  if (createdPlugins.length) {
    await query("DELETE FROM platform_extensions WHERE plugin_id = ANY($1)", [createdPlugins]);
  }
}

beforeAll(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

describe("Partner connector kit", () => {
  it("blocks non-admin access", async () => {
    const res = await request(app)
      .post("/api/partner-connectors/validate")
      .set(operatorHeaders)
      .send({
        connectorId: "sample",
        displayName: "Sample",
        version: "1.0.0",
        sourceTypes: ["api_pull"],
        importTypes: ["jobs"]
      });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "forbidden" });
  });

  it("catches invalid source/import types", async () => {
    const res = await request(app)
      .post("/api/partner-connectors/validate")
      .set(adminHeaders)
      .send({
        connectorId: "bad-types",
        displayName: "Bad Types",
        version: "1.0.0",
        sourceTypes: ["api_pull", "bad"],
        importTypes: ["jobs", "invalid"]
      });

    expect(res.status).toBe(200);
    expect(res.body.contractId).toBe("INT-CONNECTOR-v2");
    expect(res.body.validationStatus).toBe("invalid");
    const codes = res.body.findings.map((f) => f.code);
    expect(codes).toContain("source_type_not_allowed");
    expect(codes).toContain("import_type_not_allowed");
  });

  it("blocks registration when sdk plugin is not enabled", async () => {
    const pluginId = `plugin-disabled-${Date.now()}`;
    await insertPlugin({ pluginId, enabled: false, policyStatus: "allowed" });

    const connectorId = `connector-disabled-${Date.now()}`;
    const res = await request(app)
      .post("/api/partner-connectors")
      .set(adminHeaders)
      .send({
        connectorId,
        displayName: "Disabled Plugin",
        version: "1.0.0",
        sourceTypes: ["api_pull"],
        importTypes: ["jobs"],
        sdkPluginId: pluginId
      });

    expect(res.status).toBe(400);
    expect(res.body.validationStatus).toBe("invalid");
    const codes = res.body.findings.map((f) => f.code);
    expect(codes).toContain("sdk_plugin_disabled");
  });

  it("validates, registers, and lists a valid manifest", async () => {
    const pluginId = `plugin-enabled-${Date.now()}`;
    await insertPlugin({ pluginId, enabled: true, policyStatus: "allowed" });

    const connectorId = `connector-valid-${Date.now()}`;
    const payload = {
      connectorId,
      displayName: "Valid Connector",
      version: "1.0.0",
      sourceTypes: ["api_pull", "webhook"],
      importTypes: ["jobs", "measurements"],
      sdkPluginId: pluginId
    };

    const validate = await request(app)
      .post("/api/partner-connectors/validate")
      .set(adminHeaders)
      .send(payload);

    expect(validate.status).toBe(200);
    expect(validate.body.validationStatus).toBe("valid");

    const register = await request(app)
      .post("/api/partner-connectors")
      .set(adminHeaders)
      .send(payload);

    expect(register.status).toBe(200);
    expect(register.body.validationStatus).toBe("valid");
    expect(register.body.connector.connectorId).toBe(connectorId);

    createdConnectors.push(connectorId);

    const list = await request(app)
      .get("/api/partner-connectors")
      .set(adminHeaders);

    expect(list.status).toBe(200);
    const ids = list.body.connectors.map((c) => c.connectorId);
    expect(ids).toContain(connectorId);
  });
});
