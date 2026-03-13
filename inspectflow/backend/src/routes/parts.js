import { Router } from "express";
import { query, transaction } from "../db.js";
import { requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";
import {
  createPartSetupRevision,
  ensurePartSetupBaselineRevision,
  getLatestPartRevision,
  getPartRevisionByCode,
  hydrateSnapshotOperations,
  listPartRevisions,
  loadCurrentPartSetup,
  nextRevisionCode
} from "../revisions.js";

const router = Router();

function normalizeRequestedRevision(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return normalized || null;
}

function mapRevisionMeta(row) {
  return {
    revision: row.revision_code,
    revisionIndex: Number(row.revision_index),
    partName: row.part_name,
    changeSummary: row.change_summary,
    changedFields: Array.isArray(row.changed_fields) ? row.changed_fields : [],
    changedByRole: row.created_by_role || null,
    createdAt: row.created_at
  };
}

function requestRole(req) {
  return String(req.header("x-user-role") || "").trim() || null;
}

router.get("/", requireAnyCapability(["view_operator", "view_admin", "view_records"]), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.id,
              p.description,
              pr.revision_code AS current_revision,
              pr.revision_index AS current_revision_index
       FROM parts p
       LEFT JOIN LATERAL (
         SELECT revision_code, revision_index
         FROM part_setup_revisions
         WHERE part_id=p.id
         ORDER BY revision_index DESC
         LIMIT 1
       ) pr ON TRUE
       ORDER BY p.id ASC`,
      []
    );
    res.json(
      rows.map((row) => ({
        id: row.id,
        description: row.description,
        currentRevision: row.current_revision || null,
        nextRevision: row.current_revision ? nextRevisionCode(row.current_revision) : "A"
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.post("/bulk-update", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { updates } = req.body || {};
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: "updates_required" });
    }
    if (updates.length > 2000) {
      return res.status(400).json({ error: "updates_too_large" });
    }

    const role = requestRole(req);
    const outcome = await transaction(async (client) => {
      let updated = 0;
      let skipped = 0;
      const notFound = [];

      for (const update of updates) {
        const partId = String(update?.id || "").trim();
        const partName = String(update?.description || "").trim();
        if (!partId || !partName) {
          return { error: "invalid_update_payload" };
        }

        const existingRes = await client.query("SELECT id, description FROM parts WHERE id=$1", [partId]);
        const existing = existingRes.rows[0];
        if (!existing) {
          notFound.push(partId);
          continue;
        }

        await ensurePartSetupBaselineRevision(client, { partId, changedByRole: role });
        if (String(existing.description || "") === partName) {
          skipped += 1;
          continue;
        }

        await client.query("UPDATE parts SET description=$1 WHERE id=$2", [partName, partId]);
        await createPartSetupRevision(client, {
          partId,
          changeSummary: "Bulk-updated part name",
          changedFields: ["part.description", "bulk_update"],
          changedByRole: role
        });
        updated += 1;
      }

      return { ok: true, total: updates.length, updated, skipped, notFound };
    });

    if (outcome?.error === "invalid_update_payload") {
      return res.status(400).json({ error: "invalid_update_payload" });
    }
    res.json(outcome);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", requireAnyCapability(["view_operator", "view_admin", "view_records"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const requestedRevision = normalizeRequestedRevision(req.query.revision);

    const result = await transaction(async (client) => {
      const partSetup = await loadCurrentPartSetup(client, id);
      if (!partSetup) return { error: "not_found" };

      await ensurePartSetupBaselineRevision(client, { partId: id, changedByRole: requestRole(req) });
      const latestRevision = await getLatestPartRevision(client, id);
      const revisions = await listPartRevisions(client, id);

      let selectedRevision = latestRevision;
      let readOnlyRevision = false;
      let operations = partSetup.operations;
      let description = partSetup.description;

      if (requestedRevision) {
        selectedRevision = await getPartRevisionByCode(client, id, requestedRevision);
        if (!selectedRevision) {
          return { error: "revision_not_found", latestRevision, revisions };
        }
        if (latestRevision && selectedRevision.revision_code !== latestRevision.revision_code) {
          readOnlyRevision = true;
          description = selectedRevision.part_name;
          operations = await hydrateSnapshotOperations(client, selectedRevision.snapshot);
        }
      }

      return {
        id,
        description,
        operations,
        currentRevision: latestRevision?.revision_code || null,
        selectedRevision: selectedRevision?.revision_code || latestRevision?.revision_code || null,
        nextRevision: latestRevision?.revision_code ? nextRevisionCode(latestRevision.revision_code) : "A",
        readOnlyRevision,
        revisions: revisions.map(mapRevisionMeta)
      };
    });

    if (result?.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (result?.error === "revision_not_found") {
      return res.status(404).json({ error: "revision_not_found", currentRevision: result.latestRevision?.revision_code || null });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { id, description, revision } = req.body;
    const trimmedId = String(id || "").trim();
    const trimmedDesc = String(description || "").trim();
    const normalizedRevision = normalizeRequestedRevision(revision);
    if (!trimmedId || !trimmedDesc) return res.status(400).json({ error: "id_description_required" });
    if (!normalizedRevision) return res.status(400).json({ error: "revision_required" });

    const role = requestRole(req);
    const created = await transaction(async (client) => {
      const insertRes = await client.query(
        "INSERT INTO parts (id, description) VALUES ($1,$2) RETURNING id, description",
        [trimmedId, trimmedDesc]
      );
      await createPartSetupRevision(client, {
        partId: trimmedId,
        changeSummary: "Initial part setup",
        changedFields: ["part.description"],
        changedByRole: role,
        createInitialIfMissing: true,
        initialRevisionCode: normalizedRevision
      });
      const latestRevision = await getLatestPartRevision(client, trimmedId);
      return {
        id: insertRes.rows[0].id,
        description: insertRes.rows[0].description,
        currentRevision: latestRevision?.revision_code || normalizedRevision,
        nextRevision: latestRevision?.revision_code ? nextRevisionCode(latestRevision.revision_code) : nextRevisionCode(normalizedRevision)
      };
    });

    res.status(201).json(created);
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "duplicate_part" });
    }
    next(err);
  }
});

router.put("/:id", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { description } = req.body;
    const trimmedDesc = String(description || "").trim();
    if (!trimmedDesc) return res.status(400).json({ error: "description_required" });

    const role = requestRole(req);
    const updated = await transaction(async (client) => {
      const existingRes = await client.query("SELECT id, description FROM parts WHERE id=$1", [id]);
      if (!existingRes.rows[0]) return { error: "not_found" };

      await ensurePartSetupBaselineRevision(client, { partId: id, changedByRole: role });
      const changed = String(existingRes.rows[0].description || "") !== trimmedDesc;
      if (changed) {
        await client.query("UPDATE parts SET description=$1 WHERE id=$2", [trimmedDesc, id]);
      }

      const revisionResult = changed
        ? await createPartSetupRevision(client, {
            partId: id,
            changeSummary: "Updated part name",
            changedFields: ["part.description"],
            changedByRole: role
          })
        : { created: false, revision: await getLatestPartRevision(client, id) };

      const latestRevision = await getLatestPartRevision(client, id);
      return {
        id,
        description: trimmedDesc,
        currentRevision: latestRevision?.revision_code || null,
        nextRevision: latestRevision?.revision_code ? nextRevisionCode(latestRevision.revision_code) : "A",
        revisionCreated: !!revisionResult?.created,
        previousRevision: revisionResult?.previousRevision?.revision_code || null
      };
    });

    if (updated?.error === "not_found") return res.status(404).json({ error: "not_found" });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await query("DELETE FROM parts WHERE id=$1 RETURNING id", [id]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
