import React, { useState, useEffect } from "react";
import { api } from "../api/index.js";
import { ISSUE_CATEGORIES } from "./adminConstants.js";
import { fmtTs } from "./appHelpers.js";

export function AdminIssueReports({ currentRole, currentUserId }) {
  const [statusFilter,setStatusFilter]=useState("open");
  const [issues,setIssues]=useState([]);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");
  const [resolvingId,setResolvingId]=useState(null);

  async function loadIssues(nextStatus=statusFilter){
    setLoading(true);
    setErr("");
    try{
      const filters=nextStatus ? { status: nextStatus } : {};
      const rows=await api.issues.list(filters, currentRole || "Admin");
      setIssues(rows||[]);
    }catch(e){
      setErr(e?.message||"Unable to load issue reports.");
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{
    loadIssues(statusFilter);
  },[statusFilter,currentRole]);

  async function markCompleted(issueId){
    if(!currentUserId){
      setErr("Select a current user before resolving reports.");
      return;
    }
    setResolvingId(issueId);
    setErr("");
    try{
      await api.issues.complete(issueId, { userId:Number(currentUserId), resolutionNote:"Reviewed and completed." }, currentRole || "Admin");
      await loadIssues(statusFilter);
    }catch(e){
      setErr(e?.message||"Unable to mark issue as completed.");
    }finally{
      setResolvingId(null);
    }
  }

  function categoryLabel(category){
    return ISSUE_CATEGORIES.find(c=>c.value===category)?.label || category;
  }

  return (
    <div className="card" style={{padding:0,overflow:"hidden"}}>
      <div className="card-head">
        <div className="card-title">Operator Issue Reports</div>
        <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{minWidth:"140px"}}>
            <option value="open">Open</option>
            <option value="completed">Completed</option>
            <option value="">All</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={()=>loadIssues(statusFilter)} disabled={loading}>
            {loading?"Refreshing…":"Refresh"}
          </button>
        </div>
      </div>
      {err && <div className="err-text" style={{padding:"0 .85rem .6rem"}}>{err}</div>}
      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Status</th>
            <th>Category</th>
            <th>Submitted By</th>
            <th>Submitted At</th>
            <th>Context</th>
            <th>Details</th>
            <th>Resolution</th>
          </tr>
        </thead>
        <tbody>
          {issues.length===0 && <tr><td colSpan={8}><div className="empty-state">{loading?"Loading reports…":"No issue reports found."}</div></td></tr>}
          {issues.map(i=>{
            const context = [i.part_id ? `Part ${i.part_id}` : "", i.job_id ? `Job ${i.job_id}` : "", i.operation_id ? `Op ${i.operation_id}` : ""].filter(Boolean).join(" · ");
            return (
              <tr key={i.id}>
                <td className="mono">{i.id}</td>
                <td>{i.status==="completed" ? <span className="badge badge-ok">Completed</span> : <span className="badge badge-open">Open</span>}</td>
                <td>{categoryLabel(i.category)}</td>
                <td>{i.submitted_by_name || `User #${i.submitted_by_user_id}`}</td>
                <td className="mono" style={{fontSize:".74rem",whiteSpace:"nowrap"}}>{fmtTs(i.submitted_at)}</td>
                <td className="text-muted" style={{fontSize:".74rem"}}>{context || "—"}</td>
                <td style={{maxWidth:"360px",whiteSpace:"normal",lineHeight:1.4}}>{i.details}</td>
                <td>
                  {i.status==="completed" ? (
                    <div style={{fontSize:".74rem"}}>
                      <div>{i.resolved_by_name || (i.resolved_by_user_id ? `User #${i.resolved_by_user_id}` : "—")}</div>
                      <div className="text-muted mono" style={{fontSize:".7rem"}}>{fmtTs(i.resolved_at)}</div>
                    </div>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={()=>markCompleted(i.id)} disabled={resolvingId===i.id}>
                      {resolvingId===i.id ? "Updating…" : "Mark Complete"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
