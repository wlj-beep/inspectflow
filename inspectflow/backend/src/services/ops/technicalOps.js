import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { query } from "../../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../../");
const varRoot = path.join(repoRoot, "var");
const backupRoot = process.env.BACKUP_ROOT || path.join(varRoot, "backups");
const backupLogFile = process.env.BACKUP_LOG_FILE || path.join(varRoot, "log", "backup-workflow.log");
const runtimeDir = path.join(varRoot, "runtime");
const logDir = path.join(varRoot, "log");
const lifecycleConfigPath = path.join(runtimeDir, "technical-ops-lifecycle.json");

function asIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function hoursSince(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return (Date.now() - date.getTime()) / (1000 * 60 * 60);
}

async function statSafe(targetPath) {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}

async function readDirSafe(targetPath) {
  try {
    return await fs.readdir(targetPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function summarizeDirectory(rootPath, maxEntries = 12000) {
  const rootStat = await statSafe(rootPath);
  if (!rootStat || !rootStat.isDirectory()) {
    return {
      path: rootPath,
      exists: false,
      fileCount: 0,
      directoryCount: 0,
      totalBytes: 0,
      latestModifiedAt: null
    };
  }

  const stack = [rootPath];
  let fileCount = 0;
  let directoryCount = 0;
  let totalBytes = 0;
  let latestMs = rootStat.mtimeMs || 0;
  let scannedEntries = 0;
  let truncated = false;

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await readDirSafe(current);
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const entryStat = await statSafe(fullPath);
      if (!entryStat) continue;
      scannedEntries += 1;
      latestMs = Math.max(latestMs, entryStat.mtimeMs || 0);

      if (entryStat.isDirectory()) {
        directoryCount += 1;
        if (scannedEntries < maxEntries) {
          stack.push(fullPath);
        } else {
          truncated = true;
        }
      } else if (entryStat.isFile()) {
        fileCount += 1;
        totalBytes += Number(entryStat.size || 0);
      }
    }
    if (scannedEntries >= maxEntries) {
      truncated = true;
      break;
    }
  }

  return {
    path: rootPath,
    exists: true,
    fileCount,
    directoryCount,
    totalBytes,
    latestModifiedAt: latestMs ? new Date(latestMs).toISOString() : null,
    scan: {
      scannedEntries,
      maxEntries,
      truncated
    }
  };
}

async function readJsonSafe(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function tailLines(filePath, lineLimit = 250) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.slice(Math.max(0, lines.length - lineLimit));
  } catch {
    return [];
  }
}

function parseBackupEvents(lines) {
  const events = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") {
        events.push({
          ts: asIso(parsed.ts),
          level: String(parsed.level || "info"),
          action: String(parsed.action || "unknown"),
          status: String(parsed.status || "unknown"),
          message: String(parsed.message || ""),
          details: parsed.details ?? ""
        });
      }
    } catch {
      // ignore malformed log lines
    }
  }
  return events;
}

function classifySignalStatus(value) {
  if (value === "down") return "down";
  if (value === "degraded") return "degraded";
  if (value === "warning") return "warning";
  return "healthy";
}

function severityRank(status) {
  if (status === "down") return 3;
  if (status === "degraded") return 2;
  if (status === "warning") return 1;
  return 0;
}

const RUNTIME_SLO_TARGETS = Object.freeze({
  uptime: {
    targetPct: 99.5,
    warningPct: 99.25,
    breachPct: 99.0,
    monthlyErrorBudgetMinutes: 216
  },
  importSuccess: {
    targetPct: 99,
    warningPct: 97.5,
    breachPct: 95
  }
});

const RUNTIME_SLO_ALERT_THRESHOLDS = Object.freeze({
  backupFreshnessHours: {
    warning: 24,
    degraded: 72
  },
  importIssueCount: {
    warning: 1,
    degraded: 3
  },
  storageBudgetUsagePct: {
    warning: 80,
    degraded: 95
  }
});

const RUNTIME_SLO_INCIDENT_RESPONSE = Object.freeze({
  runbookPath: "docs/technical-ops-runbook.md",
  escalationModes: [
    {
      status: "warning",
      action: "Review the technical-ops watchlist and confirm whether the current window can continue."
    },
    {
      status: "degraded",
      action: "Mitigate the active signal, validate imports and backups, and document the rollback-safe path."
    },
    {
      status: "down",
      action: "Open an incident, pause risky changes, and follow the runbook command sequence before resuming."
    }
  ],
  commands: [
    "npm run backup:create",
    "npm run backup:verify",
    "npm run backup:run-scheduled"
  ]
});

function buildOperationalPosture({ health, database, lifecycle, backups, events }) {
  const signals = [];

  signals.push({
    key: "service",
    status: "healthy",
    label: "Service",
    detail: `${health.service} is responding with process uptime ${health.process.uptimeSeconds}s.`
  });

  signals.push({
    key: "database",
    status: database?.connected ? "healthy" : "down",
    label: "Database",
    detail: database?.connected
      ? `Database heartbeat at ${database.heartbeatAt || "unknown time"}.`
      : "Database heartbeat is unavailable."
  });

  const backupFreshnessHours = hoursSince(backups.lastSuccessfulEvent?.ts || backups.recentBackups?.[0]?.createdAt);
  const backupFreshnessStatus = backupFreshnessHours == null
    ? "warning"
    : backupFreshnessHours <= 24
      ? "healthy"
      : backupFreshnessHours <= 72
        ? "warning"
        : "degraded";
  signals.push({
    key: "backup_freshness",
    status: backupFreshnessStatus,
    label: "Backup freshness",
    detail: backupFreshnessHours == null
      ? "No verified backup timestamp is available."
      : `Last verified backup was ${Math.round(backupFreshnessHours)} hour${Math.round(backupFreshnessHours) === 1 ? "" : "s"} ago.`
  });

  const lifecycleCapacity = lifecycle?.capacity || {};
  const storageWithinBudget = lifecycleCapacity.backupWithinBudget !== false && lifecycleCapacity.logWithinBudget !== false;
  signals.push({
    key: "storage_budget",
    status: storageWithinBudget ? "healthy" : "warning",
    label: "Storage budget",
    detail: storageWithinBudget
      ? "Backup and log usage are within the current lifecycle budget."
      : "Backup or log usage has crossed the current lifecycle budget."
  });

  const importIssues = (events?.recentImportErrors || []).length + (events?.importRunStatus7d || [])
    .reduce((sum, row) => {
      const key = String(row?.status || "").toLowerCase();
      return sum + (key === "error" || key === "partial" ? Number(row?.count || 0) : 0);
    }, 0);
  const backupIssues = (events?.recentBackupErrors || []).length;
  const eventIssueCount = importIssues + backupIssues;
  signals.push({
    key: "event_pressure",
    status: eventIssueCount === 0 ? "healthy" : eventIssueCount <= 3 ? "warning" : "degraded",
    label: "Event pressure",
    detail: eventIssueCount === 0
      ? "No recent import or backup anomalies are currently elevated."
      : `${eventIssueCount} recent import or backup issue${eventIssueCount === 1 ? "" : "s"} need review.`
  });

  const worstSignal = signals.reduce((currentWorst, signal) => {
    if (!currentWorst) return signal;
    return severityRank(signal.status) > severityRank(currentWorst.status) ? signal : currentWorst;
  }, null);
  const status = classifySignalStatus(worstSignal?.status);
  const tone = status === "healthy" ? "success" : status === "warning" ? "warning" : "danger";
  const label = status === "healthy"
    ? "Operationally ready"
    : status === "warning"
      ? "Watchlist active"
      : "Operational review required";
  const summary = status === "healthy"
    ? "All runtime SLO signals are green."
    : worstSignal?.detail || "One or more runtime SLO signals need attention.";

  return {
    contractId: "PLAT-OPS-v1",
    status,
    tone,
    label,
    summary,
    generatedAt: health.timestamp,
    signals
  };
}

async function listRecentBackups(limit = 15) {
  const entries = await readDirSafe(backupRoot);
  const backupDirs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(backupRoot, entry.name);
    const dirStat = await statSafe(fullPath);
    if (!dirStat) continue;
    const manifest = await readJsonSafe(path.join(fullPath, "manifest.json"));
    const dumpStat = await statSafe(path.join(fullPath, "database.dump"));
    backupDirs.push({
      runId: manifest?.runId || entry.name,
      path: fullPath,
      createdAt: asIso(manifest?.createdAt || dirStat.mtime),
      retentionDays: Number(manifest?.retentionDays || process.env.BACKUP_RETENTION_DAYS || 14),
      databaseDumpBytes: Number(dumpStat?.size || 0),
      hasDatabaseDump: Boolean(dumpStat),
      hasConfigArchive: Boolean(await statSafe(path.join(fullPath, "config.tgz")))
    });
  }

  backupDirs.sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
  return backupDirs.slice(0, limit);
}

async function getDatabaseSignals() {
  const heartbeat = await query("SELECT NOW() AS now_utc");

  const tableCountsRes = await query(
    `SELECT
      (SELECT COUNT(*)::INT FROM users) AS users_count,
      (SELECT COUNT(*)::INT FROM jobs) AS jobs_count,
      (SELECT COUNT(*)::INT FROM records) AS records_count,
      (SELECT COUNT(*)::INT FROM import_runs) AS import_runs_count,
      (SELECT COUNT(*)::INT FROM import_unresolved_items WHERE status='open') AS unresolved_open_count,
      (SELECT COUNT(*)::INT FROM ana_risk_event_log WHERE status <> 'resolved') AS risk_events_open_count`
  );

  const freshnessRes = await query(
    `SELECT
      (SELECT MAX(created_at) FROM import_runs) AS latest_import_run_at,
      (SELECT MAX(timestamp) FROM records) AS latest_record_at,
      (SELECT MAX(submitted_at) FROM issue_reports) AS latest_issue_at`
  );

  return {
    connected: true,
    heartbeatAt: asIso(heartbeat.rows[0]?.now_utc),
    counts: tableCountsRes.rows[0] || {},
    freshness: {
      latestImportRunAt: asIso(freshnessRes.rows[0]?.latest_import_run_at),
      latestRecordAt: asIso(freshnessRes.rows[0]?.latest_record_at),
      latestIssueAt: asIso(freshnessRes.rows[0]?.latest_issue_at)
    }
  };
}

async function getErrorAndEventSummary() {
  const statusRes = await query(
    `SELECT status, COUNT(*)::INT AS count
     FROM import_runs
     WHERE created_at >= NOW() - INTERVAL '7 days'
     GROUP BY status
     ORDER BY status ASC`
  );
  const unresolvedRes = await query(
    `SELECT status, COUNT(*)::INT AS count
     FROM import_unresolved_items
     GROUP BY status
     ORDER BY status ASC`
  );
  const riskRes = await query(
    `SELECT status, COUNT(*)::INT AS count
     FROM ana_risk_event_log
     GROUP BY status
     ORDER BY status ASC`
  );
  const recentRunErrorsRes = await query(
    `SELECT id, source_type, import_type, trigger_mode, status, errors, created_at
     FROM import_runs
     WHERE status IN ('error', 'partial')
     ORDER BY created_at DESC
     LIMIT 15`
  );
  const backupEvents = parseBackupEvents(await tailLines(backupLogFile, 400));
  const recentBackupErrors = backupEvents
    .filter((event) => event.level === "error" || event.status === "failed")
    .slice(-15)
    .reverse();

  return {
    importRunStatus7d: statusRes.rows.map((row) => ({
      status: row.status,
      count: Number(row.count || 0)
    })),
    unresolvedItems: unresolvedRes.rows.map((row) => ({
      status: row.status,
      count: Number(row.count || 0)
    })),
    riskEvents: riskRes.rows.map((row) => ({
      status: row.status,
      count: Number(row.count || 0)
    })),
    recentImportErrors: recentRunErrorsRes.rows.map((row) => ({
      runId: Number(row.id),
      status: row.status,
      sourceType: row.source_type,
      importType: row.import_type,
      triggerMode: row.trigger_mode,
      createdAt: asIso(row.created_at),
      errors: Array.isArray(row.errors) ? row.errors.slice(0, 3) : []
    })),
    recentBackupErrors
  };
}

async function getBackupSignals() {
  const backups = await listRecentBackups(20);
  const totalBytes = backups.reduce((sum, backup) => sum + Number(backup.databaseDumpBytes || 0), 0);
  const backupEvents = parseBackupEvents(await tailLines(backupLogFile, 600));
  const latestEvent = backupEvents.length ? backupEvents[backupEvents.length - 1] : null;
  const lastSuccess = [...backupEvents].reverse().find((event) => event.status === "ok") || null;

  return {
    backupRoot,
    backupLogFile,
    retentionDays: Number(process.env.BACKUP_RETENTION_DAYS || 14),
    backupCount: backups.length,
    totalDatabaseDumpBytes: totalBytes,
    latestEvent,
    lastSuccessfulEvent: lastSuccess,
    recentBackups: backups
  };
}

async function getStorageSignals() {
  const [backupUsage, runtimeUsage, logUsage] = await Promise.all([
    summarizeDirectory(backupRoot),
    summarizeDirectory(runtimeDir),
    summarizeDirectory(logDir)
  ]);

  const memTotal = os.totalmem();
  const memFree = os.freemem();
  return {
    memory: {
      totalBytes: memTotal,
      freeBytes: memFree,
      usedBytes: memTotal - memFree
    },
    directories: {
      backups: backupUsage,
      runtime: runtimeUsage,
      logs: logUsage
    }
  };
}

export async function getTechnicalOpsHealth() {
  return {
    service: "inspectflow-backend",
    timestamp: new Date().toISOString(),
    process: {
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version
    },
    memory: {
      rssBytes: process.memoryUsage().rss,
      heapUsedBytes: process.memoryUsage().heapUsed,
      heapTotalBytes: process.memoryUsage().heapTotal
    },
    scheduler: {
      importSchedulerEnabled: process.env.NODE_ENV !== "test"
    }
  };
}

export async function getTechnicalOpsSummary() {
  const [health, database, storage, backups, events, lifecycle] = await Promise.all([
    getTechnicalOpsHealth(),
    getDatabaseSignals(),
    getStorageSignals(),
    getBackupSignals(),
    getErrorAndEventSummary(),
    getDataLifecycleSummary()
  ]);
  const posture = buildOperationalPosture({ health, database, storage, backups, events, lifecycle });

  return {
    contractId: "PLAT-DEPLOY-v1",
    generatedAt: new Date().toISOString(),
    health,
    database,
    storage,
    backups,
    events,
    posture,
    runtimeSlo: {
      contractId: "PLAT-SLO-v1",
      generatedAt: posture.generatedAt,
      targets: RUNTIME_SLO_TARGETS,
      alertThresholds: RUNTIME_SLO_ALERT_THRESHOLDS,
      incidentResponse: RUNTIME_SLO_INCIDENT_RESPONSE,
      current: {
        status: posture.status,
        tone: posture.tone,
        label: posture.label,
        summary: posture.summary
      },
      signals: posture.signals,
      signalCount: posture.signals.length
    }
  };
}

export async function getTechnicalOpsStorageSummary() {
  return getStorageSignals();
}

export async function getTechnicalOpsBackupSummary() {
  return getBackupSignals();
}

export async function getTechnicalOpsEventSummary() {
  return getErrorAndEventSummary();
}

function toHealthIndicator(status, enabled) {
  if (!enabled) return "disabled";
  if (!status) return "unknown";
  if (status === "success") return "healthy";
  if (status === "partial") return "degraded";
  return "down";
}

function safeJsonObject(value) {
  return value && typeof value === "object" ? value : {};
}

export async function getIntegrationMonitoringSummary({ limit = 80 } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 80));
  const { rows } = await query(
    `SELECT ii.id, ii.name, ii.source_type, ii.import_type, ii.endpoint_url, ii.enabled,
            ii.last_run_at, ii.last_status, ii.last_message,
            latest.id AS latest_run_id, latest.status AS latest_run_status, latest.created_at AS latest_run_at_internal,
            latest.summary AS latest_run_summary, latest.errors AS latest_run_errors
       FROM import_integrations ii
       LEFT JOIN LATERAL (
         SELECT id, status, created_at, summary, errors
         FROM import_runs
         WHERE integration_id=ii.id
         ORDER BY created_at DESC
         LIMIT 1
       ) latest ON true
       ORDER BY ii.id DESC
       LIMIT $1`,
    [safeLimit]
  );

  const integrations = rows.map((row) => {
    const summary = safeJsonObject(row.latest_run_summary);
    const runtime = safeJsonObject(summary.runtime);
    const replayMetadata = safeJsonObject(runtime.replayMetadata);
    return {
      id: Number(row.id),
      name: row.name,
      sourceType: row.source_type,
      importType: row.import_type,
      endpointUrl: row.endpoint_url,
      enabled: Boolean(row.enabled),
      healthIndicator: toHealthIndicator(row.last_status, row.enabled),
      lastStatus: row.last_status || "never_run",
      lastMessage: row.last_message || null,
      lastRunAt: asIso(row.last_run_at || row.latest_run_at_internal),
      latestRun: {
        runId: row.latest_run_id ? Number(row.latest_run_id) : null,
        status: row.latest_run_status || row.last_status || null,
        createdAt: asIso(row.latest_run_at_internal),
        replayMetadata: Object.keys(replayMetadata).length ? replayMetadata : null,
        errorCount: Array.isArray(row.latest_run_errors) ? row.latest_run_errors.length : 0
      }
    };
  });

  const healthCounts = integrations.reduce((acc, item) => {
    const key = item.healthIndicator || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const recentFailuresRes = await query(
    `SELECT id, integration_id, source_type, import_type, status, created_at, summary, errors
       FROM import_runs
       WHERE integration_id IS NOT NULL AND status IN ('partial', 'error')
       ORDER BY created_at DESC
       LIMIT 25`
  );

  const recentFailures = recentFailuresRes.rows.map((row) => ({
    runId: Number(row.id),
    integrationId: Number(row.integration_id),
    sourceType: row.source_type,
    importType: row.import_type,
    status: row.status,
    createdAt: asIso(row.created_at),
    replayMetadata: safeJsonObject(row.summary?.runtime?.replayMetadata),
    errors: Array.isArray(row.errors) ? row.errors.slice(0, 4) : []
  }));

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      integrations: integrations.length,
      enabled: integrations.filter((item) => item.enabled).length,
      byHealthIndicator: healthCounts
    },
    integrations,
    recentFailures
  };
}

export async function getIntegrationRunHistory(integrationId, { limit = 50 } = {}) {
  const id = Number(integrationId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("invalid_integration_id");
  }
  const safeLimit = Math.max(1, Math.min(300, Number(limit) || 50));

  const integrationRes = await query(
    `SELECT id, name, source_type, import_type, endpoint_url, enabled, last_run_at, last_status
     FROM import_integrations
     WHERE id=$1`,
    [id]
  );
  const integration = integrationRes.rows[0];
  if (!integration) return null;

  const runsRes = await query(
    `SELECT id, status, trigger_mode, total_rows, inserted_count, updated_count, failed_count, summary, errors, created_at
     FROM import_runs
     WHERE integration_id=$1
     ORDER BY created_at DESC
     LIMIT $2`,
    [id, safeLimit]
  );

  return {
    integration: {
      id: Number(integration.id),
      name: integration.name,
      sourceType: integration.source_type,
      importType: integration.import_type,
      endpointUrl: integration.endpoint_url,
      enabled: Boolean(integration.enabled),
      lastRunAt: asIso(integration.last_run_at),
      lastStatus: integration.last_status || "never_run"
    },
    runs: runsRes.rows.map((row) => ({
      runId: Number(row.id),
      status: row.status,
      triggerMode: row.trigger_mode,
      counts: {
        totalRows: Number(row.total_rows || 0),
        inserted: Number(row.inserted_count || 0),
        updated: Number(row.updated_count || 0),
        failed: Number(row.failed_count || 0)
      },
      createdAt: asIso(row.created_at),
      replayMetadata: safeJsonObject(row.summary?.runtime?.replayMetadata),
      errors: Array.isArray(row.errors) ? row.errors.slice(0, 6) : []
    }))
  };
}

async function getDataGrowthTableCounts() {
  const { rows } = await query(
    `SELECT
      (SELECT COUNT(*)::BIGINT FROM records) AS records_count,
      (SELECT COUNT(*)::BIGINT FROM import_runs) AS import_runs_count,
      (SELECT COUNT(*)::BIGINT FROM audit_log) AS audit_log_count,
      (SELECT COUNT(*)::BIGINT FROM ana_risk_event_log) AS risk_event_log_count`
  );

  return rows[0] || {};
}

function defaultLifecyclePolicy() {
  return {
    backupRetentionDays: Number(process.env.BACKUP_RETENTION_DAYS || 14),
    targetBackupBudgetMb: 2048,
    targetLogBudgetMb: 1024,
    dataGrowthPolicy: {
      schemaVersion: "tech-ops-data-growth-v1",
      reviewCadenceDays: 30,
      archivalRollbackWindowDays: 14,
      largeTables: [
        {
          table: "records",
          reviewRowCount: 5000000,
          partitionKey: "timestamp",
          archiveAfterDays: 540,
          indexGuidance: [
            "Review lot, job, operation, and timestamp access paths before adding new secondary indexes.",
            "Build replacement indexes with online or concurrent creation and validate query plans before removing legacy coverage."
          ],
          partitionGuidance:
            "Promote records to monthly timestamp partitions once growth reaches the review threshold or retention pruning becomes slow.",
          archiveGuidance:
            "Archive closed inspection history older than 18 months into immutable manifests before detach or delete operations."
        },
        {
          table: "import_runs",
          reviewRowCount: 1000000,
          partitionKey: "created_at",
          archiveAfterDays: 365,
          indexGuidance: [
            "Keep status, integration_id, and created_at lookups covered for operator replay and failure triage paths.",
            "Prefer additive indexes first and remove superseded indexes only after replay and reporting checks pass."
          ],
          partitionGuidance:
            "Use monthly created_at partitions when connector run history and retry evidence exceed the hot-storage budget.",
          archiveGuidance:
            "Archive completed run summaries older than 12 months after replay windows expire and support bundles are retained."
        },
        {
          table: "audit_log",
          reviewRowCount: 3000000,
          partitionKey: "timestamp",
          archiveAfterDays: 730,
          indexGuidance: [
            "Preserve record_id and timestamp lookup performance for traceability reviews before adding broader audit indexes.",
            "Create any new audit indexes online and keep pre-change indexes available until export validation succeeds."
          ],
          partitionGuidance:
            "Segment audit history by timestamp when year-over-year growth makes traceability exports or cleanup windows unpredictable.",
          archiveGuidance:
            "Export audit rows older than 24 months to signed archive bundles before destructive cleanup."
        },
        {
          table: "ana_risk_event_log",
          reviewRowCount: 1000000,
          partitionKey: "created_at",
          archiveAfterDays: 365,
          indexGuidance: [
            "Protect dedupe_key, status, severity, and created_at read paths before adding exploratory analytics indexes.",
            "Validate open-risk dashboards and acknowledgement flows after any index replacement."
          ],
          partitionGuidance:
            "Move to monthly created_at partitions when risk history growth starts to slow unresolved-event scans or analytics refreshes.",
          archiveGuidance:
            "Archive resolved risk events older than 12 months with their escalation context before partition detach or delete."
        }
      ],
      rollbackGuardrails: [
        "Ship additive changes first: create new indexes, partitions, or archive targets before redirecting readers or writers.",
        "Backfill in bounded batches with row-count and checksum validation, and keep source structures writable until verification passes.",
        "Retain restore manifests, legacy indexes, and source partitions for at least the rollback window before irreversible cleanup."
      ],
      evidenceSources: ["/api/technical-ops/lifecycle/summary", "docs/technical-ops-runbook.md"]
    }
  };
}

async function readLifecyclePolicy() {
  const defaults = defaultLifecyclePolicy();
  try {
    const raw = await fs.readFile(lifecycleConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    const configuredGrowthPolicy =
      parsed?.dataGrowthPolicy && typeof parsed.dataGrowthPolicy === "object" ? parsed.dataGrowthPolicy : {};
    const defaultGrowthPolicy = defaults.dataGrowthPolicy;
    return {
      backupRetentionDays: Number(parsed?.backupRetentionDays || defaults.backupRetentionDays),
      targetBackupBudgetMb: Number(parsed?.targetBackupBudgetMb || defaults.targetBackupBudgetMb),
      targetLogBudgetMb: Number(parsed?.targetLogBudgetMb || defaults.targetLogBudgetMb),
      dataGrowthPolicy: {
        schemaVersion: defaultGrowthPolicy.schemaVersion,
        reviewCadenceDays:
          Number(configuredGrowthPolicy.reviewCadenceDays) > 0
            ? Number(configuredGrowthPolicy.reviewCadenceDays)
            : defaultGrowthPolicy.reviewCadenceDays,
        archivalRollbackWindowDays:
          Number(configuredGrowthPolicy.archivalRollbackWindowDays) > 0
            ? Number(configuredGrowthPolicy.archivalRollbackWindowDays)
            : defaultGrowthPolicy.archivalRollbackWindowDays,
        largeTables:
          Array.isArray(configuredGrowthPolicy.largeTables) && configuredGrowthPolicy.largeTables.length > 0
            ? configuredGrowthPolicy.largeTables
            : defaultGrowthPolicy.largeTables,
        rollbackGuardrails:
          Array.isArray(configuredGrowthPolicy.rollbackGuardrails) && configuredGrowthPolicy.rollbackGuardrails.length > 0
            ? configuredGrowthPolicy.rollbackGuardrails
            : defaultGrowthPolicy.rollbackGuardrails,
        evidenceSources:
          Array.isArray(configuredGrowthPolicy.evidenceSources) && configuredGrowthPolicy.evidenceSources.length > 0
            ? configuredGrowthPolicy.evidenceSources
            : defaultGrowthPolicy.evidenceSources
      },
      updatedAt: asIso(parsed?.updatedAt) || null
    };
  } catch {
    return {
      ...defaults,
      updatedAt: null
    };
  }
}

export async function updateLifecycleRetentionPolicy(input = {}) {
  const current = await readLifecyclePolicy();
  const next = {
    backupRetentionDays: Number(input.backupRetentionDays ?? current.backupRetentionDays),
    targetBackupBudgetMb: Number(input.targetBackupBudgetMb ?? current.targetBackupBudgetMb),
    targetLogBudgetMb: Number(input.targetLogBudgetMb ?? current.targetLogBudgetMb),
    dataGrowthPolicy: current.dataGrowthPolicy,
    updatedAt: new Date().toISOString()
  };

  for (const key of ["backupRetentionDays", "targetBackupBudgetMb", "targetLogBudgetMb"]) {
    if (!Number.isInteger(next[key]) || next[key] <= 0) {
      throw new Error(`invalid_${key}`);
    }
  }

  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.writeFile(lifecycleConfigPath, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function getDataLifecycleSummary() {
  const [policy, storage, backups, tableCounts] = await Promise.all([
    readLifecyclePolicy(),
    getStorageSignals(),
    getBackupSignals(),
    getDataGrowthTableCounts()
  ]);

  const backupBudgetBytes = policy.targetBackupBudgetMb * 1024 * 1024;
  const logBudgetBytes = policy.targetLogBudgetMb * 1024 * 1024;
  const backupUsed = Number(backups.totalDatabaseDumpBytes || 0);
  const logUsed = Number(storage?.directories?.logs?.totalBytes || 0);
  const dataGrowthPolicy = policy.dataGrowthPolicy || defaultLifecyclePolicy().dataGrowthPolicy;
  const tableCountByName = {
    records: Number(tableCounts.records_count || 0),
    import_runs: Number(tableCounts.import_runs_count || 0),
    audit_log: Number(tableCounts.audit_log_count || 0),
    ana_risk_event_log: Number(tableCounts.risk_event_log_count || 0)
  };

  return {
    generatedAt: new Date().toISOString(),
    policy,
    footprint: {
      backupBytes: backupUsed,
      backupCount: Number(backups.backupCount || 0),
      logBytes: logUsed
    },
    capacity: {
      backupBudgetBytes,
      logBudgetBytes,
      backupWithinBudget: backupUsed <= backupBudgetBytes,
      logWithinBudget: logUsed <= logBudgetBytes,
      backupRemainingBytes: backupBudgetBytes - backupUsed,
      logRemainingBytes: logBudgetBytes - logUsed
    },
    dataGrowth: {
      reviewCadenceDays: dataGrowthPolicy.reviewCadenceDays,
      archivalRollbackWindowDays: dataGrowthPolicy.archivalRollbackWindowDays,
      recommendations: dataGrowthPolicy.largeTables.map((tablePolicy) => ({
        table: tablePolicy.table,
        reviewRowCount: tablePolicy.reviewRowCount,
        partitionKey: tablePolicy.partitionKey,
        archiveAfterDays: tablePolicy.archiveAfterDays,
        indexGuidance: tablePolicy.indexGuidance,
        partitionGuidance: tablePolicy.partitionGuidance,
        archiveGuidance: tablePolicy.archiveGuidance
      })),
      currentFootprint: {
        backupBytes: backupUsed,
        logBytes: logUsed,
        tables: dataGrowthPolicy.largeTables.map((tablePolicy) => {
          const rowCount = tableCountByName[tablePolicy.table] ?? 0;
          return {
            table: tablePolicy.table,
            rowCount,
            reviewRowCount: tablePolicy.reviewRowCount,
            reviewStatus: rowCount >= tablePolicy.reviewRowCount ? "review_required" : "within_policy"
          };
        })
      },
      operatorNotes: dataGrowthPolicy.rollbackGuardrails,
      evidenceSources: dataGrowthPolicy.evidenceSources
    },
    operatorControls: {
      retentionUpdateEndpoint: "/api/technical-ops/lifecycle/retention",
      policyEvidenceEndpoint: "/api/technical-ops/lifecycle/summary",
      runbookPath: "docs/technical-ops-runbook.md",
      runbookCommands: [
        "npm run backup:create",
        "npm run backup:verify",
        "npm run backup:run-scheduled"
      ]
    }
  };
}
