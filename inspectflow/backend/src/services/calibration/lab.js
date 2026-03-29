import { query, transaction } from "../../db.js";
import { normalizeIsoTimestamp } from "../dateValidation.js";

export const CALIBRATION_ROLES = new Set(["Quality", "Supervisor", "Admin"]);
const CALIBRATION_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS calibration_schedules (
     id SERIAL PRIMARY KEY,
     tool_id INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
     interval_days INTEGER NOT NULL CHECK (interval_days > 0),
     last_calibrated_at TIMESTAMPTZ,
     next_due_at TIMESTAMPTZ NOT NULL,
     active BOOLEAN NOT NULL DEFAULT true,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (tool_id)
   )`,
  `CREATE TABLE IF NOT EXISTS calibration_events (
     id SERIAL PRIMARY KEY,
     tool_id INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
     schedule_id INTEGER REFERENCES calibration_schedules(id) ON DELETE SET NULL,
     performed_at TIMESTAMPTZ NOT NULL,
     result TEXT NOT NULL CHECK (result IN ('pass', 'fail')),
     certificate_name TEXT,
     certificate_data_base64 TEXT,
     notes TEXT,
     created_by_user_id INTEGER REFERENCES users(id),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS calibration_recall_impacts (
     id SERIAL PRIMARY KEY,
     calibration_event_id INTEGER NOT NULL REFERENCES calibration_events(id) ON DELETE CASCADE,
     record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
     tool_id INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
     flagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'resolved')),
     notes TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_calibration_schedules_due
     ON calibration_schedules (next_due_at ASC)
     WHERE active = true`,
  `CREATE INDEX IF NOT EXISTS idx_calibration_events_tool
     ON calibration_events (tool_id, performed_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_calibration_recall_impacts_event
     ON calibration_recall_impacts (calibration_event_id, flagged_at DESC)`
];

let calibrationSchemaReadyPromise = null;

async function ensureCalibrationSchema() {
  if (!calibrationSchemaReadyPromise) {
    calibrationSchemaReadyPromise = (async () => {
      for (const statement of CALIBRATION_SCHEMA_STATEMENTS) {
        await query(statement);
      }
    })();
  }
  return calibrationSchemaReadyPromise;
}

export function parsePositiveInt(value, fallback = null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeText(value) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export { normalizeIsoTimestamp };

export function normalizeToolId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function addDaysIso(isoTimestamp, intervalDays) {
  const parsed = new Date(isoTimestamp);
  parsed.setUTCDate(parsed.getUTCDate() + Number(intervalDays || 0));
  return parsed.toISOString();
}

function scheduleSelect(alias = "s") {
  return `
    ${alias}.id,
    ${alias}.tool_id,
    t.name AS tool_name,
    t.it_num AS tool_it_num,
    ${alias}.interval_days,
    ${alias}.last_calibrated_at,
    ${alias}.next_due_at,
    ${alias}.active,
    (${alias}.active = true AND ${alias}.next_due_at < NOW()) AS is_overdue,
    ${alias}.created_at,
    ${alias}.updated_at
  `;
}

function eventSelect(alias = "e") {
  return `
    ${alias}.id,
    ${alias}.tool_id,
    t.name AS tool_name,
    t.it_num AS tool_it_num,
    ${alias}.schedule_id,
    ${alias}.performed_at,
    ${alias}.result,
    ${alias}.certificate_name,
    ${alias}.certificate_data_base64,
    ${alias}.notes,
    ${alias}.created_by_user_id,
    ${alias}.created_at,
    s.interval_days AS schedule_interval_days,
    s.last_calibrated_at AS schedule_last_calibrated_at,
    s.next_due_at AS schedule_next_due_at,
    s.active AS schedule_active
  `;
}

function impactSelect(alias = "ri") {
  return `
    ${alias}.id,
    ${alias}.calibration_event_id,
    ${alias}.record_id,
    ${alias}.tool_id,
    t.name AS tool_name,
    t.it_num AS tool_it_num,
    ${alias}.flagged_at,
    ${alias}.status,
    ${alias}.notes,
    e.performed_at,
    e.result,
    e.certificate_name,
    e.certificate_data_base64,
    e.schedule_id,
    r.job_id AS record_job_id,
    r.part_id AS record_part_id,
    r.operation_id AS record_operation_id,
    r.lot AS record_lot,
    r.status AS record_status,
    r.timestamp AS record_timestamp
  `;
}

export async function listCalibrationSchedules({ toolId = null, active = null } = {}) {
  await ensureCalibrationSchema();
  const conditions = [];
  const params = [];

  if (toolId) {
    params.push(toolId);
    conditions.push(`s.tool_id = $${params.length}`);
  }
  if (active === true) {
    conditions.push("s.active = true");
  } else if (active === false) {
    conditions.push("s.active = false");
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await query(
    `SELECT ${scheduleSelect()}
     FROM calibration_schedules s
     JOIN tools t ON t.id = s.tool_id
     ${whereClause}
     ORDER BY s.next_due_at ASC, s.id ASC`,
    params
  );
  return rows;
}

export async function upsertCalibrationSchedule({
  toolId,
  intervalDays,
  lastCalibratedAt,
  nextDueAt,
  active = true
}) {
  await ensureCalibrationSchema();
  const normalizedToolId = normalizeToolId(toolId);
  if (!normalizedToolId) {
    const err = new Error("invalid_tool_id");
    err.code = "invalid_tool_id";
    throw err;
  }

  const { rows: toolRows } = await query(
    "SELECT id FROM tools WHERE id = $1 LIMIT 1",
    [normalizedToolId]
  );
  if (toolRows.length === 0) {
    const err = new Error("tool_not_found");
    err.code = "tool_not_found";
    throw err;
  }

  const interval = parsePositiveInt(intervalDays, null);
  if (!interval) {
    const err = new Error("invalid_interval_days");
    err.code = "invalid_interval_days";
    throw err;
  }

  const normalizedLastCalibratedAt = normalizeIsoTimestamp(lastCalibratedAt, "last_calibrated_at");
  const normalizedNextDueAt = normalizeIsoTimestamp(nextDueAt, "next_due_at");
  const nextDue = normalizedNextDueAt
    || addDaysIso(normalizedLastCalibratedAt || new Date().toISOString(), interval);

  const { rows } = await query(
    `INSERT INTO calibration_schedules
       (tool_id, interval_days, last_calibrated_at, next_due_at, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (tool_id)
     DO UPDATE SET
       interval_days = EXCLUDED.interval_days,
       last_calibrated_at = EXCLUDED.last_calibrated_at,
       next_due_at = EXCLUDED.next_due_at,
       active = EXCLUDED.active,
       updated_at = NOW()
     RETURNING id, tool_id, interval_days, last_calibrated_at, next_due_at, active, created_at, updated_at`,
    [normalizedToolId, interval, normalizedLastCalibratedAt, nextDue, active !== false]
  );
  return rows[0];
}

export async function loadCalibrationEventById(eventId) {
  await ensureCalibrationSchema();
  const { rows } = await query(
    `SELECT ${eventSelect()}
     FROM calibration_events e
     LEFT JOIN calibration_schedules s ON s.id = e.schedule_id
     JOIN tools t ON t.id = e.tool_id
     WHERE e.id = $1`,
    [eventId]
  );
  return rows[0] || null;
}

export async function createCalibrationEvent({
  toolId,
  scheduleId = null,
  performedAt,
  result,
  certificateName = null,
  certificateDataBase64 = null,
  notes = null,
  createdByUserId = null
}) {
  await ensureCalibrationSchema();
  const normalizedToolId = normalizeToolId(toolId);
  if (!normalizedToolId) {
    const err = new Error("invalid_tool_id");
    err.code = "invalid_tool_id";
    throw err;
  }

  const normalizedResult = String(result || "").trim().toLowerCase();
  if (!["pass", "fail"].includes(normalizedResult)) {
    const err = new Error("invalid_result");
    err.code = "invalid_result";
    throw err;
  }

  const { rows: toolRows } = await query(
    "SELECT id FROM tools WHERE id = $1 LIMIT 1",
    [normalizedToolId]
  );
  if (toolRows.length === 0) {
    const err = new Error("tool_not_found");
    err.code = "tool_not_found";
    throw err;
  }

  const normalizedPerformedAt = normalizeIsoTimestamp(performedAt || new Date().toISOString(), "performed_at");
  const normalizedScheduleId = parsePositiveInt(scheduleId, null);
  const normalizedCertificateName = normalizeText(certificateName);
  const normalizedCertificateData = normalizeText(certificateDataBase64);
  const normalizedNotes = normalizeText(notes);

  const eventId = await transaction(async (client) => {
    let scheduleRow = null;
    if (normalizedScheduleId) {
      const { rows } = await client.query(
        `SELECT id, tool_id, interval_days, last_calibrated_at, next_due_at, active
         FROM calibration_schedules
         WHERE id = $1
         FOR UPDATE`,
        [normalizedScheduleId]
      );
      scheduleRow = rows[0] || null;
      if (!scheduleRow) {
        const err = new Error("schedule_not_found");
        err.code = "schedule_not_found";
        throw err;
      }
      if (Number(scheduleRow.tool_id) !== normalizedToolId) {
        const err = new Error("schedule_tool_mismatch");
        err.code = "schedule_tool_mismatch";
        throw err;
      }
    } else {
      const { rows } = await client.query(
        `SELECT id, tool_id, interval_days, last_calibrated_at, next_due_at, active
         FROM calibration_schedules
         WHERE tool_id = $1
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`,
        [normalizedToolId]
      );
      scheduleRow = rows[0] || null;
    }

    const { rows: eventRows } = await client.query(
      `INSERT INTO calibration_events
         (tool_id, schedule_id, performed_at, result, certificate_name, certificate_data_base64, notes, created_by_user_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id`,
      [
        normalizedToolId,
        scheduleRow ? scheduleRow.id : normalizedScheduleId,
        normalizedPerformedAt,
        normalizedResult,
        normalizedCertificateName,
        normalizedCertificateData,
        normalizedNotes,
        createdByUserId
      ]
    );

    if (scheduleRow) {
      const nextDue = addDaysIso(normalizedPerformedAt, Number(scheduleRow.interval_days));
      await client.query(
        `UPDATE calibration_schedules
         SET last_calibrated_at = $2,
             next_due_at = $3,
             updated_at = NOW()
         WHERE id = $1`,
        [scheduleRow.id, normalizedPerformedAt, nextDue]
      );
    }

    return eventRows[0].id;
  });

  return eventId;
}

export async function loadOverdueSummary({ limit = 25 } = {}) {
  await ensureCalibrationSchema();
  const safeLimit = parsePositiveInt(limit, 25);
  const { rows: summaryRows } = await query(
    `SELECT
       COUNT(*)::int AS total_schedule_count,
       COALESCE(SUM(CASE WHEN s.active = true THEN 1 ELSE 0 END), 0)::int AS active_schedule_count,
       COALESCE(SUM(CASE WHEN s.active = true AND s.next_due_at < NOW() THEN 1 ELSE 0 END), 0)::int AS overdue_schedule_count,
       COALESCE(SUM(CASE WHEN s.active = true AND s.next_due_at >= NOW() AND s.next_due_at < NOW() + INTERVAL '30 days' THEN 1 ELSE 0 END), 0)::int AS due_soon_schedule_count
     FROM calibration_schedules s`
  );

  const { rows: overdueRows } = await query(
    `SELECT ${scheduleSelect("s")}
     FROM calibration_schedules s
     JOIN tools t ON t.id = s.tool_id
     WHERE s.active = true AND s.next_due_at < NOW()
     ORDER BY s.next_due_at ASC, s.id ASC
     LIMIT $1`,
    [safeLimit]
  );

  return {
    summary: summaryRows[0] || {
      total_schedule_count: 0,
      active_schedule_count: 0,
      overdue_schedule_count: 0,
      due_soon_schedule_count: 0
    },
    overdueSchedules: overdueRows
  };
}

export async function listFailedRecallImpacts({ toolId = null, eventId = null, status = null, limit = 100 } = {}) {
  await ensureCalibrationSchema();
  const conditions = ["e.result = 'fail'"];
  const params = [];

  if (toolId) {
    params.push(toolId);
    conditions.push(`ri.tool_id = $${params.length}`);
  }
  if (eventId) {
    params.push(parsePositiveInt(eventId, null));
    conditions.push(`ri.calibration_event_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`ri.status = $${params.length}`);
  }

  params.push(parsePositiveInt(limit, 100));

  const { rows } = await query(
    `SELECT ${impactSelect()}
     FROM calibration_recall_impacts ri
     JOIN calibration_events e ON e.id = ri.calibration_event_id
     JOIN tools t ON t.id = ri.tool_id
     LEFT JOIN records r ON r.id = ri.record_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY ri.flagged_at DESC, ri.id DESC
     LIMIT $${params.length}`,
    params
  );
  return rows;
}
