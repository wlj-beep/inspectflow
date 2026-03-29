import React, { useState, useRef, useEffect, useMemo } from "react";
import { api } from "../../api/index.js";
import { createJobflowAdapter } from "./adapter.js";
import {
  buildFallbackUsers,
  EMPTY_JOBS,
  EMPTY_PARTS,
  EMPTY_RECORDS,
  EMPTY_TOOL_LIBRARY,
} from "./domainConfig.js";
import ToastStack from "../../shared/components/ToastStack.jsx";
import {
  nextRevisionCode,
  normalizeOpNumber,
  revisionCodeToIndex
} from "../../shared/utils/jobflowCore.ts";
import { useTransitionToasts } from "./hooks/useTransitionToasts.js";
import ErrorBoundary from "./ErrorBoundary.jsx";
import {
  buildPartsFromApi,
  mapJobsFromApi,
  mapRecordDetailFromApi,
  mapRecordsFromApi,
  mapToolLibrary,
  mapToolLocations
} from "./mappers.js";
import { uid } from "./jobflowUtils.js";
import { CSS } from "./jobflowStyles.js";
import AdminView from "./AdminView.jsx";
import GlobalSearchBar from "./GlobalSearchBar.jsx";
import HomeDashboard from "./HomeDashboard.jsx";
import AdminRecords from "./AdminRecords.jsx";

import OperatorView from "./OperatorView.jsx";

const jobflowAdapter = createJobflowAdapter(api);

export default function InspectFlowApp({ authUser = null, seatUsage = null, onLogout = null }) {
  const [view, setView] = useState("home");
  const [adminTab, setAdminTab] = useState("jobs");
  const [users, setUsers] = useState([]);
  const [usersById, setUsersById] = useState({});
  const [currentUserId, setCurrentUserId] = useState(authUser?.id ? String(authUser.id) : "");
  const [currentRole, setCurrentRole] = useState(authUser?.role || "Operator");
  const [userLoadErr, setUserLoadErr] = useState("");
  const [dataStatus, setDataStatus] = useState("local");
  const [dataErr, setDataErr] = useState("");
  const [parts, setParts] = useState(EMPTY_PARTS);
  const [jobs, setJobs] = useState(EMPTY_JOBS);
  const [records, setRecords] = useState(EMPTY_RECORDS);
  const [toolLibrary, setToolLibrary] = useState(EMPTY_TOOL_LIBRARY);
  const [toolLocations, setToolLocations] = useState([]);
  const [opIdToNumber, setOpIdToNumber] = useState({});
  const [roleCaps, setRoleCaps] = useState(DEFAULT_ROLE_CAPS);
  const prevUserRef = useRef("");
  const { toasts, dismissToast, runTransition } = useTransitionToasts();
  const [searchDeepLink, setSearchDeepLink] = useState(null);
  const [pendingImportCount, setPendingImportCount] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const rawView = String(url.searchParams.get("view") || "")
      .trim()
      .toLowerCase();
    const rawAdminTab = String(url.searchParams.get("adminTab") || "")
      .trim()
      .toLowerCase();
    if (["home", "operator", "records", "admin"].includes(rawView)) {
      setView(rawView);
    } else if (rawView === "") {
      setView("home");
    }
    if (rawAdminTab) setAdminTab(rawAdminTab);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    if (view === "admin") url.searchParams.set("adminTab", adminTab);
    else url.searchParams.delete("adminTab");
    window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, [view, adminTab]);

  useEffect(() => {
    let active = true;
    jobflowAdapter.users
      .list(currentRole || "Operator")
      .then((rows) => {
        if (!active) return;
        const fallbackUsers = buildFallbackUsers(authUser);
        const localUsers = Array.isArray(rows) && rows.length ? rows : fallbackUsers;
        setUsers(localUsers);
        if (authUser?.id) {
          setCurrentUserId(String(authUser.id));
          setCurrentRole(authUser.role || "Operator");
        } else if (!currentUserId && localUsers.length) {
          setCurrentUserId(String(localUsers[0].id));
          setCurrentRole(localUsers[0].role);
        }
        if (!Array.isArray(rows) || rows.length === 0) {
          setUserLoadErr("Live user list unavailable.");
        }
      })
      .catch(() => {
        if (!active) return;
        const fallbackUsers = buildFallbackUsers(authUser);
        setUsers(fallbackUsers);
        if (authUser?.id) {
          setCurrentUserId(String(authUser.id));
          setCurrentRole(authUser.role || "Operator");
        } else if (!currentUserId && fallbackUsers.length) {
          setCurrentUserId(String(fallbackUsers[0].id));
          setCurrentRole(fallbackUsers[0].role);
        }
        setUserLoadErr("Live user list unavailable.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadPendingImports() {
      try {
        const rows = await api.imports.unresolved(currentRole || "Operator");
        if (!active) return;
        setPendingImportCount(Array.isArray(rows) ? rows.length : 0);
      } catch {
        if (!active) return;
        setPendingImportCount(0);
      }
    }
    loadPendingImports();
    return () => {
      active = false;
    };
  }, [currentRole, dataStatus]);

  useEffect(() => {
    let active = true;
    async function loadRoleCaps() {
      if (dataStatus !== "live") {
        setRoleCaps(DEFAULT_ROLE_CAPS);
        return;
      }
      if (currentRole !== "Admin") {
        return;
      }
      try {
        const rows = await jobflowAdapter.roles.list(currentRole);
        if (!active) return;
        const map = { ...DEFAULT_ROLE_CAPS };
        for (const r of rows || []) {
          map[r.role] = r.capabilities || [];
        }
        setRoleCaps(map);
      } catch {
        if (!active) return;
        setRoleCaps(DEFAULT_ROLE_CAPS);
      }
    }
    loadRoleCaps();
    return () => {
      active = false;
    };
  }, [currentRole, dataStatus]);

  useEffect(() => {
    const map = {};
    users.forEach((u) => {
      map[String(u.id)] = u.name;
    });
    setUsersById(map);
  }, [users]);

  useEffect(() => {
    if (authUser?.id) {
      const authId = String(authUser.id);
      if (currentUserId !== authId) setCurrentUserId(authId);
      if ((authUser.role || "Operator") !== currentRole)
        setCurrentRole(authUser.role || "Operator");
      return;
    }
    const u = users.find((u) => String(u.id) === String(currentUserId));
    if (u && u.role !== currentRole) setCurrentRole(u.role);
  }, [authUser, currentRole, currentUserId, users]);

  useEffect(() => {
    if (dataStatus !== "live") {
      prevUserRef.current = currentUserId;
      return;
    }
    const prev = prevUserRef.current;
    const next = currentUserId;
    if (prev && prev !== next) {
      jobflowAdapter.sessions.end(Number(prev), currentRole).catch((err) => { console.warn("[inspectflow] sessions.end:", err?.message || err); });
    }
    if (next && next !== prev) {
      jobflowAdapter.sessions.start(Number(next), currentRole).catch((err) => { console.warn("[inspectflow] sessions.start:", err?.message || err); });
    }
    prevUserRef.current = next;
  }, [currentUserId, dataStatus, currentRole]);

  useEffect(() => {
    let active = true;
    async function loadData() {
      setDataStatus("loading");
      setDataErr("");
      try {
        const role = currentRole || "Admin";
        const { toolsList, toolLocationsList, partDetails, jobsList, recordsList } =
          await jobflowAdapter.loadBootstrap(role);
        const { partsObj, opIdToNumber: opMap } = buildPartsFromApi(partDetails);
        if (!active) return;
        setToolLibrary(mapToolLibrary(toolsList));
        setToolLocations(mapToolLocations(toolLocationsList));
        setParts(partsObj);
        setOpIdToNumber(opMap);
        setJobs(mapJobsFromApi(jobsList, opMap));
        setRecords(mapRecordsFromApi(recordsList, opMap, usersById));
        setDataStatus("live");
      } catch (err) {
        if (!active) return;
        setDataStatus("fallback");
        setDataErr(err?.message || "API unavailable.");
      }
    }
    loadData();
    return () => {
      active = false;
    };
  }, []);

  async function reloadLiveData() {
    setDataStatus("loading");
    setDataErr("");
    try {
      const role = currentRole || "Admin";
      const { toolsList, toolLocationsList, partDetails, jobsList, recordsList } =
        await jobflowAdapter.loadBootstrap(role);
      const { partsObj, opIdToNumber: opMap } = buildPartsFromApi(partDetails);
      setToolLibrary(mapToolLibrary(toolsList));
      setToolLocations(mapToolLocations(toolLocationsList));
      setParts(partsObj);
      setOpIdToNumber(opMap);
      setJobs(mapJobsFromApi(jobsList, opMap));
      setRecords(mapRecordsFromApi(recordsList, opMap, usersById));
      setDataStatus("live");
    } catch (err) {
      setDataStatus("fallback");
      setDataErr(err?.message || "API unavailable.");
    }
  }

  const currentCaps = roleCaps[currentRole] || [];
  const hasCap = (cap) => currentCaps.includes(cap);
  const canViewAdmin = hasCap("view_admin");
  const canViewOperator = hasCap("view_operator") || currentRole === "Operator";
  const canViewRecords = hasCap("view_records");
  const canEditRecords = hasCap("edit_records");
  const canManageJobs = hasCap("manage_jobs");
  const canManageParts = hasCap("manage_parts");
  const canManageTools = hasCap("manage_tools");
  const canManageUsers = hasCap("manage_users");
  const canManageRoles = hasCap("manage_roles");

  useEffect(() => {
    if (view === "admin" && !canViewAdmin) setView(canViewOperator ? "operator" : "records");
    if (view === "operator" && !canViewOperator) setView(canViewAdmin ? "admin" : "records");
    if (view === "records" && !canViewRecords) setView(canViewOperator ? "operator" : "admin");
  }, [currentRole, view, canViewAdmin, canViewOperator, canViewRecords]);
  async function handleSubmit(record, jobNumber) {
    if (dataStatus !== "live") {
      const nextStatus = record.status === "complete" ? "closed" : "incomplete";
      setRecords((prev) => [record, ...prev]);
      setJobs((prev) => ({ ...prev, [jobNumber]: { ...prev[jobNumber], status: nextStatus } }));
      return;
    }
    if (!currentUserId) throw new Error("Select a current user before submitting.");
    const job = jobs[jobNumber];
    const opId = job?.operationId || parts?.[record.partNumber]?.operations?.[record.operation]?.id;
    if (!opId) throw new Error("Operation mapping missing for this job.");
    const op = parts?.[record.partNumber]?.operations?.[record.operation];
    const dimMap = new Map((op?.dimensions || []).map((d) => [String(d.id), d]));
    const missingPiecesPayload = Object.entries(record.missingPieces || {}).map(
      ([piece, info]) => ({
        pieceNumber: Number(piece),
        reason: info.reason,
        ncNum: info.ncNum || undefined,
        details: info.details || undefined
      })
    );
    const missingSet = new Set(Object.keys(record.missingPieces || {}).map((p) => Number(p)));
    const valuesPayload = [];
    for (const [key, val] of Object.entries(record.values || {})) {
      if (val === undefined || val === "") continue;
      const [dimId, pieceStr] = key.split("_");
      const pieceNumber = Number(pieceStr);
      if (missingSet.has(pieceNumber)) continue;
      const dim = dimMap.get(String(dimId));
      let isOot = false;
      if (val === "FAIL") isOot = true;
      else if (val === "PASS") isOot = false;
      else {
        const st = dim ? isOOT(val, dim.tolPlus, dim.tolMinus, dim.nominal) : null;
        isOot = st === true;
      }
      valuesPayload.push({
        dimensionId: Number(dimId),
        pieceNumber,
        value: val,
        isOot
      });
    }
    const toolsPayload = Object.entries(record.tools || {}).flatMap(([dimId, rows]) => {
      const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
      return list.flatMap((t) => {
        if (!t?.toolId || !t?.itNum) return [];
        return [
          {
            dimensionId: Number(dimId),
            toolId: Number(t.toolId),
            itNum: String(t.itNum)
          }
        ];
      });
    });
    const attachmentsPayload = Array.isArray(record.attachments)
      ? record.attachments
          .map((attachment) => ({
            pieceNumber: Number(attachment.pieceNumber),
            fileName: String(attachment.fileName || ""),
            mediaType: String(attachment.mediaType || "").toLowerCase(),
            dataBase64: String(attachment.dataBase64 || ""),
            retentionDays: Number(attachment.retentionDays || 365)
          }))
          .filter(
            (item) =>
              Number.isInteger(item.pieceNumber) &&
              item.pieceNumber > 0 &&
              item.fileName &&
              item.mediaType &&
              item.dataBase64
          )
      : [];
    const payload = {
      jobId: jobNumber,
      partId: record.partNumber,
      operationId: Number(opId),
      lot: record.lot,
      qty: record.qty,
      operatorUserId: Number(currentUserId),
      status: record.status,
      oot: record.oot,
      comment: record.comment || "",
      values: valuesPayload,
      tools: toolsPayload,
      missingPieces: missingPiecesPayload,
      attachments: attachmentsPayload
    };
    const created = await api.records.submit(payload, currentRole || "Operator");
    const mapped = mapRecordsFromApi([created], opIdToNumber, usersById)[0];
    setRecords((prev) => [mapped, ...prev]);
    const nextStatus = record.status === "complete" ? "closed" : "incomplete";
    setJobs((prev) => ({
      ...prev,
      [jobNumber]: { ...prev[jobNumber], status: nextStatus, draftData: undefined }
    }));
  }
  function handleDraft({ jobNumber, draftData }) {
    setJobs((prev) => ({
      ...prev,
      [jobNumber]: { ...prev[jobNumber], status: "draft", draftData }
    }));
  }
  async function handleCreateJob(job) {
    if (dataStatus !== "live") {
      setJobs((prev) => ({ ...prev, [job.jobNumber]: job }));
      return;
    }
    return runTransition("Create job", async () => {
      if (!canManageJobs) throw new Error("Permission required to create jobs.");
      const opId = parts?.[job.partNumber]?.operations?.[job.operation]?.id;
      if (!opId) throw new Error("Operation mapping missing for this job.");
      const created = await api.jobs.create(
        {
          id: job.jobNumber,
          partId: job.partNumber,
          partRevision: job.partRevision,
          operationId: Number(opId),
          lot: job.lot,
          qty: job.qty,
          status: job.status || "open"
        },
        currentRole
      );
      const mapped = mapJobsFromApi([created], opIdToNumber)[0];
      setJobs((prev) => ({ ...prev, [mapped.jobNumber]: mapped }));
    });
  }
  async function handleCreatePart(part) {
    const pn = part.partNumber;
    const normalizedRevision = String(part.revision || "A")
      .trim()
      .toUpperCase();
    if (dataStatus !== "live") {
      setParts((prev) => ({
        ...prev,
        [pn]: {
          partNumber: pn,
          description: part.description,
          currentRevision: normalizedRevision,
          nextRevision: nextRevisionCode(normalizedRevision),
          revisions: [
            {
              revision: normalizedRevision,
              partName: part.description,
              changeSummary: "Initial setup"
            }
          ],
          readOnlyRevision: false,
          operations: {}
        }
      }));
      return;
    }
    return runTransition("Create part", async () => {
      if (!canManageParts) throw new Error("Permission required to add parts.");
      const created = await api.parts.create(
        { id: pn, description: part.description, revision: normalizedRevision },
        currentRole
      );
      const createdDesc = created?.description || part.description;
      const createdRev = created?.currentRevision || normalizedRevision;
      setParts((prev) => ({
        ...prev,
        [pn]: {
          partNumber: pn,
          description: createdDesc,
          currentRevision: createdRev,
          nextRevision: created?.nextRevision || nextRevisionCode(createdRev),
          revisions: [
            {
              revision: createdRev,
              revisionIndex: revisionCodeToIndex(createdRev) || 1,
              partName: createdDesc,
              changeSummary: "Initial part setup",
              changedFields: ["part.description"],
              createdByRole: currentRole
            }
          ],
          readOnlyRevision: false,
          operations: {}
        }
      }));
    });
  }
  async function handleUpdatePart(partNumber, description, persist) {
    setParts((prev) => ({ ...prev, [partNumber]: { ...prev[partNumber], description } }));
    if (!persist) return;
    if (dataStatus !== "live") return;
    return runTransition("Update part", async () => {
      if (!canManageParts) throw new Error("Permission required to update parts.");
      await api.parts.update(partNumber, { description }, currentRole);
      await reloadLiveData();
    });
  }
  async function handleBulkUpdateParts(updates) {
    if (!Array.isArray(updates) || updates.length === 0)
      return { ok: true, updated: 0, skipped: 0, notFound: [] };
    if (dataStatus !== "live") {
      setParts((prev) => {
        const next = { ...prev };
        for (const u of updates) {
          const id = String(u?.id || "").trim();
          const description = String(u?.description || "").trim();
          if (!id || !description || !next[id]) continue;
          next[id] = { ...next[id], description };
        }
        return next;
      });
      return { ok: true, updated: updates.length, skipped: 0, notFound: [] };
    }
    return runTransition("Bulk update parts", async () => {
      if (!canManageParts) throw new Error("Permission required to update parts.");
      const result = await api.parts.bulkUpdate({ updates }, currentRole);
      await reloadLiveData();
      return result;
    });
  }
  async function handleCreateOp(partNumber, opNumber, label) {
    const normalizedOp = normalizeOpNumber(opNumber);
    if (!normalizedOp) throw new Error("Operation number must be between 001 and 999.");
    if (dataStatus !== "live") {
      setParts((prev) => ({
        ...prev,
        [partNumber]: {
          ...prev[partNumber],
          operations: {
            ...prev[partNumber].operations,
            [normalizedOp]: { id: `op_${uid()}`, label, dimensions: [] }
          }
        }
      }));
      return;
    }
    return runTransition("Create operation", async () => {
      if (!canManageParts) throw new Error("Permission required to add operations.");
      await api.operations.create(
        { partId: partNumber, opNumber: normalizedOp, label },
        currentRole
      );
      await reloadLiveData();
    });
  }
  async function handleCreateDim(partNumber, opNumber, dim) {
    const op = parts?.[partNumber]?.operations?.[opNumber];
    if (!op) throw new Error("Operation not found.");
    if (dataStatus !== "live") {
      const newDim = { id: `d${uid()}`, ...dim };
      setParts((prev) => ({
        ...prev,
        [partNumber]: {
          ...prev[partNumber],
          operations: {
            ...prev[partNumber].operations,
            [opNumber]: {
              ...prev[partNumber].operations[opNumber],
              dimensions: [...prev[partNumber].operations[opNumber].dimensions, newDim]
            }
          }
        }
      }));
      return;
    }
    return runTransition("Create dimension", async () => {
      if (!canManageParts) throw new Error("Permission required to add dimensions.");
      await api.dimensions.create(
        {
          operationId: Number(op.id),
          name: dim.name,
          bubbleNumber: dim.bubbleNumber || null,
          featureType: dim.featureType || null,
          gdtClass: dim.gdtClass || null,
          toleranceZone: dim.toleranceZone || null,
          featureQuantity: dim.featureQuantity === "" ? null : dim.featureQuantity,
          featureUnits: dim.featureUnits || null,
          featureModifiers: Array.isArray(dim.featureModifiers) ? dim.featureModifiers : [],
          sourceCharacteristicKey: dim.sourceCharacteristicKey || null,
          nominal: dim.nominal,
          tolPlus: dim.tolPlus,
          tolMinus: dim.tolMinus,
          unit: dim.unit,
          sampling: dim.sampling,
          samplingInterval:
            dim.sampling === "custom_interval" ? Number(dim.samplingInterval) || 2 : null,
          inputMode: dim.inputMode || "single",
          toolIds: dim.tools
        },
        currentRole
      );
      await reloadLiveData();
    });
  }
  async function handleUpdateDim(partNumber, opNumber, dimId, field, value, persist) {
    const op = parts?.[partNumber]?.operations?.[opNumber];
    if (!op) return;
    const dims = op.dimensions.map((d) => {
      if (d.id !== dimId) return d;
      const next = { ...d, [field]: value };
      if (field === "sampling") {
        if (value === "custom_interval") {
          next.samplingInterval = d.samplingInterval || 2;
        } else {
          next.samplingInterval = null;
        }
      }
      if (field === "samplingInterval") {
        const n = Math.max(1, Number(value) || 1);
        next.samplingInterval = n;
      }
      return next;
    });
    setParts((prev) => ({
      ...prev,
      [partNumber]: {
        ...prev[partNumber],
        operations: {
          ...prev[partNumber].operations,
          [opNumber]: { ...prev[partNumber].operations[opNumber], dimensions: dims }
        }
      }
    }));
    if (!persist) return;
    if (dataStatus !== "live") return;
    return runTransition("Update dimension", async () => {
      if (!canManageParts) throw new Error("Permission required to update dimensions.");
      const dim = dims.find((d) => d.id === dimId);
      if (!dim) return;
      await api.dimensions.update(
        dimId,
        {
          name: dim.name,
          bubbleNumber: dim.bubbleNumber || null,
          featureType: dim.featureType || null,
          gdtClass: dim.gdtClass || null,
          toleranceZone: dim.toleranceZone || null,
          featureQuantity: dim.featureQuantity === "" ? null : dim.featureQuantity,
          featureUnits: dim.featureUnits || null,
          featureModifiers: Array.isArray(dim.featureModifiers) ? dim.featureModifiers : [],
          sourceCharacteristicKey: dim.sourceCharacteristicKey || null,
          nominal: dim.nominal,
          tolPlus: dim.tolPlus,
          tolMinus: dim.tolMinus,
          unit: dim.unit,
          sampling: dim.sampling,
          samplingInterval:
            dim.sampling === "custom_interval" ? Number(dim.samplingInterval) || 2 : null,
          inputMode: dim.inputMode || "single",
          toolIds: dim.tools
        },
        currentRole
      );
      await reloadLiveData();
    });
  }
  async function handleRemoveDim(partNumber, opNumber, dimId) {
    if (dataStatus !== "live") {
      setParts((prev) => ({
        ...prev,
        [partNumber]: {
          ...prev[partNumber],
          operations: {
            ...prev[partNumber].operations,
            [opNumber]: {
              ...prev[partNumber].operations[opNumber],
              dimensions: prev[partNumber].operations[opNumber].dimensions.filter(
                (d) => d.id !== dimId
              )
            }
          }
        }
      }));
      return;
    }
    return runTransition("Remove dimension", async () => {
      if (!canManageParts) throw new Error("Permission required to remove dimensions.");
      await api.dimensions.remove(dimId, currentRole);
      await reloadLiveData();
    });
  }
  async function handleCreateUser(user) {
    if (dataStatus !== "live") {
      const id = `u_${uid()}`;
      setUsers((prev) =>
        [...prev, { id, name: user.name, role: user.role, active: user.active }].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      return;
    }
    return runTransition("Create user", async () => {
      if (!canManageUsers) throw new Error("Permission required to add users.");
      const created = await api.users.create(
        { name: user.name, role: user.role, active: user.active },
        currentRole
      );
      setUsers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    });
  }
  async function handleUpdateUser(id, payload) {
    if (dataStatus !== "live") {
      setUsers((prev) =>
        prev
          .map((u) => (String(u.id) === String(id) ? { ...u, ...payload } : u))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      return;
    }
    return runTransition("Update user", async () => {
      if (!canManageUsers) throw new Error("Permission required to update users.");
      const updated = await api.users.update(id, payload, currentRole);
      setUsers((prev) =>
        prev
          .map((u) => (String(u.id) === String(id) ? updated : u))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }
  async function handleRemoveUser(id) {
    if (dataStatus !== "live") {
      setUsers((prev) => prev.filter((u) => String(u.id) !== String(id)));
      return;
    }
    return runTransition("Remove user", async () => {
      if (!canManageUsers) throw new Error("Permission required to remove users.");
      await api.users.remove(id, currentRole);
      setUsers((prev) => prev.filter((u) => String(u.id) !== String(id)));
    });
  }
  async function handleCreateTool(tool) {
    if (dataStatus !== "live") {
      const id = "t" + uid();
      setToolLibrary((prev) => ({
        ...prev,
        [id]: {
          id,
          name: tool.name,
          type: tool.type,
          itNum: tool.itNum,
          size: tool.size || "",
          calibrationDueDate: tool.calibrationDueDate || "",
          currentLocationId: tool.currentLocationId || null,
          homeLocationId: tool.homeLocationId || null,
          active: tool.active !== false,
          visible: tool.visible !== false
        }
      }));
      return;
    }
    return runTransition("Create tool", async () => {
      if (!canManageTools) throw new Error("Permission required to add tools.");
      const created = await api.tools.create(
        {
          name: tool.name,
          type: tool.type,
          itNum: tool.itNum,
          size: tool.size,
          calibrationDueDate: tool.calibrationDueDate || null,
          currentLocationId: tool.currentLocationId || null,
          homeLocationId: tool.homeLocationId || null,
          active: tool.active !== false,
          visible: tool.visible !== false
        },
        currentRole
      );
      const id = String(created.id);
      setToolLibrary((prev) => ({
        ...prev,
        [id]: {
          id,
          name: created.name,
          type: created.type,
          itNum: created.it_num ?? created.itNum,
          size: created.size ?? "",
          calibrationDueDate: created.calibration_due_date ?? created.calibrationDueDate ?? "",
          currentLocationId: created.current_location_id ?? created.currentLocationId ?? null,
          currentLocationName: created.current_location_name ?? created.currentLocationName ?? "",
          currentLocationType: created.current_location_type ?? created.currentLocationType ?? "",
          homeLocationId: created.home_location_id ?? created.homeLocationId ?? null,
          homeLocationName: created.home_location_name ?? created.homeLocationName ?? "",
          homeLocationType: created.home_location_type ?? created.homeLocationType ?? "",
          active: created.active ?? true,
          visible: created.visible ?? true
        }
      }));
    });
  }
  async function handleUpdateTool(id, patch) {
    if (dataStatus !== "live") {
      setToolLibrary((prev) => ({
        ...prev,
        [id]: { ...prev[id], ...patch }
      }));
      return;
    }
    return runTransition("Update tool", async () => {
      if (!canManageTools) throw new Error("Permission required to update tools.");
      const updated = await api.tools.update(id, patch, currentRole);
      setToolLibrary((prev) => ({
        ...prev,
        [String(updated.id)]: {
          id: String(updated.id),
          name: updated.name,
          type: updated.type,
          itNum: updated.it_num ?? updated.itNum,
          size: updated.size ?? "",
          calibrationDueDate: updated.calibration_due_date ?? updated.calibrationDueDate ?? "",
          currentLocationId: updated.current_location_id ?? updated.currentLocationId ?? null,
          currentLocationName: updated.current_location_name ?? updated.currentLocationName ?? "",
          currentLocationType: updated.current_location_type ?? updated.currentLocationType ?? "",
          homeLocationId: updated.home_location_id ?? updated.homeLocationId ?? null,
          homeLocationName: updated.home_location_name ?? updated.homeLocationName ?? "",
          homeLocationType: updated.home_location_type ?? updated.homeLocationType ?? "",
          active: updated.active ?? true,
          visible: updated.visible ?? true
        }
      }));
    });
  }
  async function handleCreateToolLocation(location) {
    if (dataStatus !== "live") {
      const id = Date.now();
      setToolLocations((prev) =>
        [...prev, { id, name: location.name, locationType: location.locationType }].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      return;
    }
    return runTransition("Create tool location", async () => {
      if (!canManageTools) throw new Error("Permission required to manage tool locations.");
      const created = await api.toolLocations.create(location, currentRole);
      setToolLocations((prev) =>
        [
          ...prev,
          {
            id: Number(created.id),
            name: created.name,
            locationType: created.location_type ?? created.locationType
          }
        ].sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }
  async function handleUpdateToolLocation(id, patch) {
    if (dataStatus !== "live") {
      setToolLocations((prev) =>
        prev
          .map((loc) => (String(loc.id) === String(id) ? { ...loc, ...patch } : loc))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      return;
    }
    return runTransition("Update tool location", async () => {
      if (!canManageTools) throw new Error("Permission required to manage tool locations.");
      const updated = await api.toolLocations.update(id, patch, currentRole);
      setToolLocations((prev) =>
        prev
          .map((loc) =>
            String(loc.id) === String(id)
              ? {
                  id: Number(updated.id),
                  name: updated.name,
                  locationType: updated.location_type ?? updated.locationType
                }
              : loc
          )
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }
  async function handleRemoveToolLocation(id) {
    if (dataStatus !== "live") {
      setToolLocations((prev) => prev.filter((loc) => String(loc.id) !== String(id)));
      setToolLibrary((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((toolId) => {
          const tool = next[toolId];
          if (
            String(tool.currentLocationId) === String(id) ||
            String(tool.homeLocationId) === String(id)
          ) {
            next[toolId] = {
              ...tool,
              currentLocationId: null,
              currentLocationName: "",
              homeLocationId: null,
              homeLocationName: ""
            };
          }
        });
        return next;
      });
      return;
    }
    return runTransition("Remove tool location", async () => {
      if (!canManageTools) throw new Error("Permission required to manage tool locations.");
      await api.toolLocations.remove(id, currentRole);
      setToolLocations((prev) => prev.filter((loc) => String(loc.id) !== String(id)));
      await reloadLiveData();
    });
  }
  async function handleUpdateRoleCaps(role, capabilities) {
    if (dataStatus !== "live") {
      setRoleCaps((prev) => ({ ...prev, [role]: capabilities }));
      return;
    }
    return runTransition("Update role capabilities", async () => {
      if (!canManageRoles) throw new Error("Permission required to manage roles.");
      const updated = await api.roles.update(role, { capabilities }, currentRole);
      setRoleCaps((prev) => ({ ...prev, [role]: updated.capabilities || [] }));
    });
  }
  async function handleEditRecordValue({ recordId, dimensionId, pieceNumber, value, reason }) {
    if (dataStatus !== "live") throw new Error("Edits require live data mode.");
    return runTransition("Update inspection record", async () => {
      if (!currentUserId) throw new Error("Select a current user before editing.");
      if (!canEditRecords) throw new Error("Permission required for edits.");
      await api.records.editValue(
        recordId,
        {
          userId: Number(currentUserId),
          dimensionId: Number(dimensionId),
          pieceNumber: Number(pieceNumber),
          value: String(value),
          reason
        },
        currentRole
      );
      const detail = await api.records.get(recordId, currentRole);
      const mapped = mapRecordDetailFromApi(detail, opIdToNumber, usersById);
      setRecords((prev) =>
        prev.map((r) => (String(r.id) === String(recordId) ? { ...r, oot: mapped.oot } : r))
      );
      return mapped;
    });
  }
  async function handleLockJob(jobId) {
    if (dataStatus !== "live") return;
    if (!currentUserId) throw new Error("Select a current user before locking a job.");
    try {
      await api.jobs.lock(jobId, currentUserId, currentRole || "Operator");
      setJobs((prev) => ({
        ...prev,
        [jobId]: {
          ...prev[jobId],
          lockOwnerUserId: Number(currentUserId),
          lockTimestamp: new Date().toISOString()
        }
      }));
    } catch (err) {
      if (err?.message === "locked") throw new Error("Job is locked by another user.");
      if (err?.message === "job_not_open") throw new Error("Job is not open.");
      throw err;
    }
  }
  async function handleUnlockJob(jobId) {
    if (dataStatus !== "live") return;
    return runTransition("Unlock job", async () => {
      await api.jobs.unlock(jobId, Number(currentUserId) || undefined, currentRole || "Operator");
      setJobs((prev) => ({
        ...prev,
        [jobId]: { ...prev[jobId], lockOwnerUserId: null, lockTimestamp: null }
      }));
    });
  }
  async function loadRecordDetail(id) {
    const role = currentRole || "Admin";
    const detail = await jobflowAdapter.records.get(id, role);
    return mapRecordDetailFromApi(detail, opIdToNumber, usersById);
  }
  const dataChipLabel =
    dataStatus === "live" ? "Live Data" : dataStatus === "loading" ? "Loading" : "Local Demo";
  const dataChipClass =
    dataStatus === "live"
      ? "data-live"
      : dataStatus === "loading"
        ? "data-loading"
        : "data-fallback";
  const seatChipText = seatUsage
    ? `${seatUsage.softLimitExceeded ? "Seats Exceeded" : seatUsage.softLimitWarning ? "Seats Warning" : "Seats"} ${seatUsage.activeUsers}/${seatUsage.seatSoftLimit}`
    : "";
  const seatChipClass = !seatUsage
    ? "data-loading"
    : seatUsage.softLimitExceeded
      ? "data-fallback"
      : seatUsage.softLimitWarning
        ? "data-loading"
        : "data-live";
  function handleOpenSearchResult(result) {
    const deepLink = result?.deepLink || {};
    const rawView = String(deepLink.view || "")
      .trim()
      .toLowerCase();
    const rawAdminTab = String(deepLink.adminTab || "")
      .trim()
      .toLowerCase();
    const inferredAdminTab =
      rawAdminTab ||
      (rawView.startsWith("/issues") ? "issues" : "") ||
      (rawView.startsWith("/jobs") ? "jobs" : "") ||
      (rawView.startsWith("/users") ? "users" : "") ||
      (rawView.startsWith("/tools") ? "tools" : "");
    const targetView =
      rawView === "records" || rawView.startsWith("/records")
        ? "records"
        : rawView === "operator" || rawView.startsWith("/operator")
          ? "operator"
          : "admin";
    if (targetView === "records") {
      setView("records");
    } else if (targetView === "admin") {
      setView("admin");
      if (inferredAdminTab) setAdminTab(inferredAdminTab);
    } else if (targetView === "operator") {
      setView("operator");
    }
    setSearchDeepLink({
      nonce: Date.now(),
      view: targetView,
      adminTab: inferredAdminTab || null,
      recordId: deepLink.recordId ? String(deepLink.recordId) : null,
      jobId: deepLink.jobId ? String(deepLink.jobId) : null,
      toolId: deepLink.toolId ? String(deepLink.toolId) : null,
      issueId: deepLink.issueId ? String(deepLink.issueId) : null,
      userId: deepLink.userId ? String(deepLink.userId) : null,
      auditId: deepLink.auditId ? String(deepLink.auditId) : null
    });
  }
  function handleJumpToView(nextView, nextAdminTab = null, recordId = null) {
    if (nextView === "admin") {
      setView("admin");
      if (nextAdminTab) setAdminTab(nextAdminTab);
      return;
    }
    if (nextView === "records") {
      setView("records");
      if (recordId) {
        setSearchDeepLink({
          nonce: Date.now(),
          view: "records",
          adminTab: null,
          recordId: String(recordId)
        });
      }
      return;
    }
    if (nextView === "operator") {
      setView("operator");
      return;
    }
    setView("home");
  }
  return (
    <ErrorBoundary>
      <>
        <style>{CSS}</style>
        <div className={`app-header role-ctx-${(currentRole || "operator").toLowerCase()}`}>
          <div className="logo">
            <div className="logo-icon" />
            InspectFlow
          </div>
          <div className="header-sep" />
          <div className="header-sub">Manufacturing Inspection System</div>
          <div className="header-right">
            <GlobalSearchBar currentRole={currentRole} onOpenResult={handleOpenSearchResult} />
            <div className="user-ctrl">
              <div className="user-ctrl-label">Current User</div>
              {authUser?.id ? (
                <div className="user-ctrl-row" data-testid="authenticated-user">
                  <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "var(--fs-sm)" }}>
                    {authUser.name || usersById?.[String(currentUserId)] || "Authenticated User"}
                  </div>
                  <span className={`role-chip role-${(currentRole || "").toLowerCase()}`}>
                    {currentRole || "Unknown"}
                  </span>
                </div>
              ) : (
                <div className="user-ctrl-row">
                  <select value={currentUserId} onChange={(e) => setCurrentUserId(e.target.value)}>
                    <option value="">Select user…</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} — {u.role}
                      </option>
                    ))}
                  </select>
                  <span className={`role-chip role-${(currentRole || "").toLowerCase()}`}>
                    {currentRole || "Unknown"}
                  </span>
                </div>
              )}
              {userLoadErr ? <div className="user-ctrl-hint">{userLoadErr}</div> : null}
              {dataErr ? <div className="user-ctrl-hint">{dataErr}</div> : null}
            </div>
            {seatUsage ? (
              <span
                className={`data-chip ${seatChipClass}`}
                title={`License ${seatUsage.licenseTier} · active sessions ${seatUsage.activeSessions}`}
                data-testid="seat-usage-chip"
              >
                {seatChipText}
              </span>
            ) : null}
            <span className={`data-chip ${dataChipClass}`} data-testid="data-status-chip">
              {dataChipLabel}
            </span>
            {onLogout ? (
              <button className="nav-btn" onClick={onLogout}>
                Sign Out
              </button>
            ) : null}
            <nav className="nav">
              <button
                className={`nav-btn ${view === "home" ? "active" : ""}`}
                onClick={() => setView("home")}
              >
                Home
              </button>
              {canViewOperator && (
                <button
                  className={`nav-btn ${view === "operator" ? "active" : ""}`}
                  onClick={() => setView("operator")}
                >
                  Operator Entry
                </button>
              )}
              {canViewRecords && (
                <button
                  className={`nav-btn ${view === "records" ? "active" : ""}`}
                  onClick={() => setView("records")}
                >
                  Records
                </button>
              )}
              {canViewAdmin && (
                <button
                  className={`nav-btn ${view === "admin" ? "active" : ""}`}
                  onClick={() => setView("admin")}
                >
                  Admin
                </button>
              )}
            </nav>
          </div>
        </div>
        <div className="page">
          <ToastStack toasts={toasts} onDismiss={dismissToast} />
          {view === "home" && (
            <HomeDashboard
              jobs={jobs}
              records={records}
              toolLibrary={toolLibrary}
              pendingImports={pendingImportCount}
              currentRole={currentRole}
              onJumpTo={handleJumpToView}
            />
          )}
          {view === "operator" && (
            <OperatorView
              parts={parts}
              jobs={jobs}
              toolLibrary={toolLibrary}
              onSubmit={handleSubmit}
              onDraft={handleDraft}
              currentUserId={currentUserId}
              currentRole={currentRole}
              onLockJob={handleLockJob}
              onUnlockJob={handleUnlockJob}
              onRefreshData={reloadLiveData}
              dataStatus={dataStatus}
              usersById={usersById}
            />
          )}
          {view === "records" && (
            <AdminRecords
              records={records}
              parts={parts}
              toolLibrary={toolLibrary}
              usersById={usersById}
              loadRecordDetail={loadRecordDetail}
              canEdit={canEditRecords}
              onEditValue={handleEditRecordValue}
              focusRecordId={searchDeepLink?.view === "records" ? searchDeepLink?.recordId : null}
              dataStatus={dataStatus}
            />
          )}
          {view === "admin" && (
            <AdminView
              parts={parts}
              jobs={jobs}
              records={records}
              toolLibrary={toolLibrary}
              toolLocations={toolLocations}
              users={users}
              usersById={usersById}
              currentCaps={currentCaps}
              roleCaps={roleCaps}
              currentRole={currentRole}
              currentUserId={currentUserId}
              dataStatus={dataStatus}
              loadRecordDetail={loadRecordDetail}
              onEditValue={handleEditRecordValue}
              onCreateJob={handleCreateJob}
              onCreatePart={handleCreatePart}
              onUpdatePart={handleUpdatePart}
              onBulkUpdateParts={handleBulkUpdateParts}
              onCreateOp={handleCreateOp}
              onCreateDim={handleCreateDim}
              onUpdateDim={handleUpdateDim}
              onRemoveDim={handleRemoveDim}
              onCreateTool={handleCreateTool}
              onUpdateTool={handleUpdateTool}
              onCreateToolLocation={handleCreateToolLocation}
              onUpdateToolLocation={handleUpdateToolLocation}
              onRemoveToolLocation={handleRemoveToolLocation}
              onCreateUser={handleCreateUser}
              onUpdateUser={handleUpdateUser}
              onRemoveUser={handleRemoveUser}
              onUpdateRoleCaps={handleUpdateRoleCaps}
              onUnlockJob={handleUnlockJob}
              onRefreshData={reloadLiveData}
              searchDeepLink={searchDeepLink}
              initialTab={adminTab}
              onTabChange={setAdminTab}
            />
          )}
        </div>
      </>
    </ErrorBoundary>
  );
}

