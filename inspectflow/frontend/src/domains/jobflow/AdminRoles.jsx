import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { CAPABILITY_DEFS, DEFAULT_ROLE_CAPS } from "./constants.js";

export default function AdminRoles({ roleCaps, onUpdateRoleCaps, onDirtyChange }) {
  const [role, setRole] = useState("Operator");
  const [local, setLocal] = useState(roleCaps?.[role] || []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    setLocal(roleCaps?.[role] || []);
  }, [role, roleCaps]);
  const baseCaps = roleCaps?.[role] || [];
  const dirty = JSON.stringify([...local].sort()) !== JSON.stringify([...baseCaps].sort());
  useEffect(() => {
    if (onDirtyChange) onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  function toggleCap(cap) {
    setLocal((prev) => (prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]));
  }
  async function handleSave() {
    setErr("");
    setSaving(true);
    try {
      await onUpdateRoleCaps(role, local);
    } catch (e) {
      setErr(e?.message || "Unable to update role.");
    } finally {
      setSaving(false);
    }
  }
  function handleDiscard() {
    setLocal(baseCaps);
  }
  return (
    <div>
      <div className="card">
        <div
          className="card-head"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem"
          }}
        >
          <div className="card-title">Role Capabilities</div>
          <div className="gap1">
            <button
              className="btn btn-ghost btn-sm"
              disabled={!dirty || saving}
              onClick={handleDiscard}
            >
              Discard
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={!dirty || saving}
              onClick={handleSave}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
        <div className="card-body">
          <div className="row2" style={{ marginBottom: ".75rem" }}>
            <div className="field">
              <label>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {Object.keys(roleCaps || DEFAULT_ROLE_CAPS).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ alignItems: "flex-end" }}>
              {dirty && (
                <div className="text-warn" style={{ fontSize: ".75rem" }}>
                  Unsaved changes
                </div>
              )}
            </div>
          </div>
          {err && <p className="err-text mt1">{err}</p>}
          <table className="data-table">
            <thead>
              <tr>
                <th>Capability</th>
                <th>Description</th>
                <th style={{ width: "80px" }}>Enabled</th>
              </tr>
            </thead>
            <tbody>
              {CAPABILITY_DEFS.map((c) => (
                <tr key={c.key}>
                  <td style={{ fontWeight: 600 }}>{c.label}</td>
                  <td className="text-muted">{c.desc}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={local.includes(c.key)}
                      onChange={() => toggleCap(c.key)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

