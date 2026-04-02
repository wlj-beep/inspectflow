import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_TTL_MS = 5000;
const MAX_TOASTS = 5;
const DEDUPE_WINDOW_MS = 1200;

const TONE_ORDER = Object.freeze(["info", "success", "warning", "error"]);
const TONE_DEFAULTS = Object.freeze({
  info: { ttlMs: 5000, sticky: false },
  success: { ttlMs: 4000, sticky: false },
  warning: { ttlMs: 8000, sticky: false },
  error: { ttlMs: 9000, sticky: true }
});

function normalizeTone(tone) {
  const value = String(tone || "").trim().toLowerCase();
  return TONE_ORDER.includes(value) ? value : "info";
}

function toneRank(tone) {
  return TONE_ORDER.indexOf(normalizeTone(tone));
}

function makeToastId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `toast_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeToast(input) {
  const toast = input || {};
  const tone = normalizeTone(toast.tone);
  const defaults = TONE_DEFAULTS[tone] || TONE_DEFAULTS.info;
  const now = Date.now();
  const message = String(toast.message || "");
  return {
    id: toast.id || makeToastId(),
    tone,
    message,
    // Key used for short-window dedupe (helps during bursty transitions).
    dedupeKey: String(toast.dedupeKey || `${tone}:${message}`),
    sticky: typeof toast.sticky === "boolean" ? toast.sticky : defaults.sticky,
    ttlMs: Number.isFinite(toast.ttlMs) ? toast.ttlMs : (defaults.ttlMs ?? DEFAULT_TTL_MS),
    createdAt: Number.isFinite(toast.createdAt) ? toast.createdAt : now,
    count: Math.max(1, Math.floor(Number(toast.count) || 1))
  };
}

export function useToastStack() {
  const [toasts, setToasts] = useState([]);
  // Map<toastId, { timer: Timeout, expiresAt: number }>
  const timersRef = useRef(new Map());
  const toastsRef = useRef([]);

  useEffect(() => {
    toastsRef.current = Array.isArray(toasts) ? toasts : [];
  }, [toasts]);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const entry = timersRef.current.get(id);
    if (entry?.timer) clearTimeout(entry.timer);
    timersRef.current.delete(id);
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
    for (const entry of timersRef.current.values()) {
      if (entry?.timer) clearTimeout(entry.timer);
    }
    timersRef.current.clear();
  }, []);

  const pushToast = useCallback((toastInput) => {
    const toast = normalizeToast(toastInput);
    const now = Date.now();
    let returnId = toast.id;

    // Compute return id from a snapshot so callers can dismiss reliably.
    const snapshot = Array.isArray(toastsRef.current) ? toastsRef.current : [];
    if (snapshot.some((item) => item?.id === toast.id)) {
      returnId = toast.id;
    } else {
      for (let i = snapshot.length - 1; i >= 0; i -= 1) {
        const item = snapshot[i];
        if (item?.dedupeKey === toast.dedupeKey && now - Number(item.createdAt || 0) <= DEDUPE_WINDOW_MS) {
          returnId = item.id;
          break;
        }
      }
    }

    setToasts((current) => {
      const items = Array.isArray(current) ? current : [];
      const existingById = items.find((item) => item.id === toast.id);
      if (existingById) {
        return items.map((item) => (item.id === toast.id ? { ...item, ...toast, createdAt: now } : item));
      }

      let existingByDedupe = null;
      for (let i = items.length - 1; i >= 0; i -= 1) {
        const item = items[i];
        if (item?.dedupeKey === toast.dedupeKey) {
          existingByDedupe = item;
          break;
        }
      }
      if (existingByDedupe && now - Number(existingByDedupe.createdAt || 0) <= DEDUPE_WINDOW_MS) {
        const bumped = {
          ...existingByDedupe,
          ...toast,
          id: existingByDedupe.id,
          count: (Number(existingByDedupe.count) || 1) + 1,
          createdAt: now
        };
        return [...items.filter((item) => item.id !== existingByDedupe.id), bumped];
      }

      let next = [...items, { ...toast, createdAt: now }];

      // Evict oldest, preferring non-sticky + lower-severity items first.
      while (next.length > MAX_TOASTS) {
        let bestIndex = -1;
        let bestScore = Number.POSITIVE_INFINITY;
        for (let i = 0; i < next.length; i += 1) {
          const item = next[i];
          // Lower score = more likely to evict.
          const rank = toneRank(item.tone); // info(0) .. error(3)
          const stickyPenalty = item.sticky ? 100 : 0;
          const age = Number(item.createdAt || 0);
          const score = stickyPenalty + (rank * 10) + age / 1e12;
          if (score < bestScore) {
            bestScore = score;
            bestIndex = i;
          }
        }
        if (bestIndex >= 0) {
          const [evicted] = next.splice(bestIndex, 1);
          const entry = timersRef.current.get(evicted?.id);
          if (entry?.timer) clearTimeout(entry.timer);
          timersRef.current.delete(evicted?.id);
        } else {
          break;
        }
      }

      return next;
    });

    return returnId;
  }, []);

  // Reconcile timers against the active toast list so bursty updates never leak timeouts.
  useEffect(() => {
    const ids = new Set(Array.isArray(toasts) ? toasts.map((t) => t.id) : []);

    for (const [id, entry] of timersRef.current.entries()) {
      if (!ids.has(id)) {
        if (entry?.timer) clearTimeout(entry.timer);
        timersRef.current.delete(id);
      }
    }

    for (const toast of Array.isArray(toasts) ? toasts : []) {
      if (!toast || !toast.id) continue;
      if (toast.sticky) {
        const entry = timersRef.current.get(toast.id);
        if (entry?.timer) clearTimeout(entry.timer);
        timersRef.current.delete(toast.id);
        continue;
      }

      const ttlMs = Math.max(0, Number.isFinite(toast.ttlMs) ? toast.ttlMs : DEFAULT_TTL_MS);
      const createdAt = Number.isFinite(toast.createdAt) ? toast.createdAt : Date.now();
      const expiresAt = createdAt + ttlMs;
      const existing = timersRef.current.get(toast.id);
      if (existing?.expiresAt === expiresAt) continue;

      if (existing?.timer) clearTimeout(existing.timer);
      const remaining = Math.max(0, expiresAt - Date.now());
      const timer = setTimeout(() => dismissToast(toast.id), remaining);
      timersRef.current.set(toast.id, { timer, expiresAt });
    }
  }, [toasts, dismissToast]);

  useEffect(() => {
    return () => {
      for (const entry of timersRef.current.values()) {
        if (entry?.timer) clearTimeout(entry.timer);
      }
      timersRef.current.clear();
    };
  }, []);

  return { toasts, pushToast, dismissToast, dismissAll };
}

export function ToastStack({ toasts = [], onDismiss }) {
  const toneMeta = {
    info: { label: "Info", glyph: "i" },
    success: { label: "Success", glyph: "OK" },
    warning: { label: "Warning", glyph: "!" },
    error: { label: "Error", glyph: "X" }
  };

  return (
    <div className="toast-stack" aria-label="Notifications">
      {toasts.map((toast) => {
        const tone = toast.tone || "info";
        const role = tone === "error" ? "alert" : "status";
        const ariaLive = tone === "error" ? "assertive" : "polite";
        const meta = toneMeta[tone] || toneMeta.info;
        const label = toast.count > 1 ? `${meta.label} (x${toast.count})` : meta.label;

        return (
          <div
            key={toast.id}
            className={`toast-item toast-${tone}`}
            role={role}
            aria-live={ariaLive}
            aria-atomic="true"
          >
            <div className="toast-icon" aria-hidden="true">{meta.glyph}</div>
            <div className="toast-body">
              <div className="toast-label">{label}</div>
              <div className="toast-message">{toast.message}</div>
            </div>
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
