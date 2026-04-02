const OPERATOR_STAGE_ORDER = ["lookup", "entry", "saved", "success"];

export const OPERATOR_STAGES = Object.freeze({
  lookup: {
    key: "lookup",
    label: "Select job",
    stepLabel: "Find an open/draft job"
  },
  entry: {
    key: "entry",
    label: "Enter data",
    stepLabel: "Measurements + tools"
  },
  saved: {
    key: "saved",
    label: "Draft saved",
    stepLabel: "Resume later"
  },
  success: {
    key: "success",
    label: "Job closed",
    stepLabel: "Submitted/imported"
  }
});

function normalizeStep(step) {
  return OPERATOR_STAGE_ORDER.includes(step) ? step : "lookup";
}

export function OperatorStageBar({ step }) {
  const activeStep = normalizeStep(step);

  // "Saved draft" is an alternate path, not a strict step before "success".
  // Keep completion cues honest: success means lookup+entry are complete, not that a draft was saved.
  const completionByStageKey = (() => {
    if (activeStep === "lookup") return { lookup: false, entry: false, saved: false, success: false };
    if (activeStep === "entry") return { lookup: true, entry: false, saved: false, success: false };
    if (activeStep === "saved") return { lookup: true, entry: true, saved: false, success: false };
    if (activeStep === "success") return { lookup: true, entry: true, saved: false, success: false };
    return { lookup: false, entry: false, saved: false, success: false };
  })();

  return (
    <div className="operator-stage-bar" aria-label="Operator workflow progress">
      {OPERATOR_STAGE_ORDER.map((stageKey, index) => {
        const stage = OPERATOR_STAGES[stageKey];
        const isActive = stageKey === activeStep;
        const isComplete = Boolean(completionByStageKey?.[stageKey]);

        return (
          <div
            key={stageKey}
            className={[
              "operator-stage-bar__stage",
              isComplete ? "is-complete" : "",
              isActive ? "is-active" : ""
            ].filter(Boolean).join(" ")}
            aria-current={isActive ? "step" : undefined}
            title={`${stage.label} · ${stage.stepLabel}`}
          >
            <span className="operator-stage-bar__index">{index + 1}</span>
            <span className="operator-stage-bar__label">{stage.label}</span>
            <span className="operator-stage-bar__meta">{stage.stepLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

function SpecPill({ label, value }) {
  if (!value && value !== 0) return null;

  return (
    <span className="operator-spec-legend__pill">
      <span className="operator-spec-legend__pill-label">{label}</span>
      <span className="operator-spec-legend__pill-value">{value}</span>
    </span>
  );
}

export function PinnedSpecLegend({
  currentJob,
  part,
  opData,
  operatorName = "",
  summary = null,
  compact = false
}) {
  if (!currentJob && !part && !opData) return null;

  const safeOperatorName = String(operatorName || "").trim();

  const jobNumber = currentJob?.jobNumber ?? currentJob?.jobId ?? "";
  const partNumber = currentJob?.partNumber ?? currentJob?.partId ?? "";
  const opNumber = currentJob?.operation ?? currentJob?.operationId ?? "";
  const lot = currentJob?.lot ?? "";
  const qty = currentJob?.qty ?? "";
  const description = part?.description || "";
  const operationLabel = opData?.label || "";
  const measuredCount = Number(summary?.measuredCount || 0);
  const failCount = Number(summary?.failCount || 0);

  return (
    <div
      className="operator-spec-legend"
      aria-label="Pinned job context"
      style={compact ? { marginBottom: 0 } : undefined}
    >
      <SpecPill label="Job" value={jobNumber} />
      <SpecPill label="Part" value={partNumber} />
      {description ? <span className="operator-spec-legend__text">{description}</span> : null}
      <SpecPill label="Op" value={opNumber ? `Op ${opNumber}` : ""} />
      {operationLabel ? <span className="operator-spec-legend__text">{operationLabel}</span> : null}
      <SpecPill label="Lot" value={lot} />
      <SpecPill label="Qty" value={qty ? `${qty} pcs` : ""} />
      {safeOperatorName ? <SpecPill label="Operator" value={safeOperatorName} /> : null}
      {measuredCount > 0 ? <SpecPill label="Measured" value={measuredCount} /> : null}
      {failCount > 0 ? <SpecPill label="Fail" value={failCount} /> : null}
    </div>
  );
}
