import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

function randomPartId() {
  return `P-BBL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

describe("Characteristic bubbling import contract (BL-062/BL-063)", () => {
  it("upserts by external characteristic key and keeps metadata linked to one dimension", async () => {
    const partId = randomPartId();
    const characteristicKey = `CHAR-${partId}-010-01`;

    const firstCsv = [
      "part_id,part_name,op_number,op_label,dimension_external_id,bubble_number,dimension_name,feature_type,gdt_class,tolerance_zone,feature_quantity,feature_units,feature_modifiers,nominal,tol_plus,tol_minus,unit,sampling,sampling_interval,input_mode,tool_it_nums",
      `${partId},Bubbling Part,010,Op 10,${characteristicKey},10,Hole Diameter,size,position,true_position,1,in,MMC;DATUM_A,1.1250,0.0020,0.0020,in,100pct,,single,`
    ].join("\n");

    const firstImport = await request(app)
      .post("/api/imports/part-dimensions/csv")
      .set("x-user-role", "Admin")
      .send({ csvText: firstCsv });
    expect(firstImport.status).toBe(200);
    expect(Number(firstImport.body.failed || 0)).toBe(0);

    const firstDimRes = await query(
      `SELECT d.id, d.name, d.bubble_number, d.feature_type, d.gdt_class, d.tolerance_zone,
              d.feature_quantity, d.feature_units, d.feature_modifiers_json, d.source_characteristic_key,
              d.nominal, d.tol_plus, d.tol_minus
       FROM dimensions d
       JOIN operations o ON o.id=d.operation_id
       WHERE o.part_id=$1
       ORDER BY d.id ASC`,
      [partId]
    );
    expect(firstDimRes.rows.length).toBe(1);
    const firstDim = firstDimRes.rows[0];
    expect(firstDim.source_characteristic_key).toBe(characteristicKey);
    expect(firstDim.bubble_number).toBe("10");
    expect(firstDim.feature_type).toBe("size");
    expect(firstDim.gdt_class).toBe("position");
    expect(firstDim.tolerance_zone).toBe("true_position");
    expect(Number(firstDim.feature_quantity)).toBe(1);
    expect(firstDim.feature_units).toBe("in");
    expect(Array.isArray(firstDim.feature_modifiers_json)).toBe(true);
    expect(firstDim.feature_modifiers_json).toContain("MMC");

    const secondCsv = [
      "part_id,part_name,op_number,op_label,dimension_external_id,bubble_number,dimension_name,feature_type,gdt_class,tolerance_zone,feature_quantity,feature_units,feature_modifiers,nominal,tol_plus,tol_minus,unit,sampling,sampling_interval,input_mode,tool_it_nums",
      `${partId},Bubbling Part,010,Op 10,${characteristicKey},11,Hole Diameter Final,size,position,true_position,1,in,LMC;DATUM_B,1.1260,0.0015,0.0015,in,100pct,,single,`
    ].join("\n");

    const secondImport = await request(app)
      .post("/api/imports/part-dimensions/csv")
      .set("x-user-role", "Admin")
      .send({ csvText: secondCsv });
    expect(secondImport.status).toBe(200);
    expect(Number(secondImport.body.failed || 0)).toBe(0);

    const dimensionsRes = await query(
      `SELECT d.id, d.name, d.bubble_number, d.source_characteristic_key, d.feature_modifiers_json, d.nominal
       FROM dimensions d
       JOIN operations o ON o.id=d.operation_id
       WHERE o.part_id=$1
         AND d.source_characteristic_key=$2
       ORDER BY d.id ASC`,
      [partId, characteristicKey]
    );
    expect(dimensionsRes.rows.length).toBe(1);
    const finalDim = dimensionsRes.rows[0];
    expect(finalDim.id).toBe(firstDim.id);
    expect(finalDim.name).toBe("Hole Diameter Final");
    expect(finalDim.bubble_number).toBe("11");
    expect(Number(finalDim.nominal)).toBeCloseTo(1.126, 6);
    expect(finalDim.feature_modifiers_json).toContain("LMC");

    const refRes = await query(
      `SELECT latest_internal_ref
       FROM import_external_entity_refs
       WHERE import_type='part_dimensions'
         AND entity_type='dimension'
         AND external_id=$1
       LIMIT 1`,
      [characteristicKey]
    );
    expect(refRes.rows.length).toBe(1);
    expect(Number(refRes.rows[0].latest_internal_ref?.dimensionId || 0)).toBe(Number(finalDim.id));
  });
});
