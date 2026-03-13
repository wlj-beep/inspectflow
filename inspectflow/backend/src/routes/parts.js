import { Router } from "express";
import { query } from "../db.js";
import { requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";

const router = Router();

router.get("/", requireAnyCapability(["view_operator", "view_admin", "view_records"]), async (req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT id, description FROM parts ORDER BY id ASC",
      []
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", requireAnyCapability(["view_operator", "view_admin", "view_records"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const partRes = await query(
      "SELECT id, description FROM parts WHERE id=$1",
      [id]
    );
    if (!partRes.rows[0]) return res.status(404).json({ error: "not_found" });

    const opsRes = await query(
      "SELECT id, op_number, label FROM operations WHERE part_id=$1 ORDER BY op_number ASC",
      [id]
    );
    const opIds = opsRes.rows.map((o) => o.id);

    let dimsByOp = {};
    if (opIds.length) {
      const dimsRes = await query(
        `SELECT d.id, d.operation_id, d.name, d.nominal, d.tol_plus, d.tol_minus, d.unit, d.sampling
         FROM dimensions d WHERE d.operation_id = ANY($1) ORDER BY d.id ASC`,
        [opIds]
      );
      const dimIds = dimsRes.rows.map((d) => d.id);

      let toolsByDim = {};
      let toolMap = {};
      if (dimIds.length) {
        const dtRes = await query(
          `SELECT dimension_id, tool_id FROM dimension_tools WHERE dimension_id = ANY($1)`,
          [dimIds]
        );
        for (const r of dtRes.rows) {
          if (!toolsByDim[r.dimension_id]) toolsByDim[r.dimension_id] = [];
          toolsByDim[r.dimension_id].push(r.tool_id);
        }

        const allToolIds = Array.from(new Set(dtRes.rows.map((r) => r.tool_id)));
        if (allToolIds.length) {
          const toolsRes = await query(
            `SELECT id, name, type, it_num FROM tools WHERE id = ANY($1)`,
            [allToolIds]
          );
          for (const t of toolsRes.rows) {
            toolMap[t.id] = { id: t.id, name: t.name, type: t.type, itNum: t.it_num };
          }
        }
      }

      for (const d of dimsRes.rows) {
        const toolIds = toolsByDim[d.id] || [];
        const dim = {
          id: d.id,
          name: d.name,
          nominal: d.nominal,
          tolPlus: d.tol_plus,
          tolMinus: d.tol_minus,
          unit: d.unit,
          sampling: d.sampling,
          toolIds,
          tools: toolIds.map((tid) => toolMap[tid]).filter(Boolean)
        };
        if (!dimsByOp[d.operation_id]) dimsByOp[d.operation_id] = [];
        dimsByOp[d.operation_id].push(dim);
      }
    }

    const operations = opsRes.rows.map((o) => ({
      id: o.id,
      opNumber: o.op_number,
      label: o.label,
      dimensions: dimsByOp[o.id] || []
    }));

    res.json({
      id: partRes.rows[0].id,
      description: partRes.rows[0].description,
      operations
    });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { id, description } = req.body;
    const trimmedId = String(id || "").trim();
    const trimmedDesc = String(description || "").trim();
    if (!trimmedId || !trimmedDesc) return res.status(400).json({ error: "id_description_required" });
    const { rows } = await query(
      "INSERT INTO parts (id, description) VALUES ($1,$2) RETURNING *",
      [trimmedId, trimmedDesc]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put("/:id", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { description } = req.body;
    const trimmedDesc = String(description || "").trim();
    if (!trimmedDesc) return res.status(400).json({ error: "description_required" });
    const { rows } = await query(
      "UPDATE parts SET description=$1 WHERE id=$2 RETURNING *",
      [trimmedDesc, id]
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
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
