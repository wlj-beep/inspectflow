/**
 * Paginated list of submissions for a form template.
 * BL-121 (OPS-FORMBUILDER-v1)
 */

import { useState, useEffect } from "react";
import { api } from "../../api/index.js";
import { formatTimestampWithZone } from "../../shared/utils/timestamps.js";
import FormSubmissionDetail from "./FormSubmissionDetail.jsx";

const PAGE_SIZE = 20;

export default function FormSubmissionList({ role, template, onBack }) {
  const [submissions, setSubmissions] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  async function load(off = 0) {
    if (!template?.id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.formBuilder.listSubmissions(template.id, { limit: PAGE_SIZE, offset: off }, role);
      setSubmissions(result.submissions || []);
      setTotal(result.total || 0);
      setOffset(off);
    } catch (e) {
      setError("Failed to load submissions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(0); }, [template?.id]);

  if (selected) {
    return (
      <FormSubmissionDetail
        submission={selected}
        template={template}
        role={role}
        onBack={() => setSelected(null)}
      />
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <button
          onClick={onBack}
          style={{ padding: "6px 14px", background: "#fff", color: "#3f5268", border: "1px solid #c5d3e0", borderRadius: "5px", cursor: "pointer", fontSize: "13px" }}
        >
          ← Back
        </button>
        <strong style={{ fontSize: "15px", color: "#13263b" }}>
          Submissions — {template?.name || "—"}
        </strong>
        <span style={{ fontSize: "13px", color: "#6b8099" }}>({total} total)</span>
      </div>

      {loading && <div style={{ color: "#6b8099" }}>Loading…</div>}
      {error && <div style={{ color: "#b52020" }}>{error}</div>}

      {!loading && !error && submissions.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px", color: "#6b8099", border: "2px dashed #dde4ec", borderRadius: "8px", fontSize: "14px" }}>
          No submissions yet for this form.
        </div>
      )}

      {!loading && submissions.length > 0 && (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#f0f4f8", borderBottom: "2px solid #dde4ec" }}>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#3f5268" }}>ID</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#3f5268" }}>Submitted By</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#3f5268" }}>Role</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#3f5268" }}>Job</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#3f5268" }}>Submitted At</th>
                <th style={{ padding: "8px 12px" }}></th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #edf1f6" }}>
                  <td style={{ padding: "9px 12px", color: "#9eb2c6", fontFamily: "monospace" }}>#{s.id}</td>
                  <td style={{ padding: "9px 12px" }}>{s.submitted_by_user_id ?? <em style={{ color: "#c5d3e0" }}>—</em>}</td>
                  <td style={{ padding: "9px 12px", color: "#6b8099" }}>{s.submitted_by_role || "—"}</td>
                  <td style={{ padding: "9px 12px", color: "#6b8099" }}>{s.job_id || "—"}</td>
                  <td style={{ padding: "9px 12px", color: "#6b8099" }}>
                    {formatTimestampWithZone(s.submitted_at)}
                  </td>
                  <td style={{ padding: "9px 12px", textAlign: "right" }}>
                    <button
                      onClick={() => setSelected(s)}
                      style={{ padding: "4px 10px", border: "1px solid #b9c8d8", borderRadius: "4px", background: "#fff", cursor: "pointer", fontSize: "12px", color: "#20456d" }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "12px" }}>
              <button
                onClick={() => load(offset - PAGE_SIZE)}
                disabled={offset === 0}
                style={{ padding: "5px 12px", border: "1px solid #c5d3e0", borderRadius: "4px", background: "#fff", cursor: offset === 0 ? "not-allowed" : "pointer", fontSize: "13px", opacity: offset === 0 ? 0.5 : 1 }}
              >
                ← Prev
              </button>
              <span style={{ fontSize: "13px", color: "#6b8099" }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => load(offset + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total}
                style={{ padding: "5px 12px", border: "1px solid #c5d3e0", borderRadius: "4px", background: "#fff", cursor: offset + PAGE_SIZE >= total ? "not-allowed" : "pointer", fontSize: "13px", opacity: offset + PAGE_SIZE >= total ? 0.5 : 1 }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
