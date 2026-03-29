import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  isOOT,
  readUrlEnumParam,
  readUrlIntParam,
  readUrlQueryParam,
  samplingLabel,
  writeUrlQueryParams
} from "./jobflowUtils.js";
import { getOperatorName } from "./mappers.js";
import DataModeBanner from "../../shared/components/DataModeBanner.jsx";
import TableSkeletonRows from "../../shared/components/TableSkeletonRows.jsx";
import RecordDetailModal from "./RecordDetailModal.jsx";

export default function AdminRecords({
  records,
  parts,
  toolLibrary,
  usersById,
  loadRecordDetail,
  canEdit,
  currentUserId,
  currentRole,
  onEditValue,
  onRefreshData = null,
  focusRecordId = null,
  dataStatus = "local"
}) {
  const [filter, setFilter] = useState(() => {
    const rawStatus = String(readUrlQueryParam("recordsStatus", "")).trim().toLowerCase();
    const status = ["complete", "oot", "incomplete"].includes(rawStatus) ? rawStatus : "";
    return {
      part: readUrlQueryParam("recordsPart", ""),
      op: readUrlQueryParam("recordsOp", ""),
      lot: readUrlQueryParam("recordsLot", ""),
      status,
      search: readUrlQueryParam("recordsSearch", "")
    };
  });
  const [selected, setSelected] = useState(null);
  const [detailErr, setDetailErr] = useState("");
  const [loadingId, setLoadingId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState("");
  const [exportSelectionMode, setExportSelectionMode] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState({});
  const [sortKey, setSortKey] = useState(() =>
    readUrlEnumParam(
      "recordsSort",
      ["timestamp", "jobNumber", "partNumber", "operation", "lot", "qty", "operator", "result"],
      "timestamp"
    )
  );
  const [sortDir, setSortDir] = useState(() =>
    readUrlEnumParam("recordsDir", ["asc", "desc"], "desc")
  );
  const [pageSize, setPageSize] = useState(() =>
    readUrlIntParam("recordsPageSize", 25, { min: 1, max: 1000 })
  );
  const [page, setPage] = useState(() =>
    readUrlIntParam("recordsPage", 1, { min: 1, max: 100000 })
  );
  const pageResetDepsRef = useRef("");
  const isLoadingData = dataStatus === "loading";
  const hasAnyRecords = records.length > 0;
  const hasRecordFilters =
    !!filter.part || !!filter.op || !!filter.lot || !!filter.status || !!filter.search.trim();
  const allOps = [...new Set(records.map((r) => r.operation))].sort();
  const filtered = records.filter((r) => {
    const matchesPart = !filter.part || r.partNumber.includes(filter.part);
    const matchesOp = !filter.op || r.operation === filter.op;
    const matchesLot =
      !filter.lot || String(r.lot).toLowerCase().includes(String(filter.lot).toLowerCase());
    const matchesStatus =
      !filter.status || r.status === filter.status || (filter.status === "oot" && r.oot);
    const search = filter.search.trim().toLowerCase();
    if (!search) return matchesPart && matchesOp && matchesLot && matchesStatus;
    const hay = [
      r.jobNumber,
      r.partNumber,
      r.lot,
      String(r.operation),
      getOperatorName(r, usersById),
      r.comment || "",
      r.status
    ]
      .join(" ")
      .toLowerCase();
    return matchesPart && matchesOp && matchesLot && matchesStatus && hay.includes(search);
  });
  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const getVal = (r) => {
      if (sortKey === "timestamp") return new Date(r.timestamp).getTime() || 0;
      if (sortKey === "jobNumber") return r.jobNumber || "";
      if (sortKey === "partNumber") return r.partNumber || "";
      if (sortKey === "operation") return String(r.operation || "");
      if (sortKey === "lot") return r.lot || "";
      if (sortKey === "qty") return Number(r.qty || 0);
      if (sortKey === "operator") return getOperatorName(r, usersById) || "";
      if (sortKey === "result") return r.oot ? "oot" : r.status || "";
      return "";
    };
    const av = getVal(a);
    const bv = getVal(b);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
  const totalPages = Math.max(1, Math.ceil(sorted.length / Math.max(1, pageSize)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const visibleRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => {
    writeUrlQueryParams({
      recordsPart: filter.part,
      recordsOp: filter.op,
      recordsLot: filter.lot,
      recordsStatus: filter.status,
      recordsSearch: filter.search.trim(),
      recordsSort: sortKey,
      recordsDir: sortDir,
      recordsPageSize: pageSize,
      recordsPage: page
    });
  }, [
    filter.part,
    filter.op,
    filter.lot,
    filter.status,
    filter.search,
    sortKey,
    sortDir,
    pageSize,
    page
  ]);
  useEffect(() => {
    const depsKey = JSON.stringify([
      filter.part,
      filter.op,
      filter.lot,
      filter.status,
      filter.search,
      sortKey,
      sortDir,
      pageSize
    ]);
    if (!pageResetDepsRef.current) {
      pageResetDepsRef.current = depsKey;
      return;
    }
    if (pageResetDepsRef.current === depsKey) return;
    pageResetDepsRef.current = depsKey;
    setPage(1);
  }, [
    filter.part,
    filter.op,
    filter.lot,
    filter.status,
    filter.search,
    sortKey,
    sortDir,
    pageSize
  ]);
  useEffect(() => {
    if (dataStatus !== "live") return;
    if (records.length === 0) return;
    if (page !== safePage) setPage(safePage);
  }, [dataStatus, records.length, page, safePage]);
  useEffect(() => {
    setSelectedRecordIds((prev) => {
      const visibleIds = new Set(sorted.map((record) => String(record.id)));
      const next = {};
      for (const id of Object.keys(prev)) {
        if (visibleIds.has(id)) next[id] = true;
      }
      return next;
    });
  }, [sorted]);
  useEffect(() => {
    const targetId = String(focusRecordId || "").trim();
    if (!targetId) return;
    const target =
      sorted.find((record) => String(record.id) === targetId) ||
      records.find((record) => String(record.id) === targetId);
    if (!target) return;
    handleSelect(target);
  }, [focusRecordId, sorted, records]);
  const sb = (r) => {
    if (r.status === "incomplete")
      return <span className="badge badge-incomplete">Incomplete</span>;
    if (r.oot) return <span className="badge badge-oot">OOT</span>;
    return <span className="badge badge-ok">OK</span>;
  };
  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }
  function sortIcon(key) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? "↑" : "↓";
  }
  function clearRecordFilters() {
    setFilter({ part: "", op: "", lot: "", status: "", search: "" });
  }
  async function handleSelect(r) {
    setDetailErr("");
    if (!loadRecordDetail || (r.values && Object.keys(r.values).length > 0)) {
      setSelected(r);
      return;
    }
    setLoadingId(r.id);
    try {
      const detail = await loadRecordDetail(r.id);
      setSelected(detail || r);
    } catch (err) {
      setDetailErr(err?.message || "Unable to load record detail.");
      setSelected(r);
    } finally {
      setLoadingId(null);
    }
  }
  async function handleEdit(payload) {
    if (!onEditValue) return null;
    const updated = await onEditValue(payload);
    if (updated) setSelected(updated);
    return updated;
  }
  const selectedRows = exportSelectionMode
    ? sorted.filter((record) => !!selectedRecordIds[String(record.id)])
    : sorted;
  const exportActionLabel = exportSelectionMode
    ? "Export Selected Records CSV"
    : "Export Filtered CSV";
  const exportActionDisabled = exporting || isLoadingData || selectedRows.length === 0;
  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((record) => !!selectedRecordIds[String(record.id)]);
  const anyVisibleSelected = visibleRows.some((record) => !!selectedRecordIds[String(record.id)]);
  function toggleRecordSelection(recordId, checked) {
    const key = String(recordId);
    setSelectedRecordIds((prev) => {
      if (checked) return { ...prev, [key]: true };
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }
  function toggleAllVisibleSelection(checked) {
    if (!checked) {
      setSelectedRecordIds((prev) => {
        const next = { ...prev };
        for (const record of visibleRows) {
          delete next[String(record.id)];
        }
        return next;
      });
      return;
    }
    setSelectedRecordIds((prev) => {
      const next = { ...prev };
      for (const record of visibleRows) {
        next[String(record.id)] = true;
      }
      return next;
    });
  }
  function csvEscape(v) {
    const s = (v ?? "").toString();
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  async function handleExportRecords() {
    if (!loadRecordDetail) return;
    const rowsToExport = selectedRows;
    if (rowsToExport.length === 0) return;
    setExportErr("");
    setExporting(true);
    try {
      const lines = [];
      const header = [
        "Job #",
        "Part",
        "Operation",
        "Lot",
        "Qty",
        "Piece",
        "Dimension",
        "Sampling Plan",
        "Value",
        "Is OOT",
        "Tool",
        "IT #",
        "Operator",
        "Timestamp",
        "Status",
        "Comment",
        "Override Count",
        "Last Override By",
        "Last Override Timestamp",
        "Override Reason",
        "Prior Value",
        "Corrected Value",
        "Missing Reason",
        "Missing Details"
      ];
      lines.push(header.join(","));
      for (const r of rowsToExport) {
        const detail =
          r.values && Object.keys(r.values).length > 0 ? r : await loadRecordDetail(r.id);
        const part = parts[detail.partNumber];
        const opData = part?.operations?.[detail.operation];
        const dims = opData?.dimensions || [];
        const dimMap = new Map(dims.map((d) => [String(d.id), d]));
        const toolMap = detail.tools || {};
        const auditByField = new Map();
        (detail.auditLog || []).forEach((a) => {
          const fieldKey = String(a.field || "");
          if (!auditByField.has(fieldKey)) auditByField.set(fieldKey, []);
          auditByField.get(fieldKey).push(a);
        });
        for (const [key, val] of Object.entries(detail.values || {})) {
          const [dimId, pieceStr] = key.split("_");
          const d = dimMap.get(String(dimId));
          const toolRowsRaw = toolMap?.[String(dimId)];
          const toolRows = Array.isArray(toolRowsRaw)
            ? toolRowsRaw
            : toolRowsRaw
              ? [toolRowsRaw]
              : [];
          const toolNames = toolRows
            .map((ts) => toolLibrary?.[ts?.toolId]?.name || ts?.toolName || "")
            .filter(Boolean)
            .join(" | ");
          const itNums = toolRows
            .map((ts) => ts?.itNum || "")
            .filter(Boolean)
            .join(" | ");
          const oot = isOOT(val, d?.tolPlus ?? 0, d?.tolMinus ?? 0, d?.nominal ?? 0);
          const editKey = `dim:${dimId}|piece:${pieceStr}`;
          const edits = auditByField.get(editKey) || [];
          const latestEdit = edits[0] || null;
          const row = [
            detail.jobNumber,
            detail.partNumber,
            detail.operation,
            detail.lot,
            detail.qty,
            pieceStr,
            d?.name || `Dim ${dimId}`,
            d?.sampling ? samplingLabel(d.sampling, d?.samplingInterval) : "",
            val,
            oot === true ? "Yes" : oot === false ? "No" : "",
            toolNames,
            itNums,
            getOperatorName(detail, usersById),
            detail.timestamp,
            detail.status,
            detail.comment || "",
            edits.length,
            latestEdit?.userName || "",
            latestEdit?.timestamp || "",
            latestEdit?.reason || "",
            latestEdit?.beforeValue || "",
            latestEdit?.afterValue || "",
            "",
            ""
          ];
          lines.push(row.map(csvEscape).join(","));
        }
        for (const [piece, info] of Object.entries(detail.missingPieces || {})) {
          const row = [
            detail.jobNumber,
            detail.partNumber,
            detail.operation,
            detail.lot,
            detail.qty,
            piece,
            "",
            "",
            "",
            "",
            "",
            "",
            getOperatorName(detail, usersById),
            detail.timestamp,
            detail.status,
            detail.comment || "",
            "",
            "",
            "",
            "",
            "",
            "",
            info.reason || "",
            info.details || info.ncNum || ""
          ];
          lines.push(row.map(csvEscape).join(","));
        }
      }
      const csv = lines.join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `records_export_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportErr(e?.message || "Export failed.");
    } finally {
      setExporting(false);
    }
  }
  return (
    <div>
      {selected && (
        <RecordDetailModal
          record={selected}
          parts={parts}
          toolLibrary={toolLibrary}
          usersById={usersById}
          canEdit={canEdit}
          currentUserId={currentUserId}
          currentRole={currentRole}
          onEditValue={handleEdit}
          onClose={() => setSelected(null)}
        />
      )}
      <DataModeBanner
        dataStatus={dataStatus}
        loadingMessage="Loading live records..."
        fallbackMessage="Live records unavailable - showing current local state."
      />
      <div className="card">
        <div className="card-head">
          <div className="card-title">Filter</div>
        </div>
        <div className="card-body">
          <div className="row2" style={{ marginBottom: ".75rem" }}>
            <div className="field" style={{ gridColumn: "span 2" }}>
              <label htmlFor="records-filter-search">Search</label>
              <input
                id="records-filter-search"
                placeholder="Search job, part, lot, operator, comment…"
                value={filter.search}
                onChange={(e) => setFilter((p) => ({ ...p, search: e.target.value }))}
              />
            </div>
          </div>
          <div className="row3">
            <div className="field">
              <label htmlFor="records-filter-part">Part #</label>
              <input
                id="records-filter-part"
                placeholder="All"
                value={filter.part}
                onChange={(e) => setFilter((p) => ({ ...p, part: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="records-filter-operation">Operation</label>
              <select
                id="records-filter-operation"
                value={filter.op}
                onChange={(e) => setFilter((p) => ({ ...p, op: e.target.value }))}
              >
                <option value="">All</option>
                {allOps.map((o) => (
                  <option key={o} value={o}>
                    Op {o}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="records-filter-lot">Lot</label>
              <input
                id="records-filter-lot"
                placeholder="All"
                value={filter.lot}
                onChange={(e) => setFilter((p) => ({ ...p, lot: e.target.value }))}
              />
            </div>
          </div>
          <div className="row2 mt1">
            <div className="field">
              <label htmlFor="records-filter-result">Result</label>
              <select
                id="records-filter-result"
                value={filter.status}
                onChange={(e) => setFilter((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="">All</option>
                <option value="complete">Complete/OK</option>
                <option value="oot">OOT</option>
                <option value="incomplete">Incomplete</option>
              </select>
            </div>
          </div>
          {hasRecordFilters ? (
            <div className="gap1 mt1" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-ghost btn-sm" onClick={clearRecordFilters}>
                Clear Filters
              </button>
            </div>
          ) : null}
          {detailErr && <p className="err-text mt1">{detailErr}</p>}
          {loadingId && (
            <p className="text-muted mt1" style={{ fontSize: ".75rem" }}>
              Loading record detail…
            </p>
          )}
        </div>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-head">
          <div className="card-title">Records</div>
          <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
            <div className="text-muted" style={{ fontSize: ".7rem" }}>
              Click any row to view full detail
            </div>
            <button
              className="btn btn-ghost btn-sm"
              disabled={isLoadingData}
              onClick={() => {
                if (exportSelectionMode) {
                  setExportSelectionMode(false);
                  setSelectedRecordIds({});
                } else {
                  setExportSelectionMode(true);
                }
              }}
            >
              {exportSelectionMode ? "Cancel Selection" : "Select Records for Export"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleExportRecords}
              disabled={exportActionDisabled}
            >
              {exporting ? "Exporting…" : exportActionLabel}
            </button>
          </div>
        </div>
        {exportErr && (
          <div className="err-text" style={{ padding: "0 .85rem" }}>
            {exportErr}
          </div>
        )}
        <table className="data-table">
          <thead>
            <tr>
              {exportSelectionMode && (
                <th style={{ width: "44px", textAlign: "center" }}>
                  <input
                    type="checkbox"
                    aria-label="Select all records for export"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (!el) return;
                      el.indeterminate = !allVisibleSelected && anyVisibleSelected;
                    }}
                    onChange={(event) => toggleAllVisibleSelection(event.target.checked)}
                  />
                </th>
              )}
              <th onClick={() => toggleSort("timestamp")} style={{ cursor: "pointer" }}>
                Timestamp {sortIcon("timestamp")}
              </th>
              <th onClick={() => toggleSort("jobNumber")} style={{ cursor: "pointer" }}>
                Job # {sortIcon("jobNumber")}
              </th>
              <th onClick={() => toggleSort("partNumber")} style={{ cursor: "pointer" }}>
                Part {sortIcon("partNumber")}
              </th>
              <th onClick={() => toggleSort("operation")} style={{ cursor: "pointer" }}>
                Op {sortIcon("operation")}
              </th>
              <th onClick={() => toggleSort("lot")} style={{ cursor: "pointer" }}>
                Lot {sortIcon("lot")}
              </th>
              <th onClick={() => toggleSort("qty")} style={{ cursor: "pointer" }}>
                Qty {sortIcon("qty")}
              </th>
              <th onClick={() => toggleSort("operator")} style={{ cursor: "pointer" }}>
                Operator {sortIcon("operator")}
              </th>
              <th onClick={() => toggleSort("result")} style={{ cursor: "pointer" }}>
                Result {sortIcon("result")}
              </th>
              <th>Comment</th>
            </tr>
          </thead>
          <tbody>
            {isLoadingData ? (
              <TableSkeletonRows columns={exportSelectionMode ? 10 : 9} rows={4} />
            ) : null}
            {!isLoadingData && visibleRows.length === 0 && (
              <tr>
                <td colSpan={exportSelectionMode ? 10 : 9}>
                  <div className="empty-state">
                    {!hasAnyRecords
                      ? "No inspection records exist yet."
                      : hasRecordFilters
                        ? "No records match your filters."
                        : "No records available."}
                    <div className="gap1 mt1" style={{ justifyContent: "center" }}>
                      {hasAnyRecords && hasRecordFilters ? (
                        <button className="btn btn-ghost btn-sm" onClick={clearRecordFilters}>
                          Clear Filters
                        </button>
                      ) : null}
                      {!hasAnyRecords && onRefreshData ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => onRefreshData()}
                          disabled={isLoadingData}
                        >
                          Refresh Data
                        </button>
                      ) : null}
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {!isLoadingData &&
              visibleRows.map((r) => (
                <tr key={r.id} className="tr-click" onClick={() => handleSelect(r)}>
                  {exportSelectionMode && (
                    <td
                      style={{ textAlign: "center" }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.jobNumber} for export`}
                        checked={!!selectedRecordIds[String(r.id)]}
                        onChange={(event) => toggleRecordSelection(r.id, event.target.checked)}
                      />
                    </td>
                  )}
                  <td className="mono" style={{ fontSize: ".74rem", whiteSpace: "nowrap" }}>
                    {r.timestamp}
                  </td>
                  <td className="mono accent-text">{r.jobNumber}</td>
                  <td className="mono">{r.partNumber}</td>
                  <td>Op {r.operation}</td>
                  <td>{r.lot}</td>
                  <td className="mono">{r.qty}</td>
                  <td>{getOperatorName(r, usersById)}</td>
                  <td>{sb(r)}</td>
                  <td
                    className="text-muted"
                    style={{
                      fontSize: ".74rem",
                      maxWidth: "160px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {r.comment || "—"}
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
            Showing {sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1}-
            {Math.min(sorted.length, safePage * pageSize)} of {sorted.length}
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
      <p className="text-muted">
        {sorted.length} record{sorted.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

