import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../api/index.js";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function firstText(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function collectStrings(...values) {
  return values.flatMap((value) => {
    if (value === undefined || value === null || value === "") return [];
    if (Array.isArray(value)) return value.flatMap((entry) => collectStrings(entry));
    const text = String(value).trim();
    return text ? [text] : [];
  });
}

function isTruthy(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = normalizeKey(value);
  return ["true", "1", "yes", "y", "approved", "signed", "signed_off", "sign_off", "finalized", "complete", "ready"].includes(normalized);
}

function humanizeState(value, fallback = "Pending") {
  const normalized = normalizeKey(value);
  if (!normalized) return fallback;
  const labels = {
    pending: "Pending",
    signed_off: "Signed Off",
    approved: "Signed Off",
    blocked: "Blocked",
    ready: "Ready",
    draft: "Draft",
    finalized: "Finalized",
    complete: "Finalized",
    complete_ready: "Ready",
    in_review: "In Review",
    review: "In Review"
  };
  return labels[normalized] || normalized.split("_").map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ");
}

function styleForState(state) {
  const normalized = normalizeKey(state);
  if (["signed_off", "approved", "ready", "finalized", "complete"].includes(normalized)) return "badge badge-ok";
  if (["blocked", "rejected", "failed"].includes(normalized)) return "badge badge-oot";
  return "badge badge-pend";
}

function deriveJobContext(job, partsById) {
  if (!job) {
    return {
      jobId: "",
      partId: "",
      partRevision: "",
      lot: "",
      operationId: "",
      operationNumber: "",
      operationLabel: ""
    };
  }
  const part = partsById?.[String(job.partNumber)] || null;
  const operation = part?.operations?.[String(job.operation)] || null;
  return {
    jobId: String(job.jobNumber || ""),
    partId: String(job.partNumber || ""),
    partRevision: String(job.partRevision || part?.currentRevision || part?.nextRevision || "A"),
    lot: String(job.lot || ""),
    operationId: String(job.operationId || operation?.id || ""),
    operationNumber: String(job.operation || ""),
    operationLabel: String(operation?.label || "")
  };
}

function normalizeFaiCharacteristic(raw, index = 0) {
  const signOff = isObject(raw?.signOff) ? raw.signOff : (isObject(raw?.sign_off) ? raw.sign_off : {});
  const signOffState = normalizeKey(
    firstText(
      raw?.signOffState,
      raw?.sign_off_state,
      signOff?.state,
      signOff?.status,
      raw?.status,
      isTruthy(signOff?.approved ?? signOff?.signedOff ?? raw?.signedOff ?? raw?.approved) ? "signed_off" : ""
    )
  );
  const signedOff = isTruthy(
    signOff?.approved ??
    signOff?.signedOff ??
    raw?.signedOff ??
    raw?.approved ??
    signOffState
  );
  const blockers = collectStrings(raw?.blockingReasons, raw?.blocking_reasons, raw?.blockers, signOff?.blockingReasons, signOff?.blocking_reasons);
  const warnings = collectStrings(raw?.warnings, raw?.warningReasons, raw?.warning_reasons);
  return {
    id: String(
      firstText(
        raw?.id,
        raw?.characteristicId,
        raw?.characteristic_id,
        raw?.dimensionId,
        raw?.dimension_id,
        raw?.balloonId,
        raw?.balloon_id,
        index + 1
      )
    ),
    dimensionId: firstText(raw?.dimensionId, raw?.dimension_id, raw?.characteristicDimensionId, raw?.characteristic_dimension_id),
    balloonNumber: firstText(raw?.balloonNumber, raw?.balloon_number, raw?.bubbleNumber, raw?.bubble_number),
    name: firstText(raw?.name, raw?.label, raw?.title, raw?.characteristicName, raw?.characteristic_name, `Characteristic ${index + 1}`),
    featureType: firstText(raw?.featureType, raw?.feature_type),
    gdtClass: firstText(raw?.gdtClass, raw?.gdt_class),
    toleranceZone: firstText(raw?.toleranceZone, raw?.tolerance_zone),
    quantity: raw?.quantity ?? raw?.featureQuantity ?? raw?.feature_quantity ?? null,
    units: firstText(raw?.units, raw?.featureUnits, raw?.feature_units),
    modifiers: asArray(raw?.modifiers ?? raw?.featureModifiers ?? raw?.feature_modifiers_json ?? raw?.feature_modifiers),
    sourceCharacteristicKey: firstText(raw?.sourceCharacteristicKey, raw?.source_characteristic_key),
    required: raw?.required ?? raw?.isRequired ?? raw?.is_required ?? true,
    signOffState: signedOff ? "signed_off" : (signOffState || "pending"),
    signedOff: Boolean(signedOff),
    signedOffAt: firstText(raw?.signedOffAt, raw?.signed_off_at, signOff?.signedAt, signOff?.signed_at, signOff?.timestamp),
    signedOffByUserId: raw?.signedOffByUserId ?? raw?.signed_off_by_user_id ?? signOff?.userId ?? signOff?.user_id ?? null,
    signedOffByName: firstText(raw?.signedOffByName, raw?.signed_off_by_name, signOff?.userName, signOff?.user_name),
    note: firstText(raw?.note, raw?.notes, raw?.comment, raw?.comments, signOff?.note, signOff?.comment),
    blockers,
    warnings
  };
}

function normalizeReadiness(source, characteristics, packageSource) {
  const readinessSource = isObject(source) ? source : {};
  const derivedBlockingReasons = characteristics.flatMap((characteristic) => (
    !characteristic.signedOff && characteristic.required !== false
      ? [`${characteristic.balloonNumber || characteristic.name} needs sign-off`]
      : []
  ));
  const blockingReasons = collectStrings(
    readinessSource.blockingReasons,
    readinessSource.blocking_reasons,
    packageSource?.blockingReasons,
    packageSource?.blocking_reasons
  );
  const ready = isTruthy(readinessSource.ready ?? packageSource?.ready ?? (blockingReasons.length === 0 && derivedBlockingReasons.length === 0));
  const reasonList = blockingReasons.length > 0 ? blockingReasons : (ready ? [] : derivedBlockingReasons);
  return {
    state: normalizeKey(readinessSource.state ?? readinessSource.status ?? packageSource?.readinessState ?? (ready ? "ready" : "pending")) || (ready ? "ready" : "pending"),
    ready,
    blockingReasons: reasonList.length > 0 ? reasonList : (ready ? [] : ["All required characteristics must be signed off before finalization."]),
    requiredCount: Number(readinessSource.requiredCount ?? packageSource?.requiredCount ?? characteristics.filter((characteristic) => characteristic.required !== false).length),
    signedOffCount: Number(readinessSource.signedOffCount ?? packageSource?.signedOffCount ?? characteristics.filter((characteristic) => characteristic.signedOff).length)
  };
}

function normalizeFinalization(source, readiness, packageSource) {
  const finalizationSource = isObject(source) ? source : {};
  const finalized = isTruthy(finalizationSource.finalized ?? finalizationSource.completed ?? packageSource?.finalized ?? packageSource?.completed ?? finalizationSource.status);
  const state = normalizeKey(
    finalizationSource.state ??
    finalizationSource.status ??
    packageSource?.finalizationState ??
    (finalized ? "finalized" : readiness.ready ? "ready" : "draft")
  ) || (finalized ? "finalized" : readiness.ready ? "ready" : "draft");
  return {
    state,
    finalized,
    finalizedAt: firstText(finalizationSource.finalizedAt, finalizationSource.finalized_at, packageSource?.finalizedAt, packageSource?.finalized_at),
    blocked: isTruthy(finalizationSource.blocked ?? packageSource?.finalizationBlocked ?? (!readiness.ready && !finalized)),
    message: firstText(finalizationSource.message, finalizationSource.reason, packageSource?.finalizationMessage, packageSource?.finalizationReason),
    summary: firstText(finalizationSource.summary, packageSource?.finalizationSummary)
  };
}

function unwrapPackageSource(raw) {
  const candidates = [
    raw?.package,
    raw?.faiPackage,
    raw?.workflow,
    raw?.data,
    raw?.result,
    raw
  ];
  return candidates.find((candidate) => isObject(candidate) && (candidate.id || candidate.packageId || candidate.characteristics || candidate.readiness || candidate.finalization || candidate.status));
}

function normalizeFaiPackage(raw, fallbackContext = {}) {
  const packageSource = unwrapPackageSource(raw) || {};
  const characteristics = asArray(
    packageSource.characteristics ??
    packageSource.characteristicLines ??
    packageSource.characteristic_lines ??
    packageSource.lines ??
    packageSource.items ??
    packageSource.rows
  ).map((characteristic, index) => normalizeFaiCharacteristic(characteristic, index));
  const readiness = normalizeReadiness(packageSource.readiness ?? raw?.readiness, characteristics, packageSource);
  const finalization = normalizeFinalization(packageSource.finalization ?? raw?.finalization, readiness, packageSource);
  return {
    id: firstText(packageSource.id, packageSource.packageId, packageSource.package_id, packageSource.faiPackageId, packageSource.fai_package_id, fallbackContext.packageId),
    jobId: firstText(packageSource.jobId, packageSource.job_id, fallbackContext.jobId),
    partId: firstText(packageSource.partId, packageSource.part_id, fallbackContext.partId),
    partRevision: firstText(packageSource.partRevision, packageSource.part_revision, fallbackContext.partRevision, "A"),
    lot: firstText(packageSource.lot, packageSource.lotNumber, packageSource.lot_number, fallbackContext.lot),
    operationId: firstText(packageSource.operationId, packageSource.operation_id, fallbackContext.operationId),
    operationNumber: firstText(packageSource.operationNumber, packageSource.operation_number, fallbackContext.operationNumber),
    operationLabel: firstText(packageSource.operationLabel, packageSource.operation_label, fallbackContext.operationLabel),
    status: normalizeKey(packageSource.status ?? packageSource.state ?? finalization.state) || "draft",
    createdAt: firstText(packageSource.createdAt, packageSource.created_at),
    updatedAt: firstText(packageSource.updatedAt, packageSource.updated_at),
    characteristics,
    readiness,
    finalization,
    availableProfiles: asArray(packageSource.availableProfiles ?? packageSource.available_profiles).map((profile) => ({
      id: firstText(profile?.id, profile?.profileId, profile?.profile_id),
      name: firstText(profile?.name, profile?.label),
      version: firstText(profile?.version),
      templateIds: asArray(profile?.templateIds ?? profile?.template_ids)
    }))
  };
}

function mergeCharacteristicUpdate(previousPackage, raw, fallbackContext) {
  if (!previousPackage) return normalizeFaiPackage(raw, fallbackContext);
  const characteristic = normalizeFaiCharacteristic(raw);
  const nextCharacteristics = previousPackage.characteristics.map((entry) => (
    String(entry.id) === String(characteristic.id) || String(entry.dimensionId) === String(characteristic.dimensionId)
      ? { ...entry, ...characteristic }
      : entry
  ));
  const nextPackage = {
    ...previousPackage,
    characteristics: nextCharacteristics
  };
  nextPackage.readiness = normalizeReadiness(previousPackage.readiness, nextCharacteristics, nextPackage);
  nextPackage.finalization = normalizeFinalization(previousPackage.finalization, nextPackage.readiness, nextPackage);
  return nextPackage;
}

function resolveFaiResponse(raw, previousPackage, fallbackContext) {
  if (!raw) return previousPackage;
  if (Array.isArray(raw)) {
    const first = raw.find((entry) => isObject(entry));
    return first ? resolveFaiResponse(first, previousPackage, fallbackContext) : previousPackage;
  }
  const packageSource = unwrapPackageSource(raw);
  const looksLikePackage = Boolean(packageSource && (packageSource.characteristics || packageSource.readiness || packageSource.finalization || packageSource.availableProfiles || packageSource.available_profiles || packageSource.packageId || packageSource.faiPackageId));
  if (looksLikePackage) {
    return normalizeFaiPackage(packageSource, fallbackContext);
  }
  return mergeCharacteristicUpdate(previousPackage, raw, fallbackContext);
}

function formatContextSummary(context) {
  const bits = [];
  if (context.jobId) bits.push(`Job ${context.jobId}`);
  if (context.partId) bits.push(`Part ${context.partId}`);
  if (context.lot) bits.push(`Lot ${context.lot}`);
  if (context.operationNumber) bits.push(`Op ${context.operationNumber}`);
  return bits.length > 0 ? bits.join(" · ") : "Manual context";
}

function formatCharacteristicSummary(characteristic) {
  const pieces = [];
  if (characteristic.balloonNumber) pieces.push(`Balloon ${characteristic.balloonNumber}`);
  if (characteristic.featureType) pieces.push(characteristic.featureType);
  if (characteristic.gdtClass) pieces.push(characteristic.gdtClass);
  return pieces.join(" · ");
}

export default function FaiWorkflow({ parts, jobs, usersById, currentUserId, currentRole, dataStatus }) {
  const jobsList = useMemo(() => Object.values(jobs || {}).sort((a, b) => String(a.jobNumber).localeCompare(String(b.jobNumber))), [jobs]);
  const partsById = useMemo(() => parts || {}, [parts]);
  const defaultJob = jobsList[0] || null;
  const [selectedJobId, setSelectedJobId] = useState(defaultJob?.jobNumber || "");
  const [context, setContext] = useState(() => deriveJobContext(defaultJob, partsById));
  const [faiPackage, setFaiPackage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [signOffNote, setSignOffNote] = useState("");
  const [finalizeNote, setFinalizeNote] = useState("");

  useEffect(() => {
    if (!selectedJobId && defaultJob) {
      setSelectedJobId(defaultJob.jobNumber);
    }
  }, [defaultJob, selectedJobId]);

  useEffect(() => {
    const job = jobsList.find((entry) => String(entry.jobNumber) === String(selectedJobId));
    if (!job) return;
    const nextContext = deriveJobContext(job, partsById);
    setContext((prev) => ({
      ...nextContext,
      partRevision: prev.partRevision || nextContext.partRevision,
      lot: prev.jobId === nextContext.jobId ? prev.lot || nextContext.lot : nextContext.lot
    }));
  }, [jobsList, partsById, selectedJobId]);

  useEffect(() => {
    if (faiPackage && selectedJobId && faiPackage.jobId && String(faiPackage.jobId) !== String(selectedJobId)) {
      setFaiPackage(null);
      setFeedback("");
    }
  }, [faiPackage, selectedJobId]);

  function updateContext(field, value) {
    setContext((prev) => ({ ...prev, [field]: value }));
  }

  function getPayloadContext() {
    return {
      packageId: faiPackage?.id || null,
      jobId: context.jobId || null,
      partId: context.partId || null,
      partRevision: context.partRevision || null,
      lot: context.lot || null,
      operationId: context.operationId || null,
      operationNumber: context.operationNumber || null,
      operationLabel: context.operationLabel || null,
      inspectorUserId: currentUserId ? Number(currentUserId) : null,
      inspectorRole: currentRole || null
    };
  }

  async function loadPackage() {
    if (!context.jobId && !context.partId) {
      setError("Select a job or enter a part context before loading an FAI package.");
      return;
    }
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const payload = getPayloadContext();
      const response = await api.fai.loadPackage(payload, currentRole || "Admin");
      const normalized = normalizeFaiPackage(response, payload);
      setFaiPackage(normalized);
      setFeedback(`Loaded FAI package ${normalized.id || "from context"}.`);
    } catch (err) {
      setError(err?.message || "Unable to load FAI package.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshPackage() {
    if (!faiPackage?.id) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const response = await api.fai.getPackage(faiPackage.id, currentRole || "Admin");
      const normalized = normalizeFaiPackage(response, getPayloadContext());
      setFaiPackage(normalized);
      setFeedback(`Refreshed FAI package ${normalized.id || faiPackage.id}.`);
    } catch (err) {
      setError(err?.message || "Unable to refresh FAI package.");
    } finally {
      setBusy(false);
    }
  }

  async function signOffCharacteristic(characteristic) {
    if (!faiPackage?.id) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const payload = {
        userId: currentUserId ? Number(currentUserId) : undefined,
        note: signOffNote || undefined,
        approved: true,
        state: "signed_off"
      };
      const response = await api.fai.signOffCharacteristic(faiPackage.id, characteristic.id, payload, currentRole || "Admin");
      const normalized = resolveFaiResponse(response, faiPackage, getPayloadContext());
      setFaiPackage(normalized);
      setFeedback(`Signed off ${characteristic.name}.`);
    } catch (err) {
      setError(err?.message || "Unable to sign off characteristic.");
    } finally {
      setBusy(false);
    }
  }

  async function finalizePackage() {
    if (!faiPackage?.id) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const payload = {
        userId: currentUserId ? Number(currentUserId) : undefined,
        note: finalizeNote || signOffNote || undefined,
        force: false
      };
      const response = await api.fai.finalizePackage(faiPackage.id, payload, currentRole || "Admin");
      const normalized = resolveFaiResponse(response, faiPackage, getPayloadContext());
      setFaiPackage(normalized);
      setFeedback(`Finalized FAI package ${normalized.id || faiPackage.id}.`);
    } catch (err) {
      setError(err?.message || "Unable to finalize package.");
    } finally {
      setBusy(false);
    }
  }

  const readiness = faiPackage?.readiness || { ready: false, blockingReasons: [] };
  const finalization = faiPackage?.finalization || { state: "draft", finalized: false };
  const readyToFinalize = Boolean(readiness.ready) && !finalization.finalized;
  const packageTitle = faiPackage?.id ? `FAI Package ${faiPackage.id}` : "FAI Package";
  const contextSummary = formatContextSummary(context);
  const selectedJob = jobsList.find((entry) => String(entry.jobNumber) === String(selectedJobId)) || null;

  return (
    <section className="card" data-testid="fai-workflow-panel">
      <div className="card-head">
        <div className="card-title">FAI Workflow</div>
        <span className={styleForState(finalization.state)}>{humanizeState(finalization.state, "Draft")}</span>
      </div>
      <div className="card-body" style={{ display: "grid", gap: "1rem" }}>
        <div className="banner warn">
          Create or load a structured AS9102 package from the current job context, review balloon-level sign-off, and finalize once the package is ready.
        </div>

        <div className="row3">
          <label className="field">
            <span>Job Context</span>
            <select value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)} disabled={busy || dataStatus !== "live"}>
              <option value="">Manual context</option>
              {jobsList.map((job) => (
                <option key={job.jobNumber} value={job.jobNumber}>
                  {job.jobNumber} · {job.partNumber} · {job.lot} · Op {job.operation}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Part Number</span>
            <input
              value={context.partId}
              onChange={(event) => updateContext("partId", event.target.value)}
              disabled={busy || dataStatus !== "live"}
              placeholder="1234"
            />
          </label>
          <label className="field">
            <span>Lot</span>
            <input
              value={context.lot}
              onChange={(event) => updateContext("lot", event.target.value)}
              disabled={busy || dataStatus !== "live"}
              placeholder="Lot A"
            />
          </label>
        </div>

        <div className="row3">
          <label className="field">
            <span>Revision</span>
            <input
              value={context.partRevision}
              onChange={(event) => updateContext("partRevision", event.target.value)}
              disabled={busy || dataStatus !== "live"}
              placeholder="A"
            />
          </label>
          <label className="field">
            <span>Operation Number</span>
            <input
              value={context.operationNumber}
              onChange={(event) => updateContext("operationNumber", event.target.value)}
              disabled={busy || dataStatus !== "live"}
              placeholder="020"
            />
          </label>
          <label className="field">
            <span>Operation Label</span>
            <input
              value={context.operationLabel}
              onChange={(event) => updateContext("operationLabel", event.target.value)}
              disabled={busy || dataStatus !== "live"}
              placeholder="Bore & Finish"
            />
          </label>
        </div>

        <div className="gap1">
          <button className="btn btn-primary" onClick={loadPackage} disabled={busy || dataStatus !== "live"}>
            {faiPackage ? "Reload Package" : "Create / Load Package"}
          </button>
          <button className="btn btn-ghost" onClick={refreshPackage} disabled={busy || !faiPackage?.id || dataStatus !== "live"}>
            Refresh
          </button>
        </div>

        <div className="text-muted">
          <strong className="accent-text">{contextSummary}</strong>
          {selectedJob?.status ? ` · Job status ${selectedJob.status}` : ""}
        </div>

        {error ? <div className="err-text">{error}</div> : null}
        {feedback ? <div className="text-ok">{feedback}</div> : null}

        {faiPackage ? (
          <>
            <div className="job-strip" style={{ marginBottom: 0 }}>
              <div className="strip-field">
                <div className="strip-label">{packageTitle}</div>
                <div className="strip-val">{faiPackage.status || "draft"}</div>
              </div>
              <div className="strip-field">
                <div className="strip-label">Readiness</div>
                <div className="strip-val">{humanizeState(readiness.state, readyToFinalize ? "Ready" : "Pending")}</div>
              </div>
              <div className="strip-field">
                <div className="strip-label">Signed Off</div>
                <div className="strip-val">{Number(readiness.signedOffCount || 0)} / {Number(readiness.requiredCount || faiPackage.characteristics.length || 0)}</div>
              </div>
              <div className="strip-field">
                <div className="strip-label">Finalization</div>
                <div className="strip-val">{finalization.finalized ? "Finalized" : readyToFinalize ? "Ready to finalize" : "Blocked"}</div>
              </div>
            </div>

            <div className="text-muted">
              {readyToFinalize
                ? "All required characteristics are signed off and the package is ready to finalize."
                : `Blocking reasons: ${(readiness.blockingReasons || []).join("; ")}`}
            </div>

            <label className="field">
              <span>Characteristic Sign-Off Note</span>
              <textarea
                value={signOffNote}
                onChange={(event) => setSignOffNote(event.target.value)}
                disabled={busy || dataStatus !== "live"}
                placeholder="Optional review note for sign-off actions."
              />
            </label>

            <label className="field">
              <span>Finalization Note</span>
              <textarea
                value={finalizeNote}
                onChange={(event) => setFinalizeNote(event.target.value)}
                disabled={busy || dataStatus !== "live"}
                placeholder="Optional note for final package assembly."
              />
            </label>

            <div className="gap1">
              <button className="btn btn-primary" onClick={finalizePackage} disabled={busy || !readyToFinalize || finalization.finalized || dataStatus !== "live"} data-testid="fai-finalize-button">
                {finalization.finalized ? "Finalized" : "Finalize Package"}
              </button>
            </div>

            <table className="data-table" data-testid="fai-characteristics-table">
              <thead>
                <tr>
                  <th>Balloon</th>
                  <th>Characteristic</th>
                  <th>Context</th>
                  <th>State</th>
                  <th>Sign-Off</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {faiPackage.characteristics.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state">No characteristics were returned for this package.</div>
                    </td>
                  </tr>
                ) : faiPackage.characteristics.map((characteristic) => {
                  const signedOff = Boolean(characteristic.signedOff);
                  return (
                    <tr key={characteristic.id}>
                      <td className="mono">{characteristic.balloonNumber || "—"}</td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{characteristic.name}</div>
                        {characteristic.note ? <div className="text-muted">{characteristic.note}</div> : null}
                      </td>
                      <td className="text-muted">
                        {formatCharacteristicSummary(characteristic) || "—"}
                        {characteristic.sourceCharacteristicKey ? <div className="mono">{characteristic.sourceCharacteristicKey}</div> : null}
                      </td>
                      <td>
                        <span className={styleForState(characteristic.signOffState)}>{humanizeState(characteristic.signOffState)}</span>
                        {signedOff && characteristic.signedOffByName ? (
                          <div className="text-muted">
                            {characteristic.signedOffByName}
                            {characteristic.signedOffAt ? ` · ${characteristic.signedOffAt}` : ""}
                          </div>
                        ) : null}
                      </td>
                      <td className="mono">
                        {signedOff ? "Signed Off" : "Open"}
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => signOffCharacteristic(characteristic)}
                          disabled={busy || dataStatus !== "live" || signedOff}
                          data-testid={`fai-signoff-${characteristic.id}`}
                        >
                          {signedOff ? "Signed" : "Sign Off"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        ) : (
          <div className="empty-state">
            Load a package to review balloon characteristic sign-off state, readiness, and finalization controls.
          </div>
        )}
      </div>
    </section>
  );
}
