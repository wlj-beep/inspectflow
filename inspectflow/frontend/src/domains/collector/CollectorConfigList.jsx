/**
 * Collector configuration management — Admin only.
 * BL-120 (INT-IOT-v1)
 */

import React, { useEffect, useState } from "react";
import { api } from "../../api/index.js";
import CollectorConfigForm from "./CollectorConfigForm.jsx";
import TagMappingTable from "./TagMappingTable.jsx";

export default function CollectorConfigList({ role }) {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editConfig, setEditConfig] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.collector.configs(role);
      setConfigs(data);
    } catch (err) {
      setError(err.message || "Failed to load collector configs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleToggleEnabled(config) {
    try {
      await api.collector.setEnabled(config.id, !config.enabled, role);
      await load();
    } catch (err) {
      alert(`Failed to update: ${err.message}`);
    }
  }

  function handleSaved() {
    setShowForm(false);
    setEditConfig(null);
    load();
  }

  const PROTOCOL_LABELS = { opc_ua: "OPC-UA", mqtt: "MQTT", tcp: "TCP" };
  const STATUS_COLORS = { ok: "#22a06b", error: "#ca3521", degraded: "#e8880a", unknown: "#777" };

  if (loading) return <p style={{ padding: "1rem" }}>Loading collectors…</p>;
  if (error) return <p style={{ padding: "1rem", color: "red" }}>{error}</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <h3 style={{ margin: 0 }}>Collector Configurations</h3>
        <button
          onClick={() => { setEditConfig(null); setShowForm(true); }}
          style={{ padding: "0.4rem 0.9rem", background: "#0066cc", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
        >
          + New Collector
        </button>
      </div>

      {(showForm || editConfig) && (
        <CollectorConfigForm
          initial={editConfig}
          role={role}
          onSaved={handleSaved}
          onCancel={() => { setShowForm(false); setEditConfig(null); }}
        />
      )}

      {configs.length === 0 && <p style={{ color: "#666" }}>No collector configurations yet.</p>}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            {["Name", "Protocol", "Poll (s)", "Status", "Enabled", "Actions"].map((h) => (
              <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", borderBottom: "1px solid #ddd" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {configs.map((cfg) => (
            <React.Fragment key={cfg.id}>
              <tr style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "0.5rem 0.75rem" }}>
                  <button
                    onClick={() => setExpandedId(expandedId === cfg.id ? null : cfg.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 600, color: "#0066cc" }}
                  >
                    {expandedId === cfg.id ? "▼" : "▶"} {cfg.name}
                  </button>
                </td>
                <td style={{ padding: "0.5rem 0.75rem" }}>{PROTOCOL_LABELS[cfg.source_protocol] ?? cfg.source_protocol}</td>
                <td style={{ padding: "0.5rem 0.75rem" }}>{cfg.poll_interval_seconds ?? "—"}</td>
                <td style={{ padding: "0.5rem 0.75rem" }}>
                  <span style={{ color: STATUS_COLORS[cfg.last_status] ?? "#777", fontWeight: 500 }}>
                    {cfg.last_status ?? "unknown"}
                  </span>
                  {cfg.last_message && <span style={{ color: "#888", fontSize: "0.75rem", marginLeft: "0.5rem" }}>{cfg.last_message}</span>}
                </td>
                <td style={{ padding: "0.5rem 0.75rem" }}>
                  <input
                    type="checkbox"
                    checked={cfg.enabled}
                    onChange={() => handleToggleEnabled(cfg)}
                    title={cfg.enabled ? "Disable" : "Enable"}
                  />
                </td>
                <td style={{ padding: "0.5rem 0.75rem" }}>
                  <button
                    onClick={() => { setEditConfig(cfg); setShowForm(false); }}
                    style={{ marginRight: "0.5rem", fontSize: "0.8rem", cursor: "pointer" }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
              {expandedId === cfg.id && (
                <tr>
                  <td colSpan={6} style={{ padding: "0.5rem 1.5rem", background: "#fafafa" }}>
                    <TagMappingTable collectorId={cfg.id} role={role} />
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
