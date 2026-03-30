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

function buildSummaryCards({ jobs, records, toolLibrary, currentRole }) {
  const jobList = toArray(jobs);
  const recordList = toArray(records);
  const tools = toolLibrary && typeof toolLibrary === "object" ? Object.values(toolLibrary) : [];
  const todayIso = new Date().toISOString().slice(0, 10);

  const openJobs = jobList.filter((job) => job && (job.status === "open" || job.status === "draft"));
  const draftJobs = jobList.filter((job) => job && job.status === "draft");
  const ootRecords = recordList.filter((record) => record && record.oot);
  const overdueTools = tools.filter((tool) => tool && isOverdue(tool.calibrationDueDate, todayIso));

  const roleLabel = normalizeText(currentRole) || "Operator";
  const focusLabel =
    roleLabel.toLowerCase() === "admin"
      ? "System overview"
      : roleLabel.toLowerCase() === "supervisor"
        ? "Shift control"
        : roleLabel.toLowerCase() === "quality"
          ? "Quality review"
          : "Operator command center";

  return [
    {
      title: "Open jobs",
      value: openJobs.length,
      detail: "Ready for measurement entry",
      tone: "badge-open",
      actionLabel: "Open Operator",
      target: "operator"
    },
    {
      title: "Draft jobs",
      value: draftJobs.length,
      detail: "Saved and ready to resume",
      tone: "badge-draft",
      actionLabel: "Continue operator work",
      target: "operator"
    },
    {
      title: "OOT records",
      value: ootRecords.length,
      detail: "Records flagged out of tolerance",
      tone: "badge-oot",
      actionLabel: "Review records",
      target: "records"
    },
    {
      title: "Overdue tools",
      value: overdueTools.length,
      detail: "Calibration past due today",
      tone: "badge-incomplete",
      actionLabel: "Open Admin tools",
      target: "admin"
    },
    {
      title: "Role focus",
      value: roleLabel,
      detail: focusLabel,
      tone: "badge-pend",
      actionLabel: "Open Admin",
      target: "admin"
    }
  ];
}

export function HomeDashboard({ jobs, records, toolLibrary, currentRole, onNavigate }) {
  const cards = buildSummaryCards({ jobs, records, toolLibrary, currentRole });
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
              A quick operational snapshot for {normalizeText(currentRole) || "the current role"}.
            </p>
          </div>
        </div>
        <div className="card-body">
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
                <button type="button" className="btn btn-primary btn-sm" onClick={() => handleNavigate("operator")}>
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
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleNavigate("records")}>
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
