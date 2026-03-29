import { Router } from "express";
import { query, transaction } from "../db.js";
import { requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";
import { getActorRole, getActorUserId } from "../middleware/authSession.js";
import {
  DEFAULT_AS9102_PROFILE_ID,
  listAs9102Profiles,
  renderAs9102Export
} from "../services/quality/as9102Exports.js";
import { refreshAnalyticsMartsIncremental } from "../services/analytics/martBuilder.js";
import {
  acknowledgeInstructionForContext,
  getActiveInstructionContext
} from "../services/instructions.js";

const router = Router();
const JOB_SUBMISSION_COLUMNS = [
  "id",
  "part_id",
  "operation_id",
  "status",
  "lock_owner_user_id"
].join(", ");
const ACTIVE_RECORD_COLUMNS = [
  "id",
  "job_id",
  "part_id",
  "operation_id",
  "lot",
  "serial_number",
  "qty",
  "timestamp",
  "operator_user_id",
  "status",
  "oot",
  "comment"
].join(", ");

function requestRole(req) {
  return getActorRole(req);
}

function parsePositiveInteger(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function resolveActorUserId(req, suppliedUserId) {
  const actorUserId = getActorUserId(req);
  const supplied = Number(suppliedUserId);
  const effective = Number.isInteger(actorUserId) ? actorUserId : supplied;
  return {
    actorUserId,
    suppliedUserId: supplied,
    effectiveUserId: effective
  };
}

function resolveInstructionOperatorUserId(req, value) {
  const actorUserId = getActorUserId(req);
  const requestedUserId = parsePositiveInteger(value);
  if (Number.isInteger(actorUserId) && actorUserId > 0) {
    if (requestedUserId && requestedUserId !== actorUserId) {
      return { error: "auth_user_mismatch" };
    }
    return { operatorUserId: actorUserId };
  }
  return { operatorUserId: requestedUserId };
}

async function getActiveRecordById(id, db = query) {
  const runner = typeof db?.query === "function"
    ? db.query.bind(db)
    : db;
  const { rows } = await runner(
    `SELECT ${ACTIVE_RECORD_COLUMNS}
     FROM records
     WHERE id=$1 AND deleted_at IS NULL`,
    [id]
  );
  return rows[0] || null;
}

function normalizeOptionalText(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function extractPieceNumberFromAuditField(field) {
  const m = String(field || "").match(/^dim:(\d+)\|piece:(\d+)$/);
  if (!m) return null;
  return { dimensionId: Number(m[1]), pieceNumber: Number(m[2]) };
}

function validateMissingPieces(missingPieces) {
  for (const m of missingPieces) {
    const pieceNumber = Number(m.pieceNumber);
    if (!Number.isInteger(pieceNumber) || pieceNumber <= 0 || !m.reason) return "missing_piece_fields";
    if (m.reason === "Scrapped" && !m.ncNum) return "scrapped_requires_nc";
    if (m.reason === "Other" && !m.details) return "other_requires_details";
  }
  return null;
}

function validateRecordValues(values, qty) {
  for (const v of values) {
    const dimId = Number(v.dimensionId);
    const pieceNumber = Number(v.pieceNumber);
    if (!Number.isInteger(dimId) || dimId <= 0) return "invalid_dimension_id";
    if (!Number.isInteger(pieceNumber) || pieceNumber <= 0) return "invalid_piece_number";
    if (qty && pieceNumber > qty) return "piece_number_out_of_range";
    if (v.value === undefined || v.value === null || String(v.value) === "") return "value_required";
  }
  return null;
}

function validateRecordTools(tools) {
  for (const t of tools) {
    const dimId = Number(t.dimensionId);
    const toolId = Number(t.toolId);
    if (!Number.isInteger(dimId) || dimId <= 0) return "invalid_dimension_id";
    if (!Number.isInteger(toolId) || toolId <= 0) return "invalid_tool_id";
    if (!t.itNum) return "tool_it_required";
  }
  return null;
}

function validatePieceComments(pieceComments, qty) {
  const seen = new Set();
  for (const item of pieceComments) {
    const pieceNumber = Number(item?.pieceNumber);
    const comment = String(item?.comment || "").trim();
    if (!Number.isInteger(pieceNumber) || pieceNumber <= 0) return "invalid_piece_number";
    if (qty && pieceNumber > qty) return "piece_number_out_of_range";
    if (!comment) return "piece_comment_required";
    if (seen.has(pieceNumber)) return "duplicate_piece_comment";
    seen.add(pieceNumber);
  }
  return null;
}

function isFiniteNonNegativeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0;
}

function splitRange(value) {
  const [minRaw = "", maxRaw = ""] = String(value || "").split("|");
  return [minRaw.trim(), maxRaw.trim()];
}

const DEFAULT_ATTACHMENT_RETENTION_DAYS = 365;
const MAX_ATTACHMENT_RETENTION_DAYS = 3650;
const MAX_ATTACHMENT_BYTES = Math.max(1, Number(process.env.RECORD_ATTACHMENT_MAX_BYTES || 1_500_000));

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

function normalizeAttachmentPayload(item, qty) {
  const pieceNumber = item?.pieceNumber == null ? null : Number(item.pieceNumber);
  if (pieceNumber != null && (!Number.isInteger(pieceNumber) || pieceNumber <= 0)) {
    return { error: "invalid_piece_number" };
  }
  if (qty && pieceNumber && pieceNumber > qty) {
    return { error: "piece_number_out_of_range" };
  }
  const fileName = String(item?.fileName || "").trim();
  if (!fileName || fileName.length > 255) {
    return { error: "invalid_attachment_file_name" };
  }
  const mediaType = String(item?.mediaType || "").trim().toLowerCase();
  if (!mediaType || mediaType.length > 120) {
    return { error: "invalid_attachment_media_type" };
  }
  const decoded = decodeBase64Payload(item?.dataBase64);
  if (!decoded) return { error: "invalid_attachment_data" };
  if (decoded.bytes.length > MAX_ATTACHMENT_BYTES) {
    return { error: "attachment_too_large" };
  }
  const retentionDaysRaw = item?.retentionDays == null
    ? DEFAULT_ATTACHMENT_RETENTION_DAYS
    : Number(item.retentionDays);
  if (!Number.isInteger(retentionDaysRaw) || retentionDaysRaw <= 0 || retentionDaysRaw > MAX_ATTACHMENT_RETENTION_DAYS) {
    return { error: "invalid_retention_days" };
  }
  return {
    pieceNumber,
    fileName,
    mediaType,
    dataBase64: decoded.normalized,
    byteSize: decoded.bytes.length,
    retentionDays: retentionDaysRaw
  };
}

async function refreshAnalyticsForRecordMutation({
  triggerSource,
  role,
  userId,
  recordId
}) {
  const safeRecordId = parsePositiveInteger(recordId);
  if (!safeRecordId) return;
  await refreshAnalyticsMartsIncremental({
    triggerSource,
    requestedByRole: role || "system",
    requestedByUserId: parsePositiveInteger(userId),
    recordIds: [safeRecordId]
  });
}

async function deactivateRecordById(id, actorUserId, actorRole) {
  return transaction(async (client) => {
    const record = await getActiveRecordById(id, client);
    if (!record) return { error: "not_found" };
    if (!Number.isInteger(actorUserId) || actorUserId <= 0) return { error: "user_required" };

    const deletedRes = await client.query(
      `UPDATE records
       SET deleted_at = NOW()
       WHERE id=$1 AND deleted_at IS NULL
       RETURNING deleted_at`,
      [id]
    );
    const deletedAt = deletedRes.rows[0]?.deleted_at || null;
    if (!deletedAt) return { error: "not_found" };

    await client.query(
      `UPDATE record_attachments
       SET deleted_at = COALESCE(deleted_at, NOW()),
           updated_at = NOW()
       WHERE record_id=$1 AND deleted_at IS NULL`,
      [id]
    );

    await client.query(
      `INSERT INTO audit_log (record_id, user_id, field, before_value, after_value, reason)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, actorUserId, "deleted_at", null, deletedAt.toISOString(), `soft_delete:${actorRole || "unknown"}`]
    );

    return { deletedAt: deletedAt.toISOString() };
  });
}

async function validateRecordRefs(operationId, values, tools) {
  const dimIds = Array.from(
    new Set([
      ...values.map((v) => Number(v.dimensionId)),
      ...tools.map((t) => Number(t.dimensionId))
    ].filter(Boolean))
  );
  const toolIds = Array.from(
    new Set(tools.map((t) => Number(t.toolId)).filter(Boolean))
  );

  if (dimIds.length) {
    const { rows } = await query(
      "SELECT id FROM dimensions WHERE operation_id=$1 AND id = ANY($2)",
      [operationId, dimIds]
    );
    if (rows.length !== dimIds.length) return "invalid_dimension_for_operation";
  }

  if (toolIds.length) {
    const { rows } = await query(
      "SELECT id FROM tools WHERE id = ANY($1)",
      [toolIds]
    );
    if (rows.length !== toolIds.length) return "invalid_tool_id";
  }

  if (dimIds.length && tools.length) {
    const { rows } = await query(
      "SELECT dimension_id, tool_id FROM dimension_tools WHERE dimension_id = ANY($1)",
      [dimIds]
    );
    const allowed = new Set(rows.map((r) => `${r.dimension_id}:${r.tool_id}`));
    for (const t of tools) {
      const key = `${Number(t.dimensionId)}:${Number(t.toolId)}`;
      if (!allowed.has(key)) return "tool_not_allowed_for_dimension";
    }
  }

  return null;
}

router.get("/", requireCapability("view_records"), async (req, res, next) => {
  try {
    const { partId, operationId, status, result, serial } = req.query;
    const filters = ["deleted_at IS NULL"];
    const params = [];
    if (partId) { params.push(partId); filters.push(`part_id=$${params.length}`); }
    if (operationId) { params.push(operationId); filters.push(`operation_id=$${params.length}`); }
    if (status) { params.push(status); filters.push(`status=$${params.length}`); }
    if (serial) { params.push(serial); filters.push(`serial_number=$${params.length}`); }
    if (result === "oot") {
      filters.push("oot=true");
    } else if (result === "complete-ok") {
      filters.push("status='complete'");
      filters.push("oot=false");
    } else if (result === "incomplete") {
      filters.push("status='incomplete'");
    }
    const where = `WHERE ${filters.join(" AND ")}`;

    const { rows } = await query(
      `SELECT id, job_id, part_id, operation_id, lot, serial_number, qty, timestamp, operator_user_id, status, oot, comment FROM records ${where} ORDER BY timestamp DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get("/trace", requireCapability("view_records"), async (req, res, next) => {
  try {
    const { jobId, partId, lot, pieceNumber, serial, limit } = req.query;
    const trimmedJobId = String(jobId || "").trim() || null;
    const trimmedPartId = String(partId || "").trim() || null;
    const trimmedLot = String(lot || "").trim() || null;
    const trimmedSerial = String(serial || "").trim() || null;
    const pieceNumberNum = pieceNumber === undefined ? null : parsePositiveInteger(pieceNumber);
    const limitNum = parsePositiveInteger(limit) || 200;

    if (pieceNumber !== undefined && !pieceNumberNum) {
      return res.status(400).json({ error: "invalid_piece_number" });
    }

    const filters = [];
    const params = [];
    if (trimmedJobId) {
      params.push(trimmedJobId);
      filters.push(`r.job_id=$${params.length}`);
    }
    if (trimmedPartId) {
      params.push(trimmedPartId);
      filters.push(`r.part_id=$${params.length}`);
    }
    if (trimmedLot) {
      params.push(trimmedLot);
      filters.push(`r.lot=$${params.length}`);
    }
    if (trimmedSerial) {
      params.push(trimmedSerial);
      filters.push(`(r.serial_number=$${params.length} OR EXISTS (
        SELECT 1 FROM record_piece_comments rpc
        WHERE rpc.record_id=r.id AND rpc.serial_number=$${params.length}
      ))`);
    }
    if (pieceNumberNum) {
      params.push(pieceNumberNum);
      filters.push(`(
        EXISTS (SELECT 1 FROM record_values rv WHERE rv.record_id=r.id AND rv.piece_number=$${params.length})
        OR EXISTS (SELECT 1 FROM missing_pieces mp WHERE mp.record_id=r.id AND mp.piece_number=$${params.length})
        OR EXISTS (SELECT 1 FROM record_piece_comments rpc WHERE rpc.record_id=r.id AND rpc.piece_number=$${params.length})
      )`);
    }

    filters.unshift("r.deleted_at IS NULL");
    const where = `WHERE ${filters.join(" AND ")}`;
    params.push(Math.min(limitNum, 500));

    const recordRes = await query(
      `SELECT r.id, r.job_id, r.part_id, r.operation_id, r.lot, r.serial_number, r.qty, r.timestamp,
              r.operator_user_id, r.status, r.oot, r.comment,
              j.part_revision_code, j.qty AS job_qty, j.status AS job_status,
              o.op_number, o.label AS operation_label, o.work_center_id, wc.code AS work_center_code, wc.name AS work_center_name
       FROM records r
       JOIN jobs j ON j.id = r.job_id
       JOIN operations o ON o.id = r.operation_id
       LEFT JOIN work_centers wc ON wc.id = o.work_center_id
       ${where}
       ORDER BY r.timestamp DESC, r.id DESC
       LIMIT $${params.length}`,
      params
    );

    if (!recordRes.rows.length) {
      return res.json({
        filters: {
          jobId: trimmedJobId,
          partId: trimmedPartId,
          lot: trimmedLot,
          pieceNumber: pieceNumberNum,
          serial: trimmedSerial
        },
        count: 0,
        records: []
      });
    }

    const recordIds = recordRes.rows.map((r) => Number(r.id));
    const jobIds = Array.from(new Set(recordRes.rows.map((r) => String(r.job_id))));

    const valuesRes = await query(
      `SELECT rv.record_id, rv.dimension_id, COALESCE(rds.name, d.name) AS dimension_name,
              COALESCE(rds.bubble_number, d.bubble_number) AS bubble_number,
              COALESCE(rds.source_characteristic_key, d.source_characteristic_key) AS source_characteristic_key,
              rv.piece_number, rv.value, rv.is_oot
       FROM record_values rv
       LEFT JOIN record_dimension_snapshots rds
         ON rds.record_id = rv.record_id AND rds.dimension_id = rv.dimension_id
       LEFT JOIN dimensions d ON d.id = rv.dimension_id
       WHERE rv.record_id = ANY($1)
       ORDER BY rv.record_id ASC, rv.piece_number ASC, rv.dimension_id ASC`,
      [recordIds]
    );

    const missingRes = await query(
      `SELECT record_id, piece_number, reason, nc_num, details
       FROM missing_pieces
       WHERE record_id = ANY($1)
       ORDER BY record_id ASC, piece_number ASC`,
      [recordIds]
    );

    const pieceCommentRes = await query(
      `SELECT rpc.id, rpc.record_id, rpc.piece_number, rpc.comment, rpc.serial_number,
              rpc.created_by_user_id, u.name AS created_by_user_name,
              rpc.created_by_role, rpc.created_at, rpc.updated_at
       FROM record_piece_comments rpc
       LEFT JOIN users u ON u.id = rpc.created_by_user_id
       WHERE rpc.record_id = ANY($1)
       ORDER BY rpc.record_id ASC, rpc.piece_number ASC`,
      [recordIds]
    );

    const auditRes = await query(
      `SELECT a.id, a.record_id, a.user_id, u.name AS user_name, a.field, a.before_value, a.after_value, a.reason, a.timestamp
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.record_id = ANY($1)
       ORDER BY a.record_id ASC, a.timestamp DESC, a.id DESC`,
      [recordIds]
    );

    const pieceCommentAuditRes = await query(
      `SELECT pca.id, pca.piece_comment_id, pca.record_id, pca.piece_number, pca.user_id, u.name AS user_name,
              pca.user_role, pca.before_comment, pca.before_serial_number, pca.after_comment, pca.after_serial_number,
              pca.reason, pca.timestamp
       FROM record_piece_comment_audit pca
       LEFT JOIN users u ON u.id = pca.user_id
       WHERE pca.record_id = ANY($1)
      ORDER BY pca.record_id ASC, pca.timestamp DESC, pca.id DESC`,
      [recordIds]
    );

    const attachmentsRes = await query(
      `SELECT id, record_id, piece_number, file_name, media_type, byte_size, retention_until,
              uploaded_by_user_id, uploaded_by_role, created_at
       FROM record_attachments
       WHERE record_id = ANY($1) AND deleted_at IS NULL
       ORDER BY record_id ASC, created_at ASC, id ASC`,
      [recordIds]
    );

    const qtyAdjustRes = await query(
      `SELECT qa.id, qa.job_id, qa.before_qty, qa.after_qty, qa.reason, qa.actor_user_id,
              qa.actor_role, qa.created_at, u.name AS actor_user_name
       FROM job_quantity_adjustments qa
       LEFT JOIN users u ON u.id = qa.actor_user_id
       WHERE qa.job_id = ANY($1)
       ORDER BY qa.job_id ASC, qa.created_at DESC, qa.id DESC`,
      [jobIds]
    );

    const valuesByRecord = {};
    for (const row of valuesRes.rows) {
      if (!valuesByRecord[row.record_id]) valuesByRecord[row.record_id] = [];
      valuesByRecord[row.record_id].push(row);
    }

    const missingByRecord = {};
    for (const row of missingRes.rows) {
      if (!missingByRecord[row.record_id]) missingByRecord[row.record_id] = [];
      missingByRecord[row.record_id].push(row);
    }

    const pieceCommentsByRecord = {};
    for (const row of pieceCommentRes.rows) {
      if (!pieceCommentsByRecord[row.record_id]) pieceCommentsByRecord[row.record_id] = [];
      pieceCommentsByRecord[row.record_id].push(row);
    }

    const correctionsByRecord = {};
    for (const row of auditRes.rows) {
      const pieceInfo = extractPieceNumberFromAuditField(row.field);
      if (!pieceInfo) continue;
      if (!correctionsByRecord[row.record_id]) correctionsByRecord[row.record_id] = [];
      correctionsByRecord[row.record_id].push({
        ...row,
        dimension_id: pieceInfo.dimensionId,
        piece_number: pieceInfo.pieceNumber
      });
    }

    const pieceCommentAuditByRecord = {};
    for (const row of pieceCommentAuditRes.rows) {
      if (!pieceCommentAuditByRecord[row.record_id]) pieceCommentAuditByRecord[row.record_id] = [];
      pieceCommentAuditByRecord[row.record_id].push(row);
    }

    const attachmentsByRecord = {};
    for (const row of attachmentsRes.rows) {
      if (!attachmentsByRecord[row.record_id]) attachmentsByRecord[row.record_id] = [];
      attachmentsByRecord[row.record_id].push(row);
    }

    const qtyAdjustByJob = {};
    for (const row of qtyAdjustRes.rows) {
      if (!qtyAdjustByJob[row.job_id]) qtyAdjustByJob[row.job_id] = [];
      qtyAdjustByJob[row.job_id].push(row);
    }

    const records = recordRes.rows.map((row) => {
      const values = valuesByRecord[row.id] || [];
      const missingPieces = missingByRecord[row.id] || [];
      const pieceComments = pieceCommentsByRecord[row.id] || [];
      const corrections = correctionsByRecord[row.id] || [];
      const pieceCommentCorrections = pieceCommentAuditByRecord[row.id] || [];

      const filteredValues = pieceNumberNum ? values.filter((v) => Number(v.piece_number) === pieceNumberNum) : values;
      const filteredMissing = pieceNumberNum ? missingPieces.filter((v) => Number(v.piece_number) === pieceNumberNum) : missingPieces;
      const filteredComments = pieceNumberNum ? pieceComments.filter((v) => Number(v.piece_number) === pieceNumberNum) : pieceComments;
      const filteredCorrections = pieceNumberNum ? corrections.filter((v) => Number(v.piece_number) === pieceNumberNum) : corrections;
      const filteredCommentCorrections = pieceNumberNum
        ? pieceCommentCorrections.filter((v) => Number(v.piece_number) === pieceNumberNum)
        : pieceCommentCorrections;

      return {
        id: row.id,
        job: {
          id: row.job_id,
          part_id: row.part_id,
          part_revision_code: row.part_revision_code,
          lot: row.lot,
          qty: row.job_qty,
          status: row.job_status
        },
        record: {
          id: row.id,
          operation_id: row.operation_id,
          lot: row.lot,
          serial_number: row.serial_number,
          qty: row.qty,
          timestamp: row.timestamp,
          operator_user_id: row.operator_user_id,
          status: row.status,
          oot: row.oot,
          comment: row.comment
        },
        operation: {
          id: row.operation_id,
          op_number: row.op_number,
          label: row.operation_label,
          work_center_id: row.work_center_id,
          work_center_code: row.work_center_code,
          work_center_name: row.work_center_name
        },
        values: filteredValues,
        missingPieces: filteredMissing,
        pieceComments: filteredComments,
        corrections: filteredCorrections,
        pieceCommentCorrections: filteredCommentCorrections,
        attachments: attachmentsByRecord[row.id] || [],
        quantityAdjustments: qtyAdjustByJob[row.job_id] || []
      };
    });

    res.json({
      filters: {
        jobId: trimmedJobId,
        partId: trimmedPartId,
        lot: trimmedLot,
        pieceNumber: pieceNumberNum,
        serial: trimmedSerial
      },
      count: records.length,
      records
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", requireCapability("view_records"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const record = await getActiveRecordById(id);
    if (!record) return res.status(404).json({ error: "not_found" });

    const dimsSnapshotRes = await query(
      `SELECT dimension_id AS id, name, bubble_number, feature_type, gdt_class, tolerance_zone,
              feature_quantity, feature_units, feature_modifiers_json, source_characteristic_key,
              nominal, tol_plus, tol_minus, unit, sampling, sampling_interval, input_mode
       FROM record_dimension_snapshots
       WHERE record_id=$1
       ORDER BY dimension_id ASC`,
      [id]
    );
    const dimsRes = dimsSnapshotRes.rows.length
      ? dimsSnapshotRes
      : await query(
          "SELECT id, operation_id, name, bubble_number, feature_type, gdt_class, tolerance_zone, feature_quantity, feature_units, feature_modifiers_json, source_characteristic_key, nominal, tol_plus, tol_minus, unit, sampling, sampling_interval, input_mode FROM dimensions WHERE operation_id=$1 ORDER BY id ASC",
          [record.operation_id]
        );
    const valuesRes = await query(
      "SELECT record_id, dimension_id, piece_number, value, is_oot FROM record_values WHERE record_id=$1 ORDER BY piece_number ASC",
      [id]
    );
    const toolsRes = await query(
      `SELECT rt.record_id, rt.dimension_id, rt.tool_id, rt.it_num, t.name AS tool_name, t.type AS tool_type
       FROM record_tools rt
       JOIN tools t ON t.id = rt.tool_id
       WHERE rt.record_id=$1
       ORDER BY rt.dimension_id ASC, rt.tool_id ASC`,
      [id]
    );
    const missingRes = await query(
      "SELECT record_id, piece_number, reason, nc_num, details FROM missing_pieces WHERE record_id=$1 ORDER BY piece_number ASC",
      [id]
    );
    const pieceCommentsRes = await query(
      `SELECT rpc.id, rpc.record_id, rpc.piece_number, rpc.comment, rpc.serial_number,
              rpc.created_by_user_id, u.name AS created_by_user_name,
              rpc.created_by_role, rpc.created_at, rpc.updated_at
       FROM record_piece_comments rpc
       LEFT JOIN users u ON u.id = rpc.created_by_user_id
       WHERE rpc.record_id=$1
       ORDER BY rpc.piece_number ASC`,
      [id]
    );
    const pieceCommentAuditRes = await query(
      `SELECT pca.id, pca.piece_comment_id, pca.record_id, pca.piece_number, pca.user_id, u.name AS user_name,
              pca.user_role, pca.before_comment, pca.before_serial_number, pca.after_comment, pca.after_serial_number,
              pca.reason, pca.timestamp
       FROM record_piece_comment_audit pca
       LEFT JOIN users u ON u.id = pca.user_id
       WHERE pca.record_id=$1
       ORDER BY pca.timestamp DESC, pca.id DESC`,
      [id]
    );
    const auditRes = await query(
      "SELECT id, record_id, user_id, timestamp, field, before_value, after_value, reason FROM audit_log WHERE record_id=$1 ORDER BY timestamp DESC",
      [id]
    );
    const attachmentsRes = await query(
      `SELECT id, record_id, piece_number, file_name, media_type, byte_size, retention_until,
              uploaded_by_user_id, uploaded_by_role, created_at, updated_at
       FROM record_attachments
       WHERE record_id=$1 AND deleted_at IS NULL
       ORDER BY created_at ASC, id ASC`,
      [id]
    );

    res.json({
      ...record,
      dimensions: dimsRes.rows,
      values: valuesRes.rows,
      tools: toolsRes.rows,
      missingPieces: missingRes.rows,
      pieceComments: pieceCommentsRes.rows,
      pieceCommentAudit: pieceCommentAuditRes.rows,
      attachments: attachmentsRes.rows,
      auditLog: auditRes.rows
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/instructions/active", requireAnyCapability(["submit_records", "view_records", "edit_records", "view_admin"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!(await getActiveRecordById(id))) return res.status(404).json({ error: "not_found" });
    const resolvedUser = resolveInstructionOperatorUserId(req, req.query.operatorUserId);
    if (resolvedUser.error === "auth_user_mismatch") {
      return res.status(403).json({ error: "auth_user_mismatch" });
    }

    const active = await getActiveInstructionContext(
      { query },
      {
        contextType: "record",
        contextId: id,
        operatorUserId: resolvedUser.operatorUserId
      }
    );
    if (!active) return res.status(404).json({ error: "not_found" });
    res.json(active);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/instructions/acknowledgments", requireCapability("acknowledge_instructions"), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!(await getActiveRecordById(id))) return res.status(404).json({ error: "not_found" });
    if (req.body?.role !== undefined || req.body?.actorRole !== undefined) {
      return res.status(400).json({ error: "role_field_not_allowed" });
    }
    const resolvedUser = resolveInstructionOperatorUserId(req, req.body?.operatorUserId);
    if (resolvedUser.error === "auth_user_mismatch") {
      return res.status(403).json({ error: "auth_user_mismatch" });
    }

    const requestedVersionId = req.body?.instructionVersionId == null
      ? null
      : parsePositiveInteger(req.body.instructionVersionId);
    if (req.body?.instructionVersionId != null && requestedVersionId == null) {
      return res.status(400).json({ error: "invalid_instruction_version_id" });
    }

    const acknowledged = await transaction(async (client) => acknowledgeInstructionForContext(client, {
      contextType: "record",
      contextId: Number(id),
      operatorUserId: resolvedUser.operatorUserId,
      actorRole: requestRole(req),
      instructionVersionId: requestedVersionId
    }));

    if (acknowledged?.error === "operator_user_required") {
      return res.status(400).json({ error: "operator_user_required" });
    }
    if (acknowledged?.error === "operator_not_found") {
      return res.status(400).json({ error: "operator_not_found" });
    }
    if (acknowledged?.error === "operator_role_required") {
      return res.status(400).json({ error: "operator_role_required" });
    }
    if (acknowledged?.error === "instruction_not_published") {
      return res.status(409).json({ error: "instruction_not_published" });
    }
    if (acknowledged?.error === "instruction_version_not_active") {
      return res.status(409).json({ error: "instruction_version_not_active" });
    }
    if (acknowledged?.error === "not_found") return res.status(404).json({ error: "not_found" });

    res.status(acknowledged.created ? 201 : 200).json(acknowledged);
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "instruction_already_acknowledged" });
    }
    next(err);
  }
});

router.get("/:id/attachments", requireCapability("view_records"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const record = await getActiveRecordById(id);
    if (!record) return res.status(404).json({ error: "not_found" });
    const includeData = String(req.query.includeData || "").toLowerCase() === "true";
    const fields = includeData
      ? "id, record_id, piece_number, file_name, media_type, byte_size, data_base64, retention_until, uploaded_by_user_id, uploaded_by_role, created_at, updated_at"
      : "id, record_id, piece_number, file_name, media_type, byte_size, retention_until, uploaded_by_user_id, uploaded_by_role, created_at, updated_at";
    const { rows } = await query(
      `SELECT ${fields}
       FROM record_attachments
       WHERE record_id=$1 AND deleted_at IS NULL
       ORDER BY created_at ASC, id ASC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get("/:id/attachments/:attachmentId", requireCapability("view_records"), async (req, res, next) => {
  try {
    const { id, attachmentId } = req.params;
    const record = await getActiveRecordById(id);
    if (!record) return res.status(404).json({ error: "not_found" });
    const attachmentRes = await query(
      `SELECT id, record_id, piece_number, file_name, media_type, byte_size, data_base64, retention_until,
              uploaded_by_user_id, uploaded_by_role, created_at, updated_at
       FROM record_attachments
       WHERE id=$1 AND record_id=$2 AND deleted_at IS NULL`,
      [attachmentId, id]
    );
    const attachment = attachmentRes.rows[0];
    if (!attachment) return res.status(404).json({ error: "not_found" });
    res.json(attachment);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/attachments", requireAnyCapability(["submit_records", "edit_records"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId, pieceNumber, fileName, mediaType, dataBase64, retentionDays } = req.body || {};
    const { actorUserId, suppliedUserId, effectiveUserId } = resolveActorUserId(req, userId);
    if (!Number.isInteger(effectiveUserId)) {
      return res.status(400).json({ error: "required_fields_missing" });
    }
    if (Number.isInteger(actorUserId) && Number.isInteger(suppliedUserId) && suppliedUserId !== actorUserId) {
      return res.status(403).json({ error: "auth_user_mismatch" });
    }

    const role = requestRole(req);
    const created = await transaction(async (client) => {
      const userRes = await client.query("SELECT id FROM users WHERE id=$1", [effectiveUserId]);
      if (!userRes.rows[0]) return { error: "user_not_found" };
      const record = await getActiveRecordById(id, client);
      if (!record) return { error: "record_not_found" };
      const normalized = normalizeAttachmentPayload({ pieceNumber, fileName, mediaType, dataBase64, retentionDays }, Number(record.qty));
      if (normalized.error) return { error: normalized.error };
      const insertRes = await client.query(
        `INSERT INTO record_attachments
           (record_id, piece_number, file_name, media_type, byte_size, data_base64, retention_until, uploaded_by_user_id, uploaded_by_role)
         VALUES ($1,$2,$3,$4,$5,$6,NOW() + ($7 * INTERVAL '1 day'),$8,$9)
         RETURNING id, record_id, piece_number, file_name, media_type, byte_size, retention_until, uploaded_by_user_id, uploaded_by_role, created_at, updated_at`,
        [id, normalized.pieceNumber, normalized.fileName, normalized.mediaType, normalized.byteSize, normalized.dataBase64, normalized.retentionDays, effectiveUserId, role]
      );
      return insertRes.rows[0];
    });

    if (created?.error === "user_not_found") return res.status(400).json({ error: "user_not_found" });
    if (created?.error === "record_not_found") return res.status(404).json({ error: "not_found" });
    if (created?.error) return res.status(400).json({ error: created.error });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.put("/:id/attachments/:attachmentId/retention", requireCapability("edit_records"), async (req, res, next) => {
  try {
    const { id, attachmentId } = req.params;
    const { userId, retentionDays } = req.body || {};
    const { actorUserId, suppliedUserId, effectiveUserId } = resolveActorUserId(req, userId);
    if (!Number.isInteger(effectiveUserId)) {
      return res.status(400).json({ error: "required_fields_missing" });
    }
    if (Number.isInteger(actorUserId) && Number.isInteger(suppliedUserId) && suppliedUserId !== actorUserId) {
      return res.status(403).json({ error: "auth_user_mismatch" });
    }
    const retention = Number(retentionDays);
    if (!Number.isInteger(retention) || retention <= 0 || retention > MAX_ATTACHMENT_RETENTION_DAYS) {
      return res.status(400).json({ error: "invalid_retention_days" });
    }
    const updated = await transaction(async (client) => {
      const userRes = await client.query("SELECT id FROM users WHERE id=$1", [effectiveUserId]);
      if (!userRes.rows[0]) return { error: "user_not_found" };
      const record = await getActiveRecordById(id, client);
      if (!record) return { error: "not_found" };
      const updateRes = await client.query(
        `UPDATE record_attachments
         SET retention_until = NOW() + ($1 * INTERVAL '1 day'),
             updated_at = NOW()
         WHERE id=$2 AND record_id=$3 AND deleted_at IS NULL
         RETURNING id, record_id, piece_number, file_name, media_type, byte_size, retention_until, uploaded_by_user_id, uploaded_by_role, created_at, updated_at`,
        [retention, attachmentId, id]
      );
      return updateRes.rows[0] || { error: "not_found" };
    });
    if (updated?.error === "user_not_found") return res.status(400).json({ error: "user_not_found" });
    if (updated?.error === "not_found") return res.status(404).json({ error: "not_found" });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/deactivate", requireCapability("edit_records"), async (req, res, next) => {
  try {
    const result = await deactivateRecordById(req.params.id, getActorUserId(req), requestRole(req));
    if (result?.error === "user_required") return res.status(400).json({ error: "user_required" });
    if (result?.error === "not_found") return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, deletedAt: result.deletedAt });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireCapability("edit_records"), async (req, res, next) => {
  try {
    const result = await deactivateRecordById(req.params.id, getActorUserId(req), requestRole(req));
    if (result?.error === "user_required") return res.status(400).json({ error: "user_required" });
    if (result?.error === "not_found") return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, deletedAt: result.deletedAt });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/export", requireCapability("view_records"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const recordIds = [Number(id)];
    const record = await getActiveRecordById(id);
    if (!record) return res.status(404).json({ error: "not_found" });

    const { rows } = await query(
      `SELECT rv.record_id, rv.dimension_id, COALESCE(rds.name, d.name) AS dimension_name,
              COALESCE(rds.bubble_number, d.bubble_number) AS bubble_number,
              COALESCE(rds.feature_type, d.feature_type) AS feature_type,
              COALESCE(rds.gdt_class, d.gdt_class) AS gdt_class,
              COALESCE(rds.tolerance_zone, d.tolerance_zone) AS tolerance_zone,
              COALESCE(rds.feature_quantity, d.feature_quantity) AS feature_quantity,
              COALESCE(rds.feature_units, d.feature_units) AS feature_units,
              COALESCE(rds.feature_modifiers_json, d.feature_modifiers_json, '[]'::jsonb) AS feature_modifiers_json,
              COALESCE(rds.source_characteristic_key, d.source_characteristic_key) AS source_characteristic_key,
              rv.piece_number, rv.value, rv.is_oot,
              rpc.comment AS piece_comment, rpc.serial_number AS piece_serial_number
       FROM record_values rv
       LEFT JOIN record_dimension_snapshots rds
         ON rds.record_id = rv.record_id AND rds.dimension_id = rv.dimension_id
       LEFT JOIN dimensions d ON d.id = rv.dimension_id
       LEFT JOIN record_piece_comments rpc
         ON rpc.record_id = rv.record_id AND rpc.piece_number = rv.piece_number
       WHERE rv.record_id = ANY($1)
       ORDER BY rv.piece_number ASC, rv.dimension_id ASC`,
      [recordIds]
    );

    const auditRes = await query(
      `SELECT a.field, a.before_value, a.after_value, a.reason, a.timestamp, a.user_id, u.name AS user_name
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.record_id = ANY($1)
       ORDER BY a.timestamp ASC`,
      [recordIds]
    );
    const auditByKey = {};
    for (const a of auditRes.rows) {
      const m = String(a.field || "").match(/^dim:(\d+)\|piece:(\d+)$/);
      if (!m) continue;
      const key = `${m[1]}_${m[2]}`;
      if (!auditByKey[key]) auditByKey[key] = [];
      auditByKey[key].push(a);
    }

    const pieceAuditRes = await query(
      `SELECT piece_number, before_comment, after_comment, reason, timestamp, user_id
       FROM record_piece_comment_audit
       WHERE record_id = ANY($1)
       ORDER BY timestamp ASC, id ASC`,
      [recordIds]
    );
    const pieceAuditByNumber = {};
    for (const row of pieceAuditRes.rows) {
      const key = String(row.piece_number);
      if (!pieceAuditByNumber[key]) pieceAuditByNumber[key] = [];
      pieceAuditByNumber[key].push(row);
    }

    const header = [
      "record_id",
      "dimension_id",
      "dimension_name",
      "bubble_number",
      "feature_type",
      "gdt_class",
      "tolerance_zone",
      "feature_quantity",
      "feature_units",
      "feature_modifiers",
      "source_characteristic_key",
      "piece_number",
      "value",
      "is_oot",
      "record_serial_number",
      "piece_serial_number",
      "piece_comment",
      "piece_comment_override_count",
      "piece_comment_last_reason",
      "piece_comment_last_before",
      "piece_comment_last_after",
      "override_count",
      "last_override_ts",
      "last_override_user_id",
      "last_override_user",
      "last_override_reason",
      "last_before_value",
      "last_after_value"
    ].join(",");

    const lines = rows.map((r) => {
      const key = `${r.dimension_id}_${r.piece_number}`;
      const edits = auditByKey[key] || [];
      const last = edits.length ? edits[edits.length - 1] : null;

      const pieceAudit = pieceAuditByNumber[String(r.piece_number)] || [];
      const pieceLast = pieceAudit.length ? pieceAudit[pieceAudit.length - 1] : null;

      return [
        r.record_id,
        r.dimension_id,
        csvEscape(r.dimension_name),
        csvEscape(r.bubble_number || ""),
        csvEscape(r.feature_type || ""),
        csvEscape(r.gdt_class || ""),
        csvEscape(r.tolerance_zone || ""),
        r.feature_quantity ?? "",
        csvEscape(r.feature_units || ""),
        csvEscape(
          Array.isArray(r.feature_modifiers_json)
            ? r.feature_modifiers_json.join("|")
            : ""
        ),
        csvEscape(r.source_characteristic_key || ""),
        r.piece_number,
        csvEscape(r.value),
        r.is_oot,
        csvEscape(record.serial_number || ""),
        csvEscape(r.piece_serial_number || ""),
        csvEscape(r.piece_comment || ""),
        pieceAudit.length,
        csvEscape(pieceLast?.reason || ""),
        csvEscape(pieceLast?.before_comment || ""),
        csvEscape(pieceLast?.after_comment || ""),
        edits.length,
        csvEscape(last?.timestamp || ""),
        last?.user_id ?? "",
        csvEscape(last?.user_name || ""),
        csvEscape(last?.reason || ""),
        csvEscape(last?.before_value || ""),
        csvEscape(last?.after_value || "")
      ].join(",");
    });

    const csv = [header, ...lines].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

router.get("/:id/export/as9102", requireCapability("view_records"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const profileId = String(req.query.profile || req.query.profileId || DEFAULT_AS9102_PROFILE_ID).trim()
      || DEFAULT_AS9102_PROFILE_ID;

    const { rows } = await query(
      `SELECT r.*, j.part_revision_code, j.qty AS job_qty,
              p.description AS part_description,
              o.op_number, o.label AS op_label
       FROM records r
       LEFT JOIN jobs j ON j.id = r.job_id
       LEFT JOIN parts p ON p.id = r.part_id
       LEFT JOIN operations o ON o.id = r.operation_id
       WHERE r.id=$1 AND r.deleted_at IS NULL`,
      [id]
    );
    const record = rows[0];
    if (!record) return res.status(404).json({ error: "not_found" });

    const valuesRes = await query(
      "SELECT is_oot FROM record_values WHERE record_id=$1",
      [id]
    );
    const characteristicsRes = await query(
      `SELECT dimension_id, name, bubble_number, feature_type, gdt_class, tolerance_zone,
              feature_quantity, feature_units, feature_modifiers_json, source_characteristic_key
       FROM record_dimension_snapshots
       WHERE record_id=$1
       ORDER BY dimension_id ASC`,
      [id]
    );
    const measured = valuesRes.rows.length;
    const failed = valuesRes.rows.filter((row) => row.is_oot).length;
    const passRate = measured ? (measured - failed) / measured : 1;

    const inspectorRes = await query(
      "SELECT id, name, role FROM users WHERE id=$1",
      [record.operator_user_id]
    );
    const inspector = inspectorRes.rows[0] || {
      id: record.operator_user_id || null,
      name: "Unknown",
      role: null
    };

    const input = {
      part: {
        id: record.part_id,
        revision: record.part_revision_code || "A",
        description: record.part_description || null
      },
      lot: record.lot,
      inspector,
      stats: {
        measured,
        failed,
        passRate
      },
      characteristics: characteristicsRes.rows.map((row) => ({
        dimensionId: Number(row.dimension_id),
        name: row.name,
        bubbleNumber: row.bubble_number || null,
        featureType: row.feature_type || null,
        gdtClass: row.gdt_class || null,
        toleranceZone: row.tolerance_zone || null,
        quantity: row.feature_quantity == null ? null : Number(row.feature_quantity),
        units: row.feature_units || null,
        modifiers: Array.isArray(row.feature_modifiers_json) ? row.feature_modifiers_json : [],
        sourceCharacteristicKey: row.source_characteristic_key || null
      }))
    };

    let exportResult;
    try {
      exportResult = renderAs9102Export({
        profileId,
        input,
        generatedAt: record.timestamp ? new Date(record.timestamp).toISOString() : undefined
      });
    } catch (error) {
      if (String(error?.message || "") === "unknown_profile") {
        return res.status(400).json({ error: "unknown_profile" });
      }
      throw error;
    }

    res.json({
      contractId: exportResult.contractId,
      exportContractId: exportResult.exportContractId,
      profile: exportResult.profile,
      record: {
        id: record.id,
        jobId: record.job_id,
        partId: record.part_id,
        partRevision: record.part_revision_code || "A",
        operationId: record.operation_id,
        operationNumber: record.op_number || null,
        operationLabel: record.op_label || null,
        lot: record.lot,
        qty: record.job_qty ?? record.qty ?? null,
        status: record.status,
        createdAt: record.timestamp
      },
      input,
      output: exportResult.output,
      availableProfiles: listAs9102Profiles()
    });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireCapability("submit_records"), async (req, res, next) => {
  try {
    const {
      jobId,
      partId,
      operationId,
      lot,
      serialNumber,
      qty,
      operatorUserId,
      status,
      oot = false,
      comment,
      values = [],
      tools = [],
      missingPieces = [],
      pieceComments = [],
      attachments = []
    } = req.body || {};

    const trimmedJob = String(jobId || "").trim();
    const trimmedPart = String(partId || "").trim();
    const trimmedLot = String(lot || "").trim();
    const trimmedSerial = normalizeOptionalText(serialNumber);
    const qtyNum = Number(qty);
    const { actorUserId, suppliedUserId, effectiveUserId } = resolveActorUserId(req, operatorUserId);
    if (!trimmedJob || !trimmedPart || !operationId || !trimmedLot || Number.isNaN(qtyNum) || qtyNum <= 0 || Number.isNaN(effectiveUserId) || !status) {
      return res.status(400).json({ error: "required_fields_missing" });
    }
    if (Number.isInteger(actorUserId) && Number.isInteger(suppliedUserId) && suppliedUserId !== actorUserId) {
      return res.status(403).json({ error: "auth_user_mismatch" });
    }
    if (!["complete", "incomplete"].includes(status)) {
      return res.status(400).json({ error: "invalid_status" });
    }
    if (oot && !String(comment || "").trim()) {
      return res.status(400).json({ error: "comment_required_for_oot" });
    }
    if (!Array.isArray(values) || !Array.isArray(tools) || !Array.isArray(missingPieces) || !Array.isArray(pieceComments) || !Array.isArray(attachments)) {
      return res.status(400).json({ error: "payload_arrays_required" });
    }

    const valuesErr = validateRecordValues(values, qtyNum);
    if (valuesErr) return res.status(400).json({ error: valuesErr });
    const toolsErr = validateRecordTools(tools);
    if (toolsErr) return res.status(400).json({ error: toolsErr });

    const missingErr = validateMissingPieces(missingPieces);
    if (missingErr) return res.status(400).json({ error: missingErr });

    const pieceCommentsErr = validatePieceComments(pieceComments, qtyNum);
    if (pieceCommentsErr) return res.status(400).json({ error: pieceCommentsErr });
    const normalizedAttachments = [];
    for (const item of attachments) {
      const normalized = normalizeAttachmentPayload(item, qtyNum);
      if (normalized.error) return res.status(400).json({ error: normalized.error });
      normalizedAttachments.push(normalized);
    }

    const refErr = await validateRecordRefs(operationId, values, tools);
    if (refErr) return res.status(400).json({ error: refErr });

    const role = requestRole(req);
    const result = await transaction(async (client) => {
      const jobRes = await client.query(
        `SELECT ${JOB_SUBMISSION_COLUMNS}
         FROM jobs
         WHERE id=$1 FOR UPDATE`,
        [trimmedJob]
      );
      const job = jobRes.rows[0];
      if (!job) return { error: "job_not_found" };
      const userRes = await client.query("SELECT id FROM users WHERE id=$1", [effectiveUserId]);
      if (!userRes.rows[0]) return { error: "operator_not_found" };
      if (job.lock_owner_user_id && job.lock_owner_user_id !== Number(effectiveUserId)) {
        return { error: "job_locked" };
      }
      if (!["open", "draft"].includes(job.status)) {
        return { error: "job_not_open" };
      }
      if (job.operation_id !== Number(operationId) || job.part_id !== partId) {
        return { error: "job_mismatch" };
      }

      const recRes = await client.query(
        `INSERT INTO records (job_id, part_id, operation_id, lot, serial_number, qty, operator_user_id, status, oot, comment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [trimmedJob, trimmedPart, operationId, trimmedLot, trimmedSerial, qtyNum, effectiveUserId, status, !!oot, comment || null]
      );
      const record = recRes.rows[0];

      const snapshotRes = await client.query(
        `SELECT id, name, bubble_number, feature_type, gdt_class, tolerance_zone,
                feature_quantity, feature_units, feature_modifiers_json, source_characteristic_key,
                nominal, tol_plus, tol_minus, unit, sampling, sampling_interval, input_mode
         FROM dimensions
         WHERE operation_id=$1
         ORDER BY id ASC`,
        [operationId]
      );
      for (const d of snapshotRes.rows) {
        await client.query(
          `INSERT INTO record_dimension_snapshots
             (record_id, dimension_id, name, bubble_number, feature_type, gdt_class, tolerance_zone,
              feature_quantity, feature_units, feature_modifiers_json, source_characteristic_key,
              nominal, tol_plus, tol_minus, unit, sampling, sampling_interval, input_mode)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [
            record.id,
            Number(d.id),
            d.name,
            d.bubble_number || null,
            d.feature_type || null,
            d.gdt_class || null,
            d.tolerance_zone || null,
            d.feature_quantity == null ? null : Number(d.feature_quantity),
            d.feature_units || null,
            JSON.stringify(Array.isArray(d.feature_modifiers_json) ? d.feature_modifiers_json : []),
            d.source_characteristic_key || null,
            d.nominal,
            d.tol_plus,
            d.tol_minus,
            d.unit,
            d.sampling,
            d.sampling_interval ?? null,
            d.input_mode || "single"
          ]
        );
      }

      for (const v of values) {
        await client.query(
          `INSERT INTO record_values (record_id, dimension_id, piece_number, value, is_oot)
           VALUES ($1,$2,$3,$4,$5)`,
          [record.id, Number(v.dimensionId), Number(v.pieceNumber), String(v.value), !!v.isOot]
        );
      }

      for (const t of tools) {
        await client.query(
          `INSERT INTO record_tools (record_id, dimension_id, tool_id, it_num)
           VALUES ($1,$2,$3,$4)`,
          [record.id, Number(t.dimensionId), Number(t.toolId), String(t.itNum)]
        );
      }

      for (const m of missingPieces) {
        await client.query(
          `INSERT INTO missing_pieces (record_id, piece_number, reason, nc_num, details)
           VALUES ($1,$2,$3,$4,$5)`,
          [record.id, Number(m.pieceNumber), m.reason, m.ncNum || null, m.details || null]
        );
      }

      for (const piece of pieceComments) {
        const pieceNum = Number(piece.pieceNumber);
        const text = String(piece.comment || "").trim();
        const serial = normalizeOptionalText(piece.serialNumber);
        const pieceInsert = await client.query(
          `INSERT INTO record_piece_comments
             (record_id, piece_number, comment, serial_number, created_by_user_id, created_by_role)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING id, record_id, piece_number, comment, serial_number`,
          [record.id, pieceNum, text, serial, effectiveUserId, role]
        );
        const pieceRow = pieceInsert.rows[0];
        await client.query(
          `INSERT INTO record_piece_comment_audit
             (piece_comment_id, record_id, piece_number, user_id, user_role, before_comment, before_serial_number, after_comment, after_serial_number, reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [pieceRow.id, record.id, pieceNum, effectiveUserId, role, null, null, pieceRow.comment, pieceRow.serial_number, "initial_submission"]
        );
      }

      for (const attachment of normalizedAttachments) {
        await client.query(
          `INSERT INTO record_attachments
             (record_id, piece_number, file_name, media_type, byte_size, data_base64, retention_until, uploaded_by_user_id, uploaded_by_role)
           VALUES ($1,$2,$3,$4,$5,$6,NOW() + ($7 * INTERVAL '1 day'),$8,$9)`,
          [
            record.id,
            attachment.pieceNumber,
            attachment.fileName,
            attachment.mediaType,
            attachment.byteSize,
            attachment.dataBase64,
            attachment.retentionDays,
            effectiveUserId,
            role
          ]
        );
      }

      await client.query(
        "UPDATE jobs SET status=$1, lock_owner_user_id=NULL, lock_timestamp=NULL WHERE id=$2",
        [status === "complete" ? "closed" : "incomplete", trimmedJob]
      );

      return record;
    });

    if (result?.error === "job_not_found") return res.status(404).json({ error: "job_not_found" });
    if (result?.error === "operator_not_found") return res.status(400).json({ error: "operator_not_found" });
    if (result?.error === "job_locked") return res.status(409).json({ error: "job_locked" });
    if (result?.error === "job_not_open") return res.status(409).json({ error: "job_not_open" });
    if (result?.error === "job_mismatch") return res.status(409).json({ error: "job_mismatch" });

    try {
      await refreshAnalyticsForRecordMutation({
        triggerSource: "records.submit",
        role,
        userId: actorUserId,
        recordId: result?.id
      });
    } catch (analyticsErr) {
      // Keep core record submission resilient when analytics refresh has a transient failure.
      console.warn("[analytics] incremental refresh failed after record submit", analyticsErr?.message || analyticsErr);
    }
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.put("/:id/piece-comment", requireAnyCapability(["submit_records", "edit_records"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId, pieceNumber, comment, serialNumber, reason } = req.body || {};
    const pieceNum = parsePositiveInteger(pieceNumber);
    const commentText = String(comment || "").trim();
    const serial = normalizeOptionalText(serialNumber);
    const reasonText = String(reason || "").trim();
    const { actorUserId, suppliedUserId, effectiveUserId } = resolveActorUserId(req, userId);
    if (!pieceNum || !commentText || !reasonText || !Number.isInteger(effectiveUserId)) {
      return res.status(400).json({ error: "required_fields_missing" });
    }
    if (Number.isInteger(actorUserId) && Number.isInteger(suppliedUserId) && suppliedUserId !== actorUserId) {
      return res.status(403).json({ error: "auth_user_mismatch" });
    }

    const role = requestRole(req);
    const result = await transaction(async (client) => {
      const userRes = await client.query("SELECT id FROM users WHERE id=$1", [effectiveUserId]);
      if (!userRes.rows[0]) return { error: "user_not_found" };

      const record = await getActiveRecordById(id, client);
      if (!record) return { error: "record_not_found" };
      if (pieceNum > Number(record.qty || 0)) return { error: "piece_number_out_of_range" };

      const existingRes = await client.query(
        "SELECT id, comment, serial_number FROM record_piece_comments WHERE record_id=$1 AND piece_number=$2 FOR UPDATE",
        [id, pieceNum]
      );
      const existing = existingRes.rows[0] || null;

      let pieceRow;
      if (existing) {
        const updateRes = await client.query(
          `UPDATE record_piece_comments
           SET comment=$1, serial_number=$2, updated_at=NOW()
           WHERE id=$3
           RETURNING id, record_id, piece_number, comment, serial_number, created_by_user_id, created_by_role, created_at, updated_at`,
          [commentText, serial, existing.id]
        );
        pieceRow = updateRes.rows[0];
      } else {
        const insertRes = await client.query(
          `INSERT INTO record_piece_comments
             (record_id, piece_number, comment, serial_number, created_by_user_id, created_by_role)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING id, record_id, piece_number, comment, serial_number, created_by_user_id, created_by_role, created_at, updated_at`,
          [id, pieceNum, commentText, serial, effectiveUserId, role]
        );
        pieceRow = insertRes.rows[0];
      }

      await client.query(
        `INSERT INTO record_piece_comment_audit
           (piece_comment_id, record_id, piece_number, user_id, user_role, before_comment, before_serial_number, after_comment, after_serial_number, reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [pieceRow.id, id, pieceNum, effectiveUserId, role, existing?.comment || null, existing?.serial_number || null, pieceRow.comment, pieceRow.serial_number, reasonText]
      );

      return pieceRow;
    });

    if (result?.error === "user_not_found") return res.status(400).json({ error: "user_not_found" });
    if (result?.error === "record_not_found") return res.status(404).json({ error: "not_found" });
    if (result?.error === "piece_number_out_of_range") return res.status(400).json({ error: "piece_number_out_of_range" });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.put("/:id/value", requireCapability("edit_records"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId, dimensionId, pieceNumber, value, reason } = req.body;
    const { actorUserId, suppliedUserId, effectiveUserId } = resolveActorUserId(req, userId);
    const dimIdNum = Number(dimensionId);
    const pieceNum = Number(pieceNumber);
    if (!Number.isInteger(effectiveUserId) || !Number.isInteger(dimIdNum) || !Number.isInteger(pieceNum) || value === undefined || !String(reason || "").trim()) {
      return res.status(400).json({ error: "required_fields_missing" });
    }
    if (Number.isInteger(actorUserId) && Number.isInteger(suppliedUserId) && suppliedUserId !== actorUserId) {
      return res.status(403).json({ error: "auth_user_mismatch" });
    }

    const result = await transaction(async (client) => {
      const userRes = await client.query("SELECT id FROM users WHERE id=$1", [effectiveUserId]);
      if (!userRes.rows[0]) return { error: "user_not_found" };
      const prevRes = await client.query(
        `SELECT value FROM record_values WHERE record_id=$1 AND dimension_id=$2 AND piece_number=$3`,
        [id, dimIdNum, pieceNum]
      );
      const prev = prevRes.rows[0];
      if (!prev) return { error: "not_found" };

      const dimCtxRes = await client.query(
        `SELECT COALESCE(rds.nominal, d.nominal) AS nominal,
                COALESCE(rds.tol_plus, d.tol_plus) AS tol_plus,
                COALESCE(rds.tol_minus, d.tol_minus) AS tol_minus,
                COALESCE(rds.input_mode, d.input_mode) AS input_mode,
                COALESCE(BOOL_OR(t.type='Go/No-Go'), false) AS has_gng
         FROM dimensions d
         JOIN records r ON r.id=$1 AND r.deleted_at IS NULL AND r.operation_id=d.operation_id
         LEFT JOIN record_dimension_snapshots rds ON rds.record_id=r.id AND rds.dimension_id=d.id
         LEFT JOIN record_tools rt ON rt.record_id=r.id AND rt.dimension_id=d.id
         LEFT JOIN tools t ON t.id=rt.tool_id
         WHERE d.id=$2
         GROUP BY COALESCE(rds.nominal, d.nominal),
                  COALESCE(rds.tol_plus, d.tol_plus),
                  COALESCE(rds.tol_minus, d.tol_minus),
                  COALESCE(rds.input_mode, d.input_mode)`,
        [id, dimIdNum]
      );
      const dimCtx = dimCtxRes.rows[0];
      if (!dimCtx) return { error: "dimension_not_in_record" };

      let normalizedValue = String(value).trim();
      let nextIsOot = false;
      if (dimCtx.has_gng) {
        normalizedValue = normalizedValue.toUpperCase();
        if (!["PASS", "FAIL"].includes(normalizedValue)) {
          return { error: "invalid_value_for_mode" };
        }
        nextIsOot = normalizedValue === "FAIL";
      } else if (dimCtx.input_mode === "range") {
        const [minRaw, maxRaw] = splitRange(normalizedValue);
        if (!isFiniteNonNegativeNumber(minRaw) || !isFiniteNonNegativeNumber(maxRaw)) {
          return { error: "invalid_value_for_mode" };
        }
        const minNum = Number(minRaw);
        const maxNum = Number(maxRaw);
        normalizedValue = `${minRaw}|${maxRaw}`;
        const lower = Number(dimCtx.nominal) - Number(dimCtx.tol_minus);
        const upper = Number(dimCtx.nominal) + Number(dimCtx.tol_plus);
        nextIsOot = minNum < lower || minNum > upper || maxNum < lower || maxNum > upper;
      } else {
        if (!isFiniteNonNegativeNumber(normalizedValue)) {
          return { error: "invalid_value_for_mode" };
        }
        const n = Number(normalizedValue);
        const lower = Number(dimCtx.nominal) - Number(dimCtx.tol_minus);
        const upper = Number(dimCtx.nominal) + Number(dimCtx.tol_plus);
        nextIsOot = n < lower || n > upper;
      }

      await client.query(
        `UPDATE record_values SET value=$1, is_oot=$2 WHERE record_id=$3 AND dimension_id=$4 AND piece_number=$5`,
        [normalizedValue, nextIsOot, id, dimIdNum, pieceNum]
      );

      await client.query(
        `INSERT INTO audit_log (record_id, user_id, field, before_value, after_value, reason)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, effectiveUserId, `dim:${dimIdNum}|piece:${pieceNum}`, prev.value, normalizedValue, String(reason).trim()]
      );

      const ootRes = await client.query(
        "SELECT EXISTS (SELECT 1 FROM record_values WHERE record_id=$1 AND is_oot=true) AS has_oot",
        [id]
      );
      await client.query("UPDATE records SET oot=$1 WHERE id=$2 AND deleted_at IS NULL", [ootRes.rows[0].has_oot, id]);

      return { ok: true };
    });

    if (result?.error === "user_not_found") return res.status(400).json({ error: "user_not_found" });
    if (result?.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (result?.error === "dimension_not_in_record") return res.status(404).json({ error: "not_found" });
    if (result?.error === "invalid_value_for_mode") return res.status(400).json({ error: "invalid_value_for_mode" });

    try {
      await refreshAnalyticsForRecordMutation({
        triggerSource: "records.value_edit",
        role: requestRole(req),
        userId: actorUserId,
        recordId: id
      });
    } catch (analyticsErr) {
      // Keep core correction workflow resilient when analytics refresh has a transient failure.
      console.warn("[analytics] incremental refresh failed after record value update", analyticsErr?.message || analyticsErr);
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
