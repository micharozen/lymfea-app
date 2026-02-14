import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Pencil, Copy } from "lucide-react";
import { ReactNode } from "react";

export type EntityStatus = "active" | "inactive" | "pending" | "maintenance" | string;

interface EntityDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  // Header props
  title: string;
  subtitle?: string;
  image?: string | null;
  emoji?: string;
  status?: EntityStatus;
  statusLabel?: string;
  // Content
  children: ReactNode;
}

const statusStyles: Record<string, string> = {
  active: "bg-green-500/10 text-green-700",
  inactive: "bg-red-500/10 text-red-700",
  pending: "bg-orange-500/10 text-orange-700",
  maintenance: "bg-blue-500/10 text-blue-700",
};

const statusLabels: Record<string, string> = {
  active: "Actif",
  inactive: "Inactif",
  pending: "En attente",
  maintenance: "Maintenance",
};

export function EntityDetailDialog({
  open,
  onOpenChange,
  onEdit,
  onDuplicate,
  title,
  subtitle,
  image,
  emoji,
  status,
  statusLabel,
  children,
}: EntityDetailDialogProps) {
  const initials = title.substring(0, 2).toUpperCase();
  const displayStatus = statusLabel || (status ? statusLabels[status] || status : undefined);
  const statusStyle = status ? statusStyles[status] || "bg-muted text-muted-foreground" : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14 rounded-lg">
              <AvatarImage src={image || undefined} alt={title} />
              <AvatarFallback className="rounded-lg bg-muted text-lg font-medium">
                {emoji || initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl font-semibold truncate">
                {title}
              </DialogTitle>
              {(subtitle || displayStatus) && (
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {displayStatus && (
                    <Badge
                      variant={status === "active" ? "default" : "secondary"}
                      className={cn("text-xs", statusStyle)}
                    >
                      {displayStatus}
                    </Badge>
                  )}
                  {subtitle && (
                    <span className="text-sm text-muted-foreground">{subtitle}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {children}
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          {onDuplicate && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onDuplicate();
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              Dupliquer
            </Button>
          )}
          {onEdit && (
            <Button
              onClick={() => {
                onOpenChange(false);
                onEdit();
              }}
              className="bg-foreground text-background hover:bg-foreground/90"
            >
              <Pencil className="h-4 w-4 mr-2" />
              Modifier
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
