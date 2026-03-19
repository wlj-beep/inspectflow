import { query } from "../../db.js";
import { getPlatformEntitlements, isModuleEnabled } from "./entitlements.js";

export const EXTENSION_CONTRACT_ID = "PLAT-DEPLOY-v1";
export const SDK_CONTRACT_ID = "EDGE-SDK-v1";

const PLUGIN_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const DEFAULT_ALLOWED_HOOKS = Object.freeze([
  "technical_ops.summary",
  "analytics.performance.slo",
  "integration.run.completed"
]);

const DEFAULT_ALLOWED_CAPABILITIES = Object.freeze([
  "read_technical_ops_summary",
  "read_analytics_slo",
  "read_integration_runs"
]);

const DEFAULT_MAX_HOOKS = 8;
const DEFAULT_MAX_CAPABILITIES = 8;

function toPositiveInt(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeList(list) {
  if (!Array.isArray(list)) return [];
  const normalized = list
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function parseCsvList(value, fallback) {
  const raw = String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return raw.length > 0 ? Array.from(new Set(raw)) : [...fallback];
}

function isRuntimeEnabled() {
  if (process.env.EXT_RUNTIME_ENABLED === "false") return false;
  return true;
}

function normalizePluginId(value) {
  return String(value || "").trim();
}

function normalizePluginManifest(input = {}) {
  const pluginId = normalizePluginId(input.pluginId || input.id);
  const displayName = String(input.displayName || input.name || pluginId || "Unnamed Extension").trim();
  const version = String(input.version || "0.0.1").trim();
  const sdkVersion = String(input.sdkVersion || SDK_CONTRACT_ID).trim() || SDK_CONTRACT_ID;
  const hooks = normalizeList(input.hooks || input.requestedHooks);
  const capabilities = normalizeList(input.capabilities || input.requestedCapabilities);
  const requiredModule = String(input.requiredModule || "EDGE").trim().toUpperCase() || "EDGE";

  return {
    pluginId,
    displayName,
    version,
    sdkVersion,
    hooks,
    capabilities,
    requiredModule,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  };
}

function buildFinding(code, message, meta = {}) {
  return { code, message, ...meta };
}

function getAllowedHooks() {
  return parseCsvList(process.env.EXT_SDK_ALLOWED_HOOKS, DEFAULT_ALLOWED_HOOKS);
}

function getAllowedCapabilities() {
  return parseCsvList(process.env.EXT_SDK_ALLOWED_CAPABILITIES, DEFAULT_ALLOWED_CAPABILITIES);
}

function evaluatePolicy({
  pluginId,
  hooks,
  capabilities,
  moduleEnabled,
  requiredModule,
  runtimeEnabled,
  maxHooks,
  maxCapabilities,
  allowedHooks,
  allowedCapabilities
}) {
  const findings = [];

  if (!PLUGIN_ID_PATTERN.test(pluginId)) {
    findings.push(buildFinding("plugin_id_invalid", "pluginId must be lowercase alphanumeric plus dashes"));
  }

  if (hooks.length > maxHooks) {
    findings.push(buildFinding("hook_limit_exceeded", `hooks exceed max limit of ${maxHooks}`));
  }

  for (const hook of hooks) {
    if (!allowedHooks.includes(hook)) {
      findings.push(buildFinding("hook_not_allowed", `hook not allowed: ${hook}`, { hook }));
    }
  }

  if (capabilities.length > maxCapabilities) {
    findings.push(buildFinding("capability_limit_exceeded", `capabilities exceed max limit of ${maxCapabilities}`));
  }

  for (const capability of capabilities) {
    if (!allowedCapabilities.includes(capability)) {
      findings.push(buildFinding("capability_not_allowed", `capability not allowed: ${capability}`, { capability }));
    }
  }

  if (!runtimeEnabled) {
    findings.push(buildFinding("runtime_disabled", "Extension runtime is disabled"));
  }

  if (!moduleEnabled) {
    findings.push(buildFinding("module_disabled", `${requiredModule} module is disabled`, {
      module: requiredModule
    }));
  }

  return {
    policyStatus: findings.length === 0 ? "allowed" : "blocked",
    policyFindings: findings
  };
}

function getMaxLimits() {
  return {
    hooks: toPositiveInt(process.env.EXT_SDK_MAX_HOOKS, DEFAULT_MAX_HOOKS),
    capabilities: toPositiveInt(process.env.EXT_SDK_MAX_CAPABILITIES, DEFAULT_MAX_CAPABILITIES)
  };
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapPluginRow(row) {
  return {
    pluginId: row.plugin_id,
    displayName: row.display_name,
    version: row.version,
    sdkVersion: row.sdk_version,
    manifest: row.manifest_json || {},
    policyStatus: row.policy_status,
    policyFindings: row.policy_findings_json || [],
    enabled: row.enabled === true,
    requiredModule: row.required_module,
    updatedByUserId: row.updated_by_user_id == null ? null : Number(row.updated_by_user_id),
    updatedByRole: row.updated_by_role || null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export function getRuntimeBoundary() {
  const allowedHooks = getAllowedHooks();
  const allowedCapabilities = getAllowedCapabilities();
  const maxLimits = getMaxLimits();
  return {
    contractId: EXTENSION_CONTRACT_ID,
    sdkContractId: SDK_CONTRACT_ID,
    runtimeEnabled: isRuntimeEnabled(),
    sdkBoundary: {
      allowedHooks,
      allowedCapabilities,
      maxLimits
    }
  };
}

export async function listRegisteredPlugins() {
  const { rows } = await query(
    `SELECT plugin_id, display_name, version, sdk_version, manifest_json, policy_status,
            policy_findings_json, enabled, required_module, updated_by_user_id,
            updated_by_role, created_at, updated_at
     FROM platform_extensions
     ORDER BY updated_at DESC, plugin_id ASC`
  );

  return {
    contractId: EXTENSION_CONTRACT_ID,
    sdkContractId: SDK_CONTRACT_ID,
    plugins: rows.map(mapPluginRow)
  };
}

export async function registerPluginManifest({ manifest, actor }) {
  const runtimeEnabled = isRuntimeEnabled();
  const entitlements = await getPlatformEntitlements();
  const normalized = normalizePluginManifest(manifest);
  const requiredModule = normalized.requiredModule || "EDGE";
  const moduleEnabled = isModuleEnabled(entitlements, requiredModule);
  const allowedHooks = getAllowedHooks();
  const allowedCapabilities = getAllowedCapabilities();
  const maxLimits = getMaxLimits();

  const { policyStatus, policyFindings } = evaluatePolicy({
    pluginId: normalized.pluginId,
    hooks: normalized.hooks,
    capabilities: normalized.capabilities,
    moduleEnabled,
    requiredModule,
    runtimeEnabled,
    maxHooks: maxLimits.hooks,
    maxCapabilities: maxLimits.capabilities,
    allowedHooks,
    allowedCapabilities
  });

  const existing = await query(
    "SELECT enabled FROM platform_extensions WHERE plugin_id=$1",
    [normalized.pluginId]
  );
  const wasEnabled = existing.rows[0]?.enabled === true;
  const nextEnabled = wasEnabled && policyStatus === "allowed";

  const payload = {
    plugin_id: normalized.pluginId,
    display_name: normalized.displayName,
    version: normalized.version,
    sdk_version: normalized.sdkVersion,
    manifest_json: normalized,
    policy_status: policyStatus,
    policy_findings_json: policyFindings,
    enabled: nextEnabled,
    required_module: normalized.requiredModule,
    updated_by_user_id: actor?.userId ?? null,
    updated_by_role: actor?.role ?? null
  };

  await query(
    `INSERT INTO platform_extensions
       (plugin_id, display_name, version, sdk_version, manifest_json, policy_status,
        policy_findings_json, enabled, required_module, updated_by_user_id, updated_by_role)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (plugin_id) DO UPDATE
       SET display_name=EXCLUDED.display_name,
           version=EXCLUDED.version,
           sdk_version=EXCLUDED.sdk_version,
           manifest_json=EXCLUDED.manifest_json,
           policy_status=EXCLUDED.policy_status,
           policy_findings_json=EXCLUDED.policy_findings_json,
           enabled=EXCLUDED.enabled,
           required_module=EXCLUDED.required_module,
           updated_by_user_id=EXCLUDED.updated_by_user_id,
           updated_by_role=EXCLUDED.updated_by_role,
           updated_at=NOW()`
    ,
    [
      payload.plugin_id,
      payload.display_name,
      payload.version,
      payload.sdk_version,
      JSON.stringify(payload.manifest_json),
      payload.policy_status,
      JSON.stringify(payload.policy_findings_json),
      payload.enabled,
      payload.required_module,
      payload.updated_by_user_id,
      payload.updated_by_role
    ]
  );

  return {
    contractId: EXTENSION_CONTRACT_ID,
    sdkContractId: SDK_CONTRACT_ID,
    plugin: {
      pluginId: normalized.pluginId,
      displayName: normalized.displayName,
      version: normalized.version,
      sdkVersion: normalized.sdkVersion,
      manifest: normalized,
      policyStatus,
      policyFindings,
      enabled: nextEnabled,
      requiredModule: normalized.requiredModule
    }
  };
}

export async function enablePlugin({ pluginId, actor }) {
  if (!isRuntimeEnabled()) {
    return { error: "runtime_disabled" };
  }

  const entitlements = await getPlatformEntitlements();

  const { rows } = await query(
    `SELECT plugin_id, display_name, version, sdk_version, manifest_json, policy_status,
            policy_findings_json, enabled, required_module, updated_by_user_id,
            updated_by_role, created_at, updated_at
     FROM platform_extensions
     WHERE plugin_id=$1`,
    [pluginId]
  );

  const row = rows[0];
  if (!row) return { error: "not_found" };
  if (row.policy_status !== "allowed") {
    return { error: "policy_blocked" };
  }
  if (!isModuleEnabled(entitlements, row.required_module || "EDGE")) {
    return { error: "module_disabled" };
  }

  const { rows: updatedRows } = await query(
    `UPDATE platform_extensions
     SET enabled=true,
         updated_by_user_id=$2,
         updated_by_role=$3,
         updated_at=NOW()
     WHERE plugin_id=$1
     RETURNING plugin_id, display_name, version, sdk_version, manifest_json, policy_status,
               policy_findings_json, enabled, required_module, updated_by_user_id,
               updated_by_role, created_at, updated_at`,
    [pluginId, actor?.userId ?? null, actor?.role ?? null]
  );

  return {
    contractId: EXTENSION_CONTRACT_ID,
    sdkContractId: SDK_CONTRACT_ID,
    plugin: mapPluginRow(updatedRows[0])
  };
}

export function isPluginIdValid(pluginId) {
  return PLUGIN_ID_PATTERN.test(pluginId);
}
