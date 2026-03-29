import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "../../api/index.js";
import {
  readUrlEnumParam,
  readUrlIntParam,
  readUrlQueryParam,
  writeUrlQueryParams
} from "./jobflowUtils.js";
import { ISSUE_CATEGORIES } from "./domainConfig.js";
import { fmtTs } from "../../shared/utils/jobflowCore.ts";
import TableSkeletonRows from "../../shared/components/TableSkeletonRows.jsx";

export default function AdminIssueReports({ currentRole, currentUserId }) {
  const [statusFilter, setStatusFilter] = useState(() => {
    const raw = String(readUrlQueryParam("issuesStatus", "open")).trim().toLowerCase();
    return ["open", "completed", ""].includes(raw) ? raw : "open";
  });
  const [search, setSearch] = useState(() => readUrlQueryParam("issuesSearch", ""));
  const [sortKey, setSortKey] = useState(() =>
    readUrlEnumParam(
      "issuesSort",
      ["submittedAt", "status", "category", "submittedBy", "id"],
      "submittedAt"
    )
  );
  const [sortDir, setSortDir] = useState(() =>
    readUrlEnumParam("issuesDir", ["asc", "desc"], "desc")
  );
  const [pageSize, setPageSize] = useState(() =>
    readUrlIntParam("issuesPageSize", 25, { min: 1, max: 1000 })
  );
  const [page, setPage] = useState(() => readUrlIntParam("issuesPage", 1, { min: 1, max: 100000 }));
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [resolvingId, setResolvingId] = useState(null);
  const pageResetReadyRef = useRef(false);

  async function loadIssues(nextStatus = statusFilter) {
    setLoading(true);
    setErr("");
    try {
      const filters = nextStatus ? { status: nextStatus } : {};
      const rows = await api.issues.list(filters, currentRole || "Admin");
      setIssues(rows || []);
    } catch (e) {
      setErr(e?.message || "Unable to load issue reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadIssues(statusFilter);
  }, [statusFilter, currentRole]);
  const filteredIssues = issues.filter((issue) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const hay = [
      issue.id,
      issue.status,
      issue.category,
      issue.submitted_by_name || "",
      issue.details || "",
      issue.part_id ? `Part ${issue.part_id}` : "",
      issue.job_id ? `Job ${issue.job_id}` : "",
      issue.operation_id ? `Op ${issue.operation_id}` : ""
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
  const sortedIssues = [...filteredIssues].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const av =
      sortKey === "id"
        ? Number(a.id || 0)
        : sortKey === "status"
          ? String(a.status || "")
          : sortKey === "category"
            ? String(a.category || "")
            : sortKey === "submittedBy"
              ? String(a.submitted_by_name || a.submitted_by_user_id || "")
              : Date.parse(a.submitted_at || "") || 0;
    const bv =
      sortKey === "id"
        ? Number(b.id || 0)
        : sortKey === "status"
          ? String(b.status || "")
          : sortKey === "category"
            ? String(b.category || "")
            : sortKey === "submittedBy"
              ? String(b.submitted_by_name || b.submitted_by_user_id || "")
              : Date.parse(b.submitted_at || "") || 0;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
  const totalPages = Math.max(1, Math.ceil(sortedIssues.length / Math.max(1, pageSize)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const visibleIssues = sortedIssues.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasIssueFilters = !!statusFilter || !!search.trim();
  useEffect(() => {
    writeUrlQueryParams({
      issuesStatus: statusFilter,
      issuesSearch: search.trim(),
      issuesSort: sortKey,
      issuesDir: sortDir,
      issuesPageSize: pageSize,
      issuesPage: page
    });
  }, [statusFilter, search, sortKey, sortDir, pageSize, page]);
  useEffect(() => {
    if (!pageResetReadyRef.current) {
      pageResetReadyRef.current = true;
      return;
    }
    setPage(1);
  }, [statusFilter, search, sortKey, sortDir, pageSize]);
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  async function markCompleted(issueId) {
    if (!currentUserId) {
      setErr("Select a current user before resolving reports.");
      return;
    }
    setResolvingId(issueId);
    setErr("");
    try {
      await api.issues.complete(
        issueId,
        { userId: Number(currentUserId), resolutionNote: "Reviewed and completed." },
        currentRole || "Admin"
      );
      await loadIssues(statusFilter);
    } catch (e) {
      setErr(e?.message || "Unable to mark issue as completed.");
    } finally {
      setResolvingId(null);
    }
  }

  function categoryLabel(category) {
    return ISSUE_CATEGORIES.find((c) => c.value === category)?.label || category;
  }
  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }
  function sortIcon(key) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? "↑" : "↓";
  }
  function clearFilters() {
    setStatusFilter("");
    setSearch("");
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="card-head">
        <div className="card-title">Operator Issue Reports</div>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ minWidth: "140px" }}
          >
            <option value="open">Open</option>
            <option value="completed">Completed</option>
            <option value="">All</option>
          </select>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => loadIssues(statusFilter)}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>
      <div className="card-body" style={{ paddingBottom: ".5rem" }}>
        <div className="row2" style={{ gap: ".75rem" }}>
          <div className="field" style={{ gridColumn: "span 2" }}>
            <label htmlFor="issues-filter-search">Search</label>
            <input
              id="issues-filter-search"
              placeholder="Search by ID, category, submitter, context, or details..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {hasIssueFilters ? (
          <div className="gap1 mt1" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              Clear Filters
            </button>
          </div>
        ) : null}
      </div>
      {err && (
        <div className="banner warn" role="alert" style={{ margin: ".2rem .85rem .65rem" }}>
          {err}
        </div>
      )}
      <table className="data-table">
        <thead>
          <tr>
            <th onClick={() => toggleSort("id")} style={{ cursor: "pointer" }}>
              ID {sortIcon("id")}
            </th>
            <th onClick={() => toggleSort("status")} style={{ cursor: "pointer" }}>
              Status {sortIcon("status")}
            </th>
            <th onClick={() => toggleSort("category")} style={{ cursor: "pointer" }}>
              Category {sortIcon("category")}
            </th>
            <th onClick={() => toggleSort("submittedBy")} style={{ cursor: "pointer" }}>
              Submitted By {sortIcon("submittedBy")}
            </th>
            <th onClick={() => toggleSort("submittedAt")} style={{ cursor: "pointer" }}>
              Submitted At {sortIcon("submittedAt")}
            </th>
            <th>Context</th>
            <th>Details</th>
            <th>Resolution</th>
          </tr>
        </thead>
        <tbody>
          {loading ? <TableSkeletonRows columns={8} rows={4} /> : null}
          {!loading && visibleIssues.length === 0 && (
            <tr>
              <td colSpan={8}>
                <div className="empty-state">
                  {!hasIssueFilters
                    ? "No issue reports found."
                    : "No issue reports match your filters."}
                  {hasIssueFilters ? (
                    <div className="gap1 mt1" style={{ justifyContent: "center" }}>
                      <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
                        Clear Filters
                      </button>
                    </div>
                  ) : null}
                </div>
              </td>
            </tr>
          )}
          {visibleIssues.map((i) => {
            const context = [
              i.part_id ? `Part ${i.part_id}` : "",
              i.job_id ? `Job ${i.job_id}` : "",
              i.operation_id ? `Op ${i.operation_id}` : ""
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <tr key={i.id}>
                <td className="mono">{i.id}</td>
                <td>
                  {i.status === "completed" ? (
                    <span className="badge badge-ok">Completed</span>
                  ) : (
                    <span className="badge badge-open">Open</span>
                  )}
                </td>
                <td>{categoryLabel(i.category)}</td>
                <td>{i.submitted_by_name || `User #${i.submitted_by_user_id}`}</td>
                <td className="mono" style={{ fontSize: ".74rem", whiteSpace: "nowrap" }}>
                  {fmtTs(i.submitted_at)}
                </td>
                <td className="text-muted" style={{ fontSize: ".74rem" }}>
                  {context || "—"}
                </td>
                <td style={{ maxWidth: "360px", whiteSpace: "normal", lineHeight: 1.4 }}>
                  {i.details}
                </td>
                <td>
                  {i.status === "completed" ? (
                    <div style={{ fontSize: ".74rem" }}>
                      <div>
                        {i.resolved_by_name ||
                          (i.resolved_by_user_id ? `User #${i.resolved_by_user_id}` : "—")}
                      </div>
                      <div className="text-muted mono" style={{ fontSize: ".7rem" }}>
                        {fmtTs(i.resolved_at)}
                      </div>
                    </div>
                  ) : (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => markCompleted(i.id)}
                      disabled={resolvingId === i.id}
                    >
                      {resolvingId === i.id ? "Updating…" : "Mark Complete"}
                    </button>
                  )}
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
          Showing {sortedIssues.length === 0 ? 0 : (safePage - 1) * pageSize + 1}-
          {Math.min(sortedIssues.length, safePage * pageSize)} of {sortedIssues.length}
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
  );
}

