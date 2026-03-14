import { Router } from "express";
import { query, transaction } from "../db.js";
import { requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";
import { getActorRole, getActorUserId } from "../middleware/authSession.js";

const router = Router();

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
    const filters = [];
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
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const { rows } = await query(
      `SELECT * FROM records ${where} ORDER BY timestamp DESC`,
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

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
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
    const recRes = await query("SELECT * FROM records WHERE id=$1", [id]);
    const record = recRes.rows[0];
    if (!record) return res.status(404).json({ error: "not_found" });

    const dimsSnapshotRes = await query(
      `SELECT dimension_id AS id, name, nominal, tol_plus, tol_minus, unit, sampling, sampling_interval, input_mode
       FROM record_dimension_snapshots
       WHERE record_id=$1
       ORDER BY dimension_id ASC`,
      [id]
    );
    const dimsRes = dimsSnapshotRes.rows.length
      ? dimsSnapshotRes
      : await query(
          "SELECT * FROM dimensions WHERE operation_id=$1 ORDER BY id ASC",
          [record.operation_id]
        );
    const valuesRes = await query(
      "SELECT * FROM record_values WHERE record_id=$1 ORDER BY piece_number ASC",
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
      "SELECT * FROM missing_pieces WHERE record_id=$1 ORDER BY piece_number ASC",
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
      "SELECT * FROM audit_log WHERE record_id=$1 ORDER BY timestamp DESC",
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
      auditLog: auditRes.rows
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/export", requireCapability("view_records"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const recRes = await query("SELECT * FROM records WHERE id=$1", [id]);
    const record = recRes.rows[0];
    if (!record) return res.status(404).json({ error: "not_found" });

    const { rows } = await query(
      `SELECT rv.record_id, rv.dimension_id, COALESCE(rds.name, d.name) AS dimension_name, rv.piece_number, rv.value, rv.is_oot,
              rpc.comment AS piece_comment, rpc.serial_number AS piece_serial_number
       FROM record_values rv
       LEFT JOIN record_dimension_snapshots rds
         ON rds.record_id = rv.record_id AND rds.dimension_id = rv.dimension_id
       LEFT JOIN dimensions d ON d.id = rv.dimension_id
       LEFT JOIN record_piece_comments rpc
         ON rpc.record_id = rv.record_id AND rpc.piece_number = rv.piece_number
       WHERE rv.record_id=$1
       ORDER BY rv.piece_number ASC, rv.dimension_id ASC`,
      [id]
    );

    const auditRes = await query(
      `SELECT a.field, a.before_value, a.after_value, a.reason, a.timestamp, a.user_id, u.name AS user_name
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.record_id=$1
       ORDER BY a.timestamp ASC`,
      [id]
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
       WHERE record_id=$1
       ORDER BY timestamp ASC, id ASC`,
      [id]
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
      pieceComments = []
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
    if (!Array.isArray(values) || !Array.isArray(tools) || !Array.isArray(missingPieces) || !Array.isArray(pieceComments)) {
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

    const refErr = await validateRecordRefs(operationId, values, tools);
    if (refErr) return res.status(400).json({ error: refErr });

    const role = requestRole(req);
    const result = await transaction(async (client) => {
      const jobRes = await client.query("SELECT * FROM jobs WHERE id=$1 FOR UPDATE", [trimmedJob]);
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
        `SELECT id, name, nominal, tol_plus, tol_minus, unit, sampling, sampling_interval, input_mode
         FROM dimensions
         WHERE operation_id=$1
         ORDER BY id ASC`,
        [operationId]
      );
      for (const d of snapshotRes.rows) {
        await client.query(
          `INSERT INTO record_dimension_snapshots
             (record_id, dimension_id, name, nominal, tol_plus, tol_minus, unit, sampling, sampling_interval, input_mode)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            record.id,
            Number(d.id),
            d.name,
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

      const recordRes = await client.query("SELECT id, qty FROM records WHERE id=$1", [id]);
      const record = recordRes.rows[0];
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
         JOIN records r ON r.id=$1 AND r.operation_id=d.operation_id
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
      await client.query("UPDATE records SET oot=$1 WHERE id=$2", [ootRes.rows[0].has_oot, id]);

      return { ok: true };
    });

    if (result?.error === "user_not_found") return res.status(400).json({ error: "user_not_found" });
    if (result?.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (result?.error === "dimension_not_in_record") return res.status(404).json({ error: "not_found" });
    if (result?.error === "invalid_value_for_mode") return res.status(400).json({ error: "invalid_value_for_mode" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
