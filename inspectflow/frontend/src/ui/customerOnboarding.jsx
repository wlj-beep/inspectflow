import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "inspectflow.customerOnboarding";

function readProgress() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeProgress(next) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures so onboarding never blocks the shell.
  }
}

function stepIsDone(progress, stepId) {
  return Boolean(progress?.[stepId]);
}

export function CustomerOnboardingCard({ workspace, onNavigate }) {
  const [progress, setProgress] = useState(() => readProgress());

  useEffect(() => {
    writeProgress(progress);
  }, [progress]);

  const completedCount = useMemo(
    () => workspace.steps.filter((step) => stepIsDone(progress, step.id)).length,
    [progress, workspace.steps]
  );
  const workflowStep = useMemo(
    () => workspace.steps.find((step) => step.id === "operator-flow") || workspace.steps[0] || null,
    [workspace.steps]
  );

  function markStepDone(stepId) {
    setProgress((current) => {
      if (current?.[stepId]) return current;
      const next = { ...current, [stepId]: true };
      writeProgress(next);
      return next;
    });
  }

  function handleStepAction(step) {
    markStepDone(step.id);
    onNavigate?.(step.target);
  }

  function handleReset() {
    setProgress({});
  }

  return (
    <section
      className="card"
      data-testid="customer-onboarding"
      aria-labelledby="customer-onboarding-title"
      style={{
        marginBottom: ".95rem",
        background: "linear-gradient(135deg, rgba(208,137,26,.18) 0%, rgba(46,136,212,.12) 100%)",
        borderColor: "rgba(240,168,48,.35)"
      }}
    >
      <div className="card-body" style={{ padding: "1rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem",
            flexWrap: "wrap"
          }}
        >
          <div style={{ maxWidth: "44rem" }}>
            <div className="section-label" style={{ marginBottom: ".45rem" }}>
              Guided Onboarding
            </div>
            <h2
              id="customer-onboarding-title"
              style={{
                margin: 0,
                fontFamily: "var(--cond)",
                letterSpacing: ".08em",
                textTransform: "uppercase",
                fontSize: "1rem"
              }}
            >
              Explore the sample workspace in under five minutes
            </h2>
            <p className="text-muted" style={{ margin: ".45rem 0 .65rem", fontSize: ".82rem", lineHeight: 1.55 }}>
              {workspace.summary}
            </p>
            <div className="gap1" style={{ marginBottom: ".8rem" }}>
              <span className="badge badge-open">{completedCount}/{workspace.steps.length} steps complete</span>
              <span className="badge badge-pend">{workspace.workspaceLabel}</span>
              <span className="badge badge-draft">Sample job {workspace.sampleJob}</span>
            </div>
            <p className="text-muted" style={{ margin: "0 0 .8rem", fontSize: ".76rem", lineHeight: 1.5 }}>
              The seeded demo workspace is safe to revisit, and you can reset the guided path at any time.
            </p>
            <div style={{ display: "flex", gap: ".55rem", flexWrap: "wrap" }}>
              {workflowStep ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => handleStepAction(workflowStep)}
                >
                  Show me the workflow
                </button>
              ) : null}
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleReset}>
                Reset demo path
              </button>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleReset}>
            Reset walkthrough
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: ".75rem"
          }}
        >
          {workspace.steps.map((step, index) => {
            const done = stepIsDone(progress, step.id);
            return (
              <article
                key={step.id}
                style={{
                  border: "1px solid var(--border2)",
                  borderRadius: "4px",
                  background: done ? "rgba(11,35,24,.85)" : "rgba(20,24,32,.86)",
                  padding: ".85rem"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: ".45rem", marginBottom: ".45rem" }}>
                  <span className={`badge ${done ? "badge-ok" : "badge-pend"}`}>Step {index + 1}</span>
                  {done ? <span className="text-ok" style={{ fontSize: ".74rem" }}>Completed</span> : null}
                </div>
                <h3
                  style={{
                    margin: 0,
                    fontFamily: "var(--cond)",
                    textTransform: "uppercase",
                    letterSpacing: ".06em",
                    fontSize: ".8rem"
                  }}
                >
                  {step.title}
                </h3>
                <p className="text-muted" style={{ margin: ".4rem 0 .7rem", fontSize: ".78rem", lineHeight: 1.5 }}>
                  {step.description}
                </p>
                <button type="button" className={`btn btn-sm ${done ? "btn-ghost" : "btn-primary"}`} onClick={() => handleStepAction(step)}>
                  {done ? step.repeatLabel || "Open again" : step.actionLabel}
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
