import { LucideIcon, Inbox } from "lucide-react";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

interface TableEmptyStateProps {
  colSpan: number;
  message?: string;
  description?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
}

export function TableEmptyState({
  colSpan,
  message = "Aucun élément trouvé",
  description,
  icon: Icon = Inbox,
  actionLabel,
  onAction,
}: TableEmptyStateProps) {
  return (
    <TableBody>
      <TableRow>
        <TableCell colSpan={colSpan} className="h-48">
          <div className="flex flex-col items-center justify-center text-center py-8">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Icon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">{message}</p>
            {description && (
              <p className="text-xs text-muted-foreground max-w-sm">{description}</p>
            )}
            {actionLabel && onAction && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={onAction}
              >
                {actionLabel}
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    </TableBody>
  );
}
