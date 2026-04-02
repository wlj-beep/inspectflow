import { query, transaction } from "../../db.js";

function toText(value, max = 500) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, max) : null;
}

function toJsonObject(value, fallback = {}) {
  if (!value || typeof value !== "object") return fallback;
  return value;
}

function positiveIntOrNull(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeDocumentStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["draft", "review", "released", "obsolete"].includes(normalized)) return normalized;
  return null;
}

function normalizeTrainingMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["soft", "hard"].includes(normalized)) return normalized;
  return null;
}

function normalizeSupplierStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["open", "scar_issued", "response_received", "closed", "cancelled"].includes(normalized)) return normalized;
  return null;
}

function buildDocumentSnapshot(documentRow) {
  return {
    id: Number(documentRow.id),
    docNumber: documentRow.doc_number,
    title: documentRow.title,
    kind: documentRow.kind,
    revisionCode: documentRow.revision_code,
    revisionIndex: Number(documentRow.revision_index),
    status: documentRow.status,
    changeReason: documentRow.change_reason,
    content: documentRow.content,
    ownerUserId: documentRow.owner_user_id,
    approverUserId: documentRow.approver_user_id,
    releasedByUserId: documentRow.released_by_user_id,
    releasedAt: documentRow.released_at,
    createdAt: documentRow.created_at,
    updatedAt: documentRow.updated_at
  };
}

async function nextDocumentRevisionIndex(client, docNumber) {
  const { rows } = await client.query(
    "SELECT COALESCE(MAX(revision_index), 0) + 1 AS next_revision_index FROM quality_documents WHERE doc_number=$1",
    [docNumber]
  );
  return Number(rows[0]?.next_revision_index || 1);
}

async function writeDocumentHistory(client, documentId, payload) {
  await client.query(
    `INSERT INTO quality_document_history
       (document_id, action, from_status, to_status, reason, actor_user_id, actor_role, snapshot)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      documentId,
      payload.action,
      payload.fromStatus || null,
      payload.toStatus || null,
      payload.reason || null,
      payload.actorUserId || null,
      payload.actorRole || null,
      payload.snapshot || {}
    ]
  );
}

export async function listQualityDocuments({ status = null, kind = null } = {}) {
  const filters = [];
  const params = [];
  const normalizedStatus = normalizeDocumentStatus(status);
  const normalizedKind = toText(kind, 40);

  if (status && !normalizedStatus) {
    throw new Error("invalid_status");
  }
  if (normalizedStatus) {
    params.push(normalizedStatus);
    filters.push(`qd.status=$${params.length}`);
  }
  if (normalizedKind) {
    params.push(normalizedKind);
    filters.push(`qd.kind=$${params.length}`);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const { rows } = await query(
    `SELECT qd.*
     FROM quality_documents qd
     ${where}
     ORDER BY qd.doc_number ASC, qd.revision_index DESC, qd.id DESC`,
    params
  );
  return rows.map(buildDocumentSnapshot);
}

export async function createQualityDocument({
  docNumber,
  title,
  kind,
  revisionCode = "A",
  content = {},
  changeReason,
  ownerUserId = null,
  actorUserId = null,
  actorRole = null
} = {}) {
  const normalizedDocNumber = toText(docNumber, 80);
  const normalizedTitle = toText(title, 200);
  const normalizedKind = toText(kind, 40);
  const normalizedRevisionCode = toText(revisionCode, 40) || "A";
  const normalizedChangeReason = toText(changeReason, 500);
  const ownerId = positiveIntOrNull(ownerUserId);
  const creatorId = positiveIntOrNull(actorUserId);

  if (!normalizedDocNumber) throw new Error("doc_number_required");
  if (!normalizedTitle) throw new Error("title_required");
  if (!normalizedKind) throw new Error("kind_required");
  if (!normalizedChangeReason) throw new Error("change_reason_required");

  return transaction(async (client) => {
    const revisionIndex = await nextDocumentRevisionIndex(client, normalizedDocNumber);
    const { rows } = await client.query(
      `INSERT INTO quality_documents
         (doc_number, title, kind, revision_code, revision_index, status, change_reason, content, owner_user_id, created_by_user_id, created_by_role)
       VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        normalizedDocNumber,
        normalizedTitle,
        normalizedKind,
        normalizedRevisionCode,
        revisionIndex,
        normalizedChangeReason,
        toJsonObject(content, {}),
        ownerId,
        creatorId,
        actorRole ? String(actorRole) : null
      ]
    );
    const created = rows[0];
    await writeDocumentHistory(client, created.id, {
      action: "created",
      toStatus: "draft",
      reason: normalizedChangeReason,
      actorUserId: creatorId,
      actorRole,
      snapshot: buildDocumentSnapshot(created)
    });
    return buildDocumentSnapshot(created);
  });
}

export async function releaseQualityDocument({
  documentId,
  actorUserId = null,
  actorRole = null,
  releaseNote = null
} = {}) {
  const id = positiveIntOrNull(documentId);
  if (!id) throw new Error("invalid_document_id");

  return transaction(async (client) => {
    const currentRes = await client.query(
      "SELECT * FROM quality_documents WHERE id=$1 FOR UPDATE",
      [id]
    );
    const current = currentRes.rows[0];
    if (!current) return null;

    const updatedRes = await client.query(
      `UPDATE quality_documents
       SET status='released',
           released_at=NOW(),
           released_by_user_id=$2,
           updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [id, positiveIntOrNull(actorUserId)]
    );
    const updated = updatedRes.rows[0];
    await writeDocumentHistory(client, id, {
      action: "released",
      fromStatus: current.status,
      toStatus: "released",
      reason: toText(releaseNote, 500) || current.change_reason,
      actorUserId: positiveIntOrNull(actorUserId),
      actorRole,
      snapshot: buildDocumentSnapshot(updated)
    });
    return buildDocumentSnapshot(updated);
  });
}

export async function upsertTrainingRequirement({
  documentId,
  role,
  mode = "hard",
  active = true,
  actorUserId = null,
  actorRole = null
} = {}) {
  const id = positiveIntOrNull(documentId);
  if (!id) throw new Error("invalid_document_id");
  const normalizedRole = toText(role, 40);
  const normalizedMode = normalizeTrainingMode(mode);
  if (!normalizedRole) throw new Error("role_required");
  if (!normalizedMode) throw new Error("invalid_mode");

  const { rows } = await query(
    `INSERT INTO quality_training_requirements
       (document_id, role, mode, active, created_by_user_id, created_by_role)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (document_id, role)
     DO UPDATE SET mode=EXCLUDED.mode, active=EXCLUDED.active, updated_at=NOW()
     RETURNING *`,
    [id, normalizedRole, normalizedMode, active !== false, positiveIntOrNull(actorUserId), actorRole ? String(actorRole) : null]
  );
  return rows[0];
}

export async function recordTrainingCompletion({
  documentId,
  userId,
  completedByUserId = null,
  completedByRole = null,
  result = "complete",
  note = null,
  evidence = {}
} = {}) {
  const id = positiveIntOrNull(documentId);
  const traineeId = positiveIntOrNull(userId);
  const recorderId = positiveIntOrNull(completedByUserId);
  if (!id) throw new Error("invalid_document_id");
  if (!traineeId) throw new Error("user_required");

  const { rows } = await query(
    `INSERT INTO quality_training_completions
       (document_id, user_id, completed_by_user_id, completed_by_role, result, note, evidence)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (document_id, user_id)
     DO UPDATE SET completed_by_user_id=EXCLUDED.completed_by_user_id,
                   completed_by_role=EXCLUDED.completed_by_role,
                   result=EXCLUDED.result,
                   note=EXCLUDED.note,
                   evidence=EXCLUDED.evidence,
                   completed_at=NOW()
     RETURNING *`,
    [
      id,
      traineeId,
      recorderId,
      completedByRole ? String(completedByRole) : null,
      toText(result, 40) || "complete",
      toText(note, 500),
      toJsonObject(evidence, {})
    ]
  );
  return rows[0];
}

export async function checkDocumentTrainingAccess({ documentId, userId, role } = {}) {
  const id = positiveIntOrNull(documentId);
  const traineeId = positiveIntOrNull(userId);
  if (!id) throw new Error("invalid_document_id");
  if (!traineeId) throw new Error("user_required");

  const docRes = await query("SELECT * FROM quality_documents WHERE id=$1", [id]);
  const document = docRes.rows[0];
  if (!document) return null;

  const requirementRes = await query(
    "SELECT * FROM quality_training_requirements WHERE document_id=$1 AND role=$2 AND active=true LIMIT 1",
    [id, toText(role, 40)]
  );
  const requirement = requirementRes.rows[0] || null;
  const completionRes = await query(
    "SELECT * FROM quality_training_completions WHERE document_id=$1 AND user_id=$2 LIMIT 1",
    [id, traineeId]
  );
  const completion = completionRes.rows[0] || null;

  const released = document.status === "released";
  const missingTraining = released && requirement && !completion;
  const mode = requirement?.mode || null;
  const allowed = released && (!requirement || Boolean(completion) || mode === "soft");
  const blockedReasons = [];
  if (!released) blockedReasons.push("document_not_released");
  if (missingTraining && mode === "hard") blockedReasons.push("training_incomplete");

  return {
    document: buildDocumentSnapshot(document),
    requirement,
    completion,
    allowed,
    mode,
    blockedReasons,
    requiresCompletion: Boolean(requirement),
    missingTraining: Boolean(missingTraining)
  };
}

export async function createSupplierQualityEvent({
  supplierName,
  details,
  issueReportId = null,
  capaEventId = null,
  scarNumber = null,
  responseDueAt = null,
  actorUserId = null,
  actorRole = null
} = {}) {
  const normalizedSupplierName = toText(supplierName, 120);
  const normalizedDetails = toText(details, 2000);
  const issueId = positiveIntOrNull(issueReportId);
  const capaId = positiveIntOrNull(capaEventId);
  const normalizedScarNumber = toText(scarNumber, 80);
  const responseDue = responseDueAt ? new Date(responseDueAt) : null;
  if (!normalizedSupplierName) throw new Error("supplier_name_required");
  if (!normalizedDetails) throw new Error("details_required");
  if (responseDueAt && Number.isNaN(responseDue?.getTime())) throw new Error("invalid_response_due_at");

  return transaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO supplier_quality_events
         (supplier_name, details, issue_report_id, capa_event_id, scar_number, response_due_at, created_by_user_id, created_by_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        normalizedSupplierName,
        normalizedDetails,
        issueId,
        capaId,
        normalizedScarNumber || `SCAR-${Date.now()}`,
        responseDue ? responseDue.toISOString() : null,
        positiveIntOrNull(actorUserId),
        actorRole ? String(actorRole) : null
      ]
    );
    const created = rows[0];
    await client.query(
      `INSERT INTO supplier_quality_event_transitions
         (supplier_quality_event_id, from_status, to_status, note, actor_user_id, actor_role)
       VALUES ($1, NULL, 'open', $2, $3, $4)`,
      [created.id, "supplier_event_created", positiveIntOrNull(actorUserId), actorRole ? String(actorRole) : null]
    );
    return created;
  });
}

export async function transitionSupplierQualityEvent({
  eventId,
  toStatus,
  note = null,
  closureEvidence = [],
  actorUserId = null,
  actorRole = null
} = {}) {
  const id = positiveIntOrNull(eventId);
  const nextStatus = normalizeSupplierStatus(toStatus);
  if (!id) throw new Error("invalid_event_id");
  if (!nextStatus) throw new Error("invalid_status");

  return transaction(async (client) => {
    const currentRes = await client.query(
      "SELECT * FROM supplier_quality_events WHERE id=$1 FOR UPDATE",
      [id]
    );
    const current = currentRes.rows[0];
    if (!current) return null;

    const validTransitions = {
      open: new Set(["scar_issued", "cancelled"]),
      scar_issued: new Set(["response_received", "cancelled"]),
      response_received: new Set(["closed", "scar_issued"]),
      closed: new Set(),
      cancelled: new Set()
    };
    const fromStatus = normalizeSupplierStatus(current.status) || "open";
    if (fromStatus === nextStatus) {
      throw new Error("no_status_change");
    }
    if (!validTransitions[fromStatus]?.has(nextStatus)) {
      throw new Error("invalid_transition");
    }

    const updates = [];
    const params = [];
    const addUpdate = (field, value) => {
      params.push(value);
      updates.push(`${field}=$${params.length}`);
    };
    addUpdate("status", nextStatus);
    addUpdate("updated_at", new Date().toISOString());
    if (nextStatus === "response_received") {
      addUpdate("response_received_at", new Date().toISOString());
    }
    if (nextStatus === "closed") {
      addUpdate("closed_at", new Date().toISOString());
      addUpdate("closed_by_user_id", positiveIntOrNull(actorUserId));
      addUpdate("closure_evidence", JSON.stringify(toJsonObject(closureEvidence, [])));
    }
    params.push(id);
    const { rows } = await client.query(
      `UPDATE supplier_quality_events
       SET ${updates.join(", ")}
       WHERE id=$${params.length}
       RETURNING *`,
      params
    );
    const updated = rows[0];
    await client.query(
      `INSERT INTO supplier_quality_event_transitions
         (supplier_quality_event_id, from_status, to_status, note, actor_user_id, actor_role)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, fromStatus, nextStatus, toText(note, 500), positiveIntOrNull(actorUserId), actorRole ? String(actorRole) : null]
    );
    return updated;
  });
}

export async function exportSupplierQualityEvent(eventId) {
  const id = positiveIntOrNull(eventId);
  if (!id) throw new Error("invalid_event_id");

  const eventRes = await query(
    `SELECT sqe.*, ir.details AS issue_details, ce.title AS capa_title
     FROM supplier_quality_events sqe
     LEFT JOIN issue_reports ir ON ir.id = sqe.issue_report_id
     LEFT JOIN capa_events ce ON ce.id = sqe.capa_event_id
     WHERE sqe.id=$1`,
    [id]
  );
  const event = eventRes.rows[0];
  if (!event) return null;

  const transitionsRes = await query(
    `SELECT *
     FROM supplier_quality_event_transitions
     WHERE supplier_quality_event_id=$1
     ORDER BY created_at ASC, id ASC`,
    [id]
  );

  return {
    event,
    transitions: transitionsRes.rows,
    export: {
      contractId: "QUAL-SUPPLIER-v1",
      status: event.status,
      scarNumber: event.scar_number,
      closureEvidence: event.closure_evidence || []
    }
  };
}
