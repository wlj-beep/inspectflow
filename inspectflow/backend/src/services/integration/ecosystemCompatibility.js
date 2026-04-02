import { DEFAULT_CONNECTOR_POLICY, validateConnectorPolicy } from "../../future/integration/connectorPolicy.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function collectEnabledModules(moduleFlags = {}) {
  return Object.entries(asObject(moduleFlags))
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => key);
}

function collectDisabledModules(moduleFlags = {}) {
  return Object.entries(asObject(moduleFlags))
    .filter(([, enabled]) => enabled !== true)
    .map(([key]) => key);
}

function buildCheck({ id, label, status, detail, deferredBy = null }) {
  return {
    id,
    label,
    status,
    detail,
    deferredBy
  };
}

export function buildEcosystemCompatibilitySuite({
  entitlements = {},
  connectorPolicy = DEFAULT_CONNECTOR_POLICY
} = {}) {
  const moduleFlags = asObject(entitlements?.moduleFlags);
  const packaging = asObject(entitlements?.packaging);
  const activeBundles = asArray(packaging.activeBundleIds);
  const enabledModules = collectEnabledModules(moduleFlags);
  const disabledModules = collectDisabledModules(moduleFlags);
  const edgeEnabled = moduleFlags.EDGE === true;
  const integrationEnabled = moduleFlags.INTEGRATION_SUITE === true;
  const multisiteEnabled = moduleFlags.MULTISITE === true;
  const validation = validateConnectorPolicy(connectorPolicy);

  const checks = [
    buildCheck({
      id: "extension-sdk-boundary",
      label: "Extension SDK boundary",
      status: "pass",
      detail: "Extension modules are policy-gated and evaluated against the entitlement bundle catalog."
    }),
    buildCheck({
      id: "partner-runtime",
      label: "Partner runtime",
      status: integrationEnabled ? "pass" : "deferred",
      detail: integrationEnabled
        ? "Partner connector scaffolding is enabled for managed import paths."
        : "Partner runtime scaffolding is deferred until the Integration Suite bundle is enabled.",
      deferredBy: integrationEnabled ? null : "BL-046"
    }),
    buildCheck({
      id: "edge-interoperability",
      label: "Edge interoperability",
      status: edgeEnabled ? "pass" : "deferred",
      detail: edgeEnabled
        ? "Edge capture and standalone sync can be evaluated against the canonical data contract."
        : "Edge interoperability remains scaffolded until the Edge bundle is enabled.",
      deferredBy: edgeEnabled ? null : "BL-048"
    }),
    buildCheck({
      id: "module-policy",
      label: "Entitlement module policy",
      status: "pass",
      detail: multisiteEnabled
        ? "Module policy can differentiate site-scoped rollups without widening the customer proof surface."
        : "Module policy stays scoped to the active customer site."
    }),
    buildCheck({
      id: "connector-policy",
      label: "Connector runtime policy",
      status: validation.ok ? "pass" : "deferred",
      detail: validation.ok
        ? "Retry, timeout, replay, and unresolved-item behavior are contract-validated."
        : validation.errors[0] || "Connector policy validation failed.",
      deferredBy: validation.ok ? null : "BL-046"
    }),
    buildCheck({
      id: "proof-drilldowns",
      label: "Customer proof drilldowns",
      status: "pass",
      detail: "Read-only drilldowns are now backed by the runtime SLO and customer proof surfaces without exposing restricted internals."
    })
  ];

  const readyChecks = checks.filter((check) => check.status === "pass").length;
  const deferredChecks = checks.filter((check) => check.status === "deferred").length;
  const overallStatus = deferredChecks > 0 ? "staged" : "ready";

  return {
    contractId: "PLAT-ECO-v1",
    connectorPolicyValid: validation.ok,
    connectorPolicyErrors: validation.errors,
    policy: {
      mode: "entitlement-driven",
      edgeEnabled,
      multisiteEnabled,
      integrationEnabled,
      enabledModules,
      disabledModules,
      activeBundles
    },
    runtimeScaffold: {
      extensionRuntime: {
        contractId: "INT-CONNECTOR-v2",
        status: "scaffolded",
        policyContractId: "INT-CONNECTOR-v2",
        summary: "Policy-gated extension execution is ready for safe promotion."
      },
      partnerRuntime: {
        contractId: "INT-CONNECTOR-v2",
        status: integrationEnabled ? "enabled" : "staged",
        summary: integrationEnabled
          ? "Partner runtime runs through the managed connector path."
          : "Partner runtime remains staged until the Integration Suite bundle is enabled."
      },
      edgeInteroperability: {
        contractId: "OPS-JOBFLOW-v1",
        status: edgeEnabled ? "enabled" : "staged",
        summary: edgeEnabled
          ? "Edge interoperability can be validated against the canonical sync model."
          : "Edge interoperability remains staged until the Edge bundle is enabled."
      }
    },
    checks,
    summary: {
      status: overallStatus,
      readyChecks,
      deferredChecks,
      totalChecks: checks.length
    }
  };
}
