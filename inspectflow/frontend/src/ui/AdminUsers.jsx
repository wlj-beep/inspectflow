import React, { useState, useEffect } from "react";
import { ConfirmDialog } from "./confirmDialog.jsx";
import { CAPABILITY_DEFS } from "../domains/jobflow/constants.js";

export function AdminUsers({ users, roleCaps, onCreateUser, onUpdateUser, onRemoveUser, onDirtyChange }) {
  const [form,setForm]=useState({name:"",role:"Operator",active:true});
  const [err,setErr]=useState("");
  const [apiErr,setApiErr]=useState("");
  const [saving,setSaving]=useState(false);
  const [savingAll,setSavingAll]=useState(false);
  const [edits,setEdits]=useState({});
  const [pendingRemoveUser,setPendingRemoveUser]=useState(null);
  async function handleAdd(){
    if(!form.name.trim()){setErr("Name required.");return;}
    setErr("");setApiErr("");setSaving(true);
    try{
      await onCreateUser({name:form.name.trim(),role:form.role,active:form.active});
      setForm({name:"",role:"Operator",active:true});
    }catch(e){
      setApiErr(e?.message||"Unable to add user.");
    }finally{
      setSaving(false);
    }
  }
  function editFor(u){ return edits[u.id] || { name:u.name, role:u.role, active:u.active!==false }; }
  function editForId(id){
    const u=users.find(x=>String(x.id)===String(id));
    if(u) return editFor(u);
    return edits[id] || { name:"", role:"Operator", active:true };
  }
  function updateEdit(id, patch){
    const next={...editForId(id),...patch};
    const u=users.find(x=>String(x.id)===String(id));
    if(u && next.name===u.name && next.role===u.role && (next.active!==false)===(u.active!==false)){
      setEdits(p=>{const n={...p};delete n[id];return n;});
      return;
    }
    setEdits(p=>({...p,[id]:next}));
  }
  async function handleSaveAll(){
    const ids=Object.keys(edits);
    if(ids.length===0) return;
    setApiErr("");setSavingAll(true);
    try{
      for(const id of ids){
        const v=editForId(id);
        await onUpdateUser(id, {name:v.name, role:v.role, active:v.active});
      }
      setEdits({});
    }catch(e){
      setApiErr(e?.message||"Unable to update users.");
    }finally{
      setSavingAll(false);
    }
  }
  function handleDiscardAll(){ setEdits({}); }
  async function handleRemove(id){
    setApiErr("");
    try{
      await onRemoveUser(id);
    }catch(e){
      setApiErr(e?.message||"Unable to remove user.");
    }
  }
  useEffect(()=>{
    if(onDirtyChange) onDirtyChange(Object.keys(edits).length>0);
  },[edits,onDirtyChange]);
  const orderedRoles=["Operator","Quality","Supervisor","Admin"];
  function roleSummary(role){
    const caps=(roleCaps?.[role]||[]).slice();
    if(!caps.length) return "No permissions assigned.";
    const labels=caps
      .map(cap=>CAPABILITY_DEFS.find(c=>c.key===cap)?.label || cap.replace(/_/g," "))
      .sort((a,b)=>a.localeCompare(b));
    const viewCount=caps.filter(c=>c.startsWith("view_")).length;
    const manageCount=caps.filter(c=>c.startsWith("manage_")).length;
    const highlights=[
      viewCount ? `${viewCount} view` : "",
      manageCount ? `${manageCount} manage` : "",
      caps.includes("submit_records") ? "submit records" : "",
      caps.includes("edit_records") ? "edit records" : ""
    ].filter(Boolean).join(" · ");
    return `${highlights ? `${highlights} | ` : ""}${labels.join(", ")}`;
  }
  return (
    <div>
      <ConfirmDialog
        open={!!pendingRemoveUser}
        title="Remove User"
        message={`Remove user \"${pendingRemoveUser?.name || ""}\"? This action cannot be undone.`}
        confirmLabel="Remove User"
        cancelLabel="Cancel"
        danger
        onCancel={()=>setPendingRemoveUser(null)}
        onConfirm={async ()=>{
          const target=pendingRemoveUser;
          setPendingRemoveUser(null);
          if(target?.id!=null){
            await handleRemove(target.id);
          }
        }}
      />
      <div className="card">
        <div className="card-head" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"1rem"}}>
          <div className="card-title">Add New User</div>
          <div className="gap1">
            <button className="btn btn-ghost btn-sm" disabled={savingAll||Object.keys(edits).length===0} onClick={handleDiscardAll}>Discard Changes</button>
            <button className="btn btn-primary btn-sm" disabled={savingAll||Object.keys(edits).length===0} onClick={handleSaveAll}>
              {savingAll?"Saving…":"Save All"}
            </button>
          </div>
        </div>
        <div className="card-body">
          {Object.keys(edits).length>0&&(
            <div className="banner warn" style={{marginBottom:".75rem"}}>
              You have unsaved changes. Save All or Discard Changes before leaving this page.
            </div>
          )}
          <div className="row3">
            <div className="field"><label>Name</label><input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Alex Rivera"/></div>
            <div className="field"><label>Role</label>
              <select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))}>
                <option>Operator</option><option>Quality</option><option>Supervisor</option><option>Admin</option>
              </select></div>
            <div className="field" style={{display:"flex",alignItems:"center",gap:".5rem"}}>
              <label style={{marginTop:"1.25rem"}}><input type="checkbox" checked={form.active} onChange={e=>setForm(p=>({...p,active:e.target.checked}))}/> Active</label>
            </div>
          </div>
          {err&&<p className="err-text mt1">{err}</p>}
          {apiErr&&<p className="err-text mt1">{apiErr}</p>}
          <div className="mt2"><button className="btn btn-primary" disabled={saving} onClick={handleAdd}>{saving?"Saving…":"+ Add User"}</button></div>
        </div>
      </div>
      <div className="card" style={{padding:0,overflow:"hidden"}}>
        <div className="card-head"><div className="card-title">Users</div></div>
        <table className="data-table">
          <thead><tr><th>Name</th><th>Role</th><th>Active</th><th style={{width:"60px"}}></th></tr></thead>
          <tbody>
            {users.length===0&&<tr><td colSpan={4}><div className="empty-state">No users found.</div></td></tr>}
            {users.map(u=>{
              const v=editFor(u);
              return (
                <tr key={u.id}>
                  <td><input value={v.name} onChange={e=>updateEdit(u.id,{name:e.target.value})} /></td>
                  <td>
                    <select value={v.role} onChange={e=>updateEdit(u.id,{role:e.target.value})}>
                      <option>Operator</option><option>Quality</option><option>Supervisor</option><option>Admin</option>
                    </select>
                  </td>
                  <td>
                    <input type="checkbox" checked={v.active} onChange={e=>updateEdit(u.id,{active:e.target.checked})}/>
                  </td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={()=>setPendingRemoveUser({ id:u.id, name:u.name })}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="card-body" style={{paddingTop:".75rem"}}>
          <div className="section-label" style={{marginBottom:".35rem"}}>Role Permissions (Live)</div>
          <div className="text-muted" style={{fontSize:".78rem",lineHeight:1.5}}>
            {orderedRoles.map(role=>(
              <div key={role}>
                <strong style={{color:"var(--text)"}}>{role}</strong>: {roleSummary(role)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
