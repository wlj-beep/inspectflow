const LEGACY_PARTNER_SURFACE_ENV = "INTEGRATION_LEGACY_PARTNER_SURFACES";

export function isLegacyPartnerIntegrationSurfaceEnabled() {
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  if (nodeEnv === "test") return true;
  return String(process.env[LEGACY_PARTNER_SURFACE_ENV] || "").trim().toLowerCase() === "true";
}

export function legacyPartnerSurfaceDisabledDetail() {
  return `Set ${LEGACY_PARTNER_SURFACE_ENV}=true to temporarily re-enable extensions and partner connector kit endpoints.`;
}

