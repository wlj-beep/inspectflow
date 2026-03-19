import { query, transaction } from "../../db.js";

const DEFAULT_SITE_ID = "default";

function normalizeSiteId(value) {
  const siteId = String(value || "").trim();
  if (!siteId) return null;
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(siteId)) return null;
  return siteId;
}

function normalizeSiteIds(siteIds) {
  if (!Array.isArray(siteIds)) return [];
  const deduped = new Set();
  for (const entry of siteIds) {
    const siteId = normalizeSiteId(entry);
    if (!siteId) continue;
    deduped.add(siteId);
  }
  return Array.from(deduped);
}

export async function ensureUserSiteAccessSeeded() {
  await query(
    `INSERT INTO user_site_access (user_id, site_id, is_default)
     SELECT id, $1, true
     FROM users
     ON CONFLICT (user_id, site_id) DO NOTHING`,
    [DEFAULT_SITE_ID]
  );
}

export async function getUserSiteAccess(userId) {
  const resolvedUserId = Number(userId);
  if (!Number.isInteger(resolvedUserId) || resolvedUserId <= 0) return [];
  await ensureUserSiteAccessSeeded();
  const { rows } = await query(
    `SELECT site_id, is_default
     FROM user_site_access
     WHERE user_id=$1
     ORDER BY is_default DESC, site_id ASC`,
    [resolvedUserId]
  );
  return rows.map((row) => ({
    siteId: row.site_id,
    isDefault: row.is_default === true
  }));
}

export async function getUserSiteAccessPayload(userId) {
  const siteAccess = await getUserSiteAccess(userId);
  return {
    userId: Number(userId),
    siteIds: siteAccess.map((entry) => entry.siteId),
    defaultSiteId: siteAccess.find((entry) => entry.isDefault)?.siteId || siteAccess[0]?.siteId || DEFAULT_SITE_ID
  };
}

export async function setUserSiteAccess(userId, { siteIds, defaultSiteId } = {}) {
  const resolvedUserId = Number(userId);
  if (!Number.isInteger(resolvedUserId) || resolvedUserId <= 0) {
    const err = new Error("invalid_user_id");
    err.status = 400;
    err.code = "invalid_user_id";
    throw err;
  }

  const normalizedSiteIds = normalizeSiteIds(siteIds);
  if (!normalizedSiteIds.length) {
    const err = new Error("site_ids_required");
    err.status = 400;
    err.code = "site_ids_required";
    throw err;
  }

  const resolvedDefault = normalizeSiteId(defaultSiteId) || normalizedSiteIds[0];
  if (!normalizedSiteIds.includes(resolvedDefault)) {
    const err = new Error("default_site_not_in_scope");
    err.status = 400;
    err.code = "default_site_not_in_scope";
    throw err;
  }

  const userExists = await query("SELECT id FROM users WHERE id=$1 LIMIT 1", [resolvedUserId]);
  if (!userExists.rows[0]) {
    const err = new Error("not_found");
    err.status = 404;
    err.code = "not_found";
    throw err;
  }

  await transaction(async (client) => {
    await client.query("DELETE FROM user_site_access WHERE user_id=$1", [resolvedUserId]);
    for (const siteId of normalizedSiteIds) {
      await client.query(
        `INSERT INTO user_site_access (user_id, site_id, is_default)
         VALUES ($1, $2, $3)`,
        [resolvedUserId, siteId, siteId === resolvedDefault]
      );
    }
  });

  return getUserSiteAccessPayload(resolvedUserId);
}
