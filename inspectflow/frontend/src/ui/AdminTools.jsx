import React, { useState } from "react";
import { ConfirmDialog } from "./confirmDialog.jsx";
import { TypeBadge } from "./sharedWidgets.jsx";
import { TOOL_TYPES, COMMON_TOOL_TEMPLATES } from "./adminConstants.js";
import { isToolSelectable } from "./appHelpers.js";
import { validateToolField } from "./fieldValidation.js";

export function AdminTools({ toolLibrary, toolLocations, onCreateTool, onUpdateTool, onCreateToolLocation, onUpdateToolLocation, onRemoveToolLocation }) {
  const empty={name:"",type:"Variable",itNum:"",size:"",calibrationDueDate:"",currentLocationId:"",homeLocationId:"",active:true,visible:true};
  const [form,setForm]=useState(empty);
  const [locationForm,setLocationForm]=useState({ name:"", locationType:"machine" });
  const [err,setErr]=useState("");
  const [apiErr,setApiErr]=useState("");
  const [locErr,setLocErr]=useState("");
  const [saving,setSaving]=useState(false);
  const [savingId,setSavingId]=useState("");
  const [search,setSearch]=useState("");
  const [tf,setTf]=useState("All");
  const [pendingRemoveLocation,setPendingRemoveLocation]=useState(null);

  async function handleAdd(){
    if(!form.name.trim()||!form.itNum.trim()){setErr("Name and IT # required.");return;}
    setErr("");setApiErr("");setSaving(true);
    try{
      await onCreateTool({
        name:form.name.trim(),
        type:form.type,
        itNum:form.itNum.trim().toUpperCase(),
        size:form.size.trim(),
        calibrationDueDate:form.calibrationDueDate || null,
        currentLocationId:form.currentLocationId ? Number(form.currentLocationId) : null,
        homeLocationId:form.homeLocationId ? Number(form.homeLocationId) : null,
        active:form.active!==false,
        visible:form.visible!==false
      });
      setForm(empty);
    }catch(e){
      setApiErr(e?.message||"Unable to add tool.");
    }finally{
      setSaving(false);
    }
  }
  async function handleToggle(id, patch){
    setApiErr("");
    setSavingId(String(id));
    try{
      await onUpdateTool(id, patch);
    }catch(e){
      if(e?.message==="tool_in_open_job"){
        setApiErr("Tool is referenced by an open or draft job. Close the job before deactivating.");
      }else{
        setApiErr(e?.message||"Unable to update tool.");
      }
    }finally{
      setSavingId("");
    }
  }
  async function handleAddLocation(){
    if(!locationForm.name.trim()){ setLocErr("Location name required."); return; }
    setLocErr("");
    try{
      await onCreateToolLocation({ name:locationForm.name.trim(), locationType:locationForm.locationType });
      setLocationForm({ name:"", locationType:"machine" });
    }catch(e){
      setLocErr(e?.message || "Unable to create location.");
    }
  }
  async function handleRemoveLocation(id){
    setLocErr("");
    try{
      await onRemoveToolLocation(id);
    }catch(e){
      if(e?.message==="location_in_use"){
        setLocErr("Location is in use by one or more tools.");
      }else{
        setLocErr(e?.message || "Unable to remove location.");
      }
    }
  }
  const filtered=Object.values(toolLibrary).filter(t=>{
    const hay=[t.name,t.itNum,t.size,t.currentLocationName,t.homeLocationName].filter(Boolean).join(" ").toLowerCase();
    const ms=!search||hay.includes(search.toLowerCase());
    return ms&&(tf==="All"||t.type===tf);
  });
  const locationTypes=["machine","user","job","vendor","out_for_calibration"];
  return (
    <div>
      <ConfirmDialog
        open={!!pendingRemoveLocation}
        title="Remove Location"
        message={`Remove location \"${pendingRemoveLocation?.name || ""}\"? This can impact tool assignments.`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        danger
        onCancel={()=>setPendingRemoveLocation(null)}
        onConfirm={async ()=>{
          const target=pendingRemoveLocation;
          setPendingRemoveLocation(null);
          if(target?.id!=null){
            await handleRemoveLocation(target.id);
          }
        }}
      />
      <div className="card">
        <div className="card-head"><div className="card-title">Location Master Data</div></div>
        <div className="card-body">
          <div className="row3">
            <div className="field"><label>Location Name</label><input value={locationForm.name} onChange={e=>setLocationForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Machine Cell C"/></div>
            <div className="field"><label>Location Type</label>
              <select value={locationForm.locationType} onChange={e=>setLocationForm(p=>({...p,locationType:e.target.value}))}>
                {locationTypes.map(type=><option key={type} value={type}>{type}</option>)}
              </select></div>
            <div className="field" style={{justifyContent:"flex-end"}}>
              <button className="btn btn-ghost" onClick={handleAddLocation}>+ Add Location</button>
            </div>
          </div>
          {locErr&&<p className="err-text mt1">{locErr}</p>}
          <div className="mt1" style={{display:"grid",gap:".35rem"}}>
            {toolLocations.length===0 && <div className="text-muted">No locations configured.</div>}
            {toolLocations.map(loc=>(
              <div key={loc.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:".75rem",padding:".3rem .45rem",border:"1px solid var(--border2)",borderRadius:"2px"}}>
                <div>
                  <span style={{fontWeight:600}}>{loc.name}</span>
                  <span className="text-muted" style={{marginLeft:".5rem",fontSize:".72rem"}}>{loc.locationType}</span>
                </div>
                <button className="btn btn-danger btn-sm" onClick={()=>setPendingRemoveLocation({ id:loc.id, name:loc.name })}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><div className="card-title">Add New Tool</div></div>
        <div className="card-body">
          <div className="row3">
            <div className="field"><label>Tool Name</label><input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} onBlur={e=>setErr(validateToolField("name", e.target.value))} placeholder="e.g. Outside Micrometer"/></div>
            <div className="field"><label>Tool Type</label>
              <select value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
                {TOOL_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select></div>
            <div className="field"><label>IT # / Cal. Number</label>
              <input value={form.itNum} onChange={e=>setForm(p=>({...p,itNum:e.target.value.toUpperCase()}))} onBlur={e=>setErr(validateToolField("itNum", e.target.value))} placeholder="IT-0099" style={{fontFamily:"var(--mono)"}}/>
              <div className="help-inline">Use format `IT-####` for controlled calibration identifiers.</div>
            </div>
          </div>
          <div className="row3 mt1">
            <div className="field"><label>Size</label>
              <input value={form.size} onChange={e=>setForm(p=>({...p,size:e.target.value}))} placeholder='e.g. 0-6 in' style={{fontFamily:"var(--mono)"}}/></div>
            <div className="field"><label>Calibration Due Date</label>
              <input type="date" value={form.calibrationDueDate||""} onChange={e=>setForm(p=>({...p,calibrationDueDate:e.target.value}))}/></div>
            <div className="field"><label>Home Location</label>
              <select value={form.homeLocationId} onChange={e=>setForm(p=>({...p,homeLocationId:e.target.value}))}>
                <option value="">— None —</option>
                {toolLocations.map(loc=><option key={loc.id} value={String(loc.id)}>{loc.name} ({loc.locationType})</option>)}
              </select></div>
          </div>
          <div className="row3 mt1">
            <div className="field"><label>Current Location</label>
              <select value={form.currentLocationId} onChange={e=>setForm(p=>({...p,currentLocationId:e.target.value}))}>
                <option value="">— None —</option>
                {toolLocations.map(loc=><option key={loc.id} value={String(loc.id)}>{loc.name} ({loc.locationType})</option>)}
              </select></div>
            <div className="field" style={{display:"flex",gap:"1.25rem",alignItems:"flex-end"}}>
              <label style={{display:"flex",alignItems:"center",gap:".5rem",fontSize:".85rem"}}>
                <input type="checkbox" checked={form.active!==false} onChange={e=>setForm(p=>({...p,active:e.target.checked}))}/>
                Active
              </label>
              <label style={{display:"flex",alignItems:"center",gap:".5rem",fontSize:".85rem"}}>
                <input type="checkbox" checked={form.visible!==false} onChange={e=>setForm(p=>({...p,visible:e.target.checked}))}/>
                Selectable
              </label>
            </div>
          </div>
          <div className="mt1">
            <div className="text-muted" style={{fontSize:".7rem",marginBottom:".35rem"}}>Common tool templates</div>
            <div className="gap1" style={{flexWrap:"wrap"}}>
              {COMMON_TOOL_TEMPLATES.map(t=>(
                <button key={t.name} className="btn btn-ghost btn-xs" onClick={()=>setForm(p=>({...p,name:t.name,type:t.type}))}>{t.name}</button>
              ))}
            </div>
          </div>
          {err&&<p className="err-text mt1">{err}</p>}
          {apiErr&&<p className="err-text mt1">{apiErr}</p>}
          <div className="mt2"><button className="btn btn-primary" disabled={saving} onClick={handleAdd}>{saving?"Saving…":"+ Add Tool"}</button></div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><div className="card-title">Tool Library</div><div className="text-muted" style={{fontSize:".7rem"}}>{Object.keys(toolLibrary).length} tools</div></div>
        <div className="card-body" style={{paddingBottom:".5rem"}}>
          <div className="row2" style={{gap:".75rem",marginBottom:".75rem"}}>
            <input className="search-inp" placeholder="Search by name, IT #, or location…" value={search} onChange={e=>setSearch(e.target.value)}/>
            <div style={{display:"flex",gap:".35rem",flexWrap:"wrap"}}>
              {["All",...TOOL_TYPES].map(t=><button key={t} className={`tpf-btn${tf===t?" on":""}`} onClick={()=>setTf(t)}>{t}</button>)}
            </div>
          </div>
        </div>
        <table className="data-table">
          <thead><tr><th>Tool Name</th><th>Type</th><th>IT #</th><th>Cal Due</th><th>Current Location</th><th>Home Location</th><th>Size</th><th style={{width:"110px"}}>Active</th><th style={{width:"120px"}}>Selectable</th></tr></thead>
          <tbody>
            {filtered.length===0&&<tr><td colSpan={9}><div className="empty-state">No tools match.</div></td></tr>}
            {filtered.map(t=>(
              <tr key={t.id}>
                <td style={{fontWeight:600}}>{t.name}</td>
                <td><TypeBadge type={t.type}/></td>
                <td className="mono">{t.itNum}</td>
                <td>
                  <input
                    type="date"
                    value={t.calibrationDueDate || ""}
                    disabled={savingId===String(t.id)}
                    onChange={e=>handleToggle(t.id, { calibrationDueDate: e.target.value || null })}
                  />
                </td>
                <td>
                  <select
                    value={t.currentLocationId ? String(t.currentLocationId) : ""}
                    disabled={savingId===String(t.id)}
                    onChange={e=>handleToggle(t.id, { currentLocationId: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">— None —</option>
                    {toolLocations.map(loc=><option key={loc.id} value={String(loc.id)}>{loc.name} ({loc.locationType})</option>)}
                  </select>
                </td>
                <td>
                  <select
                    value={t.homeLocationId ? String(t.homeLocationId) : ""}
                    disabled={savingId===String(t.id)}
                    onChange={e=>handleToggle(t.id, { homeLocationId: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">— None —</option>
                    {toolLocations.map(loc=><option key={loc.id} value={String(loc.id)}>{loc.name} ({loc.locationType})</option>)}
                  </select>
                </td>
                <td className="mono" style={{fontSize:".74rem",color:"var(--muted)"}}>{t.size||"—"}</td>
                <td>
                  <label style={{display:"flex",alignItems:"center",gap:".4rem",fontSize:".8rem"}}>
                    <input
                      type="checkbox"
                      checked={t.active!==false}
                      disabled={savingId===String(t.id)}
                      onChange={e=>{
                        const nextActive=e.target.checked;
                        const patch={ active: nextActive };
                        if(!nextActive && t.visible!==false) patch.visible=false;
                        handleToggle(t.id, patch);
                      }}
                    />
                    {t.active!==false?"Active":"Inactive"}
                  </label>
                </td>
                <td>
                  <label style={{display:"flex",alignItems:"center",gap:".4rem",fontSize:".8rem",opacity:t.active!==false?1:0.6}}>
                    <input
                      type="checkbox"
                      checked={t.visible!==false}
                      disabled={savingId===String(t.id)||t.active===false}
                      onChange={e=>handleToggle(t.id, { visible: e.target.checked })}
                    />
                    {t.visible!==false?"Selectable":"Hidden"}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
