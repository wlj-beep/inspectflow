import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "../../api/index.js";
import {
  readUrlIntParam,
  readUrlQueryParam,
  writeUrlQueryParams
} from "./jobflowUtils.js";
import { fmtTs } from "../../shared/utils/jobflowCore.ts";
import TableSkeletonRows from "../../shared/components/TableSkeletonRows.jsx";

export default function AdminNcr({ currentRole, currentUserId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => readUrlQueryParam("ncrStatus", ""));
  const [search, setSearch] = useState(() => readUrlQueryParam("ncrSearch", ""));
  const [page, setPage] = useState(() => readUrlIntParam("ncrPage", 1, { min: 1, max: 100000 }));
  const [pageSize, setPageSize] = useState(() =>
    readUrlIntParam("ncrPageSize", 25, { min: 1, max: 1000 })
  );
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busyAction, setBusyAction] = useState("");
  const [dispositions, setDispositions] = useState([]);
  const [dispositionForm, setDispositionForm] = useState({ value: "rework", notes: "" });
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    recordId: "",
    recordValueDimensionId: "",
    recordValuePieceNumber: "",
    partId: "",
    jobId: ""
  });

  const canQualityDisposition = currentRole === "Quality" || currentRole === "Admin";
  const canClose = currentRole === "Admin";
  const canVoid = currentRole === "Supervisor" || currentRole === "Admin";

  useEffect(() => {
    writeUrlQueryParams({
      ncrStatus: statusFilter || "",
      ncrSearch: search.trim(),
      ncrPage: page,
      ncrPageSize: pageSize
    });
  }, [statusFilter, search, page, pageSize]);

  async function loadNcrs() {
    setLoading(true);
    setError("");
    try {
      const response = await api.ncr.list(
        {
          status: statusFilter || undefined,
          page,
          pageSize
        },
        currentRole || "Admin"
      );
      setItems(Array.isArray(response?.ncrs) ? response.ncrs : []);
    } catch (e) {
      setError(e?.message || "Unable to load NCRs.");
    } finally {
      setLoading(false);
    }
  }

  async function loadDispositions() {
    try {
      const response = await api.ncr.dispositions(currentRole || "Admin");
      const values = Array.isArray(response?.dispositions) ? response.dispositions : [];
      setDispositions(values);
      if (values[0]?.value) {
        setDispositionForm((prev) => ({ ...prev, value: prev.value || values[0].value }));
      }
    } catch {
      setDispositions([]);
    }
  }

  async function loadDetail(id) {
    if (!id) return;
    setBusyAction("load-detail");
    setError("");
    try {
      const response = await api.ncr.get(id, currentRole || "Admin");
      setDetail(response);
      setDetailId(id);
      setDispositionForm((prev) => ({ ...prev, notes: "" }));
    } catch (e) {
      setError(e?.message || "Unable to load NCR details.");
    } finally {
      setBusyAction("");
    }
  }

  useEffect(() => {
    loadNcrs();
  }, [currentRole, statusFilter, page, pageSize]);

  useEffect(() => {
    loadDispositions();
  }, [currentRole]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [
        item.id,
        item.title,
        item.description,
        item.status,
        item.disposition,
        item.part_id,
        item.job_id
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [items, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / Math.max(1, pageSize)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  async function createNcr(event) {
    event.preventDefault();
    setBusyAction("create");
    setError("");
    try {
      const created = await api.ncr.create(
        {
          title: createForm.title,
          description: createForm.description || null,
          recordId: createForm.recordId || null,
          recordValueDimensionId: createForm.recordValueDimensionId || null,
          recordValuePieceNumber: createForm.recordValuePieceNumber || null,
          partId: createForm.partId || null,
          jobId: createForm.jobId || null
        },
        currentRole || "Admin"
      );
      setCreateForm({
        title: "",
        description: "",
        recordId: "",
        recordValueDimensionId: "",
        recordValuePieceNumber: "",
        partId: "",
        jobId: ""
      });
      await loadNcrs();
      await loadDetail(created?.id);
    } catch (e) {
      setError(e?.message || "Unable to create NCR.");
    } finally {
      setBusyAction("");
    }
  }

  async function transition(action) {
    if (!detailId) return;
    setBusyAction(action);
    setError("");
    try {
      if (action === "pending") {
        await api.ncr.markPendingDisposition(detailId, currentRole || "Admin");
      } else if (action === "disposition") {
        await api.ncr.setDisposition(
          detailId,
          {
            disposition: dispositionForm.value,
            notes: dispositionForm.notes || null
          },
          currentRole || "Admin"
        );
      } else if (action === "close") {
        await api.ncr.close(detailId, currentRole || "Admin");
      } else if (action === "void") {
        const reason = window.prompt("Void reason");
        if (!reason || !reason.trim()) {
          setBusyAction("");
          return;
        }
        await api.ncr.void(
          detailId,
          { reason: reason.trim(), userId: Number(currentUserId) || null },
          currentRole || "Admin"
        );
      }
      await loadNcrs();
      await loadDetail(detailId);
    } catch (e) {
      setError(e?.message || "Unable to update NCR.");
    } finally {
      setBusyAction("");
    }
  }

  function clearFilters() {
    setStatusFilter("");
    setSearch("");
  }

  return (
    <div className="stack3">
      <div className="card">
        <div className="card-head">
          <div className="card-title">Create NCR</div>
        </div>
        <form className="card-body" onSubmit={createNcr}>
          <div className="row2">
            <div className="field">
              <label>Title</label>
              <input
                value={createForm.title}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label>Part ID</label>
              <input
                value={createForm.partId}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, partId: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Job ID</label>
              <input
                value={createForm.jobId}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, jobId: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Record ID (OOT Link)</label>
              <input
                value={createForm.recordId}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, recordId: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Dimension ID (OOT Link)</label>
              <input
                value={createForm.recordValueDimensionId}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, recordValueDimensionId: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label>Piece # (OOT Link)</label>
              <input
                value={createForm.recordValuePieceNumber}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, recordValuePieceNumber: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="field mt1">
            <label>Description</label>
            <textarea
              rows={3}
              value={createForm.description}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="gap1 mt1" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-primary" type="submit" disabled={busyAction === "create"}>
              {busyAction === "create" ? "Creating…" : "Create NCR"}
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-head">
          <div className="card-title">NCR Queue</div>
          <div className="gap1">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="pending_disposition">Pending Disposition</option>
              <option value="dispositioned">Dispositioned</option>
              <option value="closed">Closed</option>
            </select>
            <button className="btn btn-ghost btn-sm" onClick={loadNcrs} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        <div className="card-body">
          <div className="field">
            <label htmlFor="ncr-search">Search</label>
            <input
              id="ncr-search"
              value={search}
              placeholder="Search by title, status, part, job, or disposition..."
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {statusFilter || search.trim() ? (
            <div className="gap1 mt1" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
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
              <th>Part</th>
              <th>Job</th>
              <th>Disposition</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <TableSkeletonRows columns={7} rows={4} /> : null}
            {!loading && visible.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    {search.trim() || statusFilter ? "No NCRs match your filters." : "No NCRs yet."}
                  </div>
                </td>
              </tr>
            ) : null}
            {visible.map((item) => (
              <tr key={item.id} className="tr-click" onClick={() => loadDetail(item.id)}>
                <td className="mono">{item.id}</td>
                <td>
                  <span className="badge badge-info">{item.status}</span>
                </td>
                <td>{item.title}</td>
                <td className="mono">{item.part_id || "—"}</td>
                <td className="mono">{item.job_id || "—"}</td>
                <td>{item.disposition || "—"}</td>
                <td className="mono" style={{ fontSize: ".74rem" }}>
                  {fmtTs(item.created_at)}
                </td>
              </tr>
            ))}
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
            <div className="card-title">NCR #{detail.id} Detail</div>
          </div>
          <div className="card-body">
            <div className="row2">
              <div className="strip-field">
                <div className="strip-label">Status</div>
                <div className="strip-val">{detail.status}</div>
              </div>
              <div className="strip-field">
                <div className="strip-label">Disposition</div>
                <div className="strip-val">{detail.disposition || "—"}</div>
              </div>
              <div className="strip-field">
                <div className="strip-label">Part</div>
                <div className="strip-val">{detail.part_id || "—"}</div>
              </div>
              <div className="strip-field">
                <div className="strip-label">Job</div>
                <div className="strip-val">{detail.job_id || "—"}</div>
              </div>
            </div>
            <p className="mt1" style={{ marginBottom: ".5rem" }}>
              <strong>{detail.title}</strong>
            </p>
            <p className="text-muted" style={{ marginTop: 0 }}>
              {detail.description || "No description provided."}
            </p>
            {detail.status === "open" && canQualityDisposition ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => transition("pending")}
                disabled={busyAction === "pending"}
              >
                {busyAction === "pending" ? "Updating…" : "Mark Pending Disposition"}
              </button>
            ) : null}
            {detail.status === "pending_disposition" && canQualityDisposition ? (
              <div className="stack1 mt1">
                <div className="row2">
                  <div className="field">
                    <label>Disposition</label>
                    <select
                      value={dispositionForm.value}
                      onChange={(e) =>
                        setDispositionForm((prev) => ({ ...prev, value: e.target.value }))
                      }
                    >
                      {dispositions.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Notes</label>
                    <input
                      value={dispositionForm.notes}
                      onChange={(e) =>
                        setDispositionForm((prev) => ({ ...prev, notes: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="gap1" style={{ justifyContent: "flex-end" }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => transition("disposition")}
                    disabled={busyAction === "disposition"}
                  >
                    {busyAction === "disposition" ? "Saving…" : "Apply Disposition"}
                  </button>
                </div>
              </div>
            ) : null}
            <div className="gap1 mt1">
              {detail.status === "dispositioned" && canClose ? (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => transition("close")}
                  disabled={busyAction === "close"}
                >
                  {busyAction === "close" ? "Closing…" : "Close NCR"}
                </button>
              ) : null}
              {detail.status !== "closed" && canVoid ? (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => transition("void")}
                  disabled={busyAction === "void"}
                >
                  {busyAction === "void" ? "Voiding…" : "Void NCR"}
                </button>
              ) : null}
            </div>
          </div>
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

