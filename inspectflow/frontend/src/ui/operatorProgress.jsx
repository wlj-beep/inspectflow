const OPERATOR_STAGE_ORDER = ["lookup", "entry", "saved", "success"];

export const OPERATOR_STAGES = Object.freeze(
  OPERATOR_STAGE_ORDER.reduce((acc, key, index) => {
    acc[key] = {
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      index,
      stepLabel: `Step ${index + 1} of ${OPERATOR_STAGE_ORDER.length}`
    };
    return acc;
  }, {})
);

function normalizeStep(step) {
  return OPERATOR_STAGE_ORDER.includes(step) ? step : "lookup";
}

export function OperatorStageBar({ step }) {
  const activeStep = normalizeStep(step);
  const activeIndex = OPERATOR_STAGE_ORDER.indexOf(activeStep);

  return (
    <div className="operator-stage-bar" aria-label="Operator workflow progress">
      {OPERATOR_STAGE_ORDER.map((stageKey, index) => {
        const stage = OPERATOR_STAGES[stageKey];
        const isActive = stageKey === activeStep;
        const isComplete = index < activeIndex;

        return (
          <div
            key={stageKey}
            className={[
              "operator-stage-bar__stage",
              isComplete ? "is-complete" : "",
              isActive ? "is-active" : ""
            ].filter(Boolean).join(" ")}
            aria-current={isActive ? "step" : undefined}
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

export function PinnedSpecLegend({ currentJob, part, opData }) {
  if (!currentJob && !part && !opData) return null;

  const partNumber = currentJob?.partNumber ?? currentJob?.partId ?? "";
  const opNumber = currentJob?.operation ?? currentJob?.operationId ?? "";
  const lot = currentJob?.lot ?? "";
  const qty = currentJob?.qty ?? "";
  const description = part?.description || "";
  const operationLabel = opData?.label || "";

  return (
    <div className="operator-spec-legend" aria-label="Pinned job context">
      <SpecPill label="Part" value={partNumber} />
      {description ? <span className="operator-spec-legend__text">{description}</span> : null}
      <SpecPill label="Op" value={opNumber ? `Op ${opNumber}` : ""} />
      {operationLabel ? <span className="operator-spec-legend__text">{operationLabel}</span> : null}
      <SpecPill label="Lot" value={lot} />
      <SpecPill label="Qty" value={qty ? `${qty} pcs` : ""} />
    </div>
  );
}
