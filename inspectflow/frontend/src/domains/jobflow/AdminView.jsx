import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import FaiWorkflow from "../fai/FaiWorkflow.jsx";
import CollectorApp from "../collector/CollectorApp.jsx";
import FormBuilderApp from "../formbuilder/FormBuilderApp.jsx";
import AdminTools from "./AdminTools.jsx";
import AdminUsers from "./AdminUsers.jsx";
import AdminAnalytics from "./AdminAnalytics.jsx";
import AdminJobs from "./AdminJobs.jsx";
import AdminRecords from "./AdminRecords.jsx";
import AdminNcr from "./AdminNcr.jsx";
import AdminCapa from "./AdminCapa.jsx";
import AdminQmsExpansion from "./AdminQmsExpansion.jsx";
import AdminIssueReports from "./AdminIssueReports.jsx";
import AdminComplianceViewer from "./AdminComplianceViewer.jsx";
import AdminImports from "./AdminImports.jsx";
import AdminParts from "./AdminParts.jsx";
import AdminRoles from "./AdminRoles.jsx";
import AdminEntitlements from "./AdminEntitlements.jsx";

export default function AdminView({
  parts,
  jobs,
  records,
  toolLibrary,
  toolLocations,
  users,
  usersById,
  currentCaps,
  roleCaps,
  currentRole,
  currentUserId,
  dataStatus,
  loadRecordDetail,
  onEditValue,
  onCreateJob,
  onCreatePart,
  onUpdatePart,
  onBulkUpdateParts,
  onCreateOp,
  onCreateDim,
  onUpdateDim,
  onRemoveDim,
  onCreateTool,
  onUpdateTool,
  onCreateToolLocation,
  onUpdateToolLocation,
  onRemoveToolLocation,
  onCreateUser,
  onUpdateUser,
  onRemoveUser,
  onUpdateRoleCaps,
  onUnlockJob,
  onRefreshData,
  searchDeepLink = null,
  initialTab = "jobs",
  onTabChange = null
}) {
  const [tab, setTab] = useState(initialTab || "jobs");
  const [dirtyByTab, setDirtyByTab] = useState({});
  const hasCap = (cap) => (currentCaps || []).includes(cap);
  const canEdit = hasCap("edit_records");
  const canManageParts = hasCap("manage_parts");
  const canManageTools = hasCap("manage_tools");
  const canManageUsers = hasCap("manage_users");
  const canManageRoles = hasCap("manage_roles");
  const canManageEntitlements = hasCap("manage_roles");
  const canViewJobs = hasCap("view_jobs") || hasCap("manage_jobs");
  const canViewRecords = hasCap("view_records");
  const canManageJobs = hasCap("manage_jobs");
  const canViewAdmin = hasCap("view_admin");
  const canViewFai = canViewAdmin;
  const canViewAnalytics = canViewAdmin;
  const canViewIssueReports = hasCap("view_admin");
  const canViewNcr = canViewIssueReports;
  const canViewCapa = canViewIssueReports;
  const canViewQmsExpansion = canViewIssueReports;
  const canViewCompliance = canViewIssueReports || canViewRecords;
  const canViewImports = canManageParts || canManageTools || canManageJobs;
  const canViewCollectors = canViewAdmin || canViewRecords;
  const canViewFormBuilder = canViewAdmin;
  useEffect(() => {
    if (initialTab && initialTab !== tab) {
      setTab(initialTab);
    }
  }, [initialTab]);
  useEffect(() => {
    let fallback = null;
    if (!canViewAdmin) fallback = "jobs";
    if (!canManageUsers && tab === "users") fallback = "jobs";
    if (!canManageParts && tab === "parts") fallback = "jobs";
    if (!canManageTools && tab === "tools") fallback = "jobs";
    if (!canManageRoles && tab === "roles") fallback = "jobs";
    if (!canManageEntitlements && tab === "entitlements") fallback = "jobs";
    if (!canViewIssueReports && tab === "issues") fallback = "jobs";
    if (!canViewNcr && tab === "ncr") fallback = "jobs";
    if (!canViewCapa && tab === "capa") fallback = "jobs";
    if (!canViewQmsExpansion && tab === "qms-expansion") fallback = "jobs";
    if (!canViewCompliance && tab === "compliance") fallback = "jobs";
    if (!canViewImports && tab === "imports") fallback = "jobs";
    if (!canViewFai && tab === "fai") fallback = "jobs";
    if (!canViewCollectors && tab === "collectors") fallback = "jobs";
    if (!canViewFormBuilder && tab === "form-builder") fallback = "jobs";
    if (!canViewAnalytics && tab === "analytics") fallback = "jobs";
    if (fallback) {
      setTab(fallback);
      onTabChange?.(fallback);
    }
  }, [
    canViewAdmin,
    canManageUsers,
    canManageParts,
    canManageTools,
    canManageRoles,
    canManageEntitlements,
    canViewIssueReports,
    canViewNcr,
    canViewCapa,
    canViewQmsExpansion,
    canViewCompliance,
    canViewImports,
    canViewFai,
    canViewAnalytics,
    tab
  ]);
  useEffect(() => {
    const dirty = !!dirtyByTab[tab];
    const handler = (e) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyByTab, tab]);
  useEffect(() => {
    const nextTab = String(searchDeepLink?.adminTab || "").trim();
    if (!nextTab) return;
    if (nextTab === "records" && canViewRecords) {
      setTab("records");
      return;
    }
    if (nextTab === "issues" && canViewIssueReports) {
      setTab("issues");
      return;
    }
    if (nextTab === "ncr" && canViewNcr) {
      setTab("ncr");
      return;
    }
    if (nextTab === "capa" && canViewCapa) {
      setTab("capa");
      return;
    }
    if (nextTab === "qms-expansion" && canViewQmsExpansion) {
      setTab("qms-expansion");
      return;
    }
    if (nextTab === "jobs" && canViewJobs) {
      setTab("jobs");
      return;
    }
    if (nextTab === "tools" && canManageTools) {
      setTab("tools");
      return;
    }
    if (nextTab === "users" && canManageUsers) {
      setTab("users");
      return;
    }
  }, [
    searchDeepLink?.nonce,
    searchDeepLink?.adminTab,
    canViewRecords,
    canViewIssueReports,
    canViewNcr,
    canViewCapa,
    canViewQmsExpansion,
    canViewJobs,
    canManageTools,
    canManageUsers
  ]);
  function setTabSafe(next) {
    if (next === tab) return;
    if (
      dirtyByTab[tab] &&
      !window.confirm("You have unsaved changes. Leave this page without saving?")
    )
      return;
    setTab(next);
    onTabChange?.(next);
  }
  const navGroups = [
    {
      title: "Operations",
      items: [
        canViewJobs ? { key: "jobs", label: "Job Management" } : null,
        canViewRecords ? { key: "records", label: "Inspection Records" } : null,
        canViewCompliance ? { key: "compliance", label: "Compliance Viewer" } : null,
        canViewIssueReports ? { key: "issues", label: "Issue Reports" } : null,
        canViewNcr ? { key: "ncr", label: "NCR" } : null,
        canViewCapa ? { key: "capa", label: "CAPA" } : null,
        canViewQmsExpansion ? { key: "qms-expansion", label: "QMS Expansion" } : null,
        canViewFai ? { key: "fai", label: "FAI Workflow" } : null,
        canViewImports ? { key: "imports", label: "Data Imports" } : null,
        canViewCollectors ? { key: "collectors", label: "Collectors (IoT)" } : null,
        canViewFormBuilder ? { key: "form-builder", label: "Form Builder" } : null
      ].filter(Boolean)
    },
    {
      title: "Parts & Setup",
      items: [
        canManageParts ? { key: "parts", label: "Part / Op Setup" } : null,
        canViewAnalytics ? { key: "analytics", label: "Analytics" } : null
      ].filter(Boolean)
    },
    {
      title: "Tools & Calibration",
      items: [canManageTools ? { key: "tools", label: "Tool Library" } : null].filter(Boolean)
    },
    {
      title: "Users & System",
      items: [
        canManageUsers ? { key: "users", label: "Users" } : null,
        canManageRoles ? { key: "roles", label: "Roles" } : null,
        canManageEntitlements ? { key: "entitlements", label: "Entitlements" } : null
      ].filter(Boolean)
    }
  ].filter((group) => group.items.length > 0);
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar" aria-label="Admin Sections">
        {navGroups.map((group) => (
          <div className="admin-nav-group" key={group.title}>
            <p className="admin-nav-title">{group.title}</p>
            {group.items.map((item) => (
              <button
                key={item.key}
                className={`admin-nav-btn ${tab === item.key ? "active" : ""}`}
                onClick={() => setTabSafe(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </aside>
      <div className="admin-main">
        <div className="text-muted" style={{ marginBottom: ".65rem" }}>
          Admin / {navGroups.flatMap((g) => g.items).find((i) => i.key === tab)?.label || "Section"}
        </div>

        {tab === "jobs" && canViewJobs && (
          <AdminJobs
            parts={parts}
            jobs={jobs}
            usersById={usersById}
            onCreateJob={onCreateJob}
            canManageJobs={canManageJobs}
            onUnlockJob={onUnlockJob}
            dataStatus={dataStatus}
          />
        )}
        {tab === "records" && canViewRecords && (
          <AdminRecords
            records={records}
            parts={parts}
            toolLibrary={toolLibrary}
            usersById={usersById}
            loadRecordDetail={loadRecordDetail}
            canEdit={canEdit}
            currentUserId={currentUserId}
            currentRole={currentRole}
            onEditValue={onEditValue}
            onRefreshData={onRefreshData}
            focusRecordId={searchDeepLink?.recordId || null}
            dataStatus={dataStatus}
          />
        )}
        {tab === "issues" && canViewIssueReports && (
          <AdminIssueReports currentRole={currentRole} currentUserId={currentUserId} />
        )}
        {tab === "ncr" && canViewNcr && (
          <AdminNcr currentRole={currentRole} currentUserId={currentUserId} />
        )}
        {tab === "capa" && canViewCapa && <AdminCapa currentRole={currentRole} />}
        {tab === "qms-expansion" && canViewQmsExpansion && (
          <AdminQmsExpansion currentRole={currentRole} />
        )}
        {tab === "compliance" && canViewCompliance && (
          <AdminComplianceViewer currentRole={currentRole} />
        )}
        {tab === "fai" && canViewFai && (
          <FaiWorkflow
            parts={parts}
            jobs={jobs}
            usersById={usersById}
            currentUserId={currentUserId}
            currentRole={currentRole}
            dataStatus={dataStatus}
          />
        )}
        {tab === "collectors" && canViewCollectors && (
          <CollectorApp role={currentRole} />
        )}
        {tab === "form-builder" && canViewFormBuilder && (
          <FormBuilderApp role={currentRole} />
        )}
        {tab === "imports" && canViewImports && (
          <AdminImports
            currentRole={currentRole}
            canManageTools={canManageTools}
            canManageParts={canManageParts}
            canManageJobs={canManageJobs}
            onRefreshData={onRefreshData}
          />
        )}
        {tab === "analytics" && canViewAnalytics && (
          <AdminAnalytics parts={parts} currentRole={currentRole} canViewAdmin={canViewAdmin} />
        )}
        {tab === "parts" && canManageParts && (
          <AdminParts
            parts={parts}
            toolLibrary={toolLibrary}
            currentRole={currentRole}
            dataStatus={dataStatus}
            onCreatePart={onCreatePart}
            onUpdatePart={onUpdatePart}
            onBulkUpdateParts={onBulkUpdateParts}
            onCreateOp={onCreateOp}
            onCreateDim={onCreateDim}
            onUpdateDim={onUpdateDim}
            onRemoveDim={onRemoveDim}
            onDirtyChange={(dirty) => setDirtyByTab((p) => ({ ...p, parts: dirty }))}
          />
        )}
        {tab === "tools" && canManageTools && (
          <AdminTools
            toolLibrary={toolLibrary}
            toolLocations={toolLocations}
            onCreateTool={onCreateTool}
            onUpdateTool={onUpdateTool}
            onCreateToolLocation={onCreateToolLocation}
            onRemoveToolLocation={onRemoveToolLocation}
            dataStatus={dataStatus}
          />
        )}
        {tab === "users" && canManageUsers && (
          <AdminUsers
            users={users}
            roleCaps={roleCaps}
            onCreateUser={onCreateUser}
            onUpdateUser={onUpdateUser}
            onRemoveUser={onRemoveUser}
            onDirtyChange={(dirty) => setDirtyByTab((p) => ({ ...p, users: dirty }))}
          />
        )}
        {tab === "roles" && canManageRoles && (
          <AdminRoles
            roleCaps={roleCaps}
            onUpdateRoleCaps={onUpdateRoleCaps}
            onDirtyChange={(dirty) => setDirtyByTab((p) => ({ ...p, roles: dirty }))}
          />
        )}
        {tab === "entitlements" && canManageEntitlements && (
          <AdminEntitlements currentRole={currentRole} />
        )}
      </div>
    </div>
  );
}

