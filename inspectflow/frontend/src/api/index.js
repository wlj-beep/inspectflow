import { apiFetch, apiFetchText } from "./client.js";

export const api = {
  auth: {
    login: (payload) => apiFetch("/api/auth/login", { method: "POST", body: payload }),
    logout: () => apiFetch("/api/auth/logout", { method: "POST" }),
    me: () => apiFetch("/api/auth/me"),
    session: () => apiFetch("/api/auth/session"),
    profile: () => apiFetch("/api/auth/profile"),
    setPassword: (payload) => apiFetch("/api/auth/set-password", { method: "POST", body: payload }),
    entitlements: () => apiFetch("/api/auth/entitlements")
  },
  users: {
    list: (role) => apiFetch("/api/users", { role }),
    create: (payload, role) => apiFetch("/api/users", { method: "POST", body: payload, role }),
    update: (id, payload, role) => apiFetch(`/api/users/${id}`, { method: "PUT", body: payload, role }),
    remove: (id, role) => apiFetch(`/api/users/${id}`, { method: "DELETE", role })
  },
  tools: {
    list: (role) => apiFetch("/api/tools", { role }),
    create: (payload, role) => apiFetch("/api/tools", { method: "POST", body: payload, role }),
    update: (id, payload, role) => apiFetch(`/api/tools/${id}`, { method: "PUT", body: payload, role }),
    remove: (id, role) => apiFetch(`/api/tools/${id}`, { method: "DELETE", role })
  },
  toolLocations: {
    list: (role) => apiFetch("/api/tool-locations", { role }),
    create: (payload, role) => apiFetch("/api/tool-locations", { method: "POST", body: payload, role }),
    update: (id, payload, role) => apiFetch(`/api/tool-locations/${id}`, { method: "PUT", body: payload, role }),
    remove: (id, role) => apiFetch(`/api/tool-locations/${id}`, { method: "DELETE", role })
  },
  parts: {
    list: (role) => apiFetch("/api/parts", { role }),
    get: (id, role) => apiFetch(`/api/parts/${id}`, { role }),
    create: (payload, role) => apiFetch("/api/parts", { method: "POST", body: payload, role }),
    bulkUpdate: (payload, role) => apiFetch("/api/parts/bulk-update", { method: "POST", body: payload, role }),
    update: (id, payload, role) => apiFetch(`/api/parts/${id}`, { method: "PUT", body: payload, role }),
    remove: (id, role) => apiFetch(`/api/parts/${id}`, { method: "DELETE", role })
  },
  operations: {
    list: (partId, role) => apiFetch(`/api/operations${partId ? `?partId=${encodeURIComponent(partId)}` : ""}`, { role }),
    create: (payload, role) => apiFetch("/api/operations", { method: "POST", body: payload, role }),
    update: (id, payload, role) => apiFetch(`/api/operations/${id}`, { method: "PUT", body: payload, role }),
    remove: (id, role) => apiFetch(`/api/operations/${id}`, { method: "DELETE", role }),
    assignWorkCenter: (id, payload, role) => apiFetch(`/api/operations/${id}/work-center`, { method: "PUT", body: payload, role }),
    workCenterHistory: (id, role) => apiFetch(`/api/operations/${id}/work-center-history`, { role }),
    listWorkCenters: (role) => apiFetch("/api/operations/work-centers", { role }),
    createWorkCenter: (payload, role) => apiFetch("/api/operations/work-centers", { method: "POST", body: payload, role }),
    updateWorkCenter: (id, payload, role) => apiFetch(`/api/operations/work-centers/${id}`, { method: "PUT", body: payload, role }),
    removeWorkCenter: (id, payload, role) => apiFetch(`/api/operations/work-centers/${id}`, { method: "DELETE", body: payload, role }),
    workCenterAudit: (id, role) => apiFetch(`/api/operations/work-centers/${id}/history`, { role })
  },
  dimensions: {
    list: (operationId, role) => apiFetch(`/api/dimensions${operationId ? `?operationId=${encodeURIComponent(operationId)}` : ""}`, { role }),
    create: (payload, role) => apiFetch("/api/dimensions", { method: "POST", body: payload, role }),
    update: (id, payload, role) => apiFetch(`/api/dimensions/${id}`, { method: "PUT", body: payload, role }),
    remove: (id, role) => apiFetch(`/api/dimensions/${id}`, { method: "DELETE", role })
  },
  jobs: {
    list: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/jobs${qs ? `?${qs}` : ""}`, { role });
    },
    get: (id, role) => apiFetch(`/api/jobs/${id}`, { role }),
    create: (payload, role) => apiFetch("/api/jobs", { method: "POST", body: payload, role }),
    update: (id, payload, role) => apiFetch(`/api/jobs/${id}`, { method: "PUT", body: payload, role }),
    remove: (id, role) => apiFetch(`/api/jobs/${id}`, { method: "DELETE", role }),
    quantityAdjustments: (id, role) => apiFetch(`/api/jobs/${id}/quantity-adjustments`, { role }),
    adjustQuantity: (id, payload, role) => apiFetch(`/api/jobs/${id}/quantity-adjustments`, { method: "POST", body: payload, role }),
    lock: (id, userId, role) => apiFetch(`/api/jobs/${id}/lock`, { method: "POST", body: { userId }, role }),
    unlock: (id, userId, role) =>
      apiFetch(`/api/jobs/${id}/unlock`, {
        method: "POST",
        body: userId ? { userId } : undefined,
        role
      })
  },
  records: {
    list: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/records${qs ? `?${qs}` : ""}`, { role });
    },
    get: (id, role) => apiFetch(`/api/records/${id}`, { role }),
    submit: (payload, role) => apiFetch("/api/records", { method: "POST", body: payload, role }),
    upsertPieceComment: (id, payload, role) => apiFetch(`/api/records/${id}/piece-comment`, { method: "PUT", body: payload, role }),
    editValue: (id, payload, role) => apiFetch(`/api/records/${id}/value`, { method: "PUT", body: payload, role }),
    trace: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/records/trace${qs ? `?${qs}` : ""}`, { role });
    },
    exportCsv: (id, role) => apiFetchText(`/api/records/${id}/export`, { role }),
    exportAs9102: (id, profileId = "as9102-basic", role) => {
      const qs = new URLSearchParams(profileId ? { profile: profileId } : {}).toString();
      return apiFetch(`/api/records/${id}/export/as9102${qs ? `?${qs}` : ""}`, { role });
    }
  },
  roles: {
    list: (role) => apiFetch("/api/roles", { role }),
    update: (roleName, payload, role) => apiFetch(`/api/roles/${encodeURIComponent(roleName)}`, { method: "PUT", body: payload, role })
  },
  sessions: {
    start: (userId, role) => apiFetch("/api/sessions/start", { method: "POST", body: { userId }, role }),
    end: (userId, role) => apiFetch("/api/sessions/end", { method: "POST", body: { userId }, role })
  },
  issues: {
    list: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/issues${qs ? `?${qs}` : ""}`, { role });
    },
    create: (payload, role) => apiFetch("/api/issues", { method: "POST", body: payload, role }),
    complete: (id, payload, role) => apiFetch(`/api/issues/${id}/complete`, { method: "PUT", body: payload, role })
  },
  imports: {
    templates: (role) => apiFetch("/api/imports/templates", { role }),
    toolsCsv: (csvText, role) => apiFetch("/api/imports/tools/csv", { method: "POST", body: { csvText }, role }),
    partDimensionsCsv: (csvText, role) => apiFetch("/api/imports/part-dimensions/csv", { method: "POST", body: { csvText }, role }),
    jobsCsv: (csvText, role) => apiFetch("/api/imports/jobs/csv", { method: "POST", body: { csvText }, role }),
    previewErpJobsAdapter: (payload, role) => apiFetch("/api/imports/adapters/erp-jobs/preview", { method: "POST", body: payload, role }),
    measurementsBulk: (payload, role) => apiFetch("/api/imports/measurements/bulk", { method: "POST", body: payload, role }),
    jobMeasurementsCsv: (jobId, payload, role) => apiFetch(`/api/imports/jobs/${encodeURIComponent(jobId)}/measurements/csv`, { method: "POST", body: payload, role }),
    integrations: (role) => apiFetch("/api/imports/integrations", { role }),
    createIntegration: (payload, role) => apiFetch("/api/imports/integrations", { method: "POST", body: payload, role }),
    updateIntegration: (id, payload, role) => apiFetch(`/api/imports/integrations/${id}`, { method: "PUT", body: payload, role }),
    pullIntegration: (id, payload, role) => apiFetch(`/api/imports/integrations/${id}/pull`, { method: "POST", body: payload, role }),
    runs: (role, limit = 50) => apiFetch(`/api/imports/runs?limit=${encodeURIComponent(limit)}`, { role }),
    supportBundles: (role, limit = 25) => apiFetch(`/api/imports/support-bundles?limit=${encodeURIComponent(limit)}`, { role }),
    runSupportBundle: (id, role) => apiFetch(`/api/imports/runs/${encodeURIComponent(id)}/support-bundle`, { role }),
    unresolved: (role, filters = {}) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/imports/unresolved${qs ? `?${qs}` : ""}`, { role });
    },
    resolveUnresolved: (id, payload, role) => apiFetch(`/api/imports/unresolved/${id}/resolve`, { method: "POST", body: payload, role }),
    ignoreUnresolved: (id, payload, role) => apiFetch(`/api/imports/unresolved/${id}/ignore`, { method: "POST", body: payload, role })
  },
  analytics: {
    martStatus: (role) => apiFetch("/api/analytics/marts/status", { role }),
    rebuildMarts: (payload, role) => apiFetch("/api/analytics/marts/rebuild", { method: "POST", body: payload, role }),
    kpiDefinitions: (role) => apiFetch("/api/analytics/kpis/definitions", { role }),
    kpiDashboard: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/analytics/kpis/dashboard${qs ? `?${qs}` : ""}`, { role });
    },
    calibrationImpact: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/analytics/performance/calibration-impact${qs ? `?${qs}` : ""}`, { role });
    },
    refreshCalibrationImpact: (payload, role) => apiFetch("/api/analytics/performance/calibration-impact/refresh", { method: "POST", body: payload, role }),
    riskEvents: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/analytics/risk-events${qs ? `?${qs}` : ""}`, { role });
    },
    acknowledgeRiskEvent: (id, payload, role) => apiFetch(`/api/analytics/risk-events/${encodeURIComponent(id)}/acknowledge`, { method: "POST", body: payload, role }),
    escalateRiskEventToIssue: (id, payload, role) => apiFetch(`/api/analytics/risk-events/${encodeURIComponent(id)}/escalate-issue`, { method: "POST", body: payload, role }),
    resolveRiskEvent: (id, payload, role) => apiFetch(`/api/analytics/risk-events/${encodeURIComponent(id)}/resolve`, { method: "POST", body: payload, role })
  },
  proofCenter: {
    summary: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/proof-center/summary${qs ? `?${qs}` : ""}`, { role });
    },
    exportText: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetchText(`/api/proof-center/export${qs ? `?${qs}` : ""}`, { role });
    }
  },
  integration: {
    ecosystemCompatibility: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/integration/ecosystem/compatibility${qs ? `?${qs}` : ""}`, { role });
    }
  },
  technicalOps: {
    summary: (role) => apiFetch("/api/technical-ops/summary", { role }),
    lifecycleSummary: (role) => apiFetch("/api/technical-ops/lifecycle/summary", { role })
  }
};
