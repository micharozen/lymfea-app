import { useState, useMemo, useCallback, useEffect } from "react";

interface UsePaginationOptions<T> {
  items: T[];
  itemsPerPage: number;
}

interface UsePaginationReturn<T> {
  currentPage: number;
  setCurrentPage: (page: number) => void;
  totalPages: number;
  paginatedItems: T[];
  needsPagination: boolean;
  resetPage: () => void;
}

export function usePagination<T>(
  options: UsePaginationOptions<T>
): UsePaginationReturn<T> {
  const { items, itemsPerPage } = options;
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = useMemo(
    () => Math.ceil(items.length / itemsPerPage),
    [items.length, itemsPerPage]
  );

  const needsPagination = items.length > itemsPerPage;

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return items.slice(startIndex, startIndex + itemsPerPage);
  }, [items, currentPage, itemsPerPage]);

  const resetPage = useCallback(() => {
    setCurrentPage(1);
  }, []);

  // Reset to page 1 when items change significantly
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return {
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedItems,
    needsPagination,
    resetPage,
  };
}
