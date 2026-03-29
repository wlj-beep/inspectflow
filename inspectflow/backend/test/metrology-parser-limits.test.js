import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseMetrologyPayload } from "../src/services/integration/metrologyParsers.js";

describe("Metrology parser MAX_MEASUREMENTS input bound (BL-149)", () => {
  const originalEnv = {};

  beforeEach(() => {
    originalEnv.MAX_MEASUREMENTS_PER_IMPORT = process.env.MAX_MEASUREMENTS_PER_IMPORT;
  });

  afterEach(() => {
    if (originalEnv.MAX_MEASUREMENTS_PER_IMPORT === undefined) {
      delete process.env.MAX_MEASUREMENTS_PER_IMPORT;
    } else {
      process.env.MAX_MEASUREMENTS_PER_IMPORT = originalEnv.MAX_MEASUREMENTS_PER_IMPORT;
    }
  });

  it("parseVisionJson: returns structured error when measurements exceed MAX_MEASUREMENTS", () => {
    process.env.MAX_MEASUREMENTS_PER_IMPORT = "5";
    // Build a payload with 6 measurement items (exceeds limit of 5)
    const measurements = Array.from({ length: 6 }, (_, i) => ({
      jobId: `J-LIMIT-${i}`,
      operationRef: "010",
      pieceNumber: i + 1,
      dimensionName: `Dim-${i}`,
      value: "1.000"
    }));
    const result = parseMetrologyPayload({
      parserPack: "vision_result_json_v1",
      payload: { measurements }
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("measurement_limit_exceeded");
    expect(result.limit).toBe(5);
    expect(result.received).toBe(6);
  });

  it("parseVisionJson: accepts payload at exactly MAX_MEASUREMENTS", () => {
    process.env.MAX_MEASUREMENTS_PER_IMPORT = "3";
    const measurements = Array.from({ length: 3 }, (_, i) => ({
      jobId: `J-EXACT-${i}`,
      operationRef: "010",
      pieceNumber: i + 1,
      dimensionName: `Dim-${i}`,
      value: "1.000"
    }));
    const result = parseMetrologyPayload({
      parserPack: "vision_result_json_v1",
      payload: { measurements }
    });
    // Should not return a limit_exceeded error (ok may be false for row validation, but not for limit)
    expect(result).not.toMatchObject({ ok: false, error: "measurement_limit_exceeded" });
    expect(result.totalRows).toBe(3);
  });

  it("parseCmmCsv: returns structured error when rows exceed MAX_MEASUREMENTS", () => {
    process.env.MAX_MEASUREMENTS_PER_IMPORT = "2";
    // Build a CSV with 3 data rows (exceeds limit of 2)
    const header = "job_id,part_id,operation_ref,piece_number,dimension_name,value";
    const dataRows = Array.from(
      { length: 3 },
      (_, i) => `J-CMM,1234,020,${i + 1},BoreDia,0.625`
    );
    const csvText = [header, ...dataRows].join("\n");
    const result = parseMetrologyPayload({
      parserPack: "cmm_point_csv_v1",
      payload: { csvText }
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("measurement_limit_exceeded");
    expect(result.limit).toBe(2);
    expect(result.received).toBe(3);
  });

  it("parseGagePlaintext: returns structured error when lines exceed MAX_MEASUREMENTS", () => {
    process.env.MAX_MEASUREMENTS_PER_IMPORT = "2";
    // Build 3 gage lines (exceeds limit of 2)
    const lines = Array.from(
      { length: 3 },
      (_, i) => `job=J-GAGE,op=010,piece=${i + 1},feature=Dim,value=1.0`
    );
    const result = parseMetrologyPayload({
      parserPack: "gage_log_plaintext_v1",
      payload: { text: lines.join("\n") }
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("measurement_limit_exceeded");
    expect(result.limit).toBe(2);
    expect(result.received).toBe(3);
  });

  it("default limit is 50000 and normal-sized payloads are not rejected", () => {
    delete process.env.MAX_MEASUREMENTS_PER_IMPORT;
    const measurements = Array.from({ length: 10 }, (_, i) => ({
      jobId: `J-NORMAL-${i}`,
      operationRef: "010",
      pieceNumber: i + 1,
      dimensionName: `Dim-${i}`,
      value: "1.000"
    }));
    const result = parseMetrologyPayload({
      parserPack: "vision_result_json_v1",
      payload: { measurements }
    });
    expect(result).not.toMatchObject({ ok: false, error: "measurement_limit_exceeded" });
    expect(result.totalRows).toBe(10);
  });
});
