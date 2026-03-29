/**
 * Drag-and-drop form builder canvas.
 * BL-121 (OPS-FORMBUILDER-v1)
 */

import { useState, useRef } from "react";
import FieldPropertyPanel from "./FieldPropertyPanel.jsx";
import { api } from "../../api/index.js";

const FIELD_TYPE_PALETTE = [
  { type: "text",              label: "Text" },
  { type: "number",            label: "Number" },
  { type: "textarea",          label: "Multi-line" },
  { type: "select",            label: "Dropdown" },
  { type: "multi_select",      label: "Multi-Select" },
  { type: "checkbox",          label: "Checkbox" },
  { type: "radio",             label: "Radio" },
  { type: "date",              label: "Date" },
  { type: "datetime",          label: "Date & Time" },
  { type: "signature",         label: "Signature" },
  { type: "file_upload",       label: "File Upload" },
  { type: "section_header",    label: "Section Header" },
  { type: "instruction_block", label: "Instructions" }
];

function generateId() {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function makeField(type) {
  return { id: generateId(), type, label: "", required: false, config: {} };
}

export default function FormCanvas({ role, template, onSave, onCancel }) {
  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [fields, setFields] = useState(
    Array.isArray(template?.schema) ? template.schema : []
  );
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const dragSrcIdx = useRef(null);

  const selectedField = fields.find((f) => f.id === selectedFieldId) || null;

  function addField(type) {
    const field = makeField(type);
    setFields((prev) => [...prev, field]);
    setSelectedFieldId(field.id);
  }

  function updateField(updated) {
    setFields((prev) => prev.map((f) => f.id === updated.id ? updated : f));
  }

  function removeField(id) {
    setFields((prev) => prev.filter((f) => f.id !== id));
    if (selectedFieldId === id) setSelectedFieldId(null);
  }

  function moveField(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    setFields((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }

  function onDragStart(e, idx) {
    dragSrcIdx.current = idx;
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  }

  function onDrop(e, idx) {
    e.preventDefault();
    if (dragSrcIdx.current !== null && dragSrcIdx.current !== idx) {
      moveField(dragSrcIdx.current, idx);
    }
    dragSrcIdx.current = null;
    setDragOverIdx(null);
  }

  function onDragEnd() {
    dragSrcIdx.current = null;
    setDragOverIdx(null);
  }

  async function handleSave() {
    if (!name.trim()) { setError("Form name is required."); return; }
    // Validate labels
    const emptyLabel = fields.find((f) => !f.label?.trim());
    if (emptyLabel) { setError(`Field "${emptyLabel.type}" has no label.`); return; }

    setSaving(true);
    setError(null);
    try {
      const payload = { name: name.trim(), description: description.trim(), schema: fields };
      let result;
      if (template?.id) {
        result = await api.formBuilder.updateTemplate(template.id, payload, role);
      } else {
        result = await api.formBuilder.createTemplate(payload, role);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSave(result.template);
    } catch (e) {
      setError(e?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!template?.id) { setError("Save the form first before publishing."); return; }
    setSaving(true);
    setError(null);
    try {
      const result = await api.formBuilder.publishTemplate(template.id, role);
      onSave(result.template);
    } catch (e) {
      setError(e?.message || "Publish failed.");
    } finally {
      setSaving(false);
    }
  }

  const canPublish = template?.id && template?.status === "draft";
  const isArchived = template?.status === "archived";

  return (
    <div style={{ display: "flex", gap: "16px", height: "100%" }}>
      {/* Left: field palette */}
      <div style={{
        width: "140px",
        flexShrink: 0,
        background: "#f0f4f8",
        border: "1px solid #dde4ec",
        borderRadius: "6px",
        padding: "10px 8px",
        display: "flex",
        flexDirection: "column",
        gap: "4px"
      }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: "#3f5268", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Field Types
        </div>
        {FIELD_TYPE_PALETTE.map(({ type, label }) => (
          <button
            key={type}
            onClick={() => addField(type)}
            disabled={isArchived}
            style={{
              border: "1px solid #c5d3e0",
              borderRadius: "4px",
              background: "#fff",
              cursor: isArchived ? "not-allowed" : "pointer",
              padding: "5px 8px",
              textAlign: "left",
              fontSize: "12px",
              color: "#20456d",
              opacity: isArchived ? 0.5 : 1
            }}
          >
            + {label}
          </button>
        ))}
      </div>

      {/* Center: canvas */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden" }}>
        {/* Header inputs */}
        <div style={{ background: "#fff", border: "1px solid #dde4ec", borderRadius: "6px", padding: "14px 16px" }}>
          <div style={{ marginBottom: "10px" }}>
            <label style={{ display: "block", fontWeight: 600, fontSize: "13px", color: "#1f3248", marginBottom: "3px" }}>
              Form Name *
            </label>
            <input
              style={{ width: "100%", padding: "7px 10px", border: "1px solid #b9c8d8", borderRadius: "4px", fontSize: "14px", boxSizing: "border-box" }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Incoming Inspection — Bore"
              disabled={isArchived}
            />
          </div>
          <div>
            <label style={{ display: "block", fontWeight: 600, fontSize: "13px", color: "#1f3248", marginBottom: "3px" }}>
              Description
            </label>
            <input
              style={{ width: "100%", padding: "7px 10px", border: "1px solid #b9c8d8", borderRadius: "4px", fontSize: "13px", boxSizing: "border-box" }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              disabled={isArchived}
            />
          </div>
        </div>

        {/* Status badge */}
        {template?.status && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              display: "inline-block",
              padding: "2px 10px",
              borderRadius: "10px",
              fontSize: "11px",
              fontWeight: 700,
              background: { draft: "#e8f0f7", published: "#e3f5e9", archived: "#f5ece3" }[template.status] || "#eee",
              color: { draft: "#20456d", published: "#1a6e30", archived: "#7a4010" }[template.status] || "#333"
            }}>
              {template.status.toUpperCase()}
            </span>
          </div>
        )}

        {/* Field list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {fields.length === 0 && (
            <div style={{
              border: "2px dashed #c5d3e0",
              borderRadius: "8px",
              padding: "40px",
              textAlign: "center",
              color: "#6b8099",
              fontSize: "14px"
            }}>
              Click a field type on the left to add it to your form.
            </div>
          )}
          {fields.map((field, idx) => {
            const isSelected = field.id === selectedFieldId;
            const isDragOver = dragOverIdx === idx;
            return (
              <div
                key={field.id}
                draggable={!isArchived}
                onDragStart={(e) => onDragStart(e, idx)}
                onDragOver={(e) => onDragOver(e, idx)}
                onDrop={(e) => onDrop(e, idx)}
                onDragEnd={onDragEnd}
                onClick={() => setSelectedFieldId(isSelected ? null : field.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 12px",
                  marginBottom: "6px",
                  border: `2px solid ${isSelected ? "#3a7dc9" : isDragOver ? "#7bb3e8" : "#dde4ec"}`,
                  borderRadius: "6px",
                  background: isSelected ? "#eef4fc" : "#fff",
                  cursor: isArchived ? "default" : "grab",
                  userSelect: "none",
                  transition: "border-color 0.1s"
                }}
              >
                <span style={{ color: "#9eb2c6", fontSize: "14px", cursor: "grab" }}>⠿</span>
                <span style={{ flex: 1, fontSize: "13px" }}>
                  {field.label
                    ? <><strong>{field.label}</strong><span style={{ color: "#9eb2c6", fontSize: "11px", marginLeft: "6px" }}>{field.type}</span></>
                    : <span style={{ color: "#9eb2c6" }}>{field.type} — <em>no label</em></span>
                  }
                  {field.required && <span style={{ color: "#b52020", marginLeft: "4px", fontSize: "11px" }}>*</span>}
                </span>
                {!isArchived && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeField(field.id); }}
                    style={{ border: "none", background: "none", cursor: "pointer", color: "#a02020", fontSize: "14px", padding: "0 4px" }}
                    title="Remove field"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div style={{ color: "#b52020", background: "#fdf0f0", border: "1px solid #f5c2c2", borderRadius: "4px", padding: "8px 12px", fontSize: "13px" }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "8px", paddingBottom: "8px" }}>
          {!isArchived && (
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: "8px 18px", background: "#20456d", color: "#fff", border: "none", borderRadius: "5px", cursor: saving ? "wait" : "pointer", fontSize: "13px", fontWeight: 600 }}
            >
              {saving ? "Saving…" : saved ? "Saved!" : "Save Draft"}
            </button>
          )}
          {canPublish && (
            <button
              onClick={handlePublish}
              disabled={saving}
              style={{ padding: "8px 18px", background: "#1a6e30", color: "#fff", border: "none", borderRadius: "5px", cursor: saving ? "wait" : "pointer", fontSize: "13px", fontWeight: 600 }}
            >
              Publish
            </button>
          )}
          <button
            onClick={onCancel}
            style={{ padding: "8px 16px", background: "#fff", color: "#3f5268", border: "1px solid #c5d3e0", borderRadius: "5px", cursor: "pointer", fontSize: "13px" }}
          >
            Back
          </button>
        </div>
      </div>

      {/* Right: property panel */}
      {selectedField && (
        <FieldPropertyPanel
          field={selectedField}
          onChange={updateField}
          onClose={() => setSelectedFieldId(null)}
        />
      )}
    </div>
  );
}
