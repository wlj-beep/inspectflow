import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "../../api/index.js";

export default function GlobalSearchBar({ currentRole, onOpenResult }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [desktopOnly, setDesktopOnly] = useState(
    typeof window === "undefined" ? true : window.innerWidth >= 1100
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => setDesktopOnly(window.innerWidth >= 1100);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  async function runSearch(event) {
    event?.preventDefault?.();
    const trimmed = String(query || "").trim();
    if (!trimmed) {
      setResults([]);
      setOpen(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await api.search.global(trimmed, currentRole || "Operator", 15);
      const rows = Array.isArray(response)
        ? response
        : Array.isArray(response?.results)
          ? response.results
          : [];
      setResults(rows);
      setOpen(true);
    } catch (err) {
      setResults([]);
      setOpen(true);
      setError(err?.message || "Search unavailable.");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenResult(result) {
    if (!result) return;
    onOpenResult?.(result);
    setOpen(false);
  }

  if (!desktopOnly) return null;

  return (
    <div style={{ position: "relative", minWidth: "min(34vw, 360px)" }}>
      <form onSubmit={runSearch} style={{ display: "flex", gap: ".4rem", alignItems: "center" }}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search jobs, records, issues, audits, tools, users…"
          style={{
            minHeight: "2rem",
            width: "100%",
            border: "1px solid var(--border2)",
            borderRadius: "4px",
            padding: ".2rem .5rem"
          }}
          aria-label="Global search"
        />
        <button className="nav-btn" type="submit" disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </button>
      </form>
      {open ? (
        <div
          style={{
            position: "absolute",
            top: "2.35rem",
            right: 0,
            width: "min(90vw, 620px)",
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            boxShadow: "0 10px 24px rgba(0,0,0,.28)",
            zIndex: 90,
            maxHeight: "58vh",
            overflow: "auto",
            padding: ".5rem"
          }}
        >
          {error ? (
            <div className="text-muted" style={{ color: "#ff9a9a" }}>
              {error}
            </div>
          ) : null}
          {!error && results.length === 0 ? (
            <div className="text-muted">No matches found.</div>
          ) : null}
          {!error &&
            results.map((result) => (
              <button
                key={`${result.entityType}:${result.entityId}`}
                type="button"
                onClick={() => handleOpenResult(result)}
                style={{
                  display: "grid",
                  width: "100%",
                  textAlign: "left",
                  gap: ".15rem",
                  marginBottom: ".35rem",
                  border: "1px solid var(--border2)",
                  borderRadius: "5px",
                  background: "var(--panel2)",
                  color: "var(--text)",
                  padding: ".45rem .55rem",
                  cursor: "pointer"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: ".8rem",
                    alignItems: "center"
                  }}
                >
                  <strong>{result.title || `${result.entityType} ${result.entityId}`}</strong>
                  <span className="badge badge-info" style={{ textTransform: "uppercase" }}>
                    {result.entityType}
                  </span>
                </div>
                <div className="text-muted" style={{ fontSize: ".78rem" }}>
                  {result.subtitle || ""}
                </div>
                <div className="text-muted" style={{ fontSize: ".74rem" }}>
                  {result.context || ""}
                </div>
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}

