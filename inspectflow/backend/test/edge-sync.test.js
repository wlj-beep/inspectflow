import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

const adminHeaders = {
  "x-user-role": "Admin",
  "x-user-id": "10"
};

const operatorHeaders = {
  "x-user-role": "Operator",
  "x-user-id": "1"
};

let originalModuleFlags = null;
let createdRunIds = [];

async function setEdgeEnabled(enabled) {
  const { rows } = await query(
    "SELECT module_flags FROM platform_entitlements WHERE id=1"
  );
  const flags = rows[0]?.module_flags || {};
  if (!originalModuleFlags) {
    originalModuleFlags = { ...flags };
  }
  const nextFlags = { ...flags, EDGE: enabled === true, CORE: flags.CORE !== false };
  await query(
    `UPDATE platform_entitlements
     SET module_flags=$1::jsonb, updated_at=NOW()
     WHERE id=1`,
    [JSON.stringify(nextFlags)]
  );
}

beforeAll(async () => {
  await setEdgeEnabled(true);
});

afterAll(async () => {
  if (createdRunIds.length) {
    await query("DELETE FROM edge_sync_runs WHERE id = ANY($1)", [createdRunIds]);
  }
  if (originalModuleFlags) {
    await query(
      `UPDATE platform_entitlements
       SET module_flags=$1::jsonb, updated_at=NOW()
       WHERE id=1`,
      [JSON.stringify(originalModuleFlags)]
    );
  }
});

describe("Edge sync API", () => {
  it("blocks non-admin", async () => {
    const res = await request(app)
      .get("/api/edge-sync/contracts")
      .set(operatorHeaders);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "forbidden" });
  });

  it("blocks when EDGE module is disabled", async () => {
    await setEdgeEnabled(false);
    const res = await request(app)
      .get("/api/edge-sync/contracts")
      .set(adminHeaders);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "edge_module_disabled" });

    await setEdgeEnabled(true);
  });

  it("returns contract requirements", async () => {
    const res = await request(app)
      .get("/api/edge-sync/contracts")
      .set(adminHeaders);

    expect(res.status).toBe(200);
    expect(res.body.contractId).toBe("EDGE-SYNC-v1");
    expect(res.body.requiredContracts).toEqual([
      "OPS-JOBFLOW-v1",
      "OPS-ROUTING-v1",
      "QUAL-TRACE-v1"
    ]);
  });

  it("returns snapshot datasets", async () => {
    const res = await request(app)
      .get("/api/edge-sync/snapshot")
      .set(adminHeaders);

    expect(res.status).toBe(200);
    expect(res.body.contractId).toBe("EDGE-SYNC-v1");
    expect(res.body.generatedAt).toBeTruthy();
    expect(res.body.datasets).toBeTruthy();
    expect(res.body.runId).toBeTruthy();
    createdRunIds.push(Number(res.body.runId));
    expect(Array.isArray(res.body.datasets.parts)).toBe(true);
    expect(Array.isArray(res.body.datasets.operations)).toBe(true);
    expect(Array.isArray(res.body.datasets.jobs)).toBe(true);
    expect(Array.isArray(res.body.datasets.tools)).toBe(true);
  });

  it("returns invalid findings for malformed payload", async () => {
    const res = await request(app)
      .post("/api/edge-sync/validate")
      .set(adminHeaders)
      .send({ datasets: { parts: [{}] } });

    expect(res.status).toBe(200);
    expect(res.body.validationStatus).toBe("invalid");
    expect(res.body.findings.length).toBeGreaterThan(0);
  });

  it("accepts valid payload and writes run log", async () => {
    const snapshot = await request(app)
      .get("/api/edge-sync/snapshot")
      .set(adminHeaders);

    const res = await request(app)
      .post("/api/edge-sync/validate")
      .set(adminHeaders)
      .send(snapshot.body);

    expect(res.status).toBe(200);
    expect(res.body.validationStatus).toBe("valid");
    expect(res.body.runId).toBeTruthy();

    const runId = Number(res.body.runId);
    createdRunIds.push(runId);

    const { rows } = await query(
      "SELECT id, contract_id, direction, validation_status FROM edge_sync_runs WHERE id=$1",
      [runId]
    );
    expect(rows[0]).toMatchObject({
      contract_id: "EDGE-SYNC-v1",
      direction: "payload_validate",
      validation_status: "valid"
    });
  });
});
