import { useCallback, useEffect, useRef, useState } from "react";

export function useTransitionToasts() {
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(1);
  const toastTimeoutsRef = useRef({});

  const clearToastTimer = useCallback((id) => {
    const handle = toastTimeoutsRef.current[id];
    if (handle) {
      clearTimeout(handle);
      delete toastTimeoutsRef.current[id];
    }
  }, []);

  const dismissToast = useCallback(
    (id) => {
      clearToastTimer(id);
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    },
    [clearToastTimer]
  );

  const scheduleToastDismiss = useCallback(
    (id, ms) => {
      clearToastTimer(id);
      if (!ms || ms <= 0) return;
      toastTimeoutsRef.current[id] = setTimeout(() => dismissToast(id), ms);
    },
    [clearToastTimer, dismissToast]
  );

  const pushToast = useCallback(
    (status, message, options = {}) => {
      const id = toastIdRef.current++;
      const next = { id, status, message };
      setToasts((prev) => [...prev, next].slice(-6));
      scheduleToastDismiss(id, options.autoDismissMs || 0);
      return id;
    },
    [scheduleToastDismiss]
  );

  const patchToast = useCallback(
    (id, updates, options = {}) => {
      setToasts((prev) =>
        prev.map((toast) => (toast.id === id ? { ...toast, ...updates } : toast))
      );
      scheduleToastDismiss(id, options.autoDismissMs || 0);
    },
    [scheduleToastDismiss]
  );

  const runTransition = useCallback(
    async (actionLabel, fn) => {
      const toastId = pushToast("loading", `${actionLabel}…`);
      try {
        const result = await fn();
        patchToast(
          toastId,
          { status: "success", message: `${actionLabel} complete.` },
          { autoDismissMs: 5000 }
        );
        return result;
      } catch (err) {
        const detail = err?.message ? ` ${err.message}` : "";
        patchToast(
          toastId,
          { status: "error", message: `${actionLabel} failed.${detail}` },
          { autoDismissMs: 0 }
        );
        throw err;
      }
    },
    [patchToast, pushToast]
  );

  useEffect(
    () => () => {
      Object.keys(toastTimeoutsRef.current).forEach((id) => clearToastTimer(Number(id)));
    },
    [clearToastTimer]
  );

  return {
    toasts,
    dismissToast,
    runTransition
  };
}
