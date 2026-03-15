import { query } from "../../db.js";

export const PARTNER_CONNECTOR_CONTRACT_ID = "INT-CONNECTOR-v2";

const CONNECTOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const ALLOWED_SOURCE_TYPES = Object.freeze(["api_pull", "webhook", "excel_sheet"]);
export const ALLOWED_IMPORT_TYPES = Object.freeze(["tools", "part_dimensions", "jobs", "measurements"]);

function normalizeList(list) {
  if (!Array.isArray(list)) return [];
  const normalized = list
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function normalizeConnectorId(value) {
  return String(value || "").trim();
}

function buildFinding(code, message, meta = {}) {
  return { code, message, ...meta };
}

function normalizeManifest(input = {}) {
  const connectorId = normalizeConnectorId(input.connectorId || input.id);
  const displayName = String(input.displayName || input.name || connectorId || "Unnamed Connector").trim();
  const version = String(input.version || "0.0.1").trim();
  const sourceTypes = normalizeList(input.sourceTypes);
  const importTypes = normalizeList(input.importTypes);
  const sdkPluginId = String(input.sdkPluginId || "").trim() || null;

  return {
    connectorId,
    displayName,
    version,
    sourceTypes,
    importTypes,
    sdkPluginId,
    manifest: input
  };
}

async function evaluatePluginDependency(sdkPluginId) {
  if (!sdkPluginId) return { ok: true, findings: [] };

  const { rows } = await query(
    "SELECT plugin_id, enabled, policy_status FROM platform_extensions WHERE plugin_id=$1 LIMIT 1",
    [sdkPluginId]
  );

  if (!rows[0]) {
    return {
      ok: false,
      findings: [buildFinding("sdk_plugin_missing", "sdkPluginId not found", { sdkPluginId })]
    };
  }

  const row = rows[0];
  const findings = [];
  if (row.policy_status !== "allowed") {
    findings.push(buildFinding("sdk_plugin_blocked", "sdkPluginId policy_status is blocked", { sdkPluginId }));
  }
  if (row.enabled !== true) {
    findings.push(buildFinding("sdk_plugin_disabled", "sdkPluginId is not enabled", { sdkPluginId }));
  }

  return {
    ok: findings.length === 0,
    findings
  };
}

export async function validatePartnerConnectorManifest(input = {}) {
  const normalized = normalizeManifest(input);
  const findings = [];

  if (!normalized.connectorId) {
    findings.push(buildFinding("connector_id_required", "connectorId is required"));
  } else if (!CONNECTOR_ID_PATTERN.test(normalized.connectorId)) {
    findings.push(buildFinding("connector_id_invalid", "connectorId must be lowercase alphanumeric plus dashes"));
  }

  if (!normalized.displayName) {
    findings.push(buildFinding("display_name_required", "displayName is required"));
  }

  if (!normalized.version) {
    findings.push(buildFinding("version_required", "version is required"));
  }

  if (normalized.sourceTypes.length === 0) {
    findings.push(buildFinding("source_types_required", "sourceTypes must be provided"));
  }
  if (normalized.importTypes.length === 0) {
    findings.push(buildFinding("import_types_required", "importTypes must be provided"));
  }

  for (const sourceType of normalized.sourceTypes) {
    if (!ALLOWED_SOURCE_TYPES.includes(sourceType)) {
      findings.push(buildFinding("source_type_not_allowed", `sourceType not allowed: ${sourceType}`, { sourceType }));
    }
  }

  for (const importType of normalized.importTypes) {
    if (!ALLOWED_IMPORT_TYPES.includes(importType)) {
      findings.push(buildFinding("import_type_not_allowed", `importType not allowed: ${importType}`, { importType }));
    }
  }

  const pluginResult = await evaluatePluginDependency(normalized.sdkPluginId);
  if (!pluginResult.ok) {
    findings.push(...pluginResult.findings);
  }

  const validationStatus = findings.length === 0 ? "valid" : "invalid";

  return {
    contractId: PARTNER_CONNECTOR_CONTRACT_ID,
    validationStatus,
    findings,
    manifest: normalized
  };
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapRow(row) {
  return {
    connectorId: row.connector_id,
    displayName: row.display_name,
    version: row.version,
    sourceTypes: row.source_types_json || [],
    importTypes: row.import_types_json || [],
    sdkPluginId: row.sdk_plugin_id || null,
    manifest: row.manifest_json || {},
    validationStatus: row.validation_status,
    findings: row.validation_findings_json || [],
    updatedByUserId: row.updated_by_user_id == null ? null : Number(row.updated_by_user_id),
    updatedByRole: row.updated_by_role || null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export async function registerPartnerConnector({ manifest, actor }) {
  const validation = await validatePartnerConnectorManifest(manifest);
  if (validation.validationStatus !== "valid") {
    return {
      ...validation,
      statusCode: 400
    };
  }

  const normalized = validation.manifest;
  await query(
    `INSERT INTO partner_connector_kits
       (connector_id, display_name, version, source_types_json, import_types_json, sdk_plugin_id,
        manifest_json, validation_status, validation_findings_json, updated_by_user_id, updated_by_role)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8,$9::jsonb,$10,$11)
     ON CONFLICT (connector_id) DO UPDATE
       SET display_name=EXCLUDED.display_name,
           version=EXCLUDED.version,
           source_types_json=EXCLUDED.source_types_json,
           import_types_json=EXCLUDED.import_types_json,
           sdk_plugin_id=EXCLUDED.sdk_plugin_id,
           manifest_json=EXCLUDED.manifest_json,
           validation_status=EXCLUDED.validation_status,
           validation_findings_json=EXCLUDED.validation_findings_json,
           updated_by_user_id=EXCLUDED.updated_by_user_id,
           updated_by_role=EXCLUDED.updated_by_role,
           updated_at=NOW()`,
    [
      normalized.connectorId,
      normalized.displayName,
      normalized.version,
      JSON.stringify(normalized.sourceTypes),
      JSON.stringify(normalized.importTypes),
      normalized.sdkPluginId,
      JSON.stringify(normalized.manifest),
      validation.validationStatus,
      JSON.stringify(validation.findings),
      actor?.userId ?? null,
      actor?.role ?? null
    ]
  );

  return {
    contractId: PARTNER_CONNECTOR_CONTRACT_ID,
    validationStatus: validation.validationStatus,
    findings: validation.findings,
    connector: {
      connectorId: normalized.connectorId,
      displayName: normalized.displayName,
      version: normalized.version,
      sourceTypes: normalized.sourceTypes,
      importTypes: normalized.importTypes,
      sdkPluginId: normalized.sdkPluginId,
      manifest: normalized.manifest
    }
  };
}

export async function listPartnerConnectors() {
  const { rows } = await query(
    `SELECT connector_id, display_name, version, source_types_json, import_types_json, sdk_plugin_id,
            manifest_json, validation_status, validation_findings_json, updated_by_user_id,
            updated_by_role, created_at, updated_at
     FROM partner_connector_kits
     ORDER BY updated_at DESC, connector_id ASC`
  );

  return {
    contractId: PARTNER_CONNECTOR_CONTRACT_ID,
    count: rows.length,
    connectors: rows.map(mapRow)
  };
}

export function isConnectorIdValid(connectorId) {
  return CONNECTOR_ID_PATTERN.test(String(connectorId || ""));
}
