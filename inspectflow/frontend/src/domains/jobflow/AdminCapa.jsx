import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "../../api/index.js";
import {
  readUrlIntParam,
  readUrlQueryParam,
  writeUrlQueryParams
} from "./jobflowUtils.js";
import { fmtTs } from "../../shared/utils/jobflowCore.ts";
import TableSkeletonRows from "../../shared/components/TableSkeletonRows.jsx";

export default function AdminCapa({ currentRole }) {
  const [items, setItems] = useState([]);
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => readUrlQueryParam("capaStatus", ""));
  const [search, setSearch] = useState(() => readUrlQueryParam("capaSearch", ""));
  const [page, setPage] = useState(() => readUrlIntParam("capaPage", 1, { min: 1, max: 100000 }));
  const [pageSize, setPageSize] = useState(() =>
    readUrlIntParam("capaPageSize", 25, { min: 1, max: 1000 })
  );
  const [statusOptions, setStatusOptions] = useState([]);
  const [actionStatusOptions, setActionStatusOptions] = useState([]);
  const [createForm, setCreateForm] = useState({
    title: "",
    problemStatement: "",
    sourceNcrId: "",
    rootCauseMethod: "5whys",
    dueAt: ""
  });
  const [actionForm, setActionForm] = useState({
    title: "",
    description: "",
    dueAt: ""
  });
  const [effectivenessNotes, setEffectivenessNotes] = useState("");

  useEffect(() => {
    writeUrlQueryParams({
      capaStatus: statusFilter || "",
      capaSearch: search.trim(),
      capaPage: page,
      capaPageSize: pageSize
    });
  }, [statusFilter, search, page, pageSize]);

  async function loadStatusOptions() {
    try {
      const response = await api.capa.statusOptions(currentRole || "Admin");
      setStatusOptions(Array.isArray(response?.statuses) ? response.statuses : []);
      setActionStatusOptions(
        Array.isArray(response?.actionStatuses) ? response.actionStatuses : []
      );
    } catch {
      setStatusOptions([]);
      setActionStatusOptions([]);
    }
  }

  async function loadCapas() {
    setLoading(true);
    setError("");
    try {
      const response = await api.capa.list(
        {
          status: statusFilter || undefined,
          page,
          pageSize
        },
        currentRole || "Admin"
      );
      setItems(Array.isArray(response?.records) ? response.records : []);
    } catch (e) {
      setError(e?.message || "Unable to load CAPAs.");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id) {
    if (!id) return;
    setBusyAction("load-detail");
    setError("");
    try {
      const response = await api.capa.get(id, currentRole || "Admin");
      setDetail(response);
      setDetailId(id);
      setEffectivenessNotes(response?.effectiveness_notes || "");
    } catch (e) {
      setError(e?.message || "Unable to load CAPA details.");
    } finally {
      setBusyAction("");
    }
  }

  useEffect(() => {
    loadStatusOptions();
  }, [currentRole]);

  useEffect(() => {
    loadCapas();
  }, [currentRole, statusFilter, page, pageSize]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [
        item.id,
        item.title,
        item.problem_statement,
        item.status,
        item.source_ncr_id,
        item.root_cause_method
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [items, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / Math.max(1, pageSize)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const overdueCount = filtered.filter(
    (item) => item.status !== "closed" && item.due_at && Date.parse(item.due_at) < Date.now()
  ).length;

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  async function createCapa(event) {
    event.preventDefault();
    setBusyAction("create");
    setError("");
    try {
      const created = await api.capa.create(
        {
          title: createForm.title,
          problemStatement: createForm.problemStatement || null,
          sourceNcrId: createForm.sourceNcrId || null,
          rootCauseMethod: createForm.rootCauseMethod || null,
          dueAt: createForm.dueAt || null
        },
        currentRole || "Admin"
      );
      setCreateForm({
        title: "",
        problemStatement: "",
        sourceNcrId: "",
        rootCauseMethod: "5whys",
        dueAt: ""
      });
      await loadCapas();
      await loadDetail(created?.id);
    } catch (e) {
      setError(e?.message || "Unable to create CAPA.");
    } finally {
      setBusyAction("");
    }
  }

  async function transitionStatus(nextStatus) {
    if (!detailId) return;
    setBusyAction(`status-${nextStatus}`);
    setError("");
    try {
      await api.capa.setStatus(detailId, { status: nextStatus }, currentRole || "Admin");
      await loadCapas();
      await loadDetail(detailId);
    } catch (e) {
      setError(e?.message || "Unable to update CAPA status.");
    } finally {
      setBusyAction("");
    }
  }

  async function saveEffectiveness() {
    if (!detailId) return;
    setBusyAction("effectiveness");
    setError("");
    try {
      await api.capa.setEffectiveness(
        detailId,
        {
          effectivenessNotes: effectivenessNotes || ""
        },
        currentRole || "Admin"
      );
      await loadCapas();
      await loadDetail(detailId);
    } catch (e) {
      setError(e?.message || "Unable to save effectiveness verification.");
    } finally {
      setBusyAction("");
    }
  }

  async function addAction(event) {
    event.preventDefault();
    if (!detailId) return;
    setBusyAction("add-action");
    setError("");
    try {
      await api.capa.addAction(
        detailId,
        {
          title: actionForm.title,
          description: actionForm.description || null,
          dueAt: actionForm.dueAt || null
        },
        currentRole || "Admin"
      );
      setActionForm({ title: "", description: "", dueAt: "" });
      await loadCapas();
      await loadDetail(detailId);
    } catch (e) {
      setError(e?.message || "Unable to add CAPA action.");
    } finally {
      setBusyAction("");
    }
  }

  async function setActionStatus(actionId, status) {
    if (!detailId || !actionId) return;
    setBusyAction(`action-${actionId}`);
    setError("");
    try {
      await api.capa.setActionStatus(detailId, actionId, { status }, currentRole || "Admin");
      await loadCapas();
      await loadDetail(detailId);
    } catch (e) {
      setError(e?.message || "Unable to update action status.");
    } finally {
      setBusyAction("");
    }
  }

  return (
    <div className="stack3">
      <div className="card">
        <div className="card-head">
          <div className="card-title">Create CAPA</div>
        </div>
        <form className="card-body" onSubmit={createCapa}>
          <div className="row2">
            <div className="field">
              <label>Title</label>
              <input
                value={createForm.title}
                required
                onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Source NCR ID</label>
              <input
                value={createForm.sourceNcrId}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, sourceNcrId: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label>Root Cause Method</label>
              <select
                value={createForm.rootCauseMethod}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, rootCauseMethod: e.target.value }))
                }
              >
                <option value="">None</option>
                <option value="5whys">5 Whys</option>
                <option value="fishbone">Fishbone</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="field">
              <label>Due Date</label>
              <input
                type="datetime-local"
                value={createForm.dueAt}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, dueAt: e.target.value }))}
              />
            </div>
          </div>
          <div className="field mt1">
            <label>Problem Statement</label>
            <textarea
              rows={3}
              value={createForm.problemStatement}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, problemStatement: e.target.value }))
              }
            />
          </div>
          <div className="gap1 mt1" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-primary" type="submit" disabled={busyAction === "create"}>
              {busyAction === "create" ? "Creating…" : "Create CAPA"}
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-head">
          <div className="card-title">CAPA Queue</div>
          <div className="gap1">
            {overdueCount > 0 ? (
              <span className="badge badge-warn">Overdue {overdueCount}</span>
            ) : null}
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={loadCapas} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        <div className="card-body">
          <div className="field">
            <label htmlFor="capa-search">Search</label>
            <input
              id="capa-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, status, root cause, or source NCR..."
            />
          </div>
          {statusFilter || search.trim() ? (
            <div className="gap1 mt1" style={{ justifyContent: "flex-end" }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setStatusFilter("");
                  setSearch("");
                }}
              >
                Clear Filters
              </button>
            </div>
          ) : null}
        </div>
        {error ? (
          <div className="banner warn" role="alert" style={{ margin: ".2rem .85rem .65rem" }}>
            {error}
          </div>
        ) : null}
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Status</th>
              <th>Title</th>
              <th>Source NCR</th>
              <th>Actions</th>
              <th>Due</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <TableSkeletonRows columns={7} rows={4} /> : null}
            {!loading && visible.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    {search.trim() || statusFilter
                      ? "No CAPAs match your filters."
                      : "No CAPAs yet."}
                  </div>
                </td>
              </tr>
            ) : null}
            {visible.map((item) => {
              const overdue =
                item.status !== "closed" && item.due_at && Date.parse(item.due_at) < Date.now();
              return (
                <tr key={item.id} className="tr-click" onClick={() => loadDetail(item.id)}>
                  <td className="mono">{item.id}</td>
                  <td>
                    <span
                      className={`badge ${item.status === "closed" ? "badge-ok" : "badge-info"}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td>{item.title}</td>
                  <td className="mono">{item.source_ncr_id || "—"}</td>
                  <td className="mono">
                    {item.total_action_count || 0} total / {item.open_action_count || 0} open
                  </td>
                  <td className={overdue ? "text-danger" : "mono"}>
                    {item.due_at ? fmtTs(item.due_at) : "—"}
                  </td>
                  <td className="mono" style={{ fontSize: ".74rem" }}>
                    {fmtTs(item.created_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div
          className="card-body"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: ".65rem",
            flexWrap: "wrap"
          }}
        >
          <div className="text-muted">
            Showing {filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1}-
            {Math.min(filtered.length, safePage * pageSize)} of {filtered.length}
          </div>
          <div className="gap1">
            <select
              value={String(pageSize)}
              onChange={(e) => setPageSize(Math.max(1, Number(e.target.value) || 25))}
            >
              <option value="25">25 / page</option>
              <option value="50">50 / page</option>
              <option value="100">100 / page</option>
            </select>
            <button
              className="btn btn-ghost btn-sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <span className="text-muted mono">
              Page {safePage}/{totalPages}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {detail ? (
        <div className="card">
          <div className="card-head">
            <div className="card-title">CAPA #{detail.id} Detail</div>
          </div>
          <div className="card-body">
            <div className="row2">
              <div className="strip-field">
                <div className="strip-label">Status</div>
                <div className="strip-val">{detail.status}</div>
              </div>
              <div className="strip-field">
                <div className="strip-label">Source NCR</div>
                <div className="strip-val">{detail.source_ncr_id || "—"}</div>
              </div>
              <div className="strip-field">
                <div className="strip-label">Due</div>
                <div className="strip-val">{detail.due_at ? fmtTs(detail.due_at) : "—"}</div>
              </div>
              <div className="strip-field">
                <div className="strip-label">Root Cause</div>
                <div className="strip-val">{detail.root_cause_method || "—"}</div>
              </div>
            </div>
            <p className="mt1" style={{ marginBottom: ".5rem" }}>
              <strong>{detail.title}</strong>
            </p>
            <p className="text-muted" style={{ marginTop: 0 }}>
              {detail.problem_statement || "No problem statement provided."}
            </p>
            <div className="gap1 mt1">
              {detail.status === "open" ? (
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busyAction === "status-in_progress"}
                  onClick={() => transitionStatus("in_progress")}
                >
                  Start In Progress
                </button>
              ) : null}
              {detail.status === "in_progress" ? (
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busyAction === "status-effectiveness_verification"}
                  onClick={() => transitionStatus("effectiveness_verification")}
                >
                  Move To Effectiveness
                </button>
              ) : null}
              {detail.status === "effectiveness_verification" ? (
                <button
                  className="btn btn-primary btn-sm"
                  disabled={busyAction === "status-closed"}
                  onClick={() => transitionStatus("closed")}
                >
                  Close CAPA
                </button>
              ) : null}
            </div>
          </div>

          <div className="card-body" style={{ borderTop: "1px solid var(--border2)" }}>
            <div className="card-title" style={{ marginBottom: ".5rem" }}>
              Corrective Actions
            </div>
            <form className="row2" onSubmit={addAction}>
              <div className="field">
                <label>Action Title</label>
                <input
                  value={actionForm.title}
                  required
                  onChange={(e) => setActionForm((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Due Date</label>
                <input
                  type="datetime-local"
                  value={actionForm.dueAt}
                  onChange={(e) => setActionForm((prev) => ({ ...prev, dueAt: e.target.value }))}
                />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Description</label>
                <input
                  value={actionForm.description}
                  onChange={(e) =>
                    setActionForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                />
              </div>
              <div className="gap1" style={{ justifyContent: "flex-end", gridColumn: "1 / -1" }}>
                <button
                  className="btn btn-ghost btn-sm"
                  type="submit"
                  disabled={busyAction === "add-action"}
                >
                  {busyAction === "add-action" ? "Adding…" : "Add Action"}
                </button>
              </div>
            </form>
            <table className="data-table mt1">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th>Update</th>
                </tr>
              </thead>
              <tbody>
                {(detail.actions || []).map((action) => (
                  <tr key={action.id}>
                    <td>{action.title}</td>
                    <td>{action.status}</td>
                    <td className="mono">{action.due_at ? fmtTs(action.due_at) : "—"}</td>
                    <td>
                      <select
                        value={action.status}
                        onChange={(e) => setActionStatus(action.id, e.target.value)}
                        disabled={busyAction === `action-${action.id}`}
                      >
                        {actionStatusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                {!detail.actions || detail.actions.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty-state">No corrective actions added yet.</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {detail.status === "effectiveness_verification" ? (
            <div className="card-body" style={{ borderTop: "1px solid var(--border2)" }}>
              <div className="card-title" style={{ marginBottom: ".5rem" }}>
                Effectiveness Verification
              </div>
              <div className="field">
                <label>Verification Notes</label>
                <textarea
                  rows={3}
                  value={effectivenessNotes}
                  onChange={(e) => setEffectivenessNotes(e.target.value)}
                />
              </div>
              <div className="gap1 mt1" style={{ justifyContent: "flex-end" }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={saveEffectiveness}
                  disabled={busyAction === "effectiveness"}
                >
                  {busyAction === "effectiveness" ? "Saving…" : "Save Notes"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="card-body" style={{ borderTop: "1px solid var(--border2)" }}>
            <div className="card-title" style={{ marginBottom: ".5rem" }}>
              Audit Trail
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Actor</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {(detail.auditLog || []).map((entry) => (
                  <tr key={entry.id}>
                    <td className="mono" style={{ fontSize: ".74rem" }}>
                      {fmtTs(entry.created_at)}
                    </td>
                    <td>{entry.event_type}</td>
                    <td>{entry.from_status || "—"}</td>
                    <td>{entry.to_status || "—"}</td>
                    <td>{entry.actor_role || "—"}</td>
                    <td>{entry.notes || "—"}</td>
                  </tr>
                ))}
                {!detail.auditLog || detail.auditLog.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state">No audit events recorded.</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

