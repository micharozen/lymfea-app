import { useEffect, useRef } from "react";

/**
 * Returns a ref that is true while the component is mounted.
 * Use before setState/toast after async work or realtime callbacks.
 */
export function useIsMounted() {
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return isMountedRef;
}
