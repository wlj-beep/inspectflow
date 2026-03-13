import { Router } from "express";
import { query, transaction } from "../db.js";
import { requireCapability } from "../middleware/requireCapability.js";

const router = Router();

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
    const { partId, operationId, status, result } = req.query;
    const filters = [];
    const params = [];
    if (partId) { params.push(partId); filters.push(`part_id=$${params.length}`); }
    if (operationId) { params.push(operationId); filters.push(`operation_id=$${params.length}`); }
    if (status) { params.push(status); filters.push(`status=$${params.length}`); }
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

router.get("/:id", requireCapability("view_records"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const recRes = await query("SELECT * FROM records WHERE id=$1", [id]);
    const record = recRes.rows[0];
    if (!record) return res.status(404).json({ error: "not_found" });

    const dimsRes = await query(
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
       WHERE rt.record_id=$1`,
      [id]
    );
    const missingRes = await query(
      "SELECT * FROM missing_pieces WHERE record_id=$1 ORDER BY piece_number ASC",
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
      `SELECT rv.record_id, rv.dimension_id, d.name AS dimension_name, rv.piece_number, rv.value, rv.is_oot
       FROM record_values rv
       JOIN dimensions d ON d.id = rv.dimension_id
       WHERE rv.record_id=$1
       ORDER BY rv.piece_number ASC, rv.dimension_id ASC`,
      [id]
    );

    const header = "record_id,dimension_id,dimension_name,piece_number,value,is_oot";
    const lines = rows.map((r) =>
      [
        r.record_id,
        r.dimension_id,
        `"${String(r.dimension_name).replace(/\"/g, '""')}"`,
        r.piece_number,
        `"${String(r.value).replace(/\"/g, '""')}"`,
        r.is_oot
      ].join(",")
    );

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
      qty,
      operatorUserId,
      status,
      oot = false,
      comment,
      values = [],
      tools = [],
      missingPieces = []
    } = req.body;

    const trimmedJob = String(jobId || "").trim();
    const trimmedPart = String(partId || "").trim();
    const trimmedLot = String(lot || "").trim();
    const qtyNum = Number(qty);
    const operatorIdNum = Number(operatorUserId);
    if (!trimmedJob || !trimmedPart || !operationId || !trimmedLot || Number.isNaN(qtyNum) || qtyNum <= 0 || Number.isNaN(operatorIdNum) || !status) {
      return res.status(400).json({ error: "required_fields_missing" });
    }
    if (!["complete", "incomplete"].includes(status)) {
      return res.status(400).json({ error: "invalid_status" });
    }
    if (oot && !String(comment || "").trim()) {
      return res.status(400).json({ error: "comment_required_for_oot" });
    }
    if (!Array.isArray(values) || !Array.isArray(tools) || !Array.isArray(missingPieces)) {
      return res.status(400).json({ error: "payload_arrays_required" });
    }

    const valuesErr = validateRecordValues(values, qtyNum);
    if (valuesErr) return res.status(400).json({ error: valuesErr });
    const toolsErr = validateRecordTools(tools);
    if (toolsErr) return res.status(400).json({ error: toolsErr });

    const missingErr = validateMissingPieces(missingPieces);
    if (missingErr) return res.status(400).json({ error: missingErr });

    const refErr = await validateRecordRefs(operationId, values, tools);
    if (refErr) return res.status(400).json({ error: refErr });

    const result = await transaction(async (client) => {
      const jobRes = await client.query("SELECT * FROM jobs WHERE id=$1 FOR UPDATE", [trimmedJob]);
      const job = jobRes.rows[0];
      if (!job) return { error: "job_not_found" };
      const userRes = await client.query("SELECT id FROM users WHERE id=$1", [operatorIdNum]);
      if (!userRes.rows[0]) return { error: "operator_not_found" };
      if (job.lock_owner_user_id && job.lock_owner_user_id !== Number(operatorUserId)) {
        return { error: "job_locked" };
      }
      if (!["open", "draft"].includes(job.status)) {
        return { error: "job_not_open" };
      }
      if (job.operation_id !== Number(operationId) || job.part_id !== partId) {
        return { error: "job_mismatch" };
      }

      const recRes = await client.query(
        `INSERT INTO records (job_id, part_id, operation_id, lot, qty, operator_user_id, status, oot, comment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [trimmedJob, trimmedPart, operationId, trimmedLot, qtyNum, operatorIdNum, status, !!oot, comment || null]
      );
      const record = recRes.rows[0];

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

router.put("/:id/value", requireCapability("edit_records"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId, dimensionId, pieceNumber, value, isOot, reason } = req.body;
    const userIdNum = Number(userId);
    const dimIdNum = Number(dimensionId);
    const pieceNum = Number(pieceNumber);
    if (!Number.isInteger(userIdNum) || !Number.isInteger(dimIdNum) || !Number.isInteger(pieceNum) || value === undefined || !String(reason || "").trim()) {
      return res.status(400).json({ error: "required_fields_missing" });
    }

    const result = await transaction(async (client) => {
      const userRes = await client.query("SELECT id FROM users WHERE id=$1", [userIdNum]);
      if (!userRes.rows[0]) return { error: "user_not_found" };
      const prevRes = await client.query(
        `SELECT value FROM record_values WHERE record_id=$1 AND dimension_id=$2 AND piece_number=$3`,
        [id, dimIdNum, pieceNum]
      );
      const prev = prevRes.rows[0];
      if (!prev) return { error: "not_found" };

      await client.query(
        `UPDATE record_values SET value=$1, is_oot=$2 WHERE record_id=$3 AND dimension_id=$4 AND piece_number=$5`,
        [String(value), !!isOot, id, dimIdNum, pieceNum]
      );

      await client.query(
        `INSERT INTO audit_log (record_id, user_id, field, before_value, after_value, reason)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, userIdNum, `dim:${dimIdNum}|piece:${pieceNum}`, prev.value, String(value), String(reason).trim()]
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
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
