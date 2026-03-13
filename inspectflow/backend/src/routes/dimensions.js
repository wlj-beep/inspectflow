import { Router } from "express";
import { query, transaction } from "../db.js";
import { requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";
import {
  createPartSetupRevision,
  ensurePartSetupBaselineRevision,
  getLatestPartRevision,
  nextRevisionCode
} from "../revisions.js";

const router = Router();
const VALID_SAMPLING = ["first_last", "first_middle_last", "every_5", "every_10", "100pct", "custom_interval"];

function normalizeSamplingInterval(sampling, samplingInterval) {
  if (sampling !== "custom_interval") return null;
  const intervalNum = Number(samplingInterval);
  if (!Number.isInteger(intervalNum) || intervalNum <= 0) return null;
  return intervalNum;
}

function requestRole(req) {
  return String(req.header("x-user-role") || "").trim() || null;
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
    const {
      operationId,
      name,
      nominal,
      tolPlus,
      tolMinus,
      unit,
      sampling,
      samplingInterval,
      inputMode = "single",
      toolIds = []
    } = req.body;
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

    const role = requestRole(req);
    const created = await transaction(async (client) => {
      const opRes = await client.query("SELECT id, part_id FROM operations WHERE id=$1", [operationId]);
      const operation = opRes.rows[0];
      if (!operation) return { error: "operation_not_found" };

      await ensurePartSetupBaselineRevision(client, { partId: operation.part_id, changedByRole: role });

      if (normalizedToolIds.length) {
        const toolCheck = await client.query("SELECT id FROM tools WHERE id = ANY($1)", [normalizedToolIds]);
        if (toolCheck.rows.length !== normalizedToolIds.length) {
          return { error: "invalid_tool_id" };
        }
      }

      const dimRes = await client.query(
        `INSERT INTO dimensions (operation_id, name, nominal, tol_plus, tol_minus, unit, sampling, sampling_interval, input_mode)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [operationId, trimmedName, nominalNum, tolPlusNum, tolMinusNum, unit, sampling, normalizedSamplingInterval, inputMode]
      );
      const dim = dimRes.rows[0];
      for (const toolId of normalizedToolIds) {
        await client.query(
          "INSERT INTO dimension_tools (dimension_id, tool_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
          [dim.id, toolId]
        );
      }

      const revisionResult = await createPartSetupRevision(client, {
        partId: operation.part_id,
        changeSummary: `Added dimension ${trimmedName}`,
        changedFields: ["dimensions"],
        changedByRole: role
      });
      const latestRevision = await getLatestPartRevision(client, operation.part_id);

      return {
        ...dim,
        currentRevision: latestRevision?.revision_code || null,
        nextRevision: latestRevision?.revision_code ? nextRevisionCode(latestRevision.revision_code) : "A",
        revisionCreated: !!revisionResult?.created
      };
    });

    if (created?.error === "operation_not_found") return res.status(400).json({ error: "operation_not_found" });
    if (created?.error === "invalid_tool_id") return res.status(400).json({ error: "invalid_tool_id" });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.put("/:id", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, nominal, tolPlus, tolMinus, unit, sampling, samplingInterval, inputMode, toolIds } = req.body;

    const role = requestRole(req);
    const updated = await transaction(async (client) => {
      const existingRes = await client.query(
        `SELECT d.*, o.part_id
         FROM dimensions d
         JOIN operations o ON o.id=d.operation_id
         WHERE d.id=$1`,
        [id]
      );
      const existing = existingRes.rows[0];
      if (!existing) return { error: "not_found" };

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
        return { error: "required_fields_missing" };
      }
      if (!["in", "mm", "Ra", "deg"].includes(nextUnit)) {
        return { error: "invalid_unit" };
      }
      if (!VALID_SAMPLING.includes(nextSampling)) {
        return { error: "invalid_sampling" };
      }
      if (nextSampling === "custom_interval" && nextSamplingInterval === null) {
        return { error: "invalid_sampling_interval" };
      }
      if (!["single", "range"].includes(nextInputMode)) {
        return { error: "invalid_input_mode" };
      }

      await ensurePartSetupBaselineRevision(client, { partId: existing.part_id, changedByRole: role });

      const rowsRes = await client.query(
        `UPDATE dimensions
         SET name=$1, nominal=$2, tol_plus=$3, tol_minus=$4, unit=$5, sampling=$6, sampling_interval=$7, input_mode=$8
         WHERE id=$9 RETURNING *`,
        [trimmedName, nominalNum, tolPlusNum, tolMinusNum, nextUnit, nextSampling, nextSamplingInterval, nextInputMode, id]
      );

      if (Array.isArray(toolIds)) {
        const normalizedToolIds = toolIds.map((toolId) => Number(toolId)).filter((toolId) => !Number.isNaN(toolId));
        if (normalizedToolIds.length !== toolIds.length) {
          return { error: "invalid_tool_id" };
        }
        if (normalizedToolIds.length) {
          const toolRows = await client.query("SELECT id FROM tools WHERE id = ANY($1)", [normalizedToolIds]);
          if (toolRows.rows.length !== normalizedToolIds.length) {
            return { error: "invalid_tool_id" };
          }
        }
        await client.query("DELETE FROM dimension_tools WHERE dimension_id=$1", [id]);
        for (const toolId of normalizedToolIds) {
          await client.query(
            "INSERT INTO dimension_tools (dimension_id, tool_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
            [id, toolId]
          );
        }
      }

      const revisionResult = await createPartSetupRevision(client, {
        partId: existing.part_id,
        changeSummary: `Updated dimension ${existing.name}`,
        changedFields: ["dimensions"],
        changedByRole: role
      });
      const latestRevision = await getLatestPartRevision(client, existing.part_id);
      return {
        ...rowsRes.rows[0],
        currentRevision: latestRevision?.revision_code || null,
        nextRevision: latestRevision?.revision_code ? nextRevisionCode(latestRevision.revision_code) : "A",
        revisionCreated: !!revisionResult?.created
      };
    });

    if (updated?.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (updated?.error) return res.status(400).json({ error: updated.error });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const role = requestRole(req);

    const removed = await transaction(async (client) => {
      const existingRes = await client.query(
        `SELECT d.id, d.name, o.part_id
         FROM dimensions d
         JOIN operations o ON o.id=d.operation_id
         WHERE d.id=$1`,
        [id]
      );
      const existing = existingRes.rows[0];
      if (!existing) return { error: "not_found" };

      await ensurePartSetupBaselineRevision(client, { partId: existing.part_id, changedByRole: role });
      await client.query("DELETE FROM dimension_tools WHERE dimension_id=$1", [id]);
      await client.query("DELETE FROM dimensions WHERE id=$1", [id]);

      const revisionResult = await createPartSetupRevision(client, {
        partId: existing.part_id,
        changeSummary: `Removed dimension ${existing.name}`,
        changedFields: ["dimensions"],
        changedByRole: role
      });
      const latestRevision = await getLatestPartRevision(client, existing.part_id);

      return {
        ok: true,
        currentRevision: latestRevision?.revision_code || null,
        nextRevision: latestRevision?.revision_code ? nextRevisionCode(latestRevision.revision_code) : "A",
        revisionCreated: !!revisionResult?.created
      };
    });

    if (removed?.error === "not_found") return res.status(404).json({ error: "not_found" });
    res.json(removed);
  } catch (err) {
    next(err);
  }
});

export default router;
