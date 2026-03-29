import { describe, expect, it } from "vitest";
import { normalizeCalendarDate, normalizeIsoTimestamp } from "../src/services/dateValidation.js";

describe("BL-167 calendar-valid date normalization", () => {
  it("rejects calendar-impossible dates in the shared helper", () => {
    expect(() => normalizeCalendarDate("2026-02-30", "calibration_due_date")).toThrow("invalid_calibration_due_date");
    expect(() => normalizeIsoTimestamp("2026-02-30T10:00:00.000Z", "performed_at")).toThrow("invalid_performed_at");
  });

  it("normalizes valid date inputs for date-only and timestamp callers", () => {
    expect(normalizeCalendarDate("2026-12-31", "calibration_due_date")).toBe("2026-12-31");
    expect(normalizeIsoTimestamp("2026-03-15", "performed_at")).toBe("2026-03-15T00:00:00.000Z");
    expect(normalizeIsoTimestamp("2026-03-15T10:00:00.000Z", "performed_at")).toBe("2026-03-15T10:00:00.000Z");
  });
});
