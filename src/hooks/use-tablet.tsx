import * as React from "react";

const TABLET_BREAKPOINT = 1024;

export function useIsTabletOrBelow() {
  const [isTabletOrBelow, setIsTabletOrBelow] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${TABLET_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsTabletOrBelow(window.innerWidth < TABLET_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsTabletOrBelow(window.innerWidth < TABLET_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isTabletOrBelow;
}
