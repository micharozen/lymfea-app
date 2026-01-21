import { useState, useCallback, useMemo } from "react";

export type SortDirection = "asc" | "desc";

export interface SortConfig<T extends string = string> {
  column: T | null;
  direction: SortDirection;
}

interface UseTableSortReturn<T extends string = string> {
  sortConfig: SortConfig<T>;
  toggleSort: (column: T) => void;
  resetSort: () => void;
  getSortDirection: (column: T) => SortDirection | null;
  sortItems: <I>(items: I[], getValueFn: (item: I, column: T) => unknown) => I[];
}

export function useTableSort<T extends string = string>(
  defaultColumn?: T,
  defaultDirection: SortDirection = "asc"
): UseTableSortReturn<T> {
  const [sortConfig, setSortConfig] = useState<SortConfig<T>>({
    column: defaultColumn ?? null,
    direction: defaultDirection,
  });

  const toggleSort = useCallback((column: T) => {
    setSortConfig((prev) => {
      if (prev.column === column) {
        return {
          column,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return { column, direction: "asc" };
    });
  }, []);

  const resetSort = useCallback(() => {
    setSortConfig({ column: null, direction: "asc" });
  }, []);

  const getSortDirection = useCallback(
    (column: T): SortDirection | null => {
      if (sortConfig.column === column) {
        return sortConfig.direction;
      }
      return null;
    },
    [sortConfig]
  );

  const sortItems = useCallback(
    <I,>(items: I[], getValueFn: (item: I, column: T) => unknown): I[] => {
      if (!sortConfig.column) return items;

      const sorted = [...items].sort((a, b) => {
        const aValue = getValueFn(a, sortConfig.column as T);
        const bValue = getValueFn(b, sortConfig.column as T);

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        let comparison = 0;

        if (typeof aValue === "string" && typeof bValue === "string") {
          comparison = aValue.localeCompare(bValue, "fr", { sensitivity: "base" });
        } else if (typeof aValue === "number" && typeof bValue === "number") {
          comparison = aValue - bValue;
        } else if (aValue instanceof Date && bValue instanceof Date) {
          comparison = aValue.getTime() - bValue.getTime();
        } else {
          comparison = String(aValue).localeCompare(String(bValue));
        }

        return sortConfig.direction === "asc" ? comparison : -comparison;
      });

      return sorted;
    },
    [sortConfig]
  );

  return {
    sortConfig,
    toggleSort,
    resetSort,
    getSortDirection,
    sortItems,
  };
}
