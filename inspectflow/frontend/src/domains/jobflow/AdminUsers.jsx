import React, { useEffect, useRef, useState } from "react";
import { CAPABILITY_DEFS, DEFAULT_ROLE_CAPS } from "./constants.js";
import {
  readUrlEnumParam,
  readUrlIntParam,
  readUrlQueryParam,
  writeUrlQueryParams
} from "./jobflowUtils.js";

export default function AdminUsers({ users, roleCaps, onCreateUser, onUpdateUser, onRemoveUser, onDirtyChange }) {
  const [form, setForm] = useState({ name: "", role: "Operator", active: true });
  const [err, setErr] = useState("");
  const [apiErr, setApiErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [edits, setEdits] = useState({});
  const [search, setSearch] = useState(() => readUrlQueryParam("usersSearch", ""));
  const [roleFilter, setRoleFilter] = useState(() => {
    const raw = String(readUrlQueryParam("usersRole", "")).trim();
    return ["", "Operator", "Quality", "Supervisor", "Admin"].includes(raw) ? raw : "";
  });
  const [sortKey, setSortKey] = useState(() =>
    readUrlEnumParam("usersSort", ["name", "role", "active"], "name")
  );
  const [sortDir, setSortDir] = useState(() =>
    readUrlEnumParam("usersDir", ["asc", "desc"], "asc")
  );
  const [pageSize, setPageSize] = useState(() =>
    readUrlIntParam("usersPageSize", 25, { min: 1, max: 1000 })
  );
  const [page, setPage] = useState(() => readUrlIntParam("usersPage", 1, { min: 1, max: 100000 }));
  const pageResetReadyRef = useRef(false);

  async function handleAdd() {
    if (!form.name.trim()) {
      setErr("Name required.");
      return;
    }
    setErr("");
    setApiErr("");
    setSaving(true);
    try {
      await onCreateUser({ name: form.name.trim(), role: form.role, active: form.active });
      setForm({ name: "", role: "Operator", active: true });
    } catch (e) {
      setApiErr(e?.message || "Unable to add user.");
    } finally {
      setSaving(false);
    }
  }

  function editFor(u) {
    return edits[u.id] || { name: u.name, role: u.role, active: u.active !== false };
  }

  function editForId(id) {
    const u = users.find((x) => String(x.id) === String(id));
    if (u) return editFor(u);
    return edits[id] || { name: "", role: "Operator", active: true };
  }

  function updateEdit(id, patch) {
    const next = { ...editForId(id), ...patch };
    const u = users.find((x) => String(x.id) === String(id));
    if (
      u &&
      next.name === u.name &&
      next.role === u.role &&
      (next.active !== false) === (u.active !== false)
    ) {
      setEdits((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
      return;
    }
    setEdits((p) => ({ ...p, [id]: next }));
  }

  async function handleSaveAll() {
    const ids = Object.keys(edits);
    if (ids.length === 0) return;
    setApiErr("");
    setSavingAll(true);
    try {
      for (const id of ids) {
        const v = editForId(id);
        await onUpdateUser(id, { name: v.name, role: v.role, active: v.active });
      }
      setEdits({});
    } catch (e) {
      setApiErr(e?.message || "Unable to update users.");
    } finally {
      setSavingAll(false);
    }
  }

  function handleDiscardAll() {
    setEdits({});
  }

  async function handleRemove(id) {
    setApiErr("");
    try {
      await onRemoveUser(id);
    } catch (e) {
      setApiErr(e?.message || "Unable to remove user.");
    }
  }

  useEffect(() => {
    if (onDirtyChange) onDirtyChange(Object.keys(edits).length > 0);
  }, [edits, onDirtyChange]);

  const orderedRoles = ["Operator", "Quality", "Supervisor", "Admin"];
  const hasUserFilters = !!search.trim() || !!roleFilter;
  const filteredUsers = users.filter((u) => {
    if (roleFilter && String(u.role || "") !== roleFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const hay = [u.name, u.role, u.active !== false ? "active" : "inactive", u.id]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const av =
      sortKey === "role"
        ? String(a.role || "")
        : sortKey === "active"
          ? String(a.active !== false)
          : String(a.name || "");
    const bv =
      sortKey === "role"
        ? String(b.role || "")
        : sortKey === "active"
          ? String(b.active !== false)
          : String(b.name || "");
    return String(av).localeCompare(String(bv)) * dir;
  });
  const totalPages = Math.max(1, Math.ceil(sortedUsers.length / Math.max(1, pageSize)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pagedUsers = sortedUsers.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    writeUrlQueryParams({
      usersSearch: search.trim(),
      usersRole: roleFilter,
      usersSort: sortKey,
      usersDir: sortDir,
      usersPageSize: pageSize,
      usersPage: page
    });
  }, [search, roleFilter, sortKey, sortDir, pageSize, page]);

  useEffect(() => {
    if (!pageResetReadyRef.current) {
      pageResetReadyRef.current = true;
      return;
    }
    setPage(1);
  }, [search, roleFilter, sortKey, sortDir, pageSize]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

  function sortIcon(key) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? "↑" : "↓";
  }

  function clearFilters() {
    setSearch("");
    setRoleFilter("");
  }

  function roleSummary(role) {
    const caps = (roleCaps?.[role] || []).slice();
    if (!caps.length) return "No permissions assigned.";
    const labels = caps
      .map((cap) => CAPABILITY_DEFS.find((c) => c.key === cap)?.label || cap.replace(/_/g, " "))
      .sort((a, b) => a.localeCompare(b));
    const viewCount = caps.filter((c) => c.startsWith("view_")).length;
    const manageCount = caps.filter((c) => c.startsWith("manage_")).length;
    const highlights = [
      viewCount ? `${viewCount} view` : "",
      manageCount ? `${manageCount} manage` : "",
      caps.includes("submit_records") ? "submit records" : "",
      caps.includes("edit_records") ? "edit records" : ""
    ]
      .filter(Boolean)
      .join(" · ");
    return `${highlights ? `${highlights} | ` : ""}${labels.join(", ")}`;
  }

  return (
    <div>
      <div className="card">
        <div
          className="card-head"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem"
          }}
        >
          <div className="card-title">Add New User</div>
          <div className="gap1">
            <button
              className="btn btn-ghost btn-sm"
              disabled={savingAll || Object.keys(edits).length === 0}
              onClick={handleDiscardAll}
            >
              Discard Changes
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={savingAll || Object.keys(edits).length === 0}
              onClick={handleSaveAll}
            >
              {savingAll ? "Saving…" : "Save All"}
            </button>
          </div>
        </div>
        <div className="card-body">
          {Object.keys(edits).length > 0 && (
            <div className="banner warn" style={{ marginBottom: ".75rem" }}>
              You have unsaved changes. Save All or Discard Changes before leaving this page.
            </div>
          )}
          <div className="row3">
            <div className="field">
              <label>Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Alex Rivera"
              />
            </div>
            <div className="field">
              <label>Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              >
                <option>Operator</option>
                <option>Quality</option>
                <option>Supervisor</option>
                <option>Admin</option>
              </select>
            </div>
            <div className="field" style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
              <label style={{ marginTop: "1.25rem" }}>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                />{" "}
                Active
              </label>
            </div>
          </div>
          {err && <p className="err-text mt1">{err}</p>}
          {apiErr && <p className="err-text mt1">{apiErr}</p>}
          <div className="mt2">
            <button className="btn btn-primary" disabled={saving} onClick={handleAdd}>
              {saving ? "Saving…" : "+ Add User"}
            </button>
          </div>
        </div>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-head">
          <div className="card-title">Users</div>
          <div className="text-muted" style={{ fontSize: ".72rem" }}>
            {sortedUsers.length} shown
          </div>
        </div>
        <div className="card-body" style={{ paddingBottom: ".5rem" }}>
          <div className="row2" style={{ gap: ".75rem" }}>
            <div className="field" style={{ gridColumn: "span 2" }}>
              <label htmlFor="users-filter-search">Search</label>
              <input
                id="users-filter-search"
                placeholder="Search name, role, status..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="users-filter-role">Role</label>
              <select
                id="users-filter-role"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="">All</option>
                <option>Operator</option>
                <option>Quality</option>
                <option>Supervisor</option>
                <option>Admin</option>
              </select>
            </div>
          </div>
          {hasUserFilters ? (
            <div className="gap1 mt1" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
                Clear Filters
              </button>
            </div>
          ) : null}
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort("name")} style={{ cursor: "pointer" }}>
                Name {sortIcon("name")}
              </th>
              <th onClick={() => toggleSort("role")} style={{ cursor: "pointer" }}>
                Role {sortIcon("role")}
              </th>
              <th onClick={() => toggleSort("active")} style={{ cursor: "pointer" }}>
                Active {sortIcon("active")}
              </th>
              <th style={{ width: "60px" }}></th>
            </tr>
          </thead>
          <tbody>
            {pagedUsers.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">
                    {users.length === 0
                      ? "No users found."
                      : hasUserFilters
                        ? "No users match your filters."
                        : "No users available."}
                    {users.length > 0 && hasUserFilters ? (
                      <div className="gap1 mt1" style={{ justifyContent: "center" }}>
                        <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
                          Clear Filters
                        </button>
                      </div>
                    ) : null}
                  </div>
                </td>
              </tr>
            )}
            {pagedUsers.map((u) => {
              const v = editFor(u);
              return (
                <tr key={u.id}>
                  <td>
                    <input
                      value={v.name}
                      onChange={(e) => updateEdit(u.id, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      value={v.role}
                      onChange={(e) => updateEdit(u.id, { role: e.target.value })}
                    >
                      <option>Operator</option>
                      <option>Quality</option>
                      <option>Supervisor</option>
                      <option>Admin</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={v.active}
                      onChange={(e) => updateEdit(u.id, { active: e.target.checked })}
                    />
                  </td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => handleRemove(u.id)}>
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div
          className="card-body"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: ".65rem",
            flexWrap: "wrap"
          }}
        >
          <div className="text-muted">
            Showing {sortedUsers.length === 0 ? 0 : (safePage - 1) * pageSize + 1}-
            {Math.min(sortedUsers.length, safePage * pageSize)} of {sortedUsers.length}
          </div>
          <div className="gap1">
            <select
              value={String(pageSize)}
              onChange={(e) => setPageSize(Math.max(1, Number(e.target.value) || 25))}
            >
              <option value="25">25 / page</option>
              <option value="50">50 / page</option>
              <option value="100">100 / page</option>
            </select>
            <button
              className="btn btn-ghost btn-sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <span className="text-muted mono">
              Page {safePage}/{totalPages}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
        <div className="card-body" style={{ paddingTop: ".75rem" }}>
          <div className="section-label" style={{ marginBottom: ".35rem" }}>
            Role Permissions (Live)
          </div>
          <div className="text-muted" style={{ fontSize: ".78rem", lineHeight: 1.5 }}>
            {orderedRoles.map((role) => (
              <div key={role}>
                <strong style={{ color: "var(--text)" }}>{role}</strong>: {roleSummary(role)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
