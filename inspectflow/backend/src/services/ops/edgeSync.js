import { query } from "../../db.js";
import { getPlatformEntitlements, isModuleEnabled } from "../platform/entitlements.js";

export const EDGE_SYNC_CONTRACT_ID = "EDGE-SYNC-v1";
export const EDGE_SYNC_REQUIRED_CONTRACTS = Object.freeze([
  "OPS-JOBFLOW-v1",
  "OPS-ROUTING-v1",
  "QUAL-TRACE-v1"
]);

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function isEdgeModuleEnabled() {
  const entitlements = await getPlatformEntitlements();
  return isModuleEnabled(entitlements, "EDGE");
}

export function getEdgeSyncContracts() {
  return {
    contractId: EDGE_SYNC_CONTRACT_ID,
    requiredContracts: EDGE_SYNC_REQUIRED_CONTRACTS
  };
}

export async function getEdgeSyncSnapshot() {
  const [partsRes, opsRes, jobsRes, toolsRes] = await Promise.all([
    query("SELECT id, description FROM parts ORDER BY id ASC"),
    query(
      `SELECT id, part_id, op_number, label, work_center_id
       FROM operations
       ORDER BY part_id ASC, op_number ASC, id ASC`
    ),
    query(
      `SELECT id, part_id, part_revision_code, operation_id, lot, qty, status
       FROM jobs
       ORDER BY id ASC`
    ),
    query(
      `SELECT id, name, type, it_num, size, active, visible, calibration_due_date,
              current_location_id, home_location_id
       FROM tools
       ORDER BY id ASC`
    )
  ]);

  return {
    contractId: EDGE_SYNC_CONTRACT_ID,
    generatedAt: new Date().toISOString(),
    datasets: {
      parts: partsRes.rows.map((row) => ({
        id: row.id,
        description: row.description
      })),
      operations: opsRes.rows.map((row) => ({
        id: Number(row.id),
        partId: row.part_id,
        opNumber: row.op_number,
        label: row.label,
        workCenterId: row.work_center_id == null ? null : Number(row.work_center_id)
      })),
      jobs: jobsRes.rows.map((row) => ({
        id: row.id,
        partId: row.part_id,
        partRevisionCode: row.part_revision_code,
        operationId: Number(row.operation_id),
        lot: row.lot,
        qty: Number(row.qty),
        status: row.status
      })),
      tools: toolsRes.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        type: row.type,
        itNum: row.it_num,
        size: row.size,
        active: row.active === true,
        visible: row.visible === true,
        calibrationDueDate: toIso(row.calibration_due_date),
        currentLocationId: row.current_location_id == null ? null : Number(row.current_location_id),
        homeLocationId: row.home_location_id == null ? null : Number(row.home_location_id)
      }))
    }
  };
}

function buildFinding(code, message, meta = {}) {
  return { code, message, ...meta };
}

function requireDatasetArray(datasets, key, findings) {
  const data = datasets?.[key];
  if (!Array.isArray(data)) {
    findings.push(buildFinding("dataset_missing", `${key} dataset is required`, { dataset: key }));
    return [];
  }
  return data;
}

function requireFields(items, requiredFields, datasetKey, findings) {
  items.forEach((item, index) => {
    requiredFields.forEach((field) => {
      const value = item?.[field];
      if (value === undefined || value === null || value === "") {
        findings.push(
          buildFinding("missing_field", `${datasetKey}.${field} is required`, {
            dataset: datasetKey,
            index,
            field
          })
        );
      }
    });
  });
}

export function validateEdgeSyncPayload(payload = {}) {
  const datasets = payload.datasets || payload;
  const findings = [];
  const contractId = String(payload.contractId || "").trim();
  if (contractId && contractId !== EDGE_SYNC_CONTRACT_ID) {
    findings.push(buildFinding("contract_id_mismatch", "contractId must match EDGE-SYNC-v1"));
  }

  const parts = requireDatasetArray(datasets, "parts", findings);
  const operations = requireDatasetArray(datasets, "operations", findings);
  const jobs = requireDatasetArray(datasets, "jobs", findings);
  const tools = requireDatasetArray(datasets, "tools", findings);

  requireFields(parts, ["id", "description"], "parts", findings);
  requireFields(operations, ["id", "partId", "opNumber", "label"], "operations", findings);
  requireFields(jobs, ["id", "partId", "operationId", "lot", "qty", "status"], "jobs", findings);
  requireFields(tools, ["id", "name", "type", "itNum"], "tools", findings);

  return {
    contractId: EDGE_SYNC_CONTRACT_ID,
    validationStatus: findings.length === 0 ? "valid" : "invalid",
    findings
  };
}

function summarizePayload(payload = {}) {
  const datasets = payload.datasets || payload;
  const listCount = (key) => (Array.isArray(datasets?.[key]) ? datasets[key].length : 0);
  return {
    datasets: {
      parts: listCount("parts"),
      operations: listCount("operations"),
      jobs: listCount("jobs"),
      tools: listCount("tools")
    }
  };
}

export async function persistEdgeSyncRun({
  payload,
  direction = "payload_validate",
  validationStatus,
  findings,
  actor
}) {
  const { rows } = await query(
    `INSERT INTO edge_sync_runs
       (contract_id, direction, validation_status, payload_summary, findings_json, actor_user_id, actor_role)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)
     RETURNING id`,
    [
      EDGE_SYNC_CONTRACT_ID,
      direction,
      validationStatus,
      JSON.stringify(summarizePayload(payload || {})),
      JSON.stringify(findings || []),
      actor?.userId ?? null,
      actor?.role ?? null
    ]
  );

  return Number(rows[0]?.id || 0) || null;
}
