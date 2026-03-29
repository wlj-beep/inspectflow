import { Router } from "express";
import { query } from "../db.js";
import { requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";
import { normalizeCalendarDate } from "../services/dateValidation.js";

const router = Router();

const TOOL_COLUMNS = [
  "id",
  "name",
  "type",
  "it_num",
  "calibration_due_date",
  "current_location_id",
  "home_location_id",
  "size",
  "active",
  "visible"
];
const TOOL_SELECT_COLUMNS = [
  ...TOOL_COLUMNS.map((column) => `t.${column}`),
  "cl.name AS current_location_name",
  "cl.location_type AS current_location_type",
  "hl.name AS home_location_name",
  "hl.location_type AS home_location_type"
].join(", ");

function normalizeLocationId(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

async function locationExists(locationId) {
  if (!locationId) return true;
  const res = await query("SELECT id FROM tool_locations WHERE id=$1", [locationId]);
  return !!res.rows[0];
}

async function loadToolById(id) {
  const res = await query(
    `SELECT ${TOOL_SELECT_COLUMNS}
     FROM tools t
     LEFT JOIN tool_locations cl ON cl.id=t.current_location_id
     LEFT JOIN tool_locations hl ON hl.id=t.home_location_id
     WHERE t.id=$1`,
    [id]
  );
  return res.rows[0] || null;
}

router.get("/", requireAnyCapability(["view_operator", "view_admin", "view_records"]), async (req, res) => {
  const { rows } = await query(
    `SELECT ${TOOL_SELECT_COLUMNS}
     FROM tools t
     LEFT JOIN tool_locations cl ON cl.id=t.current_location_id
     LEFT JOIN tool_locations hl ON hl.id=t.home_location_id
     ORDER BY t.name ASC`,
    []
  );
  res.json(rows);
});

router.post("/", requireCapability("manage_tools"), async (req, res, next) => {
  try {
    const {
      name,
      type,
      itNum,
      size,
      calibrationDueDate,
      currentLocationId,
      homeLocationId,
      active = true,
      visible = true
    } = req.body;
    const trimmedName = String(name || "").trim();
    const trimmedIt = String(itNum || "").trim();
    let normalizedDate = null;
    try {
      normalizedDate = normalizeCalendarDate(calibrationDueDate, "calibration_due_date");
    } catch (error) {
      return res.status(400).json({ error: "invalid_calibration_due_date" });
    }
    const normalizedCurrentLocationId = normalizeLocationId(currentLocationId);
    const normalizedHomeLocationId = normalizeLocationId(homeLocationId);

    if (!trimmedName || !type || !trimmedIt) {
      return res.status(400).json({ error: "name_type_it_required" });
    }
    if (!["Variable", "Go/No-Go", "Attribute"].includes(type)) {
      return res.status(400).json({ error: "invalid_tool_type" });
    }
    if (calibrationDueDate !== undefined && calibrationDueDate !== null && calibrationDueDate !== "" && !normalizedDate) {
      return res.status(400).json({ error: "invalid_calibration_due_date" });
    }
    if (currentLocationId !== undefined && currentLocationId !== null && currentLocationId !== "" && !normalizedCurrentLocationId) {
      return res.status(400).json({ error: "invalid_current_location_id" });
    }
    if (homeLocationId !== undefined && homeLocationId !== null && homeLocationId !== "" && !normalizedHomeLocationId) {
      return res.status(400).json({ error: "invalid_home_location_id" });
    }
    if (!(await locationExists(normalizedCurrentLocationId))) {
      return res.status(400).json({ error: "invalid_current_location_id" });
    }
    if (!(await locationExists(normalizedHomeLocationId))) {
      return res.status(400).json({ error: "invalid_home_location_id" });
    }

    const { rows } = await query(
      `INSERT INTO tools (name, type, it_num, size, calibration_due_date, current_location_id, home_location_id, active, visible)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        trimmedName,
        type,
        trimmedIt,
        size || null,
        normalizedDate,
        normalizedCurrentLocationId,
        normalizedHomeLocationId,
        active !== false,
        visible !== false
      ]
    );
    const created = await loadToolById(rows[0].id);
    res.status(201).json(created);
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "already_exists" });
    }
    next(err);
  }
});

router.put("/:id", requireCapability("manage_tools"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      type,
      itNum,
      size,
      calibrationDueDate,
      currentLocationId,
      homeLocationId,
      active,
      visible
    } = req.body || {};
    const existingRes = await query(
      `SELECT ${TOOL_COLUMNS.join(", ")}
       FROM tools
       WHERE id=$1`,
      [id]
    );
    const existing = existingRes.rows[0];
    if (!existing) return res.status(404).json({ error: "not_found" });

    const nextState = {
      name: name === undefined ? existing.name : String(name || "").trim(),
      type: type ?? existing.type,
      itNum: itNum === undefined ? existing.it_num : String(itNum || "").trim(),
      size: size === undefined ? existing.size : size,
      calibrationDueDate:
        calibrationDueDate === undefined
          ? existing.calibration_due_date
          : (() => {
              try {
                return normalizeCalendarDate(calibrationDueDate, "calibration_due_date");
              } catch {
                return null;
              }
            })(),
      currentLocationId:
        currentLocationId === undefined
          ? existing.current_location_id
          : normalizeLocationId(currentLocationId),
      homeLocationId:
        homeLocationId === undefined
          ? existing.home_location_id
          : normalizeLocationId(homeLocationId),
      active: active ?? existing.active,
      visible: visible ?? existing.visible
    };
    if (!nextState.name || !nextState.type || !nextState.itNum) {
      return res.status(400).json({ error: "name_type_it_required" });
    }
    if (!["Variable", "Go/No-Go", "Attribute"].includes(nextState.type)) {
      return res.status(400).json({ error: "invalid_tool_type" });
    }
    if (calibrationDueDate !== undefined && calibrationDueDate !== null && calibrationDueDate !== "" && !nextState.calibrationDueDate) {
      return res.status(400).json({ error: "invalid_calibration_due_date" });
    }
    if (currentLocationId !== undefined && currentLocationId !== null && currentLocationId !== "" && !nextState.currentLocationId) {
      return res.status(400).json({ error: "invalid_current_location_id" });
    }
    if (homeLocationId !== undefined && homeLocationId !== null && homeLocationId !== "" && !nextState.homeLocationId) {
      return res.status(400).json({ error: "invalid_home_location_id" });
    }
    if (!(await locationExists(nextState.currentLocationId))) {
      return res.status(400).json({ error: "invalid_current_location_id" });
    }
    if (!(await locationExists(nextState.homeLocationId))) {
      return res.status(400).json({ error: "invalid_home_location_id" });
    }

    const turningOff = (existing.active && nextState.active === false) || (existing.visible && nextState.visible === false);
    if (turningOff) {
      const { rows } = await query(
        `SELECT COUNT(*)::int AS count
         FROM jobs j
         JOIN operations o ON o.id=j.operation_id
         JOIN dimensions d ON d.operation_id=o.id
         JOIN dimension_tools dt ON dt.dimension_id=d.id
         WHERE dt.tool_id=$1 AND j.status IN ('open','draft')`,
        [id]
      );
      const count = rows[0]?.count || 0;
      if (count > 0) {
        return res.status(409).json({ error: "tool_in_open_job", openJobCount: count });
      }
    }

    await query(
      `UPDATE tools
       SET name=$1,
           type=$2,
           it_num=$3,
           size=$4,
           calibration_due_date=$5,
           current_location_id=$6,
           home_location_id=$7,
           active=$8,
           visible=$9
       WHERE id=$10`,
      [
        nextState.name,
        nextState.type,
        nextState.itNum,
        nextState.size,
        nextState.calibrationDueDate,
        nextState.currentLocationId,
        nextState.homeLocationId,
        nextState.active,
        nextState.visible,
        id
      ]
    );
    const updated = await loadToolById(id);
    res.json(updated);
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "already_exists" });
    }
    next(err);
  }
});

async function deactivateToolById(id) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count
     FROM jobs j
     JOIN operations o ON o.id=j.operation_id
     JOIN dimensions d ON d.operation_id=o.id
     JOIN dimension_tools dt ON dt.dimension_id=d.id
     WHERE dt.tool_id=$1 AND j.status IN ('open','draft')`,
    [id]
  );
  const count = rows[0]?.count || 0;
  if (count > 0) {
    return { error: "tool_in_open_job", openJobCount: count };
  }
  const { rows: updated } = await query(
    "UPDATE tools SET active=false, visible=false WHERE id=$1 RETURNING id",
    [id]
  );
  if (!updated[0]) return { error: "not_found" };
  return { ok: true, deactivated: true };
}

router.post("/:id/deactivate", requireCapability("manage_tools"), async (req, res) => {
  const result = await deactivateToolById(req.params.id);
  if (result?.error === "tool_in_open_job") {
    return res.status(409).json({ error: result.error, openJobCount: result.openJobCount });
  }
  if (result?.error === "not_found") return res.status(404).json({ error: "not_found" });
  res.json(result);
});

router.delete("/:id", requireCapability("manage_tools"), async (req, res) => {
  const result = await deactivateToolById(req.params.id);
  if (result?.error === "tool_in_open_job") {
    return res.status(409).json({ error: result.error, openJobCount: result.openJobCount });
  }
  if (result?.error === "not_found") return res.status(404).json({ error: "not_found" });
  res.json(result);
});

export default router;
