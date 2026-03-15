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
  const [health, database, storage, backups, events] = await Promise.all([
    getTechnicalOpsHealth(),
    getDatabaseSignals(),
    getStorageSignals(),
    getBackupSignals(),
    getErrorAndEventSummary()
  ]);

  return {
    contractId: "PLAT-DEPLOY-v1",
    generatedAt: new Date().toISOString(),
    health,
    database,
    storage,
    backups,
    events
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

function defaultLifecyclePolicy() {
  return {
    backupRetentionDays: Number(process.env.BACKUP_RETENTION_DAYS || 14),
    targetBackupBudgetMb: 2048,
    targetLogBudgetMb: 1024
  };
}

async function readLifecyclePolicy() {
  const defaults = defaultLifecyclePolicy();
  try {
    const raw = await fs.readFile(lifecycleConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      backupRetentionDays: Number(parsed?.backupRetentionDays || defaults.backupRetentionDays),
      targetBackupBudgetMb: Number(parsed?.targetBackupBudgetMb || defaults.targetBackupBudgetMb),
      targetLogBudgetMb: Number(parsed?.targetLogBudgetMb || defaults.targetLogBudgetMb),
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
  const [policy, storage, backups] = await Promise.all([
    readLifecyclePolicy(),
    getStorageSignals(),
    getBackupSignals()
  ]);

  const backupBudgetBytes = policy.targetBackupBudgetMb * 1024 * 1024;
  const logBudgetBytes = policy.targetLogBudgetMb * 1024 * 1024;
  const backupUsed = Number(backups.totalDatabaseDumpBytes || 0);
  const logUsed = Number(storage?.directories?.logs?.totalBytes || 0);

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
    operatorControls: {
      retentionUpdateEndpoint: "/api/technical-ops/lifecycle/retention",
      runbookCommands: [
        "npm run backup:create",
        "npm run backup:verify",
        "npm run backup:run-scheduled"
      ]
    }
  };
}
