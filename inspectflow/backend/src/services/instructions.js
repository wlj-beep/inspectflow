const VALID_MEDIA_TYPES = new Set(["image", "video", "document", "link"]);

function normalizeOptionalText(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function parsePositiveInteger(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeMediaLink(item, index) {
  const label = normalizeOptionalText(item?.label);
  const url = normalizeOptionalText(item?.url);
  const mediaType = normalizeOptionalText(item?.mediaType || item?.type)?.toLowerCase() || null;
  const sortOrderRaw = item?.sortOrder == null ? index : Number(item.sortOrder);

  if (!label || !url || !mediaType || !VALID_MEDIA_TYPES.has(mediaType)) {
    return { error: "invalid_media_link" };
  }
  if (!Number.isInteger(sortOrderRaw) || sortOrderRaw < 0) {
    return { error: "invalid_media_link_sort_order" };
  }

  return {
    label,
    url,
    mediaType,
    sortOrder: sortOrderRaw
  };
}

export function normalizeInstructionVersionInput(payload, { allowPartial = false } = {}) {
  const source = payload && typeof payload === "object" ? payload : {};
  const normalized = {};

  if (!allowPartial || Object.prototype.hasOwnProperty.call(source, "title")) {
    normalized.title = normalizeOptionalText(source.title);
    if (!normalized.title) return { error: "instruction_title_required" };
  }

  if (!allowPartial || Object.prototype.hasOwnProperty.call(source, "content")) {
    normalized.content = normalizeOptionalText(source.content);
    if (!normalized.content) return { error: "instruction_content_required" };
  }

  if (!allowPartial || Object.prototype.hasOwnProperty.call(source, "changeSummary")) {
    normalized.changeSummary = normalizeOptionalText(source.changeSummary);
  }

  if (!allowPartial || Object.prototype.hasOwnProperty.call(source, "mediaLinks")) {
    if (!Array.isArray(source.mediaLinks)) return { error: "instruction_media_links_required" };
    const mediaLinks = [];
    for (let index = 0; index < source.mediaLinks.length; index += 1) {
      const normalizedLink = normalizeMediaLink(source.mediaLinks[index], index);
      if (normalizedLink.error) return normalizedLink;
      mediaLinks.push(normalizedLink);
    }
    normalized.mediaLinks = mediaLinks;
  }

  if (allowPartial && Object.keys(normalized).length === 0) {
    return { error: "instruction_version_update_required" };
  }

  return normalized;
}

function mapMediaRow(row) {
  return {
    id: Number(row.id),
    mediaType: row.media_type,
    label: row.label,
    url: row.url,
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at
  };
}

function mapVersionRow(row, mediaLinks = []) {
  return {
    id: Number(row.id),
    instructionSetId: Number(row.instruction_set_id),
    operationId: Number(row.operation_id),
    versionNumber: Number(row.version_number),
    status: row.status,
    title: row.title,
    content: row.content,
    changeSummary: row.change_summary || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByUserId: row.created_by_user_id == null ? null : Number(row.created_by_user_id),
    createdByUserName: row.created_by_user_name || null,
    createdByRole: row.created_by_role || null,
    publishedAt: row.published_at || null,
    publishedByUserId: row.published_by_user_id == null ? null : Number(row.published_by_user_id),
    publishedByUserName: row.published_by_user_name || null,
    publishedByRole: row.published_by_role || null,
    mediaLinks
  };
}

function mapAcknowledgmentRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    instructionVersionId: Number(row.instruction_version_id),
    operatorUserId: Number(row.operator_user_id),
    operatorUserName: row.operator_user_name || null,
    acknowledgedRole: row.acknowledged_role,
    contextType: row.context_type,
    jobId: row.job_id || null,
    recordId: row.record_id == null ? null : Number(row.record_id),
    acknowledgedAt: row.acknowledged_at
  };
}

async function ensureInstructionSet(client, operationId) {
  const { rows } = await client.query(
    `INSERT INTO operation_instruction_sets (operation_id)
     VALUES ($1)
     ON CONFLICT (operation_id)
     DO UPDATE SET updated_at=NOW()
     RETURNING id, operation_id, created_at, updated_at`,
    [operationId]
  );
  return rows[0];
}

async function fetchVersionRows(client, instructionSetId) {
  const { rows } = await client.query(
    `SELECT v.id, v.instruction_set_id, s.operation_id, v.version_number, v.status, v.title, v.content,
            v.change_summary, v.created_by_user_id, cu.name AS created_by_user_name, v.created_by_role,
            v.created_at, v.updated_at, v.published_by_user_id, pu.name AS published_by_user_name,
            v.published_by_role, v.published_at
     FROM operation_instruction_versions v
     JOIN operation_instruction_sets s ON s.id = v.instruction_set_id
     LEFT JOIN users cu ON cu.id = v.created_by_user_id
     LEFT JOIN users pu ON pu.id = v.published_by_user_id
     WHERE v.instruction_set_id=$1
     ORDER BY v.version_number DESC, v.id DESC`,
    [instructionSetId]
  );
  return rows;
}

async function fetchMediaByVersionIds(client, versionIds) {
  if (!versionIds.length) return new Map();
  const { rows } = await client.query(
    `SELECT id, instruction_version_id, media_type, label, url, sort_order, created_at
     FROM operation_instruction_media_links
     WHERE instruction_version_id = ANY($1::bigint[])
     ORDER BY instruction_version_id ASC, sort_order ASC, id ASC`,
    [versionIds]
  );
  const mediaByVersion = new Map();
  for (const row of rows) {
    const versionId = Number(row.instruction_version_id);
    if (!mediaByVersion.has(versionId)) mediaByVersion.set(versionId, []);
    mediaByVersion.get(versionId).push(mapMediaRow(row));
  }
  return mediaByVersion;
}

async function fetchVersionWithMedia(client, versionId) {
  const { rows } = await client.query(
    `SELECT v.id, v.instruction_set_id, s.operation_id, v.version_number, v.status, v.title, v.content,
            v.change_summary, v.created_by_user_id, cu.name AS created_by_user_name, v.created_by_role,
            v.created_at, v.updated_at, v.published_by_user_id, pu.name AS published_by_user_name,
            v.published_by_role, v.published_at
     FROM operation_instruction_versions v
     JOIN operation_instruction_sets s ON s.id = v.instruction_set_id
     LEFT JOIN users cu ON cu.id = v.created_by_user_id
     LEFT JOIN users pu ON pu.id = v.published_by_user_id
     WHERE v.id=$1
     LIMIT 1`,
    [versionId]
  );
  const row = rows[0];
  if (!row) return null;
  const mediaByVersion = await fetchMediaByVersionIds(client, [Number(versionId)]);
  return mapVersionRow(row, mediaByVersion.get(Number(versionId)) || []);
}

async function replaceMediaLinks(client, versionId, mediaLinks) {
  await client.query(
    "DELETE FROM operation_instruction_media_links WHERE instruction_version_id=$1",
    [versionId]
  );
  for (const media of mediaLinks) {
    await client.query(
      `INSERT INTO operation_instruction_media_links
         (instruction_version_id, media_type, label, url, sort_order)
       VALUES ($1,$2,$3,$4,$5)`,
      [versionId, media.mediaType, media.label, media.url, media.sortOrder]
    );
  }
}

export async function listOperationInstructionVersions(client, operationId) {
  const operationRes = await client.query(
    "SELECT id, part_id, op_number, label FROM operations WHERE id=$1 LIMIT 1",
    [operationId]
  );
  const operation = operationRes.rows[0];
  if (!operation) return null;

  const setRes = await client.query(
    "SELECT id, operation_id, created_at, updated_at FROM operation_instruction_sets WHERE operation_id=$1 LIMIT 1",
    [operationId]
  );
  const instructionSet = setRes.rows[0] || null;
  if (!instructionSet) {
    return {
      operation: {
        id: Number(operation.id),
        partId: operation.part_id,
        opNumber: operation.op_number,
        label: operation.label
      },
      instructionSet: null,
      current: null,
      versions: []
    };
  }

  const versionRows = await fetchVersionRows(client, Number(instructionSet.id));
  const mediaByVersion = await fetchMediaByVersionIds(
    client,
    versionRows.map((row) => Number(row.id))
  );
  const versions = versionRows.map((row) => mapVersionRow(row, mediaByVersion.get(Number(row.id)) || []));

  return {
    operation: {
      id: Number(operation.id),
      partId: operation.part_id,
      opNumber: operation.op_number,
      label: operation.label
    },
    instructionSet: {
      id: Number(instructionSet.id),
      createdAt: instructionSet.created_at,
      updatedAt: instructionSet.updated_at
    },
    current: versions.find((version) => version.status === "published") || null,
    versions
  };
}

export async function createInstructionVersion(client, {
  operationId,
  title,
  content,
  changeSummary = null,
  mediaLinks = [],
  actorUserId = null,
  actorRole = null
}) {
  const instructionSet = await ensureInstructionSet(client, operationId);
  const nextVersionRes = await client.query(
    `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
     FROM operation_instruction_versions
     WHERE instruction_set_id=$1`,
    [instructionSet.id]
  );
  const versionNumber = Number(nextVersionRes.rows[0].next_version);
  const insertRes = await client.query(
    `INSERT INTO operation_instruction_versions
       (instruction_set_id, version_number, status, title, content, change_summary, created_by_user_id, created_by_role)
     VALUES ($1,$2,'draft',$3,$4,$5,$6,$7)
     RETURNING id`,
    [instructionSet.id, versionNumber, title, content, changeSummary, actorUserId, actorRole]
  );
  const versionId = Number(insertRes.rows[0].id);
  await replaceMediaLinks(client, versionId, mediaLinks);
  return fetchVersionWithMedia(client, versionId);
}

export async function updateInstructionVersion(client, {
  operationId,
  versionId,
  title,
  content,
  changeSummary,
  mediaLinks
}) {
  const versionRes = await client.query(
    `SELECT v.id, v.instruction_set_id, s.operation_id, v.status, v.title, v.content, v.change_summary
     FROM operation_instruction_versions v
     JOIN operation_instruction_sets s ON s.id = v.instruction_set_id
     WHERE v.id=$1 AND s.operation_id=$2
     FOR UPDATE`,
    [versionId, operationId]
  );
  const existing = versionRes.rows[0];
  if (!existing) return { error: "not_found" };
  if (existing.status !== "draft") return { error: "instruction_version_immutable" };

  const nextTitle = title === undefined ? existing.title : title;
  const nextContent = content === undefined ? existing.content : content;
  const nextChangeSummary = changeSummary === undefined ? (existing.change_summary || null) : changeSummary;

  await client.query(
    `UPDATE operation_instruction_versions
     SET title=$1, content=$2, change_summary=$3, updated_at=NOW()
     WHERE id=$4`,
    [nextTitle, nextContent, nextChangeSummary, versionId]
  );
  if (mediaLinks !== undefined) {
    await replaceMediaLinks(client, versionId, mediaLinks);
  }
  return fetchVersionWithMedia(client, versionId);
}

export async function publishInstructionVersion(client, {
  operationId,
  versionId,
  actorUserId = null,
  actorRole = null
}) {
  const versionRes = await client.query(
    `SELECT v.id, v.instruction_set_id, s.operation_id, v.status
     FROM operation_instruction_versions v
     JOIN operation_instruction_sets s ON s.id = v.instruction_set_id
     WHERE v.id=$1 AND s.operation_id=$2
     FOR UPDATE OF v, s`,
    [versionId, operationId]
  );
  const existing = versionRes.rows[0];
  if (!existing) return { error: "not_found" };
  if (existing.status === "superseded") return { error: "instruction_version_immutable" };

  await client.query(
    `UPDATE operation_instruction_versions
     SET status='superseded', updated_at=NOW()
     WHERE instruction_set_id=$1
       AND status='published'
       AND id <> $2`,
    [existing.instruction_set_id, versionId]
  );
  await client.query(
    `UPDATE operation_instruction_versions
     SET status='published',
         published_by_user_id=$1,
         published_by_role=$2,
         published_at=COALESCE(published_at, NOW()),
         updated_at=NOW()
     WHERE id=$3`,
    [actorUserId, actorRole, versionId]
  );
  return fetchVersionWithMedia(client, versionId);
}

async function loadPublishedInstructionForOperation(client, operationId) {
  const { rows } = await client.query(
    `SELECT v.id
     FROM operation_instruction_versions v
     JOIN operation_instruction_sets s ON s.id = v.instruction_set_id
     WHERE s.operation_id=$1
       AND v.status='published'
     ORDER BY v.version_number DESC
     LIMIT 1`,
    [operationId]
  );
  if (!rows[0]) return null;
  return fetchVersionWithMedia(client, Number(rows[0].id));
}

async function loadContextRow(client, contextType, contextId) {
  if (contextType === "job") {
    const { rows } = await client.query(
      `SELECT j.id AS job_id, NULL::integer AS record_id, j.part_id, j.operation_id, o.op_number, o.label
       FROM jobs j
       JOIN operations o ON o.id = j.operation_id
       WHERE j.id=$1
       LIMIT 1`,
      [contextId]
    );
    return rows[0] || null;
  }

  const { rows } = await client.query(
    `SELECT r.job_id, r.id AS record_id, r.part_id, r.operation_id, o.op_number, o.label
     FROM records r
     JOIN operations o ON o.id = r.operation_id
     WHERE r.id=$1
     LIMIT 1`,
    [contextId]
  );
  return rows[0] || null;
}

async function loadAcknowledgmentForContext(client, {
  contextType,
  contextId,
  operatorUserId,
  instructionVersionId
}) {
  if (!operatorUserId || !instructionVersionId) return null;
  const filters = contextType === "job"
    ? "ia.context_type='job' AND ia.job_id=$3"
    : "ia.context_type='record' AND ia.record_id=$3";
  const { rows } = await client.query(
    `SELECT ia.id, ia.instruction_version_id, ia.operator_user_id, u.name AS operator_user_name,
            ia.acknowledged_role, ia.context_type, ia.job_id, ia.record_id, ia.acknowledged_at
     FROM instruction_acknowledgments ia
     LEFT JOIN users u ON u.id = ia.operator_user_id
     WHERE ia.instruction_version_id=$1
       AND ia.operator_user_id=$2
       AND ${filters}
     ORDER BY ia.acknowledged_at DESC, ia.id DESC
     LIMIT 1`,
    [instructionVersionId, operatorUserId, contextId]
  );
  return mapAcknowledgmentRow(rows[0] || null);
}

export async function getActiveInstructionContext(client, {
  contextType,
  contextId,
  operatorUserId = null
}) {
  const context = await loadContextRow(client, contextType, contextId);
  if (!context) return null;

  const instruction = await loadPublishedInstructionForOperation(client, Number(context.operation_id));
  const acknowledgment = instruction
    ? await loadAcknowledgmentForContext(client, {
      contextType,
      contextId,
      operatorUserId,
      instructionVersionId: instruction.id
    })
    : null;

  return {
    context: {
      type: contextType,
      jobId: context.job_id || null,
      recordId: context.record_id == null ? null : Number(context.record_id),
      partId: context.part_id,
      operationId: Number(context.operation_id),
      operatorUserId: operatorUserId == null ? null : Number(operatorUserId)
    },
    operation: {
      id: Number(context.operation_id),
      partId: context.part_id,
      opNumber: context.op_number,
      label: context.label
    },
    instruction,
    acknowledgment
  };
}

export async function acknowledgeInstructionForContext(client, {
  contextType,
  contextId,
  operatorUserId,
  actorRole,
  instructionVersionId = null
}) {
  const normalizedOperatorUserId = parsePositiveInteger(operatorUserId);
  if (!normalizedOperatorUserId) return { error: "operator_user_required" };

  const userRes = await client.query(
    "SELECT id, name, role FROM users WHERE id=$1 LIMIT 1",
    [normalizedOperatorUserId]
  );
  const operator = userRes.rows[0];
  if (!operator) return { error: "operator_not_found" };
  if (operator.role !== "Operator") return { error: "operator_role_required" };

  const activeContext = await getActiveInstructionContext(client, {
    contextType,
    contextId,
    operatorUserId: normalizedOperatorUserId
  });
  if (!activeContext) return { error: "not_found" };
  if (!activeContext.instruction) return { error: "instruction_not_published" };
  if (instructionVersionId != null && Number(instructionVersionId) !== Number(activeContext.instruction.id)) {
    return { error: "instruction_version_not_active" };
  }
  if (activeContext.acknowledgment) {
    return {
      created: false,
      instruction: activeContext.instruction,
      acknowledgment: activeContext.acknowledgment,
      context: activeContext.context,
      operation: activeContext.operation
    };
  }

  let inserted;
  if (contextType === "job") {
    const insertRes = await client.query(
      `INSERT INTO instruction_acknowledgments
         (instruction_version_id, operator_user_id, acknowledged_role, context_type, job_id)
       VALUES ($1,$2,$3,'job',$4)
       RETURNING id, instruction_version_id, operator_user_id, acknowledged_role, context_type, job_id, record_id, acknowledged_at`,
      [activeContext.instruction.id, normalizedOperatorUserId, actorRole, contextId]
    );
    inserted = insertRes.rows[0];
  } else {
    const insertRes = await client.query(
      `INSERT INTO instruction_acknowledgments
         (instruction_version_id, operator_user_id, acknowledged_role, context_type, record_id)
       VALUES ($1,$2,$3,'record',$4)
       RETURNING id, instruction_version_id, operator_user_id, acknowledged_role, context_type, job_id, record_id, acknowledged_at`,
      [activeContext.instruction.id, normalizedOperatorUserId, actorRole, contextId]
    );
    inserted = insertRes.rows[0];
  }

  const acknowledgment = {
    ...mapAcknowledgmentRow(inserted),
    operatorUserName: operator.name
  };

  return {
    created: true,
    instruction: activeContext.instruction,
    acknowledgment,
    context: activeContext.context,
    operation: activeContext.operation
  };
}
