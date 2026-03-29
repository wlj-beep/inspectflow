/**
 * OPC-UA adapter unit tests (BL-120)
 */

import { describe, it, expect } from "vitest";
import { parseFrame } from "../src/services/collector/adapters/opcUaAdapter.js";

describe("opcUaAdapter.parseFrame", () => {
  it("parses a valid single-reading frame", () => {
    const result = parseFrame({
      deviceId: "CNC-01",
      readings: [
        { nodeId: "ns=2;s=BoreDia", value: 12.345, unit: "mm",
          timestamp: "2026-03-27T10:00:00Z", quality: "good" }
      ]
    });
    expect(result.ok).toBe(true);
    expect(result.readings).toHaveLength(1);
    expect(result.readings[0]).toMatchObject({
      deviceId: "CNC-01",
      tagName: "ns=2;s=BoreDia",
      value: 12.345,
      unit: "mm",
      quality: "good"
    });
    expect(result.errors).toHaveLength(0);
  });

  it("parses multiple readings from same device", () => {
    const result = parseFrame({
      deviceId: "CNC-02",
      readings: [
        { nodeId: "ns=2;s=OD", value: 10.1, quality: "good" },
        { nodeId: "ns=2;s=ID", value: 8.9, quality: "good" }
      ]
    });
    expect(result.ok).toBe(true);
    expect(result.readings).toHaveLength(2);
  });

  it("returns error for missing deviceId", () => {
    const result = parseFrame({ readings: [{ nodeId: "ns=2;s=X", value: 1, quality: "good" }] });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("missing_device_id");
  });

  it("returns error for non-object input", () => {
    expect(parseFrame(null).ok).toBe(false);
    expect(parseFrame("string").ok).toBe(false);
    expect(parseFrame(42).ok).toBe(false);
  });

  it("returns error for missing readings array", () => {
    const result = parseFrame({ deviceId: "CNC-01" });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("missing_readings");
  });

  it("skips reading with invalid value type", () => {
    const result = parseFrame({
      deviceId: "CNC-01",
      readings: [
        { nodeId: "ns=2;s=X", value: "not-a-number", quality: "good" },
        { nodeId: "ns=2;s=Y", value: 5.0, quality: "good" }
      ]
    });
    // second reading should succeed
    expect(result.ok).toBe(true);
    expect(result.readings).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
  });

  it("skips reading with quality=bad", () => {
    const result = parseFrame({
      deviceId: "CNC-01",
      readings: [{ nodeId: "ns=2;s=X", value: 1.0, quality: "bad" }]
    });
    // bad quality is valid — included in output
    expect(result.ok).toBe(true);
    expect(result.readings[0].quality).toBe("bad");
  });

  it("uses current time when timestamp is omitted", () => {
    const before = Date.now();
    const result = parseFrame({
      deviceId: "CNC-01",
      readings: [{ nodeId: "ns=2;s=X", value: 1.0, quality: "good" }]
    });
    const after = Date.now();
    expect(result.ok).toBe(true);
    const ts = new Date(result.readings[0].timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("all-invalid readings returns ok=false", () => {
    const result = parseFrame({
      deviceId: "CNC-01",
      readings: [
        { nodeId: "", value: 1.0, quality: "good" },
        { nodeId: "ns=2;s=X", value: NaN, quality: "good" }
      ]
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});
