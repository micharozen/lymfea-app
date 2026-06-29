import { useEffect, useRef } from "react";

/**
 * Calls `callback` whenever the app/tab regains focus or becomes visible again.
 *
 * Useful on PWA screens that fetch data manually (no realtime, no
 * refetchOnWindowFocus): when a therapist backgrounds the app and returns,
 * the data is re-fetched so stale rows (e.g. a booking reassigned to someone
 * else in the meantime) disappear.
 */
export function useRefetchOnFocus(callback: () => void, enabled = true): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const lastRunRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const trigger = () => {
      // Debounce: focus + visibilitychange often fire together.
      const now = Date.now();
      if (now - lastRunRef.current < 1000) return;
      lastRunRef.current = now;
      callbackRef.current();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") trigger();
    };

    window.addEventListener("focus", trigger);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", trigger);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled]);
}
