/**
 * No-code inspection form builder service.
 * BL-121 (OPS-FORMBUILDER-v1)
 *
 * Handles form template CRUD, publish/archive lifecycle,
 * submission persistence, and audit trail writes.
 */

import { query as dbQuery } from "../../db.js";

export const FORM_BUILDER_CONTRACT_ID = "OPS-FORMBUILDER-v1";

// Injected query function — overrideable in unit tests.
let formBuilderQuery = dbQuery;
export function setFormBuilderQuery(fn) {
  formBuilderQuery = typeof fn === "function" ? fn : dbQuery;
}
export function resetFormBuilderStore() {
  formBuilderQuery = dbQuery;
}

function run(text, params) {
  return formBuilderQuery(text, params);
}

// ── Field type catalog ────────────────────────────────────────────────────────

export const SUPPORTED_FIELD_TYPES = [
  "text",
  "number",
  "textarea",
  "select",
  "multi_select",
  "checkbox",
  "radio",
  "date",
  "datetime",
  "signature",
  "file_upload",
  "section_header",
  "instruction_block"
];

const FIELD_TYPE_LABELS = {
  text:              "Single-line Text",
  number:            "Number",
  textarea:          "Multi-line Text",
  select:            "Dropdown Select",
  multi_select:      "Multi-Select",
  checkbox:          "Checkbox",
  radio:             "Radio Buttons",
  date:              "Date",
  datetime:          "Date & Time",
  signature:         "Signature Capture",
  file_upload:       "File Upload",
  section_header:    "Section Header",
  instruction_block: "Instruction Block"
};

export function getFormBuilderContracts() {
  return {
    contractId: FORM_BUILDER_CONTRACT_ID,
    fieldTypes: SUPPORTED_FIELD_TYPES.map((type) => ({
      type,
      label: FIELD_TYPE_LABELS[type],
      isInputField: !["section_header", "instruction_block"].includes(type),
      supportsOptions: ["select", "multi_select", "radio"].includes(type),
      supportsRequired: !["section_header", "instruction_block"].includes(type)
    }))
  };
}

// ── Schema validation helpers ─────────────────────────────────────────────────

function makeError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function normalizeText(v) { return String(v ?? "").trim(); }

function validateFormSchema(schema) {
  if (!Array.isArray(schema)) throw makeError("invalid_form_schema");
  const seenIds = new Set();
  for (const field of schema) {
    if (!field || typeof field !== "object") throw makeError("invalid_form_schema");
    const id = normalizeText(field.id);
    if (!id) throw makeError("invalid_form_schema");
    if (seenIds.has(id)) throw makeError("invalid_form_schema");
    seenIds.add(id);
    if (!SUPPORTED_FIELD_TYPES.includes(field.type)) throw makeError("invalid_form_schema");
    if (!normalizeText(field.label)) throw makeError("invalid_form_schema");
  }
  return true;
}

function extractRequiredFieldIds(schema) {
  return (schema || [])
    .filter((f) =>
      f.required === true &&
      !["section_header", "instruction_block"].includes(f.type)
    )
    .map((f) => f.id);
}

// ── Columns ───────────────────────────────────────────────────────────────────

const TEMPLATE_COLS =
  "id, name, description, schema, status, scope_site_id, " +
  "created_by_user_id, updated_by_user_id, created_at, updated_at";

const SUBMISSION_COLS =
  "id, form_template_id, job_id, data, " +
  "submitted_by_user_id, submitted_by_role, submitted_at, scope_site_id";

// ── Audit helper ──────────────────────────────────────────────────────────────

async function writeAuditRow(client, { formTemplateId, userId, userRole, action, before, after, note }) {
  const q = client ? (text, params) => client.query(text, params) : run;
  await q(
    `INSERT INTO inspection_form_audit_log
       (form_template_id, user_id, user_role, action, before_snapshot, after_snapshot, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      formTemplateId,
      userId ?? null,
      userRole ?? null,
      action,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      note ?? null
    ]
  );
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listFormTemplates({ siteId = "default", status = null } = {}) {
  const params = [siteId];
  let where = "WHERE scope_site_id = $1";
  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  const { rows } = await run(
    `SELECT ${TEMPLATE_COLS} FROM inspection_form_templates ${where} ORDER BY updated_at DESC`,
    params
  );
  return rows;
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createFormTemplate(body, { siteId = "default", actorUserId = null, actorRole = null } = {}) {
  const name = normalizeText(body?.name);
  const description = normalizeText(body?.description);
  const schema = body?.schema ?? [];

  if (!name) throw makeError("invalid_form_name");
  validateFormSchema(schema);

  // Duplicate check
  const { rows: existing } = await run(
    "SELECT id FROM inspection_form_templates WHERE name=$1 AND scope_site_id=$2",
    [name, siteId]
  );
  if (existing.length > 0) throw makeError("duplicate_form_name");

  const { rows } = await run(
    `INSERT INTO inspection_form_templates
       (name, description, schema, status, scope_site_id, created_by_user_id, updated_by_user_id)
     VALUES ($1,$2,$3,'draft',$4,$5,$5)
     RETURNING ${TEMPLATE_COLS}`,
    [name, description || null, JSON.stringify(schema), siteId, actorUserId]
  );
  const template = rows[0];

  await writeAuditRow(null, {
    formTemplateId: template.id,
    userId: actorUserId,
    userRole: actorRole,
    action: "created",
    after: { name, schema, status: "draft" }
  });

  return template;
}

// ── Get single ────────────────────────────────────────────────────────────────

export async function getFormTemplate(id, { siteId = "default" } = {}) {
  const { rows } = await run(
    `SELECT ${TEMPLATE_COLS} FROM inspection_form_templates WHERE id=$1 AND scope_site_id=$2`,
    [id, siteId]
  );
  if (!rows[0]) throw makeError("form_not_found");
  return rows[0];
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateFormTemplate(id, body, { siteId = "default", actorUserId = null, actorRole = null } = {}) {
  const existing = await getFormTemplate(id, { siteId });
  if (existing.status !== "draft") throw makeError("form_not_editable");

  const name = body?.name !== undefined ? normalizeText(body.name) : existing.name;
  const description = body?.description !== undefined ? normalizeText(body.description) : existing.description;
  const schema = body?.schema !== undefined ? body.schema : existing.schema;

  if (!name) throw makeError("invalid_form_name");
  validateFormSchema(schema);

  // Duplicate name check (exclude self)
  const { rows: dup } = await run(
    "SELECT id FROM inspection_form_templates WHERE name=$1 AND scope_site_id=$2 AND id<>$3",
    [name, siteId, id]
  );
  if (dup.length > 0) throw makeError("duplicate_form_name");

  const { rows } = await run(
    `UPDATE inspection_form_templates
     SET name=$1, description=$2, schema=$3, updated_by_user_id=$4, updated_at=NOW()
     WHERE id=$5 AND scope_site_id=$6
     RETURNING ${TEMPLATE_COLS}`,
    [name, description || null, JSON.stringify(schema), actorUserId, id, siteId]
  );
  if (!rows[0]) throw makeError("form_not_found");

  await writeAuditRow(null, {
    formTemplateId: id,
    userId: actorUserId,
    userRole: actorRole,
    action: "updated",
    before: { name: existing.name, schema: existing.schema },
    after: { name, schema }
  });

  return rows[0];
}

// ── Publish ───────────────────────────────────────────────────────────────────

export async function publishFormTemplate(id, { siteId = "default", actorUserId = null, actorRole = null } = {}) {
  const existing = await getFormTemplate(id, { siteId });
  if (existing.status !== "draft") throw makeError("form_not_editable");
  const schema = Array.isArray(existing.schema) ? existing.schema : [];
  const inputFields = schema.filter((f) => !["section_header", "instruction_block"].includes(f.type));
  if (inputFields.length === 0) throw makeError("form_has_no_fields");

  const { rows } = await run(
    `UPDATE inspection_form_templates
     SET status='published', updated_by_user_id=$1, updated_at=NOW()
     WHERE id=$2 AND scope_site_id=$3
     RETURNING ${TEMPLATE_COLS}`,
    [actorUserId, id, siteId]
  );
  if (!rows[0]) throw makeError("form_not_found");

  await writeAuditRow(null, {
    formTemplateId: id,
    userId: actorUserId,
    userRole: actorRole,
    action: "published",
    after: { status: "published" }
  });

  return rows[0];
}

// ── Archive ───────────────────────────────────────────────────────────────────

export async function archiveFormTemplate(id, { siteId = "default", actorUserId = null, actorRole = null } = {}) {
  const existing = await getFormTemplate(id, { siteId });
  if (existing.status === "archived") throw makeError("form_not_editable");

  const { rows } = await run(
    `UPDATE inspection_form_templates
     SET status='archived', updated_by_user_id=$1, updated_at=NOW()
     WHERE id=$2 AND scope_site_id=$3
     RETURNING ${TEMPLATE_COLS}`,
    [actorUserId, id, siteId]
  );
  if (!rows[0]) throw makeError("form_not_found");

  await writeAuditRow(null, {
    formTemplateId: id,
    userId: actorUserId,
    userRole: actorRole,
    action: "archived",
    after: { status: "archived" }
  });

  return rows[0];
}

// ── Preview ───────────────────────────────────────────────────────────────────

export async function previewFormTemplate(id, { siteId = "default" } = {}) {
  const template = await getFormTemplate(id, { siteId });
  return {
    contractId: FORM_BUILDER_CONTRACT_ID,
    template,
    fieldTypes: getFormBuilderContracts().fieldTypes
  };
}

// ── Submissions ───────────────────────────────────────────────────────────────

export async function createSubmission(templateId, body, { siteId = "default", actorUserId = null, actorRole = null } = {}) {
  const template = await getFormTemplate(templateId, { siteId });
  if (template.status !== "published") throw makeError("form_not_published");

  const data = body?.data ?? {};
  if (typeof data !== "object" || Array.isArray(data)) throw makeError("invalid_submission_data");

  // Validate required fields
  const requiredIds = extractRequiredFieldIds(template.schema);
  for (const fieldId of requiredIds) {
    const val = data[fieldId];
    if (val === undefined || val === null || (typeof val === "string" && val.trim() === "")) {
      throw makeError("invalid_submission_data");
    }
  }

  const jobId = body?.jobId ?? body?.job_id ?? null;

  const { rows } = await run(
    `INSERT INTO inspection_form_submissions
       (form_template_id, job_id, data, submitted_by_user_id, submitted_by_role, scope_site_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING ${SUBMISSION_COLS}`,
    [templateId, jobId, JSON.stringify(data), actorUserId, actorRole, siteId]
  );
  const submission = rows[0];

  await writeAuditRow(null, {
    formTemplateId: templateId,
    userId: actorUserId,
    userRole: actorRole,
    action: "submission_created",
    after: { submissionId: submission.id, jobId }
  });

  return submission;
}

export async function listSubmissions(templateId, { siteId = "default", limit = 50, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const { rows } = await run(
    `SELECT ${SUBMISSION_COLS}
     FROM inspection_form_submissions
     WHERE form_template_id=$1 AND scope_site_id=$2
     ORDER BY submitted_at DESC
     LIMIT $3 OFFSET $4`,
    [templateId, siteId, safeLimit, safeOffset]
  );
  const { rows: countRows } = await run(
    "SELECT COUNT(*)::int AS total FROM inspection_form_submissions WHERE form_template_id=$1 AND scope_site_id=$2",
    [templateId, siteId]
  );
  return { submissions: rows, total: countRows[0]?.total ?? 0, limit: safeLimit, offset: safeOffset };
}

export async function getSubmission(submissionId, { siteId = "default" } = {}) {
  const { rows } = await run(
    `SELECT ${SUBMISSION_COLS}
     FROM inspection_form_submissions
     WHERE id=$1 AND scope_site_id=$2`,
    [submissionId, siteId]
  );
  if (!rows[0]) throw makeError("submission_not_found");
  return rows[0];
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export async function getFormAuditLog(templateId, { siteId = "default", limit = 50 } = {}) {
  // Verify template exists + site access
  await getFormTemplate(templateId, { siteId });

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const { rows } = await run(
    `SELECT id, form_template_id, user_id, user_role, action,
            before_snapshot, after_snapshot, note, created_at
     FROM inspection_form_audit_log
     WHERE form_template_id=$1
     ORDER BY created_at DESC
     LIMIT $2`,
    [templateId, safeLimit]
  );
  return rows;
}
