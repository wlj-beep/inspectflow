import { Router } from "express";
import { query, transaction } from "../db.js";
import { requireCapability } from "../middleware/requireCapability.js";

const router = Router();

const VALID_TOOL_TYPES = ["Variable", "Go/No-Go", "Attribute"];
const VALID_UNITS = ["in", "mm", "Ra", "deg"];
const VALID_SAMPLING = ["first_last", "first_middle_last", "every_5", "every_10", "100pct", "custom_interval"];
const VALID_INPUT_MODE = ["single", "range"];

function canonicalHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (line[i + 1] === "\"") {
          cur += "\"";
          i += 2;
          continue;
        }
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else if (ch === "\"") {
      inQuotes = true;
    } else {
      cur += ch;
    }
    i += 1;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

function parseCsvText(csvText) {
  const lines = String(csvText || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]).map(canonicalHeader);
  const rows = lines.slice(1).map((line, idx) => {
    const vals = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = vals[i] ?? "";
    });
    row._line = idx + 2;
    return row;
  });
  return { headers, rows };
}

function firstValue(row, keys) {
  for (const k of keys) {
    const v = row[canonicalHeader(k)];
    if (v !== undefined) return v;
  }
  return "";
}

function parseOptionalBoolean(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "") return undefined;
  if (["true", "1", "yes", "y"].includes(v)) return true;
  if (["false", "0", "no", "n"].includes(v)) return false;
  return undefined;
}

function parseInterval(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

router.post("/tools/csv", requireCapability("manage_tools"), async (req, res, next) => {
  try {
    const { csvText } = req.body || {};
    if (!String(csvText || "").trim()) return res.status(400).json({ error: "csv_required" });

    const { rows } = parseCsvText(csvText);
    if (!rows.length) return res.status(400).json({ error: "csv_no_rows" });

    let inserted = 0;
    let updated = 0;

    await transaction(async (client) => {
      for (const row of rows) {
        const name = firstValue(row, ["name"]).trim();
        const type = firstValue(row, ["type"]).trim();
        const itNum = firstValue(row, ["it_num", "itnum", "it_number", "it"]).trim();
        const size = firstValue(row, ["size"]).trim() || null;
        const active = parseOptionalBoolean(firstValue(row, ["active"]));
        const visible = parseOptionalBoolean(firstValue(row, ["visible", "selectable"]));
        if (!name || !type || !itNum) {
          throw new Error(`line_${row._line}: required_fields_missing`);
        }
        if (!VALID_TOOL_TYPES.includes(type)) {
          throw new Error(`line_${row._line}: invalid_tool_type`);
        }

        const existing = await client.query("SELECT id FROM tools WHERE name=$1", [name]);
        const nextActive = active === undefined ? true : active;
        const nextVisible = visible === undefined ? true : visible;
        await client.query(
          `INSERT INTO tools (name, type, it_num, size, active, visible)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (name) DO UPDATE
             SET type=EXCLUDED.type,
                 it_num=EXCLUDED.it_num,
                 size=EXCLUDED.size,
                 active=EXCLUDED.active,
                 visible=EXCLUDED.visible`,
          [name, type, itNum, size, nextActive, nextVisible]
        );
        if (existing.rows[0]) updated += 1;
        else inserted += 1;
      }
    });

    res.json({ ok: true, total: rows.length, inserted, updated });
  } catch (err) {
    if (String(err?.message || "").startsWith("line_")) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post("/part-dimensions/csv", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { csvText } = req.body || {};
    if (!String(csvText || "").trim()) return res.status(400).json({ error: "csv_required" });

    const { rows } = parseCsvText(csvText);
    if (!rows.length) return res.status(400).json({ error: "csv_no_rows" });

    let partsUpserted = 0;
    let operationsUpserted = 0;
    let dimensionsUpserted = 0;

    await transaction(async (client) => {
      for (const row of rows) {
        const partId = firstValue(row, ["part_id", "part_number"]).trim();
        const partDescription = firstValue(row, ["part_name", "part_description", "description"]).trim() || partId;
        const opNumber = firstValue(row, ["op_number", "operation", "operation_number"]).trim();
        const opLabel = firstValue(row, ["op_label", "operation_label"]).trim() || `Operation ${opNumber}`;
        const dimName = firstValue(row, ["dimension_name", "name"]).trim();
        const nominal = Number(firstValue(row, ["nominal"]));
        const tolPlus = Number(firstValue(row, ["tol_plus", "tolplus"]));
        const tolMinus = Number(firstValue(row, ["tol_minus", "tolminus"]));
        const unit = firstValue(row, ["unit"]).trim();
        const sampling = firstValue(row, ["sampling", "sampling_plan"]).trim();
        const inputMode = firstValue(row, ["input_mode"]).trim() || "single";
        const samplingIntervalRaw = firstValue(row, ["sampling_interval", "interval_n"]);
        const samplingInterval = parseInterval(samplingIntervalRaw);
        const toolItNumsRaw = firstValue(row, ["tool_it_nums", "tool_it_list", "tool_its"]);

        if (!partId || !opNumber || !dimName || Number.isNaN(nominal) || Number.isNaN(tolPlus) || Number.isNaN(tolMinus) || !unit || !sampling) {
          throw new Error(`line_${row._line}: required_fields_missing`);
        }
        if (!VALID_UNITS.includes(unit)) throw new Error(`line_${row._line}: invalid_unit`);
        if (!VALID_SAMPLING.includes(sampling)) throw new Error(`line_${row._line}: invalid_sampling`);
        if (!VALID_INPUT_MODE.includes(inputMode)) throw new Error(`line_${row._line}: invalid_input_mode`);
        if (sampling === "custom_interval" && samplingInterval === null) {
          throw new Error(`line_${row._line}: invalid_sampling_interval`);
        }

        const existingPart = await client.query("SELECT id FROM parts WHERE id=$1", [partId]);
        await client.query(
          `INSERT INTO parts (id, description)
           VALUES ($1,$2)
           ON CONFLICT (id) DO UPDATE SET description=EXCLUDED.description`,
          [partId, partDescription]
        );
        if (!existingPart.rows[0]) partsUpserted += 1;

        const existingOp = await client.query(
          "SELECT id FROM operations WHERE part_id=$1 AND op_number=$2",
          [partId, opNumber]
        );
        const opRes = await client.query(
          `INSERT INTO operations (part_id, op_number, label)
           VALUES ($1,$2,$3)
           ON CONFLICT (part_id, op_number) DO UPDATE SET label=EXCLUDED.label
           RETURNING id`,
          [partId, opNumber, opLabel]
        );
        if (!existingOp.rows[0]) operationsUpserted += 1;
        const operationId = opRes.rows[0].id;

        const existingDim = await client.query(
          "SELECT id FROM dimensions WHERE operation_id=$1 AND name=$2",
          [operationId, dimName]
        );
        const dimRes = await client.query(
          `INSERT INTO dimensions (operation_id, name, nominal, tol_plus, tol_minus, unit, sampling, sampling_interval, input_mode)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (operation_id, name) DO UPDATE
             SET nominal=EXCLUDED.nominal,
                 tol_plus=EXCLUDED.tol_plus,
                 tol_minus=EXCLUDED.tol_minus,
                 unit=EXCLUDED.unit,
                 sampling=EXCLUDED.sampling,
                 sampling_interval=EXCLUDED.sampling_interval,
                 input_mode=EXCLUDED.input_mode
           RETURNING id`,
          [
            operationId,
            dimName,
            nominal,
            tolPlus,
            tolMinus,
            unit,
            sampling,
            sampling === "custom_interval" ? samplingInterval : null,
            inputMode
          ]
        );
        if (!existingDim.rows[0]) dimensionsUpserted += 1;
        const dimensionId = dimRes.rows[0].id;

        const toolItNums = String(toolItNumsRaw || "")
          .split(/[;|]/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (toolItNums.length) {
          const toolRes = await client.query(
            "SELECT id, it_num FROM tools WHERE it_num = ANY($1)",
            [toolItNums]
          );
          if (toolRes.rows.length !== toolItNums.length) {
            throw new Error(`line_${row._line}: unknown_tool_it_num`);
          }
          await client.query("DELETE FROM dimension_tools WHERE dimension_id=$1", [dimensionId]);
          for (const t of toolRes.rows) {
            await client.query(
              "INSERT INTO dimension_tools (dimension_id, tool_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
              [dimensionId, t.id]
            );
          }
        }
      }
    });

    res.json({
      ok: true,
      totalRows: rows.length,
      partsUpserted,
      operationsUpserted,
      dimensionsUpserted
    });
  } catch (err) {
    if (String(err?.message || "").startsWith("line_")) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.get("/templates", requireCapability("view_admin"), (req, res) => {
  res.json({
    tools: {
      headers: ["name", "type", "it_num", "size", "active", "visible"]
    },
    partDimensions: {
      headers: [
        "part_id",
        "part_name",
        "op_number",
        "op_label",
        "dimension_name",
        "nominal",
        "tol_plus",
        "tol_minus",
        "unit",
        "sampling",
        "sampling_interval",
        "input_mode",
        "tool_it_nums"
      ]
    }
  });
});

export default router;
