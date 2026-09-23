import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { enUS, fr as frLocale } from "date-fns/locale";
import { Check, MapPin, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import PwaHeader from "@/components/pwa/Header";
import PwaPageLoader from "@/components/pwa/PageLoader";
import { useCurrentTherapist } from "@/hooks/pwa/useCurrentTherapist";
import { useMyBookingsWindow, type PwaBooking } from "@/hooks/pwa/usePwaBookings";
import { dashboardWindow } from "@/lib/pwaBookingWindow";
import { isMyBooking } from "@/lib/pwaMyBooking";
import { formatLegMinutes, myLegMinutes } from "@/lib/myLegForBooking";
import { myLegSlot } from "@/lib/myLegSlot";
import { addMinutesToClock } from "@/lib/therapistLegDuration";

const DIGEST_TYPE = "daily_digest";

const CANCELLED_STATUSES = new Set([
  "cancelled",
  "canceled",
  "Annulé",
  "declined",
  "expired",
  "no_show",
  "noshow",
]);

/** Une étape de la journée : le rendez-vous, ramené à ma jambe. */
interface DayStop {
  booking: PwaBooking;
  /** Début de MA prestation, pas forcément celui de la réservation. */
  startTime: string;
  endTime: string;
  minutes: number;
  /** Minutes de battement depuis l'étape précédente, `null` pour la première. */
  gapMinutes: number | null;
  venueChanged: boolean;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Agenda du lendemain.
 *
 * Cible du push de synthèse J-1 : le thérapeute y retrouve d'un coup d'œil le
 * déroulé de sa journée, et confirme l'avoir vu — ce que la coordinatrice
 * vérifiait jusqu'ici par un sondage WhatsApp.
 */
const PwaTomorrow = () => {
  const { t, i18n } = useTranslation("pwa");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();

  const { data: me } = useCurrentTherapist();
  const therapistId = me?.therapist?.id ?? null;

  // `?d=` fige la journée visée : sans lui, un push ouvert après minuit
  // afficherait le surlendemain.
  const dateKey = params.get("d") ?? format(addDays(new Date(), 1), "yyyy-MM-dd");

  // Même fenêtre — donc même entrée de cache — que le tableau de bord : arriver
  // ici depuis un push ne relance aucune requête.
  const window = useMemo(() => dashboardWindow(), []);
  const { data: allBookings, isLoading } = useMyBookingsWindow(therapistId, window);

  const stops = useMemo<DayStop[]>(() => {
    const mine = (allBookings ?? [])
      .filter(
        (b) =>
          b.booking_date === dateKey &&
          isMyBooking(b, therapistId) &&
          !CANCELLED_STATUSES.has(b.status),
      )
      .map((b) => {
        const slot = myLegSlot(b, therapistId);
        const startTime = (slot.booking_time ?? b.booking_time ?? "").slice(0, 5);
        const minutes = myLegMinutes(b, therapistId);
        return { booking: b, startTime, minutes };
      })
      .sort((a, z) => a.startTime.localeCompare(z.startTime));

    return mine.map((entry, index) => {
      const previous = index > 0 ? mine[index - 1] : null;
      const previousEnd = previous
        ? toMinutes(addMinutesToClock(previous.startTime, previous.minutes))
        : null;
      return {
        ...entry,
        endTime: addMinutesToClock(entry.startTime, entry.minutes),
        gapMinutes: previousEnd === null ? null : toMinutes(entry.startTime) - previousEnd,
        venueChanged: !!previous && previous.booking.hotel_id !== entry.booking.hotel_id,
      };
    });
  }, [allBookings, dateKey, therapistId]);

  const totalMinutes = stops.reduce((sum, s) => sum + s.minutes, 0);

  // L'ouverture EST la requête : pas d'effet à déclencher, react-query gère la
  // déduplication, le retry et le double montage de StrictMode.
  const digestKey = ["pwa", "digest", therapistId, dateKey] as const;
  const { data: digest } = useQuery({
    queryKey: digestKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", me?.userId ?? "")
        .eq("type", DIGEST_TYPE)
        .eq("target_date", dateKey)
        .select("id, read, acknowledged_at")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!me?.userId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const confirm = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .update({ acknowledged_at: new Date().toISOString(), read: true })
        .eq("user_id", me?.userId ?? "")
        .eq("type", DIGEST_TYPE)
        .eq("target_date", dateKey)
        .select("id, read, acknowledged_at")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => queryClient.setQueryData(digestKey, data),
  });

  const acknowledged = !!digest?.acknowledged_at;
  // `startsWith` : la langue détectée peut valoir "fr-FR", que l'égalité stricte
  // laissait retomber sur l'anglais.
  const dateLabel = format(parseISO(dateKey), "EEEE d MMMM", {
    locale: i18n.language?.startsWith("en") ? enUS : frLocale,
  });

  if (isLoading) return <PwaPageLoader />;

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Le chiffre qui compte en premier : combien de réservations demain. */}
      <PwaHeader
        title={stops.length === 0 ? t("tomorrow.empty") : t("tomorrow.title", { count: stops.length })}
        showBack
        backPath="/pwa/dashboard"
      />

      <div className="px-4 pt-5 pb-2">
        <h1 className="text-xl font-normal capitalize">{dateLabel}</h1>
        {stops.length > 0 && (
          <p className="text-sm text-muted-foreground mt-1">
            {t("tomorrow.subtitle", {
              hours: formatLegMinutes(totalMinutes),
              start: stops[0].startTime,
            })}
          </p>
        )}
      </div>

      {stops.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-8 text-center">
          <p className="text-sm text-muted-foreground">{t("tomorrow.emptyHint")}</p>
        </div>
      ) : (
        <ol className="flex-1 px-4 pb-32 pt-2">
          {stops.map((stop, index) => (
            <li key={stop.booking.id}>
              {stop.gapMinutes !== null && (
                <div className="flex items-stretch gap-3 min-h-[2.5rem]">
                  <div className="w-8 flex justify-center">
                    <div className="w-px border-l border-dashed border-border" />
                  </div>
                  <p className="text-xs text-muted-foreground self-center">
                    {stop.venueChanged
                      ? t("tomorrow.venueChange")
                      : t("tomorrow.gap", { duration: formatLegMinutes(Math.max(stop.gapMinutes, 0)) })}
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                {/* Pastille numérotée + fil conducteur de la journée. */}
                <div className="w-8 flex flex-col items-center flex-shrink-0">
                  <span className="w-8 h-8 rounded-full bg-primary/10 text-primary text-sm flex items-center justify-center">
                    {index + 1}
                  </span>
                  {index < stops.length - 1 && <div className="flex-1 w-px bg-border mt-1" />}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    navigate(`/pwa/booking/${stop.booking.id}`, { state: { from: "tomorrow" } })
                  }
                  className={cn(
                    "flex-1 text-left rounded-xl border border-border bg-card p-4 mb-1",
                    "active:scale-[0.99] transition-transform",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-base flex items-center gap-2">
                      {stop.startTime} — {stop.endTime}
                      {/* Duo = plusieurs clientes au même créneau (guest_count),
                          jamais déduit du statut. */}
                      {(stop.booking.guest_count ?? 1) > 1 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[11px] px-2 py-0.5">
                          <Users className="h-3 w-3" />
                          {t("tomorrow.duo")}
                        </span>
                      )}
                    </span>
                    {stop.booking.hotel_name && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{stop.booking.hotel_name}</span>
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground mt-1">
                    {(stop.booking.booking_treatments ?? [])
                      .map((bt) => bt.treatment_menus?.name)
                      .filter(Boolean)
                      .join(", ")}
                    {stop.minutes > 0 && ` · ${stop.minutes} min`}
                  </p>

                  <p className="text-sm mt-2">
                    {stop.booking.client_first_name} {stop.booking.client_last_name}
                    {stop.booking.room_number && (
                      <span className="text-muted-foreground">
                        {" · "}
                        {t("tomorrow.room", { room: stop.booking.room_number })}
                      </span>
                    )}
                  </p>

                  {stop.booking.therapistName && (stop.booking.guest_count ?? 1) > 1 && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {t("tomorrow.withColleague", { name: stop.booking.therapistName })}
                    </p>
                  )}
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {stops.length > 0 && digest && (
        <div className="fixed bottom-0 left-0 right-0 px-4 pt-3 pb-safe bg-background/95 backdrop-blur border-t border-border">
          <Button
            className="w-full font-normal"
            variant={acknowledged ? "outline" : "default"}
            disabled={acknowledged || confirm.isPending}
            onClick={() => confirm.mutate()}
          >
            {acknowledged && <Check className="h-4 w-4 mr-2" />}
            {acknowledged ? t("tomorrow.seenDone") : t("tomorrow.seen")}
          </Button>
        </div>
      )}
    </div>
  );
};

export default PwaTomorrow;
