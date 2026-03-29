import {
  DEFAULT_AUTH_USERS,
  DEFAULT_LOGIN_USER,
  DEFAULT_PART_DETAIL,
  DEFAULT_PARTS_LIST,
  DEFAULT_ROLES,
  DEFAULT_TOOLS_LIST
} from "./defaults.js";

export async function mockApi(
  page,
  {
    createPartMode = "success",
    createPartDelayMs = 0,
    jobs = [],
    records = [],
    onRecordSubmit,
    onAttachmentUpload,
    enableImports = false,
    authUsers = DEFAULT_AUTH_USERS,
    loginUser = DEFAULT_LOGIN_USER,
    roles = DEFAULT_ROLES,
    toolsList = DEFAULT_TOOLS_LIST,
    partsList = DEFAULT_PARTS_LIST,
    partDetails = { "1234": DEFAULT_PART_DETAIL },
    instructionVersionsByOperation = {},
    activeInstructionByJob = {},
    onInstructionCreate,
    onInstructionPublish,
    onInstructionAcknowledge,
    seatUsage = {
      contractId: "COMM-SEAT-v1",
      entitlementContractId: "PLAT-ENT-v1",
      licenseTier: "core",
      seatPack: 25,
      seatSoftLimit: 25,
      activeSessions: 1,
      activeUsers: 1,
      softLimitWarning: false,
      softLimitExceeded: false
    }
  } = {}
  ) {
  const recordStore = records.map((record) => ({ ...record }));
  const attachmentStore = new Map();
  const attachmentCounters = new Map();
  const faiPackageStore = new Map();
  let faiPackageCounter = 0;
  const instructionStore = new Map(Object.entries(instructionVersionsByOperation).map(([operationId, versions]) => ([
    String(operationId),
    (Array.isArray(versions) ? versions : []).map((version) => ({ ...version }))
  ])));
  const activeInstructionStore = new Map(
    Object.entries(activeInstructionByJob).map(([jobId, value]) => [String(jobId), { ...value }])
  );

  function makeAttachmentRow(recordId, payload, { includeData = false, attachmentId } = {}) {
    const index = attachmentCounters.get(String(recordId)) || 0;
    const id = attachmentId || `att-${String(recordId)}-${index + 1}`;
    attachmentCounters.set(String(recordId), index + 1);
    const dataBase64 = String(payload.dataBase64 || "");
    const byteSize = payload.byteSize ?? Math.max(1, Math.floor(dataBase64.length * 0.75));
    const retentionDays = Number(payload.retentionDays || 365);
    const retentionUntil = payload.retention_until || payload.retentionUntil || "2026-04-30T00:00:00.000Z";
    return {
      id,
      record_id: String(recordId),
      piece_number: Number(payload.pieceNumber ?? payload.piece_number ?? 1),
      file_name: String(payload.fileName ?? payload.file_name ?? "attachment.bin"),
      media_type: String(payload.mediaType ?? payload.media_type ?? "application/octet-stream"),
      byte_size: byteSize,
      ...(includeData ? { data_base64: dataBase64 } : {}),
      retention_until: retentionUntil,
      uploaded_by_user_id: Number(payload.userId ?? payload.uploaded_by_user_id ?? loginUser.id),
      uploaded_by_role: String(payload.role ?? payload.uploaded_by_role ?? loginUser.role),
      created_at: payload.created_at || "2026-03-21T12:00:00.000Z",
      updated_at: payload.updated_at || "2026-03-21T12:00:00.000Z"
    };
  }

  function instructionRowFromPayload(operationId, payload, overrides = {}) {
    const mediaLinks = Array.isArray(payload.mediaLinks)
      ? payload.mediaLinks
      : Array.isArray(payload.media_links)
        ? payload.media_links
        : Array.isArray(payload.mediaUrls)
          ? payload.mediaUrls.map((url) => ({ label: String(url).split("/").pop() || "Link", url }))
          : Array.isArray(payload.media_urls)
            ? payload.media_urls.map((url) => ({ label: String(url).split("/").pop() || "Link", url }))
            : Array.isArray(payload.links)
              ? payload.links
              : [];
    return {
      id: String(overrides.id || payload.id || `inst-${String(operationId)}-${Date.now()}`),
      operation_id: String(operationId),
      version_label: String(payload.versionLabel || payload.version_label || overrides.version_label || `v${(overrides.versionIndex || 1)}`),
      title: String(payload.title || payload.name || overrides.title || "Instruction"),
      summary: String(payload.summary || payload.description || overrides.summary || ""),
      body: String(payload.body || payload.details || overrides.body || ""),
      note: String(payload.publishNote || payload.publish_note || overrides.note || ""),
      status: String(overrides.status || payload.status || "draft"),
      active: Boolean(overrides.active ?? payload.active ?? false),
      published_at: overrides.published_at || payload.publishedAt || payload.published_at || null,
      created_at: overrides.created_at || payload.createdAt || payload.created_at || "2026-03-21T12:00:00.000Z",
      created_by_user_id: overrides.created_by_user_id || payload.createdByUserId || payload.created_by_user_id || loginUser.id,
      created_by_role: overrides.created_by_role || payload.createdByRole || payload.created_by_role || loginUser.role,
      acknowledged: Boolean(overrides.acknowledged ?? payload.acknowledged ?? false),
      acknowledged_at: overrides.acknowledged_at || payload.acknowledgedAt || payload.acknowledged_at || null,
      acknowledged_by_user_id: overrides.acknowledged_by_user_id || payload.acknowledgedByUserId || payload.acknowledged_by_user_id || null,
      acknowledged_by_name: overrides.acknowledged_by_name || payload.acknowledgedByName || payload.acknowledged_by_name || "",
      requires_acknowledgment: overrides.requires_acknowledgment ?? payload.requiresAcknowledgment ?? payload.requires_acknowledgment ?? true,
      media_links: mediaLinks,
      media_urls: mediaLinks.map((link) => link.url).filter(Boolean)
    };
  }

  function getInstructionVersions(operationId) {
    return instructionStore.get(String(operationId)) || [];
  }

  function setInstructionVersions(operationId, versions) {
    instructionStore.set(String(operationId), versions.map((version) => ({ ...version })));
  }

  function findPublishedInstructionVersion(operationId) {
    const versions = getInstructionVersions(operationId);
    return versions.find((version) => version.active || version.status === "published") || null;
  }

  function instructionResponseFromRow(row, extra = {}) {
    if (!row) return null;
    return {
      instructionVersion: {
        id: row.id,
        operationId: row.operation_id,
        versionLabel: row.version_label,
        title: row.title,
        summary: row.summary,
        body: row.body,
        note: row.note,
        status: row.status,
        active: row.active,
        publishedAt: row.published_at,
        createdAt: row.created_at,
        createdByUserId: row.created_by_user_id,
        createdByRole: row.created_by_role,
        acknowledged: row.acknowledged || Boolean(extra.acknowledged),
        acknowledgedAt: row.acknowledged_at || extra.acknowledged_at || null,
        acknowledgedByUserId: row.acknowledged_by_user_id || extra.acknowledged_by_user_id || null,
        acknowledgedByName: row.acknowledged_by_name || extra.acknowledged_by_name || "",
        requiresAcknowledgment: row.requires_acknowledgment,
        mediaLinks: row.media_links || [],
        mediaUrls: row.media_urls || []
      }
    };
  }

  function getRecordDetail(recordId) {
    const record = recordStore.find((entry) => String(entry.id) === String(recordId));
    if (!record) return null;
    const attachments = attachmentStore.get(String(recordId)) || [];
    return {
      ...record,
      values: record.values || [],
      tools: record.tools || [],
      missingPieces: record.missingPieces || [],
      pieceComments: record.pieceComments || [],
      attachments,
      auditLog: record.auditLog || []
    };
  }

  function listPartOperations(partDetail) {
    if (Array.isArray(partDetail?.operations)) return partDetail.operations;
    if (Array.isArray(partDetail)) return partDetail;
    if (partDetail?.operations && typeof partDetail.operations === "object") {
      return Object.entries(partDetail.operations).map(([opNumber, op]) => ({ opNumber, ...op }));
    }
    return [];
  }

  function findPartDetail(partId) {
    return partDetails[String(partId)] || partDetails[String(partId).trim()] || null;
  }

  function findJob(jobId) {
    return jobs.find((entry) => String(entry.id ?? entry.job_id ?? entry.jobId) === String(jobId)) || null;
  }

  function findOperation(partDetail, payload, job) {
    const operations = listPartOperations(partDetail);
    const candidates = [
      payload?.operationId,
      payload?.operation_id,
      payload?.operationNumber,
      payload?.operation_number,
      payload?.operationLabel,
      payload?.operation_label,
      job?.operation_id,
      job?.operationId,
      job?.operation,
      job?.operationNumber,
      job?.operationLabel
    ].filter((value) => value !== undefined && value !== null && String(value).trim() !== "");
    return operations.find((operation) => {
      const opId = String(operation?.id ?? "");
      const opNumber = String(operation?.opNumber ?? operation?.op_number ?? operation?.operationNumber ?? "").trim();
      const opLabel = String(operation?.label ?? operation?.name ?? "").trim().toLowerCase();
      return candidates.some((candidate) => {
        const text = String(candidate).trim();
        return text === opId || text === opNumber || text.toLowerCase() === opLabel;
      });
    }) || operations[0] || null;
  }

  function recalculateFaiPackage(pkg) {
    const characteristics = (pkg.characteristics || []).map((characteristic) => ({ ...characteristic }));
    const signedOffCount = characteristics.filter((characteristic) => Boolean(characteristic.signedOff)).length;
    const requiredCount = characteristics.filter((characteristic) => characteristic.required !== false).length;
    const ready = signedOffCount >= requiredCount && requiredCount > 0;
    const blockingReasons = ready
      ? []
      : characteristics
        .filter((characteristic) => characteristic.required !== false && !characteristic.signedOff)
        .map((characteristic) => `${characteristic.balloonNumber || characteristic.name} needs sign-off`);
    return {
      ...pkg,
      characteristics,
      readiness: {
        ready,
        state: ready ? "ready" : "pending",
        requiredCount,
        signedOffCount,
        blockingReasons: blockingReasons.length > 0 ? blockingReasons : ["All required characteristics must be signed off before finalization."]
      },
      finalization: {
        state: pkg.finalization?.finalized ? "finalized" : ready ? "ready" : "draft",
        finalized: Boolean(pkg.finalization?.finalized),
        finalizedAt: pkg.finalization?.finalizedAt || null,
        blocked: !ready && !pkg.finalization?.finalized,
        message: pkg.finalization?.message || (ready ? "Ready to finalize." : "Package is not yet ready.")
      },
      status: pkg.finalization?.finalized ? "finalized" : ready ? "ready" : "draft"
    };
  }

  function buildFaiPackage(payload) {
    const job = findJob(payload?.jobId || payload?.job_id || payload?.packageId);
    const partId = String(payload?.partId || payload?.part_id || job?.part_id || job?.partId || "");
    const partDetail = findPartDetail(partId) || DEFAULT_PART_DETAIL;
    const operation = findOperation(partDetail, payload, job);
    const dimensions = Array.isArray(operation?.dimensions) ? operation.dimensions : [];
    const packageId = String(payload?.packageId || payload?.id || `FAI-${partId || "manual"}-${++faiPackageCounter}`);
    const characteristics = dimensions.map((dimension, index) => ({
      id: String(dimension.id || `char-${index + 1}`),
      dimensionId: String(dimension.id || `char-${index + 1}`),
      balloonNumber: String(dimension.bubbleNumber || dimension.bubble_number || dimension.balloonNumber || index + 1),
      name: String(dimension.name || `Characteristic ${index + 1}`),
      featureType: dimension.featureType || dimension.feature_type || "",
      gdtClass: dimension.gdtClass || dimension.gdt_class || "",
      toleranceZone: dimension.toleranceZone || dimension.tolerance_zone || "",
      quantity: dimension.featureQuantity ?? dimension.feature_quantity ?? 1,
      units: dimension.unit || dimension.units || "",
      modifiers: dimension.featureModifiers || dimension.feature_modifiers_json || [],
      sourceCharacteristicKey: dimension.sourceCharacteristicKey || `CHAR-${partId}-${String(operation?.opNumber || operation?.op_number || job?.operation || index + 1)}`,
      required: true,
      signOffState: "pending",
      signedOff: false,
      signedOffAt: null,
      signedOffByUserId: null,
      signedOffByName: "",
      note: "",
      blockers: []
    }));
    const pkg = recalculateFaiPackage({
      id: packageId,
      packageId,
      jobId: String(payload?.jobId || payload?.job_id || job?.id || job?.job_id || ""),
      partId,
      partRevision: String(payload?.partRevision || payload?.part_revision || job?.part_revision_code || partDetail.currentRevision || "A"),
      lot: String(payload?.lot || payload?.lotNumber || payload?.lot_number || job?.lot || ""),
      operationId: String(payload?.operationId || payload?.operation_id || job?.operation_id || operation?.id || ""),
      operationNumber: String(payload?.operationNumber || payload?.operation_number || job?.operation || operation?.opNumber || operation?.op_number || ""),
      operationLabel: String(payload?.operationLabel || payload?.operation_label || operation?.label || ""),
      createdAt: "2026-03-21T12:00:00.000Z",
      updatedAt: "2026-03-21T12:00:00.000Z",
      characteristics,
      availableProfiles: [
        { id: "as9102-basic", name: "AS9102 Basic", version: "0.1.0", templateIds: ["fai-summary-v1", "fai-line-v1"] },
        { id: "as9102-line-only", name: "AS9102 Line Only", version: "0.1.0", templateIds: ["fai-line-v1"] }
      ],
      finalization: { finalized: false, finalizedAt: null }
    });
    faiPackageStore.set(packageId, pkg);
    return pkg;
  }

  function updateFaiPackage(packageId, updater) {
    const existing = faiPackageStore.get(String(packageId));
    if (!existing) return null;
    const next = recalculateFaiPackage(updater({ ...existing, characteristics: existing.characteristics.map((characteristic) => ({ ...characteristic })) }));
    faiPackageStore.set(String(packageId), next);
    return next;
  }

  const routeHandler = async (route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());
    const path = url.pathname;

    if (method === "GET" && path === "/api/auth/session") {
      return route.fulfill({
        status: 200,
        json: {
          valid: true,
          user: loginUser,
          seatUsage
        }
      });
    }
    if (method === "GET" && path === "/api/auth/users") {
      return route.fulfill({ status: 200, json: authUsers });
    }
    if (method === "POST" && path === "/api/auth/login") {
      return route.fulfill({
        status: 200,
        json: {
          ok: true,
          user: loginUser,
          expiresAt: "2026-03-15T00:00:00.000Z",
          seatUsage
        }
      });
    }
    if (method === "POST" && path === "/api/auth/logout") {
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    if (method === "GET" && path === "/api/users") {
      return route.fulfill({ status: 200, json: authUsers });
    }
    if (method === "GET" && path === "/api/tools") {
      return route.fulfill({ status: 200, json: toolsList });
    }
    if (method === "GET" && path === "/api/tool-locations") {
      return route.fulfill({ status: 200, json: [] });
    }
    if (method === "GET" && path === "/api/parts") {
      return route.fulfill({ status: 200, json: partsList });
    }
    if (method === "GET" && path.startsWith("/api/parts/")) {
      const partId = decodeURIComponent(path.slice("/api/parts/".length));
      const detail = partDetails[partId];
      if (!detail) {
        return route.fulfill({ status: 404, json: { error: "part_not_found" } });
      }
      return route.fulfill({
        status: 200,
        json: detail
      });
    }
    if (method === "GET" && path === "/api/jobs") {
      return route.fulfill({ status: 200, json: jobs });
    }
    if (method === "GET" && path === "/api/search/global") {
      const q = String(url.searchParams.get("q") || "").toLowerCase();
      const role = String(req.headers()["x-user-role"] || "Operator");
      const results = [];
      if (q.includes("j-10042")) {
        results.push({
          entityType: "job",
          entityId: "J-10042",
          title: "Job J-10042",
          subtitle: "Part 1234 · Op 020",
          context: "Open job ready for operator entry",
          deepLink: { view: "admin", adminTab: "jobs", jobId: "J-10042" }
        });
      }
      if (q.includes("r001")) {
        results.push({
          entityType: "record",
          entityId: "r001",
          title: "Record r001",
          subtitle: "Lot A · OOT",
          context: "Inspection record with trace context",
          deepLink: { view: "records", recordId: "r001" }
        });
      }
      if ((q.includes("admin user") || q.includes("admin")) && role === "Admin") {
        results.push({
          entityType: "user",
          entityId: "1",
          title: "Admin User",
          subtitle: "Admin account",
          context: "User management profile",
          deepLink: { view: "admin", adminTab: "users", userId: "1" }
        });
      }
      return route.fulfill({ status: 200, json: { query: q, count: results.length, results } });
    }
    if (method === "POST" && /^\/api\/jobs\/[^/]+\/lock$/.test(path)) {
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    if (method === "POST" && /^\/api\/jobs\/[^/]+\/unlock$/.test(path)) {
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    if (method === "GET" && /^\/api\/operations\/[^/]+\/instructions$/.test(path)) {
      const operationId = decodeURIComponent(path.split("/")[3]);
      return route.fulfill({
        status: 200,
        json: getInstructionVersions(operationId)
      });
    }
    if (method === "POST" && /^\/api\/operations\/[^/]+\/instructions\/versions$/.test(path)) {
      const operationId = decodeURIComponent(path.split("/")[3]);
      const payload = req.postDataJSON() ?? {};
      const versions = getInstructionVersions(operationId);
      const created = instructionRowFromPayload(operationId, payload, {
        status: "draft",
        active: false,
        versionIndex: versions.length + 1
      });
      setInstructionVersions(operationId, [...versions, created]);
      onInstructionCreate?.(payload, created);
      return route.fulfill({
        status: 201,
        json: instructionResponseFromRow(created)
      });
    }
    if (method === "POST" && /^\/api\/operations\/[^/]+\/instructions\/versions\/[^/]+\/publish$/.test(path)) {
      const parts = path.split("/");
      const operationId = decodeURIComponent(parts[3]);
      const versionId = decodeURIComponent(parts[6]);
      const payload = req.postDataJSON() ?? {};
      const versions = getInstructionVersions(operationId);
      const nextVersions = versions.map((version) => ({
        ...version,
        active: String(version.id) === String(versionId),
        status: String(version.id) === String(versionId) ? "published" : (version.status || "draft"),
        published_at: String(version.id) === String(versionId) ? "2026-03-21T12:30:00.000Z" : version.published_at || null
      }));
      const published = nextVersions.find((version) => String(version.id) === String(versionId));
      if (!published) {
        return route.fulfill({ status: 404, json: { error: "instruction_version_not_found" } });
      }
      setInstructionVersions(operationId, nextVersions);
      onInstructionPublish?.(payload, published);
      return route.fulfill({
        status: 200,
        json: instructionResponseFromRow(published)
      });
    }
    if (method === "GET" && /^\/api\/jobs\/[^/]+\/instructions\/active$/.test(path)) {
      const jobId = decodeURIComponent(path.split("/")[3]);
      const explicit = activeInstructionStore.get(String(jobId));
      if (explicit) {
        const response = explicit.instructionVersion || explicit.activeInstruction
          ? explicit
          : instructionResponseFromRow(explicit);
        return route.fulfill({ status: 200, json: response });
      }
      const job = jobs.find((entry) => String(entry.id ?? entry.job_id ?? entry.jobId) === String(jobId));
      if (!job) {
        return route.fulfill({ status: 404, json: { error: "job_not_found" } });
      }
      const published = findPublishedInstructionVersion(job.operation_id ?? job.operationId ?? job.operation);
      if (!published) {
        return route.fulfill({ status: 200, json: { activeInstruction: null, requiresAcknowledgment: false } });
      }
      return route.fulfill({
        status: 200,
        json: instructionResponseFromRow(published)
      });
    }
    if (method === "POST" && /^\/api\/jobs\/[^/]+\/instructions\/acknowledgments$/.test(path)) {
      const jobId = decodeURIComponent(path.split("/")[3]);
      const payload = req.postDataJSON() ?? {};
      const explicit = activeInstructionStore.get(String(jobId));
      let instructionRow = null;
      let response = null;
      if (explicit) {
        response = explicit.instructionVersion || explicit.activeInstruction
          ? explicit
          : instructionResponseFromRow(explicit);
        instructionRow = response?.instructionVersion || response?.activeInstruction || null;
      } else {
        const job = jobs.find((entry) => String(entry.id ?? entry.job_id ?? entry.jobId) === String(jobId));
        if (!job) {
          return route.fulfill({ status: 404, json: { error: "job_not_found" } });
        }
        instructionRow = findPublishedInstructionVersion(job.operation_id ?? job.operationId ?? job.operation);
        if (!instructionRow) {
          return route.fulfill({ status: 404, json: { error: "instruction_not_found" } });
        }
      }
      const acknowledgedRow = {
        ...instructionRow,
        acknowledged: true,
        acknowledged_at: "2026-03-21T12:34:00.000Z",
        acknowledged_by_user_id: Number(payload.userId ?? loginUser.id),
        acknowledged_by_name: String(payload.userName ?? loginUser.name),
        status: instructionRow.status || "published",
        active: true
      };
      const operationId = acknowledgedRow.operation_id;
      setInstructionVersions(operationId, getInstructionVersions(operationId).map((version) => (
        String(version.id) === String(acknowledgedRow.id)
          ? acknowledgedRow
          : version
      )));
      const ackResponse = instructionResponseFromRow(acknowledgedRow, {
        acknowledged: true,
        acknowledged_at: acknowledgedRow.acknowledged_at,
        acknowledged_by_user_id: acknowledgedRow.acknowledged_by_user_id,
        acknowledged_by_name: acknowledgedRow.acknowledged_by_name
      });
      activeInstructionStore.set(String(jobId), ackResponse);
      onInstructionAcknowledge?.(payload, ackResponse);
      return route.fulfill({
        status: 200,
        json: ackResponse
      });
    }
    if (method === "POST" && (/\/api\/quality\/fai-packages(\/load)?$/.test(path) || /\/api\/(quality\/)?fai\/packages(\/load)?$/.test(path))) {
      const payload = req.postDataJSON() ?? {};
      const pkg = buildFaiPackage(payload);
      return route.fulfill({ status: 201, json: { package: pkg } });
    }
    if (method === "GET" && (/\/api\/quality\/fai-packages\/[^/]+$/.test(path) || /\/api\/(quality\/)?fai\/packages\/[^/]+$/.test(path))) {
      const packageId = decodeURIComponent(path.split("/").pop());
      const pkg = faiPackageStore.get(String(packageId));
      if (!pkg) {
        return route.fulfill({ status: 404, json: { error: "package_not_found" } });
      }
      return route.fulfill({ status: 200, json: { package: pkg } });
    }
    if ((method === "POST" || method === "PUT") && (/\/api\/quality\/fai-packages\/[^/]+\/signoffs$/.test(path) || /\/api\/(quality\/)?fai\/packages\/[^/]+\/characteristics\/[^/]+\/sign-?off$/.test(path))) {
      const parts = path.split("/");
      const packageId = decodeURIComponent(parts[parts.indexOf("fai-packages") + 1] || parts[parts.indexOf("packages") + 1]);
      const payload = req.postDataJSON() ?? {};
      const characteristicId = String(
        payload.dimensionId ??
        payload.characteristicId ??
        decodeURIComponent(parts[parts.indexOf("characteristics") + 1] || "")
      );
      const pkg = updateFaiPackage(packageId, (current) => ({
        ...current,
        characteristics: current.characteristics.map((characteristic) => {
          if (String(characteristic.id) !== String(characteristicId) && String(characteristic.dimensionId) !== String(characteristicId)) return characteristic;
          return {
            ...characteristic,
            signedOff: true,
            signOffState: "signed_off",
            signedOffAt: "2026-03-21T12:20:00.000Z",
            signedOffByUserId: Number(payload.userId ?? loginUser.id),
            signedOffByName: String(payload.userName ?? loginUser.name),
            note: String(payload.note ?? "")
          };
        })
      }));
      if (!pkg) {
        return route.fulfill({ status: 404, json: { error: "package_not_found" } });
      }
      return route.fulfill({ status: 200, json: { package: pkg } });
    }
    if ((method === "POST" || method === "PUT") && (/\/api\/quality\/fai-packages\/[^/]+\/(finalize|complete)$/.test(path) || /\/api\/(quality\/)?fai\/packages\/[^/]+\/(finalize|complete)$/.test(path))) {
      const parts = path.split("/");
      const packageId = decodeURIComponent(parts[parts.indexOf("fai-packages") + 1] || parts[parts.indexOf("packages") + 1]);
      const payload = req.postDataJSON() ?? {};
      const pkg = updateFaiPackage(packageId, (current) => ({
        ...current,
        finalization: {
          ...(current.finalization || {}),
          finalized: true,
          finalizedAt: "2026-03-21T12:25:00.000Z",
          message: String(payload.note ?? "Package finalized.")
        }
      }));
      if (!pkg) {
        return route.fulfill({ status: 404, json: { error: "package_not_found" } });
      }
      return route.fulfill({ status: 200, json: { package: pkg } });
    }
    if (method === "GET" && path === "/api/records") {
      return route.fulfill({ status: 200, json: recordStore });
    }
    if (method === "GET" && /^\/api\/records\/[^/]+\/attachments$/.test(path)) {
      const recordId = decodeURIComponent(path.split("/")[3]);
      const includeData = url.searchParams.get("includeData") === "true";
      const attachments = (attachmentStore.get(String(recordId)) || []).map((attachment) => (
        includeData ? attachment : { ...attachment, data_base64: undefined }
      ));
      return route.fulfill({ status: 200, json: attachments });
    }
    if (method === "GET" && /^\/api\/records\/[^/]+\/attachments\/[^/]+$/.test(path)) {
      const parts = path.split("/");
      const recordId = decodeURIComponent(parts[3]);
      const attachmentId = decodeURIComponent(parts[5]);
      const attachment = (attachmentStore.get(String(recordId)) || []).find((row) => String(row.id) === String(attachmentId));
      if (!attachment) {
        return route.fulfill({ status: 404, json: { error: "not_found" } });
      }
      return route.fulfill({ status: 200, json: attachment });
    }
    if (method === "GET" && /^\/api\/records\/[^/]+$/.test(path)) {
      const recordId = decodeURIComponent(path.split("/")[3]);
      const detail = getRecordDetail(recordId);
      if (!detail) {
        return route.fulfill({ status: 404, json: { error: "not_found" } });
      }
      return route.fulfill({ status: 200, json: detail });
    }
    if (method === "POST" && path === "/api/records") {
      const payload = req.postDataJSON() ?? {};
      const recordId = String(payload.id || `REC-${recordStore.length + 1}`);
      const attachments = Array.isArray(payload.attachments)
        ? payload.attachments.map((attachment) => makeAttachmentRow(recordId, attachment, { includeData: true }))
        : [];
      if (attachments.length > 0) {
        attachmentStore.set(recordId, attachments);
      }
      const created = {
        id: recordId,
        job_id: payload.jobId,
        part_id: payload.partId,
        operation_id: payload.operationId,
        lot: payload.lot,
        qty: payload.qty,
        timestamp: "2026-03-21T12:00:00.000Z",
        operator_user_id: payload.operatorUserId,
        status: payload.status,
        oot: payload.oot,
        comment: payload.comment || "",
        values: payload.values || [],
        tools: payload.tools || [],
        missingPieces: payload.missingPieces || [],
        pieceComments: payload.pieceComments || [],
        attachments,
        auditLog: []
      };
      recordStore.unshift(created);
      onRecordSubmit?.(payload);
      return route.fulfill({ status: 201, json: created });
    }
    if (method === "POST" && /^\/api\/records\/[^/]+\/attachments$/.test(path)) {
      const recordId = decodeURIComponent(path.split("/")[3]);
      const payload = req.postDataJSON() ?? {};
      const attachment = makeAttachmentRow(recordId, payload, { includeData: false });
      const current = attachmentStore.get(String(recordId)) || [];
      attachmentStore.set(String(recordId), [...current, attachment]);
      onAttachmentUpload?.(payload);
      return route.fulfill({ status: 201, json: attachment });
    }
    if (method === "PUT" && /^\/api\/records\/[^/]+\/attachments\/[^/]+\/retention$/.test(path)) {
      const parts = path.split("/");
      const recordId = decodeURIComponent(parts[3]);
      const attachmentId = decodeURIComponent(parts[5]);
      const payload = req.postDataJSON() ?? {};
      const current = attachmentStore.get(String(recordId)) || [];
      const updated = current.map((attachment) => {
        if (String(attachment.id) !== String(attachmentId)) return attachment;
        return {
          ...attachment,
          retention_until: "2026-06-21T12:00:00.000Z",
          updated_at: "2026-03-21T12:30:00.000Z"
        };
      });
      attachmentStore.set(String(recordId), updated);
      return route.fulfill({
        status: 200,
        json: {
          id: attachmentId,
          record_id: recordId,
          piece_number: (current.find((attachment) => String(attachment.id) === String(attachmentId)) || {}).piece_number || 1,
          file_name: (current.find((attachment) => String(attachment.id) === String(attachmentId)) || {}).file_name || "attachment.bin",
          media_type: (current.find((attachment) => String(attachment.id) === String(attachmentId)) || {}).media_type || "application/octet-stream",
          byte_size: (current.find((attachment) => String(attachment.id) === String(attachmentId)) || {}).byte_size || 1,
          retention_until: "2026-06-21T12:00:00.000Z",
          uploaded_by_user_id: Number(payload.userId ?? loginUser.id),
          uploaded_by_role: String(loginUser.role),
          created_at: "2026-03-21T12:00:00.000Z",
          updated_at: "2026-03-21T12:30:00.000Z"
        }
      });
    }
    if (method === "GET" && path === "/api/roles") {
      return route.fulfill({
        status: 200,
        json: roles
      });
    }
    if (method === "POST" && path === "/api/sessions/start") {
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    if (method === "POST" && path === "/api/sessions/end") {
      return route.fulfill({ status: 200, json: { ok: true } });
    }

    if (method === "POST" && path === "/api/parts") {
      if (createPartDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, createPartDelayMs));
      }
      if (createPartMode === "error") {
        return route.fulfill({ status: 500, json: { error: "create_part_failed" } });
      }
      const payload = req.postDataJSON() ?? {};
      return route.fulfill({
        status: 201,
        json: {
          id: payload.id,
          description: payload.description,
          operations: []
        }
      });
    }

    if (enableImports && method === "GET" && path === "/api/imports/templates") {
      return route.fulfill({
        status: 200,
        json: {
          tools: { headers: ["name", "type", "it_num", "size", "active", "visible"] },
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
        }
      });
    }
    if (enableImports && method === "POST" && path === "/api/imports/tools/csv") {
      return route.fulfill({ status: 200, json: { ok: true, total: 1, inserted: 1, updated: 0 } });
    }
    if (enableImports && method === "POST" && path === "/api/imports/part-dimensions/csv") {
      return route.fulfill({ status: 200, json: { ok: true, totalRows: 1, partsUpserted: 1, operationsUpserted: 1, dimensionsUpserted: 1 } });
    }
    if (enableImports && method === "GET" && path === "/api/imports/integrations") {
      return route.fulfill({ status: 200, json: [] });
    }
    if (enableImports && method === "GET" && path === "/api/imports/unresolved") {
      return route.fulfill({ status: 200, json: [] });
    }
    if (enableImports && method === "POST" && path === "/api/imports/integrations") {
      return route.fulfill({
        status: 201,
        json: { id: 1, name: "Mock Integration", source_type: "api_pull", import_type: "jobs" }
      });
    }
    if (enableImports && method === "POST" && path === "/api/imports/measurements/bulk") {
      return route.fulfill({ status: 200, json: { ok: true, totalRows: 1, inserted: 1, updated: 0, failed: 0 } });
    }

    if (method === "GET" && path === "/api/form-builder/contracts") {
      return route.fulfill({
        status: 200,
        json: {
          contractId: "OPS-FORMBUILDER-v1",
          fieldTypes: [
            { type: "text", label: "Single-line Text", isInputField: true, supportsOptions: false, supportsRequired: true },
            { type: "number", label: "Number", isInputField: true, supportsOptions: false, supportsRequired: true },
            { type: "select", label: "Dropdown Select", isInputField: true, supportsOptions: true, supportsRequired: true },
            { type: "section_header", label: "Section Header", isInputField: false, supportsOptions: false, supportsRequired: false }
          ]
        }
      });
    }
    if (method === "GET" && path === "/api/form-builder/forms") {
      return route.fulfill({
        status: 200,
        json: {
          contractId: "OPS-FORMBUILDER-v1",
          templates: [
            {
              id: 1,
              name: "Incoming Inspection",
              description: "Standard incoming check",
              status: "published",
              scope_site_id: "default",
              updated_at: "2026-03-28T00:00:00.000Z"
            },
            {
              id: 2,
              name: "Final Audit Draft",
              description: null,
              status: "draft",
              scope_site_id: "default",
              updated_at: "2026-03-27T00:00:00.000Z"
            }
          ]
        }
      });
    }
    if (method === "POST" && path === "/api/form-builder/forms") {
      const payload = req.postDataJSON() ?? {};
      return route.fulfill({
        status: 201,
        json: {
          contractId: "OPS-FORMBUILDER-v1",
          template: {
            id: 99,
            name: payload.name || "New Form",
            description: payload.description || null,
            schema: payload.schema || [],
            status: "draft",
            scope_site_id: "default",
            created_at: "2026-03-28T00:00:00.000Z",
            updated_at: "2026-03-28T00:00:00.000Z"
          }
        }
      });
    }
    if (method === "GET" && /^\/api\/form-builder\/forms\/\d+$/.test(path)) {
      return route.fulfill({
        status: 200,
        json: {
          contractId: "OPS-FORMBUILDER-v1",
          template: {
            id: 1,
            name: "Incoming Inspection",
            description: "Standard incoming check",
            schema: [
              { id: "f1", type: "text", label: "Inspector Name", required: true },
              { id: "f2", type: "number", label: "Measurement", required: false }
            ],
            status: "published",
            scope_site_id: "default",
            updated_at: "2026-03-28T00:00:00.000Z"
          }
        }
      });
    }
    if (method === "PUT" && /^\/api\/form-builder\/forms\/\d+$/.test(path)) {
      const payload = req.postDataJSON() ?? {};
      return route.fulfill({
        status: 200,
        json: {
          contractId: "OPS-FORMBUILDER-v1",
          template: { id: 2, name: payload.name || "Final Audit Draft", schema: payload.schema || [], status: "draft", updated_at: "2026-03-28T00:00:00.000Z" }
        }
      });
    }
    if (method === "POST" && /^\/api\/form-builder\/forms\/\d+\/publish$/.test(path)) {
      return route.fulfill({
        status: 200,
        json: { contractId: "OPS-FORMBUILDER-v1", template: { id: 2, name: "Final Audit Draft", status: "published" } }
      });
    }
    if (method === "POST" && /^\/api\/form-builder\/forms\/\d+\/archive$/.test(path)) {
      return route.fulfill({
        status: 200,
        json: { contractId: "OPS-FORMBUILDER-v1", template: { id: 1, name: "Incoming Inspection", status: "archived" } }
      });
    }
    if (method === "GET" && /^\/api\/form-builder\/forms\/\d+\/preview$/.test(path)) {
      return route.fulfill({
        status: 200,
        json: {
          contractId: "OPS-FORMBUILDER-v1",
          template: {
            id: 1,
            name: "Incoming Inspection",
            schema: [{ id: "f1", type: "text", label: "Inspector Name", required: true }],
            status: "published"
          },
          fieldTypes: []
        }
      });
    }
    if (method === "GET" && /^\/api\/form-builder\/forms\/\d+\/submissions$/.test(path)) {
      return route.fulfill({
        status: 200,
        json: {
          contractId: "OPS-FORMBUILDER-v1",
          submissions: [
            { id: 101, form_template_id: 1, submitted_by_user_id: 1, submitted_by_role: "Operator", job_id: null, submitted_at: "2026-03-28T00:00:00.000Z", data: { f1: "Alice" } }
          ],
          total: 1,
          limit: 50,
          offset: 0
        }
      });
    }
    if (method === "POST" && /^\/api\/form-builder\/forms\/\d+\/submissions$/.test(path)) {
      return route.fulfill({
        status: 201,
        json: {
          contractId: "OPS-FORMBUILDER-v1",
          submission: { id: 102, form_template_id: 1, submitted_by_role: "Operator", submitted_at: "2026-03-28T00:00:00.000Z", data: {} }
        }
      });
    }
    if (method === "GET" && /^\/api\/form-builder\/forms\/\d+\/audit$/.test(path)) {
      return route.fulfill({
        status: 200,
        json: {
          contractId: "OPS-FORMBUILDER-v1",
          entries: [
            { id: 1, action: "created", user_role: "Admin", created_at: "2026-03-28T00:00:00.000Z" },
            { id: 2, action: "published", user_role: "Admin", created_at: "2026-03-28T00:00:00.000Z" }
          ]
        }
      });
    }
    if (method === "GET" && /^\/api\/form-builder\/submissions\/\d+$/.test(path)) {
      return route.fulfill({
        status: 200,
        json: {
          contractId: "OPS-FORMBUILDER-v1",
          submission: { id: 101, form_template_id: 1, data: { f1: "Alice" }, submitted_by_role: "Operator", submitted_at: "2026-03-28T00:00:00.000Z" }
        }
      });
    }

    return route.fulfill({ status: 404, json: { error: `Unhandled ${method} ${path}` } });
  };

  await page.route("**/api/**", routeHandler);
}
