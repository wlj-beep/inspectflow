import { fmtTs, nextRevisionCode, normalizeOpNumber } from "../../shared/utils/jobflowCore.ts";

export function mapToolLibrary(apiTools) {
  const out = {};
  for (const t of apiTools || []) {
    const id = String(t.id);
    out[id] = {
      id,
      name: t.name,
      type: t.type,
      itNum: t.it_num ?? t.itNum,
      size: t.size ?? "",
      calibrationDueDate: t.calibration_due_date ?? t.calibrationDueDate ?? "",
      currentLocationId: t.current_location_id ?? t.currentLocationId ?? null,
      currentLocationName: t.current_location_name ?? t.currentLocationName ?? "",
      currentLocationType: t.current_location_type ?? t.currentLocationType ?? "",
      homeLocationId: t.home_location_id ?? t.homeLocationId ?? null,
      homeLocationName: t.home_location_name ?? t.homeLocationName ?? "",
      homeLocationType: t.home_location_type ?? t.homeLocationType ?? "",
      active: t.active ?? true,
      visible: t.visible ?? true
    };
  }
  return out;
}

export function mapToolLocations(apiLocations) {
  return (apiLocations || []).map((loc) => ({
    id: Number(loc.id),
    name: loc.name,
    locationType: loc.location_type ?? loc.locationType
  }));
}

export function buildPartsFromApi(partDetails) {
  const partsObj = {};
  const opIdToNumber = {};
  for (const part of partDetails || []) {
    const opsObj = {};
    for (const op of part.operations || []) {
      const normalizedOp = normalizeOpNumber(op.opNumber) || String(op.opNumber);
      opIdToNumber[String(op.id)] = normalizedOp;
      const dims = (op.dimensions || []).map((d) => ({
        id: String(d.id),
        name: d.name,
        bubbleNumber: d.bubbleNumber ?? d.bubble_number ?? "",
        featureType: d.featureType ?? d.feature_type ?? "",
        gdtClass: d.gdtClass ?? d.gdt_class ?? "",
        toleranceZone: d.toleranceZone ?? d.tolerance_zone ?? "",
        featureQuantity: d.featureQuantity ?? d.feature_quantity ?? "",
        featureUnits: d.featureUnits ?? d.feature_units ?? "",
        featureModifiers: Array.isArray(d.featureModifiers)
          ? d.featureModifiers
          : Array.isArray(d.feature_modifiers_json)
            ? d.feature_modifiers_json
            : [],
        sourceCharacteristicKey: d.sourceCharacteristicKey ?? d.source_characteristic_key ?? "",
        nominal: Number(d.nominal),
        tolPlus: Number(d.tolPlus ?? d.tol_plus),
        tolMinus: Number(d.tolMinus ?? d.tol_minus),
        unit: d.unit,
        sampling: d.sampling,
        samplingInterval: Number(d.samplingInterval ?? d.sampling_interval) || null,
        inputMode: d.input_mode ?? d.inputMode ?? "single",
        tools: (d.toolIds || d.tools?.map((tool) => tool.id) || []).map((id) => String(id))
      }));
      opsObj[normalizedOp] = { id: String(op.id), label: op.label, dimensions: dims };
    }
    const currentRevision = part.selectedRevision || part.currentRevision || null;
    partsObj[part.id] = {
      partNumber: part.id,
      description: part.description,
      currentRevision,
      nextRevision:
        part.nextRevision || (currentRevision ? nextRevisionCode(currentRevision) : "A"),
      revisions: Array.isArray(part.revisions) ? part.revisions : [],
      readOnlyRevision: !!part.readOnlyRevision,
      operations: opsObj
    };
  }
  return { partsObj, opIdToNumber };
}

export function mapJobsFromApi(apiJobs, opIdToNumber) {
  const out = {};
  for (const j of apiJobs || []) {
    const rawOp = opIdToNumber[String(j.operation_id)] || String(j.operation_id);
    const opNum = normalizeOpNumber(rawOp) || String(rawOp);
    out[j.id] = {
      jobNumber: j.id,
      partNumber: j.part_id,
      partRevision: j.part_revision_code || j.partRevision || "A",
      operation: opNum,
      operationId: j.operation_id,
      lot: j.lot,
      qty: j.qty,
      status: j.status,
      lockOwnerUserId: j.lock_owner_user_id || null,
      lockTimestamp: j.lock_timestamp || null
    };
  }
  return out;
}

export function mapRecordsFromApi(apiRecords, opIdToNumber, usersById) {
  return (apiRecords || []).map((r) => ({
    id: String(r.id),
    jobNumber: r.job_id,
    partNumber: r.part_id,
    operation: opIdToNumber[String(r.operation_id)] || String(r.operation_id),
    lot: r.lot,
    qty: r.qty,
    timestamp: fmtTs(r.timestamp),
    operator: usersById?.[String(r.operator_user_id)] || "",
    operatorUserId: r.operator_user_id,
    values: {},
    tools: {},
    missingPieces: {},
    oot: !!r.oot,
    status: r.status,
    comment: r.comment || ""
  }));
}

export function mapRecordDetailFromApi(r, opIdToNumber, usersById) {
  const values = {};
  for (const v of r.values || []) {
    values[`${v.dimension_id}_${v.piece_number}`] = v.value;
  }
  const tools = {};
  for (const t of r.tools || []) {
    const dimId = String(t.dimension_id);
    if (!tools[dimId]) tools[dimId] = [];
    tools[dimId].push({
      toolId: String(t.tool_id),
      itNum: t.it_num,
      toolName: t.tool_name,
      toolType: t.tool_type
    });
  }
  const missingPieces = {};
  for (const m of r.missingPieces || []) {
    missingPieces[String(m.piece_number)] = {
      reason: m.reason,
      ncNum: m.nc_num,
      details: m.details
    };
  }
  const opNumber = opIdToNumber?.[String(r.operation_id)] || String(r.operation_id || "");
  const auditLog = (r.auditLog || []).map((a) => ({
    id: String(a.id),
    userId: a.user_id,
    userName: usersById?.[String(a.user_id)] || `User #${a.user_id}`,
    field: a.field,
    beforeValue: a.before_value,
    afterValue: a.after_value,
    reason: a.reason,
    timestamp: fmtTs(a.timestamp)
  }));
  return {
    id: String(r.id),
    jobNumber: r.job_id,
    partNumber: r.part_id,
    operation: opNumber,
    lot: r.lot,
    qty: r.qty,
    timestamp: fmtTs(r.timestamp),
    operator: usersById?.[String(r.operator_user_id)] || "",
    operatorUserId: r.operator_user_id,
    values,
    tools,
    missingPieces,
    oot: !!r.oot,
    status: r.status,
    comment: r.comment || "",
    auditLog
  };
}

export function getOperatorName(record, usersById) {
  if (!record) return "";
  if (record.operator) return record.operator;
  const id = record.operatorUserId ?? record.operator_user_id;
  return usersById?.[String(id)] || (id ? `User #${id}` : "");
}
