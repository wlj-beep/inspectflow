/**
 * Template list — browse, filter, and launch form actions.
 * BL-121 (OPS-FORMBUILDER-v1)
 */

import { useState, useEffect } from "react";
import { api } from "../../api/index.js";
import { formatTimestampWithZone } from "../../shared/utils/timestamps.js";

const STATUS_COLORS = {
  draft:     { bg: "#e8f0f7", color: "#20456d" },
  published: { bg: "#e3f5e9", color: "#1a6e30" },
  archived:  { bg: "#f5ece3", color: "#7a4010" }
};

function StatusChip({ status }) {
  const s = STATUS_COLORS[status] || { bg: "#eee", color: "#333" };
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 9px",
      borderRadius: "10px",
      fontSize: "11px",
      fontWeight: 700,
      background: s.bg,
      color: s.color
    }}>
      {status}
    </span>
  );
}

export default function FormTemplateList({ role, onEdit, onPreview, onViewSubmissions, onNewForm }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [archiving, setArchiving] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.formBuilder.listTemplates(filterStatus || null, role);
      setTemplates(result.templates || []);
    } catch (e) {
      setError("Failed to load form templates.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filterStatus]);

  async function handleArchive(template) {
    if (!confirm(`Archive "${template.name}"? This cannot be undone.`)) return;
    setArchiving(template.id);
    try {
      await api.formBuilder.archiveTemplate(template.id, role);
      await load();
    } catch (e) {
      alert("Archive failed: " + (e?.message || "unknown error"));
    } finally {
      setArchiving(null);
    }
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <strong style={{ fontSize: "15px", color: "#13263b" }}>Form Templates</strong>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ padding: "5px 8px", border: "1px solid #b9c8d8", borderRadius: "4px", fontSize: "13px" }}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <button
          onClick={onNewForm}
          style={{
            padding: "8px 16px",
            background: "#20456d",
            color: "#fff",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 600
          }}
        >
          + New Form
        </button>
      </div>

      {loading && <div style={{ color: "#6b8099", fontSize: "14px" }}>Loading…</div>}
      {error && <div style={{ color: "#b52020", fontSize: "14px" }}>{error}</div>}

      {!loading && !error && templates.length === 0 && (
        <div style={{
          textAlign: "center",
          padding: "48px",
          color: "#6b8099",
          border: "2px dashed #dde4ec",
          borderRadius: "8px",
          fontSize: "14px"
        }}>
          No form templates yet. Click <strong>+ New Form</strong> to get started.
        </div>
      )}

      {!loading && templates.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#f0f4f8", borderBottom: "2px solid #dde4ec" }}>
              <th style={{ textAlign: "left", padding: "8px 12px", color: "#3f5268" }}>Name</th>
              <th style={{ textAlign: "left", padding: "8px 12px", color: "#3f5268" }}>Description</th>
              <th style={{ textAlign: "left", padding: "8px 12px", color: "#3f5268" }}>Status</th>
              <th style={{ textAlign: "left", padding: "8px 12px", color: "#3f5268" }}>Updated</th>
              <th style={{ padding: "8px 12px" }}></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr
                key={t.id}
                style={{ borderBottom: "1px solid #edf1f6" }}
              >
                <td style={{ padding: "10px 12px", fontWeight: 600, color: "#13263b" }}>{t.name}</td>
                <td style={{ padding: "10px 12px", color: "#6b8099", maxWidth: "260px" }}>
                  {t.description || <em style={{ color: "#c5d3e0" }}>—</em>}
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <StatusChip status={t.status} />
                </td>
                <td style={{ padding: "10px 12px", color: "#6b8099" }}>
                  {formatTimestampWithZone(t.updated_at)}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                    {t.status !== "archived" && (
                      <button
                        onClick={() => onEdit(t)}
                        style={{ padding: "4px 10px", border: "1px solid #b9c8d8", borderRadius: "4px", background: "#fff", cursor: "pointer", fontSize: "12px", color: "#20456d" }}
                      >
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => onPreview(t)}
                      style={{ padding: "4px 10px", border: "1px solid #b9c8d8", borderRadius: "4px", background: "#fff", cursor: "pointer", fontSize: "12px", color: "#20456d" }}
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => onViewSubmissions(t)}
                      style={{ padding: "4px 10px", border: "1px solid #b9c8d8", borderRadius: "4px", background: "#fff", cursor: "pointer", fontSize: "12px", color: "#20456d" }}
                    >
                      Submissions
                    </button>
                    {t.status !== "archived" && (
                      <button
                        onClick={() => handleArchive(t)}
                        disabled={archiving === t.id}
                        style={{ padding: "4px 10px", border: "1px solid #f5c2c2", borderRadius: "4px", background: "#fff", cursor: archiving === t.id ? "wait" : "pointer", fontSize: "12px", color: "#a02020" }}
                      >
                        {archiving === t.id ? "…" : "Archive"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
