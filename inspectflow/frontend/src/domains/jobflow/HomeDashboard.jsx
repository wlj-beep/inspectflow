import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { fmtTs } from "../../shared/utils/jobflowCore.ts";

export default function HomeDashboard({ jobs, records, toolLibrary, pendingImports = 0, currentRole, onJumpTo }) {
  const allJobs = Object.values(jobs || {});
  const openJobs = allJobs.filter((job) => String(job.status || "").toLowerCase() === "open");
  const draftJobs = allJobs.filter((job) => String(job.status || "").toLowerCase() === "draft");
  const ootRecords = (records || []).filter((record) => record.oot);
  const recentOot = [...ootRecords]
    .sort((a, b) => Date.parse(b.timestamp || 0) - Date.parse(a.timestamp || 0))
    .slice(0, 5);
  const now = Date.now();
  const calibrationWarnings = Object.values(toolLibrary || {})
    .filter((tool) => {
      const due = Date.parse(tool?.calibrationDueDate || "");
      if (!Number.isFinite(due)) return false;
      const daysUntil = Math.ceil((due - now) / (24 * 60 * 60 * 1000));
      return daysUntil <= 14;
    })
    .slice(0, 5);

  return (
    <div>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Home Dashboard</div>
        </div>
        <div className="card-body">
          <div className="row3">
            <div className="field">
              <label>Open Jobs</label>
              <div className="strip-val">{openJobs.length}</div>
            </div>
            <div className="field">
              <label>Recent OOT Flags</label>
              <div className="strip-val">{ootRecords.length}</div>
            </div>
            <div className="field">
              <label>Pending Imports</label>
              <div className="strip-val">{pendingImports}</div>
            </div>
          </div>
          <div className="gap1 mt1">
            <button className="btn btn-ghost btn-sm" onClick={() => onJumpTo?.("operator")}>
              Start Entry Screen
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => onJumpTo?.("records")}>
              Open Records List
            </button>
            {String(currentRole || "").toLowerCase() !== "operator" ? (
              <button className="btn btn-ghost btn-sm" onClick={() => onJumpTo?.("admin", "jobs")}>
                Open Jobs Panel
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="row2">
        <div className="card">
          <div className="card-head">
            <div className="card-title">Recent OOT Records</div>
          </div>
          <div className="card-body">
            {recentOot.length === 0 ? (
              <div className="text-muted">No recent OOT records.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Record</th>
                    <th>Job</th>
                    <th>Part</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOot.map((record) => (
                    <tr
                      key={record.id}
                      className="tr-click"
                      onClick={() => onJumpTo?.("records", null, String(record.id))}
                    >
                      <td className="mono">{record.id}</td>
                      <td className="mono">{record.jobNumber}</td>
                      <td className="mono">{record.partNumber}</td>
                      <td>{fmtTs(record.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Calibration Warnings</div>
          </div>
          <div className="card-body">
            {calibrationWarnings.length === 0 ? (
              <div className="text-muted">No tools due in the next 14 days.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tool</th>
                    <th>IT #</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {calibrationWarnings.map((tool) => (
                    <tr key={tool.id}>
                      <td>{tool.name}</td>
                      <td className="mono">{tool.itNum || "-"}</td>
                      <td>{fmtTs(tool.calibrationDueDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      {draftJobs.length > 0 ? (
        <div className="card">
          <div className="card-head">
            <div className="card-title">Draft Jobs</div>
          </div>
          <div className="card-body">
            <div className="text-muted">
              {draftJobs.length} draft jobs need completion before shop-floor execution.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

