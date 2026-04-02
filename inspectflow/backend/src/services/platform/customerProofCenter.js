import { getPlatformEntitlements } from "./entitlements.js";
import { getPilotReadinessScorecard } from "../analytics/pilotReadiness.js";
import { getKpiDashboard } from "../analytics/kpiDashboard.js";
import { getTechnicalOpsSummary } from "../ops/technicalOps.js";
import { buildEcosystemCompatibilitySuite } from "../integration/ecosystemCompatibility.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function formatPercent(value) {
  const numeric = Number(value || 0) * 100;
  return `${Math.max(0, Math.min(100, Math.round(numeric)))}%`;
}

function formatTargetPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0%";
  return Number.isInteger(numeric) ? `${numeric}%` : `${numeric.toFixed(1)}%`;
}

function formatCountLabel(value, singular, plural = `${singular}s`) {
  const count = Number(value || 0);
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildFallbackReadiness({ siteScope = "default" } = {}) {
  return {
    contractId: "ANA-READINESS-v1",
    window: {
      dateFrom: null,
      dateTo: null
    },
    siteScope,
    sites: [
      {
        siteId: siteScope,
        valueScore: null,
        deploymentCompletion: { status: "staged" },
        adoptionMilestone: { milestone: "activated" },
        renewalRisk: { level: "low" }
      }
    ]
  };
}

function buildFallbackKpiDashboard() {
  return {
    contractId: "ANA-KPI-v3",
    dashboardId: "operator_supervisor_kpi_v1",
    kpis: {
      first_pass_yield: 0,
      on_time_delivery: 0,
      rework_rate: 0
    },
    breakdowns: {
      byWorkCenter: [],
      dailyTrend: []
    }
  };
}

function buildFallbackRuntimeSlo() {
  return {
    contractId: "PLAT-SLO-v1",
    current: {
      status: "staged",
      tone: "warning",
      label: "Reporting deferred",
      summary: "Runtime SLO targets are staged until technical ops data is available."
    },
    targets: {
      uptime: {
        targetPct: 99.5
      },
      importSuccess: {
        targetPct: 99
      }
    },
    alertThresholds: {
      backupFreshnessHours: {
        warning: 24,
        degraded: 72
      }
    },
    incidentResponse: {
      runbookPath: "docs/technical-ops-runbook.md"
    }
  };
}

function buildTrustIndicators(summary = {}) {
  const backups = asObject(summary.backups);
  const lifecycle = asObject(summary.lifecycle);
  const database = asObject(summary.database);
  const events = asObject(summary.events);

  const latestBackupAt = backups.lastSuccessfulEvent?.ts || backups.recentBackups?.[0]?.createdAt || null;
  const backupFreshness = latestBackupAt ? "Current" : "Pending";
  const updateReadiness = Boolean(lifecycle.capacity?.backupWithinBudget) && Boolean(lifecycle.capacity?.logWithinBudget)
    ? "Ready"
    : "Review";
  const recentImportIssues = asArray(events.recentImportErrors).length;
  const importHealth = recentImportIssues > 0 ? "Watch" : "Healthy";
  const recordCount = Number(database.counts?.records_count || 0);
  const runCount = Number(database.counts?.import_runs_count || 0);
  const auditConfidence = recordCount > 0 || runCount > 0 ? "Current" : "Ready";

  return [
    {
      key: "backups",
      label: "Backup freshness",
      value: backupFreshness,
      detail: latestBackupAt ? `Last verified ${new Date(latestBackupAt).toISOString()}.` : "No verified backup timestamp was available."
    },
    {
      key: "updates",
      label: "Update readiness",
      value: updateReadiness,
      detail: updateReadiness === "Ready"
        ? "Retention and storage targets are within plan."
        : "Retention and storage budgets need review before the next release window."
    },
    {
      key: "imports",
      label: "Import health",
      value: importHealth,
      detail: recentImportIssues > 0
        ? `${formatCountLabel(recentImportIssues, "import issue")} surfaced recently.`
        : "Connector monitoring is online and ready."
    },
    {
      key: "audit",
      label: "Audit/log confidence",
      value: auditConfidence,
      detail: recordCount > 0 || runCount > 0
        ? `${formatCountLabel(recordCount, "record")} and ${formatCountLabel(runCount, "import run")} are traceable in-app.`
        : "Audit and trace capture are ready for first customer use."
    }
  ];
}

function buildExecutiveBullets({ readiness, kpiDashboard, trustIndicators, entitlements }) {
  const bullets = [];
  const scorecard = readiness?.sites?.[0] || null;
  const kpis = asObject(kpiDashboard?.kpis);
  const trust = asArray(trustIndicators);
  const activeBundles = asArray(entitlements?.packaging?.activeBundles).map((bundle) => bundle.label || bundle.bundleId);

  if (scorecard) {
    bullets.push(`Value score ${scorecard.valueScore}/100 with ${scorecard.deploymentCompletion?.status || "staged"} deployment readiness.`);
  }
  if (kpis.first_pass_yield !== undefined && kpis.first_pass_yield !== null) {
    bullets.push(`First-pass yield is ${formatPercent(kpis.first_pass_yield)} across the selected reporting window.`);
  }
  if (activeBundles.length) {
    bullets.push(`Enabled bundles: ${activeBundles.join(", ")}.`);
  }
  if (trust.length) {
    bullets.push(`Customer trust is supported by ${trust.map((item) => item.value).join(", ").toLowerCase()}.`);
  }

  return bullets.slice(0, 4);
}

function buildShareableText({ proofPack, readiness, kpiDashboard, ecosystem }) {
  const scorecard = readiness?.sites?.[0] || null;
  const runtimeSlo = ecosystem?.runtimeSlo || null;
  const lines = [
    proofPack.headline,
    "",
    "Presentation-ready summary pack.",
    "",
    proofPack.summary,
    "",
    `Deployment status: ${scorecard?.deploymentCompletion?.status || "staged"}.`,
    `Adoption milestone: ${scorecard?.adoptionMilestone?.milestone || "activated"}.`,
    `Renewal risk: ${scorecard?.renewalRisk?.level || "low"}.`,
    `Ecosystem status: ${ecosystem.summary.status}.`,
    ""
  ];

  if (runtimeSlo?.current) {
    lines.push(`Runtime SLO: ${runtimeSlo.current.label} (${runtimeSlo.current.status}).`);
    lines.push(`Uptime target: ${formatTargetPercent(runtimeSlo.targets?.uptime?.targetPct)}.`);
    lines.push(`Import success target: ${formatTargetPercent(runtimeSlo.targets?.importSuccess?.targetPct)}.`);
    lines.push("");
  } else {
    lines.push("Runtime SLO: deferred until BL-108 runtime/reporting substrate is ready.");
    lines.push("");
  }

  if (Array.isArray(proofPack.bullets)) {
    lines.push("Highlights:");
    for (const bullet of proofPack.bullets) {
      lines.push(`- ${bullet}`);
    }
    lines.push("");
  }

  if (kpiDashboard?.kpis?.first_pass_yield !== undefined && kpiDashboard?.kpis?.first_pass_yield !== null) {
    lines.push(`First-pass yield: ${formatPercent(kpiDashboard.kpis.first_pass_yield)}.`);
  }

  lines.push("Redactions:");
  lines.push("- Sensitive internals omitted from the customer share pack.");

  return lines.join("\n");
}

export async function getCustomerProofCenterSummary({
  dateFrom = null,
  dateTo = null,
  siteId = null,
  limit = 12,
  entitlements: providedEntitlements = null
} = {}) {
  const entitlements = providedEntitlements || await getPlatformEntitlements();
  let readinessLoaded = true;
  let kpiLoaded = true;
  let technicalOpsLoaded = true;
  let readiness;
  try {
    readiness = await getPilotReadinessScorecard({
      dateFrom,
      dateTo,
      siteId,
      entitlements
    });
  } catch {
    readinessLoaded = false;
    readiness = buildFallbackReadiness({ siteScope: String(siteId || "default") });
  }
  let kpiDashboard;
  try {
    kpiDashboard = await getKpiDashboard({
      dateFrom,
      dateTo,
      limit,
      siteId,
      entitlements
    });
  } catch {
    kpiLoaded = false;
    kpiDashboard = buildFallbackKpiDashboard();
  }
  let technicalOps = {};
  try {
    technicalOps = await getTechnicalOpsSummary();
  } catch {
    technicalOpsLoaded = false;
    technicalOps = {};
  }
  const ecosystem = buildEcosystemCompatibilitySuite({ entitlements });
  const trustIndicators = buildTrustIndicators(technicalOps);
  const runtimeSlo = technicalOps.runtimeSlo || buildFallbackRuntimeSlo();

  const scorecard = readiness?.sites?.[0] || null;
  const activeBundles = asArray(entitlements?.packaging?.activeBundles).map((bundle) => ({
    bundleId: bundle.bundleId,
    label: bundle.label,
    moduleKeys: asArray(bundle.moduleKeys)
  }));

  const proofPack = {
    headline: scorecard
      ? `Customer proof pack for ${readiness.siteScope === "all" ? "all visible sites" : readiness.siteScope}`
      : "Customer proof pack",
    summary: scorecard
      ? `The current proof center combines deployment readiness, adoption signals, and traceable customer trust evidence for the selected reporting window.`
      : "The current proof center combines deployment readiness, adoption signals, and traceable customer trust evidence.",
    bullets: buildExecutiveBullets({ readiness, kpiDashboard, trustIndicators, entitlements }),
    redactions: [
      "raw measurement payloads",
      "connector retry internals",
      "audit log bodies",
      "restricted admin-only tables"
    ]
  };

  const readOnlyDrilldowns = [
    {
      id: "runtime-slo",
      label: "Runtime SLO",
      status: runtimeSlo?.current?.status || "deferred",
      detail: runtimeSlo?.current
        ? `Uptime target ${formatTargetPercent(runtimeSlo.targets?.uptime?.targetPct)} and import success target ${formatTargetPercent(runtimeSlo.targets?.importSuccess?.targetPct)} are tracked alongside the active ${runtimeSlo.current.label.toLowerCase()} posture.`
        : "Runtime SLO drilldowns are deferred until the BL-108 runtime/reporting substrate is ready.",
      deferredBy: runtimeSlo?.current ? null : "BL-108"
    },
    {
      id: "customer-value",
      label: "Customer value",
      status: scorecard?.deploymentCompletion?.status || "staged",
      detail: scorecard
        ? `Value score ${scorecard.valueScore}/100 combines deployment completion, adoption milestone, and renewal-risk signals.`
        : "Customer value drilldowns are available once the proof window is populated.",
      deferredBy: null
    },
    {
      id: "trust-evidence",
      label: "Trust evidence",
      status: trustIndicators.some((item) => item.value === "Watch") ? "watch" : "healthy",
      detail: "Read-only trust drilldowns summarize backups, update readiness, import health, and audit confidence without exposing restricted internals.",
      deferredBy: null
    }
  ];

  const shareableText = buildShareableText({
    proofPack,
    readiness,
    kpiDashboard,
    ecosystem: {
      ...ecosystem,
      runtimeSlo
    }
  });

  return {
    contractId: "ANA-PROOF-v1",
    dataSource: readinessLoaded && kpiLoaded && technicalOpsLoaded ? "live" : "staged",
    generatedAt: new Date().toISOString(),
    window: readiness.window,
    siteScope: readiness.siteScope,
    entitlements: {
      contractId: entitlements.contractId,
      licenseTier: entitlements.licenseTier,
      activeBundles,
      seatPolicy: {
        optionId: entitlements.packaging?.seatPolicy?.optionId || null,
        label: entitlements.packaging?.seatPolicy?.label || null,
        contractId: entitlements.packaging?.seatPolicy?.contractId || null,
        allocationMode: entitlements.packaging?.seatPolicy?.allocationMode || null
      },
      authProfile: {
        contractId: entitlements.authProfile?.contractId || null,
        mode: entitlements.authProfile?.mode || null,
        providerLabel: entitlements.authProfile?.providerLabel || null,
        directoryEnabled: Boolean(entitlements.authProfile?.directoryEnabled)
      }
    },
    proofPack,
    readOnlyDrilldowns,
    runtimeSlo,
    trustIndicators,
    readiness: scorecard,
    kpiDashboard: {
      contractId: kpiDashboard.contractId,
      dashboardId: kpiDashboard.dashboardId,
      kpis: {
        firstPassYield: kpiDashboard.kpis?.first_pass_yield ?? null,
        onTimeDelivery: kpiDashboard.kpis?.on_time_delivery ?? null,
        reworkRate: kpiDashboard.kpis?.rework_rate ?? null
      },
      breakdowns: {
        byWorkCenter: asArray(kpiDashboard.breakdowns?.byWorkCenter).slice(0, 5).map((row) => ({
          workCenterId: row.workCenterId,
          kpis: row.kpis
        })),
        dailyTrend: asArray(kpiDashboard.breakdowns?.dailyTrend).slice(0, 7).map((row) => ({
          day: row.day,
          kpis: row.kpis
        }))
      }
    },
    ecosystem,
    shareableText
  };
}
