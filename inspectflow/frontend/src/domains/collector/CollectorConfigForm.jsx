/**
 * Create/edit collector configuration form.
 * BL-120 (INT-IOT-v1)
 */

import React, { useState } from "react";
import { api } from "../../api/index.js";

const PROTOCOLS = [
  { value: "opc_ua", label: "OPC-UA" },
  { value: "mqtt", label: "MQTT" },
  { value: "tcp", label: "TCP" }
];

export default function CollectorConfigForm({ initial, role, onSaved, onCancel }) {
  const isEdit = Boolean(initial?.id);
  const [name, setName] = useState(initial?.name ?? "");
  const [protocol, setProtocol] = useState(initial?.source_protocol ?? "opc_ua");
  const [pollSecs, setPollSecs] = useState(initial?.poll_interval_seconds ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [connOpts, setConnOpts] = useState(
    initial?.connection_options ? JSON.stringify(initial.connection_options, null, 2) : "{}"
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);

    let parsedOpts;
    try {
      parsedOpts = JSON.parse(connOpts || "{}");
    } catch {
      setErr("Connection options must be valid JSON");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        sourceProtocol: protocol,
        connectionOptions: parsedOpts,
        pollIntervalSeconds: pollSecs ? Number(pollSecs) : null,
        enabled
      };
      if (isEdit) {
        await api.collector.updateConfig(initial.id, payload, role);
      } else {
        await api.collector.createConfig(payload, role);
      }
      onSaved();
    } catch (e) {
      setErr(e.data?.error ?? e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const fieldStyle = { display: "flex", flexDirection: "column", gap: "0.25rem", marginBottom: "0.75rem" };
  const labelStyle = { fontWeight: 500, fontSize: "0.85rem" };
  const inputStyle = { padding: "0.4rem 0.6rem", border: "1px solid #ccc", borderRadius: 3, fontSize: "0.9rem" };

  return (
    <form onSubmit={handleSubmit} style={{ border: "1px solid #ddd", borderRadius: 6, padding: "1rem", marginBottom: "1rem", background: "#fafafa" }}>
      <h4 style={{ margin: "0 0 1rem" }}>{isEdit ? "Edit" : "New"} Collector</h4>

      {err && <p style={{ color: "red", marginBottom: "0.75rem" }}>{err}</p>}

      <div style={fieldStyle}>
        <label style={labelStyle}>Name</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. CNC Line 1 OPC-UA" />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Protocol</label>
        <select value={protocol} onChange={(e) => setProtocol(e.target.value)} style={inputStyle}>
          {PROTOCOLS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Poll Interval (seconds, blank = push/event-driven)</label>
        <input
          type="number" min="1" value={pollSecs}
          onChange={(e) => setPollSecs(e.target.value)}
          style={inputStyle} placeholder="e.g. 5"
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Connection Options (JSON) — secrets will be redacted in display</label>
        <textarea
          value={connOpts}
          onChange={(e) => setConnOpts(e.target.value)}
          style={{ ...inputStyle, fontFamily: "monospace", minHeight: "6rem" }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <input type="checkbox" id="cfg-enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <label htmlFor="cfg-enabled" style={labelStyle}>Enabled</label>
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="submit" disabled={saving} style={{ padding: "0.4rem 1rem", background: "#0066cc", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
          {saving ? "Saving…" : isEdit ? "Update" : "Create"}
        </button>
        <button type="button" onClick={onCancel} style={{ padding: "0.4rem 1rem", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}
