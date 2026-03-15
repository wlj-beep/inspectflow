import { getPlatformEntitlements, getSeatUsageSnapshot } from "./entitlements.js";

export function normalizeUserInput(input) {
  return String(input || "").trim();
}

export function parseOptionalUserId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function mapAuthUser(row) {
  return {
    id: Number(row.id),
    name: row.name,
    role: row.role
  };
}

export function authRequestContext(req) {
  return {
    ipAddress: req.ip || null,
    userAgent: req.header("user-agent") || null
  };
}

function normalizeExpiresAt(expiresAt) {
  if (!expiresAt) return null;
  if (expiresAt instanceof Date) return expiresAt.toISOString();
  const parsed = new Date(expiresAt);
  return Number.isNaN(parsed.getTime()) ? expiresAt : parsed.toISOString();
}

export async function loadEntitlementsWithSeatUsage() {
  const entitlements = await getPlatformEntitlements();
  const seatUsage = await getSeatUsageSnapshot(entitlements);
  return { entitlements, seatUsage };
}

export async function buildAuthSessionPayload({ user, expiresAt, valid } = {}) {
  const { entitlements, seatUsage } = await loadEntitlementsWithSeatUsage();
  const payload = {
    user: mapAuthUser(user),
    expiresAt: normalizeExpiresAt(expiresAt),
    entitlements,
    seatUsage
  };
  if (typeof valid === "boolean") payload.valid = valid;
  return payload;
}

export function seatWarningAuditMetadata(seatUsage) {
  return {
    contractId: seatUsage.contractId,
    entitlementContractId: seatUsage.entitlementContractId,
    licenseTier: seatUsage.licenseTier,
    seatPack: seatUsage.seatPack,
    seatSoftLimit: seatUsage.seatSoftLimit,
    activeSessions: seatUsage.activeSessions,
    activeUsers: seatUsage.activeUsers,
    softLimitExceeded: seatUsage.softLimitExceeded
  };
}
