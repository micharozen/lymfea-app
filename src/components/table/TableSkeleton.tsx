import { Skeleton } from "@/components/ui/skeleton";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";

interface TableSkeletonProps {
  rows?: number;
  columns: number;
  rowHeight?: string;
}

export function TableSkeleton({
  rows = 5,
  columns,
  rowHeight = "h-10",
}: TableSkeletonProps) {
  return (
    <TableBody>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <TableRow key={rowIndex} className={`${rowHeight} border-b`}>
          {Array.from({ length: columns }).map((_, colIndex) => (
            <TableCell key={colIndex} className="py-2 px-2">
              <Skeleton
                className={`h-4 ${colIndex === 0 ? "w-3/4" : "w-full"}`}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}
