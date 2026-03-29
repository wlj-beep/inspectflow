import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";

describe("Metrology parser profile APIs (BL-064)", () => {
  it("lists available parser packs for admin diagnostics", async () => {
    const res = await request(app)
      .get("/api/imports/parsers/metrology/packs")
      .set("x-user-role", "Admin");
    expect(res.status).toBe(200);
    expect(res.body.contractId).toBe("INT-CONNECTOR-v2");
    expect(Array.isArray(res.body.packs)).toBe(true);
    expect(res.body.packs.length).toBeGreaterThan(0);
  });

  it("previews CMM parser mapping and reports accepted/rejected rows", async () => {
    const csvText = [
      "job_id,part_id,operation_ref,piece_number,dimension_name,value,is_oot",
      "J-10042,1234,020,1,Bore Diameter,0.6250,false",
      "J-10042,1234,020,2,,0.6260,false"
    ].join("\n");

    const res = await request(app)
      .post("/api/imports/parsers/metrology/preview")
      .set("x-user-role", "Admin")
      .send({
        parserPack: "cmm_point_csv_v1",
        payload: { csvText }
      });

    expect(res.status).toBe(200);
    expect(res.body.parserPack).toBe("cmm_point_csv_v1");
    expect(Number(res.body.totalRows || 0)).toBe(2);
    expect(Number(res.body.acceptedRows || 0)).toBe(1);
    expect(Number(res.body.rejectedRows || 0)).toBe(1);
    expect(Array.isArray(res.body.sampleRows)).toBe(true);
    expect(Array.isArray(res.body.rejected)).toBe(true);
  });

  it("rejects unsupported parser pack ids", async () => {
    const res = await request(app)
      .post("/api/imports/parsers/metrology/preview")
      .set("x-user-role", "Admin")
      .send({
        parserPack: "unknown_pack",
        payload: { csvText: "job_id,piece_number,dimension_name,value\nJ-1,1,A,1.0" }
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_parser_pack");
  });

  it("preserves non-numeric external characteristic ids for vision and gage parser packs", async () => {
    const vision = await request(app)
      .post("/api/imports/parsers/metrology/preview")
      .set("x-user-role", "Admin")
      .send({
        parserPack: "vision_result_json_v1",
        payload: {
          measurements: [
            {
              jobId: "J-10042",
              operationRef: "020",
              pieceNumber: 1,
              characteristicExternalId: "CHAR-VIS-001",
              value: "0.6250"
            }
          ]
        }
      });
    expect(vision.status).toBe(200);
    expect(Number(vision.body.acceptedRows || 0)).toBe(1);
    expect(vision.body.sampleRows?.[0]?.dimensionExternalId).toBe("CHAR-VIS-001");

    const gage = await request(app)
      .post("/api/imports/parsers/metrology/preview")
      .set("x-user-role", "Admin")
      .send({
        parserPack: "gage_log_plaintext_v1",
        payload: {
          text: "job=J-10042,op=020,piece=1,characteristic_external_id=CHAR-GAGE-002,value=0.6260"
        }
      });
    expect(gage.status).toBe(200);
    expect(Number(gage.body.acceptedRows || 0)).toBe(1);
    expect(gage.body.sampleRows?.[0]?.dimensionExternalId).toBe("CHAR-GAGE-002");
  });
});
