import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "../../api/index.js";
import {
  fileToBase64Payload,
  formatValue,
  fmtSpec,
  getSamplePieces,
  inferAttachmentMediaType,
  isOOT,
  isValidNonNegativeNumber,
  formatByteSize,
  samplingLabel,
  splitRangeValue
} from "./jobflowUtils.js";
import { getOperatorName } from "./mappers.js";
import { fmtTs } from "../../shared/utils/jobflowCore.ts";
import TypeBadge from "../../shared/components/TypeBadge.jsx";

export default function RecordDetailModal({
  record,
  parts,
  toolLibrary,
  usersById,
  canEdit,
  currentUserId,
  currentRole,
  onEditValue,
  onClose
}) {
  const [localRecord, setLocalRecord] = useState(record);
  const [editTarget, setEditTarget] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editErr, setEditErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [exportErr, setExportErr] = useState("");
  const [exporting, setExporting] = useState(false);
  const [attachments, setAttachments] = useState(
    Array.isArray(record.attachments) ? record.attachments : []
  );
  const [attachmentPiece, setAttachmentPiece] = useState("1");
  const [attachmentRetention, setAttachmentRetention] = useState("365");
  const [attachmentErr, setAttachmentErr] = useState("");
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const [retentionDrafts, setRetentionDrafts] = useState({});
  const attachmentFileRef = useRef(null);
  useEffect(() => {
    setLocalRecord(record);
  }, [record]);
  useEffect(() => {
    setAttachments(Array.isArray(record.attachments) ? record.attachments : []);
  }, [record]);
  useEffect(() => {
    setRetentionDrafts((prev) => {
      const next = {};
      for (const att of attachments) {
        const key = String(att.id);
        const inferred =
          Math.max(
            1,
            Math.round((new Date(att.retention_until).getTime() - Date.now()) / 86400000)
          ) || 365;
        next[key] = prev[key] ?? inferred;
      }
      return next;
    });
  }, [attachments]);

  const part = parts[localRecord.partNumber];
  const opData = part?.operations[localRecord.operation];
  const dims = opData?.dimensions ?? [];
  const editDim = editTarget
    ? dims.find((d) => String(d.id) === String(editTarget.dimensionId))
    : null;
  const editToolSel = editTarget
    ? Array.isArray(localRecord.tools?.[String(editTarget.dimensionId)])
      ? localRecord.tools[String(editTarget.dimensionId)][0]
      : localRecord.tools?.[String(editTarget.dimensionId)]
    : null;
  const editTool = editToolSel ? toolLibrary[editToolSel.toolId] : null;
  const editMode =
    editTool?.type === "Go/No-Go"
      ? "gauge"
      : (editDim?.inputMode || "single") === "range"
        ? "range"
        : "single";
  const [editRangeMin, editRangeMax] = splitRangeValue(editValue);
  function setEditRange(which, nextVal) {
    const nextMin = which === "min" ? nextVal : editRangeMin;
    const nextMax = which === "max" ? nextVal : editRangeMax;
    const next = nextMin || nextMax ? `${nextMin}|${nextMax}` : "";
    setEditValue(next);
  }
  const operatorName = getOperatorName(localRecord, usersById);
  const allPieces =
    dims.length > 0
      ? [
          ...new Set(
            dims.flatMap((d) => getSamplePieces(d.sampling, localRecord.qty, d.samplingInterval))
          )
        ].sort((a, b) => a - b)
      : [];
  const resultBadge =
    localRecord.status === "incomplete" ? (
      <span className="badge badge-incomplete">Incomplete</span>
    ) : localRecord.oot ? (
      <span className="badge badge-oot">OOT</span>
    ) : (
      <span className="badge badge-ok">OK</span>
    );
  const attachmentPieces =
    allPieces.length > 0
      ? allPieces
      : Array.from({ length: Math.max(1, Number(localRecord.qty) || 1) }, (_, index) => index + 1);
  async function loadAttachments() {
    setAttachmentLoading(true);
    setAttachmentErr("");
    try {
      const rows = await api.records.attachments.list(localRecord.id, currentRole || "Admin");
      setAttachments(rows || []);
    } catch (err) {
      setAttachmentErr(err?.message || "Unable to load attachments.");
    } finally {
      setAttachmentLoading(false);
    }
  }
  useEffect(() => {
    loadAttachments();
  }, [localRecord.id, currentRole]);
  function triggerAttachmentUpload() {
    if (attachmentFileRef.current) attachmentFileRef.current.click();
  }
  async function handleAttachmentUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const actorUserId = Number(currentUserId || localRecord.operatorUserId || 0);
    if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
      setAttachmentErr("Unable to determine the acting user for this record.");
      return;
    }
    const pieceNumber = Number(attachmentPiece);
    if (
      !Number.isInteger(pieceNumber) ||
      pieceNumber <= 0 ||
      pieceNumber > Number(localRecord.qty || 0)
    ) {
      setAttachmentErr("Choose a valid piece number for the attachment.");
      return;
    }
    const retentionDays = Number(attachmentRetention);
    if (!Number.isInteger(retentionDays) || retentionDays <= 0) {
      setAttachmentErr("Retention must be a positive whole number.");
      return;
    }
    setAttachmentErr("");
    setAttachmentBusy(true);
    try {
      await api.records.attachments.upload(
        localRecord.id,
        {
          userId: actorUserId,
          pieceNumber,
          fileName: file.name,
          mediaType: inferAttachmentMediaType(file.name, file.type),
          dataBase64: await fileToBase64Payload(file),
          retentionDays
        },
        currentRole || "Admin"
      );
      await loadAttachments();
    } catch (err) {
      setAttachmentErr(err?.message || "Unable to upload attachment.");
    } finally {
      setAttachmentBusy(false);
    }
  }
  async function handleRetentionUpdate(attachmentId, fallbackRetention) {
    const actorUserId = Number(currentUserId || localRecord.operatorUserId || 0);
    if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
      setAttachmentErr("Unable to determine the acting user for this record.");
      return;
    }
    const retentionDays = Number(String(fallbackRetention ?? "").trim());
    if (!Number.isInteger(retentionDays) || retentionDays <= 0) {
      setAttachmentErr("Retention must be a positive whole number.");
      return;
    }
    setAttachmentErr("");
    setAttachmentBusy(true);
    try {
      const updated = await api.records.attachments.updateRetention(
        localRecord.id,
        attachmentId,
        {
          userId: actorUserId,
          retentionDays
        },
        currentRole || "Admin"
      );
      setAttachments((prev) =>
        prev.map((item) =>
          String(item.id) === String(attachmentId) ? { ...item, ...updated } : item
        )
      );
    } catch (err) {
      setAttachmentErr(err?.message || "Unable to update retention.");
    } finally {
      setAttachmentBusy(false);
    }
  }
  async function handleInspectAttachment(attachmentId) {
    setAttachmentErr("");
    try {
      const attachment = await api.records.attachments.get(
        localRecord.id,
        attachmentId,
        currentRole || "Admin"
      );
      setAttachmentPreview(attachment);
    } catch (err) {
      setAttachmentErr(err?.message || "Unable to load attachment.");
    }
  }
  async function handleEditSave() {
    if (!editTarget) return;
    if (!editReason.trim()) {
      setEditErr("Reason required for supervisor edits.");
      return;
    }
    if (!onEditValue) {
      setEditErr("Editing not available.");
      return;
    }
    let normalizedValue = String(editValue ?? "").trim();
    if (editMode === "gauge") {
      const v = normalizedValue.toUpperCase();
      if (v !== "PASS" && v !== "FAIL") {
        setEditErr("This dimension only allows PASS or FAIL corrections.");
        return;
      }
      normalizedValue = v;
    } else if (editMode === "range") {
      const [minStr, maxStr] = splitRangeValue(normalizedValue);
      if (!isValidNonNegativeNumber(minStr) || !isValidNonNegativeNumber(maxStr)) {
        setEditErr("Range dimensions require numeric Min and Max values.");
        return;
      }
      normalizedValue = `${minStr}|${maxStr}`;
    } else {
      if (!isValidNonNegativeNumber(normalizedValue)) {
        setEditErr("Numeric dimensions require a valid non-negative value.");
        return;
      }
    }
    setSaving(true);
    setEditErr("");
    try {
      const updated = await onEditValue({
        recordId: localRecord.id,
        dimensionId: editTarget.dimensionId,
        pieceNumber: editTarget.pieceNumber,
        value: normalizedValue,
        reason: editReason.trim()
      });
      if (updated) setLocalRecord(updated);
      setEditTarget(null);
      setEditValue("");
      setEditReason("");
    } catch (e) {
      if (e?.message === "invalid_value_for_mode") {
        setEditErr("Value does not match the required input mode for this dimension.");
      } else {
        setEditErr(e?.message || "Unable to save edit.");
      }
    } finally {
      setSaving(false);
    }
  }
  async function handleExport() {
    setExportErr("");
    setExporting(true);
    try {
      const csv = await api.records.exportCsv(localRecord.id);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `record_${localRecord.id}.csv`;
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
    <div className="modal-overlay">
      <div className="rec-modal">
        <input
          ref={attachmentFileRef}
          type="file"
          accept="image/*,.pdf,.txt,.csv"
          data-testid="record-attachment-input"
          style={{ display: "none" }}
          onChange={handleAttachmentUpload}
        />
        <div className="rec-modal-head">
          <div>
            <div className="modal-title" style={{ marginBottom: 0 }}>
              Inspection Record — {localRecord.jobNumber}
            </div>
            <div style={{ fontSize: ".72rem", color: "var(--muted)", marginTop: ".2rem" }}>
              {localRecord.timestamp} · {operatorName || "—"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {resultBadge}
            <button className="btn btn-ghost btn-sm" onClick={handleExport} disabled={exporting}>
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              ✕ Close
            </button>
          </div>
        </div>
        {exportErr && (
          <div className="err-text" style={{ padding: "0 1.5rem" }}>
            {exportErr}
          </div>
        )}
        <div className="rec-modal-body">
          <div className="rec-strip">
            <div className="rec-field">
              <div className="rec-label">Part</div>
              <div className="rec-val">{localRecord.partNumber}</div>
            </div>
            <div className="rec-field">
              <div className="rec-label">Description</div>
              <div
                className="rec-val"
                style={{ fontFamily: "var(--sans)", fontSize: ".82rem", color: "var(--text)" }}
              >
                {part?.description}
              </div>
            </div>
            <div className="rec-field">
              <div className="rec-label">Operation</div>
              <div className="rec-val">
                Op {localRecord.operation} —{" "}
                <span
                  style={{ fontFamily: "var(--sans)", fontSize: ".8rem", color: "var(--text)" }}
                >
                  {opData?.label}
                </span>
              </div>
            </div>
            <div className="rec-field">
              <div className="rec-label">Lot</div>
              <div className="rec-val">{localRecord.lot}</div>
            </div>
            <div className="rec-field">
              <div className="rec-label">Qty</div>
              <div className="rec-val">{localRecord.qty} pcs</div>
            </div>
          </div>
          <div className="det-section">Tools Used</div>
          <table className="det-table" style={{ marginBottom: "1.25rem" }}>
            <thead>
              <tr>
                <th>Dimension</th>
                <th>Specification</th>
                <th>Sampling</th>
                <th>Tool</th>
                <th>Type</th>
                <th>IT #</th>
              </tr>
            </thead>
            <tbody>
              {dims.map((d) => {
                const selectionsRaw = localRecord.tools?.[String(d.id)];
                const selections = Array.isArray(selectionsRaw)
                  ? selectionsRaw
                  : selectionsRaw
                    ? [selectionsRaw]
                    : [];
                const mapped = selections.map((ts) => {
                  const tl = toolLibrary?.[ts?.toolId];
                  return {
                    name: tl?.name || ts?.toolName || "—",
                    type: tl?.type || ts?.toolType || "",
                    itNum: ts?.itNum || ""
                  };
                });
                const names = mapped.length ? mapped.map((m) => m.name).join(", ") : "—";
                const types = mapped.length
                  ? [...new Set(mapped.map((m) => m.type).filter(Boolean))]
                  : [];
                const typeLabel =
                  types.length === 0 ? "—" : types.length === 1 ? types[0] : "Mixed";
                const itNums = mapped.length
                  ? mapped
                      .map((m) => m.itNum)
                      .filter(Boolean)
                      .join(", ")
                  : "—";
                return (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.name}</td>
                    <td
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: ".78rem",
                        color: "var(--muted)"
                      }}
                    >
                      {fmtSpec(d)}
                    </td>
                    <td>
                      <span className="sample-tag">
                        {samplingLabel(d.sampling, d.samplingInterval)}
                      </span>
                    </td>
                    <td>{names}</td>
                    <td>
                      {typeLabel === "Mixed" ? (
                        <span className="badge badge-pend">Mixed</span>
                      ) : typeLabel === "—" ? (
                        "—"
                      ) : (
                        <TypeBadge type={typeLabel} />
                      )}
                    </td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: ".78rem" }}>{itNums}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="det-section">Measurements</div>
          <div
            style={{
              overflowX: "auto",
              border: "1px solid var(--border)",
              borderRadius: "3px",
              marginBottom: "1.25rem"
            }}
          >
            <table className="det-table" style={{ tableLayout: "auto" }}>
              <thead>
                <tr>
                  <th style={{ minWidth: "60px" }}>Piece</th>
                  {dims.map((d) => (
                    <th key={d.id}>
                      {d.name}
                      <div
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: ".6rem",
                          color: "var(--border2)",
                          fontWeight: 400,
                          marginTop: ".1rem"
                        }}
                      >
                        {fmtSpec(d)}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: ".58rem",
                          color: "var(--info)",
                          fontWeight: 500,
                          marginTop: ".15rem"
                        }}
                      >
                        {samplingLabel(d.sampling, d.samplingInterval)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allPieces.map((pNum) => {
                  const mp = localRecord.missingPieces?.[pNum];
                  return (
                    <tr key={pNum} style={mp ? { background: "#180d0d" } : {}}>
                      <td
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: ".78rem",
                          color: "var(--muted)",
                          whiteSpace: "nowrap"
                        }}
                      >
                        Pc {pNum}
                        {mp && (
                          <div className="mp-tag">
                            {mp.reason}
                            {mp.ncNum && ` · ${mp.ncNum}`}
                          </div>
                        )}
                      </td>
                      {dims.map((d) => {
                        if (mp)
                          return (
                            <td key={d.id} className="val-na">
                              —
                            </td>
                          );
                        const inPlan = getSamplePieces(
                          d.sampling,
                          localRecord.qty,
                          d.samplingInterval
                        ).includes(pNum);
                        const v = localRecord.values?.[`${d.id}_${pNum}`];
                        if (!inPlan && (v === undefined || v === "")) {
                          return (
                            <td key={d.id} className="val-na">
                              n/a
                            </td>
                          );
                        }
                        const canEditCell = canEdit && v !== undefined && v !== "";
                        const isTarget =
                          editTarget &&
                          String(editTarget.dimensionId) === String(d.id) &&
                          String(editTarget.pieceNumber) === String(pNum);
                        if (v === "PASS")
                          return (
                            <td
                              key={d.id}
                              className={`val-ok${isTarget ? " val-edit" : ""}`}
                              onClick={() => {
                                if (canEditCell) {
                                  setEditTarget({ dimensionId: d.id, pieceNumber: pNum });
                                  setEditValue("PASS");
                                  setEditReason("");
                                }
                              }}
                            >
                              PASS
                            </td>
                          );
                        if (v === "FAIL")
                          return (
                            <td
                              key={d.id}
                              className={`val-oot${isTarget ? " val-edit" : ""}`}
                              onClick={() => {
                                if (canEditCell) {
                                  setEditTarget({ dimensionId: d.id, pieceNumber: pNum });
                                  setEditValue("FAIL");
                                  setEditReason("");
                                }
                              }}
                            >
                              FAIL
                            </td>
                          );
                        if (v === undefined || v === "")
                          return (
                            <td key={d.id} className="val-na">
                              —
                            </td>
                          );
                        const oot = isOOT(v, d.tolPlus, d.tolMinus, d.nominal);
                        return (
                          <td
                            key={d.id}
                            className={`${oot ? "val-oot" : "val-ok"}${isTarget ? " val-edit" : ""}`}
                            onClick={() => {
                              if (canEditCell) {
                                setEditTarget({ dimensionId: d.id, pieceNumber: pNum });
                                setEditValue(String(v));
                                setEditReason("");
                              }
                            }}
                            style={canEditCell ? { cursor: "pointer" } : {}}
                          >
                            {formatValue(v, d)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {canEdit && !editTarget && (
            <div className="text-muted" style={{ fontSize: ".72rem", marginBottom: "1rem" }}>
              Supervisor edit: click a measurement value to change it.
            </div>
          )}
          {canEdit && editTarget && (
            <div
              style={{
                marginBottom: "1.25rem",
                border: "1px solid var(--border2)",
                borderRadius: "3px",
                padding: "1rem",
                background: "var(--panel)"
              }}
            >
              <div className="section-label" style={{ marginBottom: ".5rem" }}>
                Supervisor Edit
              </div>
              <div className="row3">
                <div className="field">
                  <label>Dimension</label>
                  <input
                    value={
                      dims.find((d) => String(d.id) === String(editTarget.dimensionId))?.name ||
                      `Dim ${editTarget.dimensionId}`
                    }
                    readOnly
                  />
                </div>
                <div className="field">
                  <label>Piece</label>
                  <input value={`Pc ${editTarget.pieceNumber}`} readOnly />
                </div>
                <div className="field">
                  <label>Current Value</label>
                  <input
                    value={
                      localRecord.values?.[`${editTarget.dimensionId}_${editTarget.pieceNumber}`] ||
                      "—"
                    }
                    readOnly
                  />
                </div>
              </div>
              <div className="field" style={{ marginTop: ".6rem" }}>
                <label>New Value</label>
                {editMode === "gauge" ? (
                  <select
                    value={String(editValue || "").toUpperCase()}
                    onChange={(e) => setEditValue(e.target.value.toUpperCase())}
                  >
                    <option value="">Select…</option>
                    <option value="PASS">PASS</option>
                    <option value="FAIL">FAIL</option>
                  </select>
                ) : editMode === "range" ? (
                  <div style={{ display: "flex", gap: ".45rem" }}>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      placeholder="Min"
                      value={editRangeMin}
                      onChange={(e) => setEditRange("min", e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      placeholder="Max"
                      value={editRangeMax}
                      onChange={(e) => setEditRange("max", e.target.value)}
                      style={{ flex: 1 }}
                    />
                  </div>
                ) : (
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                  />
                )}
                <div className="text-muted" style={{ fontSize: ".7rem", marginTop: ".3rem" }}>
                  {editMode === "gauge"
                    ? "Correction mode: PASS/FAIL only."
                    : editMode === "range"
                      ? "Correction mode: numeric range (Min and Max required)."
                      : "Correction mode: numeric value required."}
                </div>
              </div>
              <div className="field" style={{ marginTop: ".6rem" }}>
                <label>Reason (Required)</label>
                <input
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Why is this being changed?"
                />
              </div>
              {editErr && <p className="err-text mt1">{editErr}</p>}
              <div className="gap1 mt2">
                <button className="btn btn-primary" disabled={saving} onClick={handleEditSave}>
                  {saving ? "Saving…" : "Save Edit"}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditTarget(null);
                    setEditReason("");
                    setEditValue("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {Object.keys(localRecord.missingPieces || {}).length > 0 && (
            <>
              <div className="det-section">Missing Piece Log</div>
              <table className="det-table" style={{ marginBottom: "1.25rem" }}>
                <thead>
                  <tr>
                    <th>Piece</th>
                    <th>Reason</th>
                    <th>NC #</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(localRecord.missingPieces).map(([p, m]) => (
                    <tr key={p}>
                      <td className="mono">Pc {p}</td>
                      <td>{m.reason}</td>
                      <td className="mono">{m.ncNum || "—"}</td>
                      <td className="text-muted">{m.details || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {localRecord.comment && (
            <>
              <div className="det-section">{localRecord.oot ? "OOT Comment" : "Notes"}</div>
              <div
                style={{
                  background: "var(--panel)",
                  border: "1px solid var(--border2)",
                  borderLeft: `3px solid ${localRecord.oot ? "var(--warn)" : "var(--border2)"}`,
                  borderRadius: "3px",
                  padding: ".85rem 1.1rem",
                  fontSize: ".82rem",
                  lineHeight: 1.6,
                  color: localRecord.oot ? "#c07070" : "var(--text)"
                }}
              >
                {localRecord.comment}
              </div>
            </>
          )}
          <div className="det-section">Attachments</div>
          <div
            style={{
              border: "1px solid var(--border2)",
              borderRadius: "3px",
              padding: "1rem",
              marginBottom: "1.25rem",
              background: "var(--panel)"
            }}
          >
            {canEdit && (
              <>
                <div className="row3">
                  <div className="field">
                    <label>Piece</label>
                    <select
                      value={attachmentPiece}
                      onChange={(e) => setAttachmentPiece(e.target.value)}
                    >
                      {attachmentPieces.map((p) => (
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
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={triggerAttachmentUpload}
                      disabled={attachmentBusy}
                    >
                      {attachmentBusy ? "Uploading…" : "Upload Attachment"}
                    </button>
                  </div>
                </div>
                <div className="gap1 mt1">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={loadAttachments}
                    disabled={attachmentLoading}
                  >
                    {attachmentLoading ? "Refreshing…" : "Refresh Attachments"}
                  </button>
                </div>
              </>
            )}
            {attachmentErr && <p className="err-text mt1">{attachmentErr}</p>}
            {attachmentPreview && (
              <div className="text-muted" style={{ fontSize: ".74rem", marginTop: ".7rem" }}>
                Inspected {attachmentPreview.file_name} for Pc {attachmentPreview.piece_number}.
                Payload chars: {String(attachmentPreview.data_base64 || "").length}
              </div>
            )}
            {attachments.length === 0 ? (
              <p className="text-muted" style={{ fontSize: ".74rem", marginTop: ".7rem" }}>
                No attachments on this record yet.
              </p>
            ) : (
              <div style={{ overflowX: "auto", marginTop: ".7rem" }}>
                <table className="det-table">
                  <thead>
                    <tr>
                      <th>Piece</th>
                      <th>File</th>
                      <th>Type</th>
                      <th>Bytes</th>
                      <th>Retention Until</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {attachments.map((att) => (
                      <tr key={att.id}>
                        <td className="mono">Pc {att.piece_number}</td>
                        <td>{att.file_name}</td>
                        <td className="mono">{att.media_type}</td>
                        <td className="mono">{formatByteSize(att.byte_size)}</td>
                        <td className="mono">{fmtTs(att.retention_until)}</td>
                        <td>
                          <div
                            className="gap1"
                            style={{ justifyContent: "flex-end", flexWrap: "wrap" }}
                          >
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleInspectAttachment(att.id)}
                            >
                              Inspect
                            </button>
                            {canEdit && (
                              <>
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={(() => {
                                    const fallbackRetention =
                                      Math.max(
                                        1,
                                        Math.round(
                                          (new Date(att.retention_until).getTime() - Date.now()) /
                                            86400000
                                        )
                                      ) || 365;
                                    return retentionDrafts[String(att.id)] ?? fallbackRetention;
                                  })()}
                                  onChange={(e) =>
                                    setRetentionDrafts((prev) => ({
                                      ...prev,
                                      [String(att.id)]: e.target.value
                                    }))
                                  }
                                  style={{ width: "92px" }}
                                />
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() =>
                                    handleRetentionUpdate(
                                      att.id,
                                      (() => {
                                        const fallbackRetention =
                                          Math.max(
                                            1,
                                            Math.round(
                                              (new Date(att.retention_until).getTime() -
                                                Date.now()) /
                                                86400000
                                            )
                                          ) || 365;
                                        return retentionDrafts[String(att.id)] ?? fallbackRetention;
                                      })()
                                    )
                                  }
                                  disabled={attachmentBusy}
                                >
                                  Update
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {(localRecord.auditLog || []).length > 0 && (
            <>
              <div className="det-section">Audit Log</div>
              <table className="det-table" style={{ marginBottom: "1.25rem" }}>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Field</th>
                    <th>Before</th>
                    <th>After</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {localRecord.auditLog.map((a) => (
                    <tr key={a.id}>
                      <td className="mono" style={{ fontSize: ".72rem" }}>
                        {a.timestamp}
                      </td>
                      <td>{a.userName}</td>
                      <td className="mono" style={{ fontSize: ".72rem" }}>
                        {a.field}
                      </td>
                      <td className="mono" style={{ fontSize: ".72rem" }}>
                        {a.beforeValue}
                      </td>
                      <td className="mono" style={{ fontSize: ".72rem" }}>
                        {a.afterValue}
                      </td>
                      <td className="text-muted" style={{ fontSize: ".74rem" }}>
                        {a.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

