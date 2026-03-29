/**
 * Tag mapping table (inline, expanded from CollectorConfigList).
 * BL-120 (INT-IOT-v1)
 */

import React, { useEffect, useState } from "react";
import { api } from "../../api/index.js";
import TagMappingForm from "./TagMappingForm.jsx";

export default function TagMappingTable({ collectorId, role }) {
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api.collector.tagMappings(collectorId, role);
      setMappings(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [collectorId]);

  async function handleDelete(id) {
    if (!window.confirm("Remove this tag mapping?")) return;
    try {
      await api.collector.deleteTagMapping(id, role);
      await load();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  }

  async function handleToggle(mapping) {
    try {
      await api.collector.updateTagMapping(mapping.id, { enabled: !mapping.enabled }, role);
      await load();
    } catch (err) {
      alert(`Update failed: ${err.message}`);
    }
  }

  if (loading) return <p style={{ fontSize: "0.85rem" }}>Loading tag mappings…</p>;
  if (error) return <p style={{ color: "red", fontSize: "0.85rem" }}>{error}</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <strong style={{ fontSize: "0.9rem" }}>Tag Mappings</strong>
        <button
          onClick={() => setShowAdd(true)}
          style={{ fontSize: "0.8rem", padding: "0.3rem 0.7rem", background: "#0066cc", color: "#fff", border: "none", borderRadius: 3, cursor: "pointer" }}
        >
          + Add Mapping
        </button>
      </div>

      {showAdd && (
        <TagMappingForm
          collectorId={collectorId}
          role={role}
          onSaved={() => { setShowAdd(false); load(); }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {mappings.length === 0 && <p style={{ color: "#888", fontSize: "0.85rem" }}>No tag mappings configured.</p>}

      {mappings.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
          <thead>
            <tr style={{ background: "#efefef" }}>
              {["Device ID", "Tag Address", "Dimension ID", "Job ID", "Piece #", "Unit Override", "Enabled", ""].map((h) => (
                <th key={h} style={{ padding: "0.35rem 0.6rem", textAlign: "left", borderBottom: "1px solid #ddd" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <tr key={m.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "0.35rem 0.6rem" }}>{m.device_id}</td>
                <td style={{ padding: "0.35rem 0.6rem", fontFamily: "monospace" }}>{m.tag_address}</td>
                <td style={{ padding: "0.35rem 0.6rem" }}>{m.dimension_id}</td>
                <td style={{ padding: "0.35rem 0.6rem" }}>{m.job_id}</td>
                <td style={{ padding: "0.35rem 0.6rem" }}>{m.piece_number}</td>
                <td style={{ padding: "0.35rem 0.6rem" }}>{m.unit_override ?? "—"}</td>
                <td style={{ padding: "0.35rem 0.6rem" }}>
                  <input type="checkbox" checked={m.enabled} onChange={() => handleToggle(m)} />
                </td>
                <td style={{ padding: "0.35rem 0.6rem" }}>
                  <button onClick={() => handleDelete(m.id)} style={{ fontSize: "0.75rem", color: "#cc0000", background: "none", border: "none", cursor: "pointer" }}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
