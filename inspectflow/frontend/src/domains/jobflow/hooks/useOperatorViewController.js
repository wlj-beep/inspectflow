import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../api/index.js";
import { fmtTs } from "../../../shared/utils/jobflowCore.ts";
import { ISSUE_CATEGORIES } from "../domainConfig.js";
import {
  fileToBase64Payload,
  getSamplePieces,
  hasInstructionPayload,
  inferAttachmentMediaType,
  isOOT,
  isToolSelectable,
  normalizeActiveInstruction,
  nowStr,
  readUrlEnumParam,
  readUrlIntParam,
  readUrlQueryParam,
  splitRangeValue,
  writeUrlQueryParams
} from "../jobflowUtils.js";

export function useOperatorViewController(props) {
  const {
    parts,
    jobs,
    toolLibrary,
    onSubmit,
    onDraft,
    currentUserId,
    currentRole,
    onLockJob,
    onUnlockJob,
    onRefreshData,
    dataStatus,
    usersById
  } = props;
  const [step, setStep] = useState("lookup");
  const [jobInput, setJobInput] = useState("");
  const [jobFilter, setJobFilter] = useState(() => ({
    part: readUrlQueryParam("operatorJobsPart", "all") || "all",
    operation: readUrlQueryParam("operatorJobsOperation", "all") || "all"
  }));
  const [jobSortKey, setJobSortKey] = useState(() =>
    readUrlEnumParam(
      "operatorJobsSort",
      ["jobNumber", "partNumber", "operation", "lot", "qty", "status"],
      "jobNumber"
    )
  );
  const [jobSortDir, setJobSortDir] = useState(() =>
    readUrlEnumParam("operatorJobsDir", ["asc", "desc"], "asc")
  );
  const [jobPageSize, setJobPageSize] = useState(() =>
    readUrlIntParam("operatorJobsPageSize", 25, { min: 1, max: 1000 })
  );
  const [jobPage, setJobPage] = useState(() =>
    readUrlIntParam("operatorJobsPage", 1, { min: 1, max: 100000 })
  );
  const jobPageResetReadyRef = useRef(false);
  const [currentJob, setCurrentJob] = useState(null);
  const [values, setValues] = useState({});
  const [toolSel, setToolSel] = useState({});
  const [unlocked, setUnlocked] = useState({});
  const [missing, setMissing] = useState({});
  const [comment, setComment] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [colWidths, setColWidths] = useState({});
  const [tableDensity, setTableDensity] = useState("expanded");
  const [activeCell, setActiveCell] = useState(null);
  const [jobErr, setJobErr] = useState("");
  const [submitErr, setSubmitErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [issueCategory, setIssueCategory] = useState("app_functionality_issue");
  const [issueDetails, setIssueDetails] = useState("");
  const [issueErr, setIssueErr] = useState("");
  const [issueOk, setIssueOk] = useState("");
  const [reportingIssue, setReportingIssue] = useState(false);
  const [importCsv, setImportCsv] = useState("");
  const [importingCsv, setImportingCsv] = useState(false);
  const [importErr, setImportErr] = useState("");
  const [attachmentPiece, setAttachmentPiece] = useState("1");
  const [attachmentRetention, setAttachmentRetention] = useState("365");
  const [stagedAttachments, setStagedAttachments] = useState([]);
  const [attachmentErr, setAttachmentErr] = useState("");
  const [lastSubmitSource, setLastSubmitSource] = useState("manual");
  const [instructionState, setInstructionState] = useState({
    status: "idle",
    error: "",
    active: null
  });
  const [acknowledgingInstruction, setAcknowledgingInstruction] = useState(false);
  const importFileRef = useRef(null);
  const attachmentFileRef = useRef(null);
  const idleRef = useRef(null);
  const instructionRequestRef = useRef(0);
  const prevHasOotRef = useRef(false);
  const [firstOotAlert, setFirstOotAlert] = useState(false);
  const currentUserName = usersById?.[String(currentUserId)] || "";

  const part = currentJob ? parts[currentJob.partNumber] : null;
  const opData = part ? part.operations[currentJob.operation] : null;
  const dims = opData?.dimensions ?? [];

  function getColWidth(dimId) {
    return colWidths[dimId] || 160;
  }
  function startResize(e, dimId) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = getColWidth(dimId);
    function onMove(ev) {
      setColWidths((p) => ({ ...p, [dimId]: Math.max(110, startW + ev.clientX - startX) }));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  function maybeStartResize(e) {
    if (e.button !== 0) return;
    const cell = e.target?.closest?.("td[data-dim-id]");
    if (!cell) return;
    const rect = cell.getBoundingClientRect();
    const nearRightEdge = rect.right - e.clientX <= 12;
    if (!nearRightEdge) return;
    const dimId = cell.getAttribute("data-dim-id");
    if (!dimId) return;
    startResize(e, dimId);
  }
  function applyColumnPreset(preset) {
    const next = {};
    const width = preset === "narrow" ? 130 : preset === "wide" ? 220 : 160;
    dims.forEach((dim) => {
      next[dim.id] = width;
    });
    setColWidths(next);
  }
  function preventNegative(e) {
    if (e.key === "-" || e.key === "e" || e.key === "E") e.preventDefault();
  }
  function handleValueKeyDown(e, key) {
    if (
      e.key === "Enter" ||
      e.key === "ArrowRight" ||
      e.key === "ArrowLeft" ||
      e.key === "ArrowDown" ||
      e.key === "ArrowUp"
    ) {
      e.preventDefault();
      const currentCell = e.target?.closest?.("td[data-dim-id]");
      const currentRow = e.target?.closest?.("tr");
      const currentCellNodes = currentCell
        ? Array.from(currentCell.querySelectorAll("[data-meas-focus='1']")).filter(
            (node) => !node.disabled && node.offsetParent !== null
          )
        : [];
      const currentSlot = Math.max(0, currentCellNodes.indexOf(e.target));
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && currentCell && currentRow) {
        const dimId = currentCell.getAttribute("data-dim-id");
        const dir = e.key === "ArrowDown" ? "nextElementSibling" : "previousElementSibling";
        let cursor = currentRow;
        while (cursor) {
          cursor = cursor?.[dir];
          if (!cursor) break;
          if (cursor.classList?.contains("pr")) break;
        }
        if (cursor && dimId) {
          const targetCell = cursor.querySelector(`td[data-dim-id="${dimId}"]`);
          const targetNodes = targetCell
            ? Array.from(targetCell.querySelectorAll("[data-meas-focus='1']")).filter(
                (node) => !node.disabled && node.offsetParent !== null
              )
            : [];
          if (targetNodes.length > 0) {
            const target =
              targetNodes[Math.min(currentSlot, targetNodes.length - 1)] || targetNodes[0];
            target?.focus?.();
            return;
          }
        }
      }
      const nodes = Array.from(document.querySelectorAll("[data-meas-focus='1']")).filter(
        (node) => !node.disabled && node.offsetParent !== null
      );
      const currentIndex = nodes.indexOf(e.target);
      if (currentIndex >= 0) {
        if (e.key === "Enter" || e.key === "ArrowRight") {
          const next = nodes[currentIndex + 1] || nodes[0];
          next?.focus?.();
        } else if (e.key === "ArrowLeft") {
          const next = nodes[currentIndex - 1] || nodes[nodes.length - 1];
          next?.focus?.();
        } else if (e.key === "ArrowDown") {
          const next = nodes[currentIndex + 1] || nodes[nodes.length - 1];
          next?.focus?.();
        } else if (e.key === "ArrowUp") {
          const next = nodes[currentIndex - 1] || nodes[0];
          next?.focus?.();
        }
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setValues((p) => ({ ...p, [key]: "" }));
    }
  }
  function splitRange(val) {
    return splitRangeValue(val);
  }
  function setRangeValue(key, which, nextVal) {
    const [minVal, maxVal] = splitRange(values[key]);
    const nextMin = which === "min" ? nextVal : minVal;
    const nextMax = which === "max" ? nextVal : maxVal;
    const next = nextMin || nextMax ? `${nextMin}|${nextMax}` : "";
    setValues((p) => ({ ...p, [key]: next }));
  }
  function isValueComplete(dim, val) {
    if (val === undefined || val === "") return false;
    const mode = dim?.inputMode || "single";
    if (mode === "range") {
      const [minVal, maxVal] = splitRange(val);
      return minVal !== "" && maxVal !== "";
    }
    return true;
  }
  function togglePf(key, value) {
    setValues((p) => ({ ...p, [key]: p[key] === value ? "" : value }));
  }
  function normalizeToolRows(raw) {
    const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const normalized = rows
      .map((r) => ({
        toolName: r?.toolName || "",
        toolId: r?.toolId ? String(r.toolId) : "",
        itNum: r?.itNum ? String(r.itNum).toUpperCase() : ""
      }))
      .filter((r) => r.toolName || r.toolId || r.itNum);
    return normalized.length ? normalized : [{ toolName: "", toolId: "", itNum: "" }];
  }
  function getToolRows(dimId) {
    return normalizeToolRows(toolSel?.[dimId]);
  }
  function setToolRows(dimId, updater) {
    setToolSel((prev) => {
      const current = normalizeToolRows(prev?.[dimId]);
      const nextRows = normalizeToolRows(
        typeof updater === "function" ? updater(current) : updater
      );
      return { ...prev, [dimId]: nextRows };
    });
  }
  function getActiveToolRows(dimId) {
    return normalizeToolRows(toolSel?.[dimId]).filter((r) => r.toolName || r.toolId || r.itNum);
  }
  function resetInstructionState() {
    instructionRequestRef.current += 1;
    setAcknowledgingInstruction(false);
    setInstructionState({ status: "idle", error: "", active: null });
  }
  async function loadInstructionForJob(job) {
    const requestId = ++instructionRequestRef.current;
    setAcknowledgingInstruction(false);
    setInstructionState({ status: "loading", error: "", active: null });
    try {
      const response = await api.instructions.activeForJob(
        job.jobNumber,
        currentRole || "Operator"
      );
      if (requestId !== instructionRequestRef.current) return;
      if (!hasInstructionPayload(response)) {
        setInstructionState({
          status: "ready",
          error: "",
          active: null
        });
        return;
      }
      setInstructionState({
        status: "ready",
        error: "",
        active: normalizeActiveInstruction(response, job)
      });
    } catch (err) {
      if (requestId !== instructionRequestRef.current) return;
      setInstructionState({
        status: "error",
        error: err?.message || "Unable to load active instruction.",
        active: null
      });
    }
  }

  const allPieces =
    dims.length > 0
      ? [
          ...new Set(
            dims.flatMap((d) => getSamplePieces(d.sampling, currentJob.qty, d.samplingInterval))
          )
        ].sort((a, b) => a - b)
      : [];

  function isGaugeMode(dimId) {
    const rows = getActiveToolRows(dimId);
    return rows.some((row) => row.toolId && toolLibrary[row.toolId]?.type === "Go/No-Go");
  }
  function cellRequired(dimId, pNum) {
    const sourceDim = dims.find((d) => d.id === dimId);
    const inPlan = getSamplePieces(
      sourceDim?.sampling,
      currentJob.qty,
      sourceDim?.samplingInterval
    ).includes(pNum);
    if (inPlan) return true;
    const key = `${dimId}_${pNum}`;
    return !!(unlocked[key] && (values[key] || "") !== "");
  }

  const hasStarted = Object.values(values).some((v) => v !== undefined && v !== "");
  const incompletePieces =
    dims.length > 0
      ? allPieces.filter((pNum) => {
          if (missing[pNum]) return false;
          return dims.some(
            (dim) =>
              cellRequired(dim.id, pNum) && !isValueComplete(dim, values[`${dim.id}_${pNum}`])
          );
        })
      : [];
  const ootList = dims.flatMap((dim) => {
    if (isGaugeMode(dim.id)) return [];
    return getSamplePieces(dim.sampling, currentJob.qty, dim.samplingInterval)
      .filter(
        (p) =>
          !missing[p] &&
          isOOT(values[`${dim.id}_${p}`], dim.tolPlus, dim.tolMinus, dim.nominal) === true
      )
      .map((p) => ({ dim, piece: p }));
  });
  const hasOOT = ootList.length > 0;
  const ootByPiece = useMemo(() => {
    const grouped = {};
    ootList.forEach(({ dim, piece }) => {
      grouped[piece] = grouped[piece] || [];
      grouped[piece].push(dim.name);
    });
    return grouped;
  }, [ootList]);
  const summaryCounts = (() => {
    let pass = 0;
    let fail = 0;
    let na = 0;
    for (const dim of dims) {
      const gaugeMode = isGaugeMode(dim.id);
      for (const pNum of allPieces) {
        if (missing[pNum]) {
          na += 1;
          continue;
        }
        if (!cellRequired(dim.id, pNum)) continue;
        const key = `${dim.id}_${pNum}`;
        const value = values[key];
        if (!isValueComplete(dim, value)) continue;
        if (gaugeMode) {
          if (value === "PASS") pass += 1;
          else if (value === "FAIL") fail += 1;
          continue;
        }
        const state = isOOT(value, dim.tolPlus, dim.tolMinus, dim.nominal);
        if (state === true) fail += 1;
        else if (state === false) pass += 1;
      }
    }
    return { pass, fail, na };
  })();
  const toolRequiredDims = dims.filter((d) => {
    return Object.keys(values).some(
      (k) => k.startsWith(`${d.id}_`) && values[k] !== "" && values[k] !== undefined
    );
  });
  const toolsReady = toolRequiredDims.every((d) => {
    const rows = getActiveToolRows(d.id);
    if (rows.length === 0) return false;
    return rows.every((r) => r.toolId && r.itNum);
  });
  const canFull = toolsReady && incompletePieces.length === 0 && !(hasOOT && !comment.trim());
  const canPartial = toolsReady && incompletePieces.length > 0;
  useEffect(() => {
    if (hasOOT && !prevHasOotRef.current) {
      setFirstOotAlert(true);
    }
    if (!hasOOT) {
      setFirstOotAlert(false);
    }
    prevHasOotRef.current = hasOOT;
  }, [hasOOT]);

  async function loadJob(key) {
    const job = jobs[key?.trim().toUpperCase()];
    if (!job || (job.status !== "open" && job.status !== "draft")) return;
    setJobErr("");
    resetInstructionState();
    if (job.lockOwnerUserId && String(job.lockOwnerUserId) !== String(currentUserId || "")) {
      const lockName = usersById?.[String(job.lockOwnerUserId)] || `User #${job.lockOwnerUserId}`;
      setJobErr(`Job is locked by ${lockName}.`);
      return;
    }
    if (onLockJob) {
      try {
        await onLockJob(job.jobNumber);
      } catch (err) {
        setJobErr(err?.message || "Unable to lock job. Try another.");
        return;
      }
    }
    const dd = job.status === "draft" && job.draftData;
    const ts = {};
    parts[job.partNumber]?.operations[job.operation]?.dimensions.forEach((d) => {
      const saved = dd?.toolSel?.[d.id];
      if (Array.isArray(saved)) {
        ts[d.id] = normalizeToolRows(
          saved.map((row) => {
            const t = row?.toolId ? toolLibrary[row.toolId] : null;
            return {
              toolName: row?.toolName || t?.name || "",
              toolId: row?.toolId || "",
              itNum: row?.itNum || t?.itNum || ""
            };
          })
        );
      } else if (saved) {
        const t = saved.toolId ? toolLibrary[saved.toolId] : null;
        ts[d.id] = normalizeToolRows([
          {
            toolName: saved.toolName || t?.name || "",
            toolId: saved.toolId || "",
            itNum: saved.itNum || t?.itNum || ""
          }
        ]);
      } else {
        ts[d.id] = [{ toolName: "", toolId: "", itNum: "" }];
      }
    });
    setCurrentJob(job);
    setValues(dd?.values || {});
    setToolSel(ts);
    setUnlocked(dd?.unlocked || {});
    setMissing(dd?.missing || {});
    setComment(dd?.comment || "");
    setStagedAttachments(dd?.attachments || []);
    setAttachmentPiece(String(dd?.attachments?.[0]?.pieceNumber || 1));
    setAttachmentRetention(String(dd?.attachments?.[0]?.retentionDays || 365));
    setAttachmentErr("");
    setImportCsv("");
    setImportErr("");
    setLastSubmitSource("manual");
    setStep("entry");
    loadInstructionForJob(job).catch((err) => { console.error("[inspectflow] loadInstructionForJob:", err?.message || err); });
  }
  function buildRecord(status, rm) {
    return {
      id: "r" + Date.now(),
      jobNumber: currentJob.jobNumber,
      partNumber: currentJob.partNumber,
      operation: currentJob.operation,
      lot: currentJob.lot,
      qty: currentJob.qty,
      timestamp: nowStr(),
      operator: (currentUserName || "").trim(),
      operatorUserId: currentUserId || null,
      values,
      tools: toolSel,
      unlocked,
      missingPieces: rm || missing,
      oot: hasOOT,
      status,
      comment,
      attachments: stagedAttachments
    };
  }
  const activeInstruction = instructionState.active;
  const instructionRequiresAck = Boolean(
    activeInstruction &&
    activeInstruction.requiresAcknowledgment !== false &&
    !activeInstruction.acknowledged
  );
  const instructionAckStatus = activeInstruction
    ? activeInstruction.acknowledged
      ? `Acknowledged${activeInstruction.acknowledgedAt ? ` · ${fmtTs(activeInstruction.acknowledgedAt)}` : ""}`
      : "Acknowledgment required"
    : "";

  async function handleAcknowledgeInstruction() {
    if (!currentJob || !activeInstruction || activeInstruction.acknowledged) return;
    setAcknowledgingInstruction(true);
    setSubmitErr("");
    try {
      const response = await api.instructions.acknowledgeActive(
        currentJob.jobNumber,
        {
          instructionId: activeInstruction.id || undefined,
          versionId: activeInstruction.id || undefined,
          operationId: activeInstruction.operationId || currentJob.operationId || undefined,
          acknowledgedAt: new Date().toISOString()
        },
        currentRole || "Operator"
      );
      const nextPayload =
        response?.instructionVersion ||
        response?.activeInstruction ||
        response?.activeVersion ||
        response?.version ||
        response;
      const next = hasInstructionPayload(nextPayload)
        ? normalizeActiveInstruction(nextPayload, currentJob)
        : null;
      setInstructionState((prev) => ({
        ...prev,
        status: "ready",
        error: "",
        active: {
          ...(prev.active || activeInstruction),
          ...(next && (next.id || next.title || next.summary || next.body) ? next : {}),
          acknowledged: true,
          acknowledgedAt:
            next?.acknowledgedAt ||
            response?.acknowledgedAt ||
            prev.active?.acknowledgedAt ||
            new Date().toISOString(),
          acknowledgedByName:
            next?.acknowledgedByName || prev.active?.acknowledgedByName || currentUserName || ""
        }
      }));
    } catch (err) {
      setSubmitErr(err?.message || "Unable to acknowledge instruction.");
    } finally {
      setAcknowledgingInstruction(false);
    }
  }
  async function handleFull() {
    if (instructionRequiresAck) {
      setSubmitErr("Acknowledge the active instruction before submitting.");
      return;
    }
    if (hasOOT && !window.confirm("Out-of-tolerance values detected. Submit anyway?")) return;
    setSubmitting(true);
    setSubmitErr("");
    try {
      await onSubmit(buildRecord("complete"), currentJob.jobNumber);
      setLastSubmitSource("manual");
      setStep("success");
    } catch (err) {
      setSubmitErr(err?.message || "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  }
  async function handleMissingSave(r) {
    if (instructionRequiresAck) {
      setSubmitErr("Acknowledge the active instruction before submitting.");
      return;
    }
    setMissing(r);
    setShowModal(false);
    setSubmitting(true);
    setSubmitErr("");
    try {
      await onSubmit(buildRecord("incomplete", r), currentJob.jobNumber);
      setLastSubmitSource("manual");
      setStep("success");
    } catch (err) {
      setSubmitErr(err?.message || "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  }
  function handleDraft() {
    onDraft({
      jobNumber: currentJob.jobNumber,
      draftData: { values, toolSel, unlocked, missing, comment, attachments: stagedAttachments }
    });
    setStep("saved");
  }
  function triggerImportUpload() {
    if (importFileRef.current) importFileRef.current.click();
  }
  function handleImportUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportCsv(String(reader.result || ""));
    reader.readAsText(file);
    e.target.value = "";
  }
  function triggerAttachmentUpload() {
    if (attachmentFileRef.current) attachmentFileRef.current.click();
  }
  async function handleAttachmentUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!currentJob) {
      setAttachmentErr("Load a job before adding attachments.");
      return;
    }
    const pieceNumber = Number(attachmentPiece);
    if (
      !Number.isInteger(pieceNumber) ||
      pieceNumber <= 0 ||
      pieceNumber > Number(currentJob.qty || 0)
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
    try {
      const dataBase64 = await fileToBase64Payload(file);
      setStagedAttachments((prev) => [
        ...prev,
        {
          pieceNumber,
          fileName: file.name,
          mediaType: inferAttachmentMediaType(file.name, file.type),
          dataBase64,
          retentionDays
        }
      ]);
    } catch (err) {
      setAttachmentErr(err?.message || "Unable to read attachment file.");
    }
  }
  function removeAttachmentAt(index) {
    setStagedAttachments((prev) => prev.filter((_, i) => i !== index));
  }
  async function handleCsvMeasurementImport() {
    if (!currentJob?.jobNumber) return;
    if (!importCsv.trim()) {
      setImportErr("Paste or upload CSV content first.");
      return;
    }
    if (!currentUserId) {
      setImportErr("Select a current user before importing.");
      return;
    }
    setImportErr("");
    setImportingCsv(true);
    try {
      await api.imports.jobMeasurementsCsv(
        currentJob.jobNumber,
        {
          csvText: importCsv,
          operatorUserId: Number(currentUserId),
          operationId: currentJob.operationId,
          partId: currentJob.partNumber
        },
        currentRole || "Operator"
      );
      if (onRefreshData) await onRefreshData();
      setLastSubmitSource("csv");
      setStep("success");
    } catch (err) {
      setImportErr(err?.message || "Measurement CSV import failed.");
    } finally {
      setImportingCsv(false);
    }
  }
  async function handleIssueSubmit() {
    if (dataStatus !== "live") {
      setIssueErr("Issue reporting requires live data mode.");
      setIssueOk("");
      return;
    }
    if (!currentUserId) {
      setIssueErr("Select a current user before submitting an issue.");
      setIssueOk("");
      return;
    }
    if (!issueDetails.trim()) {
      setIssueErr("Issue details are required.");
      setIssueOk("");
      return;
    }
    setReportingIssue(true);
    setIssueErr("");
    setIssueOk("");
    try {
      await api.issues.create(
        {
          category: issueCategory,
          details: issueDetails.trim(),
          userId: Number(currentUserId),
          partId: currentJob?.partNumber || null,
          operationId: currentJob?.operationId || null,
          jobId: currentJob?.jobNumber || null
        },
        currentRole || "Operator"
      );
      setIssueDetails("");
      setIssueOk("Issue reported successfully.");
    } catch (err) {
      setIssueErr(err?.message || "Unable to submit issue report.");
    } finally {
      setReportingIssue(false);
    }
  }
  function releaseLock() {
    if (onUnlockJob && currentJob?.jobNumber) {
      onUnlockJob(currentJob.jobNumber).catch((err) => { console.warn("[inspectflow] releaseLock:", err?.message || err); });
    }
  }
  function reset() {
    releaseLock();
    setStep("lookup");
    setJobInput("");
    setCurrentJob(null);
    setValues({});
    setToolSel({});
    setUnlocked({});
    setMissing({});
    setComment("");
    setStagedAttachments([]);
    setAttachmentErr("");
    setAttachmentPiece("1");
    setAttachmentRetention("365");
    resetInstructionState();
  }

  useEffect(() => {
    if (step !== "entry") return;
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(
      () => {
        if (!currentJob) return;
        if (hasStarted) {
          onDraft({
            jobNumber: currentJob.jobNumber,
            draftData: {
              values,
              toolSel,
              unlocked,
              missing,
              comment,
              attachments: stagedAttachments
            }
          });
          setStep("saved");
        } else {
          setStep("lookup");
        }
        releaseLock();
      },
      20 * 60 * 1000
    );
    return () => {
      if (idleRef.current) clearTimeout(idleRef.current);
    };
  }, [step, values, toolSel, missing, comment, hasStarted, currentJob, stagedAttachments]);

  const openJobs = Object.values(jobs).filter((j) => j.status === "open" || j.status === "draft");
  const partFilterOptions = [
    "all",
    ...new Set(openJobs.map((job) => job.partNumber).filter(Boolean))
  ];
  const opFilterOptions = ["all", ...new Set(openJobs.map((job) => job.operation).filter(Boolean))];
  useEffect(() => {
    if (jobFilter.part !== "all" && !partFilterOptions.includes(jobFilter.part)) {
      setJobFilter((prev) => ({ ...prev, part: "all" }));
    }
    if (jobFilter.operation !== "all" && !opFilterOptions.includes(jobFilter.operation)) {
      setJobFilter((prev) => ({ ...prev, operation: "all" }));
    }
  }, [partFilterOptions, opFilterOptions, jobFilter.part, jobFilter.operation]);
  const filteredOpenJobs = openJobs.filter((job) => {
    if (jobFilter.part !== "all" && String(job.partNumber) !== String(jobFilter.part)) return false;
    if (jobFilter.operation !== "all" && String(job.operation) !== String(jobFilter.operation))
      return false;
    return true;
  });
  const sortedOpenJobs = [...filteredOpenJobs].sort((a, b) => {
    const dir = jobSortDir === "asc" ? 1 : -1;
    const av =
      jobSortKey === "partNumber"
        ? String(a.partNumber || "")
        : jobSortKey === "operation"
          ? String(a.operation || "")
          : jobSortKey === "lot"
            ? String(a.lot || "")
            : jobSortKey === "qty"
              ? Number(a.qty || 0)
              : jobSortKey === "status"
                ? String(a.status || "")
                : String(a.jobNumber || "");
    const bv =
      jobSortKey === "partNumber"
        ? String(b.partNumber || "")
        : jobSortKey === "operation"
          ? String(b.operation || "")
          : jobSortKey === "lot"
            ? String(b.lot || "")
            : jobSortKey === "qty"
              ? Number(b.qty || 0)
              : jobSortKey === "status"
                ? String(b.status || "")
                : String(b.jobNumber || "");
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
  const totalJobPages = Math.max(1, Math.ceil(sortedOpenJobs.length / Math.max(1, jobPageSize)));
  const safeJobPage = Math.min(Math.max(1, jobPage), totalJobPages);
  const pagedOpenJobs = sortedOpenJobs.slice(
    (safeJobPage - 1) * jobPageSize,
    safeJobPage * jobPageSize
  );
  useEffect(() => {
    writeUrlQueryParams({
      operatorJobsPart: jobFilter.part === "all" ? "" : jobFilter.part,
      operatorJobsOperation: jobFilter.operation === "all" ? "" : jobFilter.operation,
      operatorJobsSort: jobSortKey,
      operatorJobsDir: jobSortDir,
      operatorJobsPageSize: jobPageSize,
      operatorJobsPage: jobPage
    });
  }, [jobFilter.part, jobFilter.operation, jobSortKey, jobSortDir, jobPageSize, jobPage]);
  useEffect(() => {
    if (!jobPageResetReadyRef.current) {
      jobPageResetReadyRef.current = true;
      return;
    }
    setJobPage(1);
  }, [jobFilter.part, jobFilter.operation, jobSortKey, jobSortDir, jobPageSize]);
  useEffect(() => {
    if (jobPage !== safeJobPage) setJobPage(safeJobPage);
  }, [jobPage, safeJobPage]);
  function toggleJobSort(key) {
    if (jobSortKey === key) {
      setJobSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setJobSortKey(key);
    setJobSortDir("asc");
  }
  function jobSortIcon(key) {
    if (jobSortKey !== key) return "";
    return jobSortDir === "asc" ? "↑" : "↓";
  }
  return {
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
    partFilterOptions,
    opFilterOptions,
    filteredOpenJobs,
    sortedOpenJobs,
    totalJobPages,
    safeJobPage,
    pagedOpenJobs,
    toggleJobSort,
    jobSortIcon,
    firstOotAlert
  };
}
