import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "../../api/index.js";
import TableSkeletonRows from "../../shared/components/TableSkeletonRows.jsx";

export default function AdminEntitlements({ currentRole }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [seatUsage, setSeatUsage] = useState(null);
  const [form, setForm] = useState({
    licenseTier: "core",
    seatPack: 25,
    seatSoftLimit: 25,
    diagnosticsOptIn: false,
    modulePolicyProfile: "core_starter",
    moduleFlags: {
      CORE: true,
      QUALITY_PRO: false,
      INTEGRATION_SUITE: false,
      ANALYTICS_SUITE: false,
      MULTISITE: false,
      EDGE: false
    },
    seatPolicy: { mode: "soft", enforced: false, hardLimit: 0, namedUsers: [], allowedDevices: [] }
  });

  async function loadEntitlements() {
    setLoading(true);
    setError("");
    try {
      const [entitlements, seats, profileResponse] = await Promise.all([
        api.auth.entitlements(),
        api.auth.seats().catch(() => null),
        api.auth.modulePolicyProfiles().catch(() => ({ profiles: [] }))
      ]);
      setProfiles(Array.isArray(profileResponse?.profiles) ? profileResponse.profiles : []);
      setSeatUsage(seats || null);
      setForm({
        licenseTier: String(entitlements?.licenseTier || "core"),
        seatPack: Number(entitlements?.seatPack || 25),
        seatSoftLimit: Number(entitlements?.seatSoftLimit || 25),
        diagnosticsOptIn: entitlements?.diagnosticsOptIn === true,
        modulePolicyProfile: String(entitlements?.modulePolicyProfile || "core_starter"),
        moduleFlags: { ...(entitlements?.moduleFlags || {}) },
        seatPolicy: {
          mode: String(entitlements?.seatPolicy?.mode || "soft"),
          enforced: entitlements?.seatPolicy?.enforced === true,
          hardLimit: Number(entitlements?.seatPolicy?.hardLimit || 0),
          namedUsers: Array.isArray(entitlements?.seatPolicy?.namedUsers)
            ? entitlements.seatPolicy.namedUsers
            : [],
          allowedDevices: Array.isArray(entitlements?.seatPolicy?.allowedDevices)
            ? entitlements.seatPolicy.allowedDevices
            : []
        }
      });
    } catch (err) {
      setError(err?.message || "Unable to load entitlement settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEntitlements();
  }, [currentRole]);

  async function applyProfile(profileId) {
    setForm((prev) => ({ ...prev, modulePolicyProfile: profileId }));
    try {
      const evaluation = await api.auth.evaluateModulePolicy({ modulePolicyProfile: profileId });
      if (evaluation?.moduleFlags) {
        setForm((prev) => ({
          ...prev,
          moduleFlags: { ...evaluation.moduleFlags },
          modulePolicyProfile: profileId
        }));
      }
    } catch {
      // keep current selections if evaluation fails
    }
  }

  async function saveEntitlements() {
    setSaving(true);
    setSuccess("");
    setError("");
    try {
      await api.auth.updateEntitlements({
        licenseTier: form.licenseTier,
        seatPack: Number(form.seatPack) || 0,
        seatSoftLimit: Number(form.seatSoftLimit) || 0,
        diagnosticsOptIn: form.diagnosticsOptIn === true,
        modulePolicyProfile: form.modulePolicyProfile,
        moduleFlags: form.moduleFlags,
        seatPolicy: {
          mode: form.seatPolicy.mode,
          enforced: form.seatPolicy.enforced === true,
          hardLimit: Number(form.seatPolicy.hardLimit) || 0,
          namedUsers: form.seatPolicy.namedUsers,
          allowedDevices: form.seatPolicy.allowedDevices
        }
      });
      setSuccess("Entitlements updated.");
      await loadEntitlements();
    } catch (err) {
      setError(err?.message || "Unable to update entitlement settings.");
    } finally {
      setSaving(false);
    }
  }

  const moduleKeys = Object.keys(form.moduleFlags || {});

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Entitlements Console</div>
      </div>
      <div className="card-body">
        {error ? (
          <div className="banner warn" role="alert" style={{ marginBottom: ".75rem" }}>
            {error}
          </div>
        ) : null}
        {success ? (
          <div
            className="banner"
            style={{
              marginBottom: ".75rem",
              borderColor: "#1a5c38",
              background: "#0b2318",
              color: "var(--ok)"
            }}
          >
            {success}
          </div>
        ) : null}
        {loading ? (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <tbody>
                <TableSkeletonRows columns={4} rows={4} />
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="row3">
              <div className="field">
                <label>License Tier</label>
                <input
                  value={form.licenseTier}
                  onChange={(e) => setForm((prev) => ({ ...prev, licenseTier: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Seat Pack</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.seatPack}
                  onChange={(e) => setForm((prev) => ({ ...prev, seatPack: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Seat Soft Limit</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.seatSoftLimit}
                  onChange={(e) => setForm((prev) => ({ ...prev, seatSoftLimit: e.target.value }))}
                />
              </div>
            </div>
            <div className="row3 mt1">
              <div className="field">
                <label>Seat Mode</label>
                <select
                  value={form.seatPolicy.mode}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      seatPolicy: { ...prev.seatPolicy, mode: e.target.value }
                    }))
                  }
                >
                  <option value="soft">Soft</option>
                  <option value="named">Named</option>
                  <option value="device">Device</option>
                  <option value="concurrent">Concurrent</option>
                </select>
              </div>
              <div className="field">
                <label>Seat Hard Limit</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.seatPolicy.hardLimit}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      seatPolicy: { ...prev.seatPolicy, hardLimit: e.target.value }
                    }))
                  }
                />
              </div>
              <div className="field" style={{ justifyContent: "end" }}>
                <label>&nbsp;</label>
                <label style={{ display: "flex", alignItems: "center", gap: ".45rem" }}>
                  <input
                    type="checkbox"
                    checked={form.seatPolicy.enforced === true}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        seatPolicy: { ...prev.seatPolicy, enforced: e.target.checked }
                      }))
                    }
                  />
                  Enforce Hard Policy
                </label>
              </div>
            </div>
            <div className="row2 mt1">
              <div className="field">
                <label>Module Policy Profile</label>
                <select
                  value={form.modulePolicyProfile}
                  onChange={(e) => applyProfile(e.target.value)}
                >
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ justifyContent: "end" }}>
                <label>&nbsp;</label>
                <label style={{ display: "flex", alignItems: "center", gap: ".45rem" }}>
                  <input
                    type="checkbox"
                    checked={form.diagnosticsOptIn === true}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, diagnosticsOptIn: e.target.checked }))
                    }
                  />
                  Diagnostics Opt-In
                </label>
              </div>
            </div>
            <div className="card mt1" style={{ padding: ".75rem" }}>
              <div className="text-muted" style={{ marginBottom: ".45rem" }}>
                Module Flags
              </div>
              <div className="row3">
                {moduleKeys.map((moduleKey) => (
                  <label
                    key={moduleKey}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: ".45rem",
                      fontSize: ".78rem"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.moduleFlags[moduleKey] === true}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          moduleFlags: { ...prev.moduleFlags, [moduleKey]: e.target.checked }
                        }))
                      }
                    />
                    {moduleKey}
                  </label>
                ))}
              </div>
            </div>
            {seatUsage ? (
              <div className="card mt1" style={{ padding: ".75rem" }}>
                <div className="text-muted" style={{ marginBottom: ".35rem" }}>
                  Seat Usage Snapshot
                </div>
                <div className="gap1">
                  <span className="badge badge-open">Active {seatUsage.activeSessions || 0}</span>
                  <span className="badge badge-incomplete">
                    Soft Limit {seatUsage.seatSoftLimit || 0}
                  </span>
                  <span className="badge badge-ok">Available {seatUsage.availableSeats || 0}</span>
                </div>
              </div>
            ) : null}
            <div className="mt1">
              <button className="btn btn-primary" onClick={saveEntitlements} disabled={saving}>
                {saving ? "Saving…" : "Save Entitlements"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

