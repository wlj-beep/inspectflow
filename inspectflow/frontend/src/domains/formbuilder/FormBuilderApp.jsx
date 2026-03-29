/**
 * Form Builder domain shell.
 * BL-121 (OPS-FORMBUILDER-v1)
 */

import { useState } from "react";
import FormTemplateList from "./FormTemplateList.jsx";
import FormCanvas from "./FormCanvas.jsx";
import FormPreview from "./FormPreview.jsx";
import FormSubmissionList from "./FormSubmissionList.jsx";

const TABS = [
  { key: "templates", label: "Form Templates" },
  { key: "builder",   label: "Builder" },
  { key: "preview",   label: "Preview" },
  { key: "submissions", label: "Submissions" }
];

const WORKFLOW_CARDS = [
  {
    title: "Draft",
    body: "Build field layouts, reorder blocks, and keep the schema editable."
  },
  {
    title: "Publish",
    body: "Lock the form for operators once the structure is ready."
  },
  {
    title: "Capture",
    body: "Preview the runtime experience and submit real inspection data."
  }
];

export default function FormBuilderApp({ role }) {
  const [tab, setTab] = useState("templates");
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [submissionsTemplate, setSubmissionsTemplate] = useState(null);

  const activeTemplate = editingTemplate || previewTemplate || submissionsTemplate || null;
  const activeTab = TABS.find((item) => item.key === tab) || TABS[0];

  function handleEdit(template) {
    setEditingTemplate(template);
    setTab("builder");
  }

  function handlePreview(template) {
    setPreviewTemplate(template);
    setTab("preview");
  }

  function handleViewSubmissions(template) {
    setSubmissionsTemplate(template);
    setTab("submissions");
  }

  function handleBuilderSave(template) {
    setEditingTemplate(template);
  }

  function handleNewForm() {
    setEditingTemplate(null);
    setTab("builder");
  }

  return (
    <div style={{
      minHeight: "100%",
      padding: "24px",
      boxSizing: "border-box",
      background: "radial-gradient(circle at top left, #f4f8fb 0%, #eef3f8 48%, #e8eef5 100%)"
    }}>
      <div style={{
        display: "grid",
        gap: "18px",
        maxWidth: "1440px",
        margin: "0 auto"
      }}>
        <header style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "18px",
          alignItems: "flex-end",
          flexWrap: "wrap",
          padding: "8px 4px 0"
        }}>
          <div style={{ maxWidth: "820px" }}>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "4px 10px",
              borderRadius: "999px",
              background: "#dfeaf5",
              color: "#244767",
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: "12px"
            }}>
              BL-121 Form Builder
            </div>
            <h1 style={{
              margin: 0,
              fontSize: "30px",
              lineHeight: 1.08,
              color: "#13263b"
            }}>
              No-code inspection forms, built as a guided workspace.
            </h1>
            <p style={{
              margin: "10px 0 0",
              maxWidth: "700px",
              fontSize: "15px",
              lineHeight: 1.6,
              color: "#51677f"
            }}>
              Draft field layouts, preview the operator experience, and review submissions from the same canvas without jumping between screens.
            </p>
          </div>

          <div style={{
            display: "grid",
            gap: "8px",
            justifyItems: "end",
            minWidth: "220px"
          }}>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "6px 12px",
              borderRadius: "999px",
              background: "#ffffff",
              color: "#20456d",
              fontSize: "12px",
              fontWeight: 700,
              border: "1px solid #d7e1ea",
              boxShadow: "0 1px 0 rgba(19, 38, 59, 0.03)"
            }}>
              Role: {role || "Unknown"}
            </span>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "6px 12px",
              borderRadius: "999px",
              background: "#ffffff",
              color: "#51677f",
              fontSize: "12px",
              fontWeight: 600,
              border: "1px solid #d7e1ea"
            }}>
              Active view: {activeTab.label}
            </span>
          </div>
        </header>

        <section style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "12px"
        }}>
          {WORKFLOW_CARDS.map((card) => (
            <div
              key={card.title}
              style={{
                background: "rgba(255, 255, 255, 0.88)",
                border: "1px solid rgba(197, 211, 224, 0.9)",
                borderRadius: "16px",
                padding: "16px 18px",
                boxShadow: "0 10px 24px rgba(19, 38, 59, 0.04)",
                backdropFilter: "blur(8px)"
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#20456d", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {card.title}
              </div>
              <div style={{ marginTop: "8px", fontSize: "14px", lineHeight: 1.55, color: "#4a5f76" }}>
                {card.body}
              </div>
            </div>
          ))}
        </section>

        {activeTemplate && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            padding: "12px 16px",
            borderRadius: "14px",
            background: "#13263b",
            color: "#f5f8fb",
            boxShadow: "0 12px 28px rgba(19, 38, 59, 0.12)"
          }}>
            <div>
              <div style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#b9c8d8" }}>
                Current template
              </div>
              <div style={{ marginTop: "4px", fontSize: "15px", fontWeight: 700 }}>
                {activeTemplate.name || "Untitled form"}
              </div>
            </div>
            <div style={{ fontSize: "13px", color: "#d7e1ea" }}>
              {tab === "builder" && "Edit the field canvas and publish when ready."}
              {tab === "preview" && "Check the operator-facing runtime preview."}
              {tab === "submissions" && "Review inspection submissions for this form."}
            </div>
          </div>
        )}

        <div style={{
          display: "flex",
          flexDirection: "column",
          borderRadius: "18px",
          border: "1px solid #d7e1ea",
          background: "rgba(255, 255, 255, 0.92)",
          boxShadow: "0 18px 48px rgba(19, 38, 59, 0.08)",
          overflow: "hidden"
        }}>
          {/* Tab bar */}
          <div style={{
            display: "flex",
            gap: 0,
            borderBottom: "1px solid #dde4ec",
            background: "linear-gradient(180deg, #fbfcfd 0%, #f4f7fa 100%)",
            padding: "0 16px"
          }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: "12px 18px",
                  border: "none",
                  borderBottom: tab === t.key ? "3px solid #20456d" : "3px solid transparent",
                  background: "none",
                  fontWeight: tab === t.key ? 800 : 500,
                  color: tab === t.key ? "#20456d" : "#51677f",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
            {tab === "templates" && (
              <FormTemplateList
                role={role}
                onEdit={handleEdit}
                onPreview={handlePreview}
                onViewSubmissions={handleViewSubmissions}
                onNewForm={handleNewForm}
              />
            )}
            {tab === "builder" && (
              <FormCanvas
                role={role}
                template={editingTemplate}
                onSave={handleBuilderSave}
                onCancel={() => setTab("templates")}
              />
            )}
            {tab === "preview" && (
              <FormPreview
                role={role}
                template={previewTemplate}
                onBack={() => setTab("templates")}
              />
            )}
            {tab === "submissions" && (
              <FormSubmissionList
                role={role}
                template={submissionsTemplate}
                onBack={() => setTab("templates")}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
