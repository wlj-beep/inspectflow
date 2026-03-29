export function resolveLegacyPartnerSurfaceEnabled(rawValue, nodeEnv) {
  const setting = String(rawValue || "").trim().toLowerCase();
  if (setting) return setting === "true";
  return String(nodeEnv || "").trim().toLowerCase() === "test";
}
