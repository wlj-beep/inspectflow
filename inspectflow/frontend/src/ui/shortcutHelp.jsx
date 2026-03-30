import { useEffect } from "react";

const DEFAULT_SHORTCUTS = [
  { key: "?", action: "Open this help overlay" },
  { key: "Escape", action: "Close dialogs and overlays" },
  { key: "Enter", action: "Confirm the current action" },
  { key: "Arrow keys", action: "Move between fields and cells" }
];

function normalizeShortcuts(shortcuts) {
  if (!Array.isArray(shortcuts) || shortcuts.length === 0) return DEFAULT_SHORTCUTS;

  return shortcuts
    .map((shortcut) => ({
      key: String(shortcut?.key || "").trim(),
      action: String(shortcut?.action || "").trim()
    }))
    .filter((shortcut) => shortcut.key || shortcut.action);
}

export function ShortcutHelpOverlay({ open, onClose, shortcuts }) {
  const items = normalizeShortcuts(shortcuts);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        onClose?.();
      }
    }}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-help-title"
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <h2 id="shortcut-help-title" className="modal-title" style={{ marginBottom: 0 }}>
            Keyboard Shortcuts
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onClose?.()} aria-label="Close shortcut help">
            ✕
          </button>
        </div>

        <p className="text-muted" style={{ margin: ".75rem 0 1rem", lineHeight: 1.5 }}>
          Keep your hands on the keyboard with these quick actions.
        </p>

        <ul
          aria-label="Keyboard shortcuts"
          style={{
            listStyle: "none",
            display: "grid",
            gap: ".55rem",
            padding: 0,
            margin: 0
          }}
        >
          {items.map((shortcut) => (
            <li
              key={`${shortcut.key}-${shortcut.action}`}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(110px, 160px) 1fr",
                gap: ".75rem",
                alignItems: "center",
                padding: ".55rem .7rem",
                border: "1px solid var(--border2)",
                borderRadius: "3px",
                background: "var(--panel)"
              }}
            >
              <kbd
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: ".75rem",
                  color: "var(--accent2)",
                  whiteSpace: "nowrap"
                }}
              >
                {shortcut.key}
              </kbd>
              <span className="text-muted" style={{ fontSize: ".8rem" }}>
                {shortcut.action}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
