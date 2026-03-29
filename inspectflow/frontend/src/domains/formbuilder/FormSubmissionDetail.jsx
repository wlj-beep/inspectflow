/**
 * Single submission detail view — read-only with field labels resolved.
 * BL-121 (OPS-FORMBUILDER-v1)
 */
import { formatTimestampWithZone } from "../../shared/utils/timestamps.js";

export default function FormSubmissionDetail({ submission, template, onBack }) {
  const schema = Array.isArray(template?.schema) ? template.schema : [];
  const data = submission?.data || {};

  function formatValue(field, value) {
    if (value === null || value === undefined || value === "") return <em style={{ color: "#c5d3e0" }}>—</em>;
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  }

  const inputFields = schema.filter(
    (f) => !["section_header", "instruction_block"].includes(f.type)
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <button
          onClick={onBack}
          style={{ padding: "6px 14px", background: "#fff", color: "#3f5268", border: "1px solid #c5d3e0", borderRadius: "5px", cursor: "pointer", fontSize: "13px" }}
        >
          ← Back
        </button>
        <strong style={{ fontSize: "15px", color: "#13263b" }}>
          Submission #{submission?.id}
        </strong>
      </div>

      {/* Metadata */}
      <div style={{ background: "#f7f9fb", border: "1px solid #dde4ec", borderRadius: "6px", padding: "12px 16px", marginBottom: "20px", fontSize: "13px", color: "#3f5268" }}>
        <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
          <div><strong>Form:</strong> {template?.name || "—"}</div>
          {submission?.job_id && <div><strong>Job:</strong> {submission.job_id}</div>}
          <div><strong>Role:</strong> {submission?.submitted_by_role || "—"}</div>
          <div><strong>Submitted:</strong> {formatTimestampWithZone(submission?.submitted_at)}</div>
        </div>
      </div>

      {/* Field values */}
      <div style={{ background: "#fff", border: "1px solid #dde4ec", borderRadius: "8px", overflow: "hidden" }}>
        {inputFields.length === 0 && (
          <div style={{ padding: "24px", color: "#9eb2c6", textAlign: "center" }}>No input fields in this form.</div>
        )}
        {inputFields.map((field, idx) => (
          <div
            key={field.id}
            style={{
              display: "flex",
              padding: "12px 16px",
              borderBottom: idx < inputFields.length - 1 ? "1px solid #edf1f6" : "none",
              gap: "16px"
            }}
          >
            <div style={{ width: "240px", flexShrink: 0 }}>
              <span style={{ fontWeight: 600, fontSize: "13px", color: "#1f3248" }}>
                {field.label}
                {field.required && <span style={{ color: "#b52020", marginLeft: "3px" }}>*</span>}
              </span>
              <div style={{ fontSize: "11px", color: "#9eb2c6", marginTop: "2px" }}>{field.type}</div>
            </div>
            <div style={{ flex: 1, fontSize: "14px", color: "#13263b", wordBreak: "break-word" }}>
              {formatValue(field, data[field.id])}
            </div>
          </div>
        ))}
      </div>

      {/* Raw JSON (collapsed) */}
      <details style={{ marginTop: "16px" }}>
        <summary style={{ cursor: "pointer", fontSize: "12px", color: "#6b8099", userSelect: "none" }}>
          Raw JSON
        </summary>
        <pre style={{
          marginTop: "8px",
          background: "#f0f4f8",
          border: "1px solid #dde4ec",
          borderRadius: "4px",
          padding: "10px 14px",
          fontSize: "12px",
          overflowX: "auto",
          color: "#1f3248"
        }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
