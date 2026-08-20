import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatPrice } from "@/lib/formatPrice";
import { format } from "date-fns";
import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/lib/dateLocale";
import {
  MapPin,
  Users,
  Briefcase,
  Percent,
  Euro,
  Clock,
  CalendarDays,
  Plug,
  Settings,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  return DAYS_OF_WEEK[day] || i18n.t('admin:hotelDialog.dayFallback', { day });
}

function getScheduleTypeLabel(type?: string | null): string {
  switch (type) {
    case "always_open": return i18n.t('admin:hotelDialog.scheduleAlwaysOpen');
    case "specific_days": return i18n.t('admin:hotelDialog.scheduleRecurring');
    case "one_time": return i18n.t('admin:hotelDialog.scheduleSpecific');
    default: return i18n.t('admin:hotelDialog.scheduleUndefined');
  }
}

function formatTime(time: string | null | undefined): string {
  if (!time) return "--:--";
  return time.substring(0, 5);
}

function formatDateStr(dateStr: string): string {
  return format(new Date(dateStr), "d MMM yyyy", { locale: getDateLocale(i18n.language) });
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return i18n.t('admin:hotelDialog.indefinitely');
  if (start && !end) return i18n.t('admin:hotelDialog.fromDate', { date: formatDateStr(start) });
  if (!start && end) return i18n.t('admin:hotelDialog.untilDate', { date: formatDateStr(end) });
  return `${formatDateStr(start!)} - ${formatDateStr(end!)}`;
}

interface VenueOverviewTabProps {
  hotelId: string;
}

export function VenueOverviewTab({ hotelId }: VenueOverviewTabProps) {
  const { t } = useTranslation(['admin', 'common']);
  const queryClient = useQueryClient();
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

  // Fetch PMS connection status
  const { data: pmsStatus } = useQuery({
    queryKey: ["venue-pms-status", hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotel_pms_configs" as any)
        .select("connection_status, connection_verified_at")
        .eq("hotel_id", hotelId)
        .maybeSingle();
      if (error) return null;
      return data as { connection_status: string; connection_verified_at: string | null } | null;
    },
    enabled: !!(hotel as any)?.pms_type,
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
        if (b.status === "confirmed" || b.status === "completed") {
          bookingsCount++;
        }
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
          {t('hotelDialog.location')}
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
          {t('hotelDialog.deploymentSchedule')}
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
                {t('hotelDialog.hours')}
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
                <span className="text-sm text-muted-foreground">{t('hotelDialog.days')}</span>
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
              <span className="text-muted-foreground">{t('hotelDialog.period')}</span>
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
              {t('hotelDialog.noSchedule')}
            </p>
          )}
        </div>
      </div>

      <Separator />

      {/* Commissions */}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Percent className="h-4 w-4" />
          {t('hotelDialog.commissions')}
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">
              {hotel.venue_type === "hotel" ? t('hotelDialog.typeHotel') : hotel.venue_type === "coworking" ? t('hotelDialog.typeCoworking') : hotel.venue_type === "enterprise" ? t('hotelDialog.typeEnterprise') : t('hotelDialog.typeVenue')}
            </p>
            <p className="text-lg font-semibold">{hotel.hotel_commission}%</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">{t('hotelDialog.therapist')}</p>
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
              <p className="text-sm text-muted-foreground">{t('hotelDialog.noConcierge')}</p>
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
              {t('hotelDialog.pmsTitle')}
            </h3>
            <div className="bg-muted/50 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">
                      {(hotel as any).pms_type === 'opera_cloud' ? 'Oracle Opera Cloud' : (hotel as any).pms_type === 'mews' ? 'Mews' : t('hotelDialog.pmsNotConfigured')}
                    </p>
                    {(hotel as any).pms_type && (
                      pmsStatus?.connection_status === 'connected' ? (
                        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 border-green-200">
                          {t('venue.general.connected')}
                        </Badge>
                      ) : pmsStatus?.connection_status === 'failed' ? (
                        <Badge variant="outline" className="text-xs bg-red-500/10 text-red-700 border-red-200">
                          {t('venue.general.connectionFailed')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-700 border-yellow-200">
                          {t('venue.general.notTested')}
                        </Badge>
                      )
                    )}
                  </div>
                  {(hotel as any).pms_type && pmsStatus?.connection_status === 'connected' && pmsStatus?.connection_verified_at && (
                    <p className="text-xs text-muted-foreground">
                      {t('venue.general.connectedSince', { date: format(new Date(pmsStatus.connection_verified_at), "d MMMM yyyy", { locale: getDateLocale(i18n.language) }) })}
                    </p>
                  )}
                  {(hotel as any).pms_type && (
                    <div className="flex gap-2 flex-wrap">
                      {(hotel as any).pms_auto_charge_room && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 border-green-200 cursor-default">
                              {t('hotelDialog.autoCharge')}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('venue.general.autoChargeTooltip')}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {(hotel as any).pms_guest_lookup_enabled && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 border-green-200 cursor-default">
                              {t('hotelDialog.guestLookup')}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('venue.general.guestLookupTooltip')}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPmsDialogOpen(true)}
                >
                  {(hotel as any).pms_type ? (
                    <>
                      <Settings className="h-4 w-4 mr-2" />
                      {t('common:buttons.edit')}
                    </>
                  ) : (
                    <>
                      <Plug className="h-4 w-4 mr-2" />
                      {t('hotelDialog.configure')}
                    </>
                  )}
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
          {t('hotelDialog.statistics')}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">{t('hotelDialog.totalSales')}</p>
            <p className="text-xl font-semibold">
              {formatPrice(stats?.totalSales || 0, hotel.currency)}
            </p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">{t('hotelDialog.bookings')}</p>
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
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["venue-pms-status", hotelId] });
            queryClient.invalidateQueries({ queryKey: ["venue-overview", hotelId] });
          }}
        />
      )}
    </div>
  );
}
