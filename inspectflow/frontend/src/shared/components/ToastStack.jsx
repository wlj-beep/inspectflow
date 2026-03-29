import React from "react";

export default function ToastStack({ toasts, onDismiss }) {
  if (!Array.isArray(toasts) || toasts.length === 0) return null;
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => {
        const toneClass =
          toast.status === "loading"
            ? "transition-loading"
            : toast.status === "success"
              ? "transition-success"
              : "transition-error";
        const label =
          toast.status === "loading" ? "Working" : toast.status === "success" ? "Done" : "Error";
        const role = toast.status === "error" ? "alert" : "status";
        const live = toast.status === "error" ? "assertive" : "polite";
        return (
          <div
            key={toast.id}
            className={`toast-card ${toneClass}`}
            role={role}
            aria-live={live}
            data-testid="transition-toast"
          >
            <span className="transition-label">{label}</span>
            <span className="toast-msg">{toast.message}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => onDismiss?.(toast.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
