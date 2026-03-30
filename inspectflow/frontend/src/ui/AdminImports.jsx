import React, { useState, useRef, useEffect } from "react";
import { api } from "../api/index.js";
import { ConfirmDialog } from "./confirmDialog.jsx";
import { fmtTs } from "./appHelpers.js";

export function AdminImports({ currentRole, canManageTools, canManageParts, canManageJobs, onRefreshData }) {
  const [templates,setTemplates]=useState(null);
  const [loadingTemplates,setLoadingTemplates]=useState(false);
  const [toolsCsv,setToolsCsv]=useState("");
  const [partDimsCsv,setPartDimsCsv]=useState("");
  const [jobsCsv,setJobsCsv]=useState("");
  const [measurementsCsv,setMeasurementsCsv]=useState("");
  const [running,setRunning]=useState("");
  const [err,setErr]=useState("");
  const [result,setResult]=useState("");
  const [activeUploadTarget,setActiveUploadTarget]=useState("tools");
  const fileInputRef=useRef(null);
  const [integrations,setIntegrations]=useState([]);
  const [loadingIntegrations,setLoadingIntegrations]=useState(false);
  const [integrationBusy,setIntegrationBusy]=useState("");
  const [integrationForm,setIntegrationForm]=useState({
    name:"",
    sourceType:"api_pull",
    importType:"jobs",
    endpointUrl:"",
    pollIntervalMinutes:"",
    enabled:true
  });
  const [unresolved,setUnresolved]=useState([]);
  const [loadingUnresolved,setLoadingUnresolved]=useState(false);
  const [unresolvedBusy,setUnresolvedBusy]=useState("");
  const [resolveEdits,setResolveEdits]=useState({});

  useEffect(()=>{
    let active=true;
    async function loadAll(){
      setLoadingTemplates(true);
      setLoadingIntegrations(true);
      setLoadingUnresolved(true);
      try{
        const [rows, integrationRows, unresolvedRows]=await Promise.all([
          api.imports.templates(currentRole || "Admin"),
          api.imports.integrations(currentRole || "Admin"),
          api.imports.unresolved(currentRole || "Admin", { status:"open", limit:100 })
        ]);
        if(!active) return;
        setTemplates(rows);
        setIntegrations(integrationRows||[]);
        setUnresolved(unresolvedRows||[]);
      }catch{
        if(!active) return;
      }finally{
        if(active){
          setLoadingTemplates(false);
          setLoadingIntegrations(false);
          setLoadingUnresolved(false);
        }
      }
    }
    loadAll();
    return ()=>{ active=false; };
  },[currentRole]);

  async function refreshIntegrations(){
    setLoadingIntegrations(true);
    try{
      const rows=await api.imports.integrations(currentRole || "Admin");
      setIntegrations(rows||[]);
    }finally{
      setLoadingIntegrations(false);
    }
  }

  async function refreshUnresolved(){
    setLoadingUnresolved(true);
    try{
      const rows=await api.imports.unresolved(currentRole || "Admin", { status:"open", limit:100 });
      setUnresolved(rows||[]);
    }finally{
      setLoadingUnresolved(false);
    }
  }

  function buildTemplateCsv(kind){
    const headers=kind==="tools"
      ? (templates?.tools?.headers || [])
      : kind==="partDimensions"
        ? (templates?.partDimensions?.headers || [])
        : kind==="jobs"
          ? (templates?.jobs?.headers || [])
          : kind==="measurements"
            ? (templates?.measurements?.headers || [])
            : (templates?.operatorMeasurement?.headers || []);
    if(!headers.length) return "";
    const sampleRow=kind==="tools"
      ? ["Outside Micrometer","Variable","IT-1001","0-4 in","true","true"]
      : kind==="partDimensions"
        ? ["1234","Hydraulic Cylinder Body","010","Rough Turn","Outer Diameter","1.0000","0.0050","0.0050","in","first_middle_last","","single","IT-0042|IT-0018"]
        : kind==="jobs"
          ? ["J-IMP-1001","1234","A","","020","Lot X",12,"open"]
          : kind==="measurements"
            ? ["batch-001","J-10042","1234","A","020",1,"Bore Diameter","0.6250","false",1,"complete","Imported from CMM","IT-0031","","",""]
            : [1,"Bore Diameter","0.6250","false","IT-0031","","",""];
    return `${headers.join(",")}\n${sampleRow.slice(0, headers.length).join(",")}`;
  }

  function downloadTemplate(kind){
    const csv=buildTemplateCsv(kind);
    if(!csv){
      setErr("Template headers are not available.");
      return;
    }
    const blob=new Blob([csv],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=kind==="tools"
      ? "tools-import-template.csv"
      : kind==="partDimensions"
        ? "part-dimensions-import-template.csv"
        : kind==="jobs"
          ? "jobs-import-template.csv"
          : kind==="measurements"
            ? "measurements-import-template.csv"
            : "operator-measurements-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runImport(kind){
    if(running) return;
    const csvText=(kind==="tools"
      ? toolsCsv
      : kind==="partDimensions"
        ? partDimsCsv
        : kind==="jobs"
          ? jobsCsv
          : measurementsCsv).trim();
    if(!csvText){
      setErr("Paste CSV text or upload a CSV file first.");
      return;
    }
    setErr("");
    setResult("");
    setRunning(kind);
    try{
      const response=kind==="tools"
        ?await api.imports.toolsCsv(csvText, currentRole || "Admin")
        :kind==="partDimensions"
          ?await api.imports.partDimensionsCsv(csvText, currentRole || "Admin")
          :kind==="jobs"
            ?await api.imports.jobsCsv(csvText, currentRole || "Admin")
            :await api.imports.measurementsBulk({ csvText }, currentRole || "Admin");
      setResult(JSON.stringify(response, null, 2));
      if(onRefreshData) await onRefreshData();
      await refreshUnresolved();
    }catch(e){
      setErr(e?.message || "Import failed.");
    }finally{
      setRunning("");
    }
  }

  function triggerUpload(target){
    setActiveUploadTarget(target);
    if(fileInputRef.current) fileInputRef.current.click();
  }

  function handleCsvUpload(e){
    const file=e.target.files?.[0];
    if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>{
      const text=String(reader.result || "");
      if(activeUploadTarget==="tools") setToolsCsv(text);
      else if(activeUploadTarget==="partDimensions") setPartDimsCsv(text);
      else if(activeUploadTarget==="jobs") setJobsCsv(text);
      else setMeasurementsCsv(text);
    };
    reader.readAsText(file);
    e.target.value="";
  }

  async function saveIntegration(){
    if(integrationBusy) return;
    if(!integrationForm.name.trim()){
      setErr("Integration name is required.");
      return;
    }
    setErr("");
    setIntegrationBusy("save");
    try{
      await api.imports.createIntegration({
        name:integrationForm.name.trim(),
        sourceType:integrationForm.sourceType,
        importType:integrationForm.importType,
        endpointUrl:integrationForm.endpointUrl.trim()||null,
        pollIntervalMinutes:integrationForm.pollIntervalMinutes?Number(integrationForm.pollIntervalMinutes):null,
        enabled:integrationForm.enabled
      }, currentRole || "Admin");
      setIntegrationForm({ name:"", sourceType:"api_pull", importType:"jobs", endpointUrl:"", pollIntervalMinutes:"", enabled:true });
      await refreshIntegrations();
    }catch(e){
      setErr(e?.message || "Unable to save integration.");
    }finally{
      setIntegrationBusy("");
    }
  }

  async function pullIntegration(integrationId){
    if(integrationBusy) return;
    setErr("");
    setResult("");
    setIntegrationBusy(String(integrationId));
    try{
      const response=await api.imports.pullIntegration(integrationId, {}, currentRole || "Admin");
      setResult(JSON.stringify(response, null, 2));
      if(onRefreshData) await onRefreshData();
      await Promise.all([refreshIntegrations(), refreshUnresolved()]);
    }catch(e){
      setErr(e?.message || "Integration pull failed.");
    }finally{
      setIntegrationBusy("");
    }
  }

  function editForUnresolved(item){
    if(resolveEdits[item.id]) return resolveEdits[item.id];
    const inferred=item.payload?.inferred || {};
    return {
      jobId: inferred.jobId || "",
      operationId: inferred.operationId || "",
      partId: inferred.partId || "",
      operatorUserId: inferred.operatorUserId || "",
      dimensionId: inferred.dimensionId || "",
      dimensionName: inferred.dimensionName || "",
      pieceNumber: inferred.pieceNumber || "",
      value: inferred.value || "",
      status: inferred.status || "",
      comment: inferred.comment || "",
      missingReason: inferred.missingReason || "",
      ncNum: inferred.ncNum || "",
      details: inferred.details || ""
    };
  }

  function setUnresolvedEdit(id, patch){
    const item=unresolved.find(u=>u.id===id);
    const base=item?editForUnresolved(item):{};
    setResolveEdits(prev=>({ ...prev, [id]: { ...base, ...prev[id], ...patch } }));
  }

  async function resolveUnresolved(item){
    if(unresolvedBusy) return;
    const edit=editForUnresolved(item);
    setUnresolvedBusy(`resolve_${item.id}`);
    try{
      await api.imports.resolveUnresolved(item.id, { assignment: edit }, currentRole || "Admin");
      await Promise.all([refreshUnresolved(), onRefreshData ? onRefreshData() : Promise.resolve()]);
    }catch(e){
      setErr(e?.message || "Unable to resolve item.");
    }finally{
      setUnresolvedBusy("");
    }
  }

  async function ignoreUnresolved(item){
    if(unresolvedBusy) return;
    setUnresolvedBusy(`ignore_${item.id}`);
    try{
      await api.imports.ignoreUnresolved(item.id, {}, currentRole || "Admin");
      await refreshUnresolved();
    }catch(e){
      setErr(e?.message || "Unable to ignore item.");
    }finally{
      setUnresolvedBusy("");
    }
  }

  return (
    <div className="stack1">
      <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{display:"none"}} onChange={handleCsvUpload}/>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Data Imports</div>
          <div className="text-muted" style={{fontSize:".72rem"}}>
            {loadingTemplates ? "Loading templates…" : "Use templates to import tools, part dimensions, jobs, and measurement data via CSV."}
          </div>
        </div>
        <div className="card-body">
          {err && <div className="err-text">{err}</div>}
          {result && (
            <pre style={{margin:0,padding:".7rem",background:"var(--bg-soft)",border:"1px solid var(--border)",borderRadius:"10px",fontSize:".72rem",overflowX:"auto"}}>{result}</pre>
          )}
          <div className="row2 mt1">
            <div className="card" style={{margin:0}}>
              <div className="card-head"><div className="card-title">Tools CSV Import</div></div>
              <div className="card-body">
                <p className="text-muted" style={{marginTop:0,fontSize:".74rem"}}>Upsert tools by name, IT #, type, and visibility fields.</p>
                <textarea value={toolsCsv} onChange={e=>setToolsCsv(e.target.value)} rows={8} placeholder="Paste tools CSV here…" style={{fontFamily:"var(--mono)",fontSize:".72rem"}}/>
                <div className="gap1 mt1">
                  <button className="btn btn-ghost btn-sm" onClick={()=>downloadTemplate("tools")}>Download Template</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setToolsCsv(buildTemplateCsv("tools"))}>Load Sample</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>triggerUpload("tools")}>Upload CSV</button>
                  <button className="btn btn-primary btn-sm" disabled={!canManageTools || running==="tools"} onClick={()=>runImport("tools")}>
                    {running==="tools" ? "Importing…" : "Run Tool Import"}
                  </button>
                </div>
                {!canManageTools && <div className="text-muted" style={{fontSize:".72rem",marginTop:".4rem"}}>Permission required: `manage_tools`.</div>}
              </div>
            </div>
            <div className="card" style={{margin:0}}>
              <div className="card-head"><div className="card-title">Part Dimensions CSV Import</div></div>
              <div className="card-body">
                <p className="text-muted" style={{marginTop:0,fontSize:".74rem"}}>Upsert part, operation, and dimension definitions including sampling plan and input mode.</p>
                <textarea value={partDimsCsv} onChange={e=>setPartDimsCsv(e.target.value)} rows={8} placeholder="Paste part dimensions CSV here…" style={{fontFamily:"var(--mono)",fontSize:".72rem"}}/>
                <div className="gap1 mt1">
                  <button className="btn btn-ghost btn-sm" onClick={()=>downloadTemplate("partDimensions")}>Download Template</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setPartDimsCsv(buildTemplateCsv("partDimensions"))}>Load Sample</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>triggerUpload("partDimensions")}>Upload CSV</button>
                  <button className="btn btn-primary btn-sm" disabled={!canManageParts || running==="partDimensions"} onClick={()=>runImport("partDimensions")}>
                    {running==="partDimensions" ? "Importing…" : "Run Part Import"}
                  </button>
                </div>
                {!canManageParts && <div className="text-muted" style={{fontSize:".72rem",marginTop:".4rem"}}>Permission required: `manage_parts`.</div>}
              </div>
            </div>
          </div>
          <div className="row2 mt1">
            <div className="card" style={{margin:0}}>
              <div className="card-head"><div className="card-title">Jobs CSV Import</div></div>
              <div className="card-body">
                <p className="text-muted" style={{marginTop:0,fontSize:".74rem"}}>Create or update jobs with part/revision/operation validation and row-level error feedback.</p>
                <textarea value={jobsCsv} onChange={e=>setJobsCsv(e.target.value)} rows={8} placeholder="Paste jobs CSV here…" style={{fontFamily:"var(--mono)",fontSize:".72rem"}}/>
                <div className="gap1 mt1">
                  <button className="btn btn-ghost btn-sm" onClick={()=>downloadTemplate("jobs")}>Download Template</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setJobsCsv(buildTemplateCsv("jobs"))}>Load Sample</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>triggerUpload("jobs")}>Upload CSV</button>
                  <button className="btn btn-primary btn-sm" disabled={!canManageJobs || running==="jobs"} onClick={()=>runImport("jobs")}>
                    {running==="jobs" ? "Importing…" : "Run Job Import"}
                  </button>
                </div>
                {!canManageJobs && <div className="text-muted" style={{fontSize:".72rem",marginTop:".4rem"}}>Permission required: `manage_jobs`.</div>}
              </div>
            </div>
            <div className="card" style={{margin:0}}>
              <div className="card-head"><div className="card-title">Measurement Bulk Import</div></div>
              <div className="card-body">
                <p className="text-muted" style={{marginTop:0,fontSize:".74rem"}}>Ingest multi-job and multi-operation measurement rows from CMM/API/webhook exports. Ambiguous rows route to Unresolved Imports.</p>
                <textarea value={measurementsCsv} onChange={e=>setMeasurementsCsv(e.target.value)} rows={8} placeholder="Paste measurement CSV here…" style={{fontFamily:"var(--mono)",fontSize:".72rem"}}/>
                <div className="gap1 mt1">
                  <button className="btn btn-ghost btn-sm" onClick={()=>downloadTemplate("measurements")}>Download Template</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setMeasurementsCsv(buildTemplateCsv("measurements"))}>Load Sample</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>triggerUpload("measurements")}>Upload CSV</button>
                  <button className="btn btn-primary btn-sm" disabled={!canManageJobs || running==="measurements"} onClick={()=>runImport("measurements")}>
                    {running==="measurements" ? "Importing…" : "Run Measurement Import"}
                  </button>
                </div>
                {!canManageJobs && <div className="text-muted" style={{fontSize:".72rem",marginTop:".4rem"}}>Permission required: `manage_jobs`.</div>}
              </div>
            </div>
          </div>
          <div className="card mt1" style={{margin:0}}>
            <div className="card-head">
              <div className="card-title">Import Integrations (API / Webhook / Excel)</div>
              <div className="text-muted" style={{fontSize:".72rem"}}>{loadingIntegrations ? "Loading…" : `${integrations.length} configured`}</div>
            </div>
            <div className="card-body">
              <div className="row3">
                <div className="field"><label>Name</label><input value={integrationForm.name} onChange={e=>setIntegrationForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Customer A Jobs Feed"/></div>
                <div className="field"><label>Source</label>
                  <select value={integrationForm.sourceType} onChange={e=>setIntegrationForm(p=>({...p,sourceType:e.target.value}))}>
                    <option value="api_pull">API Pull</option>
                    <option value="webhook">Webhook</option>
                    <option value="excel_sheet">Live Excel Sheet</option>
                  </select>
                </div>
                <div className="field"><label>Import Type</label>
                  <select value={integrationForm.importType} onChange={e=>setIntegrationForm(p=>({...p,importType:e.target.value}))}>
                    <option value="tools">Tools</option>
                    <option value="part_dimensions">Part Dimensions</option>
                    <option value="jobs">Jobs</option>
                    <option value="measurements">Measurements</option>
                  </select>
                </div>
              </div>
              <div className="row3 mt1">
                <div className="field"><label>Endpoint URL</label><input value={integrationForm.endpointUrl} onChange={e=>setIntegrationForm(p=>({...p,endpointUrl:e.target.value}))} placeholder="https://example.com/feed.csv"/></div>
                <div className="field"><label>Poll Interval (min)</label><input type="number" min="1" value={integrationForm.pollIntervalMinutes} onChange={e=>setIntegrationForm(p=>({...p,pollIntervalMinutes:e.target.value}))} placeholder="15"/></div>
                <div className="field" style={{display:"flex",alignItems:"flex-end"}}>
                  <label style={{display:"flex",gap:".45rem",alignItems:"center",marginBottom:".3rem"}}>
                    <input type="checkbox" checked={integrationForm.enabled!==false} onChange={e=>setIntegrationForm(p=>({...p,enabled:e.target.checked}))}/>
                    Enabled
                  </label>
                </div>
              </div>
              <div className="mt1">
                <button className="btn btn-primary btn-sm" disabled={!canManageJobs || integrationBusy==="save"} onClick={saveIntegration}>
                  {integrationBusy==="save" ? "Saving…" : "Add Integration"}
                </button>
              </div>
              <table className="data-table mt1">
                <thead><tr><th>Name</th><th>Source</th><th>Type</th><th>Endpoint</th><th>Poll</th><th>Last Run</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {integrations.length===0&&<tr><td colSpan={8}><div className="empty-state">No integrations configured.</div></td></tr>}
                  {integrations.map(integ=>(
                    <tr key={integ.id}>
                      <td style={{fontWeight:600}}>{integ.name}</td>
                      <td className="mono" style={{fontSize:".74rem"}}>{integ.source_type}</td>
                      <td className="mono" style={{fontSize:".74rem"}}>{integ.import_type}</td>
                      <td className="mono" style={{fontSize:".7rem",maxWidth:"340px",whiteSpace:"normal"}}>{integ.endpoint_url || "—"}</td>
                      <td className="mono">{integ.poll_interval_minutes || "—"}</td>
                      <td className="mono" style={{fontSize:".7rem"}}>{integ.last_run_at ? fmtTs(integ.last_run_at) : "—"}</td>
                      <td>{integ.last_status ? <span className={`badge ${integ.last_status==="success"?"badge-ok":integ.last_status==="partial"?"badge-pend":"badge-incomplete"}`}>{integ.last_status}</span> : "—"}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" disabled={!canManageJobs || integrationBusy===String(integ.id)} onClick={()=>pullIntegration(integ.id)}>
                          {integrationBusy===String(integ.id) ? "Running…" : "Pull Now"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card mt1" style={{margin:0}}>
            <div className="card-head">
              <div className="card-title">Unresolved Imports</div>
              <div className="text-muted" style={{fontSize:".72rem"}}>{loadingUnresolved ? "Loading…" : `${unresolved.length} open`}</div>
            </div>
            <div className="card-body">
              <p className="text-muted" style={{marginTop:0,fontSize:".74rem"}}>Rows with low confidence or missing mappings appear here. Override fields and resolve manually, or ignore if not needed.</p>
              <div className="mt1" style={{display:"flex",flexDirection:"column",gap:".65rem"}}>
                {unresolved.length===0 && <div className="empty-state">No unresolved import rows.</div>}
                {unresolved.map(item=>{
                  const edit=editForUnresolved(item);
                  const busyResolve=unresolvedBusy===`resolve_${item.id}`;
                  const busyIgnore=unresolvedBusy===`ignore_${item.id}`;
                  return (
                    <div key={item.id} style={{border:"1px solid var(--border)",borderRadius:"8px",padding:".65rem"}}>
                      <div style={{display:"flex",justifyContent:"space-between",gap:".5rem",alignItems:"center"}}>
                        <div style={{fontSize:".76rem"}}>
                          <span className="mono">#{item.id}</span> · <span className="text-warn">{item.reason}</span> · line {item.line_number || "?"}
                        </div>
                        <div className="mono" style={{fontSize:".68rem",opacity:.7}}>conf {item.confidence || "n/a"}</div>
                      </div>
                      <div className="row3 mt1">
                        <input value={edit.jobId} onChange={e=>setUnresolvedEdit(item.id,{jobId:e.target.value})} placeholder="job id"/>
                        <input value={edit.operationId} onChange={e=>setUnresolvedEdit(item.id,{operationId:e.target.value})} placeholder="operation id"/>
                        <input value={edit.partId} onChange={e=>setUnresolvedEdit(item.id,{partId:e.target.value})} placeholder="part id"/>
                      </div>
                      <div className="row3 mt1">
                        <input value={edit.dimensionId} onChange={e=>setUnresolvedEdit(item.id,{dimensionId:e.target.value})} placeholder="dimension id"/>
                        <input value={edit.dimensionName} onChange={e=>setUnresolvedEdit(item.id,{dimensionName:e.target.value})} placeholder="dimension name"/>
                        <input value={edit.pieceNumber} onChange={e=>setUnresolvedEdit(item.id,{pieceNumber:e.target.value})} placeholder="piece #"/>
                      </div>
                      <div className="row3 mt1">
                        <input value={edit.value} onChange={e=>setUnresolvedEdit(item.id,{value:e.target.value})} placeholder="value"/>
                        <input value={edit.operatorUserId} onChange={e=>setUnresolvedEdit(item.id,{operatorUserId:e.target.value})} placeholder="operator user id"/>
                        <input value={edit.status} onChange={e=>setUnresolvedEdit(item.id,{status:e.target.value})} placeholder="complete/incomplete"/>
                      </div>
                      <div className="mt1" style={{display:"flex",gap:".45rem"}}>
                        <button className="btn btn-primary btn-sm" disabled={busyResolve} onClick={()=>resolveUnresolved(item)}>{busyResolve?"Resolving…":"Resolve"}</button>
                        <button className="btn btn-ghost btn-sm" disabled={busyIgnore} onClick={()=>ignoreUnresolved(item)}>{busyIgnore?"Ignoring…":"Ignore"}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
