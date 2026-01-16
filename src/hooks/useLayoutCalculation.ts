import { useState, useRef, useCallback, useEffect } from "react";

interface UseLayoutCalculationOptions {
  rowHeight?: number;
  tableHeaderHeight?: number;
  paginationHeight?: number;
  sidebarOffset?: number;
  chromePadding?: number;
  minRows?: number;
}

interface UseLayoutCalculationReturn {
  headerRef: React.RefObject<HTMLDivElement>;
  filtersRef: React.RefObject<HTMLDivElement>;
  itemsPerPage: number;
}

export function useLayoutCalculation(
  options: UseLayoutCalculationOptions = {}
): UseLayoutCalculationReturn {
  const {
    rowHeight = 40,
    tableHeaderHeight = 32,
    paginationHeight = 48,
    sidebarOffset = 64,
    chromePadding = 32,
    minRows = 5,
  } = options;

  const [itemsPerPage, setItemsPerPage] = useState(10);
  const headerRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);

  const computeRows = useCallback(() => {
    const pageHeaderHeight = headerRef.current?.offsetHeight || 80;
    const filtersHeight = filtersRef.current?.offsetHeight || 60;

    const usedHeight =
      pageHeaderHeight +
      filtersHeight +
      tableHeaderHeight +
      paginationHeight +
      sidebarOffset +
      chromePadding;

    const availableForRows = window.innerHeight - usedHeight;
    const rows = Math.max(minRows, Math.floor(availableForRows / rowHeight));

    setItemsPerPage(rows);
  }, [rowHeight, tableHeaderHeight, paginationHeight, sidebarOffset, chromePadding, minRows]);

  useEffect(() => {
    computeRows();
    window.addEventListener("resize", computeRows);
    return () => window.removeEventListener("resize", computeRows);
  }, [computeRows]);

  return {
    headerRef,
    filtersRef,
    itemsPerPage,
  };
}
