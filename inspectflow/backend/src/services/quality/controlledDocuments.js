import { query, transaction } from "../../db.js";
import { nextRevisionCode } from "../../revisions.js";

const VALID_DOCUMENT_TYPES = new Set(["procedure", "form"]);
const VALID_REVISION_STATUSES = new Set(["draft", "approved", "released", "superseded"]);
let ensuredControlledDocumentShape = false;

function asIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function trimOrNull(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function normalizeDocumentType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return VALID_DOCUMENT_TYPES.has(normalized) ? normalized : null;
}

function mapDocumentSummaryRow(row) {
  return {
    id: Number(row.id),
    capaEventId: row.capa_event_id == null ? null : Number(row.capa_event_id),
    documentNumber: row.document_number,
    documentType: row.document_type,
    title: row.title,
    activeRevisionId: row.active_revision_id == null ? null : Number(row.active_revision_id),
    activeRevisionCode: row.active_revision_code || null,
    latestRevisionId: row.latest_revision_id == null ? null : Number(row.latest_revision_id),
    latestRevisionCode: row.latest_revision_code || null,
    latestRevisionStatus: row.latest_revision_status || null,
    createdByUserId: Number(row.created_by_user_id),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
    releaseState: row.active_revision_id ? "released" : row.latest_revision_status || "draft"
  };
}

function mapRevisionRow(row) {
  return {
    id: Number(row.id),
    documentId: Number(row.document_id),
    revisionCode: row.revision_code,
    revisionIndex: Number(row.revision_index),
    status: row.status,
    title: row.title,
    content: row.content || null,
    changeReason: row.change_reason,
    createdByUserId: Number(row.created_by_user_id),
    approvedByUserId: row.approved_by_user_id == null ? null : Number(row.approved_by_user_id),
    approvedAt: asIso(row.approved_at),
    releasedByUserId: row.released_by_user_id == null ? null : Number(row.released_by_user_id),
    releasedAt: asIso(row.released_at),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at)
  };
}

function mapTrailRow(row) {
  return {
    id: Number(row.id),
    revisionId: Number(row.revision_id),
    revisionCode: row.revision_code,
    action: row.action,
    fromStatus: row.from_status || null,
    toStatus: row.to_status,
    reason: row.reason || null,
    actorUserId: row.actor_user_id == null ? null : Number(row.actor_user_id),
    actorRole: row.actor_role || null,
    createdAt: asIso(row.created_at)
  };
}

async function ensureUserExists(client, userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("user_required");
  }
  const userRes = await client.query("SELECT id FROM users WHERE id=$1", [userId]);
  if (!userRes.rows[0]) {
    throw new Error("user_not_found");
  }
}

async function ensureCapaExists(client, capaEventId) {
  if (!Number.isInteger(capaEventId) || capaEventId <= 0) {
    throw new Error("invalid_capa_id");
  }
  const capaRes = await client.query("SELECT id FROM capa_events WHERE id=$1", [capaEventId]);
  if (!capaRes.rows[0]) {
    throw new Error("capa_not_found");
  }
}

async function ensureControlledDocumentShape(client) {
  if (ensuredControlledDocumentShape) return;
  await client.query(`
    ALTER TABLE controlled_documents ADD COLUMN IF NOT EXISTS capa_event_id INTEGER REFERENCES capa_events(id) ON DELETE SET NULL;
    ALTER TABLE controlled_documents ADD COLUMN IF NOT EXISTS document_number TEXT;
    ALTER TABLE controlled_documents ADD COLUMN IF NOT EXISTS document_type TEXT;
    ALTER TABLE controlled_documents ADD COLUMN IF NOT EXISTS title TEXT;
    ALTER TABLE controlled_documents ADD COLUMN IF NOT EXISTS active_revision_id INTEGER;
    ALTER TABLE controlled_documents ADD COLUMN IF NOT EXISTS active_revision_code TEXT;
    ALTER TABLE controlled_documents ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT;
    ALTER TABLE controlled_documents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE controlled_documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
  ensuredControlledDocumentShape = true;
}

async function loadDocumentSummaryRowsForCapa(client, capaEventId) {
  await ensureControlledDocumentShape(client);
  const { rows } = await client.query(
    `SELECT
       cd.*,
       latest.id AS latest_revision_id,
       latest.revision_code AS latest_revision_code,
       latest.status AS latest_revision_status
     FROM controlled_documents cd
     LEFT JOIN LATERAL (
       SELECT id, revision_code, status
       FROM controlled_document_revisions
       WHERE document_id=cd.id
       ORDER BY revision_index DESC, id DESC
       LIMIT 1
     ) latest ON true
     WHERE cd.capa_event_id=$1
     ORDER BY cd.updated_at DESC, cd.id DESC`,
    [capaEventId]
  );

  return rows.map(mapDocumentSummaryRow);
}

async function loadControlledDocumentDetailWithClient(client, documentId) {
  await ensureControlledDocumentShape(client);
  const docRes = await client.query(
    `SELECT
       cd.*,
       ce.issue_report_id,
       ce.title AS capa_title,
       ce.status AS capa_status,
       latest.id AS latest_revision_id,
       latest.revision_code AS latest_revision_code,
       latest.status AS latest_revision_status
     FROM controlled_documents cd
     LEFT JOIN capa_events ce ON ce.id=cd.capa_event_id
     LEFT JOIN LATERAL (
       SELECT id, revision_code, status
       FROM controlled_document_revisions
       WHERE document_id=cd.id
       ORDER BY revision_index DESC, id DESC
       LIMIT 1
     ) latest ON true
     WHERE cd.id=$1`,
    [documentId]
  );
  const documentRow = docRes.rows[0];
  if (!documentRow) {
    return null;
  }

  const [revisionsRes, trailRes] = await Promise.all([
    client.query(
      `SELECT *
       FROM controlled_document_revisions
       WHERE document_id=$1
       ORDER BY revision_index ASC, id ASC`,
      [documentId]
    ),
    client.query(
      `SELECT e.*, r.revision_code
       FROM controlled_document_revision_events e
       JOIN controlled_document_revisions r ON r.id=e.revision_id
       WHERE r.document_id=$1
       ORDER BY e.created_at ASC, e.id ASC`,
      [documentId]
    )
  ]);

  const revisions = revisionsRes.rows.map(mapRevisionRow);
  const changeTrail = trailRes.rows.map(mapTrailRow);
  const activeRevision = revisions.find((revision) => revision.id === Number(documentRow.active_revision_id)) || null;
  const latestRevision = revisions.length ? revisions[revisions.length - 1] : null;

  return {
    ...mapDocumentSummaryRow(documentRow),
    issueReportId: documentRow.issue_report_id == null ? null : Number(documentRow.issue_report_id),
    linkedCapa: documentRow.capa_event_id == null ? null : {
      id: Number(documentRow.capa_event_id),
      title: documentRow.capa_title || null,
      status: documentRow.capa_status || null
    },
    activeRevision,
    latestRevision,
    revisions,
    changeTrail
  };
}

async function insertRevisionEvent(client, { revisionId, action, fromStatus = null, toStatus, reason = null, actorUserId, actorRole }) {
  if (!VALID_REVISION_STATUSES.has(toStatus)) {
    throw new Error("invalid_revision_status");
  }
  await client.query(
    `INSERT INTO controlled_document_revision_events
       (revision_id, action, from_status, to_status, reason, actor_user_id, actor_role)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [revisionId, action, fromStatus, toStatus, trimOrNull(reason), actorUserId, actorRole || null]
  );
}

export async function listControlledDocumentsForCapa(capaEventId) {
  const id = Number(capaEventId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("invalid_capa_id");
  }
  return transaction(async (client) => {
    await ensureControlledDocumentShape(client);
    await ensureCapaExists(client, id);
    return loadDocumentSummaryRowsForCapa(client, id);
  });
}

export async function getControlledDocumentDetail(documentId) {
  const id = Number(documentId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("invalid_document_id");
  }
  return transaction(async (client) => loadControlledDocumentDetailWithClient(client, id));
}

export async function createControlledDocument({
  capaEventId,
  documentNumber,
  documentType,
  title,
  content = null,
  changeReason,
  actorUserId,
  actorRole
}) {
  const capaId = Number(capaEventId);
  const normalizedType = normalizeDocumentType(documentType);
  const trimmedDocumentNumber = trimOrNull(documentNumber);
  const trimmedTitle = trimOrNull(title);
  const trimmedContent = trimOrNull(content);
  const trimmedChangeReason = trimOrNull(changeReason);

  if (!normalizedType) throw new Error("invalid_document_type");
  if (!trimmedDocumentNumber) throw new Error("document_number_required");
  if (!trimmedTitle) throw new Error("title_required");
  if (!trimmedChangeReason) throw new Error("change_reason_required");

  return transaction(async (client) => {
    await ensureControlledDocumentShape(client);
    await ensureCapaExists(client, capaId);
    await ensureUserExists(client, actorUserId);

    const insertDocument = await client.query(
      `INSERT INTO controlled_documents
         (capa_event_id, document_number, document_type, title, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [capaId, trimmedDocumentNumber, normalizedType, trimmedTitle, actorUserId]
    );
    const document = insertDocument.rows[0];

    const insertRevision = await client.query(
      `INSERT INTO controlled_document_revisions
         (document_id, revision_code, revision_index, status, title, content, change_reason, created_by_user_id)
       VALUES ($1,'A',1,'draft',$2,$3,$4,$5)
       RETURNING *`,
      [document.id, trimmedTitle, trimmedContent, trimmedChangeReason, actorUserId]
    );
    const revision = insertRevision.rows[0];

    await insertRevisionEvent(client, {
      revisionId: revision.id,
      action: "created",
      fromStatus: null,
      toStatus: "draft",
      reason: trimmedChangeReason,
      actorUserId,
      actorRole
    });

    return loadControlledDocumentDetailWithClient(client, document.id);
  });
}

export async function createControlledDocumentRevision({
  documentId,
  title,
  content = null,
  changeReason,
  actorUserId,
  actorRole
}) {
  const id = Number(documentId);
  const trimmedTitle = trimOrNull(title);
  const trimmedContent = trimOrNull(content);
  const trimmedChangeReason = trimOrNull(changeReason);

  if (!Number.isInteger(id) || id <= 0) throw new Error("invalid_document_id");
  if (!trimmedChangeReason) throw new Error("change_reason_required");

  return transaction(async (client) => {
    await ensureControlledDocumentShape(client);
    await ensureUserExists(client, actorUserId);

    const docRes = await client.query("SELECT * FROM controlled_documents WHERE id=$1 FOR UPDATE", [id]);
    const document = docRes.rows[0];
    if (!document) throw new Error("document_not_found");

    const latestRes = await client.query(
      `SELECT *
       FROM controlled_document_revisions
       WHERE document_id=$1
       ORDER BY revision_index DESC, id DESC
       LIMIT 1
       FOR UPDATE`,
      [id]
    );
    const latest = latestRes.rows[0];
    if (!latest) throw new Error("document_revision_missing");
    if (latest.status === "draft" || latest.status === "approved") {
      throw new Error("open_revision_exists");
    }

    const nextCode = nextRevisionCode(latest.revision_code);
    const nextIndex = Number(latest.revision_index) + 1;
    const nextTitle = trimmedTitle || latest.title || document.title;

    const insertRevision = await client.query(
      `INSERT INTO controlled_document_revisions
         (document_id, revision_code, revision_index, status, title, content, change_reason, created_by_user_id)
       VALUES ($1,$2,$3,'draft',$4,$5,$6,$7)
       RETURNING *`,
      [id, nextCode, nextIndex, nextTitle, trimmedContent, trimmedChangeReason, actorUserId]
    );

    await client.query(
      `UPDATE controlled_documents
       SET updated_at=NOW()
       WHERE id=$1`,
      [id]
    );

    await insertRevisionEvent(client, {
      revisionId: insertRevision.rows[0].id,
      action: "created",
      fromStatus: null,
      toStatus: "draft",
      reason: trimmedChangeReason,
      actorUserId,
      actorRole
    });

    return loadControlledDocumentDetailWithClient(client, id);
  });
}

export async function approveControlledDocumentRevision({
  documentId,
  revisionId,
  actorUserId,
  actorRole,
  reason = null
}) {
  const documentIdNum = Number(documentId);
  const revisionIdNum = Number(revisionId);

  if (!Number.isInteger(documentIdNum) || documentIdNum <= 0) throw new Error("invalid_document_id");
  if (!Number.isInteger(revisionIdNum) || revisionIdNum <= 0) throw new Error("invalid_revision_id");

  return transaction(async (client) => {
    await ensureUserExists(client, actorUserId);

    const revisionRes = await client.query(
      `SELECT r.*
       FROM controlled_document_revisions r
       JOIN controlled_documents d ON d.id=r.document_id
       WHERE r.id=$1 AND d.id=$2
       FOR UPDATE`,
      [revisionIdNum, documentIdNum]
    );
    const revision = revisionRes.rows[0];
    if (!revision) throw new Error("revision_not_found");
    if (revision.status !== "draft") throw new Error("invalid_revision_state");

    await client.query(
      `UPDATE controlled_document_revisions
       SET status='approved',
           approved_by_user_id=$1,
           approved_at=NOW(),
           updated_at=NOW()
       WHERE id=$2`,
      [actorUserId, revisionIdNum]
    );
    await client.query(
      `UPDATE controlled_documents
       SET updated_at=NOW()
       WHERE id=$1`,
      [documentIdNum]
    );

    await insertRevisionEvent(client, {
      revisionId: revisionIdNum,
      action: "approved",
      fromStatus: revision.status,
      toStatus: "approved",
      reason,
      actorUserId,
      actorRole
    });

    return loadControlledDocumentDetailWithClient(client, documentIdNum);
  });
}

export async function releaseControlledDocumentRevision({
  documentId,
  revisionId,
  actorUserId,
  actorRole,
  reason = null
}) {
  const documentIdNum = Number(documentId);
  const revisionIdNum = Number(revisionId);

  if (!Number.isInteger(documentIdNum) || documentIdNum <= 0) throw new Error("invalid_document_id");
  if (!Number.isInteger(revisionIdNum) || revisionIdNum <= 0) throw new Error("invalid_revision_id");

  return transaction(async (client) => {
    await ensureUserExists(client, actorUserId);

    const revisionRes = await client.query(
      `SELECT r.*
       FROM controlled_document_revisions r
       JOIN controlled_documents d ON d.id=r.document_id
       WHERE r.id=$1 AND d.id=$2
       FOR UPDATE`,
      [revisionIdNum, documentIdNum]
    );
    const revision = revisionRes.rows[0];
    if (!revision) throw new Error("revision_not_found");
    if (revision.status !== "approved") throw new Error("invalid_revision_state");

    const previouslyReleasedRes = await client.query(
      `SELECT *
       FROM controlled_document_revisions
       WHERE document_id=$1 AND status='released' AND id <> $2
       ORDER BY revision_index DESC, id DESC`,
      [documentIdNum, revisionIdNum]
    );

    for (const previous of previouslyReleasedRes.rows) {
      await client.query(
        `UPDATE controlled_document_revisions
         SET status='superseded',
             updated_at=NOW()
         WHERE id=$1`,
        [previous.id]
      );
      await insertRevisionEvent(client, {
        revisionId: previous.id,
        action: "superseded",
        fromStatus: previous.status,
        toStatus: "superseded",
        reason: `Superseded by revision ${revision.revision_code}`,
        actorUserId,
        actorRole
      });
    }

    await client.query(
      `UPDATE controlled_document_revisions
       SET status='released',
           released_by_user_id=$1,
           released_at=NOW(),
           updated_at=NOW()
       WHERE id=$2`,
      [actorUserId, revisionIdNum]
    );
    await client.query(
      `UPDATE controlled_documents
       SET active_revision_id=$1,
           active_revision_code=$2,
           title=$3,
           updated_at=NOW()
       WHERE id=$4`,
      [revisionIdNum, revision.revision_code, revision.title, documentIdNum]
    );

    await insertRevisionEvent(client, {
      revisionId: revisionIdNum,
      action: "released",
      fromStatus: revision.status,
      toStatus: "released",
      reason,
      actorUserId,
      actorRole
    });

    return loadControlledDocumentDetailWithClient(client, documentIdNum);
  });
}
