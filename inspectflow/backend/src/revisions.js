const REVISION_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function normalizeRevisionCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

export function revisionCodeToIndex(value) {
  const code = normalizeRevisionCode(value);
  if (!code) return null;
  let index = 0;
  for (const ch of code) {
    const n = REVISION_ALPHABET.indexOf(ch);
    if (n < 0) return null;
    index = index * 26 + (n + 1);
  }
  return index;
}

export function revisionIndexToCode(value) {
  let n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  let out = "";
  while (n > 0) {
    n -= 1;
    out = REVISION_ALPHABET[n % 26] + out;
    n = Math.floor(n / 26);
  }
  return out;
}

export function nextRevisionCode(value) {
  const idx = revisionCodeToIndex(value);
  if (!idx) return "A";
  return revisionIndexToCode(idx + 1);
}

function normalizeChangedFields(fields) {
  if (!Array.isArray(fields)) return [];
  return Array.from(
    new Set(
      fields
        .map((f) => String(f || "").trim())
        .filter(Boolean)
    )
  );
}

export async function getLatestPartRevision(client, partId) {
  const res = await client.query(
    `SELECT id, part_id, revision_code, revision_index, part_name, snapshot, change_summary,
            changed_fields, created_by_role, created_at
     FROM part_setup_revisions
     WHERE part_id=$1
     ORDER BY revision_index DESC
     LIMIT 1`,
    [partId]
  );
  return res.rows[0] || null;
}

export async function listPartRevisions(client, partId) {
  const res = await client.query(
    `SELECT revision_code, revision_index, part_name, change_summary, changed_fields, created_by_role, created_at
     FROM part_setup_revisions
     WHERE part_id=$1
     ORDER BY revision_index DESC`,
    [partId]
  );
  return res.rows;
}

async function loadToolsByIds(client, toolIds) {
  if (!toolIds.length) return {};
  const toolRes = await client.query(
    "SELECT id, name, type, it_num FROM tools WHERE id = ANY($1)",
    [toolIds]
  );
  const map = {};
  for (const row of toolRes.rows) {
    map[row.id] = { id: row.id, name: row.name, type: row.type, itNum: row.it_num };
  }
  return map;
}

export async function loadCurrentPartSetup(client, partId) {
  const partRes = await client.query("SELECT id, description FROM parts WHERE id=$1", [partId]);
  if (!partRes.rows[0]) return null;

  const opsRes = await client.query(
    `SELECT id, op_number, label
     FROM operations
     WHERE part_id=$1
     ORDER BY CASE WHEN op_number ~ '^[0-9]+$' THEN op_number::int ELSE NULL END ASC, op_number ASC`,
    [partId]
  );
  const opIds = opsRes.rows.map((row) => row.id);

  let dimsByOp = {};
  if (opIds.length) {
    const dimsRes = await client.query(
      `SELECT d.id, d.operation_id, d.name, d.nominal, d.tol_plus, d.tol_minus, d.unit, d.sampling, d.sampling_interval, d.input_mode
       FROM dimensions d
       WHERE d.operation_id = ANY($1)
       ORDER BY d.id ASC`,
      [opIds]
    );
    const dimIds = dimsRes.rows.map((row) => row.id);

    let toolsByDim = {};
    let toolMap = {};
    if (dimIds.length) {
      const dtRes = await client.query(
        "SELECT dimension_id, tool_id FROM dimension_tools WHERE dimension_id = ANY($1) ORDER BY tool_id ASC",
        [dimIds]
      );
      for (const row of dtRes.rows) {
        if (!toolsByDim[row.dimension_id]) toolsByDim[row.dimension_id] = [];
        toolsByDim[row.dimension_id].push(row.tool_id);
      }
      const allToolIds = Array.from(new Set(dtRes.rows.map((row) => row.tool_id)));
      toolMap = await loadToolsByIds(client, allToolIds);
    }

    for (const row of dimsRes.rows) {
      const toolIds = toolsByDim[row.id] || [];
      const item = {
        id: row.id,
        name: row.name,
        nominal: row.nominal,
        tolPlus: row.tol_plus,
        tolMinus: row.tol_minus,
        unit: row.unit,
        sampling: row.sampling,
        samplingInterval: row.sampling_interval,
        inputMode: row.input_mode,
        toolIds,
        tools: toolIds.map((tid) => toolMap[tid]).filter(Boolean)
      };
      if (!dimsByOp[row.operation_id]) dimsByOp[row.operation_id] = [];
      dimsByOp[row.operation_id].push(item);
    }
  }

  const operations = opsRes.rows.map((row) => ({
    id: row.id,
    opNumber: row.op_number,
    label: row.label,
    dimensions: dimsByOp[row.id] || []
  }));

  return {
    id: partRes.rows[0].id,
    description: partRes.rows[0].description,
    operations
  };
}

function toSnapshotValue(partSetup) {
  return {
    partId: partSetup.id,
    partName: partSetup.description,
    operations: (partSetup.operations || []).map((op) => ({
      opNumber: op.opNumber,
      label: op.label,
      dimensions: (op.dimensions || []).map((dim) => ({
        name: dim.name,
        nominal: Number(dim.nominal),
        tolPlus: Number(dim.tolPlus),
        tolMinus: Number(dim.tolMinus),
        unit: dim.unit,
        sampling: dim.sampling,
        samplingInterval: dim.samplingInterval == null ? null : Number(dim.samplingInterval),
        inputMode: dim.inputMode || "single",
        toolIds: (dim.toolIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id))
      }))
    }))
  };
}

function snapshotsEqual(a, b) {
  return JSON.stringify(a || null) === JSON.stringify(b || null);
}

export async function ensurePartSetupBaselineRevision(client, { partId, changedByRole = null } = {}) {
  const latest = await getLatestPartRevision(client, partId);
  if (latest) return latest;

  const partSetup = await loadCurrentPartSetup(client, partId);
  if (!partSetup) return null;
  const snapshot = toSnapshotValue(partSetup);

  const inserted = await client.query(
    `INSERT INTO part_setup_revisions
       (part_id, revision_code, revision_index, part_name, snapshot, change_summary, changed_fields, created_by_role)
     VALUES ($1,'A',1,$2,$3,$4,$5,$6)
     RETURNING id, part_id, revision_code, revision_index, part_name, snapshot, change_summary,
               changed_fields, created_by_role, created_at`,
    [
      partId,
      snapshot.partName,
      snapshot,
      "Initial setup baseline",
      [],
      changedByRole
    ]
  );
  return inserted.rows[0] || null;
}

export async function createPartSetupRevision(
  client,
  {
    partId,
    changeSummary,
    changedFields = [],
    changedByRole = null,
    createInitialIfMissing = false,
    initialRevisionCode = "A"
  }
) {
  let latest = await getLatestPartRevision(client, partId);
  const partSetup = await loadCurrentPartSetup(client, partId);
  if (!partSetup) return null;
  const nextSnapshot = toSnapshotValue(partSetup);

  if (!latest && createInitialIfMissing) {
    const normalizedInitialCode = normalizeRevisionCode(initialRevisionCode) || "A";
    const normalizedInitialIndex = revisionCodeToIndex(normalizedInitialCode) || 1;
    const insertedInitial = await client.query(
      `INSERT INTO part_setup_revisions
         (part_id, revision_code, revision_index, part_name, snapshot, change_summary, changed_fields, created_by_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, part_id, revision_code, revision_index, part_name, snapshot, change_summary,
                 changed_fields, created_by_role, created_at`,
      [
        partId,
        normalizedInitialCode,
        normalizedInitialIndex,
        nextSnapshot.partName,
        nextSnapshot,
        String(changeSummary || "Initial setup"),
        normalizeChangedFields(changedFields),
        changedByRole
      ]
    );
    return { created: true, revision: insertedInitial.rows[0] };
  }

  if (!latest) {
    latest = await ensurePartSetupBaselineRevision(client, { partId, changedByRole });
    if (!latest) return null;
  }

  if (snapshotsEqual(latest.snapshot, nextSnapshot)) {
    return { created: false, revision: latest };
  }

  const nextIndex = Number(latest.revision_index) + 1;
  const nextCode = revisionIndexToCode(nextIndex);
  const inserted = await client.query(
    `INSERT INTO part_setup_revisions
       (part_id, revision_code, revision_index, part_name, snapshot, change_summary, changed_fields, created_by_role)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, part_id, revision_code, revision_index, part_name, snapshot, change_summary,
               changed_fields, created_by_role, created_at`,
    [
      partId,
      nextCode,
      nextIndex,
      nextSnapshot.partName,
      nextSnapshot,
      String(changeSummary || "Updated part setup"),
      normalizeChangedFields(changedFields),
      changedByRole
    ]
  );

  return { created: true, revision: inserted.rows[0], previousRevision: latest };
}

export async function getPartRevisionByCode(client, partId, revisionCode) {
  const normalized = normalizeRevisionCode(revisionCode);
  if (!normalized) return null;
  const res = await client.query(
    `SELECT id, part_id, revision_code, revision_index, part_name, snapshot, change_summary,
            changed_fields, created_by_role, created_at
     FROM part_setup_revisions
     WHERE part_id=$1 AND revision_code=$2
     LIMIT 1`,
    [partId, normalized]
  );
  return res.rows[0] || null;
}

export async function hydrateSnapshotOperations(client, snapshot) {
  const rawOps = Array.isArray(snapshot?.operations) ? snapshot.operations : [];
  const toolIds = Array.from(
    new Set(
      rawOps.flatMap((op) =>
        (Array.isArray(op?.dimensions) ? op.dimensions : []).flatMap((dim) =>
          Array.isArray(dim?.toolIds) ? dim.toolIds.map((id) => Number(id)).filter((id) => Number.isInteger(id)) : []
        )
      )
    )
  );
  const toolMap = await loadToolsByIds(client, toolIds);

  return rawOps.map((op, opIdx) => ({
    id: null,
    opNumber: String(op?.opNumber || ""),
    label: String(op?.label || ""),
    dimensions: (Array.isArray(op?.dimensions) ? op.dimensions : []).map((dim, dimIdx) => {
      const ids = Array.isArray(dim?.toolIds)
        ? dim.toolIds.map((id) => Number(id)).filter((id) => Number.isInteger(id))
        : [];
      return {
        id: `rev-${opIdx}-${dimIdx}`,
        name: String(dim?.name || ""),
        nominal: Number(dim?.nominal ?? 0),
        tolPlus: Number(dim?.tolPlus ?? 0),
        tolMinus: Number(dim?.tolMinus ?? 0),
        unit: String(dim?.unit || "in"),
        sampling: String(dim?.sampling || "first_last"),
        samplingInterval: dim?.samplingInterval == null ? null : Number(dim.samplingInterval),
        inputMode: String(dim?.inputMode || "single"),
        toolIds: ids,
        tools: ids.map((id) => toolMap[id]).filter(Boolean)
      };
    })
  }));
}
