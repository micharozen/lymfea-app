import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/formatPrice";
import {
  MapPin,
  Building2,
  Users,
  Briefcase,
  Percent,
  Euro,
  Calendar,
  Pencil,
} from "lucide-react";

interface Concierge {
  id: string;
  first_name: string;
  last_name: string;
  profile_image: string | null;
}

interface Trunk {
  id: string;
  name: string;
  trunk_id: string;
  image: string | null;
}

interface HotelStats {
  bookingsCount: number;
  totalSales: number;
}

interface Hotel {
  id: string;
  name: string;
  image: string | null;
  cover_image: string | null;
  address: string;
  city: string;
  country: string;
  postal_code: string | null;
  currency: string;
  vat: number;
  hotel_commission: number;
  hairdresser_commission: number;
  status: string;
  created_at: string;
  updated_at: string;
  concierges?: Concierge[];
  trunks?: Trunk[];
  stats?: HotelStats;
}

interface HotelDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hotel: Hotel | null;
  onEdit?: () => void;
}

export function HotelDetailDialog({
  open,
  onOpenChange,
  hotel,
  onEdit,
}: HotelDetailDialogProps) {
  if (!hotel) return null;

  const oomCommission = Math.max(
    0,
    100 - (hotel.hotel_commission || 0) - (hotel.hairdresser_commission || 0)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14 rounded-lg">
              <AvatarImage src={hotel.image || undefined} alt={hotel.name} />
              <AvatarFallback className="rounded-lg bg-muted text-lg font-medium">
                {hotel.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl font-semibold truncate">
                {hotel.name}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant={hotel.status === "active" ? "default" : "secondary"}
                  className={cn(
                    "text-xs",
                    hotel.status === "active" && "bg-green-500/10 text-green-700",
                    hotel.status === "pending" && "bg-orange-500/10 text-orange-700"
                  )}
                >
                  {hotel.status === "active" ? "Actif" : "En attente"}
                </Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Location */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Localisation
            </h3>
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <p className="text-sm font-medium">{hotel.address}</p>
              <p className="text-sm text-muted-foreground">
                {hotel.postal_code && `${hotel.postal_code} `}
                {hotel.city}
                {hotel.country && `, ${hotel.country}`}
              </p>
            </div>
          </div>

          <Separator />

          {/* Commissions */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Percent className="h-4 w-4" />
              Commissions
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Hôtel</p>
                <p className="text-lg font-semibold">{hotel.hotel_commission}%</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Coiffeur</p>
                <p className="text-lg font-semibold">{hotel.hairdresser_commission}%</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">OOM</p>
                <p className="text-lg font-semibold">{oomCommission.toFixed(0)}%</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>TVA: {hotel.vat}%</span>
              <span>Devise: {hotel.currency}</span>
            </div>
          </div>

          <Separator />

          {/* Concierges */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Users className="h-4 w-4" />
              Concierges ({hotel.concierges?.length || 0})
            </h3>
            {hotel.concierges && hotel.concierges.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {hotel.concierges.map((concierge) => (
                  <div
                    key={concierge.id}
                    className="flex items-center gap-2 bg-muted/50 rounded-full pl-1 pr-3 py-1"
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={concierge.profile_image || undefined} />
                      <AvatarFallback className="text-xs">
                        {concierge.first_name[0]}
                        {concierge.last_name?.[0] || ""}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">
                      {concierge.first_name} {concierge.last_name}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun concierge assigné</p>
            )}
          </div>

          <Separator />

          {/* Trunks */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Malles ({hotel.trunks?.length || 0})
            </h3>
            {hotel.trunks && hotel.trunks.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {hotel.trunks.map((trunk) => (
                  <div
                    key={trunk.id}
                    className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2"
                  >
                    {trunk.image ? (
                      <img
                        src={trunk.image}
                        alt={trunk.name}
                        className="w-6 h-6 rounded object-cover"
                      />
                    ) : (
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">{trunk.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune malle assignée</p>
            )}
          </div>

          <Separator />

          {/* Statistics */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Euro className="h-4 w-4" />
              Statistiques
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Ventes totales</p>
                <p className="text-xl font-semibold">
                  {formatPrice(hotel.stats?.totalSales || 0, hotel.currency)}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Réservations</p>
                <p className="text-xl font-semibold">{hotel.stats?.bookingsCount || 0}</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
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
