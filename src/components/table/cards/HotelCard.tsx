import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/formatPrice";
import { Pencil, Trash2, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
import { HotelQRCode } from "@/components/HotelQRCode";

interface Concierge {
  id: string;
  first_name: string;
  last_name: string;
  profile_image: string | null;
}

interface TreatmentRoom {
  id: string;
  name: string;
  room_number: string;
  image: string | null;
}

interface HotelStats {
  bookingsCount: number;
  totalSales: number;
}

interface DeploymentSchedule {
  schedule_type: 'always_open' | 'specific_days' | 'one_time';
  specific_dates: string[] | null;
}

interface Hotel {
  id: string;
  name: string;
  image: string | null;
  city: string;
  country: string;
  currency: string;
  venue_type: "hotel" | "coworking" | "enterprise" | null;
  status: string;
  concierges?: Concierge[];
  treatment_rooms?: TreatmentRoom[];
  stats?: HotelStats;
  deployment_schedule?: DeploymentSchedule;
}

interface HotelCardProps {
  hotel: Hotel;
  isAdmin: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function HotelCard({
  hotel,
  isAdmin,
  onView,
  onEdit,
  onDelete,
}: HotelCardProps) {
  return (
    <div
      className="bg-card border border-border rounded-lg p-4 cursor-pointer active:bg-muted/50 transition-colors"
      onClick={onView}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        {hotel.image ? (
          <img
            src={hotel.image}
            alt={hotel.name}
            className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground flex-shrink-0">
            {hotel.name.substring(0, 2).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-foreground text-sm leading-tight">
              {hotel.name}
            </h3>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Badge
                variant={hotel.status === "active" ? "default" : "secondary"}
                className={cn(
                  "text-[10px] px-2 py-0.5",
                  hotel.status === "active" &&
                    "bg-green-500/10 text-green-700 border-green-200",
                  hotel.status === "pending" &&
                    "bg-orange-500/10 text-orange-700 border-orange-200"
                )}
              >
                {hotel.status === "active" ? "Actif" : "En attente"}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-muted-foreground">
              {hotel.city}
              {hotel.country ? `, ${hotel.country}` : ""}
            </p>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0",
                hotel.venue_type === "hotel" &&
                  "bg-blue-500/10 text-blue-700 border-blue-200",
                hotel.venue_type === "coworking" &&
                  "bg-purple-500/10 text-purple-700 border-purple-200",
                hotel.venue_type === "enterprise" &&
                  "bg-emerald-500/10 text-emerald-700 border-emerald-200"
              )}
            >
              {hotel.venue_type === "hotel"
                ? "Hotel"
                : hotel.venue_type === "coworking"
                ? "Coworking"
                : hotel.venue_type === "enterprise"
                ? "Entreprise"
                : "-"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-muted/50 rounded px-2.5 py-1.5">
          <span className="text-muted-foreground text-xs">Ventes: </span>
          <span className="font-medium text-foreground text-xs">
            {formatPrice(hotel.stats?.totalSales || 0, hotel.currency)}
          </span>
        </div>
        <div className="bg-muted/50 rounded px-2.5 py-1.5">
          <span className="text-muted-foreground text-xs">Reservations: </span>
          <span className="font-medium text-foreground text-xs">
            {hotel.stats?.bookingsCount || 0}
          </span>
        </div>
        {hotel.venue_type === "hotel" && (
          <div className="bg-muted/50 rounded px-2.5 py-1.5">
            <span className="text-muted-foreground text-xs">Concierges: </span>
            <span className="font-medium text-foreground text-xs">
              {hotel.concierges?.length || 0}
            </span>
          </div>
        )}
        <div className="bg-muted/50 rounded px-2.5 py-1.5">
          <span className="text-muted-foreground text-xs">Salles: </span>
          <span className="font-medium text-foreground text-xs">
            {hotel.treatment_rooms?.length || 0}
          </span>
        </div>
      </div>

      {/* Actions Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <HotelQRCode hotelId={hotel.id} hotelName={hotel.name} />
          {hotel.venue_type === "enterprise" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-3"
              onClick={() => {
                let url = `${window.location.origin}/enterprise/${hotel.id}`;
                if (hotel.deployment_schedule?.schedule_type === 'one_time' && hotel.deployment_schedule.specific_dates?.length) {
                  const todayStr = new Date().toISOString().split('T')[0];
                  const nextDate = hotel.deployment_schedule.specific_dates
                    .filter(d => d >= todayStr)
                    .sort()[0] || hotel.deployment_schedule.specific_dates.sort().pop();
                  if (nextDate) url += `?date=${nextDate}`;
                }
                navigator.clipboard.writeText(url);
                toast.success("Lien dashboard copié !");
              }}
            >
              <LayoutDashboard className="h-4 w-4 mr-1.5" />
              Dashboard
            </Button>
          )}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
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
    </div>
  );
}
