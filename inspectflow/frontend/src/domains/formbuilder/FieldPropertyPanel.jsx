/**
 * Property panel for a selected form field.
 * BL-121 (OPS-FORMBUILDER-v1)
 */

export default function FieldPropertyPanel({ field, onChange, onClose }) {
  if (!field) return null;

  const supportsOptions = ["select", "multi_select", "radio"].includes(field.type);
  const supportsPlaceholder = ["text", "textarea", "number"].includes(field.type);
  const supportsMinMax = field.type === "number";
  const supportsRequired = !["section_header", "instruction_block"].includes(field.type);

  function update(key, value) {
    onChange({ ...field, [key]: value });
  }

  function updateConfig(key, value) {
    onChange({ ...field, config: { ...(field.config || {}), [key]: value } });
  }

  function addOption() {
    const opts = Array.isArray(field.config?.options) ? field.config.options : [];
    updateConfig("options", [...opts, ""]);
  }

  function updateOption(idx, value) {
    const opts = [...(field.config?.options || [])];
    opts[idx] = value;
    updateConfig("options", opts);
  }

  function removeOption(idx) {
    const opts = [...(field.config?.options || [])];
    opts.splice(idx, 1);
    updateConfig("options", opts);
  }

  const panelStyle = {
    background: "#f7f9fb",
    border: "1px solid #dde4ec",
    borderRadius: "6px",
    padding: "16px",
    minWidth: "260px",
    maxWidth: "300px",
    fontSize: "13px",
    position: "relative"
  };

  const labelStyle = {
    display: "block",
    fontWeight: 600,
    color: "#1f3248",
    marginBottom: "3px"
  };

  const inputStyle = {
    width: "100%",
    padding: "6px 8px",
    border: "1px solid #b9c8d8",
    borderRadius: "4px",
    fontSize: "13px",
    boxSizing: "border-box"
  };

  const rowStyle = { marginBottom: "12px" };

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <strong style={{ fontSize: "13px", color: "#13263b" }}>
          Field Properties
        </strong>
        <button
          onClick={onClose}
          style={{ border: "none", background: "none", cursor: "pointer", fontSize: "16px", color: "#6b8099" }}
        >
          ×
        </button>
      </div>

      <div style={{ ...rowStyle, background: "#e8f0f7", borderRadius: "4px", padding: "4px 8px", color: "#3f5268" }}>
        Type: <strong>{field.type}</strong>
      </div>

      {/* Label */}
      <div style={rowStyle}>
        <label style={labelStyle}>Label</label>
        <input
          style={inputStyle}
          value={field.label || ""}
          onChange={(e) => update("label", e.target.value)}
          placeholder="Field label..."
        />
      </div>

      {/* Required toggle */}
      {supportsRequired && (
        <div style={{ ...rowStyle, display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="checkbox"
            id={`req-${field.id}`}
            checked={!!field.required}
            onChange={(e) => update("required", e.target.checked)}
          />
          <label htmlFor={`req-${field.id}`} style={{ cursor: "pointer", color: "#1f3248" }}>
            Required
          </label>
        </div>
      )}

      {/* Placeholder */}
      {supportsPlaceholder && (
        <div style={rowStyle}>
          <label style={labelStyle}>Placeholder</label>
          <input
            style={inputStyle}
            value={field.config?.placeholder || ""}
            onChange={(e) => updateConfig("placeholder", e.target.value)}
            placeholder="Placeholder text..."
          />
        </div>
      )}

      {/* Min/Max/Step */}
      {supportsMinMax && (
        <>
          <div style={{ display: "flex", gap: "8px", ...rowStyle }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Min</label>
              <input
                type="number"
                style={inputStyle}
                value={field.config?.min ?? ""}
                onChange={(e) => updateConfig("min", e.target.value === "" ? undefined : Number(e.target.value))}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Max</label>
              <input
                type="number"
                style={inputStyle}
                value={field.config?.max ?? ""}
                onChange={(e) => updateConfig("max", e.target.value === "" ? undefined : Number(e.target.value))}
              />
            </div>
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Step</label>
            <input
              type="number"
              style={inputStyle}
              value={field.config?.step ?? ""}
              onChange={(e) => updateConfig("step", e.target.value === "" ? undefined : Number(e.target.value))}
            />
          </div>
        </>
      )}

      {/* File accept */}
      {field.type === "file_upload" && (
        <div style={rowStyle}>
          <label style={labelStyle}>Accept (e.g. image/*,.pdf)</label>
          <input
            style={inputStyle}
            value={field.config?.accept || ""}
            onChange={(e) => updateConfig("accept", e.target.value)}
            placeholder="image/*,.pdf"
          />
        </div>
      )}

      {/* Content (section_header / instruction_block) */}
      {["section_header", "instruction_block"].includes(field.type) && (
        <div style={rowStyle}>
          <label style={labelStyle}>Content / Instructions</label>
          <textarea
            style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
            value={field.config?.content || ""}
            onChange={(e) => updateConfig("content", e.target.value)}
            placeholder="Section description or instructions..."
          />
        </div>
      )}

      {/* Options for select/radio/multi_select */}
      {supportsOptions && (
        <div style={rowStyle}>
          <label style={labelStyle}>Options</label>
          {(field.config?.options || []).map((opt, idx) => (
            <div key={idx} style={{ display: "flex", gap: "4px", marginBottom: "4px" }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                value={opt}
                onChange={(e) => updateOption(idx, e.target.value)}
                placeholder={`Option ${idx + 1}`}
              />
              <button
                onClick={() => removeOption(idx)}
                style={{ border: "1px solid #c9d4e0", borderRadius: "4px", background: "#fff", cursor: "pointer", padding: "0 8px", color: "#a02020" }}
              >
                −
              </button>
            </div>
          ))}
          <button
            onClick={addOption}
            style={{
              border: "1px dashed #9eb2c6",
              borderRadius: "4px",
              background: "#fff",
              cursor: "pointer",
              padding: "4px 10px",
              color: "#3f5268",
              fontSize: "12px",
              marginTop: "2px"
            }}
          >
            + Add option
          </button>
        </div>
      )}
    </div>
  );
}
