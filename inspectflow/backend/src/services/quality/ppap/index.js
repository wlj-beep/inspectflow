import { query as rootQuery } from "../../../db.js";

export const PPAP_ELEMENT_CATALOG = [
  { elementCode: "design_records", elementNumber: 1, name: "Design Records" },
  { elementCode: "engineering_change_documents", elementNumber: 2, name: "Engineering Change Documents" },
  { elementCode: "customer_engineering_approval", elementNumber: 3, name: "Customer Engineering Approval" },
  { elementCode: "design_fmea", elementNumber: 4, name: "Design FMEA" },
  { elementCode: "process_flow_diagram", elementNumber: 5, name: "Process Flow Diagram" },
  { elementCode: "process_fmea", elementNumber: 6, name: "Process FMEA" },
  { elementCode: "control_plan", elementNumber: 7, name: "Control Plan" },
  { elementCode: "measurement_system_analysis", elementNumber: 8, name: "Measurement System Analysis Studies" },
  { elementCode: "dimensional_results", elementNumber: 9, name: "Dimensional Results" },
  { elementCode: "material_performance_test_results", elementNumber: 10, name: "Material / Performance Test Results" },
  { elementCode: "initial_process_studies", elementNumber: 11, name: "Initial Process Studies" },
  { elementCode: "qualified_laboratory_documentation", elementNumber: 12, name: "Qualified Laboratory Documentation" },
  { elementCode: "appearance_approval_report", elementNumber: 13, name: "Appearance Approval Report" },
  { elementCode: "sample_production_parts", elementNumber: 14, name: "Sample Production Parts" },
  { elementCode: "master_sample", elementNumber: 15, name: "Master Sample" },
  { elementCode: "checking_aids", elementNumber: 16, name: "Checking Aids" },
  { elementCode: "customer_specific_requirements", elementNumber: 17, name: "Customer-Specific Requirements" },
  { elementCode: "part_submission_warrant", elementNumber: 18, name: "Part Submission Warrant" }
];

const VALID_PACKAGE_STATUSES = new Set(["draft", "in_review", "submitted", "approved", "rejected"]);
const VALID_ELEMENT_STATUSES = new Set(["pending", "complete", "waived", "not_required"]);
const VALID_APPROVAL_DECISIONS = new Set(["approved", "rejected"]);
const PPAP_CONTRACT_ID = "QUAL-PPAP-PSW-v1";
let schemaReadyPromise = null;

const LEVEL_REQUIRED_CODES = new Map([
  [1, new Set(["part_submission_warrant"])],
  [2, new Set([
    "design_records",
    "engineering_change_documents",
    "customer_engineering_approval",
    "design_fmea",
    "process_flow_diagram",
    "process_fmea",
    "control_plan",
    "measurement_system_analysis",
    "dimensional_results",
    "material_performance_test_results",
    "part_submission_warrant"
  ])],
  [3, new Set(PPAP_ELEMENT_CATALOG.map((item) => item.elementCode))],
  [4, new Set(PPAP_ELEMENT_CATALOG.map((item) => item.elementCode))],
  [5, new Set(PPAP_ELEMENT_CATALOG.map((item) => item.elementCode))]
]);

const ELEMENT_LOOKUP = new Map();
for (const element of PPAP_ELEMENT_CATALOG) {
  ELEMENT_LOOKUP.set(element.elementCode, element);
  ELEMENT_LOOKUP.set(String(element.elementNumber), element);
  ELEMENT_LOOKUP.set(`e${element.elementNumber}`, element);
  ELEMENT_LOOKUP.set(`e${String(element.elementNumber).padStart(2, "0")}`, element);
}

function dbQuery(db, text, params) {
  return db.query(text, params);
}

async function ensurePpapSchemaStatements(db) {
  await dbQuery(
    db,
    `CREATE TABLE IF NOT EXISTS ppap_packages (
      id SERIAL PRIMARY KEY,
      part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
      customer_name TEXT,
      submission_level INTEGER NOT NULL CHECK (submission_level BETWEEN 1 AND 5),
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'submitted', 'approved', 'rejected')),
      notes TEXT,
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await dbQuery(
    db,
    `CREATE TABLE IF NOT EXISTS ppap_elements (
      id SERIAL PRIMARY KEY,
      package_id INTEGER NOT NULL REFERENCES ppap_packages(id) ON DELETE CASCADE,
      element_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'complete', 'waived', 'not_required')),
      notes TEXT,
      attachment_name TEXT,
      attachment_data_base64 TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (package_id, element_code)
    )`
  );
  await dbQuery(
    db,
    `CREATE TABLE IF NOT EXISTS ppap_customer_approvals (
      id SERIAL PRIMARY KEY,
      package_id INTEGER NOT NULL REFERENCES ppap_packages(id) ON DELETE CASCADE,
      decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
      customer_reference TEXT,
      notes TEXT,
      decided_by_user_id INTEGER REFERENCES users(id),
      decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await dbQuery(
    db,
    `CREATE INDEX IF NOT EXISTS idx_ppap_packages_part
     ON ppap_packages (part_id, created_at DESC)`
  );
  await dbQuery(
    db,
    `CREATE INDEX IF NOT EXISTS idx_ppap_elements_package
     ON ppap_elements (package_id, element_code)`
  );
}

export async function ensurePpapSchema(db = { query: rootQuery }) {
  if (!schemaReadyPromise) {
    schemaReadyPromise = ensurePpapSchemaStatements(db).catch((err) => {
      schemaReadyPromise = null;
      throw err;
    });
  }
  return schemaReadyPromise;
}

function parsePositiveInteger(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeText(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function normalizeSubmissionLevel(value) {
  const level = Number(value);
  return Number.isInteger(level) && level >= 1 && level <= 5 ? level : null;
}

function decodeBase64Payload(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalized = raw.includes(",") && raw.startsWith("data:")
    ? raw.slice(raw.indexOf(",") + 1)
    : raw;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(normalized)) return null;
  try {
    const bytes = Buffer.from(normalized, "base64");
    if (!bytes.length) return null;
    return { normalized: normalized.replace(/\s+/g, ""), bytes };
  } catch (_err) {
    return null;
  }
}

function resolveElementCatalogEntry(elementCode) {
  const raw = String(elementCode || "").trim().toLowerCase();
  if (!raw) return null;
  const direct = ELEMENT_LOOKUP.get(raw);
  if (direct) return direct;
  const slug = raw.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return ELEMENT_LOOKUP.get(slug) || null;
}

function requiredElementCodesForLevel(level) {
  return LEVEL_REQUIRED_CODES.get(level) || LEVEL_REQUIRED_CODES.get(3);
}

function isRequiredForLevel(level, elementCode) {
  return requiredElementCodesForLevel(level).has(elementCode);
}

function statusCountsFromElements(elements) {
  return {
    elementCount: elements.length,
    requiredElementCount: elements.filter((item) => item.required).length,
    completeElementCount: elements.filter((item) => item.status === "complete").length,
    waivedElementCount: elements.filter((item) => item.status === "waived").length,
    pendingElementCount: elements.filter((item) => item.status === "pending").length,
    notRequiredElementCount: elements.filter((item) => item.status === "not_required").length,
    requiredPendingCount: elements.filter((item) => item.required && item.status === "pending").length
  };
}

function computeReadiness(elements) {
  const counts = statusCountsFromElements(elements);
  const blockers = [];
  if (counts.requiredElementCount === 0) blockers.push("no_required_elements");
  if (counts.requiredPendingCount > 0) blockers.push("required_elements_pending");
  return {
    readyToSubmit: blockers.length === 0,
    blockers,
    totals: counts
  };
}

function shapePackageRow(row) {
  return {
    id: Number(row.id),
    partId: row.part_id,
    customerName: row.customer_name || null,
    submissionLevel: Number(row.submission_level),
    status: row.status,
    notes: row.notes || null,
    createdByUserId: row.created_by_user_id == null ? null : Number(row.created_by_user_id),
    createdByUserName: row.created_by_user_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function shapePackageListRow(row) {
  return {
    id: Number(row.id),
    partId: row.part_id,
    customerName: row.customer_name || null,
    submissionLevel: Number(row.submission_level),
    status: row.status,
    notes: row.notes || null,
    createdByUserId: row.created_by_user_id == null ? null : Number(row.created_by_user_id),
    createdByUserName: row.created_by_user_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    elementCount: Number(row.element_count || 0),
    completeElementCount: Number(row.complete_element_count || 0),
    waivedElementCount: Number(row.waived_element_count || 0),
    pendingElementCount: Number(row.pending_element_count || 0),
    notRequiredElementCount: Number(row.not_required_element_count || 0),
    approvalCount: Number(row.approval_count || 0),
    latestApprovalDecision: row.latest_decision || null,
    latestApprovalCustomerReference: row.latest_customer_reference || null,
    latestApprovalNotes: row.latest_approval_notes || null,
    latestApprovalAt: row.latest_decided_at || null,
    latestApprovalByUserId: row.latest_decided_by_user_id == null ? null : Number(row.latest_decided_by_user_id),
    latestApprovalByUserName: row.latest_decided_by_user_name || null
  };
}

function shapeElementRow(row, submissionLevel, { includeAttachmentData = false } = {}) {
  const catalog = resolveElementCatalogEntry(row.element_code);
  const attachmentData = row.attachment_data_base64 || null;
  const attachment = row.attachment_name || attachmentData
    ? {
        name: row.attachment_name || null,
        byteSize: attachmentData ? Buffer.from(attachmentData, "base64").length : 0,
        hasData: !!attachmentData,
        dataBase64: includeAttachmentData ? attachmentData : undefined
      }
    : null;

  return {
    id: Number(row.id),
    packageId: Number(row.package_id),
    elementCode: row.element_code,
    elementNumber: catalog?.elementNumber ?? null,
    elementName: catalog?.name ?? row.element_code,
    required: isRequiredForLevel(submissionLevel, row.element_code),
    status: row.status,
    notes: row.notes || null,
    attachment,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function shapeApprovalRow(row) {
  return {
    id: Number(row.id),
    packageId: Number(row.package_id),
    decision: row.decision,
    customerReference: row.customer_reference || null,
    notes: row.notes || null,
    decidedByUserId: row.decided_by_user_id == null ? null : Number(row.decided_by_user_id),
    decidedByUserName: row.decided_by_user_name || null,
    decidedAt: row.decided_at
  };
}

async function loadPackageRow(db, packageId, { forUpdate = false } = {}) {
  const sql = `SELECT p.id, p.part_id, p.customer_name, p.submission_level, p.status, p.notes,
                      p.created_by_user_id, creator.name AS created_by_user_name,
                      p.created_at, p.updated_at
               FROM ppap_packages p
               LEFT JOIN users creator ON creator.id = p.created_by_user_id
               WHERE p.id = $1${forUpdate ? " FOR UPDATE OF p" : ""}`;
  const { rows } = await dbQuery(db, sql, [packageId]);
  return rows[0] || null;
}

async function loadElementRows(db, packageId, { includeAttachmentData = false } = {}) {
  const fields = includeAttachmentData
    ? "e.id, e.package_id, e.element_code, e.status, e.notes, e.attachment_name, e.attachment_data_base64, e.created_at, e.updated_at"
    : "e.id, e.package_id, e.element_code, e.status, e.notes, e.attachment_name, e.attachment_data_base64, e.created_at, e.updated_at";
  const { rows } = await dbQuery(
    db,
    `SELECT ${fields}
     FROM ppap_elements e
     WHERE e.package_id = $1
     ORDER BY e.id ASC`,
    [packageId]
  );
  return rows;
}

async function loadApprovalRows(db, packageId) {
  const { rows } = await dbQuery(
    db,
    `SELECT a.id, a.package_id, a.decision, a.customer_reference, a.notes,
            a.decided_by_user_id, approver.name AS decided_by_user_name,
            a.decided_at
     FROM ppap_customer_approvals a
     LEFT JOIN users approver ON approver.id = a.decided_by_user_id
     WHERE a.package_id = $1
     ORDER BY a.decided_at DESC, a.id DESC`,
    [packageId]
  );
  return rows;
}

async function loadPackageBundle(db, packageId, { includeAttachmentData = false } = {}) {
  const pkgRow = await loadPackageRow(db, packageId);
  if (!pkgRow) return null;
  const elementRows = await loadElementRows(db, packageId, { includeAttachmentData });
  const elements = elementRows.map((row) => shapeElementRow(row, Number(pkgRow.submission_level), { includeAttachmentData }));
  const approvals = (await loadApprovalRows(db, packageId)).map(shapeApprovalRow);
  const readiness = computeReadiness(elements);
  return {
    package: shapePackageRow(pkgRow),
    readiness,
    elements,
    approvals
  };
}

function packageListSelect() {
  return `
    SELECT p.id, p.part_id, p.customer_name, p.submission_level, p.status, p.notes,
           p.created_by_user_id, creator.name AS created_by_user_name,
           p.created_at, p.updated_at,
           (SELECT COUNT(*)::int FROM ppap_elements e WHERE e.package_id = p.id) AS element_count,
           (SELECT COUNT(*)::int FROM ppap_elements e WHERE e.package_id = p.id AND e.status = 'complete') AS complete_element_count,
           (SELECT COUNT(*)::int FROM ppap_elements e WHERE e.package_id = p.id AND e.status = 'waived') AS waived_element_count,
           (SELECT COUNT(*)::int FROM ppap_elements e WHERE e.package_id = p.id AND e.status = 'pending') AS pending_element_count,
           (SELECT COUNT(*)::int FROM ppap_elements e WHERE e.package_id = p.id AND e.status = 'not_required') AS not_required_element_count,
           (SELECT COUNT(*)::int FROM ppap_customer_approvals a WHERE a.package_id = p.id) AS approval_count,
           (SELECT a.decision
            FROM ppap_customer_approvals a
            WHERE a.package_id = p.id
            ORDER BY a.decided_at DESC, a.id DESC
            LIMIT 1) AS latest_decision,
           (SELECT a.customer_reference
            FROM ppap_customer_approvals a
            WHERE a.package_id = p.id
            ORDER BY a.decided_at DESC, a.id DESC
            LIMIT 1) AS latest_customer_reference,
           (SELECT a.notes
            FROM ppap_customer_approvals a
            WHERE a.package_id = p.id
            ORDER BY a.decided_at DESC, a.id DESC
            LIMIT 1) AS latest_approval_notes,
           (SELECT a.decided_at
            FROM ppap_customer_approvals a
            WHERE a.package_id = p.id
            ORDER BY a.decided_at DESC, a.id DESC
            LIMIT 1) AS latest_decided_at,
           (SELECT a.decided_by_user_id
            FROM ppap_customer_approvals a
            WHERE a.package_id = p.id
            ORDER BY a.decided_at DESC, a.id DESC
            LIMIT 1) AS latest_decided_by_user_id,
           (SELECT approver.name
            FROM ppap_customer_approvals a
            LEFT JOIN users approver ON approver.id = a.decided_by_user_id
            WHERE a.package_id = p.id
            ORDER BY a.decided_at DESC, a.id DESC
            LIMIT 1) AS latest_decided_by_user_name
    FROM ppap_packages p
    LEFT JOIN users creator ON creator.id = p.created_by_user_id
  `;
}

async function assertPackageExists(db, packageId) {
  const pkg = await loadPackageRow(db, packageId);
  return pkg || null;
}

async function assertMutablePackage(db, packageId, { forUpdate = true } = {}) {
  const pkg = await loadPackageRow(db, packageId, { forUpdate });
  if (!pkg) return { error: "not_found" };
  if (["approved", "rejected"].includes(pkg.status)) {
    return { error: "package_closed", package: shapePackageRow(pkg) };
  }
  if (pkg.status === "submitted") {
    return { error: "package_submitted", package: shapePackageRow(pkg) };
  }
  return { package: pkg };
}

async function updatePackageLevelAndMetadata(client, packageId, {
  customerName,
  notes,
  submissionLevel
}) {
  const updates = [];
  const params = [];

  if (customerName !== undefined) {
    params.push(customerName);
    updates.push(`customer_name = $${params.length}`);
  }
  if (notes !== undefined) {
    params.push(notes);
    updates.push(`notes = $${params.length}`);
  }
  if (submissionLevel !== undefined) {
    params.push(submissionLevel);
    updates.push(`submission_level = $${params.length}`);
  }
  if (!updates.length) return false;

  params.push(packageId);
  await dbQuery(
    client,
    `UPDATE ppap_packages
     SET ${updates.join(", ")},
         status = CASE WHEN status = 'draft' THEN 'in_review' ELSE status END,
         updated_at = NOW()
     WHERE id = $${params.length}`,
    params
  );
  return true;
}

async function refreshElementStatusesForSubmissionLevel(client, packageId, submissionLevel) {
  const requiredCodes = Array.from(requiredElementCodesForLevel(submissionLevel));
  const requiredPlaceholders = requiredCodes.length ? requiredCodes.map((_code, index) => `$${index + 2}`).join(", ") : "";
  const sql = requiredCodes.length
    ? `UPDATE ppap_elements
       SET status = CASE
         WHEN element_code IN (${requiredPlaceholders}) AND status = 'not_required' THEN 'pending'
         WHEN element_code NOT IN (${requiredPlaceholders}) AND status IN ('pending', 'not_required') THEN 'not_required'
         ELSE status
       END,
       updated_at = NOW()
       WHERE package_id = $1`
    : `UPDATE ppap_elements
       SET updated_at = NOW()
       WHERE package_id = $1`;
  await dbQuery(client, sql, [packageId, ...requiredCodes]);
}

function makePswPayload(bundle, generatedAt) {
  const requiredElements = bundle.elements.filter((item) => item.required);
  return {
    contractId: PPAP_CONTRACT_ID,
    generatedAt,
    package: {
      id: bundle.package.id,
      partId: bundle.package.partId,
      customerName: bundle.package.customerName,
      submissionLevel: bundle.package.submissionLevel,
      status: bundle.package.status,
      notes: bundle.package.notes
    },
    readiness: bundle.readiness,
    psw: {
      partId: bundle.package.partId,
      customerName: bundle.package.customerName,
      submissionLevel: bundle.package.submissionLevel,
      packageStatus: bundle.package.status,
      readyToSubmit: bundle.readiness.readyToSubmit,
      blockers: bundle.readiness.blockers,
      requiredElements: requiredElements.map((item) => ({
        elementCode: item.elementCode,
        elementName: item.elementName,
        status: item.status,
        notes: item.notes,
        attachment: item.attachment
      })),
      elementStatuses: bundle.elements.map((item) => ({
        elementCode: item.elementCode,
        elementName: item.elementName,
        required: item.required,
        status: item.status,
        notes: item.notes,
        attachment: item.attachment
      }))
    },
    elements: bundle.elements,
    approvals: bundle.approvals
  };
}

export async function listPpapPackages(filters = {}, db = { query: rootQuery }) {
  await ensurePpapSchema(db);
  const clauses = [];
  const params = [];

  if (filters.partId) {
    params.push(String(filters.partId).trim());
    clauses.push(`p.part_id = $${params.length}`);
  }
  if (filters.customerName) {
    params.push(String(filters.customerName).trim());
    clauses.push(`p.customer_name = $${params.length}`);
  }
  if (filters.status) {
    params.push(String(filters.status).trim());
    clauses.push(`p.status = $${params.length}`);
  }
  if (filters.submissionLevel != null) {
    const level = normalizeSubmissionLevel(filters.submissionLevel);
    if (!level) return { error: "invalid_submission_level" };
    params.push(level);
    clauses.push(`p.submission_level = $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await dbQuery(
    db,
    `${packageListSelect()}
     ${where}
     ORDER BY p.created_at DESC, p.id DESC`,
    params
  );
  return rows.map(shapePackageListRow);
}

export async function getPpapPackage(packageId, db = { query: rootQuery }, { includeAttachmentData = false } = {}) {
  await ensurePpapSchema(db);
  const bundle = await loadPackageBundle(db, packageId, { includeAttachmentData });
  if (!bundle) return null;
  return bundle;
}

export async function createPpapPackage(payload, db = { query: rootQuery }) {
  await ensurePpapSchema(db);
  const partId = normalizeText(payload.partId);
  const customerName = normalizeText(payload.customerName);
  const notes = normalizeText(payload.notes);
  const submissionLevel = normalizeSubmissionLevel(payload.submissionLevel);
  if (!partId) return { error: "part_id_required" };
  if (!submissionLevel) return { error: "invalid_submission_level" };

  const { rows: partRows } = await dbQuery(
    db,
    "SELECT id FROM parts WHERE id = $1",
    [partId]
  );
  if (!partRows[0]) return { error: "part_not_found" };

  const requiredCodes = requiredElementCodesForLevel(submissionLevel);
  const { rows } = await dbQuery(
    db,
    `INSERT INTO ppap_packages
       (part_id, customer_name, submission_level, status, notes, created_by_user_id)
     VALUES ($1, $2, $3, 'draft', $4, $5)
     RETURNING id`,
    [partId, customerName, submissionLevel, notes, payload.actorUserId || null]
  );
  const packageId = Number(rows[0].id);

  const values = [];
  const params = [];
  PPAP_ELEMENT_CATALOG.forEach((element, index) => {
    const status = requiredCodes.has(element.elementCode) ? "pending" : "not_required";
    const base = index * 4;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    params.push(packageId, element.elementCode, status, null);
  });
  await dbQuery(
    db,
    `INSERT INTO ppap_elements (package_id, element_code, status, notes)
     VALUES ${values.join(", ")}`,
    params
  );

  return getPpapPackage(packageId, db);
}

export async function promotePpapPackageToReview(packageId, db = { query: rootQuery }) {
  await ensurePpapSchema(db);
  const bundle = await loadPackageRow(db, packageId, { forUpdate: true });
  if (!bundle) return { error: "not_found" };
  if (bundle.status === "submitted") return { error: "package_submitted" };
  if (["approved", "rejected"].includes(bundle.status)) return { error: "package_closed" };

  const nextStatus = bundle.status === "draft" ? "in_review" : bundle.status;
  if (nextStatus !== bundle.status) {
    await dbQuery(
      db,
      "UPDATE ppap_packages SET status = $2, updated_at = NOW() WHERE id = $1",
      [packageId, nextStatus]
    );
  }
  return getPpapPackage(packageId, db);
}

export async function updatePpapPackage(packageId, payload, db = { query: rootQuery }) {
  await ensurePpapSchema(db);
  const customerName = payload.customerName === undefined ? undefined : normalizeText(payload.customerName);
  const notes = payload.notes === undefined ? undefined : normalizeText(payload.notes);
  const submissionLevel = payload.submissionLevel === undefined ? undefined : normalizeSubmissionLevel(payload.submissionLevel);
  if (payload.submissionLevel !== undefined && !submissionLevel) {
    return { error: "invalid_submission_level" };
  }
  if (customerName === undefined && notes === undefined && submissionLevel === undefined) {
    return { error: "required_fields_missing" };
  }

  const bundle = await assertMutablePackage(db, packageId, { forUpdate: true });
  if (bundle.error) return bundle;

  const client = db;
  const currentSubmissionLevel = Number(bundle.package.submission_level);
  const nextSubmissionLevel = submissionLevel || currentSubmissionLevel;

  await updatePackageLevelAndMetadata(client, packageId, {
    customerName,
    notes,
    submissionLevel
  });

  if (submissionLevel && submissionLevel !== currentSubmissionLevel) {
    await refreshElementStatusesForSubmissionLevel(client, packageId, nextSubmissionLevel);
  }

  return getPpapPackage(packageId, db);
}

export async function updatePpapElement(packageId, elementCode, payload, db = { query: rootQuery }) {
  await ensurePpapSchema(db);
  const element = resolveElementCatalogEntry(elementCode);
  if (!element) return { error: "invalid_element_code" };

  const status = payload.status === undefined ? undefined : String(payload.status).trim();
  if (status !== undefined && !VALID_ELEMENT_STATUSES.has(status)) {
    return { error: "invalid_element_status" };
  }

  const notes = payload.notes === undefined ? undefined : normalizeText(payload.notes);
  const hasAttachmentName = Object.prototype.hasOwnProperty.call(payload, "attachmentName");
  const hasAttachmentData = Object.prototype.hasOwnProperty.call(payload, "attachmentDataBase64");
  const attachmentName = hasAttachmentName ? normalizeText(payload.attachmentName) : undefined;
  const decodedAttachment = hasAttachmentData ? decodeBase64Payload(payload.attachmentDataBase64) : undefined;
  if ((hasAttachmentName || hasAttachmentData) && (hasAttachmentName !== hasAttachmentData)) {
    return { error: "invalid_attachment_metadata" };
  }
  if (hasAttachmentData && !decodedAttachment) {
    return { error: "invalid_attachment_data" };
  }

  const bundle = await assertMutablePackage(db, packageId, { forUpdate: true });
  if (bundle.error) return bundle;

  const { rows } = await dbQuery(
    db,
    `SELECT id, package_id, element_code, status, notes, attachment_name, attachment_data_base64, created_at, updated_at
     FROM ppap_elements
     WHERE package_id = $1 AND element_code = $2
     FOR UPDATE`,
    [packageId, element.elementCode]
  );
  const current = rows[0];
  if (!current) return { error: "not_found" };

  const nextAttachmentName = hasAttachmentName ? attachmentName : current.attachment_name;
  const nextAttachmentData = hasAttachmentData ? decodedAttachment.normalized : current.attachment_data_base64;
  if ((nextAttachmentName || nextAttachmentData) && (!nextAttachmentName || !nextAttachmentData)) {
    return { error: "invalid_attachment_metadata" };
  }

  const nextStatus = status || current.status;
  const nextNotes = notes === undefined ? current.notes : notes;

  await dbQuery(
    db,
    `UPDATE ppap_elements
     SET status = $3,
         notes = $4,
         attachment_name = $5,
         attachment_data_base64 = $6,
         updated_at = NOW()
     WHERE package_id = $1 AND element_code = $2`,
    [
      packageId,
      element.elementCode,
      nextStatus,
      nextNotes,
      nextAttachmentName,
      nextAttachmentData
    ]
  );

  if (bundle.package.status === "draft") {
    await dbQuery(
      db,
      "UPDATE ppap_packages SET status = 'in_review', updated_at = NOW() WHERE id = $1",
      [packageId]
    );
  } else {
    await dbQuery(db, "UPDATE ppap_packages SET updated_at = NOW() WHERE id = $1", [packageId]);
  }

  return getPpapPackage(packageId, db, { includeAttachmentData: !!payload.includeAttachmentData });
}

export async function submitPpapPackage(packageId, db = { query: rootQuery }) {
  await ensurePpapSchema(db);
  const bundle = await loadPackageBundle(db, packageId);
  if (!bundle) return { error: "not_found" };
  if (bundle.package.status === "submitted") return { error: "package_already_submitted" };
  if (["approved", "rejected"].includes(bundle.package.status)) return { error: "package_closed" };
  if (!bundle.readiness.readyToSubmit) {
    return { error: "package_not_ready", readiness: bundle.readiness };
  }

  await dbQuery(
    db,
    `UPDATE ppap_packages
     SET status = 'submitted',
         updated_at = NOW()
     WHERE id = $1`,
    [packageId]
  );
  return getPpapPackage(packageId, db);
}

export async function recordPpapCustomerApproval(packageId, payload, db = { query: rootQuery }) {
  await ensurePpapSchema(db);
  const decision = String(payload.decision || "").trim().toLowerCase();
  if (!VALID_APPROVAL_DECISIONS.has(decision)) {
    return { error: "invalid_decision" };
  }

  const customerReference = normalizeText(payload.customerReference);
  const notes = normalizeText(payload.notes);
  const actorUserId = parsePositiveInteger(payload.actorUserId);
  const actorRole = normalizeText(payload.actorRole);
  const bundle = await loadPackageBundle(db, packageId);
  if (!bundle) return { error: "not_found" };
  if (["approved", "rejected"].includes(bundle.package.status)) {
    return { error: "package_closed" };
  }
  if (bundle.package.status !== "submitted") {
    return { error: "package_not_submitted", status: bundle.package.status };
  }

  const { rows } = await dbQuery(
    db,
    `INSERT INTO ppap_customer_approvals
       (package_id, decision, customer_reference, notes, decided_by_user_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, package_id, decision, customer_reference, notes, decided_by_user_id, decided_at`,
    [packageId, decision, customerReference, notes, actorUserId]
  );

  await dbQuery(
    db,
    `UPDATE ppap_packages
     SET status = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [packageId, decision]
  );

  const approval = shapeApprovalRow({
    ...rows[0],
    decided_by_user_name: null
  });
  const refreshed = await getPpapPackage(packageId, db);
  return {
    approval,
    package: refreshed?.package || null,
    readiness: refreshed?.readiness || null,
    elements: refreshed?.elements || [],
    approvals: refreshed?.approvals || []
  };
}

export async function buildPswPayload(packageId, db = { query: rootQuery }, { includeAttachmentData = false } = {}) {
  await ensurePpapSchema(db);
  const bundle = await loadPackageBundle(db, packageId, { includeAttachmentData });
  if (!bundle) return null;
  return makePswPayload(bundle, new Date().toISOString());
}

export async function buildPpapSummary(packageId, db = { query: rootQuery }, { includeAttachmentData = false } = {}) {
  await ensurePpapSchema(db);
  const bundle = await loadPackageBundle(db, packageId, { includeAttachmentData });
  if (!bundle) return null;
  return {
    package: bundle.package,
    readiness: bundle.readiness,
    elements: bundle.elements,
    approvals: bundle.approvals,
    psw: makePswPayload(bundle, new Date().toISOString()).psw
  };
}
