import { Router } from "express";
import { query } from "../db.js";
import { requireAuthenticated, getActorRole, getActorUserId } from "../middleware/authSession.js";
import {
  CALIBRATION_ROLES,
  createCalibrationEvent,
  listCalibrationSchedules,
  listFailedRecallImpacts,
  loadCalibrationEventById,
  loadOverdueSummary,
  normalizeText,
  normalizeToolId,
  parsePositiveInt,
  upsertCalibrationSchedule
} from "../services/calibration/lab.js";

const router = Router();

function requireCalibrationRole(req, res) {
  const role = getActorRole(req);
  if (!role) {
    res.status(401).json({ error: "unauthenticated" });
    return false;
  }
  if (!CALIBRATION_ROLES.has(role)) {
    res.status(403).json({ error: "forbidden" });
    return false;
  }
  return true;
}

function sendServiceError(res, err) {
  const statusByCode = {
    invalid_tool_id: 400,
    invalid_interval_days: 400,
    invalid_result: 400,
    invalid_performed_at: 400,
    invalid_last_calibrated_at: 400,
    invalid_next_due_at: 400,
    tool_not_found: 404,
    schedule_not_found: 404,
    schedule_tool_mismatch: 422
  };
  const status = statusByCode[err?.code] || 500;
  if (status === 500) return false;
  res.status(status).json({ error: err.code });
  return true;
}

router.get("/schedules", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireCalibrationRole(req, res)) return;
    const toolId = normalizeToolId(req.query.toolId);
    if (req.query.toolId && !toolId) return res.status(400).json({ error: "invalid_tool_id" });

    const rawActive = String(req.query.active || "").trim().toLowerCase();
    const active = rawActive === "" ? null : rawActive === "true" ? true : rawActive === "false" ? false : undefined;
    if (active === undefined) return res.status(400).json({ error: "invalid_active" });

    const rows = await listCalibrationSchedules({ toolId, active });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/schedules", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireCalibrationRole(req, res)) return;

    const toolId = req.body?.toolId;
    const intervalDays = req.body?.intervalDays;
    const lastCalibratedAt = req.body?.lastCalibratedAt;
    const nextDueAt = req.body?.nextDueAt;
    const rawActive = req.body?.active;
    const active = rawActive === undefined ? true : rawActive === true || rawActive === "true";
    if (rawActive !== undefined && rawActive !== true && rawActive !== false && rawActive !== "true" && rawActive !== "false") {
      return res.status(400).json({ error: "invalid_active" });
    }

    const schedule = await upsertCalibrationSchedule({
      toolId,
      intervalDays,
      lastCalibratedAt,
      nextDueAt,
      active
    });
    res.status(201).json(schedule);
  } catch (err) {
    if (sendServiceError(res, err)) return;
    next(err);
  }
});

router.get("/events", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireCalibrationRole(req, res)) return;
    const toolId = normalizeToolId(req.query.toolId);
    if (req.query.toolId && !toolId) return res.status(400).json({ error: "invalid_tool_id" });
    const result = normalizeText(req.query.result);
    if (req.query.result && !["pass", "fail"].includes(String(result || "").toLowerCase())) {
      return res.status(400).json({ error: "invalid_result" });
    }
    const limit = parsePositiveInt(req.query.limit, 100);
    const conditions = [];
    const params = [];
    if (toolId) {
      params.push(toolId);
      conditions.push(`e.tool_id = $${params.length}`);
    }
    if (result) {
      params.push(String(result).toLowerCase());
      conditions.push(`e.result = $${params.length}`);
    }
    params.push(limit);
    const { rows } = await query(
      `SELECT
         e.id,
         e.tool_id,
         t.name AS tool_name,
         t.it_num AS tool_it_num,
         e.schedule_id,
         e.performed_at,
         e.result,
         e.certificate_name,
         e.certificate_data_base64,
         e.notes,
         e.created_by_user_id,
         e.created_at,
         s.interval_days AS schedule_interval_days,
         s.last_calibrated_at AS schedule_last_calibrated_at,
         s.next_due_at AS schedule_next_due_at,
         s.active AS schedule_active
       FROM calibration_events e
       JOIN tools t ON t.id::text = e.tool_id
       LEFT JOIN calibration_schedules s ON s.id = e.schedule_id
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY e.performed_at DESC, e.id DESC
       LIMIT $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/events", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireCalibrationRole(req, res)) return;

    const toolId = req.body?.toolId;
    const scheduleId = req.body?.scheduleId;
    const performedAt = req.body?.performedAt;
    const result = req.body?.result;
    const certificateName = req.body?.certificateName;
    const certificateDataBase64 = req.body?.certificateDataBase64;
    const notes = req.body?.notes;
    const normalizedScheduleId =
      scheduleId === undefined || scheduleId === null || String(scheduleId).trim() === ""
        ? null
        : parsePositiveInt(scheduleId, null);
    if (scheduleId !== undefined && scheduleId !== null && String(scheduleId).trim() !== "" && !normalizedScheduleId) {
      return res.status(400).json({ error: "invalid_schedule_id" });
    }

    const eventId = await createCalibrationEvent({
      toolId,
      scheduleId: normalizedScheduleId,
      performedAt,
      result,
      certificateName,
      certificateDataBase64,
      notes,
      createdByUserId: getActorUserId(req)
    });
    const event = await loadCalibrationEventById(eventId);
    res.status(201).json(event);
  } catch (err) {
    if (sendServiceError(res, err)) return;
    next(err);
  }
});

router.get("/overdue-summary", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireCalibrationRole(req, res)) return;
    const limit = parsePositiveInt(req.query.limit, 25);
    const payload = await loadOverdueSummary({ limit });
    res.json({
      ...payload.summary,
      overdueSchedules: payload.overdueSchedules
    });
  } catch (err) {
    next(err);
  }
});

router.get("/failed-tool-recall-impact", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireCalibrationRole(req, res)) return;
    const toolId = normalizeToolId(req.query.toolId);
    if (req.query.toolId && !toolId) return res.status(400).json({ error: "invalid_tool_id" });
    const eventId = parsePositiveInt(req.query.eventId, null);
    if (req.query.eventId && !eventId) return res.status(400).json({ error: "invalid_event_id" });
    const status = normalizeText(req.query.status);
    if (req.query.status && !["open", "reviewed", "resolved"].includes(status)) {
      return res.status(400).json({ error: "invalid_status" });
    }
    const limit = parsePositiveInt(req.query.limit, 100);
    const rows = await listFailedRecallImpacts({ toolId, eventId, status, limit });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
