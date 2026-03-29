import React from "react";
import { api } from "../../api/index.js";
import { fmtTs } from "../../shared/utils/jobflowCore.ts";
import { ISSUE_CATEGORIES } from "./domainConfig.js";
import { AutocompleteInput, MissingPieceModal } from "./jobflowWidgets.jsx";
import {
  fileToBase64Payload,
  fmtSpec,
  formatByteSize,
  getSamplePieces,
  hasInstructionPayload,
  inferAttachmentMediaType,
  isOOT,
  isToolSelectable,
  normalizeActiveInstruction,
  readUrlEnumParam,
  readUrlIntParam,
  readUrlQueryParam,
  samplingLabel,
  splitRangeValue,
  writeUrlQueryParams
} from "./jobflowUtils.js";
import { useOperatorViewController } from "./hooks/useOperatorViewController.js";

export default function OperatorView(props) {
  const controller = useOperatorViewController(props);
  const {
    step,
    setStep,
    jobInput,
    setJobInput,
    jobFilter,
    setJobFilter,
    jobSortKey,
    setJobSortKey,
    jobSortDir,
    setJobSortDir,
    jobPageSize,
    setJobPageSize,
    jobPage,
    setJobPage,
    currentJob,
    setCurrentJob,
    values,
    setValues,
    toolSel,
    setToolSel,
    unlocked,
    setUnlocked,
    missing,
    setMissing,
    comment,
    setComment,
    showModal,
    setShowModal,
    colWidths,
    setColWidths,
    tableDensity,
    setTableDensity,
    activeCell,
    setActiveCell,
    jobErr,
    setJobErr,
    submitErr,
    setSubmitErr,
    submitting,
    setSubmitting,
    issueCategory,
    setIssueCategory,
    issueDetails,
    setIssueDetails,
    issueErr,
    setIssueErr,
    issueOk,
    setIssueOk,
    reportingIssue,
    setReportingIssue,
    importCsv,
    setImportCsv,
    importingCsv,
    setImportingCsv,
    importErr,
    setImportErr,
    attachmentPiece,
    setAttachmentPiece,
    attachmentRetention,
    setAttachmentRetention,
    stagedAttachments,
    setStagedAttachments,
    attachmentErr,
    setAttachmentErr,
    lastSubmitSource,
    setLastSubmitSource,
    instructionState,
    setInstructionState,
    acknowledgingInstruction,
    setAcknowledgingInstruction,
    importFileRef,
    attachmentFileRef,
    currentUserName,
    part,
    opData,
    dims,
    getColWidth,
    startResize,
    maybeStartResize,
    applyColumnPreset,
    preventNegative,
    handleValueKeyDown,
    splitRange,
    setRangeValue,
    isValueComplete,
    togglePf,
    normalizeToolRows,
    getToolRows,
    setToolRows,
    getActiveToolRows,
    resetInstructionState,
    loadInstructionForJob,
    allPieces,
    isGaugeMode,
    cellRequired,
    hasStarted,
    incompletePieces,
    ootList,
    hasOOT,
    ootByPiece,
    summaryCounts,
    toolRequiredDims,
    toolsReady,
    canFull,
    canPartial,
    loadJob,
    buildRecord,
    activeInstruction,
    instructionRequiresAck,
    instructionAckStatus,
    handleAcknowledgeInstruction,
    handleFull,
    handleMissingSave,
    handleDraft,
    triggerImportUpload,
    handleImportUpload,
    triggerAttachmentUpload,
    handleAttachmentUpload,
    removeAttachmentAt,
    handleCsvMeasurementImport,
    handleIssueSubmit,
    releaseLock,
    reset,
    openJobs,
    currentUserId,
    currentRole,
    parts,
    jobs,
    usersById,
    toolLibrary,
    firstOotAlert,
    partFilterOptions,
    opFilterOptions,
    filteredOpenJobs,
    sortedOpenJobs,
    totalJobPages,
    safeJobPage,
    pagedOpenJobs,
    toggleJobSort,
    jobSortIcon
  } = controller;

  const stepTitles = {
    lookup: "Step 1 of 3 - Lookup",
    entry: "Step 2 of 3 - Entry",
    saved: "Step 3 of 3 - Draft Saved",
    success: "Step 3 of 3 - Complete"
  };
  if (step === "lookup")
    return (
      <div>
        <div className="crumbs">
          <span className="crumb">Home</span>
          <span className="crumb-sep">/</span>
          <span className="crumb">Operator</span>
          <span className="crumb-sep">/</span>
          <span className="crumb">Lookup</span>
        </div>
        <div className="banner" style={{ marginBottom: ".75rem" }}>
          <strong>{stepTitles.lookup}</strong> - Select a job and load it to begin measurement
          entry.
        </div>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Job Entry</div>
          </div>
          <div className="card-body">
            <div className="row2" style={{ marginBottom: ".75rem" }}>
              <div className="field">
                <label>Part Filter Chips</label>
                <div className="chip-row">
                  {partFilterOptions.map((value) => (
                    <button
                      key={value}
                      className={`chip-btn ${jobFilter.part === value ? "active" : ""}`}
                      onClick={() => setJobFilter((prev) => ({ ...prev, part: value }))}
                    >
                      {value === "all" ? "All Parts" : value}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Operation Filter Chips</label>
                <div className="chip-row">
                  {opFilterOptions.map((value) => (
                    <button
                      key={value}
                      className={`chip-btn ${jobFilter.operation === value ? "active" : ""}`}
                      onClick={() => setJobFilter((prev) => ({ ...prev, operation: value }))}
                    >
                      {value === "all" ? "All Ops" : `Op ${value}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="row2">
              <div className="field" style={{ gridColumn: "span 2" }}>
                <label>Job Number</label>
                <AutocompleteInput
                  value={jobInput}
                  onChange={setJobInput}
                  options={filteredOpenJobs.map((j) => ({ value: j.jobNumber, job: j }))}
                  filterFn={(o, inp) => o.value.toLowerCase().includes(inp.toLowerCase())}
                  placeholder="e.g. J-10042"
                  style={{ fontFamily: "var(--mono)", fontSize: "1.05rem" }}
                  renderOption={(o) => (
                    <div>
                      <span style={{ fontFamily: "var(--mono)", color: "var(--accent2)" }}>
                        {o.value}
                      </span>
                      {o.job.status === "draft" && (
                        <span
                          className="badge badge-draft"
                          style={{ marginLeft: ".5rem", fontSize: ".6rem" }}
                        >
                          Draft
                        </span>
                      )}
                      <div className="ac-sub">
                        Part {o.job.partNumber} · Op {o.job.operation} · {o.job.lot} · Qty{" "}
                        {o.job.qty}
                      </div>
                    </div>
                  )}
                />
                {jobInput && !jobs[jobInput.toUpperCase()] && (
                  <p className="text-muted mt1" style={{ fontSize: ".75rem" }}>
                    Job not found.
                  </p>
                )}
                {jobInput && jobs[jobInput.toUpperCase()]?.status === "closed" && (
                  <p className="mt1 text-warn" style={{ fontSize: ".75rem" }}>
                    Job is closed.
                  </p>
                )}
                {(jobs[jobInput.toUpperCase()]?.status === "open" ||
                  jobs[jobInput.toUpperCase()]?.status === "draft") &&
                  jobInput && (
                    <p className="mt1 text-ok" style={{ fontSize: ".75rem" }}>
                      Job found.
                    </p>
                  )}
              </div>
            </div>
            <div className="text-muted" style={{ fontSize: ".75rem", marginTop: ".65rem" }}>
              Current User:{" "}
              <span style={{ color: "var(--text)", fontWeight: 600 }}>
                {currentUserName || "— Select user above —"}
              </span>
            </div>
            {jobErr && <p className="err-text mt1">{jobErr}</p>}
            <div className="mt2">
              <button
                className="btn btn-primary"
                disabled={
                  !currentUserId ||
                  !jobs[jobInput.toUpperCase()] ||
                  (jobs[jobInput.toUpperCase()]?.status !== "open" &&
                    jobs[jobInput.toUpperCase()]?.status !== "draft")
                }
                onClick={() => {
                  if (!currentUserId) {
                    setJobErr("Select a current user before loading a job.");
                    return;
                  }
                  loadJob(jobInput);
                }}
              >
                Load Job →
              </button>
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="card-head">
            <div className="card-title">Available Jobs</div>
            <div className="text-muted" style={{ fontSize: ".7rem" }}>
              {sortedOpenJobs.length} shown · Click to select
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => toggleJobSort("jobNumber")} style={{ cursor: "pointer" }}>
                  Job # {jobSortIcon("jobNumber")}
                </th>
                <th onClick={() => toggleJobSort("partNumber")} style={{ cursor: "pointer" }}>
                  Part {jobSortIcon("partNumber")}
                </th>
                <th onClick={() => toggleJobSort("operation")} style={{ cursor: "pointer" }}>
                  Operation {jobSortIcon("operation")}
                </th>
                <th onClick={() => toggleJobSort("lot")} style={{ cursor: "pointer" }}>
                  Lot {jobSortIcon("lot")}
                </th>
                <th onClick={() => toggleJobSort("qty")} style={{ cursor: "pointer" }}>
                  Qty {jobSortIcon("qty")}
                </th>
                <th onClick={() => toggleJobSort("status")} style={{ cursor: "pointer" }}>
                  Status {jobSortIcon("status")}
                </th>
              </tr>
            </thead>
            <tbody>
              {pagedOpenJobs.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">No jobs match current filters.</div>
                  </td>
                </tr>
              )}
              {pagedOpenJobs.map((j) => (
                <tr key={j.jobNumber} className="tr-click" onClick={() => setJobInput(j.jobNumber)}>
                  <td className="mono accent-text">{j.jobNumber}</td>
                  <td className="mono">{j.partNumber}</td>
                  <td>
                    Op {j.operation} — {parts[j.partNumber]?.operations[j.operation]?.label}
                  </td>
                  <td>{j.lot}</td>
                  <td className="mono">{j.qty}</td>
                  <td>
                    {j.status === "draft" ? (
                      <span className="badge badge-draft">Draft</span>
                    ) : (
                      <span className="badge badge-open">Open</span>
                    )}
                    {j.lockOwnerUserId &&
                      String(j.lockOwnerUserId) !== String(currentUserId || "") && (
                        <div className="text-muted" style={{ fontSize: ".7rem" }}>
                          Locked by{" "}
                          {usersById?.[String(j.lockOwnerUserId)] || `User #${j.lockOwnerUserId}`}
                        </div>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  if (step === "entry")
    return (
      <div>
        <div className="crumbs">
          <span className="crumb">Home</span>
          <span className="crumb-sep">/</span>
          <span className="crumb">Operator</span>
          <span className="crumb-sep">/</span>
          <span className="crumb">{currentJob?.jobNumber || "Entry"}</span>
        </div>
        <div className="banner" style={{ marginBottom: ".75rem" }}>
          <strong>{stepTitles.entry}</strong> - Capture measurements and submit or save draft.
        </div>
        <input
          ref={importFileRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={handleImportUpload}
        />
        <input
          ref={attachmentFileRef}
          type="file"
          accept="image/*,.pdf,.txt,.csv"
          data-testid="operator-attachment-input"
          style={{ display: "none" }}
          onChange={handleAttachmentUpload}
        />
        {showModal && (
          <MissingPieceModal
            pieces={incompletePieces}
            missingPieces={missing}
            onSave={handleMissingSave}
            onCancel={() => setShowModal(false)}
          />
        )}
        <div className="job-strip">
          <div className="strip-field">
            <div className="strip-label">Job #</div>
            <div className="strip-val">{currentJob.jobNumber}</div>
          </div>
          <div className="strip-field">
            <div className="strip-label">Part</div>
            <div className="strip-val">
              {currentJob.partNumber}{" "}
              <span
                style={{ fontFamily: "var(--sans)", fontSize: ".78rem", color: "var(--muted)" }}
              >
                {part?.description}
              </span>
            </div>
          </div>
          <div className="strip-field">
            <div className="strip-label">Operation</div>
            <div className="strip-val">
              Op {currentJob.operation} —{" "}
              <span style={{ fontFamily: "var(--sans)", fontSize: ".82rem", color: "var(--text)" }}>
                {opData?.label}
              </span>
            </div>
          </div>
          <div className="strip-field">
            <div className="strip-label">Lot</div>
            <div className="strip-val">{currentJob.lot}</div>
          </div>
          <div className="strip-field">
            <div className="strip-label">Qty</div>
            <div className="strip-val">{currentJob.qty} pcs</div>
          </div>
          <div className="strip-field">
            <div className="strip-label">Operator</div>
            <div
              className="strip-val"
              style={{ fontFamily: "var(--sans)", fontSize: ".85rem", color: "var(--text)" }}
            >
              {currentUserName || "—"}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={reset}>
            ← Back
          </button>
        </div>

        <div className="card" data-testid="active-instruction-card">
          <div className="card-head">
            <div className="card-title">Active Instruction</div>
            <div className="text-muted" style={{ fontSize: ".7rem" }}>
              {instructionState.status === "loading"
                ? "Loading…"
                : activeInstruction
                  ? instructionAckStatus || "Active for this job"
                  : instructionState.error || "No active instruction"}
            </div>
          </div>
          <div className="card-body">
            {instructionState.status === "loading" && (
              <div className="text-muted">Loading the active instruction for this job…</div>
            )}
            {instructionState.error && !activeInstruction && (
              <div className="text-warn" style={{ fontSize: ".76rem" }}>
                {instructionState.error}
              </div>
            )}
            {instructionState.status !== "loading" &&
              !activeInstruction &&
              !instructionState.error && (
                <div className="text-muted" style={{ fontSize: ".76rem" }}>
                  No instruction is currently published for this operation.
                </div>
              )}
            {activeInstruction && (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: ".75rem",
                    alignItems: "flex-start",
                    flexWrap: "wrap"
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: ".92rem" }}>
                      {activeInstruction.title || "Instruction"}
                    </div>
                    <div className="text-muted" style={{ fontSize: ".72rem", marginTop: ".2rem" }}>
                      {activeInstruction.versionLabel
                        ? `Version ${activeInstruction.versionLabel}`
                        : "Published instruction"}
                      {activeInstruction.acknowledgedByName
                        ? ` · Ack by ${activeInstruction.acknowledgedByName}`
                        : ""}
                    </div>
                  </div>
                  <div className="gap1" style={{ flexWrap: "wrap" }}>
                    <span
                      className={`badge ${instructionRequiresAck ? "badge-incomplete" : "badge-open"}`}
                    >
                      {instructionAckStatus || "Ready"}
                    </span>
                    {instructionState.status === "ready" && activeInstruction.active && (
                      <span className="badge badge-ok">Published</span>
                    )}
                  </div>
                </div>
                {activeInstruction.summary && (
                  <div
                    className="text-muted"
                    style={{ fontSize: ".78rem", marginTop: ".5rem", lineHeight: 1.5 }}
                  >
                    {activeInstruction.summary}
                  </div>
                )}
                {activeInstruction.body && (
                  <div style={{ marginTop: ".45rem", fontSize: ".78rem", lineHeight: 1.55 }}>
                    {activeInstruction.body}
                  </div>
                )}
                {activeInstruction.mediaLinks.length > 0 && (
                  <div className="gap1" style={{ marginTop: ".7rem", flexWrap: "wrap" }}>
                    {activeInstruction.mediaLinks.map((link, idx) => (
                      <a
                        key={`${activeInstruction.id}-${idx}-${link.url}`}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost btn-xs"
                        style={{ textDecoration: "none" }}
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                )}
                <div className="gap1 mt1" style={{ flexWrap: "wrap" }}>
                  <button
                    className="btn btn-primary btn-sm"
                    data-testid="instruction-ack-button"
                    disabled={
                      !activeInstruction || !instructionRequiresAck || acknowledgingInstruction
                    }
                    onClick={handleAcknowledgeInstruction}
                  >
                    {activeInstruction.acknowledged
                      ? "Acknowledged"
                      : acknowledgingInstruction
                        ? "Acknowledging…"
                        : "Acknowledge Instruction"}
                  </button>
                  {instructionRequiresAck && (
                    <span className="text-warn" style={{ fontSize: ".76rem", alignSelf: "center" }}>
                      Acknowledge before submitting the job.
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="card-head">
            <div className="card-title">Measurement Entry</div>
            <div className="gap1" style={{ justifyContent: "flex-end" }}>
              <div className="chip-row">
                <button
                  className={`seg-btn ${tableDensity === "compact" ? "active" : ""}`}
                  onClick={() => setTableDensity("compact")}
                >
                  Compact
                </button>
                <button
                  className={`seg-btn ${tableDensity === "expanded" ? "active" : ""}`}
                  onClick={() => setTableDensity("expanded")}
                >
                  Expanded
                </button>
              </div>
              <div className="chip-row">
                <button className="seg-btn" onClick={() => applyColumnPreset("narrow")}>
                  Narrow
                </button>
                <button className="seg-btn" onClick={() => applyColumnPreset("default")}>
                  Default
                </button>
                <button className="seg-btn" onClick={() => applyColumnPreset("wide")}>
                  Wide
                </button>
              </div>
              <div className="text-muted ux-hint">
                + unlocks N/A cells · × re-locks empty cells · Esc clears a value · auto-save after
                20 min idle
              </div>
            </div>
          </div>
          <div className="meas-scroll">
            <table
              className="meas-table"
              onMouseDown={maybeStartResize}
              style={{ width: 118 + dims.reduce((s, d) => s + getColWidth(d.id), 0) }}
            >
              <colgroup>
                <col style={{ width: "118px" }} />
                {dims.map((d) => (
                  <col key={d.id} style={{ width: getColWidth(d.id) + "px" }} />
                ))}
              </colgroup>
              <tbody>
                <tr className="hrow spec-row">
                  <td className="rl">Dimension</td>
                  {dims.map((d) => (
                    <td
                      key={d.id}
                      data-dim-id={d.id}
                      className="dc"
                      style={{ padding: 0, verticalAlign: "top", position: "relative" }}
                    >
                      <div className="dim-hdr">
                        <div className="dim-hdr-name">{d.name}</div>
                        <div className="dim-hdr-spec">{fmtSpec(d)}</div>
                      </div>
                      <div
                        className="col-resize"
                        aria-hidden="true"
                        tabIndex={-1}
                        onMouseDown={(e) => startResize(e, d.id)}
                      />
                    </td>
                  ))}
                </tr>
                {tableDensity !== "compact" && (
                  <tr className="hrow">
                    <td className="rl">Tools / IT #</td>
                    {dims.map((d) => {
                      const allowedTools = d.tools
                        .map((tid) => toolLibrary[tid])
                        .filter(isToolSelectable);
                      const toolNames = [...new Set(allowedTools.map((t) => t.name))];
                      const rows = getToolRows(d.id);
                      return (
                        <td
                          key={d.id}
                          data-dim-id={d.id}
                          className="dc hdr-cell"
                          style={{ verticalAlign: "top" }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
                            {rows.map((row, rowIdx) => {
                              const selectedName = row.toolName || "";
                              const itOptions = selectedName
                                ? allowedTools.filter((t) => t.name === selectedName)
                                : allowedTools;
                              const itListId = `itlist_${d.id}_${rowIdx}`;
                              const currentIt = (row.itNum || "").toUpperCase();
                              const match = allowedTools.find(
                                (t) => String(t.itNum).toUpperCase() === currentIt
                              );
                              const invalid = currentIt && !match;
                              return (
                                <div
                                  key={`${d.id}_${rowIdx}`}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr auto auto",
                                    gap: ".3rem",
                                    alignItems: "start"
                                  }}
                                >
                                  <select
                                    className="hdr-inp"
                                    value={selectedName}
                                    onChange={(e) => {
                                      const name = e.target.value;
                                      setToolRows(d.id, (prev) =>
                                        prev.map((r, i) =>
                                          i === rowIdx
                                            ? { ...r, toolName: name, toolId: "", itNum: "" }
                                            : r
                                        )
                                      );
                                    }}
                                  >
                                    <option value="">— Select Tool —</option>
                                    {toolNames.map((name) => (
                                      <option key={name} value={name}>
                                        {name}
                                      </option>
                                    ))}
                                  </select>
                                  <div>
                                    <input
                                      className="hdr-inp mf"
                                      list={itListId}
                                      value={currentIt}
                                      placeholder={
                                        selectedName ? "Type or select IT #" : "Type IT #"
                                      }
                                      onChange={(e) => {
                                        const v = e.target.value.toUpperCase();
                                        const t = allowedTools.find(
                                          (x) => String(x.itNum).toUpperCase() === v
                                        );
                                        setToolRows(d.id, (prev) =>
                                          prev.map((r, i) =>
                                            i === rowIdx
                                              ? {
                                                  ...r,
                                                  toolName: t?.name || r.toolName || "",
                                                  toolId: t?.id || "",
                                                  itNum: v
                                                }
                                              : r
                                          )
                                        );
                                      }}
                                      onBlur={() => {
                                        if (!currentIt) {
                                          setToolRows(d.id, (prev) =>
                                            prev.map((r, i) =>
                                              i === rowIdx ? { ...r, toolId: "", itNum: "" } : r
                                            )
                                          );
                                          return;
                                        }
                                        if (match) {
                                          setToolRows(d.id, (prev) =>
                                            prev.map((r, i) =>
                                              i === rowIdx
                                                ? {
                                                    ...r,
                                                    toolName: match.name,
                                                    toolId: match.id,
                                                    itNum: match.itNum
                                                  }
                                                : r
                                            )
                                          );
                                        }
                                      }}
                                    />
                                    <datalist id={itListId}>
                                      {itOptions.map((t) => (
                                        <option key={t.id} value={t.itNum}>
                                          {t.itNum}
                                        </option>
                                      ))}
                                    </datalist>
                                    {invalid && (
                                      <div
                                        className="text-warn"
                                        style={{ fontSize: ".65rem", marginTop: ".2rem" }}
                                      >
                                        IT # not found for selected tool
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    className="btn btn-ghost btn-xs"
                                    type="button"
                                    onClick={() =>
                                      setToolRows(d.id, (prev) => [
                                        ...prev,
                                        { toolName: "", toolId: "", itNum: "" }
                                      ])
                                    }
                                  >
                                    +
                                  </button>
                                  <button
                                    className="btn btn-danger btn-xs"
                                    type="button"
                                    disabled={rows.length === 1}
                                    onClick={() =>
                                      setToolRows(d.id, (prev) => {
                                        const next = prev.filter((_, i) => i !== rowIdx);
                                        return next.length
                                          ? next
                                          : [{ toolName: "", toolId: "", itNum: "" }];
                                      })
                                    }
                                  >
                                    −
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                )}
                {tableDensity !== "compact" && (
                  <tr className="hrow">
                    <td className="rl">Sampling</td>
                    {dims.map((d) => (
                      <td key={d.id} data-dim-id={d.id} className="dc tag-cell">
                        <span className="sample-tag">
                          {samplingLabel(d.sampling, d.samplingInterval)}
                        </span>
                        {isGaugeMode(d.id) && <span className="gauge-tag">Go/No-Go</span>}
                        {(d.inputMode || "single") === "range" && !isGaugeMode(d.id) && (
                          <span className="range-tag">Range</span>
                        )}
                      </td>
                    ))}
                  </tr>
                )}
                <tr className="div-row">
                  <td
                    style={{ padding: 0, height: "2px", borderBottom: "2px solid var(--accent)" }}
                  />
                  {dims.map((d) => (
                    <td
                      key={d.id}
                      data-dim-id={d.id}
                      style={{ padding: 0, height: "2px", borderBottom: "2px solid var(--accent)" }}
                    />
                  ))}
                </tr>
                {allPieces.map((pNum) => {
                  const isMissing = !!missing[pNum];
                  const rowOotDims = ootByPiece[pNum] || [];
                  const hasRowOot = rowOotDims.length > 0;
                  return (
                    <React.Fragment key={pNum}>
                      <tr className={`pr${isMissing ? " mr" : ""}${hasRowOot ? " oot-row" : ""}`}>
                        <td className="rl" style={{ verticalAlign: "top", paddingTop: ".45rem" }}>
                          Pc {pNum}
                          {isMissing && (
                            <div className="mp-tag">
                              {missing[pNum].reason}
                              {missing[pNum].ncNum && ` · ${missing[pNum].ncNum}`}
                            </div>
                          )}
                        </td>
                        {dims.map((dim) => {
                          const key = `${dim.id}_${pNum}`;
                          const inPlan = getSamplePieces(
                            dim.sampling,
                            currentJob.qty,
                            dim.samplingInterval
                          ).includes(pNum);
                          const isUnlocked = !!unlocked[key];
                          const hasVal = isValueComplete(dim, values[key]);
                          const gaugeMode = isGaugeMode(dim.id);
                          const rangeMode = (dim.inputMode || "single") === "range" && !gaugeMode;
                          if (isMissing) {
                            return (
                              <td
                                key={dim.id}
                                data-dim-id={dim.id}
                                className={`${activeCell?.piece === pNum ? "active-row-td" : ""} ${activeCell?.dimId === dim.id ? "active-col-td" : ""}`}
                                style={{
                                  textAlign: "center",
                                  color: "var(--border2)",
                                  fontFamily: "var(--mono)",
                                  fontSize: ".78rem",
                                  padding: ".26rem .4rem",
                                  verticalAlign: "middle"
                                }}
                              >
                                —
                              </td>
                            );
                          }
                          if (!inPlan && !isUnlocked) {
                            return (
                              <td
                                key={dim.id}
                                data-dim-id={dim.id}
                                className={`${activeCell?.piece === pNum ? "active-row-td" : ""} ${activeCell?.dimId === dim.id ? "active-col-td" : ""}`}
                                style={{ padding: ".26rem .4rem", verticalAlign: "middle" }}
                              >
                                <button
                                  data-meas-focus="1"
                                  className="na-btn"
                                  onKeyDown={(e) => handleValueKeyDown(e, key)}
                                  onFocus={() => setActiveCell({ dimId: dim.id, piece: pNum })}
                                  onClick={() => setUnlocked((p) => ({ ...p, [key]: true }))}
                                >
                                  +
                                </button>
                              </td>
                            );
                          }
                          if (isUnlocked && !hasVal && !inPlan) {
                            return (
                              <td
                                key={dim.id}
                                data-dim-id={dim.id}
                                className={`${activeCell?.piece === pNum ? "active-row-td" : ""} ${activeCell?.dimId === dim.id ? "active-col-td" : ""}`}
                                style={{ padding: ".26rem .4rem", verticalAlign: "middle" }}
                              >
                                <div className="ue-wrap">
                                  {gaugeMode ? (
                                    <div className="pf-wrap" style={{ flex: 1 }}>
                                      <button
                                        data-meas-focus="1"
                                        className={`pf-btn${values[key] === "PASS" ? " pass-on" : ""}`}
                                        onKeyDown={(e) => handleValueKeyDown(e, key)}
                                        onFocus={() =>
                                          setActiveCell({ dimId: dim.id, piece: pNum })
                                        }
                                        onClick={() => togglePf(key, "PASS")}
                                      >
                                        P
                                      </button>
                                      <button
                                        data-meas-focus="1"
                                        className={`pf-btn${values[key] === "FAIL" ? " fail-on" : ""}`}
                                        onKeyDown={(e) => handleValueKeyDown(e, key)}
                                        onFocus={() =>
                                          setActiveCell({ dimId: dim.id, piece: pNum })
                                        }
                                        onClick={() => togglePf(key, "FAIL")}
                                      >
                                        F
                                      </button>
                                    </div>
                                  ) : rangeMode ? (
                                    <div style={{ display: "flex", gap: ".35rem", flex: 1 }}>
                                      <input
                                        data-meas-focus="1"
                                        className="vi ux"
                                        type="number"
                                        min="0"
                                        step="0.0001"
                                        placeholder="Min"
                                        value={splitRange(values[key])[0]}
                                        onFocus={() =>
                                          setActiveCell({ dimId: dim.id, piece: pNum })
                                        }
                                        onKeyDown={(e) => {
                                          preventNegative(e);
                                          handleValueKeyDown(e, key);
                                        }}
                                        onChange={(e) => setRangeValue(key, "min", e.target.value)}
                                        style={{ flex: 1 }}
                                      />
                                      <input
                                        data-meas-focus="1"
                                        className="vi ux"
                                        type="number"
                                        min="0"
                                        step="0.0001"
                                        placeholder="Max"
                                        value={splitRange(values[key])[1]}
                                        onFocus={() =>
                                          setActiveCell({ dimId: dim.id, piece: pNum })
                                        }
                                        onKeyDown={(e) => {
                                          preventNegative(e);
                                          handleValueKeyDown(e, key);
                                        }}
                                        onChange={(e) => setRangeValue(key, "max", e.target.value)}
                                        style={{ flex: 1 }}
                                      />
                                    </div>
                                  ) : (
                                    <input
                                      data-meas-focus="1"
                                      className="vi ux"
                                      type="number"
                                      min="0"
                                      step="0.0001"
                                      placeholder="0.0000"
                                      value={values[key] || ""}
                                      onFocus={() => setActiveCell({ dimId: dim.id, piece: pNum })}
                                      onKeyDown={(e) => {
                                        preventNegative(e);
                                        handleValueKeyDown(e, key);
                                      }}
                                      onChange={(e) =>
                                        setValues((p) => ({ ...p, [key]: e.target.value }))
                                      }
                                      style={{ flex: 1 }}
                                    />
                                  )}
                                  <button
                                    className="relock-btn"
                                    onClick={() =>
                                      setUnlocked((p) => {
                                        const n = { ...p };
                                        delete n[key];
                                        return n;
                                      })
                                    }
                                  >
                                    ×
                                  </button>
                                </div>
                              </td>
                            );
                          }
                          if (gaugeMode) {
                            const v = values[key];
                            return (
                              <td
                                key={dim.id}
                                data-dim-id={dim.id}
                                className={`${activeCell?.piece === pNum ? "active-row-td" : ""} ${activeCell?.dimId === dim.id ? "active-col-td" : ""}`}
                                style={{ padding: ".26rem .4rem", verticalAlign: "middle" }}
                              >
                                <div className="pf-wrap">
                                  <button
                                    data-meas-focus="1"
                                    className={`pf-btn${v === "PASS" ? " pass-on" : ""}`}
                                    onKeyDown={(e) => handleValueKeyDown(e, key)}
                                    onFocus={() => setActiveCell({ dimId: dim.id, piece: pNum })}
                                    onClick={() => togglePf(key, "PASS")}
                                  >
                                    Pass
                                  </button>
                                  <button
                                    data-meas-focus="1"
                                    className={`pf-btn${v === "FAIL" ? " fail-on" : ""}`}
                                    onKeyDown={(e) => handleValueKeyDown(e, key)}
                                    onFocus={() => setActiveCell({ dimId: dim.id, piece: pNum })}
                                    onClick={() => togglePf(key, "FAIL")}
                                  >
                                    Fail
                                  </button>
                                </div>
                              </td>
                            );
                          }
                          const v = values[key] ?? "";
                          const st = isOOT(v, dim.tolPlus, dim.tolMinus, dim.nominal);
                          const cls = v === "" ? "" : st === false ? "ok" : "oot";
                          return (
                            <td
                              key={dim.id}
                              data-dim-id={dim.id}
                              className={`${activeCell?.piece === pNum ? "active-row-td" : ""} ${activeCell?.dimId === dim.id ? "active-col-td" : ""}`}
                              style={{ padding: ".26rem .4rem", verticalAlign: "middle" }}
                            >
                              {rangeMode ? (
                                <div style={{ display: "flex", gap: ".35rem" }}>
                                  <input
                                    data-meas-focus="1"
                                    className={`vi ${cls}${isUnlocked ? " ux" : ""}`}
                                    type="number"
                                    min="0"
                                    step="0.0001"
                                    value={splitRange(v)[0]}
                                    placeholder="Min"
                                    onFocus={() => setActiveCell({ dimId: dim.id, piece: pNum })}
                                    onKeyDown={(e) => {
                                      preventNegative(e);
                                      handleValueKeyDown(e, key);
                                    }}
                                    onChange={(e) => setRangeValue(key, "min", e.target.value)}
                                    style={{ flex: 1 }}
                                  />
                                  <input
                                    data-meas-focus="1"
                                    className={`vi ${cls}${isUnlocked ? " ux" : ""}`}
                                    type="number"
                                    min="0"
                                    step="0.0001"
                                    value={splitRange(v)[1]}
                                    placeholder="Max"
                                    onFocus={() => setActiveCell({ dimId: dim.id, piece: pNum })}
                                    onKeyDown={(e) => {
                                      preventNegative(e);
                                      handleValueKeyDown(e, key);
                                    }}
                                    onChange={(e) => setRangeValue(key, "max", e.target.value)}
                                    style={{ flex: 1 }}
                                  />
                                </div>
                              ) : (
                                <input
                                  data-meas-focus="1"
                                  className={`vi ${cls}${isUnlocked ? " ux" : ""}`}
                                  type="number"
                                  min="0"
                                  step="0.0001"
                                  value={v}
                                  placeholder="0.0000"
                                  onFocus={() => setActiveCell({ dimId: dim.id, piece: pNum })}
                                  onKeyDown={(e) => {
                                    preventNegative(e);
                                    handleValueKeyDown(e, key);
                                  }}
                                  onChange={(e) =>
                                    setValues((p) => ({ ...p, [key]: e.target.value }))
                                  }
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      {hasRowOot && (
                        <tr className="row-oot-note" aria-live="polite">
                          <td colSpan={dims.length + 1}>
                            <div className="row-oot-copy">
                              Pc {pNum} has out-of-tolerance values on: {rowOotDims.join(", ")}.
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="card-body" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="gap1" style={{ justifyContent: "space-between" }}>
              <div className="text-muted">Live Summary</div>
              <div className="gap1">
                <span className="badge badge-ok">Pass {summaryCounts.pass}</span>
                <span className="badge badge-oot">Fail {summaryCounts.fail}</span>
                <span className="badge badge-pend">N/A {summaryCounts.na}</span>
              </div>
            </div>
          </div>
        </div>

        {hasOOT && (
          <>
            {firstOotAlert && (
              <div
                className="banner warn"
                role="alert"
                aria-live="assertive"
                style={{ marginBottom: ".75rem" }}
              >
                First out-of-tolerance value detected. Review highlighted dimensions before final
                submit.
              </div>
            )}
            <div className="oot-banner">
              <div className="oot-icon">▲</div>
              <div>
                <div className="oot-title">Out-of-Tolerance Detected</div>
                <div className="oot-body">
                  {ootList.map((o, i) => (
                    <span key={i}>
                      {o.dim.name} — Pc {o.piece}
                      {i < ootList.length - 1 ? ",  " : ""}
                    </span>
                  ))}
                  <br />
                  Comment required before submitting.
                </div>
              </div>
            </div>
          </>
        )}
        {hasStarted && incompletePieces.length > 0 && (
          <div className="inc-banner">
            <div className="inc-title">
              Incomplete Data — {incompletePieces.length} piece
              {incompletePieces.length !== 1 ? "s" : ""} missing values
            </div>
            <p
              style={{
                fontSize: ".78rem",
                color: "#a08040",
                lineHeight: 1.5,
                marginBottom: ".55rem"
              }}
            >
              Pieces {incompletePieces.join(", ")} have unfilled measurements. Save draft to return
              later, or Partial Submit to log reasons and close for supervisor review.
            </p>
            <div className="gap1">
              {incompletePieces.map((p) => (
                <span key={p} className="badge badge-incomplete">
                  Pc {p}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="card">
          <div className="card-head">
            <div className="card-title">Operation CSV Import</div>
          </div>
          <div className="card-body">
            <p className="text-muted" style={{ marginTop: 0, fontSize: ".74rem" }}>
              Upload a single operation measurement CSV for this loaded job. This is operator-facing
              ingest for data from CMM/other local systems.
            </p>
            <textarea
              value={importCsv}
              onChange={(e) => setImportCsv(e.target.value)}
              rows={5}
              placeholder="piece_number,dimension_name,value,is_oot,tool_it_nums,missing_reason,nc_num,details"
              style={{ fontFamily: "var(--mono)", fontSize: ".72rem" }}
            />
            <div className="gap1 mt1">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  setImportCsv(
                    "piece_number,dimension_name,value,is_oot,tool_it_nums,missing_reason,nc_num,details\n1,Bore Diameter,0.6250,false,IT-0031,,,"
                  )
                }
              >
                Load Sample
              </button>
              <button className="btn btn-ghost btn-sm" onClick={triggerImportUpload}>
                Upload CSV
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={importingCsv}
                onClick={handleCsvMeasurementImport}
              >
                {importingCsv ? "Importing…" : "Import & Close Job"}
              </button>
            </div>
            {importErr && <p className="err-text mt1">{importErr}</p>}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Attachments</div>
            <div className="text-muted" style={{ fontSize: ".7rem" }}>
              Stage a photo or file for this job before submit
            </div>
          </div>
          <div className="card-body">
            <div className="row3">
              <div className="field">
                <label>Piece</label>
                <select
                  value={attachmentPiece}
                  onChange={(e) => setAttachmentPiece(e.target.value)}
                >
                  {(allPieces.length > 0
                    ? allPieces
                    : Array.from(
                        { length: Math.max(1, Number(currentJob.qty) || 1) },
                        (_, i) => i + 1
                      )
                  ).map((p) => (
                    <option key={p} value={String(p)}>
                      Pc {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Retention Days</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={attachmentRetention}
                  onChange={(e) => setAttachmentRetention(e.target.value)}
                />
              </div>
              <div className="field" style={{ justifyContent: "end" }}>
                <label>&nbsp;</label>
                <button className="btn btn-ghost btn-sm" onClick={triggerAttachmentUpload}>
                  Add File/Photo
                </button>
              </div>
            </div>
            {attachmentErr && <p className="err-text mt1">{attachmentErr}</p>}
            {stagedAttachments.length > 0 ? (
              <div style={{ marginTop: ".85rem", overflowX: "auto" }}>
                <table className="det-table">
                  <thead>
                    <tr>
                      <th>Piece</th>
                      <th>File</th>
                      <th>Type</th>
                      <th>Bytes</th>
                      <th>Retention</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {stagedAttachments.map((att, idx) => (
                      <tr key={`${att.fileName}-${idx}`}>
                        <td className="mono">Pc {att.pieceNumber}</td>
                        <td>{att.fileName}</td>
                        <td className="mono">{att.mediaType}</td>
                        <td className="mono">
                          {formatByteSize(
                            Math.max(0, Math.floor((att.dataBase64 || "").length * 0.75))
                          )}
                        </td>
                        <td className="mono">{att.retentionDays}d</td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => removeAttachmentAt(idx)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted" style={{ fontSize: ".74rem", marginTop: ".75rem" }}>
                No staged attachments yet.
              </p>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <div className="card-title">{hasOOT ? "OOT Comment (Required)" : "Comments"}</div>
          </div>
          <div className="card-body">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                hasOOT
                  ? "Describe the out-of-tolerance condition and corrective action..."
                  : "Optional notes…"
              }
            />
            <div className="mt2 gap1">
              <button
                className="btn btn-primary"
                disabled={
                  !canFull ||
                  submitting ||
                  instructionState.status === "loading" ||
                  instructionRequiresAck
                }
                onClick={handleFull}
              >
                {submitting ? "Submitting…" : "Submit & Close Job"}
              </button>
              {canPartial && (
                <button
                  className="btn btn-partial"
                  disabled={
                    submitting || instructionState.status === "loading" || instructionRequiresAck
                  }
                  onClick={() => setShowModal(true)}
                >
                  Partial Submit…
                </button>
              )}
              <button className="btn btn-draft" disabled={submitting} onClick={handleDraft}>
                Save Draft
              </button>
              {!toolsReady && (
                <span className="text-muted">
                  Tool &amp; IT # required for any measured dimension
                </span>
              )}
              {toolsReady && hasOOT && !comment.trim() && (
                <span className="text-warn" style={{ fontSize: ".75rem" }}>
                  Comment required for OOT
                </span>
              )}
              {instructionState.status === "loading" && (
                <span className="text-muted" style={{ fontSize: ".75rem" }}>
                  Loading active instruction…
                </span>
              )}
              {instructionRequiresAck && (
                <span className="text-warn" style={{ fontSize: ".75rem" }}>
                  Acknowledge the active instruction to submit.
                </span>
              )}
            </div>
            {submitErr && <p className="err-text mt1">{submitErr}</p>}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Report Issue</div>
          </div>
          <div className="card-body">
            <div className="row2">
              <div className="field">
                <label>Category</label>
                <select value={issueCategory} onChange={(e) => setIssueCategory(e.target.value)}>
                  {ISSUE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ gridColumn: "span 2" }}>
                <label>Details</label>
                <textarea
                  value={issueDetails}
                  onChange={(e) => setIssueDetails(e.target.value)}
                  placeholder="Describe the issue, what you expected, and what happened."
                />
              </div>
            </div>
            <div className="gap1 mt1">
              <button
                className="btn btn-ghost"
                onClick={handleIssueSubmit}
                disabled={reportingIssue || !issueDetails.trim()}
              >
                {reportingIssue ? "Submitting…" : "Submit Issue"}
              </button>
              {issueOk && <span className="text-ok">{issueOk}</span>}
              {issueErr && <span className="text-warn">{issueErr}</span>}
            </div>
          </div>
        </div>
      </div>
    );

  if (step === "saved")
    return (
      <div>
        <div className="crumbs">
          <span className="crumb">Home</span>
          <span className="crumb-sep">/</span>
          <span className="crumb">Operator</span>
          <span className="crumb-sep">/</span>
          <span className="crumb">Draft</span>
        </div>
        <div className="banner" style={{ marginBottom: ".75rem" }}>
          <strong>{stepTitles.saved}</strong>
        </div>
        <div className="draft-card">
          <div style={{ fontSize: "2rem" }}>💾</div>
          <div className="draft-title">Draft Saved</div>
          <p className="text-muted">
            Job <strong style={{ color: "var(--draft)" }}>{currentJob.jobNumber}</strong> saved.
            Resume anytime from the job list.
          </p>
          <div className="gap1 mt1">
            <button className="btn btn-ghost" onClick={reset}>
              Back to Job List
            </button>
          </div>
        </div>
      </div>
    );
  return (
    <div>
      <div className="crumbs">
        <span className="crumb">Home</span>
        <span className="crumb-sep">/</span>
        <span className="crumb">Operator</span>
        <span className="crumb-sep">/</span>
        <span className="crumb">Submitted</span>
      </div>
      <div className="banner" style={{ marginBottom: ".75rem" }}>
        <strong>{stepTitles.success}</strong>
      </div>
      <div className="success-card">
        <div style={{ fontSize: "2rem" }}>✔</div>
        <div className="success-title">
          {lastSubmitSource === "csv"
            ? "CSV Imported — Job Closed"
            : "Record Submitted — Job Closed"}
        </div>
        <p className="text-muted">
          Job <strong style={{ color: "var(--accent2)" }}>{currentJob?.jobNumber}</strong> ·{" "}
          {currentJob?.lot} · Op {currentJob?.operation}
        </p>
        {hasOOT && (
          <p className="text-warn" style={{ fontSize: ".8rem" }}>
            OOT recorded — notify supervisor.
          </p>
        )}
        <div className="gap1 mt1">
          <button className="btn btn-ghost" onClick={reset}>
            Enter Another Job
          </button>
        </div>
      </div>
    </div>
  );
}
