import React, { useState, useRef, useEffect, useMemo } from "react";
import { api } from "../api/index.js";
import { getOperatorName } from "../domains/jobflow/mappers.js";
import { buildGridOrder, getNeighborKey, moveFocusToKey, ensureVisibleCell } from "./measurementKeyboard.js";
import { computeMeasurementSummary } from "./measurementSummary.js";
import { OperatorStageBar, PinnedSpecLegend } from "./operatorProgress.jsx";
import { TABLE_DENSITY, readTableDensity, writeTableDensity, cellHighlightClasses } from "./operatorTablePrefs.js";
import { extractOperatorLookupFacets, filterOperatorJobs } from "./operatorLookupFilters.js";
import { paginateRows, PaginationControls } from "./pagination.js";
import { applyColumnWidthPreset } from "./columnWidthPresets.js";
import { SAMPLING_OPTIONS, ISSUE_CATEGORIES, MISSING_REASONS, getSamplePieces, samplingLabel } from "./adminConstants.js";
import { isOOT, splitRangeValue, fmtSpec, nowStr, isToolSelectable } from "./appHelpers.js";

function AutocompleteInput({ value, onChange, options, filterFn, placeholder, style, renderOption }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const filtered = options.filter(o => filterFn ? filterFn(o, value) : true);
  return (
    <div className="ac-wrap">
      <input value={value} onChange={e=>{onChange(e.target.value);setOpen(true);setHi(-1);}} onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),150)} placeholder={placeholder} style={style}/>
      {open && filtered.length > 0 && (
        <div className="ac-list">
          {filtered.slice(0,12).map((o,i)=>(
            <div key={o.value||i} className={`ac-item${i===hi?" hi":""}`} onMouseDown={()=>{onChange(o.value);setOpen(false);}} onMouseEnter={()=>setHi(i)}>
              {renderOption ? renderOption(o) : o.label || o.value}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MissingPieceModal({ pieces, missingPieces, onSave, onCancel }) {
  const [local,setLocal]=useState({...missingPieces});
  const valid=pieces.every(p=>local[p]?.reason&&(local[p].reason!=="Scrapped"||local[p].ncNum));
  return (
    <div className="modal-overlay">
      <div className="rec-modal" style={{maxWidth:"560px"}}>
        <div className="rec-modal-head"><div className="modal-title">Missing Pieces</div><button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button></div>
        <div className="rec-modal-body" style={{padding:"1.25rem"}}>
          <p className="text-muted" style={{marginBottom:"1rem",fontSize:".8rem"}}>Log the reason for each piece that could not be measured.</p>
          {pieces.map(p=>(
            <div key={p} style={{marginBottom:"1rem",paddingBottom:"1rem",borderBottom:"1px solid var(--border)"}}>
              <div className="section-label" style={{marginBottom:".4rem"}}>Piece {p}</div>
              <div className="field" style={{marginBottom:".4rem"}}>
                <label>Reason</label>
                <select value={local[p]?.reason||""} onChange={e=>setLocal(v=>({...v,[p]:{...v[p],reason:e.target.value}}))}>
                  <option value="">— Select —</option>
                  {MISSING_REASONS.map(r=><option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {local[p]?.reason==="Scrapped"&&(
                <div className="field" style={{marginBottom:".4rem"}}><label>NC #</label><input value={local[p]?.ncNum||""} placeholder="NC-####" onChange={e=>setLocal(v=>({...v,[p]:{...v[p],ncNum:e.target.value}}))} /></div>
              )}
              {local[p]?.reason==="Other"&&(
                <div className="field" style={{marginTop:".5rem"}}><label>Details</label>
                  <input value={local[p]?.details||""} placeholder="Describe reason…" onChange={e=>setLocal(v=>({...v,[p]:{...v[p],details:e.target.value}}))} /></div>
              )}
              {local[p]?.reason==="Scrapped"&&!local[p]?.ncNum&&<p className="err-text">NC # required for scrapped pieces</p>}
            </div>
          ))}
          <div className="gap1 mt2">
            <button className="btn btn-partial" disabled={!valid} onClick={()=>onSave(local)}>Confirm &amp; Partial Submit</button>
            <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OperatorView({ parts, jobs, toolLibrary, onSubmit, onDraft, currentUserId, currentRole, onLockJob, onUnlockJob, onRefreshData, dataStatus, usersById }) {
  const [step,setStep]=useState("lookup");
  const [jobInput,setJobInput]=useState("");
  const [lookupFilter,setLookupFilter]=useState({ part:"", operation:"", status:"open", search:"" });
  const [lookupPage,setLookupPage]=useState(1);
  const [lookupPageSize,setLookupPageSize]=useState(25);
  const [currentJob,setCurrentJob]=useState(null);
  const [values,setValues]=useState({});
  const [toolSel,setToolSel]=useState({});
  const [unlocked,setUnlocked]=useState({});
  const [missing,setMissing]=useState({});
  const [comment,setComment]=useState("");
  const [showModal,setShowModal]=useState(false);
  const [density,setDensity]=useState(()=>readTableDensity());
  const [activeCellKey,setActiveCellKey]=useState("");
  const [activeDimId,setActiveDimId]=useState("");
  const [activePiece,setActivePiece]=useState("");
  const [colWidths,setColWidths]=useState({});
  const [jobErr,setJobErr]=useState("");
  const [submitErr,setSubmitErr]=useState("");
  const [submitting,setSubmitting]=useState(false);
  const [issueCategory,setIssueCategory]=useState("app_functionality_issue");
  const [issueDetails,setIssueDetails]=useState("");
  const [issueErr,setIssueErr]=useState("");
  const [issueOk,setIssueOk]=useState("");
  const [reportingIssue,setReportingIssue]=useState(false);
  const [importCsv,setImportCsv]=useState("");
  const [importingCsv,setImportingCsv]=useState(false);
  const [importErr,setImportErr]=useState("");
  const [lastSubmitSource,setLastSubmitSource]=useState("manual");
  const importFileRef=useRef(null);
  const idleRef=useRef(null);
  const currentUserName = usersById?.[String(currentUserId)] || "";

  const part=currentJob?parts[currentJob.partNumber]:null;
  const opData=part?part.operations[currentJob.operation]:null;
  const dims=opData?.dimensions??[];

  function getColWidth(dimId){ return colWidths[dimId]||160; }
  function startResize(e,dimId){
    e.preventDefault();
    const startX=e.clientX;
    const startW=getColWidth(dimId);
    function onMove(ev){ setColWidths(p=>({...p,[dimId]:Math.max(110,startW+ev.clientX-startX)})); }
    function onUp(){ document.removeEventListener("mousemove",onMove);document.removeEventListener("mouseup",onUp); }
    document.addEventListener("mousemove",onMove);document.addEventListener("mouseup",onUp);
  }
  function maybeStartResize(e){
    if(e.button!==0) return;
    const cell=e.target?.closest?.("td[data-dim-id]");
    if(!cell) return;
    const rect=cell.getBoundingClientRect();
    const nearRightEdge=(rect.right - e.clientX) <= 12;
    if(!nearRightEdge) return;
    const dimId=cell.getAttribute("data-dim-id");
    if(!dimId) return;
    startResize(e, dimId);
  }
  function preventNegative(e){
    if(e.key==="-"||e.key==="e"||e.key==="E") e.preventDefault();
  }
  function handleValueKeyDown(e, key){
    if(e.key==="Escape"){
      e.preventDefault();
      setValues(p=>({...p,[key]:""}));
    }
  }
  function splitRange(val){ return splitRangeValue(val); }
  function setRangeValue(key, which, nextVal){
    const [minVal,maxVal]=splitRange(values[key]);
    const nextMin = which==="min"?nextVal:minVal;
    const nextMax = which==="max"?nextVal:maxVal;
    const next = (nextMin||nextMax)?`${nextMin}|${nextMax}`:"";
    setValues(p=>({...p,[key]:next}));
  }
  function isValueComplete(dim, val){
    if(val===undefined||val==="") return false;
    const mode=(dim?.inputMode||"single");
    if(mode==="range"){
      const [minVal,maxVal]=splitRange(val);
      return minVal!=="" && maxVal!=="";
    }
    return true;
  }
  function togglePf(key, value){
    setValues(p=>({...p,[key]:p[key]===value?"":value}));
  }
  function normalizeToolRows(raw){
    const rows=Array.isArray(raw) ? raw : (raw ? [raw] : []);
    const normalized=rows
      .map(r=>({
        toolName:r?.toolName||"",
        toolId:r?.toolId?String(r.toolId):"",
        itNum:r?.itNum?String(r.itNum).toUpperCase():""
      }))
      .filter(r=>r.toolName||r.toolId||r.itNum);
    return normalized.length ? normalized : [{ toolName:"", toolId:"", itNum:"" }];
  }
  function getToolRows(dimId){
    return normalizeToolRows(toolSel?.[dimId]);
  }
  function setToolRows(dimId, updater){
    setToolSel(prev=>{
      const current=normalizeToolRows(prev?.[dimId]);
      const nextRows=normalizeToolRows(typeof updater==="function" ? updater(current) : updater);
      return { ...prev, [dimId]: nextRows };
    });
  }
  function getActiveToolRows(dimId){
    return normalizeToolRows(toolSel?.[dimId]).filter(r=>r.toolName||r.toolId||r.itNum);
  }

  const allPieces=dims.length>0
    ?[...new Set(dims.flatMap(d=>getSamplePieces(d.sampling,currentJob.qty,d.samplingInterval)))].sort((a,b)=>a-b):[];
  const summary = computeMeasurementSummary({ dims, allPieces, values, missing, currentJob, unlocked });
  const gridOrder = useMemo(()=>{
    return buildGridOrder({
      dims,
      allPieces,
      missing: Object.keys(missing).map(Number),
      currentJob: currentJob ? { qty: currentJob.qty, unlocked, values } : null
    });
  },[dims,allPieces,missing,currentJob,unlocked,values]);

  function isGaugeMode(dimId){
    const rows=getActiveToolRows(dimId);
    return rows.some(row=>row.toolId && toolLibrary[row.toolId]?.type==="Go/No-Go");
  }
  function cellRequired(dimId,pNum){
    const sourceDim=dims.find(d=>d.id===dimId);
    const inPlan=getSamplePieces(sourceDim?.sampling,currentJob.qty,sourceDim?.samplingInterval).includes(pNum);
    if(inPlan)return true;
    const key=`${dimId}_${pNum}`;
    return !!(unlocked[key]&&(values[key]||"")!=="");
  }

  const hasStarted=Object.values(values).some(v=>v!==undefined&&v!=="");
  const incompletePieces=dims.length>0?allPieces.filter(pNum=>{
    if(missing[pNum])return false;
    return dims.some(dim=>cellRequired(dim.id,pNum)&&!isValueComplete(dim,values[`${dim.id}_${pNum}`]));
  }):[];
  const ootList=dims.flatMap(dim=>{
    if(isGaugeMode(dim.id))return [];
    return getSamplePieces(dim.sampling,currentJob.qty,dim.samplingInterval)
      .filter(p=>!missing[p]&&isOOT(values[`${dim.id}_${p}`],dim.tolPlus,dim.tolMinus,dim.nominal)===true)
      .map(p=>({dim,piece:p}));
  });
  const hasOOT=ootList.length>0;
  const toolRequiredDims=dims.filter(d=>{
    return Object.keys(values).some(k=>k.startsWith(`${d.id}_`)&&(values[k]!==""&&values[k]!==undefined));
  });
  const toolsReady=toolRequiredDims.every(d=>{
    const rows=getActiveToolRows(d.id);
    if(rows.length===0) return false;
    return rows.every(r=>r.toolId&&r.itNum);
  });
  const canFull=toolsReady&&incompletePieces.length===0&&!(hasOOT&&!comment.trim());
  const canPartial=toolsReady&&incompletePieces.length>0;

  async function loadJob(key){
    const job=jobs[key?.trim().toUpperCase()];
    if(!job||(job.status!=="open"&&job.status!=="draft"))return;
    setJobErr("");
    if(job.lockOwnerUserId && String(job.lockOwnerUserId)!==String(currentUserId||"")){
      const lockName=usersById?.[String(job.lockOwnerUserId)]||`User #${job.lockOwnerUserId}`;
      setJobErr(`Job is locked by ${lockName}.`);
      return;
    }
    if(onLockJob){
      try{
        await onLockJob(job.jobNumber);
      }catch(err){
        setJobErr(err?.message||"Unable to lock job. Try another.");
        return;
      }
    }
    const dd=job.status==="draft"&&job.draftData;
    const ts={};
    parts[job.partNumber]?.operations[job.operation]?.dimensions.forEach(d=>{
      const saved=dd?.toolSel?.[d.id];
      if(Array.isArray(saved)){
        ts[d.id]=normalizeToolRows(saved.map(row=>{
          const t=row?.toolId?toolLibrary[row.toolId]:null;
          return {
            toolName:row?.toolName||t?.name||"",
            toolId:row?.toolId||"",
            itNum:row?.itNum||t?.itNum||""
          };
        }));
      }else if(saved){
        const t=saved.toolId?toolLibrary[saved.toolId]:null;
        ts[d.id]=normalizeToolRows([{
          toolName:saved.toolName||t?.name||"",
          toolId:saved.toolId||"",
          itNum:saved.itNum||t?.itNum||""
        }]);
      }else{
        ts[d.id]=[{ toolName:"", toolId:"", itNum:"" }];
      }
    });
    setCurrentJob(job);setValues(dd?.values||{});setToolSel(ts);
    setUnlocked(dd?.unlocked||{});setMissing(dd?.missing||{});setComment(dd?.comment||"");
    setActiveCellKey("");
    setActiveDimId("");
    setActivePiece("");
    setImportCsv("");
    setImportErr("");
    setLastSubmitSource("manual");
    setStep("entry");
  }
  function buildRecord(status,rm){
    return {id:"r"+Date.now(),jobNumber:currentJob.jobNumber,partNumber:currentJob.partNumber,
      operation:currentJob.operation,lot:currentJob.lot,qty:currentJob.qty,
      timestamp:nowStr(),operator:(currentUserName||"").trim(),operatorUserId:currentUserId||null,values,tools:toolSel,unlocked,
      missingPieces:rm||missing,oot:hasOOT,status,comment};
  }
  async function handleFull(){
    if(hasOOT && !window.confirm("Out-of-tolerance values detected. Submit anyway?")) return;
    setSubmitting(true);setSubmitErr("");
    try{
      await onSubmit(buildRecord("complete"),currentJob.jobNumber);
      setLastSubmitSource("manual");
      setStep("success");
    }catch(err){
      setSubmitErr(err?.message||"Submit failed.");
    }finally{
      setSubmitting(false);
    }
  }
  async function handleMissingSave(r){
    setMissing(r);setShowModal(false);
    setSubmitting(true);setSubmitErr("");
    try{
      await onSubmit(buildRecord("incomplete",r),currentJob.jobNumber);
      setLastSubmitSource("manual");
      setStep("success");
    }catch(err){
      setSubmitErr(err?.message||"Submit failed.");
    }finally{
      setSubmitting(false);
    }
  }
  function handleDraft(){onDraft({jobNumber:currentJob.jobNumber,draftData:{values,toolSel,unlocked,missing,comment}});setStep("saved");}
  function triggerImportUpload(){
    if(importFileRef.current) importFileRef.current.click();
  }
  function handleImportUpload(e){
    const file=e.target.files?.[0];
    if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>setImportCsv(String(reader.result||""));
    reader.readAsText(file);
    e.target.value="";
  }
  async function handleCsvMeasurementImport(){
    if(!currentJob?.jobNumber) return;
    if(!importCsv.trim()){
      setImportErr("Paste or upload CSV content first.");
      return;
    }
    if(!currentUserId){
      setImportErr("Select a current user before importing.");
      return;
    }
    setImportErr("");
    setImportingCsv(true);
    try{
      await api.imports.jobMeasurementsCsv(currentJob.jobNumber, {
        csvText: importCsv,
        operatorUserId: Number(currentUserId),
        operationId: currentJob.operationId,
        partId: currentJob.partNumber
      }, currentRole || "Operator");
      if(onRefreshData) await onRefreshData();
      setLastSubmitSource("csv");
      setStep("success");
    }catch(err){
      setImportErr(err?.message || "Measurement CSV import failed.");
    }finally{
      setImportingCsv(false);
    }
  }
  async function handleIssueSubmit(){
    if(dataStatus!=="live"){
      setIssueErr("Issue reporting requires live data mode.");
      setIssueOk("");
      return;
    }
    if(!currentUserId){
      setIssueErr("Select a current user before submitting an issue.");
      setIssueOk("");
      return;
    }
    if(!issueDetails.trim()){
      setIssueErr("Issue details are required.");
      setIssueOk("");
      return;
    }
    setReportingIssue(true);
    setIssueErr("");
    setIssueOk("");
    try{
      await api.issues.create({
        category: issueCategory,
        details: issueDetails.trim(),
        userId: Number(currentUserId),
        partId: currentJob?.partNumber || null,
        operationId: currentJob?.operationId || null,
        jobId: currentJob?.jobNumber || null
      }, currentRole || "Operator");
      setIssueDetails("");
      setIssueOk("Issue reported successfully.");
    }catch(err){
      setIssueErr(err?.message || "Unable to submit issue report.");
    }finally{
      setReportingIssue(false);
    }
  }
  function releaseLock(){
    if(onUnlockJob&&currentJob?.jobNumber){
      onUnlockJob(currentJob.jobNumber).catch(()=>{});
    }
  }
  function reset(){
    releaseLock();
    setStep("lookup");setJobInput("");setCurrentJob(null);setValues({});setToolSel({});setUnlocked({});setMissing({});setComment("");
    setActiveCellKey("");setActiveDimId("");setActivePiece("");
  }
  function setActiveCell(cellKey, dimId, pieceNum){
    setActiveCellKey(String(cellKey||""));
    setActiveDimId(String(dimId||""));
    setActivePiece(String(pieceNum||""));
  }
  function handleCellNavKey(e, key){
    const dirMap = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
      Enter: "next"
    };
    const direction=dirMap[e.key];
    if(!direction) return;
    e.preventDefault();
    const nextKey=getNeighborKey({ order:gridOrder, currentKey:key, direction });
    if(nextKey){
      moveFocusToKey(nextKey);
      ensureVisibleCell(nextKey);
    }
  }

  useEffect(()=>{
    if(step!=="entry") return;
    if(idleRef.current) clearTimeout(idleRef.current);
    idleRef.current=setTimeout(()=>{
      if(!currentJob) return;
      if(hasStarted){
        onDraft({jobNumber:currentJob.jobNumber,draftData:{values,toolSel,unlocked,missing,comment}});
        setStep("saved");
      }else{
        setStep("lookup");
      }
      releaseLock();
    }, 20*60*1000);
    return ()=>{ if(idleRef.current) clearTimeout(idleRef.current); };
  },[step,values,toolSel,missing,comment,hasStarted,currentJob]);

  const lookupJobs = filterOperatorJobs(Object.values(jobs), {
    search: lookupFilter.search || jobInput,
    part: lookupFilter.part,
    operation: lookupFilter.operation,
    status: lookupFilter.status
  }).filter(j=>j.status==="open"||j.status==="draft");
  const facets = extractOperatorLookupFacets(Object.values(jobs).filter(j=>j.status==="open"||j.status==="draft"));
  const lookupPaging = paginateRows(lookupJobs, lookupPage, lookupPageSize);
  useEffect(()=>{ setLookupPage(1); },[lookupFilter, lookupPageSize, jobs]);
  useEffect(()=>{ if(lookupPaging.clampedPage!==lookupPage) setLookupPage(lookupPaging.clampedPage || 1); },[lookupPaging.clampedPage,lookupPage]);
  if(step==="lookup") return (
    <div>
      <OperatorStageBar step={step} />
      <div className="card">
        <div className="card-head"><div className="card-title">Job Entry</div></div>
        <div className="card-body">
          <div className="row2">
            <div className="field" style={{gridColumn:"span 2"}}>
              <label>Job Number</label>
              <AutocompleteInput value={jobInput} onChange={setJobInput}
                options={lookupJobs.map(j=>({value:j.jobNumber,job:j}))}
                filterFn={(o,inp)=>o.value.toLowerCase().includes(inp.toLowerCase())}
                placeholder="e.g. J-10042" style={{fontFamily:"var(--mono)",fontSize:"1.05rem"}}
                renderOption={o=>(
                  <div>
                    <span style={{fontFamily:"var(--mono)",color:"var(--accent2)"}}>{o.value}</span>
                    {o.job.status==="draft"&&<span className="badge badge-draft" style={{marginLeft:".5rem",fontSize:".6rem"}}>Draft</span>}
                    <div className="ac-sub">Part {o.job.partNumber} · Op {o.job.operation} · {o.job.lot} · Qty {o.job.qty}</div>
                  </div>
                )} />
              {jobInput&&!jobs[jobInput.toUpperCase()]&&<p className="text-muted mt1" style={{fontSize:".75rem"}}>Job not found.</p>}
              {jobInput&&jobs[jobInput.toUpperCase()]?.status==="closed"&&<p className="mt1 text-warn" style={{fontSize:".75rem"}}>Job is closed.</p>}
              {(jobs[jobInput.toUpperCase()]?.status==="open"||jobs[jobInput.toUpperCase()]?.status==="draft")&&jobInput&&<p className="mt1 text-ok" style={{fontSize:".75rem"}}>Job found.</p>}
            </div>
          </div>
          <div className="chip-row">
            <button className={`chip-btn ${lookupFilter.part===""?"active":""}`} onClick={()=>setLookupFilter(p=>({...p,part:""}))}>All Parts</button>
            {facets.parts.slice(0,8).map((partId)=>(
              <button key={partId} className={`chip-btn ${lookupFilter.part===partId?"active":""}`} onClick={()=>setLookupFilter(p=>({...p,part:partId}))}>{partId}</button>
            ))}
          </div>
          <div className="chip-row">
            <button className={`chip-btn ${lookupFilter.operation===""?"active":""}`} onClick={()=>setLookupFilter(p=>({...p,operation:""}))}>All Ops</button>
            {facets.operations.slice(0,8).map((op)=>(
              <button key={op} className={`chip-btn ${lookupFilter.operation===op?"active":""}`} onClick={()=>setLookupFilter(p=>({...p,operation:op}))}>Op {op}</button>
            ))}
            <button className={`chip-btn ${lookupFilter.status==="open"?"active":""}`} onClick={()=>setLookupFilter(p=>({...p,status:"open"}))}>Open</button>
            <button className={`chip-btn ${lookupFilter.status==="draft"?"active":""}`} onClick={()=>setLookupFilter(p=>({...p,status:"draft"}))}>Draft</button>
          </div>
          <div className="text-muted" style={{fontSize:".75rem",marginTop:".65rem"}}>
            Current User: <span style={{color:"var(--text)",fontWeight:600}}>{currentUserName || "— Select user above —"}</span>
          </div>
          {jobErr&&<p className="err-text mt1">{jobErr}</p>}
          <div className="mt2">
            <button className="btn btn-primary"
              disabled={!currentUserId||!jobs[jobInput.toUpperCase()]||(jobs[jobInput.toUpperCase()]?.status!=="open"&&jobs[jobInput.toUpperCase()]?.status!=="draft")}
              onClick={()=>{
                if(!currentUserId){ setJobErr("Select a current user before loading a job."); return; }
                loadJob(jobInput);
              }}>Load Job →</button>
          </div>
        </div>
      </div>
      <div className="card" style={{padding:0,overflow:"hidden"}}>
        <div className="card-head"><div className="card-title">Available Jobs</div><div className="text-muted" style={{fontSize:".7rem"}}>Click to select</div></div>
        <table className="data-table">
          <thead><tr><th>Job #</th><th>Part</th><th>Operation</th><th>Lot</th><th>Qty</th><th>Status</th></tr></thead>
          <tbody>
            {lookupPaging.pageRows.length===0&&<tr><td colSpan={6}><div className="empty-state">No open jobs.</div></td></tr>}
            {lookupPaging.pageRows.map(j=>(
              <tr key={j.jobNumber} className="tr-click" onClick={()=>setJobInput(j.jobNumber)}>
                <td className="mono accent-text">{j.jobNumber}</td>
                <td className="mono">{j.partNumber}</td>
                <td>Op {j.operation} — {parts[j.partNumber]?.operations[j.operation]?.label}</td>
                <td>{j.lot}</td><td className="mono">{j.qty}</td>
                <td>
                  {j.status==="draft"?<span className="badge badge-draft">Draft</span>:<span className="badge badge-open">Open</span>}
                  {j.lockOwnerUserId&&String(j.lockOwnerUserId)!==String(currentUserId||"")&&(
                    <div className="text-muted" style={{fontSize:".7rem"}}>Locked by {usersById?.[String(j.lockOwnerUserId)]||`User #${j.lockOwnerUserId}`}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationControls page={lookupPage} totalPages={lookupPaging.totalPages} pageSize={lookupPageSize} onPageChange={setLookupPage} onPageSizeChange={setLookupPageSize} />
        <div className="text-muted" style={{padding:"0 .85rem .7rem",fontSize:".72rem"}}>{lookupPaging.totalRows} matching job(s)</div>
      </div>
    </div>
  );

  if(step==="entry") return (
    <div>
      <input ref={importFileRef} type="file" accept=".csv,text/csv" style={{display:"none"}} onChange={handleImportUpload}/>
      {showModal&&<MissingPieceModal pieces={incompletePieces} missingPieces={missing} onSave={handleMissingSave} onCancel={()=>setShowModal(false)}/>}
      <OperatorStageBar step={step} />
      <PinnedSpecLegend currentJob={currentJob} part={part} opData={opData} />
      <div className="job-strip">
        <div className="strip-field"><div className="strip-label">Job #</div><div className="strip-val">{currentJob.jobNumber}</div></div>
        <div className="strip-field"><div className="strip-label">Part</div><div className="strip-val">{currentJob.partNumber} <span style={{fontFamily:"var(--sans)",fontSize:".78rem",color:"var(--muted)"}}>{part?.description}</span></div></div>
        <div className="strip-field"><div className="strip-label">Operation</div><div className="strip-val">Op {currentJob.operation} — <span style={{fontFamily:"var(--sans)",fontSize:".82rem",color:"var(--text)"}}>{opData?.label}</span></div></div>
        <div className="strip-field"><div className="strip-label">Lot</div><div className="strip-val">{currentJob.lot}</div></div>
        <div className="strip-field"><div className="strip-label">Qty</div><div className="strip-val">{currentJob.qty} pcs</div></div>
        <div className="strip-field"><div className="strip-label">Operator</div><div className="strip-val" style={{fontFamily:"var(--sans)",fontSize:".85rem",color:"var(--text)"}}>{currentUserName || "—"}</div></div>
        <button className="btn btn-ghost btn-sm" style={{marginLeft:"auto"}} onClick={reset}>← Back</button>
      </div>

      <div className="card" style={{padding:0}}>
        <div className="card-head">
          <div className="card-title">Measurement Entry</div>
          <div className="gap1">
            <button className={`btn btn-ghost btn-sm ${density===TABLE_DENSITY.compact?"active":""}`} onClick={()=>{ const next=writeTableDensity(TABLE_DENSITY.compact); setDensity(next); }}>Compact</button>
            <button className={`btn btn-ghost btn-sm ${density===TABLE_DENSITY.expanded?"active":""}`} onClick={()=>{ const next=writeTableDensity(TABLE_DENSITY.expanded); setDensity(next); }}>Expanded</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setColWidths(p=>applyColumnWidthPreset(dims.map(d=>d.id),"narrow",p))}>Narrow</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setColWidths(p=>applyColumnWidthPreset(dims.map(d=>d.id),"default",p))}>Default</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setColWidths(p=>applyColumnWidthPreset(dims.map(d=>d.id),"wide",p))}>Wide</button>
          </div>
          <div className="text-muted ux-hint">+ unlocks N/A cells · × re-locks empty cells · Enter/Arrow keys move between cells · Esc clears a value · auto-save after 20 min idle · drag near any column edge to resize</div>
        </div>
        <div className="meas-scroll">
          <table className={`meas-table ${density===TABLE_DENSITY.compact?"compact":"expanded"}`} onMouseDown={maybeStartResize} style={{width: 118 + dims.reduce((s,d)=>s+getColWidth(d.id),0)}}>
            <colgroup>
              <col style={{width:"118px"}}/>
              {dims.map(d=><col key={d.id} style={{width:getColWidth(d.id)+"px"}}/>)}
            </colgroup>
            <tbody>
              <tr className="hrow sticky-row sticky-1">
                <td className="rl">Dimension</td>
                {dims.map(d=>(
                  <td key={d.id} data-dim-id={d.id} className="dc" style={{padding:0,verticalAlign:"top",position:"relative"}}>
                    <div className="dim-hdr"><div className="dim-hdr-name">{d.name}</div><div className="dim-hdr-spec">{fmtSpec(d)}</div></div>
                    <div className="col-resize" onMouseDown={e=>startResize(e,d.id)}/>
                  </td>
                ))}
              </tr>
              <tr className="hrow sticky-row sticky-2">
                <td className="rl">Tools / IT #</td>
                {dims.map(d=>{
                  const allowedTools=d.tools.map(tid=>toolLibrary[tid]).filter(isToolSelectable);
                  const toolNames=[...new Set(allowedTools.map(t=>t.name))];
                  const rows=getToolRows(d.id);
                  return (
                    <td key={d.id} data-dim-id={d.id} className="dc hdr-cell" style={{verticalAlign:"top"}}>
                      <div style={{display:"flex",flexDirection:"column",gap:".35rem"}}>
                        {rows.map((row,rowIdx)=>{
                          const selectedName=row.toolName||"";
                          const itOptions=selectedName?allowedTools.filter(t=>t.name===selectedName):allowedTools;
                          const itListId=`itlist_${d.id}_${rowIdx}`;
                          const currentIt=(row.itNum||"").toUpperCase();
                          const match=allowedTools.find(t=>String(t.itNum).toUpperCase()===currentIt);
                          const invalid=currentIt && !match;
                          return (
                            <div key={`${d.id}_${rowIdx}`} style={{display:"grid",gridTemplateColumns:"1fr 1fr auto auto",gap:".3rem",alignItems:"start"}}>
                              <select className="hdr-inp" value={selectedName}
                                onChange={e=>{
                                  const name=e.target.value;
                                  setToolRows(d.id, prev=>prev.map((r,i)=>i===rowIdx?{...r,toolName:name,toolId:"",itNum:""}:r));
                                }}>
                                <option value="">— Select Tool —</option>
                                {toolNames.map(name=><option key={name} value={name}>{name}</option>)}
                              </select>
                              <div>
                                <input className="hdr-inp mf" list={itListId} value={currentIt}
                                  placeholder={selectedName ? "Type or select IT #" : "Type IT #"}
                                  onChange={e=>{
                                    const v=e.target.value.toUpperCase();
                                    const t=allowedTools.find(x=>String(x.itNum).toUpperCase()===v);
                                    setToolRows(d.id, prev=>prev.map((r,i)=>i===rowIdx?{...r,toolName:t?.name||r.toolName||"",toolId:t?.id||"",itNum:v}:r));
                                  }}
                                  onBlur={()=>{
                                    if(!currentIt){
                                      setToolRows(d.id, prev=>prev.map((r,i)=>i===rowIdx?{...r,toolId:"",itNum:""}:r));
                                      return;
                                    }
                                    if(match){
                                      setToolRows(d.id, prev=>prev.map((r,i)=>i===rowIdx?{...r,toolName:match.name,toolId:match.id,itNum:match.itNum}:r));
                                    }
                                  }}
                                />
                                <datalist id={itListId}>
                                  {itOptions.map(t=><option key={t.id} value={t.itNum}>{t.itNum}</option>)}
                                </datalist>
                                {invalid && <div className="text-warn" style={{fontSize:".65rem",marginTop:".2rem"}}>IT # not found for selected tool</div>}
                              </div>
                              <button className="btn btn-ghost btn-xs" type="button"
                                onClick={()=>setToolRows(d.id, prev=>[...prev,{toolName:"",toolId:"",itNum:""}])}>+</button>
                              <button className="btn btn-danger btn-xs" type="button" disabled={rows.length===1}
                                onClick={()=>setToolRows(d.id, prev=>{
                                  const next=prev.filter((_,i)=>i!==rowIdx);
                                  return next.length?next:[{toolName:"",toolId:"",itNum:""}];
                                })}>−</button>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
              <tr className="hrow sticky-row sticky-3">
                <td className="rl">Sampling</td>
                {dims.map(d=>(
                  <td key={d.id} data-dim-id={d.id} className="dc tag-cell">
                    <span className="sample-tag">{samplingLabel(d.sampling,d.samplingInterval)}</span>
                    {isGaugeMode(d.id)&&<span className="gauge-tag">Go/No-Go</span>}
                    {(d.inputMode||"single")==="range" && !isGaugeMode(d.id) && <span className="range-tag">Range</span>}
                  </td>
                ))}
              </tr>
              <tr className="div-row">
                <td style={{padding:0,height:"2px",borderBottom:"2px solid var(--accent)"}}/>
                {dims.map(d=><td key={d.id} data-dim-id={d.id} style={{padding:0,height:"2px",borderBottom:"2px solid var(--accent)"}}/>)}
              </tr>
              {allPieces.map(pNum=>{
                const isMissing=!!missing[pNum];
                const rowClass = `${isMissing?" mr":""}${String(activePiece)===String(pNum)?" is-active-row":""}`;
                return (
                  <tr className={`pr${rowClass}`} key={pNum}>
                    <td className="rl" style={{verticalAlign:"top",paddingTop:".45rem"}}>
                      Pc {pNum}
                      {isMissing&&<div className="mp-tag">{missing[pNum].reason}{missing[pNum].ncNum&&` · ${missing[pNum].ncNum}`}</div>}
                    </td>
                    {dims.map(dim=>{
                      const key=`${dim.id}_${pNum}`;
                      const inPlan=getSamplePieces(dim.sampling,currentJob.qty,dim.samplingInterval).includes(pNum);
                      const isUnlocked=!!unlocked[key];
                      const hasVal=isValueComplete(dim,values[key]);
                      const gaugeMode=isGaugeMode(dim.id);
                      const rangeMode=(dim.inputMode||"single")==="range" && !gaugeMode;
                      if(isMissing){
                        return <td key={dim.id} data-dim-id={dim.id} className={cellHighlightClasses({ activeKey:activeCellKey, cellKey:key, activeDimId, dimId:dim.id, activePiece, pieceNum:pNum })} style={{textAlign:"center",color:"var(--border2)",fontFamily:"var(--mono)",fontSize:".78rem",padding:".26rem .4rem",verticalAlign:"middle"}}>—</td>;
                      }
                      if(!inPlan&&!isUnlocked){
                        return <td key={dim.id} data-dim-id={dim.id} className={cellHighlightClasses({ activeKey:activeCellKey, cellKey:key, activeDimId, dimId:dim.id, activePiece, pieceNum:pNum })} style={{padding:".26rem .4rem",verticalAlign:"middle"}}><button className="na-btn" data-cell-key={key} onFocus={()=>setActiveCell(key,dim.id,pNum)} onKeyDown={(e)=>handleCellNavKey(e,key)} onClick={()=>setUnlocked(p=>({...p,[key]:true}))}>+</button></td>;
                      }
                      if(isUnlocked&&!hasVal&&!inPlan){
                        return (
                          <td key={dim.id} data-dim-id={dim.id} className={cellHighlightClasses({ activeKey:activeCellKey, cellKey:key, activeDimId, dimId:dim.id, activePiece, pieceNum:pNum })} style={{padding:".26rem .4rem",verticalAlign:"middle"}}>
                            <div className="ue-wrap">
                              {gaugeMode?(
                                <div className="pf-wrap" style={{flex:1}}>
                                  <button className={`pf-btn${values[key]==="PASS"?" pass-on":""}`} data-cell-key={key} onFocus={()=>setActiveCell(key,dim.id,pNum)} onKeyDown={(e)=>handleCellNavKey(e,key)} onClick={()=>togglePf(key,"PASS")}>P</button>
                                  <button className={`pf-btn${values[key]==="FAIL"?" fail-on":""}`} onClick={()=>togglePf(key,"FAIL")}>F</button>
                                </div>
                              ):(
                                rangeMode?(
                                  <div style={{display:"flex",gap:".35rem",flex:1}}>
                                    <input className="vi ux" type="number" min="0" step="0.0001" placeholder="Min" value={splitRange(values[key])[0]}
                                      data-cell-key={key}
                                      onFocus={()=>setActiveCell(key,dim.id,pNum)}
                                      onKeyDown={e=>{preventNegative(e);handleValueKeyDown(e,key);handleCellNavKey(e,key);}}
                                      onChange={e=>setRangeValue(key,"min",e.target.value)} style={{flex:1}}/>
                                    <input className="vi ux" type="number" min="0" step="0.0001" placeholder="Max" value={splitRange(values[key])[1]}
                                      data-cell-key={key}
                                      onFocus={()=>setActiveCell(key,dim.id,pNum)}
                                      onKeyDown={e=>{preventNegative(e);handleValueKeyDown(e,key);handleCellNavKey(e,key);}}
                                      onChange={e=>setRangeValue(key,"max",e.target.value)} style={{flex:1}}/>
                                  </div>
                                ):(
                                  <input className="vi ux" type="number" min="0" step="0.0001" placeholder="0.0000" value={values[key]||""}
                                    data-cell-key={key}
                                    onFocus={()=>setActiveCell(key,dim.id,pNum)}
                                    onKeyDown={e=>{preventNegative(e);handleValueKeyDown(e,key);handleCellNavKey(e,key);}}
                                    onChange={e=>setValues(p=>({...p,[key]:e.target.value}))} style={{flex:1}}/>
                                )
                              )}
                              <button className="relock-btn" onClick={()=>setUnlocked(p=>{const n={...p};delete n[key];return n;})}>×</button>
                            </div>
                          </td>
                        );
                      }
                      if(gaugeMode){
                        const v=values[key];
                        return (
                          <td key={dim.id} data-dim-id={dim.id} className={cellHighlightClasses({ activeKey:activeCellKey, cellKey:key, activeDimId, dimId:dim.id, activePiece, pieceNum:pNum })} style={{padding:".26rem .4rem",verticalAlign:"middle"}}>
                            <div className="pf-wrap">
                              <button className={`pf-btn${v==="PASS"?" pass-on":""}`} data-cell-key={key} onFocus={()=>setActiveCell(key,dim.id,pNum)} onKeyDown={(e)=>handleCellNavKey(e,key)} onClick={()=>togglePf(key,"PASS")}>Pass</button>
                              <button className={`pf-btn${v==="FAIL"?" fail-on":""}`} onClick={()=>togglePf(key,"FAIL")}>Fail</button>
                            </div>
                          </td>
                        );
                      }
                      const v=values[key]??"";
                      const st=isOOT(v,dim.tolPlus,dim.tolMinus,dim.nominal);
                      const cls=v===""?"":st===false?"ok":"oot";
                      return (
                        <td key={dim.id} data-dim-id={dim.id} className={cellHighlightClasses({ activeKey:activeCellKey, cellKey:key, activeDimId, dimId:dim.id, activePiece, pieceNum:pNum })} style={{padding:".26rem .4rem",verticalAlign:"middle"}}>
                          {rangeMode?(
                            <div style={{display:"flex",gap:".35rem"}}>
                              <input className={`vi ${cls}${isUnlocked?" ux":""}`} type="number" min="0" step="0.0001"
                                data-cell-key={key}
                                onFocus={()=>setActiveCell(key,dim.id,pNum)}
                                value={splitRange(v)[0]} placeholder="Min" onKeyDown={e=>{preventNegative(e);handleValueKeyDown(e,key);handleCellNavKey(e,key);}} onChange={e=>setRangeValue(key,"min",e.target.value)} style={{flex:1}}/>
                              <input className={`vi ${cls}${isUnlocked?" ux":""}`} type="number" min="0" step="0.0001"
                                data-cell-key={key}
                                onFocus={()=>setActiveCell(key,dim.id,pNum)}
                                value={splitRange(v)[1]} placeholder="Max" onKeyDown={e=>{preventNegative(e);handleValueKeyDown(e,key);handleCellNavKey(e,key);}} onChange={e=>setRangeValue(key,"max",e.target.value)} style={{flex:1}}/>
                            </div>
                          ):(
                            <input className={`vi ${cls}${isUnlocked?" ux":""}`} type="number" min="0" step="0.0001"
                              data-cell-key={key}
                              onFocus={()=>setActiveCell(key,dim.id,pNum)}
                              value={v} placeholder="0.0000" onKeyDown={e=>{preventNegative(e);handleValueKeyDown(e,key);handleCellNavKey(e,key);}} onChange={e=>setValues(p=>({...p,[key]:e.target.value}))}/>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="meas-summary" aria-live="polite">
            <span className="badge badge-ok">Pass {summary.passCount}</span>
            <span className="badge badge-oot">Fail {summary.failCount}</span>
            <span className="badge badge-pend">N/A {summary.naCount}</span>
            <span className="badge badge-open">Measured {summary.measuredCount}</span>
          </div>
        </div>
      </div>

      {hasOOT&&(
        <div className="oot-banner">
          <div className="oot-icon">▲</div>
          <div>
            <div className="oot-title">Out-of-Tolerance Detected</div>
            <div className="oot-body">{ootList.map((o,i)=><span key={i}>{o.dim.name} — Pc {o.piece}{i<ootList.length-1?",  ":""}</span>)}<br/>Comment required before submitting.</div>
          </div>
        </div>
      )}
      <div className="sr-only" aria-live="polite">{hasOOT ? `${ootList.length} out-of-tolerance measurement${ootList.length===1?"":"s"} detected.` : "All current measurements are within tolerance."}</div>
      {hasStarted&&incompletePieces.length>0&&(
        <div className="inc-banner">
          <div className="inc-title">Incomplete Data — {incompletePieces.length} piece{incompletePieces.length!==1?"s":""} missing values</div>
          <p style={{fontSize:".78rem",color:"#a08040",lineHeight:1.5,marginBottom:".55rem"}}>Pieces {incompletePieces.join(", ")} have unfilled measurements. Save draft to return later, or Partial Submit to log reasons and close for supervisor review.</p>
          <div className="gap1">{incompletePieces.map(p=><span key={p} className="badge badge-incomplete">Pc {p}</span>)}</div>
        </div>
      )}
      <div className="card">
        <div className="card-head"><div className="card-title">Operation CSV Import</div></div>
        <div className="card-body">
          <p className="text-muted" style={{marginTop:0,fontSize:".74rem"}}>Upload a single operation measurement CSV for this loaded job. This is operator-facing ingest for data from CMM/other local systems.</p>
          <textarea value={importCsv} onChange={e=>setImportCsv(e.target.value)} rows={5} placeholder="piece_number,dimension_name,value,is_oot,tool_it_nums,missing_reason,nc_num,details" style={{fontFamily:"var(--mono)",fontSize:".72rem"}}/>
          <div className="gap1 mt1">
            <button className="btn btn-ghost btn-sm" onClick={()=>setImportCsv("piece_number,dimension_name,value,is_oot,tool_it_nums,missing_reason,nc_num,details\n1,Bore Diameter,0.6250,false,IT-0031,,,")}>Load Sample</button>
            <button className="btn btn-ghost btn-sm" onClick={triggerImportUpload}>Upload CSV</button>
            <button className="btn btn-primary btn-sm" disabled={importingCsv} onClick={handleCsvMeasurementImport}>{importingCsv?"Importing…":"Import & Close Job"}</button>
          </div>
          {importErr&&<p className="err-text mt1">{importErr}</p>}
        </div>
      </div>
      <div className="card">
        <div className="card-head"><div className="card-title">{hasOOT?"OOT Comment (Required)":"Comments"}</div></div>
        <div className="card-body">
          <textarea value={comment} onChange={e=>setComment(e.target.value)}
            placeholder={hasOOT?"Describe the out-of-tolerance condition and corrective action...":"Optional notes…"}/>
          <div className="mt2 gap1">
            <button className="btn btn-primary" disabled={!canFull||submitting} onClick={handleFull}>{submitting?"Submitting…":"Submit & Close Job"}</button>
            {canPartial&&<button className="btn btn-partial" disabled={submitting} onClick={()=>setShowModal(true)}>Partial Submit…</button>}
            <button className="btn btn-draft" disabled={submitting} onClick={handleDraft}>Save Draft</button>
            {!toolsReady&&<span className="text-muted">Tool &amp; IT # required for any measured dimension</span>}
            {toolsReady&&hasOOT&&!comment.trim()&&<span className="text-warn" style={{fontSize:".75rem"}}>Comment required for OOT</span>}
          </div>
          {submitErr&&<p className="err-text mt1">{submitErr}</p>}
        </div>
      </div>
      <div className="card">
        <div className="card-head"><div className="card-title">Report Issue</div></div>
        <div className="card-body">
          <div className="row2">
            <div className="field">
              <label>Category</label>
              <select value={issueCategory} onChange={e=>setIssueCategory(e.target.value)}>
                {ISSUE_CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="field" style={{gridColumn:"span 2"}}>
              <label>Details</label>
              <textarea value={issueDetails} onChange={e=>setIssueDetails(e.target.value)} placeholder="Describe the issue, what you expected, and what happened." />
            </div>
          </div>
          <div className="gap1 mt1">
            <button className="btn btn-ghost" onClick={handleIssueSubmit} disabled={reportingIssue || !issueDetails.trim()}>
              {reportingIssue ? "Submitting…" : "Submit Issue"}
            </button>
            {issueOk && <span className="text-ok">{issueOk}</span>}
            {issueErr && <span className="text-warn">{issueErr}</span>}
          </div>
        </div>
      </div>
    </div>
  );

  if(step==="saved") return (
    <div className="draft-card">
      <OperatorStageBar step={step} />
      <div style={{fontSize:"2rem"}}>💾</div>
      <div className="draft-title">Draft Saved</div>
      <p className="text-muted">Job <strong style={{color:"var(--draft)"}}>{currentJob.jobNumber}</strong> saved. Resume anytime from the job list.</p>
      <div className="gap1 mt1"><button className="btn btn-ghost" onClick={reset}>Back to Job List</button></div>
    </div>
  );
  return (
    <div className="success-card">
      <OperatorStageBar step={step} />
      <div style={{fontSize:"2rem"}}>✔</div>
      <div className="success-title">{lastSubmitSource==="csv" ? "CSV Imported — Job Closed" : "Record Submitted — Job Closed"}</div>
      <p className="text-muted">Job <strong style={{color:"var(--accent2)"}}>{currentJob?.jobNumber}</strong> · {currentJob?.lot} · Op {currentJob?.operation}</p>
      {hasOOT&&<p className="text-warn" style={{fontSize:".8rem"}}>OOT recorded — notify supervisor.</p>}
      <div className="gap1 mt1"><button className="btn btn-ghost" onClick={reset}>Enter Another Job</button></div>
    </div>
  );
}
