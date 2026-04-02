function toDate(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatShortTimestamp(value) {
  const date = toDate(value);
  if (!date) return "Not yet recorded";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function hoursSince(value) {
  const date = toDate(value);
  if (!date) return null;
  return Math.max(0, (Date.now() - date.getTime()) / (1000 * 60 * 60));
}

function summarizeImportRuns(summary) {
  const statuses = Array.isArray(summary?.events?.importRunStatus7d) ? summary.events.importRunStatus7d : [];
  return statuses.reduce((acc, row) => {
    const key = String(row?.status || "").toLowerCase();
    const count = Number(row?.count || 0);
    acc.total += count;
    if (key === "success") acc.success += count;
    if (key === "partial" || key === "error") acc.failures += count;
    return acc;
  }, { total: 0, success: 0, failures: 0 });
}

export function buildLiveTrustIndicators(summary, lifecycle) {
  const posture = summary?.runtimeSlo?.current || summary?.posture || {};
  const latestBackupAt = summary?.backups?.lastSuccessfulEvent?.ts
    || summary?.backups?.recentBackups?.[0]?.createdAt
    || null;
  const backupHours = hoursSince(latestBackupAt);
  const backupTone = latestBackupAt == null
    ? "warning"
    : backupHours <= 24
      ? "success"
      : backupHours <= 24 * 7
        ? "warning"
        : "danger";
  const importRollup = summarizeImportRuns(summary);
  const recentImportErrors = Array.isArray(summary?.events?.recentImportErrors) ? summary.events.recentImportErrors.length : 0;
  const recentBackupErrors = Array.isArray(summary?.events?.recentBackupErrors) ? summary.events.recentBackupErrors.length : 0;
  const recordCount = Number(summary?.database?.counts?.records_count || 0);
  const runCount = Number(summary?.database?.counts?.import_runs_count || 0);
  const withinBudget = Boolean(lifecycle?.capacity?.backupWithinBudget) && Boolean(lifecycle?.capacity?.logWithinBudget);

  return [
    {
      key: "operational-posture",
      label: "Operational posture",
      value: posture.label || "Review",
      detail: posture.summary || "Runtime SLO signals are being gathered.",
      tone: posture.tone || "warning"
    },
    {
      key: "backups",
      label: "Backup freshness",
      value: latestBackupAt == null ? "Needed" : backupTone === "success" ? "Current" : backupTone === "warning" ? "Watch" : "Stale",
      detail: latestBackupAt == null
        ? "Run a protected backup before rollout."
        : `Last verified ${formatShortTimestamp(latestBackupAt)}.`,
      tone: backupTone
    },
    {
      key: "update-readiness",
      label: "Update readiness",
      value: withinBudget ? "Ready" : "Review",
      detail: withinBudget
        ? `Retention targets are within the ${Number(lifecycle?.policy?.backupRetentionDays || 14)}-day plan.`
        : "Storage budgets need attention before the next update window.",
      tone: withinBudget ? "success" : "warning"
    },
    {
      key: "import-health",
      label: "Import health",
      value: recentImportErrors > 0 || importRollup.failures > 0
        ? "Watch"
        : importRollup.success > 0
          ? "Healthy"
          : "Ready",
      detail: recentImportErrors > 0 || importRollup.failures > 0
        ? `${recentImportErrors || importRollup.failures} recent import issue${(recentImportErrors || importRollup.failures) === 1 ? "" : "s"} need review.`
        : importRollup.success > 0
          ? `${importRollup.success} successful import run${importRollup.success === 1 ? "" : "s"} captured this week.`
          : "Connector monitoring is online and waiting for first activity.",
      tone: recentImportErrors > 0 || importRollup.failures > 0 ? "warning" : "success"
    },
    {
      key: "audit-confidence",
      label: "Audit/log confidence",
      value: recentBackupErrors > 0 ? "Review" : recordCount > 0 || runCount > 0 ? "Current" : "Ready",
      detail: recentBackupErrors > 0
        ? `${recentBackupErrors} backup log issue${recentBackupErrors === 1 ? "" : "s"} surfaced recently.`
        : recordCount > 0 || runCount > 0
          ? `${recordCount} records and ${runCount} import runs are traceable in-app.`
          : "Trace and log capture is ready for first production use.",
      tone: recentBackupErrors > 0 ? "warning" : "success"
    }
  ];
}

export function buildFallbackTrustIndicators({ dataStatus, jobs, records, toolLibrary, canViewAdmin }) {
  const jobCount = Object.keys(jobs || {}).length;
  const recordCount = Array.isArray(records) ? records.length : 0;
  const toolCount = toolLibrary && typeof toolLibrary === "object" ? Object.keys(toolLibrary).length : 0;
  const demoMode = dataStatus !== "live";

  return [
    {
      key: "backups",
      label: "Backup freshness",
      value: demoMode ? "Demo-ready" : "Protected",
      detail: demoMode
        ? "Sample workspace can be reset without affecting customer data."
        : "Protected backups are managed through admin-controlled runbooks.",
      tone: "success"
    },
    {
      key: "update-readiness",
      label: "Update readiness",
      value: demoMode ? "Local ready" : "Ready",
      detail: demoMode
        ? "This workspace is safe for walkthroughs, training, and dry runs."
        : canViewAdmin ? "Operational controls are available from the admin workspace." : "Deployment controls are available to authorized administrators.",
      tone: "success"
    },
    {
      key: "import-health",
      label: "Import health",
      value: jobCount > 0 ? "Ready" : "Waiting",
      detail: jobCount > 0
        ? `${jobCount} jobs and ${toolCount} tools are loaded for a guided walkthrough.`
        : "Import pathways are ready to be demonstrated with customer data.",
      tone: jobCount > 0 ? "success" : "neutral"
    },
    {
      key: "audit-confidence",
      label: "Audit/log confidence",
      value: recordCount > 0 ? "Current" : "Ready",
      detail: recordCount > 0
        ? `${recordCount} traceable records are available to review during the demo.`
        : "Audit and trace history will appear as soon as the first inspection is recorded.",
      tone: "success"
    }
  ];
}
