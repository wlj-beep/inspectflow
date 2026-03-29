import { Router } from "express";
import { query, transaction } from "../db.js";
import { requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";
import { getActorRole, getActorUserId } from "../middleware/authSession.js";
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

function parseFeatureQuantity(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity <= 0) return null;
  return quantity;
}

function parseFeatureModifiers(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((v) => String(v || "").trim()).filter(Boolean)));
  }
  const text = String(value || "").trim();
  if (!text) return [];
  return Array.from(new Set(text.split(/[;,|]/).map((token) => token.trim()).filter(Boolean)));
}

function requestRole(req) {
  return getActorRole(req);
}

function requestUserId(req) {
  const actor = getActorUserId(req);
  const parsed = Number(actor);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function toDimensionAuditShape(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    operationId: Number(row.operation_id),
    name: row.name,
    bubbleNumber: row.bubble_number || null,
    featureType: row.feature_type || null,
    gdtClass: row.gdt_class || null,
    toleranceZone: row.tolerance_zone || null,
    featureQuantity: row.feature_quantity == null ? null : Number(row.feature_quantity),
    featureUnits: row.feature_units || null,
    featureModifiers: Array.isArray(row.feature_modifiers_json) ? row.feature_modifiers_json : [],
    sourceCharacteristicKey: row.source_characteristic_key || null,
    nominal: row.nominal,
    tolPlus: row.tol_plus,
    tolMinus: row.tol_minus,
    unit: row.unit,
    sampling: row.sampling,
    samplingInterval: row.sampling_interval == null ? null : Number(row.sampling_interval),
    inputMode: row.input_mode
  };
}

async function appendCharacteristicSchemaAudit(
  client,
  {
    dimensionId = null,
    operationId = null,
    partId = null,
    action,
    actorUserId = null,
    actorRole = null,
    source = "admin_ui",
    reason = null,
    beforeValue = null,
    afterValue = null
  } = {}
) {
  await client.query(
    `INSERT INTO characteristic_schema_audit_log
       (dimension_id, operation_id, part_id, action, actor_user_id, actor_role, source, reason, before_value, after_value)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      dimensionId,
      operationId,
      partId,
      action,
      actorUserId,
      actorRole,
      source,
      reason,
      beforeValue,
      afterValue
    ]
  );
}

router.get("/", requireAnyCapability(["view_operator", "view_admin", "view_records"]), async (req, res, next) => {
  try {
    const { operationId } = req.query;
    // Explicit projection: list all non-sensitive dimension columns
    const { rows } = await query(
      operationId
        ? "SELECT id, operation_id, name, bubble_number, feature_type, gdt_class, tolerance_zone, feature_quantity, feature_units, feature_modifiers_json, source_characteristic_key, nominal, tol_plus, tol_minus, unit, sampling, sampling_interval, input_mode FROM dimensions WHERE operation_id=$1 ORDER BY id ASC"
        : "SELECT id, operation_id, name, bubble_number, feature_type, gdt_class, tolerance_zone, feature_quantity, feature_units, feature_modifiers_json, source_characteristic_key, nominal, tol_plus, tol_minus, unit, sampling, sampling_interval, input_mode FROM dimensions ORDER BY id ASC",
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
      bubbleNumber = null,
      featureType = null,
      gdtClass = null,
      toleranceZone = null,
      featureQuantity = null,
      featureUnits = null,
      featureModifiers = [],
      sourceCharacteristicKey = null,
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
    const normalizedFeatureQuantity = parseFeatureQuantity(featureQuantity);
    if (featureQuantity !== undefined && featureQuantity !== null && String(featureQuantity).trim() !== "" && normalizedFeatureQuantity === null) {
      return res.status(400).json({ error: "invalid_feature_quantity" });
    }
    const normalizedFeatureModifiers = parseFeatureModifiers(featureModifiers);
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
    const actorUserId = requestUserId(req);
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
        `INSERT INTO dimensions (
           operation_id, name, bubble_number, feature_type, gdt_class, tolerance_zone,
           feature_quantity, feature_units, feature_modifiers_json, source_characteristic_key,
           nominal, tol_plus, tol_minus, unit, sampling, sampling_interval, input_mode
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING *`,
        [
          operationId,
          trimmedName,
          String(bubbleNumber || "").trim() || null,
          String(featureType || "").trim() || null,
          String(gdtClass || "").trim() || null,
          String(toleranceZone || "").trim() || null,
          normalizedFeatureQuantity,
          String(featureUnits || "").trim() || null,
          JSON.stringify(normalizedFeatureModifiers),
          String(sourceCharacteristicKey || "").trim() || null,
          nominalNum,
          tolPlusNum,
          tolMinusNum,
          unit,
          sampling,
          normalizedSamplingInterval,
          inputMode
        ]
      );
      const dim = dimRes.rows[0];
      for (const toolId of normalizedToolIds) {
        await client.query(
          "INSERT INTO dimension_tools (dimension_id, tool_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
          [dim.id, toolId]
        );
      }

      await appendCharacteristicSchemaAudit(client, {
        dimensionId: Number(dim.id),
        operationId: Number(dim.operation_id),
        partId: operation.part_id,
        action: "create",
        actorUserId,
        actorRole: role,
        beforeValue: null,
        afterValue: toDimensionAuditShape(dim)
      });

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
    const {
      name,
      bubbleNumber,
      featureType,
      gdtClass,
      toleranceZone,
      featureQuantity,
      featureUnits,
      featureModifiers,
      sourceCharacteristicKey,
      nominal,
      tolPlus,
      tolMinus,
      unit,
      sampling,
      samplingInterval,
      inputMode,
      toolIds
    } = req.body;

    const role = requestRole(req);
    const actorUserId = requestUserId(req);
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
      const existingAuditShape = toDimensionAuditShape(existing);

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
      const nextFeatureQuantity =
        featureQuantity === undefined
          ? (existing.feature_quantity == null ? null : Number(existing.feature_quantity))
          : parseFeatureQuantity(featureQuantity);
      if (featureQuantity !== undefined && featureQuantity !== null && String(featureQuantity).trim() !== "" && nextFeatureQuantity === null) {
        return { error: "invalid_feature_quantity" };
      }
      const nextFeatureModifiers =
        featureModifiers === undefined
          ? (Array.isArray(existing.feature_modifiers_json) ? existing.feature_modifiers_json : [])
          : parseFeatureModifiers(featureModifiers);
      if (!["single", "range"].includes(nextInputMode)) {
        return { error: "invalid_input_mode" };
      }

      await ensurePartSetupBaselineRevision(client, { partId: existing.part_id, changedByRole: role });

      const rowsRes = await client.query(
        `UPDATE dimensions
         SET name=$1,
             bubble_number=$2,
             feature_type=$3,
             gdt_class=$4,
             tolerance_zone=$5,
             feature_quantity=$6,
             feature_units=$7,
             feature_modifiers_json=$8::jsonb,
             source_characteristic_key=$9,
             nominal=$10,
             tol_plus=$11,
             tol_minus=$12,
             unit=$13,
             sampling=$14,
             sampling_interval=$15,
             input_mode=$16
         WHERE id=$17 RETURNING *`,
        [
          trimmedName,
          bubbleNumber === undefined ? existing.bubble_number : (String(bubbleNumber || "").trim() || null),
          featureType === undefined ? existing.feature_type : (String(featureType || "").trim() || null),
          gdtClass === undefined ? existing.gdt_class : (String(gdtClass || "").trim() || null),
          toleranceZone === undefined ? existing.tolerance_zone : (String(toleranceZone || "").trim() || null),
          nextFeatureQuantity,
          featureUnits === undefined ? existing.feature_units : (String(featureUnits || "").trim() || null),
          JSON.stringify(nextFeatureModifiers),
          sourceCharacteristicKey === undefined ? existing.source_characteristic_key : (String(sourceCharacteristicKey || "").trim() || null),
          nominalNum,
          tolPlusNum,
          tolMinusNum,
          nextUnit,
          nextSampling,
          nextSamplingInterval,
          nextInputMode,
          id
        ]
      );
      const updatedRow = rowsRes.rows[0];
      await appendCharacteristicSchemaAudit(client, {
        dimensionId: Number(updatedRow.id),
        operationId: Number(updatedRow.operation_id),
        partId: existing.part_id,
        action: "update",
        actorUserId,
        actorRole: role,
        beforeValue: existingAuditShape,
        afterValue: toDimensionAuditShape(updatedRow)
      });

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
        ...updatedRow,
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
    const actorUserId = requestUserId(req);

    const removed = await transaction(async (client) => {
      const existingRes = await client.query(
        `SELECT d.*, o.part_id
         FROM dimensions d
         JOIN operations o ON o.id=d.operation_id
         WHERE d.id=$1`,
        [id]
      );
      const existing = existingRes.rows[0];
      if (!existing) return { error: "not_found" };

      await ensurePartSetupBaselineRevision(client, { partId: existing.part_id, changedByRole: role });
      await client.query("DELETE FROM dimension_tools WHERE dimension_id=$1", [id]);
      await appendCharacteristicSchemaAudit(client, {
        dimensionId: Number(existing.id),
        operationId: Number(existing.operation_id),
        partId: existing.part_id,
        action: "delete",
        actorUserId,
        actorRole: role,
        beforeValue: toDimensionAuditShape(existing),
        afterValue: null
      });
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

router.get("/:id/characteristic-audit", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const dimensionId = Number(req.params.id);
    if (!Number.isInteger(dimensionId) || dimensionId <= 0) {
      return res.status(400).json({ error: "invalid_dimension_id" });
    }
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const { rows } = await query(
      `SELECT csa.id, csa.dimension_id, csa.operation_id, csa.part_id, csa.action, csa.actor_user_id, csa.actor_role,
              csa.source, csa.reason, csa.before_value, csa.after_value, csa.created_at,
              u.name AS actor_user_name
       FROM characteristic_schema_audit_log csa
       LEFT JOIN users u ON u.id=csa.actor_user_id
       WHERE csa.dimension_id=$1
          OR (
            csa.dimension_id IS NULL
            AND COALESCE(csa.before_value->>'id', csa.after_value->>'id') = $1::text
          )
       ORDER BY csa.created_at DESC, csa.id DESC
       LIMIT $2`,
      [dimensionId, limit]
    );
    res.json({
      contractId: "PLAT-DEPLOY-v1",
      dimensionId,
      entries: rows
    });
  } catch (err) {
    next(err);
  }
});

export default router;
