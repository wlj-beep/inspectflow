/**
 * Form preview — Admin view of a template before/after publish.
 * Shows live field rendering in read-only mode.
 * BL-121 (OPS-FORMBUILDER-v1)
 */

import { useState, useEffect } from "react";
import FormRuntimeRenderer from "./FormRuntimeRenderer.jsx";
import { api } from "../../api/index.js";

export default function FormPreview({ role, template, onBack }) {
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // If the template has no schema loaded, fetch the preview descriptor
  useEffect(() => {
    if (!template?.id) return;
    if (Array.isArray(template.schema) && template.schema.length > 0) {
      setPreviewData(template);
      return;
    }
    setLoading(true);
    api.formBuilder.previewTemplate(template.id, role)
      .then((res) => setPreviewData(res.template || res))
      .catch(() => setError("Failed to load preview."))
      .finally(() => setLoading(false));
  }, [template?.id]);

  const displayTemplate = previewData || template;
  const schema = Array.isArray(displayTemplate?.schema) ? displayTemplate.schema : [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <button
          onClick={onBack}
          style={{ padding: "6px 14px", background: "#fff", color: "#3f5268", border: "1px solid #c5d3e0", borderRadius: "5px", cursor: "pointer", fontSize: "13px" }}
        >
          ← Back
        </button>
        <div>
          <strong style={{ fontSize: "15px", color: "#13263b" }}>
            Preview: {displayTemplate?.name || "—"}
          </strong>
          {displayTemplate?.status && (
            <span style={{
              marginLeft: "10px",
              padding: "2px 9px",
              borderRadius: "10px",
              fontSize: "11px",
              fontWeight: 700,
              background: { draft: "#e8f0f7", published: "#e3f5e9", archived: "#f5ece3" }[displayTemplate.status] || "#eee",
              color: { draft: "#20456d", published: "#1a6e30", archived: "#7a4010" }[displayTemplate.status] || "#333"
            }}>
              {displayTemplate.status}
            </span>
          )}
        </div>
      </div>

      {loading && <div style={{ color: "#6b8099" }}>Loading…</div>}
      {error && <div style={{ color: "#b52020" }}>{error}</div>}

      {!loading && !error && (
        <div style={{ background: "#fff", border: "1px solid #dde4ec", borderRadius: "8px", padding: "24px 28px", maxWidth: "680px" }}>
          {displayTemplate?.description && (
            <p style={{ color: "#6b8099", fontSize: "13px", marginTop: 0, marginBottom: "20px" }}>
              {displayTemplate.description}
            </p>
          )}
          {schema.length === 0 ? (
            <div style={{ color: "#9eb2c6", fontSize: "14px", textAlign: "center", padding: "32px" }}>
              This form has no fields yet. Go to the Builder tab to add fields.
            </div>
          ) : (
            <FormRuntimeRenderer
              template={displayTemplate}
              readOnly={true}
              onCancel={null}
            />
          )}
        </div>
      )}
    </div>
  );
}
