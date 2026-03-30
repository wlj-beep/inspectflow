import React, { useState, useEffect } from "react";
import { AutocompleteInput } from "./sharedWidgets.jsx";
import { paginateRows, PaginationControls } from "./pagination.js";
import { EmptyState } from "./feedback.jsx";
import { normalizeOpNumber, fmtTs } from "./appHelpers.js";
import { validateJobFormField } from "./fieldValidation.js";

function parseFamilyJobNumber(jobNumber, opMatchers=[]){
    const s=String(jobNumber||"").trim().toUpperCase();
    const run=s.slice(-2);
    if(!/^\d{2}$/.test(run) || s.length <= 2) return null;
    const head=s.slice(0,-2);
    const sortedMatchers=[...(opMatchers||[])].sort((a,b)=>b.match.length-a.match.length);
    for(const matcher of sortedMatchers){
      if(!head.endsWith(matcher.match)) continue;
      const baseId=head.slice(0,-matcher.match.length);
      if(!baseId) continue;
      return {
        baseId,
        operationCode:matcher.normalized,
        runIndex:Number(run)
      };
    }
    const match3=head.match(/^(.+)(\d{3})$/);
    const match2=head.match(/^(.+)(\d{2})$/);
    let m=null;
    if(match3 && match3[2].startsWith("0")){
      m=match3;
    }else if(match2){
      m=match2;
    }else{
      m=match3;
    }
    if(!m) return null;
    const normalizedOp=normalizeOpNumber(m[2]);
    return {
      baseId:m[1],
      operationCode:normalizedOp || m[2],
      runIndex:Number(run)
    };
  }

export function AdminJobs({ parts, jobs, usersById, onCreateJob, canManageJobs, onUnlockJob }) {
  function newBaseId(){
    return String(Math.floor(Date.now()/1000)%1000000).padStart(6,"0");
  }
  const empty={jobNumber:"",partNumber:"",partRevision:"",operation:"",lot:"",qty:""};
  const [form,setForm]=useState(empty);
  const [err,setErr]=useState("");
  const [fieldErrs,setFieldErrs]=useState({});
  const [saving,setSaving]=useState(false);
  const [buildErr,setBuildErr]=useState("");
  const [building,setBuilding]=useState(false);
  const [builder,setBuilder]=useState({partNumber:"",partRevision:"",lot:"",qty:"",ops:{}});
  const [baseId,setBaseId]=useState(()=>newBaseId());
  const partOps=form.partNumber&&parts[form.partNumber]?Object.entries(parts[form.partNumber].operations):[];
  const builderOps=builder.partNumber&&parts[builder.partNumber]?Object.entries(parts[builder.partNumber].operations):[];
  const builderOpMatchers=builderOps.flatMap(([opKey])=>{
    const normalized=normalizeOpNumber(opKey) || String(opKey);
    const short=String(Number(normalized));
    if(short && short !== normalized){
      return [{ match: normalized, normalized }, { match: short, normalized }];
    }
    return [{ match: normalized, normalized }];
  });
  const existingLotJobs=builder.partNumber&&builder.partRevision&&builder.lot
    ?Object.values(jobs).filter(j=>j.partNumber===builder.partNumber&&j.partRevision===builder.partRevision&&String(j.lot).toLowerCase()===String(builder.lot).toLowerCase())
    :[];
  const existingLotOpMatchers=existingLotJobs.flatMap((j)=>{
    const normalized=normalizeOpNumber(j.operation) || normalizeOpNumber(j.operationId);
    if(!normalized) return [];
    const short=String(Number(normalized));
    if(short && short !== normalized){
      return [{ match: normalized, normalized }, { match: short, normalized }];
    }
    return [{ match: normalized, normalized }];
  });
  const familyOpMatchers=[...builderOpMatchers, ...existingLotOpMatchers].filter((m, idx, arr)=>{
    return arr.findIndex(x=>x.match===m.match && x.normalized===m.normalized)===idx;
  });
  const existingLotMeta=existingLotJobs
    .map(j=>parseFamilyJobNumber(j.jobNumber, familyOpMatchers))
    .filter(Boolean);
  const isDuplicateLot=existingLotJobs.length>0;
  const preferredBaseId=(()=>{
    if(existingLotMeta.length===0) return "";
    const byBase={};
    existingLotMeta.forEach(m=>{ byBase[m.baseId]=(byBase[m.baseId]||0)+1; });
    return Object.entries(byBase).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0][0];
  })();
  const nextFamilyRunIndex=existingLotMeta.length
    ?Math.max(...existingLotMeta.map(m=>Number(m.runIndex)||0))+1
    :1;
  const effectiveBaseId=(isDuplicateLot&&preferredBaseId)?preferredBaseId:baseId;
  useEffect(()=>{
    if(!builder.partNumber) return;
    const ops=Object.keys(parts[builder.partNumber]?.operations||{});
    const nextOps={};
    const defaultOn=builder.lot && !isDuplicateLot;
    ops.forEach(op=>{ nextOps[op]=defaultOn; });
    setBuilder(p=>({...p,ops:nextOps}));
  },[builder.partNumber,builder.partRevision,builder.lot,isDuplicateLot,parts]);
  useEffect(()=>{
    if(isDuplicateLot&&preferredBaseId&&baseId!==preferredBaseId){
      setBaseId(preferredBaseId);
    }
  },[isDuplicateLot,preferredBaseId,baseId]);
  async function handleAdd(){
    if(!form.jobNumber||!form.partNumber||!form.partRevision||!form.operation||!form.lot||!form.qty){setErr("All fields required.");return;}
    if(jobs[form.jobNumber.toUpperCase()]){setErr("Job number already exists.");return;}
    setErr("");setSaving(true);
    try{
      await onCreateJob({...form,jobNumber:form.jobNumber.toUpperCase(),qty:parseInt(form.qty),status:"open"});
      setForm(empty);
    }catch(e){
      setErr(e?.message||"Unable to create job.");
    }finally{
      setSaving(false);
    }
  }
  function validateJobField(field, value){
    const msg=validateJobFormField(field,value);
    setFieldErrs(prev=>({...prev,[field]:msg}));
  }
  async function handleBuild(){
    if(!builder.partNumber||!builder.partRevision||!builder.lot||!builder.qty){setBuildErr("Part, revision, lot, and qty required.");return;}
    const opsSelected=Object.keys(builder.ops||{}).filter(k=>builder.ops[k]);
    if(opsSelected.length===0){setBuildErr("Select at least one operation.");return;}
    setBuildErr("");setBuilding(true);
    try{
      const runIndex=isDuplicateLot ? nextFamilyRunIndex : 1;
      for(const opKey of opsSelected){
        const remeasureIndex=isDuplicateLot
          ? runIndex
          : existingLotJobs.filter(j=>(normalizeOpNumber(j.operation)||String(j.operation))===(normalizeOpNumber(opKey)||String(opKey))).length+1;
        const opCode=normalizeOpNumber(opKey) || String(opKey).padStart(3,"0");
        const jobNumber=`${effectiveBaseId}${opCode}${String(remeasureIndex).padStart(2,"0")}`;
        if(jobs[jobNumber]){
          throw new Error(`Job number ${jobNumber} already exists. Generate a new base ID.`);
        }
        await onCreateJob({
          jobNumber,
          partNumber:builder.partNumber,
          partRevision:builder.partRevision,
          operation:opKey,
          lot:builder.lot,
          qty:parseInt(builder.qty),
          status:"open"
        });
      }
      setBuilder({partNumber:"",partRevision:"",lot:"",qty:"",ops:{}});
      setBaseId(newBaseId());
    }catch(e){
      setBuildErr(e?.message||"Unable to create jobs.");
    }finally{
      setBuilding(false);
    }
  }
  const sb=s=>{
    if(s==="open")return <span className="badge badge-open">Open</span>;
    if(s==="closed")return <span className="badge badge-closed">Closed</span>;
    if(s==="draft")return <span className="badge badge-draft">Draft</span>;
    if(s==="incomplete")return <span className="badge badge-incomplete">Incomplete</span>;
    return <span className="badge badge-pend">{s}</span>;
  };
  const sortedJobs = Object.values(jobs).sort((a,b)=>b.jobNumber.localeCompare(a.jobNumber));
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(25);
  const { pageRows, totalPages, clampedPage, totalRows } = paginateRows(sortedJobs, page, pageSize);
  useEffect(()=>{
    setPage(1);
  },[jobs, pageSize]);
  useEffect(()=>{
    if(clampedPage!==page) setPage(clampedPage || 1);
  },[clampedPage,page]);
  return (
    <div>
      <div className="card">
        <div className="card-head"><div className="card-title">Create New Job</div></div>
        <div className="card-body">
          <div className="row3">
            <div className="field"><label>Job Number</label><input value={form.jobNumber} onChange={e=>setForm(p=>({...p,jobNumber:e.target.value.toUpperCase()}))} onBlur={e=>validateJobField("jobNumber",e.target.value)} placeholder="J-10045" style={{fontFamily:"var(--mono)"}}/>{fieldErrs.jobNumber&&<div className="err-text">{fieldErrs.jobNumber}</div>}</div>
            <div className="field"><label>Part Number</label>
              <select value={form.partNumber} onChange={e=>{
                const nextPart=e.target.value;
                const nextRevision=parts[nextPart]?.currentRevision || "";
                setForm(p=>({...p,partNumber:nextPart,partRevision:nextRevision,operation:""}));
              }} onBlur={e=>validateJobField("partNumber",e.target.value)}>
                <option value="">— Select Part —</option>
                {Object.keys(parts).map(pn=><option key={pn} value={pn}>{pn} — {parts[pn].description}{parts[pn].currentRevision ? ` (Rev ${parts[pn].currentRevision})` : ""}</option>)}
              </select>{fieldErrs.partNumber&&<div className="err-text">{fieldErrs.partNumber}</div>}</div>
            <div className="field"><label>Revision</label>
              <select value={form.partRevision} onChange={e=>setForm(p=>({...p,partRevision:e.target.value}))} onBlur={e=>validateJobField("partRevision",e.target.value)} disabled={!form.partNumber}>
                <option value="">— Select Revision —</option>
                {(parts[form.partNumber]?.revisions||[]).map(r=><option key={r.revision} value={r.revision}>{r.revision}</option>)}
              </select>
              <div className="help-inline">Revision must match released part setup revision.</div>
            </div>
          </div>
          <div className="row3 mt1">
            <div className="field"><label>Operation</label>
              <select value={form.operation} onChange={e=>setForm(p=>({...p,operation:e.target.value}))} onBlur={e=>validateJobField("operation",e.target.value)} disabled={!form.partNumber}>
                <option value="">— Select Op —</option>
                {partOps.map(([k,op])=><option key={k} value={k}>Op {k} — {op.label}</option>)}
              </select></div>
            <div className="field"><label>Lot</label><input value={form.lot} onChange={e=>setForm(p=>({...p,lot:e.target.value}))} onBlur={e=>validateJobField("lot",e.target.value)} placeholder="e.g. Lot C"/></div>
            <div className="field"><label>Qty</label><input type="number" min="1" value={form.qty} onChange={e=>setForm(p=>({...p,qty:e.target.value}))} onBlur={e=>validateJobField("qty",e.target.value)} placeholder="12" style={{fontFamily:"var(--mono)"}}/>{fieldErrs.qty&&<div className="err-text">{fieldErrs.qty}</div>}</div>
          </div>
          {err&&<p className="err-text mt1">{err}</p>}
          <div className="mt2">
            <button className="btn btn-primary" disabled={saving||!canManageJobs} onClick={handleAdd}>{saving?"Creating…":"+ Create Job"}</button>
            {!canManageJobs && <span className="text-muted" style={{marginLeft:".65rem"}}>Permission required to create jobs.</span>}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><div className="card-title">Job Builder (Part + Lot)</div></div>
        <div className="card-body">
          <div className="row3">
            <div className="field"><label>Part Number</label>
              <select value={builder.partNumber} onChange={e=>{
                const nextPart=e.target.value;
                const nextRevision=parts[nextPart]?.currentRevision || "";
                setBuilder(p=>({...p,partNumber:nextPart,partRevision:nextRevision}));
              }}>
                <option value="">— Select Part —</option>
                {Object.keys(parts).map(pn=><option key={pn} value={pn}>{pn} — {parts[pn].description}{parts[pn].currentRevision ? ` (Rev ${parts[pn].currentRevision})` : ""}</option>)}
              </select></div>
            <div className="field"><label>Revision</label>
              <select value={builder.partRevision} onChange={e=>setBuilder(p=>({...p,partRevision:e.target.value}))} disabled={!builder.partNumber}>
                <option value="">— Select Revision —</option>
                {(parts[builder.partNumber]?.revisions||[]).map(r=><option key={r.revision} value={r.revision}>{r.revision}</option>)}
              </select></div>
            <div className="field"><label>Lot</label><input value={builder.lot} onChange={e=>setBuilder(p=>({...p,lot:e.target.value}))} placeholder="e.g. Lot B"/></div>
          </div>
          <div className="row3 mt1">
            <div className="field"><label>Qty</label><input type="number" min="1" value={builder.qty} onChange={e=>setBuilder(p=>({...p,qty:e.target.value}))} placeholder="12" style={{fontFamily:"var(--mono)"}}/></div>
          </div>
          {isDuplicateLot && <div className="text-warn" style={{fontSize:".75rem",marginTop:".5rem"}}>Lot already exists — creating remeasure jobs.</div>}
          {isDuplicateLot && preferredBaseId && (
            <div className="text-muted" style={{fontSize:".74rem",marginTop:".3rem"}}>
              Reusing base job prefix <span className="mono">{preferredBaseId}</span> with run index <span className="mono">{String(nextFamilyRunIndex).padStart(2,"0")}</span> for this regenerated family.
            </div>
          )}
          <div className="row2 mt1">
            <div className="field"><label>Base Job ID</label>
              <div style={{display:"flex",gap:".5rem",alignItems:"center"}}>
                <input value={effectiveBaseId} readOnly style={{fontFamily:"var(--mono)"}}/>
                <button className="btn btn-ghost btn-sm" disabled={isDuplicateLot&&!!preferredBaseId} onClick={()=>setBaseId(newBaseId())}>Regenerate</button>
              </div>
            </div>
            <div className="field" style={{alignItems:"flex-end"}}>
              <div className="gap1">
                <button className="btn btn-ghost btn-sm" onClick={()=>setBuilder(p=>({...p,ops:Object.fromEntries(Object.keys(p.ops||{}).map(k=>[k,true]))}))}>Select All</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>setBuilder(p=>({...p,ops:Object.fromEntries(Object.keys(p.ops||{}).map(k=>[k,false]))}))}>Clear</button>
              </div>
            </div>
          </div>
          <div className="section-label" style={{marginTop:".75rem"}}>Operations</div>
          <div className="row3">
            {builderOps.length===0 && <div className="text-muted">Select a part to choose operations.</div>}
            {builderOps.map(([opKey,op])=>{
              const remeasureIndex=isDuplicateLot
                ? nextFamilyRunIndex
                : existingLotJobs.filter(j=>(normalizeOpNumber(j.operation)||String(j.operation))===(normalizeOpNumber(opKey)||String(opKey))).length+1;
              const opCode=normalizeOpNumber(opKey) || String(opKey).padStart(3,"0");
              const jobNumber=`${effectiveBaseId}${opCode}${String(remeasureIndex).padStart(2,"0")}`;
              return (
                <label key={opKey} style={{display:"flex",alignItems:"center",gap:".5rem",fontSize:".85rem"}}>
                  <input type="checkbox" checked={!!builder.ops?.[opKey]} onChange={e=>setBuilder(p=>({...p,ops:{...p.ops,[opKey]:e.target.checked}}))}/>
                  Op {opKey} — {op.label} <span className="text-muted" style={{fontFamily:"var(--mono)",fontSize:".72rem"}}>{jobNumber}</span>
                </label>
              );
            })}
          </div>
          {buildErr&&<p className="err-text mt1">{buildErr}</p>}
          <div className="mt2">
            <button className="btn btn-primary" disabled={building||!canManageJobs} onClick={handleBuild}>{building?"Creating…":"Create Jobs"}</button>
          </div>
        </div>
      </div>
      <div className="card" style={{padding:0,overflow:"hidden"}}>
        <div className="card-head"><div className="card-title">All Jobs</div></div>
        <table className="data-table">
          <thead><tr><th>Job #</th><th>Part</th><th>Rev</th><th>Operation</th><th>Lot</th><th>Qty</th><th>Status</th></tr></thead>
          <tbody>
            {pageRows.length===0 && (
              <tr><td colSpan={7}><EmptyState title="No Jobs Yet" description="Create a job from the form above to populate this table." /></td></tr>
            )}
            {pageRows.map(j=>(
              <tr key={j.jobNumber}>
                <td className="mono accent-text">{j.jobNumber}</td>
                <td><span className="mono">{j.partNumber}</span> <span className="text-muted">{parts[j.partNumber]?.description}</span></td>
                <td className="mono">{j.partRevision || "A"}</td>
                <td>Op {j.operation} — {parts[j.partNumber]?.operations[j.operation]?.label}</td>
                <td>{j.lot}</td><td className="mono">{j.qty}</td>
                <td>{sb(j.status)}
                  {j.lockOwnerUserId&&(
                    <div className="text-muted" style={{fontSize:".7rem"}}>Locked by {usersById?.[String(j.lockOwnerUserId)]||`User #${j.lockOwnerUserId}`}</div>
                  )}
                  {j.lockOwnerUserId && canManageJobs && onUnlockJob && (
                    <button className="btn btn-ghost btn-sm" style={{marginTop:".25rem"}} onClick={()=>onUnlockJob(j.jobNumber)}>Force Unlock</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationControls
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
        <div className="text-muted" style={{padding:"0 .85rem .75rem",fontSize:".72rem"}}>{totalRows} total job{totalRows!==1?"s":""}</div>
      </div>
    </div>
  );
}
