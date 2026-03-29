import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "../../api/index.js";
import {
  downloadCsv,
  readUrlEnumParam,
  readUrlIntParam,
  readUrlQueryParam,
  rowsToCsv,
  writeUrlQueryParams
} from "./jobflowUtils.js";
import { fmtTs } from "../../shared/utils/jobflowCore.ts";
import TableSkeletonRows from "../../shared/components/TableSkeletonRows.jsx";

export default function AdminComplianceViewer({ currentRole }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState([]);
  const [audits, setAudits] = useState([]);
  const [filter, setFilter] = useState(() => {
    const rawScope = String(readUrlQueryParam("complianceScope", "all")).trim().toLowerCase();
    return {
      scope: ["all", "issue", "audit"].includes(rawScope) ? rawScope : "all",
      search: readUrlQueryParam("complianceSearch", "")
    };
  });
  const [sortKey, setSortKey] = useState(() =>
    readUrlEnumParam(
      "complianceSort",
      ["timestamp", "type", "title", "actor", "status", "ref"],
      "timestamp"
    )
  );
  const [sortDir, setSortDir] = useState(() =>
    readUrlEnumParam("complianceDir", ["asc", "desc"], "desc")
  );
  const [pageSize, setPageSize] = useState(() =>
    readUrlIntParam("compliancePageSize", 25, { min: 1, max: 1000 })
  );
  const [page, setPage] = useState(() =>
    readUrlIntParam("compliancePage", 1, { min: 1, max: 100000 })
  );
  const pageResetReadyRef = useRef(false);

  useEffect(() => {
    let active = true;
    async function loadCompliance() {
      setLoading(true);
      setError("");
      try {
        const [issueRows, auditRows] = await Promise.all([
          api.issues.list({}, currentRole).catch(() => []),
          api.audit.list({}, currentRole).catch(() => [])
        ]);
        if (!active) return;
        setIssues(Array.isArray(issueRows) ? issueRows : []);
        setAudits(Array.isArray(auditRows) ? auditRows : []);
      } catch (err) {
        if (!active) return;
        setError(err?.message || "Unable to load compliance data.");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadCompliance();
    return () => {
      active = false;
    };
  }, [currentRole]);

  const filteredRows = useMemo(() => {
    const issueRows = issues.map((issue) => ({
      type: "issue",
      id: `issue-${issue.id}`,
      timestamp: issue.submitted_at || issue.submittedAt || "",
      title: `Issue ${issue.id} · ${issue.category || "other"}`,
      context: issue.details || "",
      actor: issue.submitted_by_name || issue.submitted_by_role || "",
      status: issue.status || "",
      ref: issue.job_id ? `Job ${issue.job_id}` : issue.record_id ? `Record ${issue.record_id}` : ""
    }));
    const auditRows = audits.map((audit) => ({
      type: "audit",
      id: `audit-${audit.id}`,
      timestamp: audit.timestamp || "",
      title: `Audit ${audit.id} · ${audit.field || "value"}`,
      context: `${audit.before_value ?? ""} -> ${audit.after_value ?? ""}`,
      actor: audit.user_id ? `User ${audit.user_id}` : "",
      status: audit.reason || "",
      ref: audit.record_id ? `Record ${audit.record_id}` : ""
    }));
    const merged = [...issueRows, ...auditRows];
    const search = filter.search.trim().toLowerCase();
    return merged.filter((row) => {
      if (filter.scope !== "all" && row.type !== filter.scope) return false;
      if (!search) return true;
      return [row.title, row.context, row.actor, row.status, row.ref]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [issues, audits, filter]);
  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const av =
        sortKey === "timestamp"
          ? Date.parse(a.timestamp || "") || 0
          : sortKey === "type"
            ? String(a.type || "")
            : sortKey === "title"
              ? String(a.title || "")
              : sortKey === "actor"
                ? String(a.actor || "")
                : sortKey === "status"
                  ? String(a.status || "")
                  : String(a.ref || "");
      const bv =
        sortKey === "timestamp"
          ? Date.parse(b.timestamp || "") || 0
          : sortKey === "type"
            ? String(b.type || "")
            : sortKey === "title"
              ? String(b.title || "")
              : sortKey === "actor"
                ? String(b.actor || "")
                : sortKey === "status"
                  ? String(b.status || "")
                  : String(b.ref || "");
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filteredRows, sortKey, sortDir]);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / Math.max(1, pageSize)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const visibleRows = sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasFilters = filter.scope !== "all" || !!filter.search.trim();
  useEffect(() => {
    writeUrlQueryParams({
      complianceScope: filter.scope === "all" ? "" : filter.scope,
      complianceSearch: filter.search.trim(),
      complianceSort: sortKey,
      complianceDir: sortDir,
      compliancePageSize: pageSize,
      compliancePage: page
    });
  }, [filter.scope, filter.search, sortKey, sortDir, pageSize, page]);
  useEffect(() => {
    if (!pageResetReadyRef.current) {
      pageResetReadyRef.current = true;
      return;
    }
    setPage(1);
  }, [filter.scope, filter.search, sortKey, sortDir, pageSize]);
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function exportComplianceCsv() {
    const headers = ["Type", "ID", "Timestamp", "Title", "Context", "Actor", "Status", "Reference"];
    const rows = sortedRows.map((row) => [
      row.type,
      row.id,
      row.timestamp,
      row.title,
      row.context,
      row.actor,
      row.status,
      row.ref
    ]);
    const csv = rowsToCsv(headers, rows);
    downloadCsv(`compliance_view_${Date.now()}.csv`, csv);
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
    setFilter({ scope: "all", search: "" });
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Compliance Viewer</div>
      </div>
      <div className="card-body">
        <div className="row2" style={{ marginBottom: ".8rem" }}>
          <div className="field">
            <label>Scope</label>
            <select
              value={filter.scope}
              onChange={(event) => setFilter((prev) => ({ ...prev, scope: event.target.value }))}
            >
              <option value="all">All</option>
              <option value="issue">Issue Reports</option>
              <option value="audit">Audit Entries</option>
            </select>
          </div>
          <div className="field">
            <label>Search</label>
            <input
              placeholder="Search context, status, actor, reference…"
              value={filter.search}
              onChange={(event) => setFilter((prev) => ({ ...prev, search: event.target.value }))}
            />
          </div>
        </div>
        {hasFilters ? (
          <div className="gap1" style={{ justifyContent: "flex-end", marginBottom: ".8rem" }}>
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              Clear Filters
            </button>
          </div>
        ) : null}
        <div className="row2" style={{ marginBottom: ".8rem" }}>
          <div className="text-muted" style={{ fontSize: ".82rem" }}>
            Showing {sortedRows.length} entries ({issues.length} issues, {audits.length} audits).
          </div>
          <div style={{ justifySelf: "end" }}>
            <button
              className="btn btn-ghost"
              onClick={exportComplianceCsv}
              disabled={sortedRows.length === 0}
            >
              Export CSV
            </button>
          </div>
        </div>
        {error ? (
          <div className="banner warn" role="alert" style={{ marginBottom: ".8rem" }}>
            Unable to load compliance data. {error}
          </div>
        ) : null}
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => toggleSort("type")} style={{ cursor: "pointer" }}>
                  Type {sortIcon("type")}
                </th>
                <th onClick={() => toggleSort("timestamp")} style={{ cursor: "pointer" }}>
                  Timestamp {sortIcon("timestamp")}
                </th>
                <th onClick={() => toggleSort("title")} style={{ cursor: "pointer" }}>
                  Title {sortIcon("title")}
                </th>
                <th>Context</th>
                <th onClick={() => toggleSort("actor")} style={{ cursor: "pointer" }}>
                  Actor {sortIcon("actor")}
                </th>
                <th onClick={() => toggleSort("status")} style={{ cursor: "pointer" }}>
                  Status/Reason {sortIcon("status")}
                </th>
                <th onClick={() => toggleSort("ref")} style={{ cursor: "pointer" }}>
                  Reference {sortIcon("ref")}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? <TableSkeletonRows columns={7} rows={5} /> : null}
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className={`badge ${row.type === "issue" ? "badge-oot" : "badge-info"}`}>
                      {row.type}
                    </span>
                  </td>
                  <td className="mono">{fmtTs(row.timestamp)}</td>
                  <td>{row.title}</td>
                  <td className="text-muted">{row.context}</td>
                  <td>{row.actor}</td>
                  <td>{row.status}</td>
                  <td>{row.ref}</td>
                </tr>
              ))}
              {!loading && visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      {!hasFilters
                        ? "No compliance entries found."
                        : "No compliance entries match your filters."}
                      {hasFilters ? (
                        <div className="gap1 mt1" style={{ justifyContent: "center" }}>
                          <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
                            Clear Filters
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div
          className="card-body"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: ".65rem",
            paddingLeft: 0,
            paddingRight: 0,
            paddingBottom: 0,
            flexWrap: "wrap"
          }}
        >
          <div className="text-muted">
            Showing {sortedRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1}-
            {Math.min(sortedRows.length, safePage * pageSize)} of {sortedRows.length}
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
    </div>
  );
}

