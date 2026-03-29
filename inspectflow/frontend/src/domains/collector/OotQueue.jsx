/**
 * OOT acknowledgment queue.
 * BL-120 (INT-IOT-v1)
 */

import React, { useEffect, useState } from "react";
import { api } from "../../api/index.js";
import { formatTimestampWithZone } from "../../shared/utils/timestamps.js";
import OotAuditDrawer from "./OotAuditDrawer.jsx";

const STATUS_LABELS = { pending: "Pending", acknowledged: "Acknowledged", escalated: "Escalated" };
const STATUS_COLORS = { pending: "#e8880a", acknowledged: "#22a06b", escalated: "#0066cc" };

function fmtNum(n) {
  if (n == null) return "—";
  return Number(n).toFixed(4);
}

export default function OotQueue({ role }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [jobFilter, setJobFilter] = useState("");
  const [auditId, setAuditId] = useState(null);
  const [busy, setBusy] = useState({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const filters = {};
      if (statusFilter) filters.status = statusFilter;
      if (jobFilter.trim()) filters.jobId = jobFilter.trim();
      const data = await api.collector.ootQueue(filters, role);
      setItems(data.items ?? data);
      setTotal(data.total ?? (data.items ?? data).length);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter, jobFilter]);

  async function handleAcknowledge(id, note) {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await api.collector.acknowledgeOot(id, { note }, role);
      await load();
    } catch (err) {
      alert(`Acknowledge failed: ${err.data?.error ?? err.message}`);
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  }

  async function handleEscalate(id) {
    const note = window.prompt("Escalation note (optional):");
    if (note === null) return; // cancelled
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await api.collector.escalateOot(id, { note }, role);
      await load();
    } catch (err) {
      alert(`Escalate failed: ${err.data?.error ?? err.message}`);
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  }

  const canEscalate = ["Quality", "Admin"].includes(role);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <h3 style={{ margin: 0 }}>OOT Acknowledgment Queue {total > 0 && <span style={{ fontSize: "0.85rem", fontWeight: 400, color: "#888" }}>({total})</span>}</h3>
        <button onClick={load} style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem", cursor: "pointer" }}>Refresh</button>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <div>
          <label style={{ fontSize: "0.8rem", marginRight: "0.4rem" }}>Status:</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ fontSize: "0.85rem", padding: "0.25rem 0.4rem" }}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="escalated">Escalated</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: "0.8rem", marginRight: "0.4rem" }}>Job ID:</label>
          <input
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}
            placeholder="Filter by job…"
            style={{ fontSize: "0.85rem", padding: "0.25rem 0.4rem", border: "1px solid #ccc", borderRadius: 3 }}
          />
        </div>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && items.length === 0 && <p style={{ color: "#666" }}>No OOT readings match the current filter.</p>}

      {!loading && items.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ background: "#f5f5f5" }}>
              {["Job", "Dim", "Piece", "Value", "Nominal", "±Tol", "Unit", "Device", "Reading Time", "Status", "Actions"].map((h) => (
                <th key={h} style={{ padding: "0.45rem 0.6rem", textAlign: "left", borderBottom: "1px solid #ddd" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isPending = item.status === "pending";
              const tol = item.tol_plus != null && item.tol_minus != null
                ? `+${fmtNum(item.tol_plus)} / -${fmtNum(item.tol_minus)}`
                : "—";
              return (
                <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "0.4rem 0.6rem" }}>{item.job_id}</td>
                  <td style={{ padding: "0.4rem 0.6rem" }}>{item.dimension_id}</td>
                  <td style={{ padding: "0.4rem 0.6rem" }}>{item.piece_number}</td>
                  <td style={{ padding: "0.4rem 0.6rem", fontWeight: 600, color: "#cc4400" }}>{fmtNum(item.measured_value)}</td>
                  <td style={{ padding: "0.4rem 0.6rem" }}>{fmtNum(item.nominal)}</td>
                  <td style={{ padding: "0.4rem 0.6rem", fontFamily: "monospace", fontSize: "0.8rem" }}>{tol}</td>
                  <td style={{ padding: "0.4rem 0.6rem" }}>{item.unit ?? "—"}</td>
                  <td style={{ padding: "0.4rem 0.6rem", fontFamily: "monospace", fontSize: "0.8rem" }}>{item.device_id ?? "—"}</td>
                  <td style={{ padding: "0.4rem 0.6rem", whiteSpace: "nowrap" }}>{formatTimestampWithZone(item.reading_timestamp)}</td>
                  <td style={{ padding: "0.4rem 0.6rem" }}>
                    <span style={{ color: STATUS_COLORS[item.status] ?? "#333", fontWeight: 500 }}>
                      {STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  </td>
                  <td style={{ padding: "0.4rem 0.6rem", whiteSpace: "nowrap" }}>
                    {isPending && (
                      <>
                        <button
                          disabled={busy[item.id]}
                          onClick={() => handleAcknowledge(item.id)}
                          style={{ marginRight: "0.4rem", fontSize: "0.8rem", padding: "0.2rem 0.5rem", background: "#22a06b", color: "#fff", border: "none", borderRadius: 3, cursor: "pointer" }}
                        >
                          Ack
                        </button>
                        {canEscalate && (
                          <button
                            disabled={busy[item.id]}
                            onClick={() => handleEscalate(item.id)}
                            style={{ marginRight: "0.4rem", fontSize: "0.8rem", padding: "0.2rem 0.5rem", background: "#0066cc", color: "#fff", border: "none", borderRadius: 3, cursor: "pointer" }}
                          >
                            Escalate
                          </button>
                        )}
                      </>
                    )}
                    <button
                      onClick={() => setAuditId(item.id)}
                      style={{ fontSize: "0.8rem", padding: "0.2rem 0.5rem", cursor: "pointer" }}
                    >
                      Audit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {auditId && (
        <OotAuditDrawer ootQueueId={auditId} role={role} onClose={() => setAuditId(null)} />
      )}
    </div>
  );
}
