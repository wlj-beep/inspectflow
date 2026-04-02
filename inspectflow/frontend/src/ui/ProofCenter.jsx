import { useEffect, useState } from "react";
import { api } from "../api/index.js";

function badgeClass(status) {
  const value = String(status || "").toLowerCase();
  if (value === "ready" || value === "pass" || value === "current" || value === "healthy") return "badge-ok";
  if (value === "watch" || value === "deferred" || value === "review" || value === "staged") return "badge-incomplete";
  if (value === "error" || value === "blocked" || value === "fail") return "badge-oot";
  return "badge-pend";
}

function formatList(values = []) {
  return Array.isArray(values) ? values.filter(Boolean).join(" · ") : "";
}

function triggerTextDownload(text, filename) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 0);
}

async function shareProofPack({ summary, text, filename }) {
  const title = summary?.proofPack?.headline || "Customer proof pack";
  const payload = { title, text };
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(payload);
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") {
        return "cancelled";
      }
    }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return "copied";
  }
  triggerTextDownload(text, filename);
  return "downloaded";
}

function ProofMetric({ label, value, detail, tone = "badge-pend" }) {
  return (
    <article className="card proof-metric-card" style={{ marginBottom: 0 }}>
      <div className="card-body" style={{ padding: "1rem" }}>
        <div className="section-label" style={{ marginBottom: ".35rem" }}>{label}</div>
        <div className={`badge ${tone}`} style={{ marginBottom: ".55rem" }}>{value}</div>
        <p className="text-muted" style={{ margin: 0, fontSize: ".8rem", lineHeight: 1.55 }}>{detail}</p>
      </div>
    </article>
  );
}

export function ProofCenter({ currentRole = "Admin", onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [compatibility, setCompatibility] = useState(null);
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState("idle");
  const [exportState, setExportState] = useState("idle");
  const [shareState, setShareState] = useState("idle");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [nextSummary, nextCompatibility] = await Promise.all([
          api.proofCenter.summary({}, currentRole),
          api.integration.ecosystemCompatibility({}, currentRole)
        ]);
        if (!active) return;
        setSummary(nextSummary);
        setCompatibility(nextCompatibility);
      } catch (err) {
        if (!active) return;
        setError(err?.message || "proof_center_load_failed");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [currentRole]);

  async function handleCopy() {
    if (!summary?.shareableText || typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(summary.shareableText);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 2000);
    }
  }

  async function handleDownload() {
    if (!summary?.shareableText) return;
    setExportState("working");
    try {
      const text = await api.proofCenter.exportText({}, currentRole);
      triggerTextDownload(
        text,
        `inspectflow-proof-pack-${String(summary?.siteScope || "default").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}.txt`
      );
      setExportState("done");
      window.setTimeout(() => setExportState("idle"), 2000);
    } catch {
      setExportState("error");
      window.setTimeout(() => setExportState("idle"), 2000);
    }
  }

  async function handleShare() {
    if (!summary?.shareableText) return;
    setShareState("working");
    try {
      const result = await shareProofPack({
        summary,
        text: summary.shareableText,
        filename: `inspectflow-proof-pack-${String(summary?.siteScope || "default").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}.txt`
      });
      if (result === "cancelled") {
        setShareState("idle");
      } else {
        setShareState(result === "copied" ? "copied" : "shared");
      }
      window.setTimeout(() => setShareState("idle"), 2000);
    } catch {
      setShareState("error");
      window.setTimeout(() => setShareState("idle"), 2000);
    }
  }

  const readiness = summary?.readiness || {};
  const scorecard = readiness || {};
  const trustIndicators = Array.isArray(summary?.trustIndicators) ? summary.trustIndicators : [];
  const activeBundles = Array.isArray(summary?.entitlements?.activeBundles) ? summary.entitlements.activeBundles : [];
  const kpis = summary?.kpiDashboard?.kpis || {};
  const checks = Array.isArray(compatibility?.checks) ? compatibility.checks : [];
  const readOnlyDrilldowns = Array.isArray(summary?.readOnlyDrilldowns) ? summary.readOnlyDrilldowns : [];
  const runtimeSlo = summary?.runtimeSlo || null;

  const metricCards = [
    {
      label: "Value score",
      value: scorecard?.valueScore != null ? String(scorecard.valueScore) : "—",
      tone: scorecard?.valueScore == null ? "badge-pend" : scorecard.valueScore >= 80 ? "badge-ok" : scorecard.valueScore >= 50 ? "badge-incomplete" : "badge-oot",
      detail: scorecard?.deploymentCompletion?.status
        ? `Deployment readiness is ${scorecard.deploymentCompletion.status}.`
        : "Deployment readiness will appear after the proof pack loads."
    },
    {
      label: "Adoption",
      value: scorecard?.adoptionMilestone?.milestone || "—",
      tone: scorecard?.adoptionMilestone?.milestone == null ? "badge-pend" : scorecard.adoptionMilestone.milestone === "expanding" ? "badge-ok" : scorecard.adoptionMilestone.milestone === "adopting" ? "badge-incomplete" : "badge-pend",
      detail: "Customer adoption and usage signals are rolled into the proof pack."
    },
    {
      label: "Renewal risk",
      value: scorecard?.renewalRisk?.level || "—",
      tone: scorecard?.renewalRisk?.level == null ? "badge-pend" : scorecard.renewalRisk.level === "low" ? "badge-ok" : scorecard.renewalRisk.level === "medium" ? "badge-incomplete" : "badge-oot",
      detail: "Renewal risk is summarized without exposing raw measurement payloads."
    },
    {
      label: "First pass yield",
      value: kpis.first_pass_yield == null ? "—" : `${Math.round(Number(kpis.first_pass_yield) * 100)}%`,
      tone: kpis.first_pass_yield == null ? "badge-pend" : Number(kpis.first_pass_yield) >= 0.95 ? "badge-ok" : Number(kpis.first_pass_yield) >= 0.8 ? "badge-incomplete" : "badge-oot",
      detail: "Customer-friendly KPI output is taken from the selected reporting window."
    }
  ];

  return (
    <main className="proof-center" aria-labelledby="proof-center-title">
      <section className="card proof-hero" style={{ marginBottom: "1rem" }}>
        <div className="card-body proof-hero__body">
          <div className="proof-hero__copy">
            <div className="section-label" style={{ marginBottom: ".45rem" }}>Customer Proof Center</div>
            <h1 id="proof-center-title" style={{ margin: 0, fontFamily: "var(--cond)", fontSize: "2rem", letterSpacing: ".05em", textTransform: "uppercase", lineHeight: 1.02 }}>
              Present the proof pack, not the internals.
            </h1>
            <p className="text-muted" style={{ margin: ".65rem 0 1rem", fontSize: ".92rem", lineHeight: 1.6, maxWidth: "62ch" }}>
              This view redacts raw measurement payloads and connector internals while still surfacing the executive summary, trust signals, and entitlement policy behind the story.
            </p>
            <div className="proof-export-note">
              Presentation-ready export safe for copy, share, or download.
            </div>
            <div className="proof-hero__actions">
              <button type="button" className="btn btn-ghost" onClick={handleShare} disabled={loading || !summary?.shareableText}>
                {shareState === "shared" ? "Shared Pack" : shareState === "copied" ? "Copied Pack" : shareState === "error" ? "Share Failed" : "Share Presentation Pack"}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleCopy} disabled={loading || !summary?.shareableText}>
                {copyState === "copied" ? "Copied Summary" : copyState === "error" ? "Copy Failed" : "Copy Shareable Summary"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={handleDownload} disabled={loading || !summary?.shareableText}>
                {exportState === "done" ? "Downloaded Export" : exportState === "error" ? "Download Failed" : "Download Export"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => onNavigate?.("records")}>
                Open Records
              </button>
            </div>
            {error ? <div className="err-text" style={{ marginTop: ".85rem" }}>{error}</div> : null}
          </div>
          <aside className="proof-hero__aside">
            <div className="proof-summary-chip">
              <div className="proof-summary-chip__label">Contract</div>
              <div className="proof-summary-chip__value">{summary?.contractId || "ANA-PROOF-v1"}</div>
            </div>
            <div className="proof-summary-chip">
              <div className="proof-summary-chip__label">Site scope</div>
              <div className="proof-summary-chip__value">{summary?.siteScope || "default"}</div>
            </div>
            <div className="proof-summary-chip">
              <div className="proof-summary-chip__label">Bundles</div>
              <div className="proof-summary-chip__value">{formatList(activeBundles.map((bundle) => bundle.label || bundle.bundleId)) || "Core Site"}</div>
            </div>
            <div className="proof-summary-chip">
              <div className="proof-summary-chip__label">Redactions</div>
              <div className="proof-summary-chip__value">{summary?.proofPack?.redactions?.length ? `${summary.proofPack.redactions.length} items` : "—"}</div>
            </div>
          </aside>
        </div>
      </section>

      <section className="proof-grid">
        {metricCards.map((metric) => (
          <ProofMetric
            key={metric.label}
            label={metric.label}
            value={metric.value}
            detail={metric.detail}
            tone={metric.tone}
          />
        ))}
      </section>

      <section className="proof-panel-grid">
        <article className="card proof-panel">
          <div className="card-head">
            <div className="card-title">Shareable Preview</div>
          </div>
          <div className="card-body">
            <div className="proof-preview">
              <div className="proof-preview__headline">{summary?.proofPack?.headline || "Customer proof pack"}</div>
              <p className="proof-preview__summary">{summary?.proofPack?.summary || "The current proof center combines deployment readiness, adoption signals, and traceable customer trust evidence."}</p>
              <ul className="proof-bullet-list">
                {(summary?.proofPack?.bullets || []).map((bullet) => <li key={bullet}>{bullet}</li>)}
              </ul>
              <div className="proof-preview__footer">
                <span className="proof-preview__footer-label">Safe to share</span>
                <span className="proof-preview__footer-value">Yes, with redactions</span>
              </div>
              <div className="proof-redactions">
                <div className="section-label" style={{ marginBottom: ".35rem" }}>Redactions</div>
                <div className="proof-redactions__items">
                  {(summary?.proofPack?.redactions || []).map((item) => (
                    <span key={item} className="badge badge-pend">{item}</span>
                  ))}
                </div>
              </div>
            </div>
            <textarea readOnly value={summary?.shareableText || ""} rows={12} className="proof-export-text" aria-label="Shareable proof export preview" />
          </div>
        </article>

        <article className="card proof-panel">
          <div className="card-head">
            <div className="card-title">Trust and Policy</div>
          </div>
          <div className="card-body">
            <div className="proof-trust-grid">
              {trustIndicators.map((item) => (
                <div key={item.key} className="proof-trust-item">
                  <div className="proof-trust-item__label">{item.label}</div>
                  <div className={`badge ${badgeClass(item.value)}`} style={{ margin: ".35rem 0" }}>{item.value}</div>
                  <div className="proof-trust-item__detail">{item.detail}</div>
                </div>
              ))}
            </div>
            <div className="proof-policy-block">
              <div className="section-label" style={{ marginBottom: ".35rem" }}>Entitlement policy</div>
              <p className="text-muted" style={{ margin: 0, lineHeight: 1.55 }}>
                {summary?.entitlements?.licenseTier || "core"} license tier, {summary?.entitlements?.seatPolicy?.label || "soft visibility"} seat policy, and {summary?.entitlements?.authProfile?.providerLabel || "local accounts"} sign-in are packaged into a customer-safe proof surface.
              </p>
            </div>
            <div className="proof-policy-block" data-testid="runtime-slo-policy">
              <div className="section-label" style={{ marginBottom: ".35rem" }}>Runtime SLO</div>
              <p className="text-muted" style={{ margin: 0, lineHeight: 1.55 }}>
                {runtimeSlo?.current
                  ? `${runtimeSlo.current.label} posture is ${runtimeSlo.current.status}. Uptime target ${runtimeSlo.targets?.uptime?.targetPct ?? "99.5"}% and import success target ${runtimeSlo.targets?.importSuccess?.targetPct ?? "99"}% are published through technical ops.`
                  : "Runtime SLO targets are published through technical ops when the summary loads."}
              </p>
            </div>
            <div className="proof-policy-block">
              <div className="section-label" style={{ marginBottom: ".35rem" }}>KPI breakdowns</div>
              <div className="proof-breakdown-list">
                {(summary?.kpiDashboard?.breakdowns?.byWorkCenter || []).slice(0, 3).map((row) => (
                  <div key={row.workCenterId} className="proof-breakdown-row">
                    <span>{row.workCenterId}</span>
                    <span>{row.kpis?.first_pass_yield == null ? "—" : `${Math.round(Number(row.kpis.first_pass_yield) * 100)}% FPY`}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="card proof-panel" data-testid="proof-drilldowns">
        <div className="card-head">
          <div className="card-title">Read-only Drilldowns</div>
        </div>
        <div className="card-body">
          <div className="proof-check-grid">
            {readOnlyDrilldowns.map((drilldown) => (
              <article key={drilldown.id} className="proof-check">
                <div className="proof-check__head">
                  <div className="proof-check__label">{drilldown.label}</div>
                  <span className={`badge ${badgeClass(drilldown.status)}`}>{drilldown.status}</span>
                </div>
                <p className="proof-check__detail">{drilldown.detail}</p>
                {drilldown.deferredBy ? <div className="proof-check__note">Deferred by {drilldown.deferredBy}</div> : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="card proof-panel">
        <div className="card-head">
          <div className="card-title">Ecosystem Compatibility</div>
        </div>
        <div className="card-body">
          <div className="proof-compatibility-summary">
            <div className="proof-compatibility-summary__value">{compatibility?.summary?.status || "staged"}</div>
            <div className="proof-compatibility-summary__meta">
              {compatibility?.summary
                ? `${compatibility.summary.readyChecks} checks pass, ${compatibility.summary.deferredChecks} are deferred for later substrate work.`
                : "Compatibility checks load after the proof pack."}
            </div>
          </div>
          <div className="proof-check-grid">
            {checks.map((check) => (
              <article key={check.id} className="proof-check">
                <div className="proof-check__head">
                  <div className="proof-check__label">{check.label}</div>
                  <span className={`badge ${badgeClass(check.status)}`}>{check.status}</span>
                </div>
                <p className="proof-check__detail">{check.detail}</p>
                {check.deferredBy ? <div className="proof-check__note">Deferred by {check.deferredBy}</div> : null}
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
