import React, { useEffect, useRef, useState } from "react";
import { api } from "../../api/index.js";
import TypeBadge from "../../shared/components/TypeBadge.jsx";
import { fmtTs } from "../../shared/utils/jobflowCore.ts";
import { MISSING_REASONS, TOOL_TYPES } from "./domainConfig.js";
import {
  isToolSelectable,
  normalizeInstructionMediaLinks,
  normalizeInstructionVersionList
} from "./jobflowUtils.js";
export function AutocompleteInput({
  value,
  onChange,
  options,
  placeholder,
  style,
  renderOption,
  filterFn
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const ref = useRef();
  const filtered = options.filter((o) =>
    filterFn ? filterFn(o, value) : o.toLowerCase().includes(value.toLowerCase())
  );
  const show = open && filtered.length > 0 && value.length > 0;
  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  function pick(v) {
    onChange(v);
    setOpen(false);
    setCursor(-1);
  }
  return (
    <div className="ac-wrap" ref={ref}>
      <input
        value={value}
        placeholder={placeholder}
        style={style}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setCursor(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, filtered.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          }
          if (e.key === "Enter" && cursor >= 0) {
            e.preventDefault();
            const o = filtered[cursor];
            pick(typeof o === "object" ? o.value : o);
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {show && (
        <div className="ac-list">
          {filtered.map((o, i) => {
            const v = typeof o === "object" ? o.value : o;
            return (
              <div
                key={v}
                className={`ac-item${cursor === i ? " hi" : ""}`}
                onMouseDown={() => pick(v)}
              >
                {renderOption ? renderOption(o) : <span>{v}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ToolSearchPopover({ toolLibrary, selectedIds, onAdd, onRemove }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [tf, setTf] = useState("All");
  const ref = useRef();
  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const filtered = Object.values(toolLibrary).filter((t) => {
    if (!isToolSelectable(t)) return false;
    const hay = [t.name, t.itNum, t.size].filter(Boolean).join(" ").toLowerCase();
    const ms = !search || hay.includes(search.toLowerCase());
    return ms && (tf === "All" || t.type === tf);
  });
  return (
    <div className="tool-search-wrap" ref={ref}>
      <div className="dim-tool-list">
        {selectedIds.map((id) => {
          const t = toolLibrary[id];
          if (!t) return null;
          return (
            <span className="dim-tool-tag" key={id}>
              <TypeBadge type={t.type} small />
              {t.name}
              <button className="rm" onClick={() => onRemove(id)}>
                ×
              </button>
            </span>
          );
        })}
      </div>
      <button className="btn btn-ghost btn-xs" onClick={() => setOpen((o) => !o)}>
        + Add Tool
      </button>
      {open && (
        <div className="tool-popover">
          <input
            className="search-inp"
            style={{ marginBottom: ".45rem" }}
            placeholder="Search name or IT #…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="tool-pop-filters">
            {["All", ...TOOL_TYPES].map((t) => (
              <button
                key={t}
                className={`tpf-btn${tf === t ? " on" : ""}`}
                onClick={() => setTf(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="tool-pop-list">
            {filtered.length === 0 && (
              <div style={{ fontSize: ".75rem", color: "var(--muted)", padding: ".5rem" }}>
                No tools match.
              </div>
            )}
            {filtered.map((t) => {
              const added = selectedIds.includes(t.id);
              return (
                <div
                  key={t.id}
                  className={`tool-pop-item${added ? " added" : ""}`}
                  onClick={() => {
                    if (!added) onAdd(t.id);
                  }}
                >
                  <div>
                    <div className="tpi-name">{t.name}</div>
                    <div className="tpi-it">
                      {t.itNum}
                      {t.size ? ` · ${t.size}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                    <TypeBadge type={t.type} small />
                    {added && <span style={{ color: "var(--ok)", fontSize: ".7rem" }}>✔</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function MissingPieceModal({ pieces, missingPieces, onSave, onCancel }) {
  const [local, setLocal] = useState(() => {
    const m = {};
    pieces.forEach((p) => {
      m[p] = missingPieces[p] || { reason: "", ncNum: "", details: "" };
    });
    return m;
  });
  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  const valid = pieces.every(
    (p) => local[p]?.reason && !(local[p]?.reason === "Scrapped" && !local[p]?.ncNum)
  );
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1rem"
          }}
        >
          <div className="modal-title" style={{ marginBottom: 0 }}>
            Missing Piece Justification
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>
            ← Back
          </button>
        </div>
        <p className="text-muted" style={{ marginBottom: "1rem", lineHeight: 1.5 }}>
          Pieces {pieces.join(", ")} have incomplete data. Provide a reason for each.
        </p>
        {pieces.map((p) => (
          <div
            key={p}
            style={{
              marginBottom: "1rem",
              padding: ".75rem",
              background: "var(--panel)",
              borderRadius: "3px",
              border: "1px solid var(--border2)"
            }}
          >
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: ".8rem",
                color: "var(--accent2)",
                marginBottom: ".5rem"
              }}
            >
              Piece {p}
            </div>
            <div className="row2" style={{ gap: ".6rem" }}>
              <div className="field">
                <label>Reason</label>
                <select
                  value={local[p]?.reason || ""}
                  onChange={(e) =>
                    setLocal((v) => ({ ...v, [p]: { ...v[p], reason: e.target.value } }))
                  }
                >
                  <option value="">— Select —</option>
                  {MISSING_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>NC # {local[p]?.reason === "Scrapped" ? "(Required)" : "(Opt.)"}</label>
                <input
                  value={local[p]?.ncNum || ""}
                  placeholder="NC-2026-041"
                  style={{ fontFamily: "var(--mono)" }}
                  onChange={(e) =>
                    setLocal((v) => ({ ...v, [p]: { ...v[p], ncNum: e.target.value } }))
                  }
                />
              </div>
            </div>
            {local[p]?.reason === "Other" && (
              <div className="field" style={{ marginTop: ".5rem" }}>
                <label>Details</label>
                <input
                  value={local[p]?.details || ""}
                  placeholder="Describe reason…"
                  onChange={(e) =>
                    setLocal((v) => ({ ...v, [p]: { ...v[p], details: e.target.value } }))
                  }
                />
              </div>
            )}
            {local[p]?.reason === "Scrapped" && !local[p]?.ncNum && (
              <p className="err-text">NC # required for scrapped pieces</p>
            )}
          </div>
        ))}
        <div className="gap1 mt2">
          <button className="btn btn-partial" disabled={!valid} onClick={() => onSave(local)}>
            Confirm &amp; Partial Submit
          </button>
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function InstructionVersionManager({ partNumber, opKey, operation, currentRole, dataStatus }) {
  const operationId = operation?.id ? String(operation.id) : "";
  const role = currentRole || "Admin";
  const [versionsState, setVersionsState] = useState({ loading: false, error: "", versions: [] });
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState("");
  const [form, setForm] = useState({
    versionLabel: "",
    title: "",
    summary: "",
    body: "",
    mediaLinksText: ""
  });

  async function loadVersions() {
    if (dataStatus !== "live") {
      setVersionsState({
        loading: false,
        error: "Instruction versioning needs live API data.",
        versions: []
      });
      return;
    }
    if (!operationId) {
      setVersionsState({
        loading: false,
        error: "Operation ID unavailable for this version group.",
        versions: []
      });
      return;
    }
    setVersionsState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const response = await api.instructions.listByOperation(operationId, role);
      setVersionsState({
        loading: false,
        error: "",
        versions: normalizeInstructionVersionList(response)
      });
    } catch (err) {
      setVersionsState({
        loading: false,
        error: err?.message || "Unable to load instruction versions.",
        versions: []
      });
    }
  }

  useEffect(() => {
    loadVersions().catch((err) => { console.error("[inspectflow] loadVersions:", err?.message || err); });
  }, [operationId, role, dataStatus]);

  function parseVersionPayload() {
    const mediaLinks = normalizeInstructionMediaLinks(form.mediaLinksText);
    return {
      title: form.title.trim(),
      summary: form.summary.trim(),
      body: form.body.trim(),
      versionLabel: form.versionLabel.trim(),
      mediaLinks,
      media_links: mediaLinks,
      mediaUrls: mediaLinks.map((link) => link.url),
      media_urls: mediaLinks.map((link) => link.url),
      links: mediaLinks
    };
  }

  async function handleCreateVersion() {
    if (dataStatus !== "live") {
      setVersionsState((prev) => ({
        ...prev,
        error: "Instruction versioning needs live API data."
      }));
      return;
    }
    if (!operationId) {
      setVersionsState((prev) => ({
        ...prev,
        error: "Operation ID unavailable for this version group."
      }));
      return;
    }
    const payload = parseVersionPayload();
    if (!payload.title && !payload.summary && !payload.body && payload.mediaLinks.length === 0) {
      setVersionsState((prev) => ({
        ...prev,
        error: "Enter a title, summary, body, or media link before creating a version."
      }));
      return;
    }
    setSaving(true);
    setVersionsState((prev) => ({ ...prev, error: "" }));
    try {
      await api.instructions.createVersion(
        operationId,
        {
          ...payload,
          partNumber,
          operationId
        },
        role
      );
      setForm({
        versionLabel: "",
        title: "",
        summary: "",
        body: "",
        mediaLinksText: ""
      });
      await loadVersions();
    } catch (err) {
      setVersionsState((prev) => ({
        ...prev,
        error: err?.message || "Unable to create instruction version."
      }));
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishVersion(version) {
    if (dataStatus !== "live" || !operationId) return;
    setPublishingId(String(version.id));
    setVersionsState((prev) => ({ ...prev, error: "" }));
    try {
      await api.instructions.publishVersion(
        operationId,
        version.id,
        {
          versionId: version.id,
          versionLabel: version.versionLabel || undefined,
          publishNote: version.note || undefined,
          publish: true
        },
        role
      );
      await loadVersions();
    } catch (err) {
      setVersionsState((prev) => ({
        ...prev,
        error: err?.message || "Unable to publish instruction version."
      }));
    } finally {
      setPublishingId("");
    }
  }

  const sortedVersions = [...versionsState.versions].sort((a, b) => {
    if ((a.active ? 1 : 0) !== (b.active ? 1 : 0)) return a.active ? -1 : 1;
    const aTime = a.publishedAt || a.createdAt || "";
    const bTime = b.publishedAt || b.createdAt || "";
    return String(bTime).localeCompare(String(aTime));
  });

  return (
    <div
      className="card"
      style={{ marginTop: "1rem" }}
      data-testid={`instruction-manager-${operationId || opKey}`}
    >
      <div className="card-head">
        <div className="card-title">Instruction Versions</div>
        <div className="text-muted" style={{ fontSize: ".7rem" }}>
          {operationId
            ? `Part ${partNumber} · Op ${opKey} · ID ${operationId}`
            : "Instruction versioning unavailable"}
        </div>
      </div>
      <div className="card-body">
        {versionsState.error && (
          <div className="err-text" style={{ marginBottom: ".75rem" }}>
            {versionsState.error}
          </div>
        )}
        <div className="row2">
          <div className="field">
            <label>Version Label</label>
            <input
              value={form.versionLabel}
              onChange={(e) => setForm((prev) => ({ ...prev, versionLabel: e.target.value }))}
              placeholder="v1 or A"
              style={{ fontFamily: "var(--mono)" }}
            />
          </div>
          <div className="field">
            <label>Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Setup / measurement instruction title"
            />
          </div>
        </div>
        <div className="row2 mt1">
          <div className="field">
            <label>Summary</label>
            <textarea
              value={form.summary}
              onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))}
              rows={3}
              placeholder="Short operator-facing summary…"
            />
          </div>
          <div className="field">
            <label>Media Links</label>
            <textarea
              value={form.mediaLinksText}
              onChange={(e) => setForm((prev) => ({ ...prev, mediaLinksText: e.target.value }))}
              rows={3}
              placeholder="Label | https://example.com/file.pdf"
              style={{ fontFamily: "var(--mono)", fontSize: ".74rem" }}
            />
          </div>
        </div>
        <div className="field mt1">
          <label>Instruction Body</label>
          <textarea
            value={form.body}
            onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
            rows={4}
            placeholder="Detailed work or measurement instruction text…"
          />
        </div>
        <div className="gap1 mt1">
          <button
            className="btn btn-primary btn-sm"
            disabled={saving || dataStatus !== "live" || !operationId}
            onClick={handleCreateVersion}
          >
            {saving ? "Creating…" : "Create Version"}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={versionsState.loading}
            onClick={() => loadVersions()}
          >
            {versionsState.loading ? "Refreshing…" : "Refresh Versions"}
          </button>
        </div>
        <div style={{ marginTop: "1rem", display: "grid", gap: ".6rem" }}>
          {versionsState.loading && (
            <div className="text-muted" style={{ fontSize: ".74rem" }}>
              Loading versions…
            </div>
          )}
          {!versionsState.loading && sortedVersions.length === 0 && (
            <div className="text-muted" style={{ fontSize: ".74rem" }}>
              No instruction versions yet.
            </div>
          )}
          {sortedVersions.map((version) => (
            <div
              key={String(version.id)}
              style={{
                padding: ".75rem",
                border: "1px solid var(--border2)",
                borderRadius: "3px",
                background: "var(--panel2)"
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: ".75rem",
                  alignItems: "flex-start",
                  flexWrap: "wrap"
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: ".9rem" }}>
                    {version.versionLabel
                      ? `Version ${version.versionLabel}`
                      : "Instruction version"}
                    {version.active && (
                      <span className="badge badge-ok" style={{ marginLeft: ".5rem" }}>
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-muted" style={{ fontSize: ".72rem", marginTop: ".2rem" }}>
                    {version.title || "Untitled"}
                    {version.createdAt ? ` · ${fmtTs(version.createdAt)}` : ""}
                  </div>
                </div>
                <div className="gap1" style={{ flexWrap: "wrap" }}>
                  <span
                    className={`badge ${version.status === "published" || version.active ? "badge-open" : "badge-draft"}`}
                  >
                    {version.status || "draft"}
                  </span>
                  {version.acknowledged && <span className="badge badge-ok">Acknowledged</span>}
                  <button
                    className="btn btn-ghost btn-xs"
                    disabled={
                      saving ||
                      publishingId === String(version.id) ||
                      version.active ||
                      version.status === "published" ||
                      dataStatus !== "live"
                    }
                    onClick={() => handlePublishVersion(version)}
                  >
                    {publishingId === String(version.id) ? "Publishing…" : "Publish"}
                  </button>
                </div>
              </div>
              {version.summary && (
                <div
                  className="text-muted"
                  style={{ fontSize: ".76rem", marginTop: ".45rem", lineHeight: 1.5 }}
                >
                  {version.summary}
                </div>
              )}
              {version.body && (
                <div style={{ marginTop: ".45rem", fontSize: ".78rem", lineHeight: 1.55 }}>
                  {version.body}
                </div>
              )}
              {version.mediaLinks.length > 0 && (
                <div className="gap1" style={{ marginTop: ".55rem", flexWrap: "wrap" }}>
                  {version.mediaLinks.map((link, idx) => (
                    <a
                      key={`${version.id}-${idx}-${link.url}`}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost btn-xs"
                      style={{ textDecoration: "none" }}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
