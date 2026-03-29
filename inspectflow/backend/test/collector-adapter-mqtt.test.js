/**
 * MQTT adapter unit tests (BL-120)
 */

import { describe, it, expect } from "vitest";
import { parseFrame } from "../src/services/collector/adapters/mqttAdapter.js";

describe("mqttAdapter.parseFrame", () => {
  it("parses a valid MQTT message", () => {
    const result = parseFrame({
      topic: "factory/line-1/CNC-02/bore_dia",
      payload: "12.445",
      timestamp: "2026-03-27T10:00:01Z",
      qos: 1
    });
    expect(result.ok).toBe(true);
    expect(result.readings).toHaveLength(1);
    expect(result.readings[0]).toMatchObject({
      deviceId: "CNC-02",
      tagName: "factory/line-1/CNC-02/bore_dia",
      value: 12.445,
      quality: "good"
    });
  });

  it("accepts numeric payload", () => {
    const result = parseFrame({
      topic: "a/b/device-1/tag",
      payload: 3.14,
      timestamp: "2026-03-27T10:00:00Z"
    });
    expect(result.ok).toBe(true);
    expect(result.readings[0].value).toBe(3.14);
  });

  it("returns error for missing topic", () => {
    const result = parseFrame({ payload: "1.0" });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("missing_topic");
  });

  it("returns error for non-object input", () => {
    expect(parseFrame(null).ok).toBe(false);
    expect(parseFrame("factory/x/y").ok).toBe(false);
  });

  it("returns error for too-short topic (< 3 segments)", () => {
    const result = parseFrame({ topic: "factory/line-1", payload: "1.0" });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("topic_too_short");
  });

  it("returns error for non-numeric payload", () => {
    const result = parseFrame({
      topic: "a/b/device/tag",
      payload: "not-a-number"
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("invalid_payload_value");
  });

  it("returns error for invalid timestamp", () => {
    const result = parseFrame({
      topic: "a/b/device/tag",
      payload: "5.0",
      timestamp: "not-a-date"
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("invalid_timestamp");
  });

  it("uses current time when timestamp omitted", () => {
    const before = Date.now();
    const result = parseFrame({ topic: "a/b/device/tag", payload: "1.0" });
    const after = Date.now();
    expect(result.ok).toBe(true);
    const ts = new Date(result.readings[0].timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
