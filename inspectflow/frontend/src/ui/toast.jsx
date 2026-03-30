import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_TTL_MS = 5000;

function makeToastId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `toast_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeToast(input) {
  const toast = input || {};
  return {
    id: toast.id || makeToastId(),
    tone: toast.tone || "info",
    message: String(toast.message || ""),
    sticky: Boolean(toast.sticky),
    ttlMs: Number.isFinite(toast.ttlMs) ? toast.ttlMs : DEFAULT_TTL_MS
  };
}

export function useToastStack() {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const pushToast = useCallback((toastInput) => {
    const toast = normalizeToast(toastInput);
    setToasts((current) => [...current, toast]);

    if (!toast.sticky) {
      const timer = setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
        timersRef.current.delete(toast.id);
      }, Math.max(0, toast.ttlMs));
      timersRef.current.set(toast.id, timer);
    }

    return toast.id;
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, []);

  return { toasts, pushToast, dismissToast };
}

export function ToastStack({ toasts = [], onDismiss }) {
  return (
    <div className="toast-stack" aria-label="Notifications">
      {toasts.map((toast) => {
        const tone = toast.tone || "info";
        const role = tone === "error" ? "alert" : "status";
        const ariaLive = tone === "error" ? "assertive" : "polite";

        return (
          <div
            key={toast.id}
            className={`toast-item toast-${tone}`}
            role={role}
            aria-live={ariaLive}
            aria-atomic="true"
          >
            <div className="toast-message">{toast.message}</div>
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
