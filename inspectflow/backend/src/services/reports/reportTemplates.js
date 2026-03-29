import { query as dbQuery } from "../../db.js";

export const REPORT_TEMPLATE_CONTRACT_ID = "PLAT-REPORT-v1";
let reportTemplateQuery = dbQuery;

export function setReportTemplateQuery(nextQuery) {
  reportTemplateQuery = typeof nextQuery === "function" ? nextQuery : dbQuery;
}

function runQuery(text, params) {
  return reportTemplateQuery(text, params);
}

const SUPPORTED_OUTPUT_FORMATS = [
  {
    key: "csv",
    label: "CSV",
    mimeType: "text/csv",
    extension: "csv",
    deliveryMode: "text"
  },
  {
    key: "pdf",
    label: "PDF",
    mimeType: "application/pdf",
    extension: "pdf",
    deliveryMode: "binary"
  },
  {
    key: "excel",
    label: "Excel",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
    deliveryMode: "binary"
  }
];

function compareText(a, b) {
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parsePositiveInteger(value, fallback = null) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return fallback;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return null;
}

function normalizeDateLike(value) {
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeFieldKey(value) {
  return String(value ?? "").trim();
}

function normalizeDirection(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "desc" ? "desc" : "asc";
}

function uniqueFields(fields, fallback) {
  const deduped = [];
  const source = Array.isArray(fields) && fields.length ? fields : fallback;
  for (const field of source || []) {
    const key = normalizeFieldKey(field);
    if (!key || deduped.includes(key)) continue;
    deduped.push(key);
  }
  return deduped;
}

function buildColumnMap(columns) {
  return columns.reduce((acc, column) => {
    acc[column.key] = column;
    return acc;
  }, {});
}

function buildEntityDefinition(definition) {
  const columnMap = buildColumnMap(definition.columns);
  return {
    ...definition,
    columnMap
  };
}

const ENTITY_DEFINITIONS = {
  job: buildEntityDefinition({
    label: "Job",
    defaultFields: [
      "id",
      "part_id",
      "part_description",
      "part_revision_code",
      "operation_id",
      "operation_number",
      "operation_label",
      "lot",
      "qty",
      "status"
    ],
    defaultSort: [
      { field: "id", direction: "desc" }
    ],
    columns: [
      { key: "id", label: "Job ID", type: "text" },
      { key: "part_id", label: "Part ID", type: "text" },
      { key: "part_description", label: "Part Description", type: "text" },
      { key: "part_revision_code", label: "Part Revision", type: "text" },
      { key: "operation_id", label: "Operation ID", type: "number" },
      { key: "operation_number", label: "Operation Number", type: "text" },
      { key: "operation_label", label: "Operation Label", type: "text" },
      { key: "lot", label: "Lot", type: "text" },
      { key: "qty", label: "Quantity", type: "number" },
      { key: "status", label: "Status", type: "text" },
      { key: "lock_owner_user_id", label: "Lock Owner User ID", type: "number" },
      { key: "lock_timestamp", label: "Lock Timestamp", type: "datetime" }
    ],
    async loadRows() {
      const { rows } = await runQuery(
        `SELECT j.id AS id,
                j.part_id AS part_id,
                p.description AS part_description,
                j.part_revision_code AS part_revision_code,
                j.operation_id AS operation_id,
                o.op_number AS operation_number,
                o.label AS operation_label,
                j.lot AS lot,
                j.qty AS qty,
                j.status AS status,
                j.lock_owner_user_id AS lock_owner_user_id,
                j.lock_timestamp AS lock_timestamp
         FROM jobs j
         JOIN parts p ON p.id = j.part_id
         JOIN operations o ON o.id = j.operation_id`
      );
      return rows;
    }
  }),
  record: buildEntityDefinition({
    label: "Record",
    defaultFields: [
      "id",
      "job_id",
      "part_id",
      "part_description",
      "operation_id",
      "operation_number",
      "operation_label",
      "lot",
      "qty",
      "status",
      "timestamp"
    ],
    defaultSort: [
      { field: "timestamp", direction: "desc" },
      { field: "id", direction: "desc" }
    ],
    columns: [
      { key: "id", label: "Record ID", type: "number" },
      { key: "job_id", label: "Job ID", type: "text" },
      { key: "part_id", label: "Part ID", type: "text" },
      { key: "part_description", label: "Part Description", type: "text" },
      { key: "operation_id", label: "Operation ID", type: "number" },
      { key: "operation_number", label: "Operation Number", type: "text" },
      { key: "operation_label", label: "Operation Label", type: "text" },
      { key: "lot", label: "Lot", type: "text" },
      { key: "serial_number", label: "Serial Number", type: "text" },
      { key: "qty", label: "Quantity", type: "number" },
      { key: "timestamp", label: "Timestamp", type: "datetime" },
      { key: "operator_user_id", label: "Operator User ID", type: "number" },
      { key: "operator_name", label: "Operator Name", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "oot", label: "OOT", type: "boolean" },
      { key: "comment", label: "Comment", type: "text" }
    ],
    async loadRows() {
      const { rows } = await runQuery(
        `SELECT r.id AS id,
                r.job_id AS job_id,
                r.part_id AS part_id,
                p.description AS part_description,
                r.operation_id AS operation_id,
                o.op_number AS operation_number,
                o.label AS operation_label,
                r.lot AS lot,
                r.serial_number AS serial_number,
                r.qty AS qty,
                r.timestamp AS timestamp,
                r.operator_user_id AS operator_user_id,
                u.name AS operator_name,
                r.status AS status,
                r.oot AS oot,
                r.comment AS comment
         FROM records r
         JOIN jobs j ON j.id = r.job_id
         JOIN parts p ON p.id = r.part_id
         JOIN operations o ON o.id = r.operation_id
         LEFT JOIN users u ON u.id = r.operator_user_id`
      );
      return rows;
    }
  }),
  tool: buildEntityDefinition({
    label: "Tool",
    defaultFields: [
      "id",
      "name",
      "type",
      "it_num",
      "size",
      "active",
      "visible"
    ],
    defaultSort: [
      { field: "name", direction: "asc" }
    ],
    columns: [
      { key: "id", label: "Tool ID", type: "number" },
      { key: "name", label: "Name", type: "text" },
      { key: "type", label: "Type", type: "text" },
      { key: "it_num", label: "IT Number", type: "text" },
      { key: "size", label: "Size", type: "text" },
      { key: "calibration_due_date", label: "Calibration Due Date", type: "date" },
      { key: "active", label: "Active", type: "boolean" },
      { key: "visible", label: "Visible", type: "boolean" },
      { key: "current_location_id", label: "Current Location ID", type: "number" },
      { key: "current_location_name", label: "Current Location Name", type: "text" },
      { key: "current_location_type", label: "Current Location Type", type: "text" },
      { key: "home_location_id", label: "Home Location ID", type: "number" },
      { key: "home_location_name", label: "Home Location Name", type: "text" },
      { key: "home_location_type", label: "Home Location Type", type: "text" }
    ],
    async loadRows() {
      const { rows } = await runQuery(
        `SELECT t.id AS id,
                t.name AS name,
                t.type AS type,
                t.it_num AS it_num,
                t.size AS size,
                t.calibration_due_date AS calibration_due_date,
                t.active AS active,
                t.visible AS visible,
                t.current_location_id AS current_location_id,
                cl.name AS current_location_name,
                cl.location_type AS current_location_type,
                t.home_location_id AS home_location_id,
                hl.name AS home_location_name,
                hl.location_type AS home_location_type
         FROM tools t
         LEFT JOIN tool_locations cl ON cl.id = t.current_location_id
         LEFT JOIN tool_locations hl ON hl.id = t.home_location_id`
      );
      return rows;
    }
  }),
  issue: buildEntityDefinition({
    label: "Issue",
    defaultFields: [
      "id",
      "category",
      "details",
      "status",
      "part_id",
      "job_id",
      "record_id"
    ],
    defaultSort: [
      { field: "submitted_at", direction: "desc" },
      { field: "id", direction: "desc" }
    ],
    columns: [
      { key: "id", label: "Issue ID", type: "number" },
      { key: "category", label: "Category", type: "text" },
      { key: "details", label: "Details", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "part_id", label: "Part ID", type: "text" },
      { key: "operation_id", label: "Operation ID", type: "number" },
      { key: "dimension_id", label: "Dimension ID", type: "number" },
      { key: "job_id", label: "Job ID", type: "text" },
      { key: "record_id", label: "Record ID", type: "number" },
      { key: "submitted_by_user_id", label: "Submitted By User ID", type: "number" },
      { key: "submitted_by_name", label: "Submitted By Name", type: "text" },
      { key: "submitted_by_role", label: "Submitted By Role", type: "text" },
      { key: "submitted_at", label: "Submitted At", type: "datetime" },
      { key: "resolved_by_user_id", label: "Resolved By User ID", type: "number" },
      { key: "resolved_by_name", label: "Resolved By Name", type: "text" },
      { key: "resolved_at", label: "Resolved At", type: "datetime" },
      { key: "resolution_note", label: "Resolution Note", type: "text" }
    ],
    async loadRows() {
      const { rows } = await runQuery(
        `SELECT ir.id AS id,
                ir.category AS category,
                ir.details AS details,
                ir.status AS status,
                ir.part_id AS part_id,
                ir.operation_id AS operation_id,
                ir.dimension_id AS dimension_id,
                ir.job_id AS job_id,
                ir.record_id AS record_id,
                ir.submitted_by_user_id AS submitted_by_user_id,
                u.name AS submitted_by_name,
                ir.submitted_by_role AS submitted_by_role,
                ir.submitted_at AS submitted_at,
                ir.resolved_by_user_id AS resolved_by_user_id,
                ru.name AS resolved_by_name,
                ir.resolved_at AS resolved_at,
                ir.resolution_note AS resolution_note
         FROM issue_reports ir
         LEFT JOIN users u ON u.id = ir.submitted_by_user_id
         LEFT JOIN users ru ON ru.id = ir.resolved_by_user_id`
      );
      return rows;
    }
  }),
  user: buildEntityDefinition({
    label: "User",
    defaultFields: [
      "id",
      "name",
      "role",
      "active"
    ],
    defaultSort: [
      { field: "name", direction: "asc" }
    ],
    columns: [
      { key: "id", label: "User ID", type: "number" },
      { key: "name", label: "Name", type: "text" },
      { key: "role", label: "Role", type: "text" },
      { key: "active", label: "Active", type: "boolean" },
      { key: "created_at", label: "Created At", type: "datetime" }
    ],
    async loadRows() {
      const { rows } = await runQuery(
        `SELECT id AS id,
                name AS name,
                role AS role,
                active AS active
         FROM users`
      );
      return rows;
    }
  })
};

const REPORT_ENTITY_TYPES = Object.keys(ENTITY_DEFINITIONS).sort();
const REPORT_TEMPLATE_SELECT_COLUMNS = [
  "id",
  "name",
  "description",
  "entity_type",
  "selected_fields",
  "filter_config",
  "sort_config",
  "output_formats",
  "scope_site_id",
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at"
].join(", ");

function resolveEntityDefinition(entityType) {
  const normalized = String(entityType || "").trim().toLowerCase();
  return ENTITY_DEFINITIONS[normalized] || null;
}

function normalizeTemplateName(value) {
  const name = normalizeText(value);
  if (!name || name.length > 160) return null;
  return name;
}

function normalizeDescription(value) {
  const description = normalizeText(value);
  return description || null;
}

function normalizeJsonArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback.slice();
}

function normalizeJsonObject(value, fallback = {}) {
  return isPlainObject(value) ? value : { ...fallback };
}

function normalizeExportFormats(value) {
  if (value == null) return SUPPORTED_OUTPUT_FORMATS.map((format) => format.key);
  const rawValues = Array.isArray(value) ? value : [value];
  const formats = [];
  for (const item of rawValues) {
    const key = normalizeFieldKey(item).toLowerCase();
    if (!key) continue;
    if (!SUPPORTED_OUTPUT_FORMATS.some((format) => format.key === key)) {
      return null;
    }
    if (!formats.includes(key)) formats.push(key);
  }
  return formats.length ? formats : SUPPORTED_OUTPUT_FORMATS.map((format) => format.key);
}

function normalizeSelectedFields(entityDefinition, value) {
  const fields = uniqueFields(value, entityDefinition.defaultFields);
  if (!fields.length) return entityDefinition.defaultFields.slice();
  for (const field of fields) {
    if (!entityDefinition.columnMap[field]) return null;
  }
  return fields;
}

function normalizeFilterRule(entityDefinition, rule) {
  if (!isPlainObject(rule)) return null;
  const field = normalizeFieldKey(rule.field ?? rule.column);
  if (!field || !entityDefinition.columnMap[field]) return null;
  const operator = String(rule.operator ?? "eq").trim().toLowerCase();
  const allowedOperators = new Set(["eq", "neq", "contains", "starts_with", "ends_with", "gt", "gte", "lt", "lte", "in"]);
  if (!allowedOperators.has(operator)) return null;
  let value = rule.value;
  if (operator === "in" && !Array.isArray(value)) {
    value = String(value ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return { field, operator, value };
}

function normalizeFilterConfig(entityDefinition, value) {
  if (value == null) {
    return { combinator: "and", rules: [] };
  }
  if (!isPlainObject(value)) return null;
  const combinator = String(value.combinator ?? value.logic ?? "and").trim().toLowerCase() === "or" ? "or" : "and";
  const rawRules = Array.isArray(value.rules) ? value.rules : Array.isArray(value.filters) ? value.filters : [];
  const rules = [];
  for (const rule of rawRules) {
    const normalized = normalizeFilterRule(entityDefinition, rule);
    if (!normalized) return null;
    rules.push(normalized);
  }
  return { combinator, rules };
}

function normalizeSortConfig(entityDefinition, value) {
  if (value == null) {
    return entityDefinition.defaultSort.map((rule) => ({ ...rule }));
  }
  const rawRules = Array.isArray(value) ? value : [value];
  const rules = [];
  for (const rule of rawRules) {
    if (!isPlainObject(rule)) return null;
    const field = normalizeFieldKey(rule.field ?? rule.column);
    if (!field || !entityDefinition.columnMap[field]) return null;
    rules.push({
      field,
      direction: normalizeDirection(rule.direction)
    });
  }
  return rules.length ? rules : entityDefinition.defaultSort.map((rule) => ({ ...rule }));
}

function normalizeTemplateRecord(template) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    site_id: template.siteId,
    entity_type: template.entityType,
    selected_fields: template.selectedFields.slice(),
    filter_config: clone(template.filterConfig),
    sort_config: clone(template.sortConfig),
    export_formats: template.exportFormats.slice(),
    created_by_user_id: template.createdByUserId,
    updated_by_user_id: template.updatedByUserId,
    created_at: template.createdAt,
    updated_at: template.updatedAt
  };
}

function templateFromRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description ?? null,
    siteId: row.scope_site_id,
    entityType: row.entity_type,
    selectedFields: normalizeJsonArray(row.selected_fields, []),
    filterConfig: normalizeJsonObject(row.filter_config, { combinator: "and", rules: [] }),
    sortConfig: normalizeJsonArray(row.sort_config, []),
    exportFormats: normalizeJsonArray(row.output_formats, []),
    createdByUserId: parsePositiveInteger(row.created_by_user_id),
    updatedByUserId: parsePositiveInteger(row.updated_by_user_id ?? row.created_by_user_id),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

function inferTemplateBody(input = {}) {
  return {
    name: input.name ?? input.templateName ?? input.title,
    description: input.description ?? input.templateDescription,
    entityType: input.entityType ?? input.entity_type,
    siteId: input.siteId ?? input.site_id,
    selectedFields: input.selectedFields ?? input.selected_fields ?? input.fields ?? input.columns,
    filterConfig: input.filterConfig ?? input.filter_config,
    sortConfig: input.sortConfig ?? input.sort_config,
    exportFormats: input.exportFormats ?? input.export_formats ?? input.outputFormats ?? input.output_formats
  };
}

function collectTemplateBody(existingTemplate, input = {}) {
  const inferred = inferTemplateBody(input);
  const entityTypeChanged = inferred.entityType !== undefined
    && String(inferred.entityType).trim().toLowerCase() !== existingTemplate.entityType;
  const entityDefinition = resolveEntityDefinition(inferred.entityType || existingTemplate.entityType);
  if (!entityDefinition) return { error: "invalid_entity_type" };

  const entityType = inferred.entityType ? String(inferred.entityType).trim().toLowerCase() : existingTemplate.entityType;
  const selectedFields = inferred.selectedFields !== undefined
    ? normalizeSelectedFields(entityDefinition, inferred.selectedFields)
    : entityTypeChanged ? entityDefinition.defaultFields.slice() : existingTemplate.selectedFields.slice();
  if (!selectedFields) return { error: "invalid_selected_fields" };

  const filterConfig = inferred.filterConfig !== undefined
    ? normalizeFilterConfig(entityDefinition, inferred.filterConfig)
    : entityTypeChanged ? { combinator: "and", rules: [] } : clone(existingTemplate.filterConfig);
  if (!filterConfig) return { error: "invalid_filter_config" };

  const sortConfig = inferred.sortConfig !== undefined
    ? normalizeSortConfig(entityDefinition, inferred.sortConfig)
    : entityTypeChanged ? entityDefinition.defaultSort.map((rule) => ({ ...rule })) : clone(existingTemplate.sortConfig);
  if (!sortConfig) return { error: "invalid_sort_config" };

  const exportFormats = inferred.exportFormats !== undefined
    ? normalizeExportFormats(inferred.exportFormats)
    : existingTemplate.exportFormats.slice();
  if (!exportFormats) return { error: "invalid_export_formats" };

  return {
    entityDefinition,
    payload: {
      name: inferred.name !== undefined ? normalizeTemplateName(inferred.name) : existingTemplate.name,
      description: inferred.description !== undefined ? normalizeDescription(inferred.description) : existingTemplate.description,
      entityType,
      selectedFields,
      filterConfig,
      sortConfig,
      exportFormats
    }
  };
}

function compareComparableValues(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (a instanceof Date || b instanceof Date) {
    return new Date(a).getTime() - new Date(b).getTime();
  }
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return compareText(a, b);
}

function normalizeComparableByType(value, type) {
  if (value === null || value === undefined) return null;
  if (type === "number") {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }
  if (type === "boolean") {
    return normalizeBool(value);
  }
  if (type === "date" || type === "datetime") {
    return normalizeDateLike(value);
  }
  return String(value).trim().toLowerCase();
}

function compareFieldValues(left, right, type) {
  if (type === "number") {
    const a = Number(left);
    const b = Number(right);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return a - b;
  }
  if (type === "boolean") {
    const a = normalizeBool(left);
    const b = normalizeBool(right);
    if (a === null || b === null) return 0;
    return Number(a) - Number(b);
  }
  if (type === "date" || type === "datetime") {
    const a = normalizeDateLike(left);
    const b = normalizeDateLike(right);
    if (!a || !b) return 0;
    return a.getTime() - b.getTime();
  }
  return compareText(left, right);
}

function evaluateFilterRule(row, rule, entityDefinition) {
  const column = entityDefinition.columnMap[rule.field];
  const rowValue = row[rule.field];
  const type = column?.type || "text";
  const normalizedRowValue = normalizeComparableByType(rowValue, type);
  const normalizedRuleValue = Array.isArray(rule.value)
    ? rule.value.map((entry) => normalizeComparableByType(entry, type)).filter((entry) => entry !== null)
    : normalizeComparableByType(rule.value, type);

  switch (rule.operator) {
    case "eq":
      return compareFieldValues(rowValue, rule.value, type) === 0;
    case "neq":
      return compareFieldValues(rowValue, rule.value, type) !== 0;
    case "contains":
      return String(rowValue ?? "").toLowerCase().includes(String(rule.value ?? "").toLowerCase());
    case "starts_with":
      return String(rowValue ?? "").toLowerCase().startsWith(String(rule.value ?? "").toLowerCase());
    case "ends_with":
      return String(rowValue ?? "").toLowerCase().endsWith(String(rule.value ?? "").toLowerCase());
    case "gt":
      return normalizedRowValue !== null && normalizedRuleValue !== null && normalizedRowValue > normalizedRuleValue;
    case "gte":
      return normalizedRowValue !== null && normalizedRuleValue !== null && normalizedRowValue >= normalizedRuleValue;
    case "lt":
      return normalizedRowValue !== null && normalizedRuleValue !== null && normalizedRowValue < normalizedRuleValue;
    case "lte":
      return normalizedRowValue !== null && normalizedRuleValue !== null && normalizedRowValue <= normalizedRuleValue;
    case "in":
      return Array.isArray(normalizedRuleValue) && normalizedRuleValue.some((candidate) => compareFieldValues(rowValue, candidate, type) === 0);
    default:
      return false;
  }
}

function applyFilterConfig(rows, filterConfig, entityDefinition) {
  if (!filterConfig?.rules?.length) return rows.slice();
  return rows.filter((row) => {
    const results = filterConfig.rules.map((rule) => evaluateFilterRule(row, rule, entityDefinition));
    if (filterConfig.combinator === "or") {
      return results.some(Boolean);
    }
    return results.every(Boolean);
  });
}

function applySortConfig(rows, sortConfig, entityDefinition) {
  const rules = sortConfig?.length ? sortConfig : entityDefinition.defaultSort;
  const copy = rows.slice();
  copy.sort((left, right) => {
    for (const rule of rules) {
      const column = entityDefinition.columnMap[rule.field];
      const type = column?.type || "text";
      const comparison = compareFieldValues(left[rule.field], right[rule.field], type);
      if (comparison !== 0) {
        return rule.direction === "desc" ? -comparison : comparison;
      }
    }
    return 0;
  });
  return copy;
}

function projectRows(rows, selectedFields) {
  return rows.map((row) => {
    const projected = {};
    for (const field of selectedFields) {
      projected[field] = row[field] ?? null;
    }
    return projected;
  });
}

function buildColumns(selectedFields, entityDefinition) {
  return selectedFields.map((field) => entityDefinition.columnMap[field] || { key: field, label: field, type: "text" });
}

function getTemplatePreviewPayload(template) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    site_id: template.siteId,
    entity_type: template.entityType,
    selected_fields: template.selectedFields.slice(),
    filter_config: clone(template.filterConfig),
    sort_config: clone(template.sortConfig),
    export_formats: template.exportFormats.slice(),
    created_at: template.createdAt,
    updated_at: template.updatedAt
  };
}

function listContracts() {
  return {
    contractId: REPORT_TEMPLATE_CONTRACT_ID,
    outputFormats: SUPPORTED_OUTPUT_FORMATS.map((format) => ({ ...format })),
    entityTypes: REPORT_ENTITY_TYPES.map((entityType) => {
      const definition = ENTITY_DEFINITIONS[entityType];
      return {
        entityType,
        label: definition.label,
        defaultFields: definition.defaultFields.slice(),
        defaultSort: definition.defaultSort.map((rule) => ({ ...rule })),
        fields: definition.columns.map((column) => ({ ...column }))
      };
    })
  };
}

export function resetReportTemplateStore() {
  // Intentionally a no-op now that templates are DB-backed.
}

async function findDuplicateTemplate({ siteId, name, ignoreId = null }) {
  const params = [siteId, name];
  let whereClause = "scope_site_id=$1 AND LOWER(name)=LOWER($2)";
  if (ignoreId !== null) {
    params.push(ignoreId);
    whereClause += ` AND id <> $3`;
  }
  const { rows } = await runQuery(
    `SELECT id
     FROM report_templates
     WHERE ${whereClause}
     LIMIT 1`,
    params
  );
  return rows[0] || null;
}

async function loadTemplateRow(templateId, siteId = null) {
  const params = [templateId];
  let whereClause = "id=$1";
  if (siteId) {
    params.push(siteId);
    whereClause += " AND scope_site_id=$2";
  }
  const { rows } = await runQuery(
    `SELECT ${REPORT_TEMPLATE_SELECT_COLUMNS}
     FROM report_templates
     WHERE ${whereClause}`,
    params
  );
  return rows[0] ? templateFromRow(rows[0]) : null;
}

async function listTemplateRows({ siteId = null, entityType = null } = {}) {
  const params = [];
  let whereClause = "";
  if (siteId) {
    params.push(siteId);
    whereClause = "WHERE scope_site_id=$1";
  }
  if (entityType) {
    params.push(String(entityType).trim().toLowerCase());
    whereClause += whereClause ? " AND" : " WHERE";
    whereClause += ` entity_type=$${params.length}`;
  }
  const { rows } = await runQuery(
    `SELECT ${REPORT_TEMPLATE_SELECT_COLUMNS}
     FROM report_templates
     ${whereClause}
     ORDER BY updated_at DESC, id DESC`,
    params
  );
  return rows.map((row) => normalizeTemplateRecord(templateFromRow(row))).filter(Boolean);
}

function buildPreviewTemplateFromInput(input = {}) {
  const inferred = inferTemplateBody(input);
  const entityDefinition = resolveEntityDefinition(inferred.entityType);
  if (!entityDefinition) return { error: "invalid_entity_type" };

  const selectedFields = normalizeSelectedFields(entityDefinition, inferred.selectedFields);
  if (!selectedFields) return { error: "invalid_selected_fields" };

  const filterConfig = normalizeFilterConfig(entityDefinition, inferred.filterConfig);
  if (!filterConfig) return { error: "invalid_filter_config" };

  const sortConfig = normalizeSortConfig(entityDefinition, inferred.sortConfig);
  if (!sortConfig) return { error: "invalid_sort_config" };

  const exportFormats = normalizeExportFormats(inferred.exportFormats);
  if (!exportFormats) return { error: "invalid_export_formats" };

  return {
    template: {
      id: null,
      name: normalizeTemplateName(inferred.name) || "Draft Template",
      description: normalizeDescription(inferred.description),
      siteId: inferred.siteId ? String(inferred.siteId).trim() : null,
      entityType: String(inferred.entityType).trim().toLowerCase(),
      selectedFields,
      filterConfig,
      sortConfig,
      exportFormats,
      createdByUserId: null,
      updatedByUserId: null,
      createdAt: null,
      updatedAt: null
    }
  };
}

export async function createReportTemplate(input = {}, { siteId = "default", actorUserId = null } = {}) {
  const inferred = inferTemplateBody(input);
  const name = normalizeTemplateName(inferred.name);
  if (!name) return { error: "invalid_template_name" };

  const entityDefinition = resolveEntityDefinition(inferred.entityType);
  if (!entityDefinition) return { error: "invalid_entity_type" };

  const selectedFields = normalizeSelectedFields(entityDefinition, inferred.selectedFields);
  if (!selectedFields) return { error: "invalid_selected_fields" };

  const filterConfig = normalizeFilterConfig(entityDefinition, inferred.filterConfig);
  if (!filterConfig) return { error: "invalid_filter_config" };

  const sortConfig = normalizeSortConfig(entityDefinition, inferred.sortConfig);
  if (!sortConfig) return { error: "invalid_sort_config" };

  const exportFormats = normalizeExportFormats(inferred.exportFormats);
  if (!exportFormats) return { error: "invalid_export_formats" };

  if (await findDuplicateTemplate({ siteId, name })) return { error: "duplicate_report_template" };

  const { rows } = await runQuery(
    `INSERT INTO report_templates
       (name, description, entity_type, selected_fields, filter_config, sort_config, output_formats, scope_site_id, created_by_user_id, updated_by_user_id)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10)
     RETURNING ${REPORT_TEMPLATE_SELECT_COLUMNS}`,
    [
      name,
      normalizeDescription(inferred.description),
      inferred.entityType.trim().toLowerCase(),
      JSON.stringify(selectedFields),
      JSON.stringify(filterConfig),
      JSON.stringify(sortConfig),
      JSON.stringify(exportFormats),
      siteId,
      parsePositiveInteger(actorUserId),
      parsePositiveInteger(actorUserId)
    ]
  );

  return normalizeTemplateRecord(templateFromRow(rows[0]));
}

export async function updateReportTemplate(templateId, input = {}, { siteId = "default", actorUserId = null } = {}) {
  const id = parsePositiveInteger(templateId);
  if (!id) return { error: "invalid_template_id" };

  const existing = await loadTemplateRow(id, siteId);
  if (!existing) return { error: "report_template_not_found" };

  const merged = collectTemplateBody(existing, input);
  if (merged.error) return merged;

  if (merged.payload.name && await findDuplicateTemplate({ siteId, name: merged.payload.name, ignoreId: id })) {
    return { error: "duplicate_report_template" };
  }

  if (!merged.payload.name) return { error: "invalid_template_name" };

  const { rows } = await runQuery(
    `UPDATE report_templates
     SET name=$1,
         description=$2,
         entity_type=$3,
         selected_fields=$4::jsonb,
         filter_config=$5::jsonb,
         sort_config=$6::jsonb,
         output_formats=$7::jsonb,
         updated_by_user_id=$8,
         updated_at=NOW()
     WHERE id=$9 AND scope_site_id=$10
     RETURNING ${REPORT_TEMPLATE_SELECT_COLUMNS}`,
    [
      merged.payload.name,
      merged.payload.description,
      merged.payload.entityType,
      JSON.stringify(merged.payload.selectedFields),
      JSON.stringify(merged.payload.filterConfig),
      JSON.stringify(merged.payload.sortConfig),
      JSON.stringify(merged.payload.exportFormats),
      parsePositiveInteger(actorUserId),
      id,
      siteId
    ]
  );

  if (!rows[0]) return { error: "report_template_not_found" };
  return normalizeTemplateRecord(templateFromRow(rows[0]));
}

export async function getReportTemplate(templateId, { siteId = null } = {}) {
  const id = parsePositiveInteger(templateId);
  if (!id) return null;
  const template = await loadTemplateRow(id, siteId);
  return template ? normalizeTemplateRecord(template) : null;
}

export async function listReportTemplates({ siteId = null, entityType = null } = {}) {
  return listTemplateRows({ siteId, entityType });
}

async function resolveTemplateForPreview(input = {}) {
  const templateId = parsePositiveInteger(input.templateId ?? input.template_id);
  if (templateId) {
    const siteId = input.siteId ? String(input.siteId).trim() : null;
    const template = await getReportTemplate(templateId, { siteId });
    if (!template) return { error: "report_template_not_found" };
    return { template: templateFromRow({
      id: template.id,
      name: template.name,
      description: template.description,
      entity_type: template.entity_type,
      selected_fields: template.selected_fields,
      filter_config: template.filter_config,
      sort_config: template.sort_config,
      output_formats: template.export_formats,
      scope_site_id: template.site_id,
      created_by_user_id: template.created_by_user_id,
      updated_by_user_id: template.updated_by_user_id,
      created_at: template.created_at,
      updated_at: template.updated_at
    }) };
  }

  return buildPreviewTemplateFromInput(input);
}

export async function previewReportTemplate(input = {}) {
  const resolved = await resolveTemplateForPreview(input);
  if (resolved.error) return { error: resolved.error };

  const template = resolved.template;
  const entityDefinition = resolveEntityDefinition(template.entityType);
  if (!entityDefinition) return { error: "invalid_entity_type" };

  const allRows = await entityDefinition.loadRows();
  const filteredRows = applyFilterConfig(allRows, template.filterConfig, entityDefinition);
  const sortedRows = applySortConfig(filteredRows, template.sortConfig, entityDefinition);
  const limit = Math.min(Math.max(parsePositiveInteger(input.limit, 25) || 25, 1), 250);
  const rows = projectRows(sortedRows.slice(0, limit), template.selectedFields);

  return {
    contractId: REPORT_TEMPLATE_CONTRACT_ID,
    template: normalizeTemplateRecord(template),
    entityType: template.entityType,
    columns: buildColumns(template.selectedFields, entityDefinition),
    totalRows: filteredRows.length,
    limit,
    rows
  };
}

export function getReportExportContracts() {
  return {
    contractId: REPORT_TEMPLATE_CONTRACT_ID,
    outputFormats: SUPPORTED_OUTPUT_FORMATS.map((format) => ({ ...format })),
    entityTypes: REPORT_ENTITY_TYPES.map((entityType) => {
      const definition = ENTITY_DEFINITIONS[entityType];
      return {
        entityType,
        label: definition.label,
        defaultFields: definition.defaultFields.slice(),
        defaultSort: definition.defaultSort.map((rule) => ({ ...rule })),
        fields: definition.columns.map((column) => ({ ...column }))
      };
    })
  };
}

export function getReportTemplateContractsSummary() {
  return listContracts();
}
