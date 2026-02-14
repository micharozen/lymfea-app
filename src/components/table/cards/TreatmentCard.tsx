import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/formatPrice";
import { Pencil, Trash2, Copy } from "lucide-react";

interface Treatment {
  id: string;
  name: string;
  image?: string | null;
  duration?: number | null;
  price?: number | null;
  currency?: string | null;
  price_on_request?: boolean | null;
  lead_time?: number | null;
  service_for?: string | null;
  category?: string | null;
  status?: string | null;
}

interface Hotel {
  id: string;
  name: string;
  image?: string | null;
}

interface TreatmentCardProps {
  treatment: Treatment;
  hotel?: Hotel | null;
  isAdmin: boolean;
  onView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function TreatmentCard({
  treatment,
  hotel,
  isAdmin,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
}: TreatmentCardProps) {
  const formatDuration = (minutes: number | null | undefined) => {
    if (!minutes) return "-";
    return `${minutes}min`;
  };

  const getGenderEmoji = (serviceFor: string | null | undefined) => {
    if (serviceFor === "Male") return "👨";
    if (serviceFor === "Female") return "👩";
    return "👥";
  };

  return (
    <div
      className="bg-card border border-border rounded-lg p-4 cursor-pointer active:bg-muted/50 transition-colors"
      onClick={onView}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        {treatment.image ? (
          <img
            src={treatment.image}
            alt={treatment.name}
            className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-2xl flex-shrink-0">
            💆
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-foreground text-sm leading-tight">
              {treatment.name}
            </h3>
            <Badge
              variant={treatment.status === "active" ? "default" : "secondary"}
              className={cn(
                "text-[10px] px-2 py-0.5 flex-shrink-0",
                treatment.status === "active" &&
                  "bg-green-500/10 text-green-700 border-green-200",
                treatment.status === "inactive" &&
                  "bg-red-500/10 text-red-700 border-red-200"
              )}
            >
              {treatment.status === "active" ? "Actif" : "Inactif"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {treatment.category} {getGenderEmoji(treatment.service_for)}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-muted/50 rounded px-2.5 py-1.5">
          <span className="text-muted-foreground text-xs">Duree: </span>
          <span className="font-medium text-foreground text-xs">
            {treatment.price_on_request ? "Sur demande" : formatDuration(treatment.duration)}
          </span>
        </div>
        <div className="bg-muted/50 rounded px-2.5 py-1.5">
          <span className="text-muted-foreground text-xs">Prix: </span>
          <span className="font-medium text-foreground text-xs">
            {treatment.price_on_request
              ? "Sur demande"
              : formatPrice(treatment.price, treatment.currency || "EUR", { decimals: 0 })}
          </span>
        </div>
        {hotel && (
          <div className="bg-muted/50 rounded px-2.5 py-1.5 col-span-2">
            <span className="text-muted-foreground text-xs">Hotel: </span>
            <span className="font-medium text-foreground text-xs">{hotel.name}</span>
          </div>
        )}
      </div>

      {/* Actions Footer (Admin only) */}
      {isAdmin && (
        <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-3"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Pencil className="h-4 w-4 mr-1.5" />
            Modifier
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-3"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
          >
            <Copy className="h-4 w-4 mr-1.5" />
            Dupliquer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-3 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Supprimer
          </Button>
        </div>
      )}
    </div>
  );
}
