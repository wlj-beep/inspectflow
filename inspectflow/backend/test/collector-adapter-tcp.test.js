/**
 * TCP adapter unit tests (BL-120)
 */

import { describe, it, expect } from "vitest";
import { parseFrame } from "../src/services/collector/adapters/tcpAdapter.js";

describe("tcpAdapter.parseFrame", () => {
  it("parses a valid single-line frame", () => {
    const result = parseFrame(
      "device_id=CNC-03|tag=OD_DIA|value=12.300|unit=mm|ts=1711537200000"
    );
    expect(result.ok).toBe(true);
    expect(result.readings).toHaveLength(1);
    expect(result.readings[0]).toMatchObject({
      deviceId: "CNC-03",
      tagName: "OD_DIA",
      value: 12.300,
      unit: "mm"
    });
    expect(new Date(result.readings[0].timestamp).getTime()).toBe(1711537200000);
  });

  it("parses multi-line frame", () => {
    const input = [
      "device_id=CNC-03|tag=OD_DIA|value=12.300",
      "device_id=CNC-03|tag=ID_DIA|value=10.100"
    ].join("\n");
    const result = parseFrame(input);
    expect(result.ok).toBe(true);
    expect(result.readings).toHaveLength(2);
  });

  it("returns error for non-string input", () => {
    expect(parseFrame(null).ok).toBe(false);
    expect(parseFrame({ key: "value" }).ok).toBe(false);
    expect(parseFrame(42).ok).toBe(false);
  });

  it("returns error for empty frame", () => {
    expect(parseFrame("").ok).toBe(false);
    expect(parseFrame("   ").ok).toBe(false);
  });

  it("skips line with missing required keys", () => {
    const input = [
      "device_id=CNC-03|tag=X",         // missing value
      "device_id=CNC-03|tag=Y|value=5"   // valid
    ].join("\n");
    const result = parseFrame(input);
    expect(result.ok).toBe(true);
    expect(result.readings).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("missing_keys");
  });

  it("skips line with invalid value", () => {
    const input = [
      "device_id=CNC-03|tag=X|value=banana",
      "device_id=CNC-03|tag=Y|value=5"
    ].join("\n");
    const result = parseFrame(input);
    expect(result.ok).toBe(true);
    expect(result.readings).toHaveLength(1);
  });

  it("all-invalid returns ok=false", () => {
    const result = parseFrame("device_id=CNC|tag=X");
    expect(result.ok).toBe(false);
  });

  it("handles ISO timestamp in ts field", () => {
    const result = parseFrame("device_id=CNC-01|tag=X|value=1.0|ts=2026-03-27T10:00:00Z");
    expect(result.ok).toBe(true);
    expect(result.readings[0].timestamp).toBe("2026-03-27T10:00:00.000Z");
  });

  it("uses current time when ts is missing", () => {
    const before = Date.now();
    const result = parseFrame("device_id=CNC-01|tag=X|value=1.0");
    const after = Date.now();
    expect(result.ok).toBe(true);
    const ts = new Date(result.readings[0].timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
