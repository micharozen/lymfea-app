import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type PageSize = number | "auto";

interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  /** Nom des éléments comptés ; par défaut « entrées » traduit. */
  itemName?: string;
  /** Valeur courante du sélecteur de taille de page (nombre ou "auto"). */
  pageSize?: PageSize;
  /** Options proposées dans le sélecteur (ex. [20, 50, 100]). */
  pageSizeOptions?: number[];
  /** Callback quand l'utilisateur change la taille de page. */
  onPageSizeChange?: (size: PageSize) => void;
}

export function TablePagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  itemName,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
}: TablePaginationProps) {
  const { t } = useTranslation("common");
  const showSizeSelector = !!onPageSizeChange && !!pageSizeOptions?.length;

  // Sans sélecteur de taille, on masque la barre s'il n'y a qu'une page (comportement historique).
  if (totalPages <= 1 && !showSizeSelector) return null;

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border flex-shrink-0 bg-card">
      <p className="text-xs text-muted-foreground">
        {t("pagination.showing", {
          start: startItem,
          end: endItem,
          total: totalItems,
          itemName: itemName ?? t("pagination.defaultItemName"),
        })}
      </p>
      <div className="flex items-center gap-2">
        {showSizeSelector && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground hidden sm:inline">{t("pagination.perPage")}</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) =>
                onPageSizeChange!(v === "auto" ? "auto" : Number(v))
              }
            >
              <SelectTrigger className="h-8 w-[72px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto" className="text-xs">
                  Auto
                </SelectItem>
                {pageSizeOptions!.map((size) => (
                  <SelectItem key={size} value={String(size)} className="text-xs">
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {totalPages > 1 && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
              disabled={currentPage === 1}
              className="h-8 px-2"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              {t("pagination.pageOf", { current: currentPage, total: totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="h-8 px-2"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
