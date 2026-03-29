import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

describe("Characteristic schema audit (BL-067)", () => {
  it("records create/update/delete events and enforces view_admin access", async () => {
    const opRes = await query("SELECT id FROM operations WHERE part_id=$1 AND op_number=$2 LIMIT 1", ["1234", "20"]);
    const operationId = opRes.rows[0]?.id;
    expect(operationId).toBeTruthy();

    const created = await request(app)
      .post("/api/dimensions")
      .set("x-user-role", "Admin")
      .send({
        operationId,
        name: "BL067 Audit Characteristic",
        bubbleNumber: "C-067",
        featureType: "size",
        gdtClass: "position",
        toleranceZone: "true_position",
        featureQuantity: 1,
        featureUnits: "in",
        featureModifiers: ["MMC", "DATUM_A"],
        sourceCharacteristicKey: "CHAR-BL067-001",
        nominal: 1.25,
        tolPlus: 0.01,
        tolMinus: 0.01,
        unit: "in",
        sampling: "100pct",
        inputMode: "single",
        toolIds: []
      });
    expect(created.status).toBe(201);
    const dimensionId = created.body?.id;
    expect(dimensionId).toBeTruthy();

    const updated = await request(app)
      .put(`/api/dimensions/${dimensionId}`)
      .set("x-user-role", "Admin")
      .send({
        bubbleNumber: "C-067-REV1",
        featureModifiers: ["LMC", "DATUM_B"],
        sourceCharacteristicKey: "CHAR-BL067-001"
      });
    expect(updated.status).toBe(200);
    expect(updated.body.bubble_number).toBe("C-067-REV1");

    const adminAudit = await request(app)
      .get(`/api/dimensions/${dimensionId}/characteristic-audit?limit=10`)
      .set("x-user-role", "Admin");
    expect(adminAudit.status).toBe(200);
    expect(Array.isArray(adminAudit.body.entries)).toBe(true);
    const adminActions = adminAudit.body.entries.map((entry) => entry.action);
    expect(adminActions).toContain("create");
    expect(adminActions).toContain("update");

    const deniedAudit = await request(app)
      .get(`/api/dimensions/${dimensionId}/characteristic-audit?limit=10`)
      .set("x-user-role", "Operator");
    expect(deniedAudit.status).toBe(403);
    expect(deniedAudit.body).toMatchObject({ error: "forbidden" });

    const removed = await request(app)
      .delete(`/api/dimensions/${dimensionId}`)
      .set("x-user-role", "Admin");
    expect(removed.status).toBe(200);

    const finalAudit = await request(app)
      .get(`/api/dimensions/${dimensionId}/characteristic-audit?limit=10`)
      .set("x-user-role", "Admin");
    expect(finalAudit.status).toBe(200);
    const actions = finalAudit.body.entries.map((entry) => entry.action);
    expect(actions).toContain("delete");
  });
});
