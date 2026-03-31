import React, { useState, useRef, useEffect } from "react";
import { paginateRows, PaginationControls } from "./pagination.js";
import { readRecordsFilterFromUrl, writeRecordsFilterToUrl } from "./filterUrlState.js";
import { TableSkeleton, EmptyState } from "./feedback.jsx";
import { isOOT, fmtTs, fmtSpec, splitRangeValue, isValidNonNegativeNumber, formatValue } from "./appHelpers.js";
import { TypeBadge } from "./sharedWidgets.jsx";
import { samplingLabel } from "./adminConstants.js";
import { api } from "../api/index.js";
import { getOperatorName } from "../domains/jobflow/mappers.js";
import { getSamplePieces } from "./adminConstants.js";

function csvEscape(v){
  const s=(v??"").toString();
  if(s.includes(",")||s.includes("\"")||s.includes("\n")) return `"${s.replace(/\"/g,'""')}"`;
  return s;
}

function triggerCsvDownload(csv, filename){
  const blob=new Blob([csv],{type:"text/csv"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{
    a.remove();
    URL.revokeObjectURL(url);
  }, 0);
}

function RecordDetailModal({ record, parts, toolLibrary, usersById, canEdit, onEditValue, onClose }) {
  const [localRecord,setLocalRecord]=useState(record);
  const [editTarget,setEditTarget]=useState(null);
  const [editValue,setEditValue]=useState("");
  const [editReason,setEditReason]=useState("");
  const [editErr,setEditErr]=useState("");
  const [saving,setSaving]=useState(false);
  const [exportErr,setExportErr]=useState("");
  const [exporting,setExporting]=useState(false);
  useEffect(()=>{ setLocalRecord(record); },[record]);
  useEffect(()=>{
    const onKeyDown=(event)=>{
      if(event.key==="Escape"){
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return ()=>window.removeEventListener("keydown", onKeyDown);
  },[onClose]);

  const part   = parts[localRecord.partNumber];
  const opData = part?.operations[localRecord.operation];
  const dims   = opData?.dimensions ?? [];
  const editDim = editTarget ? dims.find(d=>String(d.id)===String(editTarget.dimensionId)) : null;
  const editToolSel = editTarget
    ? (Array.isArray(localRecord.tools?.[String(editTarget.dimensionId)])
      ? localRecord.tools[String(editTarget.dimensionId)][0]
      : localRecord.tools?.[String(editTarget.dimensionId)])
    : null;
  const editTool = editToolSel ? toolLibrary[editToolSel.toolId] : null;
  const editMode = editTool?.type==="Go/No-Go" ? "gauge" : ((editDim?.inputMode||"single")==="range" ? "range" : "single");
  const [editRangeMin,editRangeMax] = splitRangeValue(editValue);
  function setEditRange(which, nextVal){
    const nextMin = which==="min" ? nextVal : editRangeMin;
    const nextMax = which==="max" ? nextVal : editRangeMax;
    const next = (nextMin || nextMax) ? `${nextMin}|${nextMax}` : "";
    setEditValue(next);
  }
  const operatorName = getOperatorName(localRecord, usersById);
  const allPieces = dims.length > 0
    ? [...new Set(dims.flatMap(d => getSamplePieces(d.sampling, localRecord.qty, d.samplingInterval)))].sort((a,b)=>a-b)
    : [];
  const resultBadge = localRecord.status==="incomplete"
    ? <span className="badge badge-incomplete">Incomplete</span>
    : localRecord.oot
      ? <span className="badge badge-oot">OOT</span>
      : <span className="badge badge-ok">OK</span>;
  async function handleEditSave(){
    if(!editTarget) return;
    if(!editReason.trim()){ setEditErr("Reason required for supervisor edits."); return; }
    if(!onEditValue){ setEditErr("Editing not available."); return; }
    let normalizedValue=String(editValue ?? "").trim();
    if(editMode==="gauge"){
      const v=normalizedValue.toUpperCase();
      if(v!=="PASS" && v!=="FAIL"){
        setEditErr("This dimension only allows PASS or FAIL corrections.");
        return;
      }
      normalizedValue=v;
    }else if(editMode==="range"){
      const [minStr,maxStr]=splitRangeValue(normalizedValue);
      if(!isValidNonNegativeNumber(minStr) || !isValidNonNegativeNumber(maxStr)){
        setEditErr("Range dimensions require numeric Min and Max values.");
        return;
      }
      normalizedValue=`${minStr}|${maxStr}`;
    }else{
      if(!isValidNonNegativeNumber(normalizedValue)){
        setEditErr("Numeric dimensions require a valid non-negative value.");
        return;
      }
    }
    setSaving(true);setEditErr("");
    try{
      const updated=await onEditValue({
        recordId: localRecord.id,
        dimensionId: editTarget.dimensionId,
        pieceNumber: editTarget.pieceNumber,
        value: normalizedValue,
        reason: editReason.trim()
      });
      if(updated) setLocalRecord(updated);
      setEditTarget(null);setEditValue("");setEditReason("");
    }catch(e){
      if(e?.message==="invalid_value_for_mode"){
        setEditErr("Value does not match the required input mode for this dimension.");
      }else{
        setEditErr(e?.message||"Unable to save edit.");
      }
    }finally{
      setSaving(false);
    }
  }
  async function handleExport(){
    setExportErr("");setExporting(true);
    try{
      const csv=await api.records.exportCsv(localRecord.id);
      triggerCsvDownload(csv, `record_${localRecord.id}.csv`);
    }catch(e){
      setExportErr(e?.message||"Export failed.");
    }finally{
      setExporting(false);
    }
  }
  return (
    <div className="modal-overlay">
      <div className="rec-modal">
        <div className="rec-modal-head">
          <div>
            <div className="modal-title" style={{marginBottom:0}}>Inspection Record — {localRecord.jobNumber}</div>
            <div style={{fontSize:".72rem",color:"var(--muted)",marginTop:".2rem"}}>{localRecord.timestamp} · {operatorName || "—"}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
            {resultBadge}
            <button className="btn btn-ghost btn-sm" onClick={handleExport} disabled={exporting}>{exporting?"Exporting…":"Export CSV"}</button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
          </div>
        </div>
        {exportErr&&<div className="err-text" style={{padding:"0 1.5rem"}}>{exportErr}</div>}
        <div className="rec-modal-body">
          <div className="rec-strip">
            <div className="rec-field"><div className="rec-label">Part</div><div className="rec-val">{localRecord.partNumber}</div></div>
            <div className="rec-field"><div className="rec-label">Description</div><div className="rec-val" style={{fontFamily:"var(--sans)",fontSize:".82rem",color:"var(--text)"}}>{part?.description}</div></div>
            <div className="rec-field"><div className="rec-label">Operation</div><div className="rec-val">Op {localRecord.operation} — <span style={{fontFamily:"var(--sans)",fontSize:".8rem",color:"var(--text)"}}>{opData?.label}</span></div></div>
            <div className="rec-field"><div className="rec-label">Lot</div><div className="rec-val">{localRecord.lot}</div></div>
            <div className="rec-field"><div className="rec-label">Qty</div><div className="rec-val">{localRecord.qty} pcs</div></div>
          </div>
          <div className="det-section">Tools Used</div>
          <table className="det-table" style={{marginBottom:"1.25rem"}}>
            <thead><tr><th>Dimension</th><th>Specification</th><th>Sampling</th><th>Tool</th><th>Type</th><th>IT #</th></tr></thead>
            <tbody>
              {dims.map(d => {
                const selectionsRaw = localRecord.tools?.[String(d.id)];
                const selections = Array.isArray(selectionsRaw) ? selectionsRaw : (selectionsRaw ? [selectionsRaw] : []);
                const mapped = selections.map(ts=>{
                  const tl = toolLibrary?.[ts?.toolId];
                  return {
                    name: tl?.name || ts?.toolName || "—",
                    type: tl?.type || ts?.toolType || "",
                    itNum: ts?.itNum || ""
                  };
                });
                const names = mapped.length ? mapped.map(m=>m.name).join(", ") : "—";
                const types = mapped.length ? [...new Set(mapped.map(m=>m.type).filter(Boolean))] : [];
                const typeLabel = types.length===0 ? "—" : types.length===1 ? types[0] : "Mixed";
                const itNums = mapped.length ? mapped.map(m=>m.itNum).filter(Boolean).join(", ") : "—";
                return (
                  <tr key={d.id}>
                    <td style={{fontWeight:600}}>{d.name}</td>
                    <td style={{fontFamily:"var(--mono)",fontSize:".78rem",color:"var(--muted)"}}>{fmtSpec(d)}</td>
                    <td><span className="sample-tag">{samplingLabel(d.sampling,d.samplingInterval)}</span></td>
                    <td>{names}</td>
                    <td>{typeLabel==="Mixed" ? <span className="badge badge-pend">Mixed</span> : (typeLabel==="—" ? "—" : <TypeBadge type={typeLabel}/>)}</td>
                    <td style={{fontFamily:"var(--mono)",fontSize:".78rem"}}>{itNums}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="det-section">Measurements</div>
          <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:"3px",marginBottom:"1.25rem"}}>
            <table className="det-table" style={{tableLayout:"auto"}}>
              <thead>
                <tr>
                  <th style={{minWidth:"60px"}}>Piece</th>
                  {dims.map(d=><th key={d.id}>{d.name}<div style={{fontFamily:"var(--mono)",fontSize:".6rem",color:"var(--border2)",fontWeight:400,marginTop:".1rem"}}>{fmtSpec(d)}</div><div style={{fontFamily:"var(--mono)",fontSize:".58rem",color:"var(--info)",fontWeight:500,marginTop:".15rem"}}>{samplingLabel(d.sampling,d.samplingInterval)}</div></th>)}
                </tr>
              </thead>
              <tbody>
                {allPieces.map(pNum => {
                  const mp = localRecord.missingPieces?.[pNum];
                  return (
                    <tr key={pNum} style={mp?{background:"#180d0d"}:{}}>
                      <td style={{fontFamily:"var(--mono)",fontSize:".78rem",color:"var(--muted)",whiteSpace:"nowrap"}}>
                        Pc {pNum}
                        {mp && <div className="mp-tag">{mp.reason}{mp.ncNum&&` · ${mp.ncNum}`}</div>}
                      </td>
                      {dims.map(d => {
                        if(mp) return <td key={d.id} className="val-na">—</td>;
                        const inPlan = getSamplePieces(d.sampling, localRecord.qty, d.samplingInterval).includes(pNum);
                        const v = localRecord.values?.[`${d.id}_${pNum}`];
                        if(!inPlan && (v===undefined||v==="")) {
                          return <td key={d.id} className="val-na">n/a</td>;
                        }
                        const canEditCell = canEdit && v!==undefined && v!=="";
                        const isTarget = editTarget && String(editTarget.dimensionId)===String(d.id) && String(editTarget.pieceNumber)===String(pNum);
                        if(v==="PASS") return <td key={d.id} className={`val-ok${isTarget?" val-edit":""}`} onClick={()=>{if(canEditCell){setEditTarget({dimensionId:d.id,pieceNumber:pNum});setEditValue("PASS");setEditReason("");}}}>PASS</td>;
                        if(v==="FAIL") return <td key={d.id} className={`val-oot${isTarget?" val-edit":""}`} onClick={()=>{if(canEditCell){setEditTarget({dimensionId:d.id,pieceNumber:pNum});setEditValue("FAIL");setEditReason("");}}}>FAIL</td>;
                        if(v===undefined||v==="") return <td key={d.id} className="val-na">—</td>;
                        const oot = isOOT(v, d.tolPlus, d.tolMinus, d.nominal);
                        return (
                          <td key={d.id} className={`${oot?"val-oot":"val-ok"}${isTarget?" val-edit":""}`} onClick={()=>{if(canEditCell){setEditTarget({dimensionId:d.id,pieceNumber:pNum});setEditValue(String(v));setEditReason("");}}} style={canEditCell?{cursor:"pointer"}:{}}>
                            {formatValue(v, d)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {canEdit && !editTarget && (
            <div className="text-muted" style={{fontSize:".72rem",marginBottom:"1rem"}}>Supervisor edit: click a measurement value to change it.</div>
          )}
          {canEdit && editTarget && (
            <div style={{marginBottom:"1.25rem",border:"1px solid var(--border2)",borderRadius:"3px",padding:"1rem",background:"var(--panel)"}}>
              <div className="section-label" style={{marginBottom:".5rem"}}>Supervisor Edit</div>
              <div className="row3">
                <div className="field">
                  <label>Dimension</label>
                  <input value={dims.find(d=>String(d.id)===String(editTarget.dimensionId))?.name||`Dim ${editTarget.dimensionId}`} readOnly />
                </div>
                <div className="field">
                  <label>Piece</label>
                  <input value={`Pc ${editTarget.pieceNumber}`} readOnly />
                </div>
                <div className="field">
                  <label>Current Value</label>
                  <input value={localRecord.values?.[`${editTarget.dimensionId}_${editTarget.pieceNumber}`]||"—"} readOnly />
                </div>
              </div>
              <div className="field" style={{marginTop:".6rem"}}>
                <label>New Value</label>
                {editMode==="gauge"?(
                  <select value={String(editValue||"").toUpperCase()} onChange={e=>setEditValue(e.target.value.toUpperCase())}>
                    <option value="">Select…</option>
                    <option value="PASS">PASS</option>
                    <option value="FAIL">FAIL</option>
                  </select>
                ):editMode==="range"?(
                  <div style={{display:"flex",gap:".45rem"}}>
                    <input type="number" min="0" step="0.0001" placeholder="Min" value={editRangeMin} onChange={e=>setEditRange("min", e.target.value)} style={{flex:1}} />
                    <input type="number" min="0" step="0.0001" placeholder="Max" value={editRangeMax} onChange={e=>setEditRange("max", e.target.value)} style={{flex:1}} />
                  </div>
                ):(
                  <input type="number" min="0" step="0.0001" value={editValue} onChange={e=>setEditValue(e.target.value)} />
                )}
                <div className="text-muted" style={{fontSize:".7rem",marginTop:".3rem"}}>
                  {editMode==="gauge" ? "Correction mode: PASS/FAIL only." : editMode==="range" ? "Correction mode: numeric range (Min and Max required)." : "Correction mode: numeric value required."}
                </div>
              </div>
              <div className="field" style={{marginTop:".6rem"}}>
                <label>Reason (Required)</label>
                <input value={editReason} onChange={e=>setEditReason(e.target.value)} placeholder="Why is this being changed?" />
              </div>
              {editErr && <p className="err-text mt1">{editErr}</p>}
              <div className="gap1 mt2">
                <button className="btn btn-primary" disabled={saving} onClick={handleEditSave}>{saving?"Saving…":"Save Edit"}</button>
                <button className="btn btn-ghost" onClick={()=>{setEditTarget(null);setEditReason("");setEditValue("");}}>Cancel</button>
              </div>
            </div>
          )}
          {Object.keys(localRecord.missingPieces||{}).length > 0 && (
            <>
              <div className="det-section">Missing Piece Log</div>
              <table className="det-table" style={{marginBottom:"1.25rem"}}>
                <thead><tr><th>Piece</th><th>Reason</th><th>NC #</th><th>Details</th></tr></thead>
                <tbody>
                  {Object.entries(localRecord.missingPieces).map(([p,m])=>(
                    <tr key={p}>
                      <td className="mono">Pc {p}</td>
                      <td>{m.reason}</td>
                      <td className="mono">{m.ncNum||"—"}</td>
                      <td className="text-muted">{m.details||"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {localRecord.comment && (
            <>
              <div className="det-section">{localRecord.oot?"OOT Comment":"Notes"}</div>
              <div style={{background:"var(--panel)",border:"1px solid var(--border2)",borderLeft:`3px solid ${localRecord.oot?"var(--warn)":"var(--border2)"}`,borderRadius:"3px",padding:".85rem 1.1rem",fontSize:".82rem",lineHeight:1.6,color:localRecord.oot?"#c07070":"var(--text)"}}>
                {localRecord.comment}
              </div>
            </>
          )}
          {(localRecord.auditLog||[]).length>0 && (
            <>
              <div className="det-section">Audit Log</div>
              <table className="det-table" style={{marginBottom:"1.25rem"}}>
                <thead><tr><th>Timestamp</th><th>User</th><th>Field</th><th>Before</th><th>After</th><th>Reason</th></tr></thead>
                <tbody>
                  {localRecord.auditLog.map(a=>(
                    <tr key={a.id}>
                      <td className="mono" style={{fontSize:".72rem"}}>{a.timestamp}</td>
                      <td>{a.userName}</td>
                      <td className="mono" style={{fontSize:".72rem"}}>{a.field}</td>
                      <td className="mono" style={{fontSize:".72rem"}}>{a.beforeValue}</td>
                      <td className="mono" style={{fontSize:".72rem"}}>{a.afterValue}</td>
                      <td className="text-muted" style={{fontSize:".74rem"}}>{a.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminRecords({ records, parts, toolLibrary, usersById, loadRecordDetail, canEdit, onEditValue }) {
  const defaultFilter={part:"",op:"",lot:"",status:"",search:""};
  const [filter,setFilter]=useState(()=>readRecordsFilterFromUrl(defaultFilter));
  const [selected,setSelected]=useState(null);
  const [detailErr,setDetailErr]=useState("");
  const [loadingId,setLoadingId]=useState(null);
  const [exporting,setExporting]=useState(false);
  const [exportErr,setExportErr]=useState("");
  const [exportSelectionMode,setExportSelectionMode]=useState(false);
  const [selectedExportIds,setSelectedExportIds]=useState([]);
  const [sortKey,setSortKey]=useState("timestamp");
  const [sortDir,setSortDir]=useState("desc");
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(25);
  const allOps=[...new Set(records.map(r=>r.operation))].sort();
  const filtered=records.filter(r=>{
    const matchesPart=(!filter.part||r.partNumber.includes(filter.part));
    const matchesOp=(!filter.op||r.operation===filter.op);
    const matchesLot=(!filter.lot||String(r.lot).toLowerCase().includes(String(filter.lot).toLowerCase()));
    const matchesStatus=(!filter.status||r.status===filter.status||(filter.status==="oot"&&r.oot));
    const search=filter.search.trim().toLowerCase();
    if(!search) return matchesPart&&matchesOp&&matchesLot&&matchesStatus;
    const hay=[
      r.jobNumber,
      r.partNumber,
      r.lot,
      String(r.operation),
      getOperatorName(r, usersById),
      r.comment||"",
      r.status
    ].join(" ").toLowerCase();
    return matchesPart&&matchesOp&&matchesLot&&matchesStatus&&hay.includes(search);
  });
  const sorted=[...filtered].sort((a,b)=>{
    const dir=sortDir==="asc"?1:-1;
    const getVal=(r)=>{
      if(sortKey==="timestamp") return new Date(r.timestamp).getTime()||0;
      if(sortKey==="jobNumber") return r.jobNumber||"";
      if(sortKey==="partNumber") return r.partNumber||"";
      if(sortKey==="operation") return String(r.operation||"");
      if(sortKey==="lot") return r.lot||"";
      if(sortKey==="qty") return Number(r.qty||0);
      if(sortKey==="operator") return getOperatorName(r, usersById)||"";
      if(sortKey==="result") return r.oot?"oot":r.status||"";
      return "";
    };
    const av=getVal(a);
    const bv=getVal(b);
    if(typeof av==="number"&&typeof bv==="number") return (av-bv)*dir;
    return String(av).localeCompare(String(bv))*dir;
  });
  const { pageRows, totalPages, clampedPage, totalRows } = paginateRows(sorted, page, pageSize);
  const exportRows = exportSelectionMode
    ? sorted.filter((record)=>selectedExportIds.includes(String(record.id)))
    : sorted;
  useEffect(()=>{ setPage(1); },[filter, sortKey, sortDir, pageSize]);
  useEffect(()=>{ if(clampedPage!==page) setPage(clampedPage || 1); },[clampedPage,page]);
  useEffect(()=>{ writeRecordsFilterToUrl(filter); },[filter]);
  const hasActiveFilters = !!(filter.part || filter.op || filter.lot || filter.status || filter.search.trim());
  const sb=r=>{
    if(r.status==="incomplete")return <span className="badge badge-incomplete">Incomplete</span>;
    if(r.oot)return <span className="badge badge-oot">OOT</span>;
    return <span className="badge badge-ok">OK</span>;
  };
  function toggleSort(key){
    if(sortKey===key){ setSortDir(d=>d==="asc"?"desc":"asc"); }
    else{ setSortKey(key); setSortDir("asc"); }
  }
  function sortIcon(key){
    if(sortKey!==key) return "";
    return sortDir==="asc"?"↑":"↓";
  }
  function toggleExportSelectionMode(){
    setExportErr("");
    setExportSelectionMode((current)=>{
      if(current){
        setSelectedExportIds([]);
      }
      return !current;
    });
  }
  function toggleExportRow(recordId){
    const key=String(recordId);
    setSelectedExportIds((current)=>(
      current.includes(key)
        ? current.filter((id)=>id!==key)
        : [...current, key]
    ));
  }
  async function handleSelect(r){
    if(exportSelectionMode) return;
    setDetailErr("");
    if(!loadRecordDetail || (r.values && Object.keys(r.values).length>0)){
      setSelected(r);
      return;
    }
    setLoadingId(r.id);
    try{
      const detail = await loadRecordDetail(r.id);
      setSelected(detail || r);
    }catch(err){
      setDetailErr(err?.message || "Unable to load record detail.");
      setSelected(r);
    }finally{
      setLoadingId(null);
    }
  }
  async function handleEdit(payload){
    if(!onEditValue) return null;
    const updated=await onEditValue(payload);
    if(updated) setSelected(updated);
    return updated;
  }
  async function handleExportFiltered(){
    if(!loadRecordDetail) return;
    if(exportSelectionMode && selectedExportIds.length===0){
      setExportErr("Select at least one record before exporting.");
      return;
    }
    setExportErr("");setExporting(true);
    try{
      const lines=[];
      const header=["Job #","Part","Operation","Lot","Qty","Piece","Dimension","Sampling Plan","Value","Is OOT","Tool","IT #","Operator","Timestamp","Status","Comment","Override Count","Last Override By","Last Override Timestamp","Override Reason","Prior Value","Corrected Value","Missing Reason","Missing Details"];
      lines.push(header.join(","));
      for(const r of exportRows){
        const detail = (r.values && Object.keys(r.values).length>0) ? r : await loadRecordDetail(r.id);
        const part = parts[detail.partNumber];
        const opData = part?.operations?.[detail.operation];
        const dims = opData?.dimensions || [];
        const dimMap = new Map(dims.map(d=>[String(d.id),d]));
        const toolMap = detail.tools || {};
        const auditByField = new Map();
        (detail.auditLog || []).forEach(a=>{
          const fieldKey=String(a.field || "");
          if(!auditByField.has(fieldKey)) auditByField.set(fieldKey, []);
          auditByField.get(fieldKey).push(a);
        });
        for(const [key,val] of Object.entries(detail.values||{})){
          const [dimId,pieceStr]=key.split("_");
          const d=dimMap.get(String(dimId));
          const toolRowsRaw=toolMap?.[String(dimId)];
          const toolRows=Array.isArray(toolRowsRaw) ? toolRowsRaw : (toolRowsRaw ? [toolRowsRaw] : []);
          const toolNames=toolRows.map(ts=>toolLibrary?.[ts?.toolId]?.name || ts?.toolName || "").filter(Boolean).join(" | ");
          const itNums=toolRows.map(ts=>ts?.itNum || "").filter(Boolean).join(" | ");
          const oot=isOOT(val,d?.tolPlus??0,d?.tolMinus??0,d?.nominal??0);
          const editKey=`dim:${dimId}|piece:${pieceStr}`;
          const edits=auditByField.get(editKey) || [];
          const latestEdit=edits[0] || null;
          const row=[
            detail.jobNumber,
            detail.partNumber,
            detail.operation,
            detail.lot,
            detail.qty,
            pieceStr,
            d?.name||`Dim ${dimId}`,
            d?.sampling ? samplingLabel(d.sampling,d?.samplingInterval) : "",
            val,
            oot===true?"Yes":oot===false?"No":"",
            toolNames,
            itNums,
            getOperatorName(detail, usersById),
            detail.timestamp,
            detail.status,
            detail.comment||"",
            edits.length,
            latestEdit?.userName || "",
            latestEdit?.timestamp || "",
            latestEdit?.reason || "",
            latestEdit?.beforeValue || "",
            latestEdit?.afterValue || "",
            "",
            ""
          ];
          lines.push(row.map(csvEscape).join(","));
        }
        for(const [piece,info] of Object.entries(detail.missingPieces||{})){
          const row=[
            detail.jobNumber,
            detail.partNumber,
            detail.operation,
            detail.lot,
            detail.qty,
            piece,
            "",
            "",
            "",
            "",
            "",
            "",
            getOperatorName(detail, usersById),
            detail.timestamp,
            detail.status,
            detail.comment||"",
            "",
            "",
            "",
            "",
            "",
            "",
            info.reason||"",
            info.details||info.ncNum||""
          ];
          lines.push(row.map(csvEscape).join(","));
        }
      }
      const csv=lines.join("\n");
      triggerCsvDownload(csv, `records_export_${Date.now()}.csv`);
      if(exportSelectionMode){
        setSelectedExportIds([]);
      }
    }catch(e){
      setExportErr(e?.message||"Export failed.");
    }finally{
      setExporting(false);
    }
  }
  return (
    <div>
      {selected && <RecordDetailModal record={selected} parts={parts} toolLibrary={toolLibrary} usersById={usersById} canEdit={canEdit} onEditValue={handleEdit} onClose={()=>setSelected(null)}/>}
      <div className="card">
        <div className="card-head"><div className="card-title">Filter</div></div>
        <div className="card-body">
          <div className="row2" style={{marginBottom:".75rem"}}>
            <div className="field" style={{gridColumn:"span 2"}}>
              <label>Search</label>
              <input placeholder="Search job, part, lot, operator, comment…" value={filter.search} onChange={e=>setFilter(p=>({...p,search:e.target.value}))}/>
            </div>
          </div>
          <div className="row3">
            <div className="field"><label>Part #</label><input placeholder="All" value={filter.part} onChange={e=>setFilter(p=>({...p,part:e.target.value}))}/></div>
            <div className="field"><label>Operation</label>
              <select value={filter.op} onChange={e=>setFilter(p=>({...p,op:e.target.value}))}>
                <option value="">All</option>{allOps.map(o=><option key={o} value={o}>Op {o}</option>)}
              </select></div>
            <div className="field"><label>Lot</label><input placeholder="All" value={filter.lot} onChange={e=>setFilter(p=>({...p,lot:e.target.value}))}/></div>
          </div>
          <div className="row2 mt1">
            <div className="field"><label>Result</label>
              <select value={filter.status} onChange={e=>setFilter(p=>({...p,status:e.target.value}))}>
                <option value="">All</option><option value="complete">Complete/OK</option><option value="oot">OOT</option><option value="incomplete">Incomplete</option>
              </select></div>
          </div>
          {detailErr && <p className="err-text mt1">{detailErr}</p>}
          {loadingId && <p className="text-muted mt1" style={{fontSize:".75rem"}}>Loading record detail…</p>}
        </div>
      </div>
      <div className="card" style={{padding:0,overflow:"hidden"}}>
        <div className="card-head">
          <div className="card-title">Records</div>
          <div style={{display:"flex",alignItems:"center",gap:".75rem"}}>
            <div className="text-muted" style={{fontSize:".7rem"}}>
              {exportSelectionMode
                ? "Use the checkboxes to choose records for export."
                : "Click any row to view full detail"}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={toggleExportSelectionMode}>
              {exportSelectionMode?"Cancel Selection":"Select for Export"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleExportFiltered}
              disabled={exporting||exportRows.length===0}
            >
              {exporting ? "Exporting…" : exportSelectionMode ? "Export Selected CSV" : "Export Filtered CSV"}
            </button>
          </div>
        </div>
        {exportErr && <div className="err-text" style={{padding:"0 .85rem"}}>{exportErr}</div>}
        <table className="data-table">
          <thead>
            <tr>
              {exportSelectionMode && <th style={{width:"44px"}} aria-label="Select records">Select</th>}
              <th onClick={()=>toggleSort("timestamp")} style={{cursor:"pointer"}}>Timestamp {sortIcon("timestamp")}</th>
              <th onClick={()=>toggleSort("jobNumber")} style={{cursor:"pointer"}}>Job # {sortIcon("jobNumber")}</th>
              <th onClick={()=>toggleSort("partNumber")} style={{cursor:"pointer"}}>Part {sortIcon("partNumber")}</th>
              <th onClick={()=>toggleSort("operation")} style={{cursor:"pointer"}}>Op {sortIcon("operation")}</th>
              <th onClick={()=>toggleSort("lot")} style={{cursor:"pointer"}}>Lot {sortIcon("lot")}</th>
              <th onClick={()=>toggleSort("qty")} style={{cursor:"pointer"}}>Qty {sortIcon("qty")}</th>
              <th onClick={()=>toggleSort("operator")} style={{cursor:"pointer"}}>Operator {sortIcon("operator")}</th>
              <th onClick={()=>toggleSort("result")} style={{cursor:"pointer"}}>Result {sortIcon("result")}</th>
              <th>Comment</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length===0&&(
              <tr>
                <td colSpan={exportSelectionMode ? 10 : 9}>
                  <EmptyState
                    title={hasActiveFilters ? "No Records Match Filters" : "No Records Yet"}
                    description={hasActiveFilters ? "Try broadening or clearing filters." : "Records appear here after operator submissions."}
                    actionLabel={hasActiveFilters ? "Clear Filters" : undefined}
                    onAction={hasActiveFilters ? ()=>setFilter(defaultFilter) : undefined}
                  />
                </td>
              </tr>
            )}
            {pageRows.map(r=>(
              <tr key={r.id} className={exportSelectionMode ? "" : "tr-click"} onClick={()=>handleSelect(r)}>
                {exportSelectionMode && (
                  <td onClick={(event)=>event.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select record ${r.jobNumber}`}
                      checked={selectedExportIds.includes(String(r.id))}
                      onChange={()=>toggleExportRow(r.id)}
                    />
                  </td>
                )}
                <td className="mono" style={{fontSize:".74rem",whiteSpace:"nowrap"}}>{r.timestamp}</td>
                <td className="mono accent-text">{r.jobNumber}</td><td className="mono">{r.partNumber}</td>
                <td>Op {r.operation}</td><td>{r.lot}</td><td className="mono">{r.qty}</td>
                <td>{getOperatorName(r, usersById)}</td><td>{sb(r)}</td>
                <td className="text-muted" style={{fontSize:".74rem",maxWidth:"160px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.comment||"—"}</td>
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
      </div>
      <p className="text-muted">{totalRows} record{totalRows!==1?"s":""}</p>
    </div>
  );
}
