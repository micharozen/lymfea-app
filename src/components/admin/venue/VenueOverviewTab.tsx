import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatPrice } from "@/lib/formatPrice";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  MapPin,
  Users,
  Briefcase,
  Percent,
  Euro,
  Clock,
  CalendarDays,
  Plug,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PmsConfigDialog } from "@/components/admin/PmsConfigDialog";
import { brand } from "@/config/brand";

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

function formatTime(time: string | null | undefined): string {
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

interface VenueOverviewTabProps {
  hotelId: string;
}

export function VenueOverviewTab({ hotelId }: VenueOverviewTabProps) {
  const [pmsDialogOpen, setPmsDialogOpen] = useState(false);

  // Fetch hotel data
  const { data: hotel, isLoading: loadingHotel } = useQuery({
    queryKey: ["venue-overview", hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("*")
        .eq("id", hotelId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch concierges
  const { data: concierges = [] } = useQuery({
    queryKey: ["venue-concierges", hotelId],
    queryFn: async () => {
      const { data: mappings, error: mapError } = await supabase
        .from("concierge_hotels")
        .select("concierge_id")
        .eq("hotel_id", hotelId);
      if (mapError) throw mapError;
      if (!mappings || mappings.length === 0) return [];

      const ids = mappings.map((m) => m.concierge_id);
      const { data, error } = await supabase
        .from("concierges")
        .select("id, first_name, last_name, profile_image")
        .in("id", ids);
      if (error) throw error;
      return data || [];
    },
    enabled: !!hotel && hotel.venue_type === "hotel",
  });

  // Fetch treatment rooms count
  const { data: roomCount = 0 } = useQuery({
    queryKey: ["venue-rooms-count", hotelId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("treatment_rooms")
        .select("id", { count: "exact", head: true })
        .eq("hotel_id", hotelId);
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch deployment schedule
  const { data: schedule } = useQuery({
    queryKey: ["venue-schedule", hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venue_deployment_schedules")
        .select("*")
        .eq("hotel_id", hotelId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch booking stats
  const { data: stats } = useQuery({
    queryKey: ["venue-stats", hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("total_price, status")
        .eq("hotel_id", hotelId);
      if (error) throw error;

      let totalSales = 0;
      let bookingsCount = 0;
      (data || []).forEach((b) => {
        bookingsCount++;
        if (b.status === "completed" && b.total_price) {
          totalSales += Number(b.total_price);
        }
      });
      return { totalSales, bookingsCount };
    },
  });

  if (loadingHotel) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hotel) return null;

  const lymfeaCommission = Math.max(
    0,
    100 - (hotel.hotel_commission || 0) - (hotel.therapist_commission || 0)
  );

  return (
    <div className="space-y-5">
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
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Type</span>
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                schedule?.schedule_type === "always_open" && "bg-green-500/10 text-green-700 border-green-200",
                schedule?.schedule_type === "specific_days" && "bg-blue-500/10 text-blue-700 border-blue-200",
                schedule?.schedule_type === "one_time" && "bg-purple-500/10 text-purple-700 border-purple-200",
                !schedule && "bg-gray-500/10 text-gray-500 border-gray-200"
              )}
            >
              {getScheduleTypeLabel(schedule?.schedule_type)}
            </Badge>
          </div>

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

          {schedule?.schedule_type === "specific_days" &&
            schedule.days_of_week &&
            schedule.days_of_week.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-sm text-muted-foreground">Jours</span>
                <div className="flex flex-wrap gap-1">
                  {schedule.days_of_week
                    .sort((a: number, b: number) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
                    .map((day: number) => (
                      <Badge key={day} variant="secondary" className="text-xs">
                        {getDayLabel(day)}
                      </Badge>
                    ))}
                </div>
              </div>
            )}

          {schedule?.schedule_type === "specific_days" && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Periode</span>
              <span className="font-medium">
                {formatDateRange(
                  schedule.recurring_start_date,
                  schedule.recurring_end_date
                )}
              </span>
            </div>
          )}

          {schedule?.schedule_type === "one_time" &&
            schedule.specific_dates &&
            schedule.specific_dates.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-sm text-muted-foreground">Dates</span>
                <div className="flex flex-wrap gap-1">
                  {schedule.specific_dates.map((date: string) => (
                    <Badge key={date} variant="secondary" className="text-xs">
                      {formatDateStr(date)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

          {!schedule && (
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
            <p className="text-xs text-muted-foreground mb-1">
              {hotel.venue_type === "hotel" ? "Hôtel" : hotel.venue_type === "coworking" ? "Coworking" : hotel.venue_type === "enterprise" ? "Entreprise" : "Lieu"}
            </p>
            <p className="text-lg font-semibold">{hotel.hotel_commission}%</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Thérapeute</p>
            <p className="text-lg font-semibold">{hotel.therapist_commission}%</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">{brand.name}</p>
            <p className="text-lg font-semibold">{lymfeaCommission.toFixed(0)}%</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>TVA: {hotel.vat}%</span>
          <span>Devise: {hotel.currency}</span>
        </div>
      </div>

      {/* Concierges (hotel only) */}
      {hotel.venue_type === 'hotel' && (
        <>
          <Separator />
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Users className="h-4 w-4" />
              Concierges ({concierges.length})
            </h3>
            {concierges.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {concierges.map((concierge) => (
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

      {/* Treatment Rooms */}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Briefcase className="h-4 w-4" />
          Salles de soin ({roomCount})
        </h3>
        <p className="text-sm text-muted-foreground">
          {roomCount > 0
            ? `${roomCount} salle${roomCount > 1 ? "s" : ""} assignée${roomCount > 1 ? "s" : ""}`
            : "Aucune salle de soin assignée"}
        </p>
      </div>

      {/* PMS Integration (hotel only) */}
      {hotel.venue_type === 'hotel' && (
        <>
          <Separator />
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Plug className="h-4 w-4" />
              Integration PMS
            </h3>
            <div className="bg-muted/50 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {(hotel as any).pms_type === 'opera_cloud' ? 'Oracle Opera Cloud' : 'Non configure'}
                  </p>
                  {(hotel as any).pms_type && (
                    <div className="flex gap-2">
                      {(hotel as any).pms_auto_charge_room && (
                        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 border-green-200">
                          Auto-charge
                        </Badge>
                      )}
                      {(hotel as any).pms_guest_lookup_enabled && (
                        <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-700 border-blue-200">
                          Guest lookup
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPmsDialogOpen(true)}
                >
                  <Plug className="h-4 w-4 mr-2" />
                  Configurer
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

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
              {formatPrice(stats?.totalSales || 0, hotel.currency)}
            </p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Réservations</p>
            <p className="text-xl font-semibold">{stats?.bookingsCount || 0}</p>
          </div>
        </div>
      </div>

      {hotel.venue_type === 'hotel' && (
        <PmsConfigDialog
          open={pmsDialogOpen}
          onOpenChange={setPmsDialogOpen}
          hotelId={hotel.id}
          hotelName={hotel.name}
        />
      )}
    </div>
  );
}
