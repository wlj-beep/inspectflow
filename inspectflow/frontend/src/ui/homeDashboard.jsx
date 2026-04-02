import { INITIAL_DEMO_WORKSPACE } from "../data/initialData.js";
import { CustomerOnboardingCard } from "./customerOnboarding.jsx";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").trim();
}

function isOverdue(calibrationDueDate, todayIso) {
  const due = normalizeText(calibrationDueDate);
  if (!due) return false;
  return due < todayIso;
}

function formatResultLabel(record) {
  if (!record) return "Unknown";
  if (record.oot) return "OOT";
  if (record.status === "incomplete") return "Incomplete";
  if (record.status === "draft") return "Draft";
  if (record.status === "complete") return "OK";
  return String(record.status || "OK").toUpperCase();
}

function formatResultTone(record) {
  if (!record) return "badge-pend";
  if (record.oot) return "badge-oot";
  if (record.status === "incomplete") return "badge-incomplete";
  if (record.status === "draft") return "badge-draft";
  return "badge-ok";
}

function normalizeRoleKey(currentRole) {
  return normalizeText(currentRole).toLowerCase();
}

function buildRolePlaybook(currentRole) {
  const roleLabel = normalizeText(currentRole) || "Operator";
  const roleKey = normalizeRoleKey(roleLabel);

  if (roleKey === "admin") {
    return {
      roleLabel,
      focusLabel: "System control",
      primaryTitle: "Admin control center",
      primaryDescription: "Manage jobs, setup, and governance from one place.",
      primaryAction: { label: "Manage jobs", target: { view: "admin", adminTab: "jobs" } }
    };
  }
  if (roleKey === "supervisor") {
    return {
      roleLabel,
      focusLabel: "Shift oversight",
      primaryTitle: "Supervisor command center",
      primaryDescription: "Track open work and close blockers before shift handoff.",
      primaryAction: { label: "Review records", target: { view: "records" } }
    };
  }
  if (roleKey === "quality") {
    return {
      roleLabel,
      focusLabel: "Quality review",
      primaryTitle: "Quality review queue",
      primaryDescription: "Prioritize OOT investigations and inspection verification.",
      primaryAction: { label: "Review OOT records", target: { view: "records" } }
    };
  }
  return {
    roleLabel,
    focusLabel: "Operator throughput",
    primaryTitle: "Operator start point",
    primaryDescription: "Start or resume measurement entry with minimal clicks.",
    primaryAction: { label: "Start operator entry", target: { view: "operator" } }
  };
}

function buildSummaryCards({ jobs, records, toolLibrary, currentRole }) {
  const jobList = toArray(jobs);
  const recordList = toArray(records);
  const tools = toolLibrary && typeof toolLibrary === "object" ? Object.values(toolLibrary) : [];
  const todayIso = new Date().toISOString().slice(0, 10);

  const openJobs = jobList.filter((job) => job && (job.status === "open" || job.status === "draft"));
  const draftJobs = jobList.filter((job) => job && job.status === "draft");
  const ootRecords = recordList.filter((record) => record && record.oot);
  const overdueTools = tools.filter((tool) => tool && isOverdue(tool.calibrationDueDate, todayIso));

  const playbook = buildRolePlaybook(currentRole);
  const roleKey = normalizeRoleKey(playbook.roleLabel);

  const cards = {
    openJobs: {
      title: "Open jobs",
      value: openJobs.length,
      detail: "Ready for measurement entry",
      tone: "badge-open",
      actionLabel: roleKey === "admin" ? "Manage jobs" : "Open operator entry",
      target: roleKey === "admin" ? { view: "admin", adminTab: "jobs" } : { view: "operator" }
    },
    draftJobs: {
      title: "Draft jobs",
      value: draftJobs.length,
      detail: "Saved and ready to resume",
      tone: "badge-draft",
      actionLabel: "Resume work",
      target: { view: "operator" }
    },
    ootRecords: {
      title: "OOT records",
      value: ootRecords.length,
      detail: "Records flagged out of tolerance",
      tone: "badge-oot",
      actionLabel: "Review records",
      target: { view: "records" }
    },
    overdueTools: {
      title: "Overdue tools",
      value: overdueTools.length,
      detail: "Calibration past due today",
      tone: "badge-incomplete",
      actionLabel: "Open tool library",
      target: { view: "admin", adminTab: "tools" }
    },
    roleFocus: {
      title: "Role focus",
      value: playbook.roleLabel,
      detail: playbook.focusLabel,
      tone: "badge-pend",
      actionLabel: playbook.primaryAction.label,
      target: playbook.primaryAction.target
    }
  };

  const orderByRole = {
    admin: ["roleFocus", "openJobs", "overdueTools", "ootRecords", "draftJobs"],
    supervisor: ["roleFocus", "openJobs", "ootRecords", "draftJobs", "overdueTools"],
    quality: ["roleFocus", "ootRecords", "openJobs", "draftJobs", "overdueTools"],
    operator: ["roleFocus", "openJobs", "draftJobs", "ootRecords", "overdueTools"]
  };

  return (orderByRole[roleKey] || orderByRole.operator).map((key) => cards[key]);
}

function buildDemoWorkspace(currentRole) {
  const roleKey = normalizeRoleKey(currentRole);
  const steps = INITIAL_DEMO_WORKSPACE.steps.map((step) => ({ ...step }));

  if (roleKey === "admin") {
    steps[1] = {
      ...steps[1],
      title: "Open the operator-ready job",
      description: "Review the seeded job queue and confirm the sample work order is ready for floor execution.",
      actionLabel: "Open job queue",
      repeatLabel: "Reopen job queue",
      target: { view: "admin", adminTab: "jobs" }
    };
  }

  if (roleKey === "quality" || roleKey === "supervisor") {
    steps[1] = {
      ...steps[1],
      title: "Review the in-process job",
      description: "Start from the live sample job and inspect the handoff between setup, execution, and review.",
      actionLabel: "Open records",
      repeatLabel: "Reopen records",
      target: { view: "records" }
    };
  }

  return {
    ...INITIAL_DEMO_WORKSPACE,
    steps
  };
}

export function HomeDashboard({ jobs, records, toolLibrary, currentRole, onNavigate }) {
  const playbook = buildRolePlaybook(currentRole);
  const cards = buildSummaryCards({ jobs, records, toolLibrary, currentRole });
  const demoWorkspace = buildDemoWorkspace(currentRole);
  const recentRecords = toArray(records)
    .slice()
    .sort((a, b) => String(b?.timestamp || "").localeCompare(String(a?.timestamp || "")))
    .slice(0, 5);

  const handleNavigate = (target) => {
    if (typeof onNavigate === "function") {
      onNavigate(target);
    }
  };

  return (
    <main className="home-dashboard" aria-labelledby="home-dashboard-title">
      <section className="card">
        <div className="card-head">
          <div>
            <h1 id="home-dashboard-title" className="card-title" style={{ margin: 0 }}>
              Home Dashboard
            </h1>
            <p className="text-muted" style={{ margin: ".25rem 0 0" }}>
              A role-aware snapshot for {normalizeText(currentRole) || "the current role"}.
            </p>
          </div>
        </div>
        <div className="card-body">
          <article
            className="card"
            style={{
              marginBottom: ".95rem",
              background: "var(--panel)",
              borderColor: "var(--border2)"
            }}
          >
            <div className="card-body" style={{ padding: "1rem" }}>
              <div className="section-label" style={{ marginBottom: ".4rem" }}>
                Primary Action
              </div>
              <h2 style={{ margin: 0, fontFamily: "var(--cond)", letterSpacing: ".07em", textTransform: "uppercase", fontSize: ".92rem" }}>
                {playbook.primaryTitle}
              </h2>
              <p className="text-muted" style={{ margin: ".4rem 0 .75rem", fontSize: ".8rem" }}>
                {playbook.primaryDescription}
              </p>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => handleNavigate(playbook.primaryAction.target)}>
                {playbook.primaryAction.label}
              </button>
            </div>
          </article>
          <article
            className="card"
            style={{
              marginBottom: ".95rem",
              background: "var(--panel)",
              borderColor: "var(--border2)"
            }}
            aria-label="Customer site scorecard cue"
          >
            <div className="card-body" style={{ padding: "1rem" }}>
              <div className="section-label" style={{ marginBottom: ".4rem" }}>
                Customer Site Scorecard
              </div>
              <p className="text-muted" style={{ margin: 0, fontSize: ".8rem" }}>
                Pilot readiness now rolls up by customer site with deployment completion, adoption milestone, and renewal-risk signals in analytics.
              </p>
            </div>
          </article>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: ".85rem"
            }}
          >
            {cards.map((card) => (
              <article
                key={card.title}
                className="card"
                style={{
                  marginBottom: 0,
                  background: "var(--panel)",
                  borderColor: "var(--border2)"
                }}
                aria-labelledby={`home-card-${card.title}`}
              >
                <div className="card-body" style={{ padding: "1rem" }}>
                  <div className="section-label" id={`home-card-${card.title}`} style={{ marginBottom: ".4rem" }}>
                    {card.title}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: ".45rem", flexWrap: "wrap" }}>
                    <span
                      className={`badge ${card.tone}`}
                      style={{ fontSize: ".65rem" }}
                    >
                      {typeof card.value === "number" ? card.value : card.value}
                    </span>
                    <span className="text-muted" style={{ fontSize: ".76rem" }}>
                      {card.detail}
                    </span>
                  </div>
                  <div style={{ marginTop: ".85rem" }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleNavigate(card.target)}>
                      {card.actionLabel}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <CustomerOnboardingCard
        workspace={demoWorkspace}
        onNavigate={handleNavigate}
      />

      <section className="card">
        <div className="card-head">
          <div className="card-title">Recent activity</div>
          <div className="text-muted" style={{ fontSize: ".72rem" }}>
            Latest 5 records
          </div>
        </div>
        <div className="card-body">
          {recentRecords.length === 0 ? (
            <div className="empty-state">
              No recent records yet.
              <div style={{ marginTop: ".75rem" }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => handleNavigate({ view: "operator" })}>
                  Start operator entry
                </button>
              </div>
            </div>
          ) : (
            <ul
              aria-label="Recent records"
              style={{
                listStyle: "none",
                display: "grid",
                gap: ".6rem",
                padding: 0,
                margin: 0
              }}
            >
              {recentRecords.map((record, index) => (
                <li
                  key={record?.id || `${record?.jobNumber || "record"}-${index}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: ".75rem",
                    padding: ".75rem .85rem",
                    border: "1px solid var(--border2)",
                    borderRadius: "3px",
                    background: "var(--panel)"
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap" }}>
                      <strong style={{ fontFamily: "var(--mono)", fontSize: ".82rem" }}>
                        {record?.jobNumber || `Record #${record?.id || index + 1}`}
                      </strong>
                      <span className={`badge ${formatResultTone(record)}`}>
                        {formatResultLabel(record)}
                      </span>
                    </div>
                    <div className="text-muted" style={{ fontSize: ".75rem", marginTop: ".2rem" }}>
                      {record?.timestamp || "No timestamp"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleNavigate({ view: "records" })}>
                      Open records
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
