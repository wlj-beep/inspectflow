import test from "node:test";
import assert from "node:assert/strict";
import { formatTimestampWithZone } from "../src/shared/utils/timestamps.js";

test("formatTimestampWithZone renders UTC with an explicit suffix", () => {
  const rendered = formatTimestampWithZone("2026-03-28T15:04:05.000Z", { withSeconds: true });
  assert.equal(rendered, "2026-03-28 15:04:05 UTC");
  assert.match(rendered, / UTC$/);
});

test("formatTimestampWithZone normalizes offset timestamps to UTC", () => {
  const easternOffset = formatTimestampWithZone("2026-03-28T11:04:05.000-04:00", { withSeconds: true });
  const utcInstant = formatTimestampWithZone("2026-03-28T15:04:05.000Z", { withSeconds: true });
  assert.equal(easternOffset, utcInstant);
});

test("formatTimestampWithZone preserves caller fallback behavior for blank and invalid input", () => {
  assert.equal(formatTimestampWithZone("", { empty: "n/a" }), "n/a");
  assert.equal(formatTimestampWithZone(null, { empty: "n/a" }), "n/a");
  assert.equal(formatTimestampWithZone("not-a-date"), "not-a-date");
});

