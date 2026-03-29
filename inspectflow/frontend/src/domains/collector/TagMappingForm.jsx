/**
 * Create a new tag mapping.
 * BL-120 (INT-IOT-v1)
 */

import React, { useState } from "react";
import { api } from "../../api/index.js";

export default function TagMappingForm({ collectorId, role, onSaved, onCancel }) {
  const [deviceId, setDeviceId] = useState("");
  const [tagAddress, setTagAddress] = useState("");
  const [dimensionId, setDimensionId] = useState("");
  const [jobId, setJobId] = useState("");
  const [pieceNumber, setPieceNumber] = useState("1");
  const [unitOverride, setUnitOverride] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      await api.collector.createTagMapping(collectorId, {
        deviceId: deviceId.trim(),
        tagAddress: tagAddress.trim(),
        dimensionId: Number(dimensionId),
        jobId: jobId.trim(),
        pieceNumber: Number(pieceNumber),
        unitOverride: unitOverride.trim() || null
      }, role);
      onSaved();
    } catch (e) {
      setErr(e.data?.error ?? e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { padding: "0.3rem 0.5rem", border: "1px solid #ccc", borderRadius: 3, fontSize: "0.85rem" };

  return (
    <form onSubmit={handleSubmit} style={{ background: "#f0f4ff", border: "1px solid #c5d0e8", borderRadius: 4, padding: "0.75rem", marginBottom: "0.75rem" }}>
      {err && <p style={{ color: "red", marginBottom: "0.5rem", fontSize: "0.85rem" }}>{err}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <div>
          <div style={{ fontSize: "0.75rem", marginBottom: "0.2rem" }}>Device ID</div>
          <input required value={deviceId} onChange={(e) => setDeviceId(e.target.value)} style={{ ...inputStyle, width: "100%" }} placeholder="CNC-01" />
        </div>
        <div>
          <div style={{ fontSize: "0.75rem", marginBottom: "0.2rem" }}>Tag Address / Node ID</div>
          <input required value={tagAddress} onChange={(e) => setTagAddress(e.target.value)} style={{ ...inputStyle, width: "100%" }} placeholder="ns=2;s=BoreDia" />
        </div>
        <div>
          <div style={{ fontSize: "0.75rem", marginBottom: "0.2rem" }}>Dimension ID</div>
          <input required type="number" min="1" value={dimensionId} onChange={(e) => setDimensionId(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
        </div>
        <div>
          <div style={{ fontSize: "0.75rem", marginBottom: "0.2rem" }}>Job ID</div>
          <input required value={jobId} onChange={(e) => setJobId(e.target.value)} style={{ ...inputStyle, width: "100%" }} placeholder="JOB-500" />
        </div>
        <div>
          <div style={{ fontSize: "0.75rem", marginBottom: "0.2rem" }}>Piece #</div>
          <input required type="number" min="1" value={pieceNumber} onChange={(e) => setPieceNumber(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
        </div>
        <div>
          <div style={{ fontSize: "0.75rem", marginBottom: "0.2rem" }}>Unit Override (opt)</div>
          <input value={unitOverride} onChange={(e) => setUnitOverride(e.target.value)} style={{ ...inputStyle, width: "100%" }} placeholder="mm" />
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <button type="submit" disabled={saving} style={{ padding: "0.3rem 0.8rem", background: "#0066cc", color: "#fff", border: "none", borderRadius: 3, cursor: "pointer", fontSize: "0.85rem" }}>
          {saving ? "Adding…" : "Add Mapping"}
        </button>
        <button type="button" onClick={onCancel} style={{ padding: "0.3rem 0.8rem", border: "1px solid #ccc", borderRadius: 3, cursor: "pointer", fontSize: "0.85rem" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}
