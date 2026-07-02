import { useCallback, useRef } from "react";

interface LongPressOptions {
  delay?: number;
  moveThreshold?: number;
}

/**
 * Detects a press-and-hold gesture without swallowing taps or scrolls.
 * `bind(cb)` returns pointer handlers to spread on a target; the timer is
 * cancelled if the pointer moves past `moveThreshold` (i.e. the user is
 * scrolling). Call `consumeLongPress()` at the top of the target's onClick to
 * skip the click action when it was actually a long-press.
 */
export function useLongPress({ delay = 450, moveThreshold = 10 }: LongPressOptions = {}) {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  const bind = useCallback(
    (onLongPress: () => void) => ({
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        firedRef.current = false;
        startRef.current = { x: e.clientX, y: e.clientY };
        timerRef.current = window.setTimeout(() => {
          firedRef.current = true;
          onLongPress();
        }, delay);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!startRef.current) return;
        if (
          Math.abs(e.clientX - startRef.current.x) > moveThreshold ||
          Math.abs(e.clientY - startRef.current.y) > moveThreshold
        ) {
          cancel();
        }
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    }),
    [delay, moveThreshold, cancel],
  );

  const consumeLongPress = useCallback(() => {
    if (firedRef.current) {
      firedRef.current = false;
      return true;
    }
    return false;
  }, []);

  return { bind, consumeLongPress };
}

export default useLongPress;
