import { Router } from "express";
import { query, transaction } from "../db.js";
import { requireCapability } from "../middleware/requireCapability.js";
import { getActorRole, getActorUserId } from "../middleware/authSession.js";
import {
  createPartSetupRevision,
  ensurePartSetupBaselineRevision,
  getPartRevisionByCode
} from "../revisions.js";
import { executeConnectorRuntime } from "../services/integration/connectorRuntime.js";
import { mapErpJobBatchToCanonical } from "../services/integration/erpJobAdapter.js";
import { buildIntegrationSupportBundle } from "../services/observability/integrationSupportBundle.js";
import {
  createPayloadFingerprint
} from "../services/idempotency/idempotencyKey.js";

import * as importsCore from "./importsCore.js";
const router = Router();

function buildTemplateCatalog() {
  return {
    tools: {
      headers: ["name", "type", "it_num", "size", "active", "visible"]
    },
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
    },
    jobs: {
      headers: [
        "job_id",
        "part_id",
        "part_revision",
        "operation_id",
        "op_number",
        "lot",
        "qty",
        "status"
      ]
    },
    measurements: {
      headers: [
        "record_key",
        "job_id",
        "part_id",
        "part_revision",
        "operation_ref",
        "piece_number",
        "dimension_name",
        "value",
        "is_oot",
        "operator_user_id",
        "status",
        "comment",
        "tool_it_nums",
        "missing_reason",
        "nc_num",
        "details"
      ]
    },
    operatorMeasurement: {
      headers: [
        "piece_number",
        "dimension_name",
        "value",
        "is_oot",
        "tool_it_nums",
        "missing_reason",
        "nc_num",
        "details"
      ]
    }
  };
}

function buildOnboardingToolkit(templates) {
  return {
    contractId: "INT-ONBOARD-v1",
    imports: [
      {
        importType: "jobs",
        label: "Jobs activation",
        templateKey: "jobs",
        sampleFile: "jobs-import-template.csv",
        headers: templates.jobs.headers,
        requiredHeaders: ["job_id", "part_id", "lot", "qty"],
        validators: [
          "Each row needs a customer job number, part, lot, and quantity.",
          "Provide either `operation_id` or `op_number` for every job row.",
          "Statuses should stay within open, closed, draft, or incomplete."
        ]
      },
      {
        importType: "part_dimensions",
        label: "Part and setup activation",
        templateKey: "partDimensions",
        sampleFile: "part-dimensions-import-template.csv",
        headers: templates.partDimensions.headers,
        requiredHeaders: ["part_id", "op_number", "dimension_name", "nominal", "tol_plus", "tol_minus", "unit", "sampling"],
        validators: [
          "Each row should describe one characteristic with tolerance, unit, and sampling plan.",
          "Use a positive sampling interval only when `sampling` is `custom_interval`.",
          "List tool IT numbers with `|` separators when multiple gages can measure the characteristic."
        ]
      },
      {
        importType: "measurements",
        label: "Measurements activation",
        templateKey: "measurements",
        sampleFile: "measurements-import-template.csv",
        headers: templates.measurements.headers,
        requiredHeaders: ["job_id", "operation_ref", "piece_number", "dimension_name"],
        validators: [
          "Each row needs enough context to map back to a job, operation, piece, and characteristic.",
          "Provide either a measured `value` or a documented missing reason.",
          "Measurement imports work best when operator IDs and tool IT numbers are included before go-live."
        ]
      }
    ]
  };
}

function summarizeDryRunStatus(issueCount) {
  return issueCount > 0 ? "needs_attention" : "ready";
}

function buildDryRunMessage({ importType, issueCount, totalRows }) {
  const importLabel = importType === "part_dimensions"
    ? "part setup"
    : importType;
  if (!totalRows) {
    return `No ${importLabel} rows were found in the uploaded file.`;
  }
  if (issueCount > 0) {
    return `The ${importLabel} file is close, but ${issueCount} preflight issue${issueCount === 1 ? "" : "s"} should be corrected before customer activation.`;
  }
  return `The ${importLabel} file is ready for a live activation pass.`;
}

function validateDryRunRows({ importType, rows, headers }) {
  const issues = [];
  const canonicalHeaders = Array.isArray(headers) ? headers.map((header) => importsCore.canonicalHeader(header)) : [];
  const headerSet = new Set(canonicalHeaders);

  const rulesByType = {
    jobs: {
      requiredHeaders: ["job_id", "part_id", "lot", "qty"],
      requiredPerRow: ["job_id", "part_id", "lot", "qty"],
      validators: (row, line) => {
        const qty = importsCore.parsePositiveInteger(row.qty);
        if (qty === null) issues.push({ line, field: "qty", error: "Quantity must be a positive whole number." });
        const opNumber = String(row.op_number || "").trim();
        const operationId = String(row.operation_id || "").trim();
        if (!opNumber && !operationId) {
          issues.push({ line, field: "op_number", error: "Provide either an operation number or operation ID for each job row." });
        }
      }
    },
    part_dimensions: {
      requiredHeaders: ["part_id", "op_number", "dimension_name", "nominal", "tol_plus", "tol_minus", "unit", "sampling"],
      requiredPerRow: ["part_id", "op_number", "dimension_name", "nominal", "tol_plus", "tol_minus", "unit", "sampling"],
      validators: (row, line) => {
        if (importsCore.parseOptionalNumber(row.nominal) === null) issues.push({ line, field: "nominal", error: "Nominal must be numeric." });
        if (importsCore.parseOptionalNumber(row.tol_plus) === null) issues.push({ line, field: "tol_plus", error: "Upper tolerance must be numeric." });
        if (importsCore.parseOptionalNumber(row.tol_minus) === null) issues.push({ line, field: "tol_minus", error: "Lower tolerance must be numeric." });
        if (!importsCore.VALID_UNITS.includes(String(row.unit || "").trim())) {
          issues.push({ line, field: "unit", error: `Unit must be one of: ${importsCore.VALID_UNITS.join(", ")}.` });
        }
        if (!importsCore.VALID_SAMPLING.includes(String(row.sampling || "").trim())) {
          issues.push({ line, field: "sampling", error: `Sampling must be one of: ${importsCore.VALID_SAMPLING.join(", ")}.` });
        }
        if (String(row.sampling || "").trim() === "custom_interval" && importsCore.parseInterval(row.sampling_interval) === null) {
          issues.push({ line, field: "sampling_interval", error: "Custom interval sampling requires a positive sampling interval." });
        }
      }
    },
    measurements: {
      requiredHeaders: ["job_id", "operation_ref", "piece_number", "dimension_name"],
      requiredPerRow: ["job_id", "operation_ref", "piece_number", "dimension_name"],
      validators: (row, line) => {
        if (importsCore.parsePositiveInteger(row.piece_number) === null) {
          issues.push({ line, field: "piece_number", error: "Piece number must be a positive whole number." });
        }
        const value = String(row.value || "").trim();
        const missingReason = String(row.missing_reason || "").trim();
        if (!value && !missingReason) {
          issues.push({ line, field: "value", error: "Provide either a measured value or a missing reason." });
        }
      }
    }
  };

  const rules = rulesByType[importType];
  if (!rules) {
    return {
      missingHeaders: [],
      issues: [{ line: null, field: "importType", error: "Unsupported onboarding import type." }]
    };
  }

  const missingHeaders = rules.requiredHeaders.filter((header) => !headerSet.has(header));
  for (const header of missingHeaders) {
    issues.push({
      line: null,
      field: header,
      error: `Required column \`${header}\` is missing from the uploaded file.`
    });
  }

  rows.forEach((row) => {
    const line = Number(row._line || 0) || null;
    for (const field of rules.requiredPerRow) {
      if (!String(row[field] || "").trim()) {
        issues.push({ line, field, error: `This row is missing \`${field}\`.` });
      }
    }
    rules.validators(row, line);
  });

  return { missingHeaders, issues };
}

function buildDryRunReport({ importType, csvText, toolkit }) {
  const normalizedImportType = importsCore.parseImportType(importType);
  const parsed = importsCore.parseCsvText(csvText);
  const toolkitItem = toolkit.imports.find((item) => item.importType === normalizedImportType) || null;
  const mappingHeaders = toolkitItem?.headers || parsed.headers || [];
  const headerMatches = mappingHeaders.map((header) => ({
    sourceHeader: header,
    canonicalField: importsCore.canonicalHeader(header),
    presentInUpload: parsed.headers.includes(importsCore.canonicalHeader(header))
  }));
  const unknownHeaders = parsed.headers.filter((header) => !mappingHeaders.includes(header));
  const validation = validateDryRunRows({
    importType: normalizedImportType,
    rows: parsed.rows,
    headers: parsed.headers
  });
  const issueCount = validation.issues.length;
  const issueLines = new Set(
    validation.issues
      .map((issue) => issue.line)
      .filter((line) => Number.isInteger(line) && line > 0)
  );
  const readyRows = Math.max(0, parsed.rows.length - issueLines.size);

  return {
    contractId: "INT-ONBOARD-v1",
    importType: normalizedImportType,
    summary: {
      status: summarizeDryRunStatus(issueCount),
      customerMessage: buildDryRunMessage({
        importType: normalizedImportType,
        issueCount,
        totalRows: parsed.rows.length
      }),
      totalRows: parsed.rows.length,
      readyRows,
      rowsNeedingAttention: Math.max(0, parsed.rows.length - readyRows),
      issueCount
    },
    mappingTemplate: toolkitItem
      ? {
          label: toolkitItem.label,
          sampleFile: toolkitItem.sampleFile,
          requiredHeaders: toolkitItem.requiredHeaders,
          headers: toolkitItem.headers
        }
      : null,
    mappingPreview: {
      matchedHeaders: headerMatches,
      unknownHeaders,
      missingRequiredHeaders: validation.missingHeaders
    },
    preflight: {
      validators: toolkitItem?.validators || [],
      issues: validation.issues.slice(0, 25)
    },
    nextSteps: issueCount > 0
      ? [
          "Fix the highlighted columns or row values in the customer source file.",
          "Run this dry-run again until the file reports ready for activation.",
          "Only then execute the live import for the target customer."
        ]
      : [
          "Keep this file as the approved customer activation snapshot.",
          "Run the live import from the same template when the customer is ready.",
          "Attach the dry-run report to the activation notes for traceability."
        ]
  };
}

router.post("/tools/csv", requireCapability("manage_tools"), async (req, res, next) => {
  try {
    const { csvText } = req.body || {};
    if (!String(csvText || "").trim()) return res.status(400).json({ error: "csv_required" });
    const { rows } = importsCore.parseCsvText(csvText);
    if (!rows.length) return res.status(400).json({ error: "csv_no_rows" });

    const result = await importsCore.executeDirectImportWithAudit({
      importType: "tools",
      payload: { csvText },
      sourceType: "manual_csv",
      role: importsCore.requestRole(req),
      triggerMode: "manual"
    });

    const statusCode = importsCore.importResponseStatusCode(result);
    res.status(statusCode).json({
      ...result,
      total: result.totalRows
    });
  } catch (err) {
    if (importsCore.safeErrorCode(err) === "csv_no_rows") {
      return res.status(400).json({ error: "csv_no_rows" });
    }
    next(err);
  }
});

router.post("/part-dimensions/csv", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { csvText } = req.body || {};
    if (!String(csvText || "").trim()) return res.status(400).json({ error: "csv_required" });
    const { rows } = importsCore.parseCsvText(csvText);
    if (!rows.length) return res.status(400).json({ error: "csv_no_rows" });

    const result = await importsCore.executeDirectImportWithAudit({
      importType: "part_dimensions",
      payload: { csvText },
      sourceType: "manual_csv",
      role: importsCore.requestRole(req),
      triggerMode: "manual"
    });
    const statusCode = importsCore.importResponseStatusCode(result);
    res.status(statusCode).json(result);
  } catch (err) {
    if (importsCore.safeErrorCode(err) === "csv_no_rows") {
      return res.status(400).json({ error: "csv_no_rows" });
    }
    next(err);
  }
});

router.post("/jobs/csv", requireCapability("manage_jobs"), async (req, res, next) => {
  try {
    const { csvText } = req.body || {};
    if (!String(csvText || "").trim()) return res.status(400).json({ error: "csv_required" });
    const { rows } = importsCore.parseCsvText(csvText);
    if (!rows.length) return res.status(400).json({ error: "csv_no_rows" });

    const result = await importsCore.executeDirectImportWithAudit({
      importType: "jobs",
      payload: { csvText },
      sourceType: "manual_csv",
      role: importsCore.requestRole(req),
      triggerMode: "manual"
    });
    const statusCode = importsCore.importResponseStatusCode(result);
    res.status(statusCode).json(result);
  } catch (err) {
    if (importsCore.safeErrorCode(err) === "csv_no_rows") {
      return res.status(400).json({ error: "csv_no_rows" });
    }
    next(err);
  }
});

router.post("/measurements/bulk", requireCapability("manage_jobs"), async (req, res, next) => {
  try {
    const payload = req.body || {};
    const result = await importsCore.executeDirectImportWithAudit({
      importType: "measurements",
      payload,
      sourceType: "api_pull",
      role: importsCore.requestRole(req),
      triggerMode: "manual",
      options: {
        requireOpenJob: false,
        forceOperatorUserId: payload.operatorUserId,
        defaultStatus: payload.status,
        defaultComment: payload.comment
      }
    });

    const status = importsCore.importResponseStatusCode(result);
    res.status(status).json({
      ...result
    });
  } catch (err) {
    if (importsCore.safeErrorCode(err) === "csv_no_rows") {
      return res.status(400).json({ error: "csv_no_rows" });
    }
    next(err);
  }
});

router.post("/jobs/:jobId/measurements/csv", requireCapability("submit_records"), async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const { csvText, operatorUserId, operationId, partId, status, comment } = req.body || {};
    const actorUserId = getActorUserId(req);
    const suppliedOperatorId = importsCore.parsePositiveInteger(operatorUserId);
    const effectiveOperatorId = importsCore.parsePositiveInteger(actorUserId) || suppliedOperatorId;

    if (!String(csvText || "").trim()) return res.status(400).json({ error: "csv_required" });
    if (!effectiveOperatorId) return res.status(400).json({ error: "operator_user_required" });
    if (importsCore.parsePositiveInteger(actorUserId) && suppliedOperatorId && suppliedOperatorId !== importsCore.parsePositiveInteger(actorUserId)) {
      return res.status(403).json({ error: "auth_user_mismatch" });
    }

    const { rows } = importsCore.parseCsvText(csvText);
    if (!rows.length) return res.status(400).json({ error: "csv_no_rows" });

    const runtimePayload = {
      rows,
      jobId,
      operationId: operationId || null,
      partId: partId || null,
      operatorUserId: effectiveOperatorId,
      status: status || null,
      comment: comment || null
    };

    const result = await importsCore.executeDirectImportWithAudit({
      importType: "measurements",
      payload: runtimePayload,
      sourceType: "operator_csv",
      role: importsCore.requestRole(req),
      triggerMode: "manual",
      options: {
        forceJobId: jobId,
        forcePartId: partId,
        forceOperationId: operationId,
        forceOperatorUserId: effectiveOperatorId,
        defaultStatus: status,
        defaultComment: comment,
        requireOpenJob: true,
        requireLockOwnerUserId: effectiveOperatorId
      }
    });

    const statusCode = importsCore.importResponseStatusCode(result);
    res.status(statusCode).json({
      ...result
    });
  } catch (err) {
    if (importsCore.safeErrorCode(err) === "csv_no_rows") {
      return res.status(400).json({ error: "csv_no_rows" });
    }
    next(err);
  }
});

router.post("/adapters/erp-jobs/preview", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const sourceType = importsCore.parseSourceType(req.body?.sourceType || "api_pull") || "api_pull";
    const triggerMode = importsCore.normalizeTriggerMode(req.body?.triggerMode || "manual");
    const integrationId = importsCore.parsePositiveInteger(req.body?.integrationId);
    const adapter = importsCore.adaptErpJobsPayload({
      payload: req.body || {},
      sourceType,
      triggerMode,
      integrationId
    });
    res.json({
      contractId: "INT-INGEST-v1",
      adapterPack: adapter.adapterPack,
      totalRows: adapter.total,
      accepted: adapter.acceptedCount,
      rejected: adapter.rejectedCount,
      rejectedRows: adapter.rejected
    });
  } catch (err) {
    next(err);
  }
});

router.get("/integrations", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, source_type, import_type, endpoint_url, poll_interval_minutes, enabled, options,
              last_run_at, last_status, last_message, created_at, updated_at
       FROM import_integrations
       ORDER BY id ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/integrations", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const { name, sourceType, importType, endpointUrl, authHeader, pollIntervalMinutes, enabled = true, options = {} } = req.body || {};

    const trimmedName = String(name || "").trim();
    const normalizedSource = importsCore.parseSourceType(sourceType);
    const normalizedImport = importsCore.parseImportType(importType);
    const poll = pollIntervalMinutes === undefined || pollIntervalMinutes === null || pollIntervalMinutes === ""
      ? null
      : importsCore.parsePositiveInteger(pollIntervalMinutes);

    if (!trimmedName || !importsCore.VALID_INTEGRATION_SOURCE_TYPES.includes(normalizedSource) || !importsCore.VALID_IMPORT_TYPES.includes(normalizedImport)) {
      return res.status(400).json({ error: "required_fields_missing" });
    }
    if (pollIntervalMinutes !== undefined && poll === null) {
      return res.status(400).json({ error: "invalid_poll_interval" });
    }

    const { rows } = await query(
      `INSERT INTO import_integrations
         (name, source_type, import_type, endpoint_url, auth_header, poll_interval_minutes, enabled, options)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        trimmedName,
        normalizedSource,
        normalizedImport,
        endpointUrl || null,
        authHeader || null,
        poll,
        enabled !== false,
        options || {}
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (String(err?.message || "").includes("duplicate key")) {
      return res.status(409).json({ error: "name_exists" });
    }
    next(err);
  }
});

router.put("/integrations/:id", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      sourceType,
      importType,
      endpointUrl,
      authHeader,
      pollIntervalMinutes,
      enabled,
      options
    } = req.body || {};

    const existing = await query("SELECT * FROM import_integrations WHERE id=$1", [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: "not_found" });
    const current = existing.rows[0];

    const nextName = name === undefined ? current.name : String(name || "").trim();
    const nextSource = sourceType === undefined ? current.source_type : importsCore.parseSourceType(sourceType);
    const nextImport = importType === undefined ? current.import_type : importsCore.parseImportType(importType);
    const nextPoll = pollIntervalMinutes === undefined
      ? current.poll_interval_minutes
      : (pollIntervalMinutes === null || pollIntervalMinutes === "" ? null : importsCore.parsePositiveInteger(pollIntervalMinutes));

    if (!nextName || !importsCore.VALID_INTEGRATION_SOURCE_TYPES.includes(nextSource) || !importsCore.VALID_IMPORT_TYPES.includes(nextImport)) {
      return res.status(400).json({ error: "required_fields_missing" });
    }
    if (pollIntervalMinutes !== undefined && pollIntervalMinutes !== null && pollIntervalMinutes !== "" && nextPoll === null) {
      return res.status(400).json({ error: "invalid_poll_interval" });
    }

    const updated = await query(
      `UPDATE import_integrations
       SET name=$1,
           source_type=$2,
           import_type=$3,
           endpoint_url=$4,
           auth_header=$5,
           poll_interval_minutes=$6,
           enabled=$7,
           options=$8,
           updated_at=NOW()
       WHERE id=$9
       RETURNING *`,
      [
        nextName,
        nextSource,
        nextImport,
        endpointUrl === undefined ? current.endpoint_url : (endpointUrl || null),
        authHeader === undefined ? current.auth_header : (authHeader || null),
        nextPoll,
        enabled === undefined ? current.enabled : enabled !== false,
        options === undefined ? current.options : (options || {}),
        id
      ]
    );

    res.json(updated.rows[0]);
  } catch (err) {
    if (String(err?.message || "").includes("duplicate key")) {
      return res.status(409).json({ error: "name_exists" });
    }
    next(err);
  }
});

router.post("/integrations/:id/pull", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const integrationRes = await query("SELECT * FROM import_integrations WHERE id=$1", [id]);
    const integration = integrationRes.rows[0];
    if (!integration) return res.status(404).json({ error: "not_found" });

    const payloadOverride = req.body && Object.keys(req.body).length ? req.body : null;
    const result = await importsCore.runConfiguredIntegration(integration, {
      triggerMode: "manual",
      payloadOverride,
      role: importsCore.requestRole(req) || "Admin"
    });

    const statusCode = importsCore.importResponseStatusCode(result);
    res.status(statusCode).json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/runs", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const { limit = "50" } = req.query;
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const { rows } = await query(
      `SELECT * FROM import_runs ORDER BY created_at DESC LIMIT $1`,
      [safeLimit]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get("/runs/:id/support-bundle", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const runId = importsCore.parsePositiveInteger(req.params.id);
    if (!runId) return res.status(400).json({ error: "invalid_run_id" });

    const runRes = await query(
      `SELECT id, integration_id, source_type, import_type, trigger_mode, status, summary, errors, created_at
       FROM import_runs
       WHERE id=$1`,
      [runId]
    );
    const run = runRes.rows[0];
    if (!run) return res.status(404).json({ error: "not_found" });

    res.json({
      runId: run.id,
      supportBundle: importsCore.deriveSupportBundleFromRunRow(run)
    });
  } catch (err) {
    next(err);
  }
});

router.get("/support-bundles", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const safeLimit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const { rows } = await query(
      `SELECT id, integration_id, source_type, import_type, trigger_mode, status, summary, errors, created_at
       FROM import_runs
       ORDER BY id DESC
       LIMIT $1`,
      [safeLimit]
    );
    const payload = rows.map((run) => ({
      runId: run.id,
      status: run.status,
      sourceType: run.source_type,
      importType: run.import_type,
      createdAt: run.created_at,
      supportBundle: importsCore.deriveSupportBundleFromRunRow(run)
    }));
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.get("/unresolved", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const status = String(req.query.status || "open").trim().toLowerCase();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const filters = [];
    const params = [];
    if (status && ["open", "resolved", "ignored"].includes(status)) {
      params.push(status);
      filters.push(`status=$${params.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    params.push(limit);

    const { rows } = await query(
      `SELECT * FROM import_unresolved_items ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/unresolved/:id/resolve", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const unresolvedRes = await query(
      "SELECT * FROM import_unresolved_items WHERE id=$1",
      [id]
    );
    const item = unresolvedRes.rows[0];
    if (!item) return res.status(404).json({ error: "not_found" });
    if (item.status !== "open") return res.status(409).json({ error: "already_resolved" });

    const assignment = req.body?.assignment || {};
    const normalizedAssignment = {
      job_id: assignment.jobId ?? assignment.job_id,
      part_id: assignment.partId ?? assignment.part_id,
      operation_id: assignment.operationId ?? assignment.operation_id,
      operation_ref: assignment.operationRef ?? assignment.operation_ref,
      operator_user_id: assignment.operatorUserId ?? assignment.operator_user_id,
      dimension_id: assignment.dimensionId ?? assignment.dimension_id,
      dimension_name: assignment.dimensionName ?? assignment.dimension_name,
      piece_number: assignment.pieceNumber ?? assignment.piece_number,
      value: assignment.value,
      is_oot: assignment.isOot ?? assignment.is_oot,
      status: assignment.status,
      comment: assignment.comment,
      missing_reason: assignment.missingReason ?? assignment.missing_reason,
      nc_num: assignment.ncNum ?? assignment.nc_num,
      details: assignment.details
    };
    const payload = {
      ...(item.payload?.inferred || {}),
      ...normalizedAssignment
    };

    const row = importsCore.normalizeObjectRows([payload])[0];
    const result = await importsCore.importMeasurementsRows([row], {
      sourceType: "manual_resolution",
      role: importsCore.requestRole(req),
      forceJobId: assignment.jobId,
      forcePartId: assignment.partId,
      forceOperationId: assignment.operationId,
      forceOperatorUserId: assignment.operatorUserId,
      defaultStatus: assignment.status,
      defaultComment: assignment.comment,
      requireOpenJob: false
    });

    if (!result.inserted) {
      return res.status(400).json({
        error: "resolution_failed",
        details: result.errors,
        unresolvedCount: result.unresolvedCount
      });
    }

    await query(
      `UPDATE import_unresolved_items
       SET status='resolved',
           resolved_payload=$2,
           resolved_by_role=$3,
           resolved_at=NOW()
       WHERE id=$1`,
      [id, payload, importsCore.requestRole(req)]
    );

    res.json({ ok: true, imported: result.inserted });
  } catch (err) {
    next(err);
  }
});

router.post("/unresolved/:id/ignore", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await query(
      `UPDATE import_unresolved_items
       SET status='ignored',
           resolved_payload=$2,
           resolved_by_role=$3,
           resolved_at=NOW()
       WHERE id=$1 AND status='open'
       RETURNING id`,
      [id, req.body || {}, importsCore.requestRole(req)]
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/webhooks/:importType", async (req, res, next) => {
  try {
    const importType = importsCore.parseImportType(req.params.importType);
    if (!importsCore.VALID_IMPORT_TYPES.includes(importType)) {
      return res.status(400).json({ error: "invalid_import_type" });
    }

    const integrationId = importsCore.parsePositiveInteger(req.body?.integrationId || req.query.integrationId || req.header("x-import-integration-id"));
    let integration = null;
    if (integrationId) {
      const integrationRes = await query("SELECT * FROM import_integrations WHERE id=$1", [integrationId]);
      integration = integrationRes.rows[0] || null;
      if (!integration) return res.status(404).json({ error: "integration_not_found" });
      if (integration.import_type !== importType) {
        return res.status(400).json({ error: "integration_type_mismatch" });
      }
      if (integration.auth_header) {
        const secret = String(req.header("x-import-secret") || "").trim();
        if (!secret || secret !== String(integration.auth_header)) {
          return res.status(401).json({ error: "invalid_webhook_secret" });
        }
      }
    }

    const directRuntime = integration ? null : await importsCore.executeConnectorManagedImport({
      integrationId: null,
      sourceType: "webhook",
      importType,
      triggerMode: "webhook",
      payload: req.body,
      role: "Admin"
    });

    const result = integration
      ? await importsCore.runConfiguredIntegration(integration, {
          triggerMode: "webhook",
          payloadOverride: req.body,
          role: "Admin"
        })
      : directRuntime.result;

    if (!integration) {
      const runtime = {
        status: result.status,
        duplicate: result.duplicate,
        attempts: result.runtimeAttempts,
        idempotencyKey: result.idempotencyKey,
        replayMetadata: result.replayMetadata,
        errors: []
      };
      const run = await importsCore.insertRunLog({
        integrationId: null,
        sourceType: "webhook",
        importType,
        triggerMode: "webhook",
        result,
        runtime
      });
      await importsCore.persistUnresolvedItems(result.unresolvedItems || [], {
        runId: run.runId,
        sourceType: "webhook"
      });
      await importsCore.persistExternalEntityRefs(directRuntime.externalRefs || [], {
        runId: run.runId,
        sourceType: "webhook",
        importType
      });
      await importsCore.finalizeIdempotencyLedgerEntry({
        idempotencyKey: result.idempotencyKey,
        runId: run.runId,
        runStatus: run.status
      });
      result.runId = run.runId;
      result.runStatus = run.status;
    }

    const statusCode = importsCore.importResponseStatusCode(result);
    res.status(statusCode).json(result);
  } catch (err) {
    if (importsCore.safeErrorCode(err) === "csv_no_rows") {
      return res.status(400).json({ error: "csv_no_rows" });
    }
    next(err);
  }
});

router.get("/templates", requireCapability("view_admin"), (req, res) => {
  const templates = buildTemplateCatalog();
  res.json({
    ...templates,
    onboardingToolkit: buildOnboardingToolkit(templates)
  });
});

router.post("/onboarding/dry-run", requireCapability("view_admin"), (req, res, next) => {
  try {
    const importType = importsCore.parseImportType(req.body?.importType);
    const csvText = String(req.body?.csvText || "").trim();
    if (!importType) return res.status(400).json({ error: "invalid_import_type" });
    if (!csvText) return res.status(400).json({ error: "csv_required" });

    const templates = buildTemplateCatalog();
    const toolkit = buildOnboardingToolkit(templates);
    const report = buildDryRunReport({ importType, csvText, toolkit });
    res.json(report);
  } catch (err) {
    next(err);
  }
});

export default router;
