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
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  MapPin,
  Building2,
  Users,
  Briefcase,
  Percent,
  Euro,
  Calendar,
  Pencil,
  Clock,
  CalendarDays,
} from "lucide-react";

// Days of week mapping
const DAYS_OF_WEEK: Record<number, string> = {
  0: "Dim",
  1: "Lun",
  2: "Mar",
  3: "Mer",
  4: "Jeu",
  5: "Ven",
  6: "Sam",
};

function getDayLabel(day: number): string {
  return DAYS_OF_WEEK[day] || `Jour ${day}`;
}

function getScheduleTypeLabel(type?: string | null): string {
  switch (type) {
    case "always_open": return "Toujours disponible";
    case "specific_days": return "Jours recurrents";
    case "one_time": return "Dates specifiques";
    default: return "Non defini";
  }
}

function formatTime(time: string | null): string {
  if (!time) return "--:--";
  return time.substring(0, 5);
}

function formatDateStr(dateStr: string): string {
  return format(new Date(dateStr), "d MMM yyyy", { locale: fr });
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "Indefiniment";
  if (start && !end) return `A partir du ${formatDateStr(start)}`;
  if (!start && end) return `Jusqu'au ${formatDateStr(end)}`;
  return `${formatDateStr(start!)} - ${formatDateStr(end!)}`;
}

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

interface DeploymentSchedule {
  schedule_type: 'always_open' | 'specific_days' | 'one_time';
  days_of_week: number[] | null;
  recurring_start_date: string | null;
  recurring_end_date: string | null;
  specific_dates: string[] | null;
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
  venue_type?: 'hotel' | 'coworking' | 'enterprise' | null;
  opening_time?: string | null;
  closing_time?: string | null;
  auto_validate_bookings?: boolean | null;
  created_at: string;
  updated_at: string;
  concierges?: Concierge[];
  trunks?: Trunk[];
  stats?: HotelStats;
  deployment_schedule?: DeploymentSchedule;
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
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
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
              <div className="flex items-center gap-2 mt-1 flex-wrap">
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
                {hotel.venue_type && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      hotel.venue_type === "hotel" && "bg-blue-500/10 text-blue-700 border-blue-200",
                      hotel.venue_type === "coworking" && "bg-purple-500/10 text-purple-700 border-purple-200"
                    )}
                  >
                    {hotel.venue_type === "hotel" ? "Hotel" : "Coworking"}
                  </Badge>
                )}
                {hotel.auto_validate_bookings && (
                  <Badge
                    variant="outline"
                    className="text-xs bg-emerald-500/10 text-emerald-700 border-emerald-200"
                  >
                    Auto-validation
                  </Badge>
                )}
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

          {/* Deployment Schedule */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Planning de Deploiement
            </h3>
            <div className="bg-muted/50 rounded-lg p-3 space-y-3">
              {/* Schedule Type Badge */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Type</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    hotel.deployment_schedule?.schedule_type === "always_open" && "bg-green-500/10 text-green-700 border-green-200",
                    hotel.deployment_schedule?.schedule_type === "specific_days" && "bg-blue-500/10 text-blue-700 border-blue-200",
                    hotel.deployment_schedule?.schedule_type === "one_time" && "bg-purple-500/10 text-purple-700 border-purple-200",
                    !hotel.deployment_schedule && "bg-gray-500/10 text-gray-500 border-gray-200"
                  )}
                >
                  {getScheduleTypeLabel(hotel.deployment_schedule?.schedule_type)}
                </Badge>
              </div>

              {/* Operating Hours */}
              {(hotel.opening_time || hotel.closing_time) && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Horaires
                  </span>
                  <span className="text-sm font-medium">
                    {formatTime(hotel.opening_time)} - {formatTime(hotel.closing_time)}
                  </span>
                </div>
              )}

              {/* Days of Week (for specific_days) */}
              {hotel.deployment_schedule?.schedule_type === "specific_days" &&
               hotel.deployment_schedule.days_of_week &&
               hotel.deployment_schedule.days_of_week.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-sm text-muted-foreground">Jours</span>
                  <div className="flex flex-wrap gap-1">
                    {hotel.deployment_schedule.days_of_week
                      .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
                      .map((day) => (
                        <Badge key={day} variant="secondary" className="text-xs">
                          {getDayLabel(day)}
                        </Badge>
                      ))}
                  </div>
                </div>
              )}

              {/* Date Range (for recurring) */}
              {hotel.deployment_schedule?.schedule_type === "specific_days" && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Periode</span>
                  <span className="font-medium">
                    {formatDateRange(
                      hotel.deployment_schedule.recurring_start_date,
                      hotel.deployment_schedule.recurring_end_date
                    )}
                  </span>
                </div>
              )}

              {/* Specific Dates (for one_time) */}
              {hotel.deployment_schedule?.schedule_type === "one_time" &&
               hotel.deployment_schedule.specific_dates &&
               hotel.deployment_schedule.specific_dates.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-sm text-muted-foreground">Dates</span>
                  <div className="flex flex-wrap gap-1">
                    {hotel.deployment_schedule.specific_dates.map((date) => (
                      <Badge key={date} variant="secondary" className="text-xs">
                        {formatDateStr(date)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Fallback if no schedule */}
              {!hotel.deployment_schedule && (
                <p className="text-sm text-muted-foreground italic">
                  Aucun planning configure
                </p>
              )}
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

          {/* Concierges - Hidden for coworking venues */}
          {hotel.venue_type !== 'coworking' && (
            <>
              <Separator />
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
                  <p className="text-sm text-muted-foreground">Aucun concierge assigne</p>
                )}
              </div>
            </>
          )}

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
