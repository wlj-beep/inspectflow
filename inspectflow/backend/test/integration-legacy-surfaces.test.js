import { describe, expect, it } from "vitest";
import { resolveLegacyPartnerSurfaceEnabled } from "../src/services/integration/legacySurfaces.js";

describe("integration legacy surface gating (BL-081)", () => {
  it("defaults to enabled in test runtime when flag is unset", () => {
    expect(resolveLegacyPartnerSurfaceEnabled(undefined, "test")).toBe(true);
  });

  it("defaults to disabled outside test runtime when flag is unset", () => {
    expect(resolveLegacyPartnerSurfaceEnabled(undefined, "production")).toBe(false);
  });

  it("honors explicit false override", () => {
    expect(resolveLegacyPartnerSurfaceEnabled("false", "test")).toBe(false);
  });

  it("honors explicit true override", () => {
    expect(resolveLegacyPartnerSurfaceEnabled("true", "production")).toBe(true);
  });
});
