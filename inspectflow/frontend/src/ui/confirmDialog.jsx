import { useEffect, useRef } from "react";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  danger = false
}) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel?.();
      }
      if (event.key === "Enter") {
        event.preventDefault();
        onConfirm?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    confirmRef.current?.focus?.();

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onMouseDown={onCancel} role="presentation">
      <div
        className={`modal confirm-dialog${danger ? " confirm-dialog-danger" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-title" id="confirm-dialog-title">
          {title}
        </div>
        <p id="confirm-dialog-message" className="text-muted" style={{ lineHeight: 1.5 }}>
          {message}
        </p>
        <div className="gap1 mt2">
          <button type="button" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm} ref={confirmRef}>
            {confirmLabel}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
