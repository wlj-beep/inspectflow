import { Router } from "express";
import { query } from "../db.js";
import { requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";

const router = Router();
const VALID_SAMPLING = ["first_last", "first_middle_last", "every_5", "every_10", "100pct", "custom_interval"];

function normalizeSamplingInterval(sampling, samplingInterval) {
  if (sampling !== "custom_interval") return null;
  const intervalNum = Number(samplingInterval);
  if (!Number.isInteger(intervalNum) || intervalNum <= 0) return null;
  return intervalNum;
}

router.get("/", requireAnyCapability(["view_operator", "view_admin", "view_records"]), async (req, res, next) => {
  try {
    const { operationId } = req.query;
    const { rows } = await query(
      operationId
        ? "SELECT * FROM dimensions WHERE operation_id=$1 ORDER BY id ASC"
        : "SELECT * FROM dimensions ORDER BY id ASC",
      operationId ? [operationId] : []
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { operationId, name, nominal, tolPlus, tolMinus, unit, sampling, samplingInterval, inputMode = "single", toolIds = [] } = req.body;
    const trimmedName = String(name || "").trim();
    const nominalNum = Number(nominal);
    const tolPlusNum = Number(tolPlus);
    const tolMinusNum = Number(tolMinus);
    if (!operationId || !trimmedName || Number.isNaN(nominalNum) || Number.isNaN(tolPlusNum) || Number.isNaN(tolMinusNum) || !unit || !sampling) {
      return res.status(400).json({ error: "required_fields_missing" });
    }
    if (!["in", "mm", "Ra", "deg"].includes(unit)) {
      return res.status(400).json({ error: "invalid_unit" });
    }
    if (!VALID_SAMPLING.includes(sampling)) {
      return res.status(400).json({ error: "invalid_sampling" });
    }
    const normalizedSamplingInterval = normalizeSamplingInterval(sampling, samplingInterval);
    if (sampling === "custom_interval" && normalizedSamplingInterval === null) {
      return res.status(400).json({ error: "invalid_sampling_interval" });
    }
    if (!["single", "range"].includes(inputMode)) {
      return res.status(400).json({ error: "invalid_input_mode" });
    }
    if (!Array.isArray(toolIds)) {
      return res.status(400).json({ error: "tool_ids_required" });
    }
    const normalizedToolIds = toolIds.map((id) => Number(id)).filter((id) => !Number.isNaN(id));
    if (normalizedToolIds.length !== toolIds.length) {
      return res.status(400).json({ error: "invalid_tool_id" });
    }
    if (normalizedToolIds.length) {
      const { rows } = await query(
        "SELECT id FROM tools WHERE id = ANY($1)",
        [normalizedToolIds]
      );
      if (rows.length !== normalizedToolIds.length) {
        return res.status(400).json({ error: "invalid_tool_id" });
      }
    }
    const { rows } = await query(
      `INSERT INTO dimensions (operation_id, name, nominal, tol_plus, tol_minus, unit, sampling, sampling_interval, input_mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [operationId, trimmedName, nominalNum, tolPlusNum, tolMinusNum, unit, sampling, normalizedSamplingInterval, inputMode]
    );
    const dim = rows[0];
    for (const toolId of normalizedToolIds) {
      await query(
        "INSERT INTO dimension_tools (dimension_id, tool_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [dim.id, toolId]
      );
    }
    res.status(201).json(dim);
  } catch (err) {
    next(err);
  }
});

router.put("/:id", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, nominal, tolPlus, tolMinus, unit, sampling, samplingInterval, inputMode, toolIds } = req.body;
    const existingRes = await query("SELECT * FROM dimensions WHERE id=$1", [id]);
    const existing = existingRes.rows[0];
    if (!existing) return res.status(404).json({ error: "not_found" });

    const trimmedName = name === undefined ? existing.name : String(name || "").trim();
    const nominalNum = nominal === undefined ? Number(existing.nominal) : Number(nominal);
    const tolPlusNum = tolPlus === undefined ? Number(existing.tol_plus) : Number(tolPlus);
    const tolMinusNum = tolMinus === undefined ? Number(existing.tol_minus) : Number(tolMinus);
    const nextUnit = unit ?? existing.unit;
    const nextSampling = sampling ?? existing.sampling;
    const nextInputMode = inputMode ?? existing.input_mode;
    const nextSamplingInterval =
      nextSampling === "custom_interval"
        ? (
            samplingInterval === undefined
              ? normalizeSamplingInterval(nextSampling, existing.sampling_interval)
              : normalizeSamplingInterval(nextSampling, samplingInterval)
          )
        : null;
    if (!trimmedName || Number.isNaN(nominalNum) || Number.isNaN(tolPlusNum) || Number.isNaN(tolMinusNum) || !nextUnit || !nextSampling) {
      return res.status(400).json({ error: "required_fields_missing" });
    }
    if (!["in", "mm", "Ra", "deg"].includes(nextUnit)) {
      return res.status(400).json({ error: "invalid_unit" });
    }
    if (!VALID_SAMPLING.includes(nextSampling)) {
      return res.status(400).json({ error: "invalid_sampling" });
    }
    if (nextSampling === "custom_interval" && nextSamplingInterval === null) {
      return res.status(400).json({ error: "invalid_sampling_interval" });
    }
    if (!["single", "range"].includes(nextInputMode)) {
      return res.status(400).json({ error: "invalid_input_mode" });
    }
    const { rows } = await query(
      `UPDATE dimensions
       SET name=$1, nominal=$2, tol_plus=$3, tol_minus=$4, unit=$5, sampling=$6, sampling_interval=$7, input_mode=$8
       WHERE id=$9 RETURNING *`,
      [trimmedName, nominalNum, tolPlusNum, tolMinusNum, nextUnit, nextSampling, nextSamplingInterval, nextInputMode, id]
    );
    if (Array.isArray(toolIds)) {
      const normalizedToolIds = toolIds.map((toolId) => Number(toolId)).filter((toolId) => !Number.isNaN(toolId));
      if (normalizedToolIds.length !== toolIds.length) {
        return res.status(400).json({ error: "invalid_tool_id" });
      }
      if (normalizedToolIds.length) {
        const { rows: toolRows } = await query(
          "SELECT id FROM tools WHERE id = ANY($1)",
          [normalizedToolIds]
        );
        if (toolRows.length !== normalizedToolIds.length) {
          return res.status(400).json({ error: "invalid_tool_id" });
        }
      }
      await query("DELETE FROM dimension_tools WHERE dimension_id=$1", [id]);
      for (const toolId of normalizedToolIds) {
        await query(
          "INSERT INTO dimension_tools (dimension_id, tool_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
          [id, toolId]
        );
      }
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { id } = req.params;
    await query("DELETE FROM dimension_tools WHERE dimension_id=$1", [id]);
    const { rows } = await query("DELETE FROM dimensions WHERE id=$1 RETURNING id", [id]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
