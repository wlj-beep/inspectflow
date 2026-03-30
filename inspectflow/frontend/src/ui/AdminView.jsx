import React, { useState, useEffect } from "react";
import { ADMIN_TAB_GROUPS } from "./navigation.js";
import { AdminTools } from "./AdminTools.jsx";
import { AdminUsers } from "./AdminUsers.jsx";
import { AdminRoles } from "./AdminRoles.jsx";
import { AdminJobs } from "./AdminJobs.jsx";
import { AdminRecords } from "./AdminRecords.jsx";
import { AdminIssueReports } from "./AdminIssueReports.jsx";
import { AdminImports } from "./AdminImports.jsx";
import { AdminParts } from "./AdminParts.jsx";

export function AdminView({ parts, jobs, records, toolLibrary, toolLocations, users, usersById, currentCaps, roleCaps, currentRole, currentUserId, adminTab, onAdminTabChange, loadRecordDetail, onEditValue, onCreateJob, onCreatePart, onUpdatePart, onBulkUpdateParts, onCreateOp, onCreateDim, onUpdateDim, onRemoveDim, onCreateTool, onUpdateTool, onCreateToolLocation, onUpdateToolLocation, onRemoveToolLocation, onCreateUser, onUpdateUser, onRemoveUser, onUpdateRoleCaps, onUnlockJob, onRefreshData }) {
  const [tabState,setTabState]=useState(adminTab || "jobs");
  const [dirtyByTab,setDirtyByTab]=useState({});
  const tab = adminTab || tabState;
  function commitTab(next){
    if(onAdminTabChange){
      onAdminTabChange(next);
      return;
    }
    setTabState(next);
  }
  const hasCap = cap => (currentCaps || []).includes(cap);
  const canEdit=hasCap("edit_records");
  const canManageParts=hasCap("manage_parts");
  const canManageTools=hasCap("manage_tools");
  const canManageUsers=hasCap("manage_users");
  const canManageRoles=hasCap("manage_roles");
  const canViewJobs=hasCap("view_jobs") || hasCap("manage_jobs");
  const canViewRecords=hasCap("view_records");
  const canManageJobs=hasCap("manage_jobs");
  const canViewAdmin=hasCap("view_admin");
  const canViewIssueReports=hasCap("view_admin");
  const canViewImports=canManageParts || canManageTools || canManageJobs;
  const tabLabels = {
    jobs: "Job Management",
    records: "Inspection Records",
    issues: "Issue Reports",
    imports: "Data Imports",
    parts: "Part / Op Setup",
    tools: "Tool Library",
    users: "Users",
    roles: "Roles"
  };
  const visibleTabs = new Set();
  if(canViewJobs) visibleTabs.add("jobs");
  if(canViewRecords) visibleTabs.add("records");
  if(canViewIssueReports) visibleTabs.add("issues");
  if(canViewImports) visibleTabs.add("imports");
  if(canManageParts) visibleTabs.add("parts");
  if(canManageTools) visibleTabs.add("tools");
  if(canManageUsers) visibleTabs.add("users");
  if(canManageRoles) visibleTabs.add("roles");
  const defaultTab = [...visibleTabs][0] || "jobs";
  useEffect(()=>{
    if(!canViewAdmin || !visibleTabs.has(tab)){
      commitTab(defaultTab);
    }
  },[canViewAdmin,defaultTab,tab,canViewJobs,canViewRecords,canViewIssueReports,canViewImports,canManageParts,canManageTools,canManageUsers,canManageRoles]);
  useEffect(()=>{
    const dirty=!!dirtyByTab[tab];
    const handler=e=>{
      if(!dirty) return;
      e.preventDefault();
      e.returnValue="";
    };
    window.addEventListener("beforeunload",handler);
    return ()=>window.removeEventListener("beforeunload",handler);
  },[dirtyByTab,tab]);
  function setTabSafe(next){
    if(next===tab) return;
    if(dirtyByTab[tab] && !window.confirm("You have unsaved changes. Leave this page without saving?")) return;
    commitTab(next);
  }
  const groupedTabs = ADMIN_TAB_GROUPS
    .map(group=>({
      ...group,
      tabs:group.tabs.filter(tabId=>visibleTabs.has(tabId))
    }))
    .filter(group=>group.tabs.length>0);
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        {groupedTabs.map(group=>(
          <div key={group.label} className="admin-sidebar-group">
            <div className="admin-sidebar-label">{group.label}</div>
            {group.tabs.map(tabId=>(
              <button
                key={tabId}
                className={`admin-side-btn ${tab===tabId?"active":""}`}
                onClick={()=>setTabSafe(tabId)}
              >
                {tabLabels[tabId] || tabId}
              </button>
            ))}
          </div>
        ))}
      </aside>
      <div className="admin-main">
        <div className="sub-tabs">
          {visibleTabs.has(tab) && <button className="sub-tab active">{tabLabels[tab] || tab}</button>}
        </div>
        {tab==="jobs"&&canViewJobs&&<AdminJobs parts={parts} jobs={jobs} usersById={usersById} onCreateJob={onCreateJob} canManageJobs={canManageJobs} onUnlockJob={onUnlockJob}/>}
        {tab==="records"&&canViewRecords&&<AdminRecords records={records} parts={parts} toolLibrary={toolLibrary} usersById={usersById} loadRecordDetail={loadRecordDetail} canEdit={canEdit} onEditValue={onEditValue}/>}
        {tab==="issues"&&canViewIssueReports&&<AdminIssueReports currentRole={currentRole} currentUserId={currentUserId}/>}
        {tab==="imports"&&canViewImports&&<AdminImports currentRole={currentRole} canManageTools={canManageTools} canManageParts={canManageParts} canManageJobs={canManageJobs} onRefreshData={onRefreshData}/>}
        {tab==="parts"&&canManageParts&&<AdminParts parts={parts} toolLibrary={toolLibrary} onCreatePart={onCreatePart} onUpdatePart={onUpdatePart} onBulkUpdateParts={onBulkUpdateParts} onCreateOp={onCreateOp} onCreateDim={onCreateDim} onUpdateDim={onUpdateDim} onRemoveDim={onRemoveDim} onDirtyChange={dirty=>setDirtyByTab(p=>({...p,parts:dirty}))}/>}
        {tab==="tools"&&canManageTools&&<AdminTools toolLibrary={toolLibrary} toolLocations={toolLocations} onCreateTool={onCreateTool} onUpdateTool={onUpdateTool} onCreateToolLocation={onCreateToolLocation} onUpdateToolLocation={onUpdateToolLocation} onRemoveToolLocation={onRemoveToolLocation}/>}
        {tab==="users"&&canManageUsers&&<AdminUsers users={users} roleCaps={roleCaps} onCreateUser={onCreateUser} onUpdateUser={onUpdateUser} onRemoveUser={onRemoveUser} onDirtyChange={dirty=>setDirtyByTab(p=>({...p,users:dirty}))}/>}
        {tab==="roles"&&canManageRoles&&<AdminRoles roleCaps={roleCaps} onUpdateRoleCaps={onUpdateRoleCaps} onDirtyChange={dirty=>setDirtyByTab(p=>({...p,roles:dirty}))}/>}
      </div>
    </div>
  );
}
