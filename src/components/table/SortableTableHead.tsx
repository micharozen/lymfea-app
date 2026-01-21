import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SortDirection } from "@/hooks/useTableSort";

interface SortableTableHeadProps {
  children: React.ReactNode;
  column: string;
  sortDirection: SortDirection | null;
  onSort: (column: string) => void;
  className?: string;
  align?: "left" | "right" | "center";
}

export function SortableTableHead({
  children,
  column,
  sortDirection,
  onSort,
  className,
  align = "left",
}: SortableTableHeadProps) {
  const handleClick = () => {
    onSort(column);
  };

  return (
    <TableHead
      className={cn(
        "font-medium text-muted-foreground text-xs py-1.5 px-2 cursor-pointer select-none hover:bg-muted/50 transition-colors",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
      onClick={handleClick}
    >
      <div
        className={cn(
          "flex items-center gap-1",
          align === "right" && "justify-end",
          align === "center" && "justify-center"
        )}
      >
        <span className="truncate">{children}</span>
        {sortDirection === "asc" ? (
          <ArrowUp className="h-3 w-3 flex-shrink-0" />
        ) : sortDirection === "desc" ? (
          <ArrowDown className="h-3 w-3 flex-shrink-0" />
        ) : (
          <ArrowUpDown className="h-3 w-3 flex-shrink-0 opacity-40" />
        )}
      </div>
    </TableHead>
  );
}
