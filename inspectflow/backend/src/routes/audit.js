import { Router } from "express";
import { query } from "../db.js";
import { requireCapability } from "../middleware/requireCapability.js";
import { requireAuthenticated } from "../middleware/authSession.js";
import { hasCapability } from "../middleware/requireCapability.js";
import { normalizeIsoTimestamp } from "../services/dateValidation.js";

const router = Router();
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const DEFAULT_SUMMARY_PAGE_SIZE = 100;
const MAX_SUMMARY_PAGE_SIZE = 1000;
const SORT_COLUMNS = new Map([
  ["timestamp", "a.timestamp"],
  ["id", "a.id"],
  ["recordId", "a.record_id"],
  ["userId", "a.user_id"],
  ["userName", "u.name"],
  ["field", "a.field"],
  ["reason", "a.reason"]
]);

function parseOptionalPositiveInteger(value, name) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const err = new Error(`invalid_${name}`);
    err.status = 400;
    err.code = `invalid_${name}`;
    throw err;
  }
  return parsed;
}

function parseBoundedPositiveInteger(value, name, defaultValue, maxValue) {
  const raw = String(value ?? "").trim();
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const err = new Error(`invalid_${name}`);
    err.status = 400;
    err.code = `invalid_${name}`;
    throw err;
  }
  return Math.min(parsed, maxValue);
}

function parseBoundedLimit(value) {
  return parseBoundedPositiveInteger(value, "limit", DEFAULT_LIMIT, MAX_LIMIT);
}

function parseSortDirection(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "DESC";
  if (raw === "asc") return "ASC";
  if (raw === "desc") return "DESC";
  const err = new Error("invalid_sortDir");
  err.status = 400;
  err.code = "invalid_sortDir";
  throw err;
}

function parseSortColumn(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "timestamp";
  if (!SORT_COLUMNS.has(raw)) {
    const err = new Error("invalid_sortBy");
    err.status = 400;
    err.code = "invalid_sortBy";
    throw err;
  }
  return raw;
}

function parseAuditFilters(queryParams) {
  return {
    recordId: parseOptionalPositiveInteger(queryParams.recordId, "record_id"),
    userId: parseOptionalPositiveInteger(queryParams.userId, "user_id"),
    field: String(queryParams.field ?? "").trim() || null,
    from: normalizeIsoTimestamp(queryParams.from, "from"),
    to: normalizeIsoTimestamp(queryParams.to, "to"),
    limit: parseBoundedLimit(queryParams.limit),
    page: parseBoundedPositiveInteger(queryParams.page, "page", 1, Number.MAX_SAFE_INTEGER),
    pageSize: parseBoundedPositiveInteger(
      queryParams.pageSize ?? queryParams.limit,
      "pageSize",
      DEFAULT_SUMMARY_PAGE_SIZE,
      MAX_SUMMARY_PAGE_SIZE
    ),
    sortBy: parseSortColumn(queryParams.sortBy ?? queryParams.sort),
    sortDir: parseSortDirection(queryParams.sortDir ?? queryParams.order)
  };
}

function buildAuditWhereClause(filters) {
  const clauses = [];
  const params = [];

  if (filters.recordId != null) {
    params.push(filters.recordId);
    clauses.push(`a.record_id=$${params.length}`);
  }

  if (filters.userId != null) {
    params.push(filters.userId);
    clauses.push(`a.user_id=$${params.length}`);
  }

  if (filters.field) {
    params.push(filters.field);
    clauses.push(`a.field=$${params.length}`);
  }

  if (filters.from) {
    params.push(filters.from);
    clauses.push(`a.timestamp >= $${params.length}`);
  }

  if (filters.to) {
    params.push(filters.to);
    clauses.push(`a.timestamp <= $${params.length}`);
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params
  };
}

function buildAuditListQuery(filters) {
  const { whereSql, params } = buildAuditWhereClause(filters);
  const orderColumn = SORT_COLUMNS.get(filters.sortBy) || SORT_COLUMNS.get("timestamp");
  return {
    text: `
      SELECT a.*, u.name AS user_name
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id
      ${whereSql}
      ORDER BY ${orderColumn} ${filters.sortDir}, a.id ${filters.sortDir}
      LIMIT $${params.length + 1}
    `,
    params: [...params, filters.limit]
  };
}

function buildAuditSummaryInnerQuery(filters, selectClause, groupClause, orderClause, joinUsers = false) {
  const { whereSql, params } = buildAuditWhereClause(filters);
  return {
    text: `
      SELECT ${selectClause}
      FROM audit_log a
      ${joinUsers ? "LEFT JOIN users u ON u.id = a.user_id" : ""}
      ${whereSql}
      GROUP BY ${groupClause}
      ORDER BY ${orderClause}
      LIMIT ${MAX_SUMMARY_PAGE_SIZE}
    `,
    params
  };
}

function formatTimestamp(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function rowToCsvLine(row) {
  return [
    csvEscape(row.id),
    csvEscape(row.record_id),
    csvEscape(row.user_id),
    csvEscape(row.user_name || ""),
    csvEscape(formatTimestamp(row.timestamp)),
    csvEscape(row.field || ""),
    csvEscape(row.before_value || ""),
    csvEscape(row.after_value || ""),
    csvEscape(row.reason || "")
  ].join(",");
}

async function runAuditSummary(filters) {
  const fieldOrderClause = "count DESC, field ASC";
  const userOrderClause = "count DESC, user_name ASC";
  const fieldQuery = buildAuditSummaryInnerQuery(
    filters,
    "a.field AS field, COUNT(*)::int AS count",
    "a.field",
    fieldOrderClause
  );
  const userQuery = buildAuditSummaryInnerQuery(
    filters,
    "a.user_id AS user_id, COALESCE(u.name, '') AS user_name, COUNT(*)::int AS count",
    "a.user_id, u.name",
    userOrderClause,
    true
  );

  const pageOffset = (filters.page - 1) * filters.pageSize;
  const auditWhere = buildAuditWhereClause(filters);
  const [totalRes, fieldCountRes, fieldRowsRes, userCountRes, userRowsRes] = await Promise.all([
    query(
      `
        SELECT COUNT(*)::int AS total
        FROM audit_log a
        ${auditWhere.whereSql}
      `,
      auditWhere.params
    ),
    query(`SELECT COUNT(*)::int AS total_count FROM (${fieldQuery.text}) grouped`, fieldQuery.params),
    query(
      `SELECT * FROM (${fieldQuery.text}) grouped ORDER BY ${fieldOrderClause} LIMIT $${fieldQuery.params.length + 1} OFFSET $${fieldQuery.params.length + 2}`,
      [...fieldQuery.params, filters.pageSize, pageOffset]
    ),
    query(`SELECT COUNT(*)::int AS total_count FROM (${userQuery.text}) grouped`, userQuery.params),
    query(
      `SELECT * FROM (${userQuery.text}) grouped ORDER BY ${userOrderClause} LIMIT $${userQuery.params.length + 1} OFFSET $${userQuery.params.length + 2}`,
      [...userQuery.params, filters.pageSize, pageOffset]
    )
  ]);

  const buildPagination = (totalCount) => {
    const safeTotalCount = Number(totalCount || 0);
    const totalPages = safeTotalCount > 0 ? Math.ceil(safeTotalCount / filters.pageSize) : 0;
    return {
      page: filters.page,
      pageSize: filters.pageSize,
      totalCount: safeTotalCount,
      totalPages,
      hasPreviousPage: filters.page > 1,
      hasNextPage: filters.page < totalPages
    };
  };

  return {
    total: Number(totalRes.rows[0]?.total || 0),
    byField: fieldRowsRes.rows,
    byFieldPagination: buildPagination(fieldCountRes.rows[0]?.total_count),
    byUser: userRowsRes.rows,
    byUserPagination: buildPagination(userCountRes.rows[0]?.total_count)
  };
}

function respondWithAuditError(res, next, err) {
  if (err?.status) {
    return res.status(err.status).json({ error: err.code || "bad_request" });
  }
  return next(err);
}

async function hasAuditSummaryAccess(req) {
  if (req.auth?.user?.role === "Admin") return true;
  return hasCapability(req, "view_audit_summary");
}

router.get("/", requireCapability("view_records"), async (req, res, next) => {
  try {
    const filters = parseAuditFilters(req.query || {});
    const { text, params } = buildAuditListQuery(filters);
    const { rows } = await query(text, params);
    res.json(rows);
  } catch (err) {
    respondWithAuditError(res, next, err);
  }
});

router.get("/export.csv", requireCapability("view_records"), async (req, res, next) => {
  try {
    const filters = parseAuditFilters(req.query || {});
    const { text, params } = buildAuditListQuery(filters);
    const { rows } = await query(text, params);
    const header = [
      "id",
      "record_id",
      "user_id",
      "user_name",
      "timestamp",
      "field",
      "before_value",
      "after_value",
      "reason"
    ].join(",");
    res.type("text/csv");
    res.write(header);
    for (const row of rows) {
      res.write(`\n${rowToCsvLine(row)}`);
    }
    res.end();
  } catch (err) {
    respondWithAuditError(res, next, err);
  }
});

router.get("/summary", requireAuthenticated, async (req, res, next) => {
  try {
    if (!(await hasAuditSummaryAccess(req))) {
      return res.status(403).json({ error: "forbidden" });
    }
    const filters = parseAuditFilters(req.query || {});
    const summary = await runAuditSummary(filters);
    res.json(summary);
  } catch (err) {
    respondWithAuditError(res, next, err);
  }
});

export default router;
