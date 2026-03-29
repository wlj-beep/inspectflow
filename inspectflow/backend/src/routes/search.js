import { Router } from "express";
import { query } from "../db.js";
import { getActorRole, getActorUserId, requireAuthenticated } from "../middleware/authSession.js";
import { getRoleCaps } from "../middleware/requireCapability.js";
import { getUserSiteAccess } from "../services/platform/siteAccess.js";

const router = Router();

const MAX_LIMIT = 50;

const ENTITY_CAPABILITIES = {
  job: ["view_operator", "view_jobs", "manage_jobs", "view_admin"],
  record: ["view_records", "view_operator", "view_admin"],
  issue: ["view_admin"],
  audit: ["view_admin"],
  tool: ["view_operator", "view_records", "view_admin"],
  user: ["manage_users"]
};

function normalizeQueryTerm(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function parseBoundedLimit(value) {
  const fallback = 20;
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, MAX_LIMIT);
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, "\\$&");
}

function buildLikePattern(term) {
  return `%${escapeLike(term)}%`;
}

function hasAnyCapability(caps, requiredCaps) {
  return requiredCaps.some((cap) => caps.includes(cap));
}

function scoreText(value, term, weight) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return 0;
  const needle = term.toLowerCase();
  if (!needle) return 0;
  if (text === needle) return weight * 4;
  if (text.startsWith(needle)) return weight * 2;
  if (text.includes(needle)) return weight;
  return 0;
}

function scoreFields(fields, term, weights) {
  let score = 0;
  for (let i = 0; i < fields.length; i += 1) {
    score += scoreText(fields[i], term, weights[i] ?? 1);
  }
  return score;
}

function parseSortAt(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function truncate(value, max = 120) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function compareSearchResults(a, b) {
  if (b._score !== a._score) return b._score - a._score;
  if (b._sortAt !== a._sortAt) return b._sortAt - a._sortAt;
  if (a.entityType !== b.entityType) return a.entityType.localeCompare(b.entityType);
  return a.entityId.localeCompare(b.entityId);
}

function finalizeResult(result) {
  const { _score, _sortAt, ...rest } = result;
  return rest;
}

function buildDeepLink(base) {
  const deepLink = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined && value !== null && value !== "") {
      deepLink[key] = value;
    }
  }
  return deepLink;
}

/**
 * Resolves the allowed site IDs for the requesting user.
 *
 * Site-scoping policy for global search:
 *   - Admin users: allowed site IDs = null (sentinel for "all sites, no filter").
 *   - Non-Admin users: allowed site IDs are read from user_site_access.
 *
 * Table site-awareness (as of BL-128):
 *   None of the tables queried by global search (jobs, records, issue_reports,
 *   audit_log, tools, users) carry a site_id column. As a result no additional
 *   WHERE clause is appended to those sub-queries. This function exists so that
 *   if site_id columns are added to those tables in future backlog items the
 *   allowed-site list is already threaded through to each sub-query helper.
 *
 * Returns: { allowedSiteIds: string[] | null }
 *   null means "no site filter" (Admin); a string array means the resolved set
 *   of site IDs the user is permitted to access.
 */
async function resolveSearchSiteScope(req) {
  const role = getActorRole(req);
  if (role === "Admin") {
    return { allowedSiteIds: null };
  }

  const userId = getActorUserId(req);
  if (!Number.isInteger(userId) || userId <= 0) {
    const err = new Error("unauthenticated");
    err.status = 401;
    err.code = "unauthenticated";
    throw err;
  }

  const siteAccess = await getUserSiteAccess(userId);
  const allowedSiteIds = siteAccess.map((entry) => entry.siteId);
  if (!allowedSiteIds.length) allowedSiteIds.push("default");
  return { allowedSiteIds };
}

// jobs table has no site_id column — allowedSiteIds is accepted for API consistency
// but no additional WHERE clause is applied (table is not site-aware as of BL-128).
async function searchJobs(term, likePattern, limit, _allowedSiteIds) {
  const { rows } = await query(
    `SELECT j.id, j.part_id, p.description AS part_description, j.part_revision_code, j.operation_id,
            o.op_number, o.label AS operation_label, j.lot, j.qty, j.status, j.lock_timestamp
     FROM jobs j
     JOIN parts p ON p.id = j.part_id
     JOIN operations o ON o.id = j.operation_id
     WHERE j.id ILIKE $1 ESCAPE '\\'
        OR j.part_id ILIKE $1 ESCAPE '\\'
        OR j.lot ILIKE $1 ESCAPE '\\'
        OR j.part_revision_code ILIKE $1 ESCAPE '\\'
        OR p.description ILIKE $1 ESCAPE '\\'
        OR o.op_number ILIKE $1 ESCAPE '\\'
        OR o.label ILIKE $1 ESCAPE '\\'
     ORDER BY j.id DESC
     LIMIT $2`,
    [likePattern, limit]
  );

  return rows.map((row) => ({
    entityType: "job",
    entityId: String(row.id),
    title: `Job ${row.id}`,
    subtitle: `Part ${row.part_id} · lot ${row.lot} · op ${row.op_number}`,
    context: row.part_description
      ? `${row.part_description} · qty ${row.qty} · status ${row.status}`
      : `qty ${row.qty} · status ${row.status}`,
    deepLink: buildDeepLink({
      view: `/jobs/${row.id}`,
      jobId: String(row.id),
      partId: String(row.part_id)
    }),
    _score: scoreFields(
      [row.id, row.part_id, row.part_revision_code, row.lot, row.part_description, row.op_number, row.operation_label, row.status],
      term,
      [100, 80, 30, 60, 20, 20, 20, 10]
    ),
    _sortAt: parseSortAt(row.lock_timestamp)
  }));
}

// records table has no site_id column — allowedSiteIds is accepted for API consistency
// but no additional WHERE clause is applied (table is not site-aware as of BL-128).
async function searchRecords(term, likePattern, limit, _allowedSiteIds) {
  const { rows } = await query(
    `SELECT r.id, r.job_id, r.part_id, p.description AS part_description, r.operation_id,
            o.op_number, o.label AS operation_label, r.lot, r.serial_number, r.qty,
            r.timestamp, r.operator_user_id, u.name AS operator_name, r.status, r.oot, r.comment
     FROM records r
     JOIN jobs j ON j.id = r.job_id
     JOIN parts p ON p.id = r.part_id
     JOIN operations o ON o.id = r.operation_id
     JOIN users u ON u.id = r.operator_user_id
     WHERE r.id::text ILIKE $1 ESCAPE '\\'
        OR r.job_id ILIKE $1 ESCAPE '\\'
        OR r.part_id ILIKE $1 ESCAPE '\\'
        OR r.lot ILIKE $1 ESCAPE '\\'
        OR COALESCE(r.serial_number, '') ILIKE $1 ESCAPE '\\'
        OR COALESCE(r.comment, '') ILIKE $1 ESCAPE '\\'
        OR u.name ILIKE $1 ESCAPE '\\'
        OR p.description ILIKE $1 ESCAPE '\\'
        OR o.op_number ILIKE $1 ESCAPE '\\'
        OR o.label ILIKE $1 ESCAPE '\\'
     ORDER BY r.timestamp DESC, r.id DESC
     LIMIT $2`,
    [likePattern, limit]
  );

  return rows.map((row) => ({
    entityType: "record",
    entityId: String(row.id),
    title: `Record ${row.id}`,
    subtitle: `Job ${row.job_id} · part ${row.part_id} · lot ${row.lot}`,
    context: row.serial_number
      ? `Serial ${row.serial_number} · ${row.operator_name} · ${row.status}`
      : `${row.operator_name} · ${row.status}`,
    deepLink: buildDeepLink({
      view: `/records/${row.id}`,
      recordId: String(row.id),
      jobId: String(row.job_id),
      partId: String(row.part_id)
    }),
    _score: scoreFields(
      [row.id, row.job_id, row.part_id, row.lot, row.serial_number, row.comment, row.operator_name, row.part_description, row.operation_label, row.op_number, row.status],
      term,
      [90, 80, 70, 50, 90, 25, 20, 15, 15, 15, 10]
    ),
    _sortAt: parseSortAt(row.timestamp)
  }));
}

// issue_reports table has no site_id column — allowedSiteIds is accepted for API consistency
// but no additional WHERE clause is applied (table is not site-aware as of BL-128).
async function searchIssues(term, likePattern, limit, _allowedSiteIds) {
  const { rows } = await query(
    `SELECT ir.id, ir.category, ir.details, ir.status, ir.part_id, ir.operation_id, ir.dimension_id,
            ir.job_id, ir.record_id, ir.submitted_by_user_id, u.name AS submitted_by_name,
            ir.submitted_by_role, ir.submitted_at, ir.resolved_by_user_id, ru.name AS resolved_by_name,
            ir.resolved_at, ir.resolution_note, p.description AS part_description,
            o.label AS operation_label, d.name AS dimension_name
     FROM issue_reports ir
     LEFT JOIN users u ON u.id = ir.submitted_by_user_id
     LEFT JOIN users ru ON ru.id = ir.resolved_by_user_id
     LEFT JOIN parts p ON p.id = ir.part_id
     LEFT JOIN operations o ON o.id = ir.operation_id
     LEFT JOIN dimensions d ON d.id = ir.dimension_id
     WHERE ir.id::text ILIKE $1 ESCAPE '\\'
        OR ir.category ILIKE $1 ESCAPE '\\'
        OR ir.details ILIKE $1 ESCAPE '\\'
        OR ir.status ILIKE $1 ESCAPE '\\'
        OR COALESCE(ir.part_id, '') ILIKE $1 ESCAPE '\\'
        OR COALESCE(ir.job_id, '') ILIKE $1 ESCAPE '\\'
        OR COALESCE(ir.record_id::text, '') ILIKE $1 ESCAPE '\\'
        OR COALESCE(u.name, '') ILIKE $1 ESCAPE '\\'
        OR COALESCE(p.description, '') ILIKE $1 ESCAPE '\\'
        OR COALESCE(o.label, '') ILIKE $1 ESCAPE '\\'
        OR COALESCE(d.name, '') ILIKE $1 ESCAPE '\\'
     ORDER BY ir.submitted_at DESC, ir.id DESC
     LIMIT $2`,
    [likePattern, limit]
  );

  return rows.map((row) => ({
    entityType: "issue",
    entityId: String(row.id),
    title: `Issue ${row.id} · ${row.category}`,
    subtitle: `Status ${row.status} · submitted by ${row.submitted_by_name || row.submitted_by_role}`,
    context: truncate(row.details, 120),
    deepLink: buildDeepLink({
      view: "/issues",
      adminTab: "issues",
      issueId: String(row.id),
      jobId: row.job_id ? String(row.job_id) : null,
      recordId: row.record_id ? String(row.record_id) : null
    }),
    _score: scoreFields(
      [row.id, row.category, row.details, row.status, row.part_id, row.job_id, row.record_id, row.submitted_by_name, row.part_description, row.operation_label, row.dimension_name],
      term,
      [100, 80, 70, 25, 25, 25, 25, 20, 10, 10, 10]
    ),
    _sortAt: parseSortAt(row.submitted_at)
  }));
}

// audit_log table has no site_id column — allowedSiteIds is accepted for API consistency
// but no additional WHERE clause is applied (table is not site-aware as of BL-128).
async function searchAudit(term, likePattern, limit, _allowedSiteIds) {
  const { rows } = await query(
    `SELECT a.id, a.record_id, a.user_id, u.name AS user_name, a.field, a.before_value,
            a.after_value, a.reason, a.timestamp, r.job_id, r.part_id, r.lot, r.serial_number
     FROM audit_log a
     JOIN records r ON r.id = a.record_id
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.id::text ILIKE $1 ESCAPE '\\'
        OR a.field ILIKE $1 ESCAPE '\\'
        OR COALESCE(a.before_value, '') ILIKE $1 ESCAPE '\\'
        OR COALESCE(a.after_value, '') ILIKE $1 ESCAPE '\\'
        OR a.reason ILIKE $1 ESCAPE '\\'
        OR a.record_id::text ILIKE $1 ESCAPE '\\'
        OR r.job_id ILIKE $1 ESCAPE '\\'
        OR r.part_id ILIKE $1 ESCAPE '\\'
        OR r.lot ILIKE $1 ESCAPE '\\'
        OR COALESCE(r.serial_number, '') ILIKE $1 ESCAPE '\\'
        OR COALESCE(u.name, '') ILIKE $1 ESCAPE '\\'
     ORDER BY a.timestamp DESC, a.id DESC
     LIMIT $2`,
    [likePattern, limit]
  );

  return rows.map((row) => ({
    entityType: "audit",
    entityId: String(row.id),
    title: `Audit ${row.id} · ${row.field}`,
    subtitle: `Record ${row.record_id} · ${row.user_name || `user ${row.user_id}`}`,
    context: truncate(row.reason || `${row.before_value || ""} -> ${row.after_value || ""}`, 120),
    deepLink: buildDeepLink({
      view: "/audit",
      adminTab: "audit",
      recordId: String(row.record_id),
      auditId: String(row.id)
    }),
    _score: scoreFields(
      [row.id, row.field, row.before_value, row.after_value, row.reason, row.record_id, row.job_id, row.part_id, row.lot, row.serial_number, row.user_name],
      term,
      [100, 80, 40, 40, 70, 30, 20, 20, 20, 20, 20]
    ),
    _sortAt: parseSortAt(row.timestamp)
  }));
}

// tools table has no site_id column — allowedSiteIds is accepted for API consistency
// but no additional WHERE clause is applied (table is not site-aware as of BL-128).
async function searchTools(term, likePattern, limit, _allowedSiteIds) {
  const { rows } = await query(
    `SELECT t.id, t.name, t.type, t.it_num, t.size, t.active, t.visible,
            t.calibration_due_date, cl.name AS current_location_name,
            hl.name AS home_location_name
     FROM tools t
     LEFT JOIN tool_locations cl ON cl.id = t.current_location_id
     LEFT JOIN tool_locations hl ON hl.id = t.home_location_id
     WHERE t.id::text ILIKE $1 ESCAPE '\\'
        OR t.name ILIKE $1 ESCAPE '\\'
        OR t.type ILIKE $1 ESCAPE '\\'
        OR t.it_num ILIKE $1 ESCAPE '\\'
        OR COALESCE(t.size, '') ILIKE $1 ESCAPE '\\'
        OR COALESCE(cl.name, '') ILIKE $1 ESCAPE '\\'
        OR COALESCE(hl.name, '') ILIKE $1 ESCAPE '\\'
     ORDER BY t.name ASC, t.id ASC
     LIMIT $2`,
    [likePattern, limit]
  );

  return rows.map((row) => ({
    entityType: "tool",
    entityId: String(row.id),
    title: row.name,
    subtitle: `${row.type} · IT ${row.it_num}`,
    context: row.current_location_name || row.home_location_name || row.size || "tool",
    deepLink: buildDeepLink({
      view: `/tools/${row.id}`,
      toolId: String(row.id)
    }),
    _score: scoreFields(
      [row.id, row.name, row.type, row.it_num, row.size, row.current_location_name, row.home_location_name],
      term,
      [90, 100, 30, 80, 15, 15, 15]
    ),
    _sortAt: 0
  }));
}

// users table has no site_id column — allowedSiteIds is accepted for API consistency
// but no additional WHERE clause is applied (table is not site-aware as of BL-128).
async function searchUsers(term, likePattern, limit, _allowedSiteIds) {
  const { rows } = await query(
    `SELECT id, name, role, active
     FROM users
     WHERE id::text ILIKE $1 ESCAPE '\\'
        OR name ILIKE $1 ESCAPE '\\'
        OR role ILIKE $1 ESCAPE '\\'
     ORDER BY name ASC, id ASC
     LIMIT $2`,
    [likePattern, limit]
  );

  return rows.map((row) => ({
    entityType: "user",
    entityId: String(row.id),
    title: row.name,
    subtitle: `${row.role} · ${row.active ? "active" : "inactive"}`,
    context: `User ${row.id}`,
    deepLink: buildDeepLink({
      view: "/users",
      adminTab: "users",
      userId: String(row.id)
    }),
    _score: scoreFields(
      [row.id, row.name, row.role, row.active ? "active" : "inactive"],
      term,
      [80, 100, 30, 10]
    ),
    _sortAt: 0
  }));
}

router.get("/global", requireAuthenticated, async (req, res, next) => {
  try {
    const { allowedSiteIds } = await resolveSearchSiteScope(req);

    const term = normalizeQueryTerm(req.query.q);
    if (!term) {
      return res.status(400).json({ error: "q_required" });
    }

    const limit = parseBoundedLimit(req.query.limit);
    const likePattern = buildLikePattern(term);
    const caps = await getRoleCaps(req);
    const searches = [];

    if (hasAnyCapability(caps, ENTITY_CAPABILITIES.job)) {
      searches.push(searchJobs(term, likePattern, limit, allowedSiteIds));
    }
    if (hasAnyCapability(caps, ENTITY_CAPABILITIES.record)) {
      searches.push(searchRecords(term, likePattern, limit, allowedSiteIds));
    }
    if (hasAnyCapability(caps, ENTITY_CAPABILITIES.issue)) {
      searches.push(searchIssues(term, likePattern, limit, allowedSiteIds));
    }
    if (hasAnyCapability(caps, ENTITY_CAPABILITIES.audit)) {
      searches.push(searchAudit(term, likePattern, limit, allowedSiteIds));
    }
    if (hasAnyCapability(caps, ENTITY_CAPABILITIES.tool)) {
      searches.push(searchTools(term, likePattern, limit, allowedSiteIds));
    }
    if (hasAnyCapability(caps, ENTITY_CAPABILITIES.user)) {
      searches.push(searchUsers(term, likePattern, limit, allowedSiteIds));
    }

    const buckets = await Promise.all(searches);
    const results = buckets.flat()
      .sort(compareSearchResults)
      .slice(0, limit)
      .map(finalizeResult);

    res.json(results);
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({ error: err.code || "search_error" });
    }
    next(err);
  }
});

export default router;
