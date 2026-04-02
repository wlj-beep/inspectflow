import { useEffect, useRef } from "react";

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
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = typeof document !== "undefined" ? document.activeElement : null;
    const focusTarget = closeButtonRef.current || dialogRef.current;
    const focusTimeout = typeof window !== "undefined"
      ? window.setTimeout(() => {
        if (focusTarget && typeof focusTarget.focus === "function") {
          focusTarget.focus();
        }
      }, 0)
      : null;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
        return;
      }
      if (event.key !== "Tab") return;
      const container = dialogRef.current;
      if (!container) return;
      const focusable = container.querySelectorAll(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      const focusableList = Array.from(focusable).filter((element) => !element.hasAttribute("disabled"));
      if (focusableList.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusableList[0];
      const last = focusableList[focusableList.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      if (focusTimeout !== null) {
        window.clearTimeout(focusTimeout);
      }
      window.removeEventListener("keydown", handleKeyDown);
      const prior = previousFocusRef.current;
      if (prior && typeof prior.focus === "function" && prior.isConnected) {
        prior.focus();
      }
      previousFocusRef.current = null;
    };
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
        aria-describedby="shortcut-help-copy"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <h2 id="shortcut-help-title" className="modal-title" style={{ marginBottom: 0 }}>
            Keyboard Shortcuts
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onClose?.()} aria-label="Close shortcut help" ref={closeButtonRef}>
            ✕
          </button>
        </div>

        <p id="shortcut-help-copy" className="text-muted" style={{ margin: ".75rem 0 1rem", lineHeight: 1.5 }}>
          Keep your hands on the keyboard with these quick actions.
        </p>

        <ul aria-label="Keyboard shortcuts" className="shortcut-help-list">
          {items.map((shortcut) => (
            <li
              key={`${shortcut.key}-${shortcut.action}`}
              className="shortcut-help-item"
            >
              <kbd>
                {shortcut.key}
              </kbd>
              <span className="shortcut-help-action">
                {shortcut.action}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
