/**
 * Collector run history table.
 * BL-120 (INT-IOT-v1)
 */

import React, { useEffect, useState } from "react";
import { api } from "../../api/index.js";
import { formatTimestampWithZone } from "../../shared/utils/timestamps.js";

const STATUS_COLORS = {
  success: "#22a06b",
  partial: "#e8880a",
  error: "#ca3521"
};

export default function CollectorRunHistory({ role }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.collector.runs({ limit: 50 }, role)
      .then(setRuns)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ padding: "1rem" }}>Loading run history…</p>;
  if (error) return <p style={{ padding: "1rem", color: "red" }}>{error}</p>;

  return (
    <div>
      <h3 style={{ margin: "0 0 0.75rem" }}>Collector Run History</h3>
      {runs.length === 0 && <p style={{ color: "#666" }}>No runs yet.</p>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            {["Run ID", "Collector", "Protocol", "Mode", "Status", "Total", "Inserted", "OOT", "Failed", "Date"].map((h) => (
              <th key={h} style={{ padding: "0.5rem 0.6rem", textAlign: "left", borderBottom: "1px solid #ddd" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <React.Fragment key={run.id}>
              <tr
                style={{ borderBottom: "1px solid #eee", cursor: "pointer" }}
                onClick={() => setExpandedId(expandedId === run.id ? null : run.id)}
              >
                <td style={{ padding: "0.4rem 0.6rem", fontFamily: "monospace" }}>{run.id}</td>
                <td style={{ padding: "0.4rem 0.6rem" }}>{run.collector_id ?? "—"}</td>
                <td style={{ padding: "0.4rem 0.6rem" }}>{run.source_protocol}</td>
                <td style={{ padding: "0.4rem 0.6rem" }}>{run.trigger_mode}</td>
                <td style={{ padding: "0.4rem 0.6rem" }}>
                  <span style={{ color: STATUS_COLORS[run.status] ?? "#333", fontWeight: 500 }}>{run.status}</span>
                </td>
                <td style={{ padding: "0.4rem 0.6rem" }}>{run.total_readings}</td>
                <td style={{ padding: "0.4rem 0.6rem" }}>{run.inserted_count}</td>
                <td style={{ padding: "0.4rem 0.6rem", color: run.oot_count > 0 ? "#e8880a" : undefined }}>{run.oot_count}</td>
                <td style={{ padding: "0.4rem 0.6rem", color: run.failed_count > 0 ? "#ca3521" : undefined }}>{run.failed_count}</td>
                <td style={{ padding: "0.4rem 0.6rem", whiteSpace: "nowrap" }}>{formatTimestampWithZone(run.created_at)}</td>
              </tr>
              {expandedId === run.id && run.errors && (
                <tr>
                  <td colSpan={10} style={{ padding: "0.5rem 1rem", background: "#fff8f0", fontSize: "0.8rem" }}>
                    <strong>Errors:</strong>
                    <pre style={{ margin: "0.25rem 0 0", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                      {JSON.stringify(run.errors, null, 2)}
                    </pre>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
