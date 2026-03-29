import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  readUrlEnumParam,
  readUrlIntParam,
  readUrlQueryParam,
  writeUrlQueryParams
} from "./jobflowUtils.js";
import { normalizeOpNumber } from "../../shared/utils/jobflowCore.ts";
import DataModeBanner from "../../shared/components/DataModeBanner.jsx";
import TableSkeletonRows from "../../shared/components/TableSkeletonRows.jsx";

export default function AdminJobs({
  parts,
  jobs,
  usersById,
  onCreateJob,
  canManageJobs,
  onUnlockJob,
  dataStatus = "local"
}) {
  function newBaseId() {
    return String(Math.floor(Date.now() / 1000) % 1000000).padStart(6, "0");
  }
  function parseFamilyJobNumber(jobNumber, opMatchers = []) {
    const s = String(jobNumber || "")
      .trim()
      .toUpperCase();
    const run = s.slice(-2);
    if (!/^\d{2}$/.test(run) || s.length <= 2) return null;
    const head = s.slice(0, -2);
    const sortedMatchers = [...(opMatchers || [])].sort((a, b) => b.match.length - a.match.length);
    for (const matcher of sortedMatchers) {
      if (!head.endsWith(matcher.match)) continue;
      const baseId = head.slice(0, -matcher.match.length);
      if (!baseId) continue;
      return {
        baseId,
        operationCode: matcher.normalized,
        runIndex: Number(run)
      };
    }
    const match3 = head.match(/^(.+)(\d{3})$/);
    const match2 = head.match(/^(.+)(\d{2})$/);
    let m = null;
    if (match3 && match3[2].startsWith("0")) {
      m = match3;
    } else if (match2) {
      m = match2;
    } else {
      m = match3;
    }
    if (!m) return null;
    const normalizedOp = normalizeOpNumber(m[2]);
    return {
      baseId: m[1],
      operationCode: normalizedOp || m[2],
      runIndex: Number(run)
    };
  }
  const empty = {
    jobNumber: "",
    partNumber: "",
    partRevision: "",
    operation: "",
    lot: "",
    qty: ""
  };
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [buildErr, setBuildErr] = useState("");
  const [building, setBuilding] = useState(false);
  const [sortKey, setSortKey] = useState(() =>
    readUrlEnumParam(
      "jobsSort",
      ["jobNumber", "partNumber", "operation", "lot", "qty", "status"],
      "jobNumber"
    )
  );
  const [sortDir, setSortDir] = useState(() =>
    readUrlEnumParam("jobsDir", ["asc", "desc"], "desc")
  );
  const [pageSize, setPageSize] = useState(() =>
    readUrlIntParam("jobsPageSize", 25, { min: 1, max: 1000 })
  );
  const [page, setPage] = useState(() => readUrlIntParam("jobsPage", 1, { min: 1, max: 100000 }));
  const [gridFilter, setGridFilter] = useState(() => {
    const rawStatus = String(readUrlQueryParam("jobsStatus", "")).trim().toLowerCase();
    const status = ["open", "closed", "draft", "incomplete"].includes(rawStatus) ? rawStatus : "";
    return {
      search: readUrlQueryParam("jobsSearch", ""),
      part: readUrlQueryParam("jobsPart", ""),
      status
    };
  });
  const pageResetReadyRef = useRef(false);
  const [builder, setBuilder] = useState({
    partNumber: "",
    partRevision: "",
    lot: "",
    qty: "",
    ops: {}
  });
  const [baseId, setBaseId] = useState(() => newBaseId());
  const isLoadingData = dataStatus === "loading";
  const hasAnyJobs = Object.keys(jobs).length > 0;
  const partOps =
    form.partNumber && parts[form.partNumber]
      ? Object.entries(parts[form.partNumber].operations)
      : [];
  const builderOps =
    builder.partNumber && parts[builder.partNumber]
      ? Object.entries(parts[builder.partNumber].operations)
      : [];
  const builderOpMatchers = builderOps.flatMap(([opKey]) => {
    const normalized = normalizeOpNumber(opKey) || String(opKey);
    const short = String(Number(normalized));
    if (short && short !== normalized) {
      return [
        { match: normalized, normalized },
        { match: short, normalized }
      ];
    }
    return [{ match: normalized, normalized }];
  });
  const existingLotJobs =
    builder.partNumber && builder.partRevision && builder.lot
      ? Object.values(jobs).filter(
          (j) =>
            j.partNumber === builder.partNumber &&
            j.partRevision === builder.partRevision &&
            String(j.lot).toLowerCase() === String(builder.lot).toLowerCase()
        )
      : [];
  const existingLotOpMatchers = existingLotJobs.flatMap((j) => {
    const normalized = normalizeOpNumber(j.operation) || normalizeOpNumber(j.operationId);
    if (!normalized) return [];
    const short = String(Number(normalized));
    if (short && short !== normalized) {
      return [
        { match: normalized, normalized },
        { match: short, normalized }
      ];
    }
    return [{ match: normalized, normalized }];
  });
  const familyOpMatchers = [...builderOpMatchers, ...existingLotOpMatchers].filter(
    (m, idx, arr) => {
      return arr.findIndex((x) => x.match === m.match && x.normalized === m.normalized) === idx;
    }
  );
  const existingLotMeta = existingLotJobs
    .map((j) => parseFamilyJobNumber(j.jobNumber, familyOpMatchers))
    .filter(Boolean);
  const isDuplicateLot = existingLotJobs.length > 0;
  const preferredBaseId = (() => {
    if (existingLotMeta.length === 0) return "";
    const byBase = {};
    existingLotMeta.forEach((m) => {
      byBase[m.baseId] = (byBase[m.baseId] || 0) + 1;
    });
    return Object.entries(byBase).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  })();
  const nextFamilyRunIndex = existingLotMeta.length
    ? Math.max(...existingLotMeta.map((m) => Number(m.runIndex) || 0)) + 1
    : 1;
  const effectiveBaseId = isDuplicateLot && preferredBaseId ? preferredBaseId : baseId;
  const jobPartOptions = [
    ...new Set(
      Object.values(jobs)
        .map((j) => String(j.partNumber || ""))
        .filter(Boolean)
    )
  ].sort();
  const hasJobFilters = !!gridFilter.search.trim() || !!gridFilter.part || !!gridFilter.status;
  const filteredJobs = Object.values(jobs).filter((j) => {
    const matchesPart = !gridFilter.part || String(j.partNumber || "") === gridFilter.part;
    const normalizedStatus = String(j.status || "").toLowerCase();
    const matchesStatus = !gridFilter.status || normalizedStatus === gridFilter.status;
    const search = gridFilter.search.trim().toLowerCase();
    if (!search) return matchesPart && matchesStatus;
    const hay = [
      j.jobNumber,
      j.partNumber,
      parts[j.partNumber]?.description || "",
      String(j.operation || ""),
      j.lot,
      j.status
    ]
      .join(" ")
      .toLowerCase();
    return matchesPart && matchesStatus && hay.includes(search);
  });
  const sortedJobs = [...filteredJobs].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const av =
      sortKey === "partNumber"
        ? String(a.partNumber || "")
        : sortKey === "operation"
          ? String(a.operation || "")
          : sortKey === "lot"
            ? String(a.lot || "")
            : sortKey === "qty"
              ? Number(a.qty || 0)
              : sortKey === "status"
                ? String(a.status || "")
                : String(a.jobNumber || "");
    const bv =
      sortKey === "partNumber"
        ? String(b.partNumber || "")
        : sortKey === "operation"
          ? String(b.operation || "")
          : sortKey === "lot"
            ? String(b.lot || "")
            : sortKey === "qty"
              ? Number(b.qty || 0)
              : sortKey === "status"
                ? String(b.status || "")
                : String(b.jobNumber || "");
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
  const totalPages = Math.max(1, Math.ceil(sortedJobs.length / Math.max(1, pageSize)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pagedJobs = sortedJobs.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => {
    if (!builder.partNumber) return;
    const ops = Object.keys(parts[builder.partNumber]?.operations || {});
    const nextOps = {};
    const defaultOn = builder.lot && !isDuplicateLot;
    ops.forEach((op) => {
      nextOps[op] = defaultOn;
    });
    setBuilder((p) => ({ ...p, ops: nextOps }));
  }, [builder.partNumber, builder.partRevision, builder.lot, isDuplicateLot, parts]);
  useEffect(() => {
    if (isDuplicateLot && preferredBaseId && baseId !== preferredBaseId) {
      setBaseId(preferredBaseId);
    }
  }, [isDuplicateLot, preferredBaseId, baseId]);
  useEffect(() => {
    writeUrlQueryParams({
      jobsSearch: gridFilter.search.trim(),
      jobsPart: gridFilter.part,
      jobsStatus: gridFilter.status,
      jobsSort: sortKey,
      jobsDir: sortDir,
      jobsPageSize: pageSize,
      jobsPage: page
    });
  }, [gridFilter.search, gridFilter.part, gridFilter.status, sortKey, sortDir, pageSize, page]);
  useEffect(() => {
    if (!pageResetReadyRef.current) {
      pageResetReadyRef.current = true;
      return;
    }
    setPage(1);
  }, [pageSize, jobs, gridFilter.search, gridFilter.part, gridFilter.status, sortKey, sortDir]);
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);
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
  function clearJobFilters() {
    setGridFilter({ search: "", part: "", status: "" });
  }
  async function handleAdd() {
    if (
      !form.jobNumber ||
      !form.partNumber ||
      !form.partRevision ||
      !form.operation ||
      !form.lot ||
      !form.qty
    ) {
      setErr("All fields required.");
      return;
    }
    if (jobs[form.jobNumber.toUpperCase()]) {
      setErr("Job number already exists.");
      return;
    }
    setErr("");
    setSaving(true);
    try {
      await onCreateJob({
        ...form,
        jobNumber: form.jobNumber.toUpperCase(),
        qty: parseInt(form.qty),
        status: "open"
      });
      setForm(empty);
    } catch (e) {
      setErr(e?.message || "Unable to create job.");
    } finally {
      setSaving(false);
    }
  }
  async function handleBuild() {
    if (!builder.partNumber || !builder.partRevision || !builder.lot || !builder.qty) {
      setBuildErr("Part, revision, lot, and qty required.");
      return;
    }
    const opsSelected = Object.keys(builder.ops || {}).filter((k) => builder.ops[k]);
    if (opsSelected.length === 0) {
      setBuildErr("Select at least one operation.");
      return;
    }
    setBuildErr("");
    setBuilding(true);
    try {
      const runIndex = isDuplicateLot ? nextFamilyRunIndex : 1;
      for (const opKey of opsSelected) {
        const remeasureIndex = isDuplicateLot
          ? runIndex
          : existingLotJobs.filter(
              (j) =>
                (normalizeOpNumber(j.operation) || String(j.operation)) ===
                (normalizeOpNumber(opKey) || String(opKey))
            ).length + 1;
        const opCode = normalizeOpNumber(opKey) || String(opKey).padStart(3, "0");
        const jobNumber = `${effectiveBaseId}${opCode}${String(remeasureIndex).padStart(2, "0")}`;
        if (jobs[jobNumber]) {
          throw new Error(`Job number ${jobNumber} already exists. Generate a new base ID.`);
        }
        await onCreateJob({
          jobNumber,
          partNumber: builder.partNumber,
          partRevision: builder.partRevision,
          operation: opKey,
          lot: builder.lot,
          qty: parseInt(builder.qty),
          status: "open"
        });
      }
      setBuilder({ partNumber: "", partRevision: "", lot: "", qty: "", ops: {} });
      setBaseId(newBaseId());
    } catch (e) {
      setBuildErr(e?.message || "Unable to create jobs.");
    } finally {
      setBuilding(false);
    }
  }
  const sb = (s) => {
    if (s === "open") return <span className="badge badge-open">Open</span>;
    if (s === "closed") return <span className="badge badge-closed">Closed</span>;
    if (s === "draft") return <span className="badge badge-draft">Draft</span>;
    if (s === "incomplete") return <span className="badge badge-incomplete">Incomplete</span>;
    return <span className="badge badge-pend">{s}</span>;
  };
  return (
    <div>
      <DataModeBanner
        dataStatus={dataStatus}
        loadingMessage="Loading live jobs..."
        fallbackMessage="Live jobs unavailable - showing current local state."
      />
      <div className="card">
        <div className="card-head">
          <div className="card-title">Create New Job</div>
        </div>
        <div className="card-body">
          <div className="row3">
            <div className="field">
              <label>Job Number</label>
              <input
                id="job-create-number"
                value={form.jobNumber}
                onChange={(e) =>
                  setForm((p) => ({ ...p, jobNumber: e.target.value.toUpperCase() }))
                }
                placeholder="J-10045"
                style={{ fontFamily: "var(--mono)" }}
              />
            </div>
            <div className="field">
              <label>Part Number</label>
              <select
                value={form.partNumber}
                onChange={(e) => {
                  const nextPart = e.target.value;
                  const nextRevision = parts[nextPart]?.currentRevision || "";
                  setForm((p) => ({
                    ...p,
                    partNumber: nextPart,
                    partRevision: nextRevision,
                    operation: ""
                  }));
                }}
              >
                <option value="">— Select Part —</option>
                {Object.keys(parts).map((pn) => (
                  <option key={pn} value={pn}>
                    {pn} — {parts[pn].description}
                    {parts[pn].currentRevision ? ` (Rev ${parts[pn].currentRevision})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Revision</label>
              <select
                value={form.partRevision}
                onChange={(e) => setForm((p) => ({ ...p, partRevision: e.target.value }))}
                disabled={!form.partNumber}
              >
                <option value="">— Select Revision —</option>
                {(parts[form.partNumber]?.revisions || []).map((r) => (
                  <option key={r.revision} value={r.revision}>
                    {r.revision}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="row3 mt1">
            <div className="field">
              <label>Operation</label>
              <select
                value={form.operation}
                onChange={(e) => setForm((p) => ({ ...p, operation: e.target.value }))}
                disabled={!form.partNumber}
              >
                <option value="">— Select Op —</option>
                {partOps.map(([k, op]) => (
                  <option key={k} value={k}>
                    Op {k} — {op.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Lot</label>
              <input
                value={form.lot}
                onChange={(e) => setForm((p) => ({ ...p, lot: e.target.value }))}
                placeholder="e.g. Lot C"
              />
            </div>
            <div className="field">
              <label>Qty</label>
              <input
                type="number"
                min="1"
                value={form.qty}
                onChange={(e) => setForm((p) => ({ ...p, qty: e.target.value }))}
                placeholder="12"
                style={{ fontFamily: "var(--mono)" }}
              />
            </div>
          </div>
          {err && <p className="err-text mt1">{err}</p>}
          <div className="mt2">
            <button
              className="btn btn-primary"
              disabled={saving || isLoadingData || !canManageJobs}
              onClick={handleAdd}
            >
              {saving ? "Creating…" : "+ Create Job"}
            </button>
            {!canManageJobs && (
              <span className="text-muted" style={{ marginLeft: ".65rem" }}>
                Permission required to create jobs.
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Job Builder (Part + Lot)</div>
        </div>
        <div className="card-body">
          <div className="row3">
            <div className="field">
              <label>Part Number</label>
              <select
                value={builder.partNumber}
                onChange={(e) => {
                  const nextPart = e.target.value;
                  const nextRevision = parts[nextPart]?.currentRevision || "";
                  setBuilder((p) => ({ ...p, partNumber: nextPart, partRevision: nextRevision }));
                }}
              >
                <option value="">— Select Part —</option>
                {Object.keys(parts).map((pn) => (
                  <option key={pn} value={pn}>
                    {pn} — {parts[pn].description}
                    {parts[pn].currentRevision ? ` (Rev ${parts[pn].currentRevision})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Revision</label>
              <select
                value={builder.partRevision}
                onChange={(e) => setBuilder((p) => ({ ...p, partRevision: e.target.value }))}
                disabled={!builder.partNumber}
              >
                <option value="">— Select Revision —</option>
                {(parts[builder.partNumber]?.revisions || []).map((r) => (
                  <option key={r.revision} value={r.revision}>
                    {r.revision}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Lot</label>
              <input
                value={builder.lot}
                onChange={(e) => setBuilder((p) => ({ ...p, lot: e.target.value }))}
                placeholder="e.g. Lot B"
              />
            </div>
          </div>
          <div className="row3 mt1">
            <div className="field">
              <label>Qty</label>
              <input
                type="number"
                min="1"
                value={builder.qty}
                onChange={(e) => setBuilder((p) => ({ ...p, qty: e.target.value }))}
                placeholder="12"
                style={{ fontFamily: "var(--mono)" }}
              />
            </div>
          </div>
          {isDuplicateLot && (
            <div className="text-warn" style={{ fontSize: ".75rem", marginTop: ".5rem" }}>
              Lot already exists — creating remeasure jobs.
            </div>
          )}
          {isDuplicateLot && preferredBaseId && (
            <div className="text-muted" style={{ fontSize: ".74rem", marginTop: ".3rem" }}>
              Reusing base job prefix <span className="mono">{preferredBaseId}</span> with run index{" "}
              <span className="mono">{String(nextFamilyRunIndex).padStart(2, "0")}</span> for this
              regenerated family.
            </div>
          )}
          <div className="row2 mt1">
            <div className="field">
              <label>Base Job ID</label>
              <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                <input value={effectiveBaseId} readOnly style={{ fontFamily: "var(--mono)" }} />
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={isDuplicateLot && !!preferredBaseId}
                  onClick={() => setBaseId(newBaseId())}
                >
                  Regenerate
                </button>
              </div>
            </div>
            <div className="field" style={{ alignItems: "flex-end" }}>
              <div className="gap1">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    setBuilder((p) => ({
                      ...p,
                      ops: Object.fromEntries(Object.keys(p.ops || {}).map((k) => [k, true]))
                    }))
                  }
                >
                  Select All
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    setBuilder((p) => ({
                      ...p,
                      ops: Object.fromEntries(Object.keys(p.ops || {}).map((k) => [k, false]))
                    }))
                  }
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
          <div className="section-label" style={{ marginTop: ".75rem" }}>
            Operations
          </div>
          <div className="row3">
            {builderOps.length === 0 && (
              <div className="text-muted">Select a part to choose operations.</div>
            )}
            {builderOps.map(([opKey, op]) => {
              const remeasureIndex = isDuplicateLot
                ? nextFamilyRunIndex
                : existingLotJobs.filter(
                    (j) =>
                      (normalizeOpNumber(j.operation) || String(j.operation)) ===
                      (normalizeOpNumber(opKey) || String(opKey))
                  ).length + 1;
              const opCode = normalizeOpNumber(opKey) || String(opKey).padStart(3, "0");
              const jobNumber = `${effectiveBaseId}${opCode}${String(remeasureIndex).padStart(2, "0")}`;
              return (
                <label
                  key={opKey}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: ".5rem",
                    fontSize: ".85rem"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!builder.ops?.[opKey]}
                    onChange={(e) =>
                      setBuilder((p) => ({ ...p, ops: { ...p.ops, [opKey]: e.target.checked } }))
                    }
                  />
                  Op {opKey} — {op.label}{" "}
                  <span
                    className="text-muted"
                    style={{ fontFamily: "var(--mono)", fontSize: ".72rem" }}
                  >
                    {jobNumber}
                  </span>
                </label>
              );
            })}
          </div>
          {buildErr && <p className="err-text mt1">{buildErr}</p>}
          <div className="mt2">
            <button
              className="btn btn-primary"
              disabled={building || isLoadingData || !canManageJobs}
              onClick={handleBuild}
            >
              {building ? "Creating…" : "Create Jobs"}
            </button>
          </div>
        </div>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-head">
          <div className="card-title">All Jobs</div>
          <div className="text-muted" style={{ fontSize: ".72rem" }}>
            {sortedJobs.length} shown
          </div>
        </div>
        <div className="card-body" style={{ paddingBottom: ".5rem" }}>
          <div className="row2" style={{ gap: ".75rem", marginBottom: ".75rem" }}>
            <div className="field" style={{ gridColumn: "span 2" }}>
              <label htmlFor="jobs-filter-search">Search</label>
              <input
                id="jobs-filter-search"
                placeholder="Search by job #, part, lot, or status…"
                value={gridFilter.search}
                onChange={(e) => setGridFilter((prev) => ({ ...prev, search: e.target.value }))}
              />
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="jobs-filter-part">Part #</label>
              <select
                id="jobs-filter-part"
                value={gridFilter.part}
                onChange={(e) => setGridFilter((prev) => ({ ...prev, part: e.target.value }))}
              >
                <option value="">All</option>
                {jobPartOptions.map((partNumber) => (
                  <option key={partNumber} value={partNumber}>
                    {partNumber}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="jobs-filter-status">Status</label>
              <select
                id="jobs-filter-status"
                value={gridFilter.status}
                onChange={(e) => setGridFilter((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="">All</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="draft">Draft</option>
                <option value="incomplete">Incomplete</option>
              </select>
            </div>
          </div>
          {hasJobFilters ? (
            <div className="gap1 mt1" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-ghost btn-sm" onClick={clearJobFilters}>
                Clear Filters
              </button>
            </div>
          ) : null}
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort("jobNumber")} style={{ cursor: "pointer" }}>
                Job # {sortIcon("jobNumber")}
              </th>
              <th onClick={() => toggleSort("partNumber")} style={{ cursor: "pointer" }}>
                Part {sortIcon("partNumber")}
              </th>
              <th>Rev</th>
              <th onClick={() => toggleSort("operation")} style={{ cursor: "pointer" }}>
                Operation {sortIcon("operation")}
              </th>
              <th onClick={() => toggleSort("lot")} style={{ cursor: "pointer" }}>
                Lot {sortIcon("lot")}
              </th>
              <th onClick={() => toggleSort("qty")} style={{ cursor: "pointer" }}>
                Qty {sortIcon("qty")}
              </th>
              <th onClick={() => toggleSort("status")} style={{ cursor: "pointer" }}>
                Status {sortIcon("status")}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoadingData ? <TableSkeletonRows columns={7} rows={4} /> : null}
            {!isLoadingData && pagedJobs.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    {!hasAnyJobs
                      ? "No jobs exist yet."
                      : hasJobFilters
                        ? "No jobs match your filters."
                        : "No jobs available."}
                    <div className="gap1 mt1" style={{ justifyContent: "center" }}>
                      {!hasAnyJobs ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => document.getElementById("job-create-number")?.focus()}
                        >
                          Create a Job
                        </button>
                      ) : null}
                      {hasAnyJobs && hasJobFilters ? (
                        <button className="btn btn-ghost btn-sm" onClick={clearJobFilters}>
                          Clear Filters
                        </button>
                      ) : null}
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {!isLoadingData &&
              pagedJobs.map((j) => (
                <tr key={j.jobNumber}>
                  <td className="mono accent-text">{j.jobNumber}</td>
                  <td>
                    <span className="mono">{j.partNumber}</span>{" "}
                    <span className="text-muted">{parts[j.partNumber]?.description}</span>
                  </td>
                  <td className="mono">{j.partRevision || "A"}</td>
                  <td>
                    Op {j.operation} — {parts[j.partNumber]?.operations[j.operation]?.label}
                  </td>
                  <td>{j.lot}</td>
                  <td className="mono">{j.qty}</td>
                  <td>
                    {sb(j.status)}
                    {j.lockOwnerUserId && (
                      <div className="text-muted" style={{ fontSize: ".7rem" }}>
                        Locked by{" "}
                        {usersById?.[String(j.lockOwnerUserId)] || `User #${j.lockOwnerUserId}`}
                      </div>
                    )}
                    {j.lockOwnerUserId && canManageJobs && onUnlockJob && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ marginTop: ".25rem" }}
                        onClick={() => onUnlockJob(j.jobNumber)}
                      >
                        Force Unlock
                      </button>
                    )}
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
            Showing {sortedJobs.length === 0 ? 0 : (safePage - 1) * pageSize + 1}-
            {Math.min(sortedJobs.length, safePage * pageSize)} of {sortedJobs.length}
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

