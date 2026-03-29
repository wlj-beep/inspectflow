import { afterEach, describe, expect, it } from "vitest";
import {
  isLegacyPartnerIntegrationSurfaceEnabled,
  legacyPartnerSurfaceDisabledDetail
} from "../src/services/integration/partnerSurfaceFlags.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalLegacyPartnerSurfaces = process.env.INTEGRATION_LEGACY_PARTNER_SURFACES;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalLegacyPartnerSurfaces === undefined) {
    delete process.env.INTEGRATION_LEGACY_PARTNER_SURFACES;
  } else {
    process.env.INTEGRATION_LEGACY_PARTNER_SURFACES = originalLegacyPartnerSurfaces;
  }
});

describe("partner integration surface flags", () => {
  it("defaults on in test and off outside test unless the legacy flag is enabled", () => {
    process.env.NODE_ENV = "test";
    delete process.env.INTEGRATION_LEGACY_PARTNER_SURFACES;
    expect(isLegacyPartnerIntegrationSurfaceEnabled()).toBe(true);

    process.env.NODE_ENV = "production";
    delete process.env.INTEGRATION_LEGACY_PARTNER_SURFACES;
    expect(isLegacyPartnerIntegrationSurfaceEnabled()).toBe(false);

    process.env.INTEGRATION_LEGACY_PARTNER_SURFACES = "true";
    expect(isLegacyPartnerIntegrationSurfaceEnabled()).toBe(true);
  });

  it("describes the temporary re-enable switch in the disabled response detail", () => {
    expect(legacyPartnerSurfaceDisabledDetail()).toContain("INTEGRATION_LEGACY_PARTNER_SURFACES=true");
  });
});

