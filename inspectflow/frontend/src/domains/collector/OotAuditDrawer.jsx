/**
 * Slide-in audit trail for a single OOT queue entry.
 * BL-120 (INT-IOT-v1)
 */

import React, { useEffect, useState } from "react";
import { api } from "../../api/index.js";
import { formatTimestampWithZone } from "../../shared/utils/timestamps.js";

const ACTION_LABELS = {
  acknowledged: "Acknowledged",
  escalated: "Escalated",
  note_added: "Note Added"
};

export default function OotAuditDrawer({ ootQueueId, role, onClose }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.collector.ootAudit(ootQueueId, role)
      .then(setEntries)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [ootQueueId]);

  return (
    <div
      style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 360,
        background: "#fff", boxShadow: "-2px 0 12px rgba(0,0,0,0.15)",
        display: "flex", flexDirection: "column", zIndex: 1000
      }}
    >
      <div style={{ padding: "1rem", borderBottom: "1px solid #ddd", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>OOT Audit Trail #{ootQueueId}</strong>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer" }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
        {loading && <p>Loading…</p>}
        {error && <p style={{ color: "red" }}>{error}</p>}
        {!loading && entries.length === 0 && <p style={{ color: "#888" }}>No audit events yet.</p>}
        {entries.map((e) => (
          <div key={e.id} style={{ marginBottom: "0.75rem", padding: "0.6rem 0.75rem", border: "1px solid #eee", borderRadius: 4, fontSize: "0.875rem" }}>
            <div style={{ fontWeight: 600 }}>{ACTION_LABELS[e.action] ?? e.action}</div>
            <div style={{ color: "#555", marginTop: "0.2rem" }}>
              {e.user_role ?? "System"}{e.user_id ? ` (uid:${e.user_id})` : ""}
            </div>
            {e.note && (
              <div style={{ color: "#333", marginTop: "0.2rem", fontStyle: "italic" }}>
                &quot;{e.note}&quot;
              </div>
            )}
            {e.before_status && (
              <div style={{ color: "#888", fontSize: "0.8rem", marginTop: "0.2rem" }}>
                {e.before_status} → {e.after_status}
              </div>
            )}
            <div style={{ color: "#aaa", fontSize: "0.75rem", marginTop: "0.3rem" }}>{formatTimestampWithZone(e.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
