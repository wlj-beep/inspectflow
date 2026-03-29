import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

describe("Metrology parser pack ingest (BL-072)", () => {
  it("ingests vision payload through configured parser pack using characteristic external id mapping", async () => {
    const characteristicKey = `CHAR-BL072-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const jobId = `J-BL072-${crypto.randomUUID().slice(0, 8)}`;

    const partDimCsv = [
      "part_id,part_name,op_number,op_label,dimension_external_id,bubble_number,dimension_name,feature_type,gdt_class,tolerance_zone,feature_quantity,feature_units,feature_modifiers,nominal,tol_plus,tol_minus,unit,sampling,sampling_interval,input_mode,tool_it_nums",
      `1234,Hydraulic Cylinder Body,020,Bore & Finish,${characteristicKey},72,BL072 Bore Diameter,size,position,true_position,1,in,MMC;DATUM_A,0.6250,0.0030,0.0030,in,100pct,,single,`
    ].join("\n");
    const importDims = await request(app)
      .post("/api/imports/part-dimensions/csv")
      .set("x-user-role", "Admin")
      .send({ csvText: partDimCsv });
    expect(importDims.status).toBe(200);
    expect(Number(importDims.body.failed || 0)).toBe(0);

    const mappedRes = await query(
      `SELECT (ier.latest_internal_ref->>'dimensionId')::int AS dimension_id
       FROM import_external_entity_refs ier
       WHERE ier.import_type='part_dimensions'
         AND ier.entity_type='dimension'
         AND ier.external_id=$1
       LIMIT 1`,
      [characteristicKey]
    );
    const mappedDimensionId = Number(mappedRes.rows[0]?.dimension_id || 0);
    expect(mappedDimensionId).toBeGreaterThan(0);

    const dimOpRes = await query("SELECT operation_id FROM dimensions WHERE id=$1 LIMIT 1", [mappedDimensionId]);
    const operationId = Number(dimOpRes.rows[0]?.operation_id || 0);
    expect(operationId).toBeGreaterThan(0);

    const createJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: jobId,
        partId: "1234",
        partRevision: "A",
        operationId,
        lot: "Lot BL072",
        qty: 3,
        status: "open"
      });
    expect(createJob.status).toBe(201);

    const createIntegration = await request(app)
      .post("/api/imports/integrations")
      .set("x-user-role", "Admin")
      .send({
        name: `BL072 Vision ${crypto.randomUUID().slice(0, 6)}`,
        sourceType: "webhook",
        importType: "measurements",
        enabled: true,
        options: {
          parserPack: "vision_result_json_v1",
          mappingVersion: "v1"
        }
      });
    expect(createIntegration.status).toBe(201);
    const integrationId = createIntegration.body?.id;
    expect(integrationId).toBeTruthy();

    const pull = await request(app)
      .post(`/api/imports/integrations/${integrationId}/pull`)
      .set("x-user-role", "Admin")
      .send({
        measurements: [
          {
            jobId,
            operationId,
            operationRef: "020",
            pieceNumber: 1,
            characteristicExternalId: characteristicKey,
            value: "0.6252",
            isOot: false
          }
        ]
      });
    expect(pull.status).toBe(200);
    expect(Number(pull.body.failed || 0)).toBe(0);
    expect(Number(pull.body.inserted || 0)).toBe(1);

    const valueRes = await query(
      `SELECT rv.value
       FROM records r
       JOIN record_values rv ON rv.record_id=r.id
       WHERE r.job_id=$1
         AND rv.dimension_id=$2
       ORDER BY r.id DESC
       LIMIT 1`,
      [jobId, mappedDimensionId]
    );
    expect(valueRes.rows.length).toBe(1);
    expect(Number(valueRes.rows[0].value)).toBeCloseTo(0.6252, 6);
  });
});
