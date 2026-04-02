import React, { useState, useEffect } from "react";
import { TypeBadge, AutocompleteInput, ToolSearchPopover } from "./sharedWidgets.jsx";
import { SAMPLING_OPTIONS, TOOL_TYPES } from "./adminConstants.js";
import { samplingLabel } from "./adminConstants.js";
import { normalizeOpNumber, nextRevisionCode, revisionCodeToIndex, isToolSelectable } from "./appHelpers.js";
import { validatePartField } from "./fieldValidation.js";
import { fmtTs } from "./appHelpers.js";

export function AdminParts({ parts, toolLibrary, onCreatePart, onUpdatePart, onBulkUpdateParts, onCreateOp, onCreateDim, onUpdateDim, onRemoveDim, onDirtyChange }) {
  const [newPart,setNewPart]=useState({partNumber:"",description:"",revision:"A"});
  const [partErr,setPartErr]=useState("");
  const [apiErr,setApiErr]=useState("");
  const [saving,setSaving]=useState(false);
  const [newOp,setNewOp]=useState({});
  const [partQuery,setPartQuery]=useState("");
  const [pageSize,setPageSize]=useState(25);
  const [page,setPage]=useState(1);
  const [bulkFind,setBulkFind]=useState("");
  const [bulkReplace,setBulkReplace]=useState("");
  const [bulkBusy,setBulkBusy]=useState(false);
  const [bulkMsg,setBulkMsg]=useState("");
  useEffect(()=>{
    const hasNewPart=!!(newPart.partNumber||newPart.description);
    const hasNewOp=Object.values(newOp).some(v=>v?.opNum||v?.label);
    if(onDirtyChange) onDirtyChange(hasNewPart||hasNewOp);
  },[newPart,newOp,onDirtyChange]);
  const sortedPartEntries=Object.entries(parts||{}).sort((a,b)=>a[0].localeCompare(b[0]));
  const query=partQuery.trim().toLowerCase();
  const filteredPartEntries=sortedPartEntries.filter(([pn,part])=>{
    if(!query) return true;
    const hay=[pn,part?.description||"",part?.currentRevision||""].join(" ").toLowerCase();
    return hay.includes(query);
  });
  const totalPages=Math.max(1, Math.ceil(filteredPartEntries.length / pageSize));
  const safePage=Math.min(page, totalPages);
  const visiblePartEntries=filteredPartEntries.slice((safePage-1)*pageSize, safePage*pageSize);
  useEffect(()=>{
    setPage(1);
  },[partQuery,pageSize]);
  useEffect(()=>{
    if(page>totalPages) setPage(totalPages);
  },[page,totalPages]);
  function revisionContext(pn){
    const part=parts[pn]||{};
    const current=part.currentRevision || "A";
    const next=part.nextRevision || nextRevisionCode(current);
    return { current, next };
  }
  function confirmRevisionCommit(pn, impact){
    const ctx=revisionContext(pn);
    const msg=[
      "Revision review required:",
      `Part ${pn}`,
      `Current revision: ${ctx.current}`,
      `Next revision: ${ctx.next}`,
      `Impact: ${impact}`,
      "",
      "Commit this setup change?"
    ].join("\n");
    return window.confirm(msg);
  }
  function describeDimImpact(field, dimName){
    const label=dimName || "dimension";
    if(field==="tools") return `Update allowed tools for ${label}`;
    if(field==="samplingInterval") return `Update custom sampling interval for ${label}`;
    return `Update ${field} for ${label}`;
  }
  async function handleAddPart(){
    const pn=newPart.partNumber.trim().toUpperCase();
    const revision=String(newPart.revision||"").trim().toUpperCase();
    if(!pn||!newPart.description.trim()||!/^[A-Z]+$/.test(revision)){setPartErr("Part number, part name, and revision are required.");return;}
    if(parts[pn]){setPartErr("Part number already exists.");return;}
    setPartErr("");setApiErr("");setSaving(true);
    try{
      await onCreatePart({partNumber:pn,description:newPart.description.trim(),revision});
      setNewPart({partNumber:"",description:"",revision:"A"});
    }catch(e){
      setApiErr(e?.message||"Unable to add part.");
    }finally{
      setSaving(false);
    }
  }
  function updateDescLocal(pn,v){ onUpdatePart(pn,v,false).catch(()=>{}); }
  function updateDescPersist(pn,v){
    const part=parts[pn]||{};
    const persistedName=part.revisions?.[0]?.partName || part.description || "";
    if(String(v).trim()===String(persistedName).trim()) return;
    if(!confirmRevisionCommit(pn, "Update part name")){
      onUpdatePart(pn,persistedName,false).catch(()=>{});
      return;
    }
    onUpdatePart(pn,v,true).catch(e=>setApiErr(e?.message||"Unable to update part."));
  }
  async function handleAddOp(pn){
    const o=newOp[pn]||{};
    const opKeyRaw=(o.opNum||"").trim();
    if(!opKeyRaw||!o.label?.trim())return;
    const opKey=normalizeOpNumber(opKeyRaw);
    if(!opKey){ setApiErr("Operation number must be between 001 and 999."); return; }
    if(parts[pn].operations[opKey]){ setApiErr(`Operation ${opKey} already exists.`); return; }
    if(!confirmRevisionCommit(pn, `Add operation ${opKey} — ${o.label.trim()}`)) return;
    setApiErr("");
    try{
      await onCreateOp(pn,opKey,o.label.trim());
      setNewOp(p=>({...p,[pn]:{opNum:"",label:""}}));
    }catch(e){
      setApiErr(e?.message||"Unable to add operation.");
    }
  }
  function updateDim(pn,opKey,dimId,field,value,persist,dimName){
    if(persist && !confirmRevisionCommit(pn, describeDimImpact(field, dimName))) return;
    onUpdateDim(pn,opKey,dimId,field,value,persist).catch(e=>setApiErr(e?.message||"Unable to update dimension."));
  }
  async function addDim(pn,opKey){
    if(!confirmRevisionCommit(pn, `Add dimension to operation ${opKey}`)) return;
    setApiErr("");
    try{
      await onCreateDim(pn,opKey,{name:"New Dimension",nominal:0.0000,tolPlus:0.0050,tolMinus:0.0050,unit:"in",sampling:"first_last",samplingInterval:null,inputMode:"single",tools:[]});
    }catch(e){
      setApiErr(e?.message||"Unable to add dimension.");
    }
  }
  async function removeDim(pn,opKey,dimId,dimName){
    if(!confirmRevisionCommit(pn, `Remove dimension ${dimName || dimId} from operation ${opKey}`)) return;
    setApiErr("");
    try{
      await onRemoveDim(pn,opKey,dimId);
    }catch(e){
      setApiErr(e?.message||"Unable to remove dimension.");
    }
  }
  async function handleBulkRename(){
    const find=bulkFind;
    if(!find.trim()){ setBulkMsg("Enter text to find."); return; }
    const esc=find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re=new RegExp(esc, "g");
    const updates=filteredPartEntries
      .map(([partNumber,part])=>{
        const nextName=String(part.description||"").replace(re, bulkReplace);
        if(nextName===part.description) return null;
        return { id: partNumber, description: nextName };
      })
      .filter(Boolean);
    if(updates.length===0){ setBulkMsg("No filtered parts matched the find text."); return; }
    if(!window.confirm(`Apply bulk rename to ${updates.length} part(s)?`)) return;

    setBulkMsg("");
    setBulkBusy(true);
    try{
      const result=await onBulkUpdateParts(updates);
      const updated=result?.updated ?? updates.length;
      const skipped=result?.skipped ?? 0;
      const missing=(result?.notFound || []).length;
      setBulkMsg(`Bulk update complete: ${updated} updated, ${skipped} skipped${missing ? `, ${missing} missing` : ""}.`);
    }catch(e){
      setBulkMsg(e?.message || "Bulk update failed.");
    }finally{
      setBulkBusy(false);
    }
  }
  return (
    <div>
      <div className="card">
        <div className="card-head"><div className="card-title">Add New Part</div></div>
        <div className="card-body">
          <div className="row3">
            <div className="field"><label>Part Number</label><input value={newPart.partNumber} onChange={e=>setNewPart(p=>({...p,partNumber:e.target.value.toUpperCase()}))} onBlur={e=>setPartErr(validatePartField("partNumber", e.target.value))} placeholder="e.g. 5678" style={{fontFamily:"var(--mono)"}}/></div>
            <div className="field"><label>Part Name</label><input value={newPart.description} onChange={e=>setNewPart(p=>({...p,description:e.target.value}))} placeholder="Part name"/></div>
            <div className="field"><label>Initial Revision</label><input value={newPart.revision} onChange={e=>setNewPart(p=>({...p,revision:e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"")}))} onBlur={e=>setPartErr(validatePartField("revision", e.target.value))} placeholder="A" style={{fontFamily:"var(--mono)"}}/><div className="help-inline">Revision code should be 1-4 uppercase alphanumeric characters.</div></div>
          </div>
          {partErr&&<p className="err-text mt1">{partErr}</p>}
          {apiErr&&<p className="err-text mt1">{apiErr}</p>}
          <div className="mt2"><button className="btn btn-primary" disabled={saving} onClick={handleAddPart}>{saving?"Saving…":"+ Add Part"}</button></div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><div className="card-title">Catalog Controls</div></div>
        <div className="card-body">
          <div className="row3">
            <div className="field">
              <label>Search Parts</label>
              <input value={partQuery} onChange={e=>setPartQuery(e.target.value)} placeholder="Filter by part number, name, or revision"/>
            </div>
            <div className="field">
              <label>Page Size</label>
              <select value={String(pageSize)} onChange={e=>setPageSize(Math.max(1, Number(e.target.value)||25))}>
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
            <div className="field" style={{alignItems:"flex-end"}}>
              <div className="text-muted" style={{fontSize:".72rem"}}>
                Showing {visiblePartEntries.length} of {filteredPartEntries.length} filtered ({sortedPartEntries.length} total)
              </div>
            </div>
          </div>
          <div className="row3 mt1">
            <div className="field"><label>Bulk Find</label><input value={bulkFind} onChange={e=>setBulkFind(e.target.value)} placeholder="Find text in part names"/></div>
            <div className="field"><label>Bulk Replace</label><input value={bulkReplace} onChange={e=>setBulkReplace(e.target.value)} placeholder="Replacement text"/></div>
            <div className="field" style={{justifyContent:"flex-end"}}>
              <button className="btn btn-ghost" disabled={bulkBusy} onClick={handleBulkRename}>{bulkBusy ? "Applying…" : "Apply to Filtered Parts"}</button>
            </div>
          </div>
          {bulkMsg && <p className="text-muted mt1" style={{fontSize:".74rem"}}>{bulkMsg}</p>}
          <div className="gap1 mt1" style={{justifyContent:"flex-end"}}>
            <button className="btn btn-ghost btn-sm" disabled={safePage<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Prev</button>
            <div className="text-muted" style={{fontSize:".72rem",padding:".35rem .4rem"}}>Page {safePage} / {totalPages}</div>
            <button className="btn btn-ghost btn-sm" disabled={safePage>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Next</button>
          </div>
        </div>
      </div>
      {filteredPartEntries.length===0 && (
        <div className="card">
          <div className="card-body">
            <div className="text-muted">No parts match the current filter.</div>
          </div>
        </div>
      )}
      {visiblePartEntries.map(([pn,part])=>(
        <div className="card" key={pn}>
          <div className="card-head">
            <div style={{display:"flex",alignItems:"center",gap:"1rem",flex:1}}>
              <div className="card-title" style={{whiteSpace:"nowrap"}}>Part {pn}</div>
              <input value={part.description} onChange={e=>updateDescLocal(pn,e.target.value)}
                style={{background:"var(--panel2)",border:"1px solid var(--border2)",color:"var(--text)",fontFamily:"var(--sans)",fontSize:".85rem",padding:".3rem .6rem",borderRadius:"2px",outline:"none",flex:1,maxWidth:"400px",transition:"border-color .15s"}}
                onFocus={e=>e.target.style.borderColor="var(--accent)"}
                onBlur={e=>{updateDescPersist(pn,e.target.value);e.target.style.borderColor="var(--border2)";}}/>
              <div className="text-muted" style={{fontSize:".72rem",whiteSpace:"nowrap"}}>
                Rev {part.currentRevision||"A"} → {part.nextRevision||nextRevisionCode(part.currentRevision||"A")}
              </div>
            </div>
          </div>
          <div style={{padding:"1rem 1.25rem"}}>
            <div className="text-muted" style={{fontSize:".72rem",marginBottom:".6rem"}}>
              Setup changes require revision review before commit.
            </div>
            {Array.isArray(part.revisions) && part.revisions.length>0 && (
              <details style={{marginBottom:"1rem"}}>
                <summary style={{cursor:"pointer",fontSize:".74rem",color:"var(--muted)"}}>
                  Revision History ({part.revisions.length})
                </summary>
                <div style={{marginTop:".4rem",display:"grid",gap:".2rem"}}>
                  {part.revisions.slice(0,10).map((rev)=>(
                    <div key={rev.revision} className="text-muted" style={{fontSize:".72rem"}}>
                      Rev {rev.revision} · {rev.changeSummary || "Setup update"} · {fmtTs(rev.createdAt)}
                    </div>
                  ))}
                </div>
              </details>
            )}
            {Object.entries(part.operations).map(([opKey,op])=>(
              <div key={opKey} style={{marginBottom:"1.5rem"}}>
                <div className="section-label">Op {opKey} — {op.label}</div>
                <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:"3px",marginBottom:".6rem"}}>
                  <table className="edit-table">
                    <thead><tr>
                      <th style={{minWidth:"140px"}}>Dimension</th>
                      <th style={{width:"85px"}}>Nominal</th>
                      <th style={{width:"82px"}}>Tol +</th>
                      <th style={{width:"82px"}}>Tol −</th>
                      <th style={{width:"60px"}}>Unit</th>
                      <th style={{width:"180px"}}>Sampling</th>
                      <th style={{width:"120px"}}>Input Mode</th>
                      <th style={{minWidth:"220px"}}>Allowed Tools</th>
                      <th style={{width:"40px"}}></th>
                    </tr></thead>
                    <tbody>
                      {op.dimensions.length===0&&<tr><td colSpan={9} className="empty-state" style={{padding:"1rem",fontSize:".76rem"}}>No dimensions defined.</td></tr>}
                      {op.dimensions.map(d=>(
                        <tr key={d.id}>
                          <td><input value={d.name} onChange={e=>updateDim(pn,opKey,d.id,"name",e.target.value,false,d.name)} onBlur={e=>updateDim(pn,opKey,d.id,"name",e.target.value,true,d.name)}/></td>
                          <td><input type="number" step="0.0001" value={d.nominal} onChange={e=>updateDim(pn,opKey,d.id,"nominal",parseFloat(e.target.value)||0,false,d.name)} onBlur={e=>updateDim(pn,opKey,d.id,"nominal",parseFloat(e.target.value)||0,true,d.name)} style={{fontFamily:"var(--mono)"}}/></td>
                          <td><input type="number" step="0.0001" value={d.tolPlus} onChange={e=>updateDim(pn,opKey,d.id,"tolPlus",parseFloat(e.target.value)||0,false,d.name)} onBlur={e=>updateDim(pn,opKey,d.id,"tolPlus",parseFloat(e.target.value)||0,true,d.name)} style={{fontFamily:"var(--mono)"}}/></td>
                          <td><input type="number" step="0.0001" value={d.tolMinus} onChange={e=>updateDim(pn,opKey,d.id,"tolMinus",parseFloat(e.target.value)||0,false,d.name)} onBlur={e=>updateDim(pn,opKey,d.id,"tolMinus",parseFloat(e.target.value)||0,true,d.name)} style={{fontFamily:"var(--mono)"}}/></td>
                          <td><select value={d.unit} onChange={e=>updateDim(pn,opKey,d.id,"unit",e.target.value,true,d.name)}>
                            <option>in</option><option>mm</option><option>Ra</option><option>deg</option>
                          </select></td>
                          <td>
                            <select value={d.sampling} onChange={e=>updateDim(pn,opKey,d.id,"sampling",e.target.value,true,d.name)}>
                              {SAMPLING_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            {d.sampling==="custom_interval" && (
                              <input type="number" min="1" step="1" value={d.samplingInterval || 2}
                                onChange={e=>updateDim(pn,opKey,d.id,"samplingInterval",Math.max(1, Number(e.target.value)||1),false,d.name)}
                                onBlur={e=>updateDim(pn,opKey,d.id,"samplingInterval",Math.max(1, Number(e.target.value)||1),true,d.name)}
                                style={{marginTop:".3rem",fontFamily:"var(--mono)"}}
                                title="Sampling Interval: inspect every Nth piece when using custom interval."
                                placeholder="Interval (N)"
                              />
                            )}
                          </td>
                          <td><select value={d.inputMode||"single"} onChange={e=>updateDim(pn,opKey,d.id,"inputMode",e.target.value,true,d.name)}>
                            <option value="single">Single</option>
                            <option value="range">Min/Max Range</option>
                          </select></td>
                          <td>
                            <ToolSearchPopover toolLibrary={toolLibrary} selectedIds={d.tools}
                              onAdd={id=>updateDim(pn,opKey,d.id,"tools",[...d.tools,id],true,d.name)}
                              onRemove={id=>updateDim(pn,opKey,d.id,"tools",d.tools.filter(x=>x!==id),true,d.name)}/>
                          </td>
                          <td style={{textAlign:"center"}}><button className="btn btn-danger btn-sm" onClick={()=>removeDim(pn,opKey,d.id,d.name)}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={()=>addDim(pn,opKey)}>+ Add Dimension</button>
              </div>
            ))}
            <div style={{borderTop:"1px solid var(--border)",paddingTop:"1rem",marginTop:".5rem"}}>
              <div className="section-label" style={{color:"var(--muted)"}}>Add Operation</div>
              <div className="row3" style={{gap:".75rem"}}>
                <div className="field"><label>Op Number</label><input value={newOp[pn]?.opNum||""} onChange={e=>setNewOp(p=>({...p,[pn]:{...p[pn],opNum:e.target.value}}))} placeholder="e.g. 040" style={{fontFamily:"var(--mono)"}}/></div>
                <div className="field"><label>Op Label</label><input value={newOp[pn]?.label||""} onChange={e=>setNewOp(p=>({...p,[pn]:{...p[pn],label:e.target.value}}))} placeholder="e.g. Final Inspection"/></div>
                <div className="field" style={{justifyContent:"flex-end"}}><button className="btn btn-ghost" onClick={()=>handleAddOp(pn)}>+ Add Operation</button></div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
