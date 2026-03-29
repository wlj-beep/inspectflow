/**
 * Collector configuration, ingest, run history, and OOT queue routes.
 * BL-120 (INT-IOT-v1)
 * Mounted at /api/collector
 */

import { Router } from "express";
import { query, transaction } from "../db.js";
import { requireCapability, requireAnyCapability } from "../middleware/requireCapability.js";
import { getActorRole, getActorUserId } from "../middleware/authSession.js";
import { ingestTelemetryFrame } from "../services/collector/collectorIngestPipeline.js";
import { acknowledge as ootAcknowledge, escalate as ootEscalate } from "../services/collector/collectorOotQueue.js";
import { SUPPORTED_PROTOCOLS } from "../services/collector/adapters/adapterRegistry.js";

const router = Router();

// Columns returned for collector configs (never returns connection_options.secret)
const CONFIG_COLUMNS = [
  "id", "name", "source_protocol", "import_type",
  "connection_options", "poll_interval_seconds", "enabled",
  "last_heartbeat_at", "last_status", "last_message",
  "created_at", "updated_at"
].join(", ");

const TAG_MAPPING_COLUMNS = [
  "id", "collector_id", "device_id", "tag_address",
  "dimension_id", "job_id", "piece_number", "unit_override",
  "enabled", "created_at"
].join(", ");

const RUN_COLUMNS = [
  "id", "collector_id", "source_protocol", "trigger_mode", "status",
  "total_readings", "inserted_count", "oot_count", "failed_count",
  "summary", "errors", "created_at"
].join(", ");

const OOT_QUEUE_COLUMNS = [
  "id", "run_id", "collector_id", "record_id", "job_id",
  "dimension_id", "piece_number", "measured_value",
  "nominal", "tol_plus", "tol_minus", "unit",
  "device_id", "tag_address", "reading_timestamp", "status",
  "acknowledged_by_user_id", "acknowledged_by_role", "acknowledged_at",
  "escalated_to_issue_id", "escalation_note", "created_at"
].join(", ");

function parsePositiveInteger(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Redact sensitive keys from connection_options before returning to client */
function redactConnectionOptions(opts) {
  if (!opts || typeof opts !== "object") return opts;
  const SENSITIVE = new Set(["secret", "password", "token", "api_key", "apikey"]);
  const out = {};
  for (const [k, v] of Object.entries(opts)) {
    out[k] = SENSITIVE.has(k.toLowerCase()) ? "[REDACTED]" : v;
  }
  return out;
}

function sanitizeConfig(row) {
  if (!row) return row;
  return { ...row, connection_options: redactConnectionOptions(row.connection_options) };
}

// ─── Collector configuration CRUD (Admin only) ────────────────────────────────

router.get("/configs", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ${CONFIG_COLUMNS} FROM collector_configurations ORDER BY id ASC`
    );
    res.json(rows.map(sanitizeConfig));
  } catch (err) { next(err); }
});

router.post("/configs", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const { name, sourceProtocol, connectionOptions, pollIntervalSeconds, enabled } = req.body || {};
    if (!name || !sourceProtocol) {
      return res.status(400).json({ error: "name_and_source_protocol_required" });
    }
    if (!SUPPORTED_PROTOCOLS.includes(sourceProtocol)) {
      return res.status(400).json({ error: "unsupported_protocol", supported: SUPPORTED_PROTOCOLS });
    }
    const pollSecs = pollIntervalSeconds != null ? parsePositiveInteger(pollIntervalSeconds) : null;
    if (pollIntervalSeconds != null && !pollSecs) {
      return res.status(400).json({ error: "invalid_poll_interval_seconds" });
    }
    const { rows } = await query(
      `INSERT INTO collector_configurations
         (name, source_protocol, connection_options, poll_interval_seconds, enabled)
       VALUES ($1,$2,$3::jsonb,$4,$5)
       RETURNING ${CONFIG_COLUMNS}`,
      [
        String(name).trim(),
        sourceProtocol,
        JSON.stringify(connectionOptions || {}),
        pollSecs,
        enabled !== false
      ]
    );
    res.status(201).json(sanitizeConfig(rows[0]));
  } catch (err) { next(err); }
});

router.put("/configs/:id", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const id = parsePositiveInteger(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid_id" });

    const { name, sourceProtocol, connectionOptions, pollIntervalSeconds } = req.body || {};
    const updates = [];
    const params = [];

    if (name != null) { params.push(String(name).trim()); updates.push(`name=$${params.length}`); }
    if (sourceProtocol != null) {
      if (!SUPPORTED_PROTOCOLS.includes(sourceProtocol)) {
        return res.status(400).json({ error: "unsupported_protocol" });
      }
      params.push(sourceProtocol); updates.push(`source_protocol=$${params.length}`);
    }
    if (connectionOptions != null) {
      params.push(JSON.stringify(connectionOptions)); updates.push(`connection_options=$${params.length}::jsonb`);
    }
    if (pollIntervalSeconds !== undefined) {
      if (pollIntervalSeconds === null) {
        updates.push("poll_interval_seconds=NULL");
      } else {
        const v = parsePositiveInteger(pollIntervalSeconds);
        if (!v) return res.status(400).json({ error: "invalid_poll_interval_seconds" });
        params.push(v); updates.push(`poll_interval_seconds=$${params.length}`);
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: "no_fields_to_update" });
    updates.push("updated_at=NOW()");
    params.push(id);

    const { rows } = await query(
      `UPDATE collector_configurations SET ${updates.join(",")} WHERE id=$${params.length} RETURNING ${CONFIG_COLUMNS}`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(sanitizeConfig(rows[0]));
  } catch (err) { next(err); }
});

router.patch("/configs/:id/enabled", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const id = parsePositiveInteger(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid_id" });
    const { enabled } = req.body || {};
    if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled_boolean_required" });
    const { rows } = await query(
      "UPDATE collector_configurations SET enabled=$1, updated_at=NOW() WHERE id=$2 RETURNING id, enabled",
      [enabled, id]
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ─── Tag mapping CRUD (Admin only) ────────────────────────────────────────────

router.get("/configs/:id/tag-mappings", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const id = parsePositiveInteger(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid_id" });
    const { rows } = await query(
      `SELECT ${TAG_MAPPING_COLUMNS} FROM collector_tag_mappings WHERE collector_id=$1 ORDER BY id ASC`,
      [id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/configs/:id/tag-mappings", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const collectorId = parsePositiveInteger(req.params.id);
    if (!collectorId) return res.status(400).json({ error: "invalid_id" });

    const { deviceId, tagAddress, dimensionId, jobId, pieceNumber, unitOverride } = req.body || {};
    if (!deviceId || !tagAddress || !dimensionId || !jobId || !pieceNumber) {
      return res.status(400).json({ error: "required_fields_missing" });
    }
    const dimId = parsePositiveInteger(dimensionId);
    const piece = parsePositiveInteger(pieceNumber);
    if (!dimId || !piece) return res.status(400).json({ error: "invalid_dimension_or_piece" });

    // Validate dimension and job exist
    const [dimCheck, jobCheck] = await Promise.all([
      query("SELECT id FROM dimensions WHERE id=$1", [dimId]),
      query("SELECT id FROM jobs WHERE id=$1", [String(jobId).trim()])
    ]);
    if (!dimCheck.rows[0]) return res.status(400).json({ error: "dimension_not_found" });
    if (!jobCheck.rows[0]) return res.status(400).json({ error: "job_not_found" });

    const { rows } = await query(
      `INSERT INTO collector_tag_mappings
         (collector_id, device_id, tag_address, dimension_id, job_id, piece_number, unit_override)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING ${TAG_MAPPING_COLUMNS}`,
      [collectorId, String(deviceId).trim(), String(tagAddress).trim(), dimId, String(jobId).trim(), piece, unitOverride || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put("/tag-mappings/:mappingId", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const mappingId = parsePositiveInteger(req.params.mappingId);
    if (!mappingId) return res.status(400).json({ error: "invalid_id" });

    const { deviceId, tagAddress, dimensionId, jobId, pieceNumber, unitOverride, enabled } = req.body || {};
    const updates = [];
    const params = [];

    if (deviceId != null) { params.push(String(deviceId).trim()); updates.push(`device_id=$${params.length}`); }
    if (tagAddress != null) { params.push(String(tagAddress).trim()); updates.push(`tag_address=$${params.length}`); }
    if (dimensionId != null) {
      const v = parsePositiveInteger(dimensionId);
      if (!v) return res.status(400).json({ error: "invalid_dimension_id" });
      params.push(v); updates.push(`dimension_id=$${params.length}`);
    }
    if (jobId != null) { params.push(String(jobId).trim()); updates.push(`job_id=$${params.length}`); }
    if (pieceNumber != null) {
      const v = parsePositiveInteger(pieceNumber);
      if (!v) return res.status(400).json({ error: "invalid_piece_number" });
      params.push(v); updates.push(`piece_number=$${params.length}`);
    }
    if (unitOverride !== undefined) { params.push(unitOverride || null); updates.push(`unit_override=$${params.length}`); }
    if (enabled !== undefined) { params.push(Boolean(enabled)); updates.push(`enabled=$${params.length}`); }

    if (updates.length === 0) return res.status(400).json({ error: "no_fields_to_update" });
    params.push(mappingId);

    const { rows } = await query(
      `UPDATE collector_tag_mappings SET ${updates.join(",")} WHERE id=$${params.length} RETURNING ${TAG_MAPPING_COLUMNS}`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete("/tag-mappings/:mappingId", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const mappingId = parsePositiveInteger(req.params.mappingId);
    if (!mappingId) return res.status(400).json({ error: "invalid_id" });
    const { rowCount } = await query("DELETE FROM collector_tag_mappings WHERE id=$1", [mappingId]);
    if (!rowCount) return res.status(404).json({ error: "not_found" });
    res.status(204).send();
  } catch (err) { next(err); }
});

// ─── Telemetry ingest (Admin only, for manual/simulate) ───────────────────────

router.post("/configs/:id/ingest", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const collectorId = parsePositiveInteger(req.params.id);
    if (!collectorId) return res.status(400).json({ error: "invalid_id" });

    const { rawInput, triggerMode = "manual" } = req.body || {};
    if (!rawInput) return res.status(400).json({ error: "raw_input_required" });

    const { rows: cfgRows } = await query(
      "SELECT id, source_protocol, enabled FROM collector_configurations WHERE id=$1",
      [collectorId]
    );
    if (!cfgRows[0]) return res.status(404).json({ error: "collector_not_found" });

    const result = await ingestTelemetryFrame({
      collectorId,
      sourceProtocol: cfgRows[0].source_protocol,
      rawInput,
      triggerMode
    });
    res.json(result);
  } catch (err) { next(err); }
});

// ─── Run history (Admin only) ─────────────────────────────────────────────────

router.get("/runs", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const limit = Math.min(parsePositiveInteger(req.query.limit) || 50, 200);
    const collectorId = req.query.collectorId ? parsePositiveInteger(req.query.collectorId) : null;
    const params = [];
    let where = "";
    if (collectorId) { params.push(collectorId); where = `WHERE collector_id=$${params.length}`; }
    params.push(limit);
    const { rows } = await query(
      `SELECT ${RUN_COLUMNS} FROM collector_runs ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get("/runs/:id", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const id = parsePositiveInteger(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid_id" });
    const { rows } = await query(
      `SELECT ${RUN_COLUMNS} FROM collector_runs WHERE id=$1`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ─── OOT acknowledgment queue ─────────────────────────────────────────────────

router.get("/oot-queue", requireAnyCapability(["view_records", "view_admin"]), async (req, res, next) => {
  try {
    const { status, jobId } = req.query;
    const page = Math.max(1, parsePositiveInteger(req.query.page) || 1);
    const pageSize = Math.min(100, parsePositiveInteger(req.query.pageSize) || 25);
    const offset = (page - 1) * pageSize;

    const filters = [];
    const params = [];
    if (status) { params.push(status); filters.push(`status=$${params.length}`); }
    if (jobId) { params.push(String(jobId).trim()); filters.push(`job_id=$${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    params.push(pageSize);
    params.push(offset);
    const { rows } = await query(
      `SELECT ${OOT_QUEUE_COLUMNS} FROM collector_oot_queue
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    // total count (cheap, no OFFSET)
    const countParams = filters.length ? params.slice(0, filters.length) : [];
    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS total FROM collector_oot_queue ${where}`,
      countParams
    );

    res.json({ items: rows, total: Number(countRows[0].total), page, pageSize });
  } catch (err) { next(err); }
});

router.post("/oot-queue/:id/acknowledge", requireAnyCapability(["submit_records", "view_records", "view_admin"]), async (req, res, next) => {
  try {
    const ootQueueId = parsePositiveInteger(req.params.id);
    if (!ootQueueId) return res.status(400).json({ error: "invalid_id" });
    const userId = getActorUserId(req);
    const role = getActorRole(req);
    if (!userId) return res.status(401).json({ error: "unauthenticated" });

    const { note } = req.body || {};
    let result;
    await transaction(async (client) => {
      result = await ootAcknowledge(client, { ootQueueId, userId, role, note });
    });

    if (result.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (result.error === "already_actioned") return res.status(409).json({ error: "already_actioned" });
    res.json(result.row);
  } catch (err) { next(err); }
});

router.post("/oot-queue/:id/escalate", requireAnyCapability(["edit_records", "view_admin"]), async (req, res, next) => {
  try {
    const ootQueueId = parsePositiveInteger(req.params.id);
    if (!ootQueueId) return res.status(400).json({ error: "invalid_id" });
    const userId = getActorUserId(req);
    const role = getActorRole(req);
    if (!userId) return res.status(401).json({ error: "unauthenticated" });

    const { issueId, note } = req.body || {};
    let result;
    await transaction(async (client) => {
      result = await ootEscalate(client, {
        ootQueueId, userId, role,
        issueId: issueId ? parsePositiveInteger(issueId) : null,
        note
      });
    });

    if (result.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (result.error === "already_actioned") return res.status(409).json({ error: "already_actioned" });
    res.json(result.row);
  } catch (err) { next(err); }
});

router.get("/oot-queue/:id/audit", requireAnyCapability(["view_records", "view_admin"]), async (req, res, next) => {
  try {
    const ootQueueId = parsePositiveInteger(req.params.id);
    if (!ootQueueId) return res.status(400).json({ error: "invalid_id" });
    const { rows } = await query(
      `SELECT id, oot_queue_id, user_id, user_role, action, before_status, after_status, note, created_at
       FROM collector_oot_audit
       WHERE oot_queue_id=$1
       ORDER BY created_at ASC`,
      [ootQueueId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
