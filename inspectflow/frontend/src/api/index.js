import { apiFetch, apiFetchText, apiFetchVariants, apiFetchVariantsText } from "./client.js";

export const api = {
  auth: {
    users: () => apiFetch("/api/auth/users"),
    login: (payload) => apiFetch("/api/auth/login", { method: "POST", body: payload }),
    logout: () => apiFetch("/api/auth/logout", { method: "POST" }),
    me: () => apiFetch("/api/auth/me"),
    session: () => apiFetch("/api/auth/session"),
    seats: () => apiFetch("/api/auth/seats"),
    entitlements: () => apiFetch("/api/auth/entitlements"),
    updateEntitlements: (payload) => apiFetch("/api/auth/entitlements", { method: "PUT", body: payload }),
    modulePolicyProfiles: () => apiFetch("/api/auth/module-policy/profiles"),
    evaluateModulePolicy: (payload) => apiFetch("/api/auth/module-policy/evaluate", { method: "POST", body: payload }),
    setPassword: (payload) => apiFetch("/api/auth/set-password", { method: "POST", body: payload })
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
    remove: (id, role) => apiFetch(`/api/dimensions/${id}`, { method: "DELETE", role }),
    characteristicAudit: (id, role, limit = 50) =>
      apiFetch(`/api/dimensions/${encodeURIComponent(id)}/characteristic-audit?limit=${encodeURIComponent(limit)}`, { role })
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
  instructions: {
    listByOperation: (operationId, role) =>
      apiFetch(`/api/operations/${encodeURIComponent(operationId)}/instructions`, { role }),
    createVersion: (operationId, payload, role) =>
      apiFetch(`/api/operations/${encodeURIComponent(operationId)}/instructions/versions`, { method: "POST", body: payload, role }),
    publishVersion: (operationId, versionId, payload, role) =>
      apiFetch(
        `/api/operations/${encodeURIComponent(operationId)}/instructions/versions/${encodeURIComponent(versionId)}/publish`,
        { method: "POST", body: payload, role }
      ),
    activeForJob: (jobId, role) => apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/instructions/active`, { role }),
    acknowledgeActive: (jobId, payload, role) =>
      apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/instructions/acknowledgments`, { method: "POST", body: payload, role })
  },
  fai: {
    loadPackage: (payload, role) =>
      apiFetchVariants([
        { path: "/api/quality/fai-packages/load", method: "POST", body: payload, role },
        { path: "/api/quality/fai-packages", method: "POST", body: payload, role },
        { path: "/api/quality/fai/packages/load", method: "POST", body: payload, role },
        { path: "/api/fai/packages/load", method: "POST", body: payload, role },
        { path: "/api/quality/fai/packages", method: "POST", body: payload, role },
        { path: "/api/fai/packages", method: "POST", body: payload, role }
      ]),
    getPackage: (id, role) =>
      apiFetchVariants([
        { path: `/api/quality/fai-packages/${encodeURIComponent(id)}`, role },
        { path: `/api/quality/fai/packages/${encodeURIComponent(id)}`, role },
        { path: `/api/fai/packages/${encodeURIComponent(id)}`, role }
      ], { role }),
    signOffCharacteristic: (packageId, characteristicId, payload, role) =>
      apiFetchVariants([
        {
          path: `/api/quality/fai-packages/${encodeURIComponent(packageId)}/signoffs`,
          method: "POST",
          body: { ...payload, dimensionId: characteristicId },
          role
        },
        {
          path: `/api/quality/fai/packages/${encodeURIComponent(packageId)}/characteristics/${encodeURIComponent(characteristicId)}/sign-off`,
          method: "POST",
          body: payload,
          role
        },
        {
          path: `/api/fai/packages/${encodeURIComponent(packageId)}/characteristics/${encodeURIComponent(characteristicId)}/sign-off`,
          method: "POST",
          body: payload,
          role
        },
        {
          path: `/api/quality/fai/packages/${encodeURIComponent(packageId)}/characteristics/${encodeURIComponent(characteristicId)}/signoff`,
          method: "PUT",
          body: payload,
          role
        },
        {
          path: `/api/fai/packages/${encodeURIComponent(packageId)}/characteristics/${encodeURIComponent(characteristicId)}/signoff`,
          method: "PUT",
          body: payload,
          role
        }
      ]),
    finalizePackage: (packageId, payload, role) =>
      apiFetchVariants([
        {
          path: `/api/quality/fai-packages/${encodeURIComponent(packageId)}/finalize`,
          method: "POST",
          body: payload,
          role
        },
        {
          path: `/api/quality/fai/packages/${encodeURIComponent(packageId)}/finalize`,
          method: "POST",
          body: payload,
          role
        },
        {
          path: `/api/fai/packages/${encodeURIComponent(packageId)}/finalize`,
          method: "POST",
          body: payload,
          role
        },
        {
          path: `/api/quality/fai/packages/${encodeURIComponent(packageId)}/complete`,
          method: "POST",
          body: payload,
          role
        },
        {
          path: `/api/fai/packages/${encodeURIComponent(packageId)}/complete`,
          method: "POST",
          body: payload,
          role
        }
      ]),
    exportPackage: (packageId, role) =>
      apiFetchVariantsText([
        { path: `/api/quality/fai/packages/${encodeURIComponent(packageId)}/export`, role },
        { path: `/api/fai/packages/${encodeURIComponent(packageId)}/export`, role }
      ], { role })
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
    attachments: {
      list: (id, role, includeData = false) =>
        apiFetch(`/api/records/${id}/attachments${includeData ? "?includeData=true" : ""}`, { role }),
      get: (id, attachmentId, role) => apiFetch(`/api/records/${id}/attachments/${attachmentId}`, { role }),
      upload: (id, payload, role) => apiFetch(`/api/records/${id}/attachments`, { method: "POST", body: payload, role }),
      updateRetention: (id, attachmentId, payload, role) =>
        apiFetch(`/api/records/${id}/attachments/${attachmentId}/retention`, { method: "PUT", body: payload, role })
    },
    trace: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/records/trace${qs ? `?${qs}` : ""}`, { role });
    },
    exportCsv: (id, role) => apiFetchText(`/api/records/${id}/export`, { role })
  },
  audit: {
    list: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/audit${qs ? `?${qs}` : ""}`, { role });
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
  ncr: {
    list: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/ncr${qs ? `?${qs}` : ""}`, { role });
    },
    dispositions: (role) => apiFetch("/api/ncr/dispositions", { role }),
    get: (id, role) => apiFetch(`/api/ncr/${encodeURIComponent(id)}`, { role }),
    create: (payload, role) => apiFetch("/api/ncr", { method: "POST", body: payload, role }),
    markPendingDisposition: (id, role) => apiFetch(`/api/ncr/${encodeURIComponent(id)}/pending-disposition`, { method: "POST", role }),
    setDisposition: (id, payload, role) => apiFetch(`/api/ncr/${encodeURIComponent(id)}/disposition`, { method: "POST", body: payload, role }),
    close: (id, role) => apiFetch(`/api/ncr/${encodeURIComponent(id)}/close`, { method: "POST", role }),
    void: (id, payload, role) => apiFetch(`/api/ncr/${encodeURIComponent(id)}/void`, { method: "POST", body: payload, role })
  },
  capa: {
    list: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/capa${qs ? `?${qs}` : ""}`, { role });
    },
    statusOptions: (role) => apiFetch("/api/capa/status-options", { role }),
    get: (id, role) => apiFetch(`/api/capa/${encodeURIComponent(id)}`, { role }),
    create: (payload, role) => apiFetch("/api/capa", { method: "POST", body: payload, role }),
    setStatus: (id, payload, role) => apiFetch(`/api/capa/${encodeURIComponent(id)}/status`, { method: "POST", body: payload, role }),
    setEffectiveness: (id, payload, role) => apiFetch(`/api/capa/${encodeURIComponent(id)}/effectiveness`, { method: "POST", body: payload, role }),
    addAction: (id, payload, role) => apiFetch(`/api/capa/${encodeURIComponent(id)}/actions`, { method: "POST", body: payload, role }),
    setActionStatus: (id, actionId, payload, role) =>
      apiFetch(`/api/capa/${encodeURIComponent(id)}/actions/${encodeURIComponent(actionId)}/status`, { method: "POST", body: payload, role })
  },
  qms: {
    documents: {
      list: (role) => apiFetch("/api/qms/documents", { role }),
      create: (payload, role) => apiFetch("/api/qms/documents", { method: "POST", body: payload, role }),
      addRevision: (id, payload, role) => apiFetch(`/api/qms/documents/${encodeURIComponent(id)}/revisions`, { method: "POST", body: payload, role }),
      approve: (id, payload, role) => apiFetch(`/api/qms/documents/${encodeURIComponent(id)}/approve`, { method: "POST", body: payload, role }),
      addLink: (id, payload, role) => apiFetch(`/api/qms/documents/${encodeURIComponent(id)}/links`, { method: "POST", body: payload, role })
    },
    suppliers: {
      list: (role) => apiFetch("/api/qms/suppliers", { role }),
      create: (payload, role) => apiFetch("/api/qms/suppliers", { method: "POST", body: payload, role }),
      addItem: (supplierId, payload, role) =>
        apiFetch(`/api/qms/suppliers/${encodeURIComponent(supplierId)}/items`, { method: "POST", body: payload, role }),
      addInspection: (supplierId, payload, role) =>
        apiFetch(`/api/qms/suppliers/${encodeURIComponent(supplierId)}/inspections`, { method: "POST", body: payload, role }),
      scorecard: (supplierId, role) => apiFetch(`/api/qms/suppliers/${encodeURIComponent(supplierId)}/scorecard`, { role })
    },
    internalAudits: {
      listPrograms: (role) => apiFetch("/api/qms/internal-audits/programs", { role }),
      createProgram: (payload, role) => apiFetch("/api/qms/internal-audits/programs", { method: "POST", body: payload, role }),
      createSchedule: (payload, role) => apiFetch("/api/qms/internal-audits/schedules", { method: "POST", body: payload, role }),
      addChecklist: (scheduleId, payload, role) =>
        apiFetch(`/api/qms/internal-audits/schedules/${encodeURIComponent(scheduleId)}/checklist`, { method: "POST", body: payload, role }),
      addFinding: (scheduleId, payload, role) =>
        apiFetch(`/api/qms/internal-audits/schedules/${encodeURIComponent(scheduleId)}/findings`, { method: "POST", body: payload, role }),
      generateReport: (scheduleId, role) =>
        apiFetch(`/api/qms/internal-audits/schedules/${encodeURIComponent(scheduleId)}/report`, { method: "POST", role })
    },
    training: {
      listCourses: (role) => apiFetch("/api/qms/training/courses", { role }),
      createCourse: (payload, role) => apiFetch("/api/qms/training/courses", { method: "POST", body: payload, role }),
      addRecord: (payload, role) => apiFetch("/api/qms/training/records", { method: "POST", body: payload, role }),
      addRequirement: (payload, role) => apiFetch("/api/qms/training/requirements", { method: "POST", body: payload, role }),
      matrix: (operationId, role) => apiFetch(`/api/qms/training/matrix?operationId=${encodeURIComponent(operationId)}`, { role })
    },
    coc: {
      list: (role) => apiFetch("/api/qms/coc", { role }),
      create: (payload, role) => apiFetch("/api/qms/coc", { method: "POST", body: payload, role }),
      void: (id, payload, role) => apiFetch(`/api/qms/coc/${encodeURIComponent(id)}/void`, { method: "POST", body: payload, role })
    }
  },
  calibration: {
    schedules: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/calibration/schedules${qs ? `?${qs}` : ""}`, { role });
    },
    upsertSchedule: (payload, role) => apiFetch("/api/calibration/schedules", { method: "POST", body: payload, role }),
    events: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/calibration/events${qs ? `?${qs}` : ""}`, { role });
    },
    createEvent: (payload, role) => apiFetch("/api/calibration/events", { method: "POST", body: payload, role }),
    overdueSummary: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/calibration/overdue-summary${qs ? `?${qs}` : ""}`, { role });
    },
    recallImpact: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/calibration/failed-tool-recall-impact${qs ? `?${qs}` : ""}`, { role });
    }
  },
  reportTemplates: {
    contracts: (role) => apiFetch("/api/report-templates/contracts", { role }),
    list: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/report-templates${qs ? `?${qs}` : ""}`, { role });
    },
    create: (payload, role) => apiFetch("/api/report-templates", { method: "POST", body: payload, role }),
    get: (id, role) => apiFetch(`/api/report-templates/${encodeURIComponent(id)}`, { role }),
    update: (id, payload, role) => apiFetch(`/api/report-templates/${encodeURIComponent(id)}`, { method: "PUT", body: payload, role }),
    preview: (payload, role) => apiFetch("/api/report-templates/preview", { method: "POST", body: payload, role }),
    previewById: (id, payload, role) => apiFetch(`/api/report-templates/${encodeURIComponent(id)}/preview`, { method: "POST", body: payload, role })
  },
  msa: {
    listStudies: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/quality/msa/studies${qs ? `?${qs}` : ""}`, { role });
    },
    createStudy: (payload, role) => apiFetch("/api/quality/msa/studies", { method: "POST", body: payload, role }),
    getStudy: (id, role) => apiFetch(`/api/quality/msa/studies/${encodeURIComponent(id)}`, { role }),
    addObservations: (id, payload, role) => apiFetch(`/api/quality/msa/studies/${encodeURIComponent(id)}/observations`, { method: "POST", body: payload, role }),
    summary: (id, role) => apiFetch(`/api/quality/msa/studies/${encodeURIComponent(id)}/summary`, { role })
  },
  ppap: {
    listPackages: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/quality/ppap/ppap-packages${qs ? `?${qs}` : ""}`, { role });
    },
    createPackage: (payload, role) => apiFetch("/api/quality/ppap/ppap-packages", { method: "POST", body: payload, role }),
    getPackage: (id, role, includeAttachmentData = false) =>
      apiFetch(`/api/quality/ppap/ppap-packages/${encodeURIComponent(id)}${includeAttachmentData ? "?includeAttachmentData=true" : ""}`, { role }),
    updatePackage: (id, payload, role) => apiFetch(`/api/quality/ppap/ppap-packages/${encodeURIComponent(id)}`, { method: "PATCH", body: payload, role }),
    reviewPackage: (id, role) => apiFetch(`/api/quality/ppap/ppap-packages/${encodeURIComponent(id)}/review`, { method: "POST", role }),
    updateElement: (id, elementCode, payload, role) =>
      apiFetch(`/api/quality/ppap/ppap-packages/${encodeURIComponent(id)}/elements/${encodeURIComponent(elementCode)}`, { method: "PUT", body: payload, role }),
    submitPackage: (id, role) => apiFetch(`/api/quality/ppap/ppap-packages/${encodeURIComponent(id)}/submit`, { method: "POST", role }),
    recordCustomerApproval: (id, payload, role) =>
      apiFetch(`/api/quality/ppap/ppap-packages/${encodeURIComponent(id)}/customer-approvals`, { method: "POST", body: payload, role }),
    psw: (id, role, includeAttachmentData = false) =>
      apiFetch(`/api/quality/ppap/ppap-packages/${encodeURIComponent(id)}/psw${includeAttachmentData ? "?includeAttachmentData=true" : ""}`, { role }),
    summary: (id, role, includeAttachmentData = false) =>
      apiFetch(`/api/quality/ppap/ppap-packages/${encodeURIComponent(id)}/summary${includeAttachmentData ? "?includeAttachmentData=true" : ""}`, { role })
  },
  search: {
    global: (query, role, limit = 20) => {
      const qs = new URLSearchParams({
        q: String(query || "").trim(),
        limit: String(limit)
      }).toString();
      return apiFetch(`/api/search/global?${qs}`, { role });
    }
  },
  imports: {
    templates: (role) => apiFetch("/api/imports/templates", { role }),
    toolsCsv: (csvText, role) => apiFetch("/api/imports/tools/csv", { method: "POST", body: { csvText }, role }),
    partDimensionsCsv: (csvText, role) => apiFetch("/api/imports/part-dimensions/csv", { method: "POST", body: { csvText }, role }),
    jobsCsv: (csvText, role) => apiFetch("/api/imports/jobs/csv", { method: "POST", body: { csvText }, role }),
    previewErpJobsAdapter: (payload, role) => apiFetch("/api/imports/adapters/erp-jobs/preview", { method: "POST", body: payload, role }),
    metrologyParserPacks: (role) => apiFetch("/api/imports/parsers/metrology/packs", { role }),
    previewMetrologyParser: (payload, role) => apiFetch("/api/imports/parsers/metrology/preview", { method: "POST", body: payload, role }),
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
    workforcePerformance: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/analytics/performance/workforce${qs ? `?${qs}` : ""}`, { role });
    },
    spcAnalysis: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/analytics/performance/spc${qs ? `?${qs}` : ""}`, { role });
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
  formBuilder: {
    contracts: (role) => apiFetch("/api/form-builder/contracts", { role }),
    listTemplates: (status, role) => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      return apiFetch(`/api/form-builder/forms${qs}`, { role });
    },
    createTemplate: (payload, role) => apiFetch("/api/form-builder/forms", { method: "POST", body: payload, role }),
    getTemplate: (id, role) => apiFetch(`/api/form-builder/forms/${encodeURIComponent(id)}`, { role }),
    updateTemplate: (id, payload, role) => apiFetch(`/api/form-builder/forms/${encodeURIComponent(id)}`, { method: "PUT", body: payload, role }),
    publishTemplate: (id, role) => apiFetch(`/api/form-builder/forms/${encodeURIComponent(id)}/publish`, { method: "POST", role }),
    archiveTemplate: (id, role) => apiFetch(`/api/form-builder/forms/${encodeURIComponent(id)}/archive`, { method: "POST", role }),
    previewTemplate: (id, role) => apiFetch(`/api/form-builder/forms/${encodeURIComponent(id)}/preview`, { role }),
    listSubmissions: (formId, filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/form-builder/forms/${encodeURIComponent(formId)}/submissions${qs ? `?${qs}` : ""}`, { role });
    },
    createSubmission: (formId, payload, role) => apiFetch(`/api/form-builder/forms/${encodeURIComponent(formId)}/submissions`, { method: "POST", body: payload, role }),
    getSubmission: (id, role) => apiFetch(`/api/form-builder/submissions/${encodeURIComponent(id)}`, { role }),
    getAuditLog: (formId, role) => apiFetch(`/api/form-builder/forms/${encodeURIComponent(formId)}/audit`, { role })
  },
  collector: {
    configs: (role) => apiFetch("/api/collector/configs", { role }),
    createConfig: (payload, role) => apiFetch("/api/collector/configs", { method: "POST", body: payload, role }),
    updateConfig: (id, payload, role) => apiFetch(`/api/collector/configs/${id}`, { method: "PUT", body: payload, role }),
    setEnabled: (id, enabled, role) => apiFetch(`/api/collector/configs/${id}/enabled`, { method: "PATCH", body: { enabled }, role }),
    tagMappings: (configId, role) => apiFetch(`/api/collector/configs/${configId}/tag-mappings`, { role }),
    createTagMapping: (configId, payload, role) => apiFetch(`/api/collector/configs/${configId}/tag-mappings`, { method: "POST", body: payload, role }),
    updateTagMapping: (mappingId, payload, role) => apiFetch(`/api/collector/tag-mappings/${mappingId}`, { method: "PUT", body: payload, role }),
    deleteTagMapping: (mappingId, role) => apiFetch(`/api/collector/tag-mappings/${mappingId}`, { method: "DELETE", role }),
    simulate: (configId, payload, role) => apiFetch(`/api/collector/configs/${configId}/ingest`, { method: "POST", body: payload, role }),
    runs: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/collector/runs${qs ? `?${qs}` : ""}`, { role });
    },
    run: (id, role) => apiFetch(`/api/collector/runs/${id}`, { role }),
    ootQueue: (filters = {}, role) => {
      const qs = new URLSearchParams(filters).toString();
      return apiFetch(`/api/collector/oot-queue${qs ? `?${qs}` : ""}`, { role });
    },
    acknowledgeOot: (id, payload, role) => apiFetch(`/api/collector/oot-queue/${id}/acknowledge`, { method: "POST", body: payload, role }),
    escalateOot: (id, payload, role) => apiFetch(`/api/collector/oot-queue/${id}/escalate`, { method: "POST", body: payload, role }),
    ootAudit: (id, role) => apiFetch(`/api/collector/oot-queue/${id}/audit`, { role })
  }
};
