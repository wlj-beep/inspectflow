import { describe, expect, it } from "vitest";
import {
  mapPlatformEntitlements,
  summarizePackagingForAudit
} from "../src/services/platform/entitlements.js";

describe("platform entitlement packaging metadata", () => {
  it("projects bundle, seat policy, and upgrade prompt fields onto the entitlement contract", () => {
    const entitlements = mapPlatformEntitlements({
      license_tier: "core_plus",
      seat_pack: 30,
      seat_soft_limit: 28,
      seat_policy_option_id: "soft_buffer",
      hard_seat_enabled: false,
      directory_auth_enabled: false,
      directory_auth_mode: "local",
      diagnostics_opt_in: true,
      module_flags: {
        CORE: true,
        QUALITY_PRO: true,
        INTEGRATION_SUITE: false,
        ANALYTICS_SUITE: true,
        MULTISITE: false,
        EDGE: false
      },
      updated_at: "2026-03-31T12:00:00.000Z",
      updated_by_user_id: 7
    });

    expect(entitlements).toMatchObject({
      contractId: "PLAT-ENT-v1",
      licenseTier: "core_plus",
      seatPack: 30,
      seatSoftLimit: 28,
      diagnosticsOptIn: true,
      enabledModules: ["CORE", "QUALITY_PRO", "ANALYTICS_SUITE"]
    });
    expect(entitlements.packaging).toMatchObject({
      contractId: "COMM-PACKAGING-v1",
      licenseContractId: "COMM-LICENSE-v1",
      currentLicenseTier: "core_plus",
      hardSeatEnabled: false,
      activeBundleIds: ["core_site", "quality_pro", "analytics_suite"],
      authProfile: {
        contractId: "PLAT-AUTH-v1",
        localAccountMode: true,
        directoryEnabled: false,
        mode: "local",
        providerLabel: "Local Accounts"
      },
      seatPolicy: {
        optionId: "soft_buffer",
        contractId: "COMM-SEAT-v1",
        warningThreshold: 28,
        allocationMode: null
      }
    });
    expect(entitlements.packaging.seatPolicyOptions.map((option) => option.optionId)).toEqual(
      expect.arrayContaining(["soft_visibility", "soft_buffer"])
    );
    expect(entitlements.packaging.seatPolicyOptions.map((option) => option.optionId)).not.toEqual(
      expect.arrayContaining(["named_seat", "device_seat", "concurrent_seat"])
    );
    expect(entitlements.packaging.bundleCatalog.map((bundle) => bundle.bundleId)).toEqual(
      expect.arrayContaining(["core_site", "quality_pro", "integration_suite", "analytics_suite"])
    );
    expect(entitlements.packaging.upgradePrompts.map((prompt) => prompt.promptId)).toEqual(
      expect.arrayContaining(["upgrade_integration_suite", "upgrade_multisite"])
    );
    expect(entitlements.packaging.upgradePrompts.map((prompt) => prompt.promptId)).not.toContain("upgrade_quality_pro");

    expect(summarizePackagingForAudit(entitlements.packaging)).toMatchObject({
      contractId: "COMM-PACKAGING-v1",
      licenseContractId: "COMM-LICENSE-v1",
      activeBundleIds: ["core_site", "quality_pro", "analytics_suite"],
      hardSeatEnabled: false,
      authProfile: {
        contractId: "PLAT-AUTH-v1",
        localAccountMode: true,
        directoryEnabled: false,
        mode: "local",
        providerLabel: "Local Accounts",
        loginHint: "Local account login is active."
      },
      seatPolicy: {
        optionId: "soft_buffer",
        contractId: "COMM-SEAT-v1",
        warningThreshold: 28,
        allocationMode: null
      },
      contractMapping: {
        entitlementsContractId: "PLAT-ENT-v1",
        licenseContractId: "COMM-LICENSE-v1",
        seatContractId: "COMM-SEAT-v1"
      }
    });
  });

  it("exposes directory auth and hard-seat packaging when enabled", () => {
    const entitlements = mapPlatformEntitlements({
      license_tier: "enterprise",
      seat_pack: 18,
      seat_soft_limit: 18,
      seat_policy_option_id: "named_seat",
      hard_seat_enabled: true,
      directory_auth_enabled: true,
      directory_auth_mode: "hybrid",
      directory_auth_label: "Azure AD",
      directory_auth_issuer: "https://login.example.com",
      directory_auth_tenant: "tenant-42",
      diagnostics_opt_in: false,
      module_flags: {
        CORE: true,
        QUALITY_PRO: false,
        INTEGRATION_SUITE: true,
        ANALYTICS_SUITE: false,
        MULTISITE: false,
        EDGE: false
      }
    });

    expect(entitlements.authProfile).toMatchObject({
      localAccountMode: true,
      directoryEnabled: true,
      mode: "hybrid",
      providerLabel: "Azure AD",
      issuer: "https://login.example.com",
      tenant: "tenant-42"
    });
    expect(entitlements.packaging).toMatchObject({
      hardSeatEnabled: true,
      seatPolicy: {
        optionId: "named_seat",
        allocationMode: "named",
        hardSeatEnabled: true
      }
    });
    expect(entitlements.packaging.seatPolicyOptions.map((option) => option.optionId)).toEqual(
      expect.arrayContaining(["named_seat", "device_seat", "concurrent_seat"])
    );
  });
});
