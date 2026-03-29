/**
 * Fillable form runtime — renders a published form schema and collects data.
 * Used both in preview mode and live submission mode.
 * BL-121 (OPS-FORMBUILDER-v1)
 */

import { useState } from "react";

const inputBase = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #b9c8d8",
  borderRadius: "4px",
  fontSize: "14px",
  boxSizing: "border-box"
};

function FieldRenderer({ field, value, onChange, error }) {
  const { type, label, required, config = {} } = field;

  const labelEl = (
    <label style={{ display: "block", fontWeight: 600, fontSize: "13px", color: "#1f3248", marginBottom: "4px" }}>
      {label}
      {required && <span style={{ color: "#b52020", marginLeft: "3px" }}>*</span>}
    </label>
  );

  const errEl = error
    ? <div style={{ color: "#b52020", fontSize: "12px", marginTop: "3px" }}>{error}</div>
    : null;

  if (type === "section_header") {
    return (
      <div style={{ borderBottom: "2px solid #dde4ec", paddingBottom: "6px", marginTop: "8px" }}>
        <strong style={{ fontSize: "15px", color: "#13263b" }}>{label}</strong>
        {config.content && <p style={{ fontSize: "13px", color: "#6b8099", margin: "4px 0 0" }}>{config.content}</p>}
      </div>
    );
  }

  if (type === "instruction_block") {
    return (
      <div style={{ background: "#f7f9fb", border: "1px solid #dde4ec", borderRadius: "6px", padding: "10px 14px" }}>
        {label && <strong style={{ fontSize: "13px", color: "#20456d", display: "block", marginBottom: "4px" }}>{label}</strong>}
        {config.content && <p style={{ fontSize: "13px", color: "#3f5268", margin: 0, whiteSpace: "pre-wrap" }}>{config.content}</p>}
      </div>
    );
  }

  if (type === "text") {
    return (
      <div>
        {labelEl}
        <input
          type="text"
          style={{ ...inputBase, borderColor: error ? "#e87070" : "#b9c8d8" }}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={config.placeholder || ""}
        />
        {errEl}
      </div>
    );
  }

  if (type === "textarea") {
    return (
      <div>
        {labelEl}
        <textarea
          style={{ ...inputBase, minHeight: "80px", resize: "vertical", borderColor: error ? "#e87070" : "#b9c8d8" }}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={config.placeholder || ""}
        />
        {errEl}
      </div>
    );
  }

  if (type === "number") {
    return (
      <div>
        {labelEl}
        <input
          type="number"
          style={{ ...inputBase, borderColor: error ? "#e87070" : "#b9c8d8" }}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder={config.placeholder || ""}
          min={config.min}
          max={config.max}
          step={config.step}
        />
        {errEl}
      </div>
    );
  }

  if (type === "date") {
    return (
      <div>
        {labelEl}
        <input
          type="date"
          style={{ ...inputBase, borderColor: error ? "#e87070" : "#b9c8d8" }}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        />
        {errEl}
      </div>
    );
  }

  if (type === "datetime") {
    return (
      <div>
        {labelEl}
        <input
          type="datetime-local"
          style={{ ...inputBase, borderColor: error ? "#e87070" : "#b9c8d8" }}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        />
        {errEl}
      </div>
    );
  }

  if (type === "select") {
    const options = Array.isArray(config.options) ? config.options : [];
    return (
      <div>
        {labelEl}
        <select
          style={{ ...inputBase, borderColor: error ? "#e87070" : "#b9c8d8" }}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— select —</option>
          {options.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
        </select>
        {errEl}
      </div>
    );
  }

  if (type === "multi_select") {
    const options = Array.isArray(config.options) ? config.options : [];
    const selected = Array.isArray(value) ? value : [];
    const toggle = (opt) => {
      const next = selected.includes(opt)
        ? selected.filter((v) => v !== opt)
        : [...selected, opt];
      onChange(next);
    };
    return (
      <div>
        {labelEl}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {options.map((opt, i) => (
            <label key={i} style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer", fontSize: "13px" }}>
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
        {errEl}
      </div>
    );
  }

  if (type === "radio") {
    const options = Array.isArray(config.options) ? config.options : [];
    return (
      <div>
        {labelEl}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {options.map((opt, i) => (
            <label key={i} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px" }}>
              <input
                type="radio"
                name={field.id}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
        {errEl}
      </div>
    );
  }

  if (type === "checkbox") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <input
          type="checkbox"
          id={`chk-${field.id}`}
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label htmlFor={`chk-${field.id}`} style={{ fontSize: "13px", color: "#1f3248", cursor: "pointer" }}>
          {label}
          {required && <span style={{ color: "#b52020", marginLeft: "3px" }}>*</span>}
        </label>
        {errEl}
      </div>
    );
  }

  if (type === "signature") {
    return (
      <div>
        {labelEl}
        <input
          type="text"
          style={{ ...inputBase, fontFamily: "cursive", fontSize: "16px", borderColor: error ? "#e87070" : "#b9c8d8" }}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type your full name as signature"
        />
        {errEl}
      </div>
    );
  }

  if (type === "file_upload") {
    return (
      <div>
        {labelEl}
        <input
          type="file"
          accept={config.accept || undefined}
          style={{ fontSize: "13px" }}
          onChange={(e) => onChange(e.target.files?.[0]?.name || null)}
        />
        {errEl}
      </div>
    );
  }

  // Fallback
  return (
    <div>
      {labelEl}
      <input
        type="text"
        style={inputBase}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
      {errEl}
    </div>
  );
}

export default function FormRuntimeRenderer({ template, onSubmit, onCancel, readOnly = false, previewData = null }) {
  const schema = Array.isArray(template?.schema) ? template.schema : [];
  const [data, setData] = useState(previewData ? { ...previewData } : {});
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  function setField(id, value) {
    setData((prev) => ({ ...prev, [id]: value }));
    if (errors[id]) setErrors((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  function validate() {
    const errs = {};
    for (const field of schema) {
      if (!field.required) continue;
      if (["section_header", "instruction_block"].includes(field.type)) continue;
      const val = data[field.id];
      const empty =
        val === undefined || val === null ||
        (typeof val === "string" && val.trim() === "") ||
        (Array.isArray(val) && val.length === 0);
      if (empty) errs[field.id] = "This field is required.";
    }
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    if (readOnly || !onSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(data);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err?.message || "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div style={{ textAlign: "center", padding: "48px", color: "#1a6e30" }}>
        <div style={{ fontSize: "32px", marginBottom: "12px" }}>✓</div>
        <strong style={{ fontSize: "16px" }}>Form submitted successfully.</strong>
        {onCancel && (
          <div style={{ marginTop: "16px" }}>
            <button
              onClick={onCancel}
              style={{ padding: "8px 18px", background: "#20456d", color: "#fff", border: "none", borderRadius: "5px", cursor: "pointer", fontSize: "13px" }}
            >
              Back
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "640px" }}>
        {schema.map((field) => (
          <FieldRenderer
            key={field.id}
            field={field}
            value={data[field.id]}
            onChange={(v) => setField(field.id, v)}
            error={errors[field.id]}
          />
        ))}

        {submitError && (
          <div style={{ color: "#b52020", background: "#fdf0f0", border: "1px solid #f5c2c2", borderRadius: "4px", padding: "8px 12px", fontSize: "13px" }}>
            {submitError}
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", paddingTop: "8px" }}>
          {!readOnly && onSubmit && (
            <button
              type="submit"
              disabled={submitting}
              style={{ padding: "9px 20px", background: "#20456d", color: "#fff", border: "none", borderRadius: "5px", cursor: submitting ? "wait" : "pointer", fontSize: "14px", fontWeight: 600 }}
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{ padding: "9px 16px", background: "#fff", color: "#3f5268", border: "1px solid #c5d3e0", borderRadius: "5px", cursor: "pointer", fontSize: "14px" }}
            >
              Back
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
