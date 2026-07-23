import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  getBookingStatusConfig,
  getCalendarFlowStage,
  calendarFlowStages,
  calendarFlowStageOrder,
} from "@/utils/statusStyles";
import PwaCalendarView from "@/components/pwa/PwaCalendarView";
import PwaDayView, { DayViewBooking } from "@/components/pwa/PwaDayView";
import type { TherapistRates } from "@/lib/therapistEarnings";
import PwaPageLoader from "@/components/pwa/PageLoader";
import { useIsMounted } from "@/hooks/useIsMounted";
import { useRefetchOnFocus } from "@/hooks/pwa/useRefetchOnFocus";

interface BookingTreatment {
  therapist_id?: string | null;
  // Resolved client-side for duo bookings: "Prénom N." of the assigned therapist.
  therapistShortName?: string | null;
  treatment_menus: {
    name: string;
    price: number;
    duration: number;
  } | null;
}

interface Booking {
  id: string;
  booking_id: number;
  booking_date: string;
  booking_time: string;
  client_first_name: string;
  client_last_name: string;
  hotel_name: string;
  room_number: string;
  room_id?: string | null;
  room_name?: string | null;
  status: string;
  payment_status?: string | null;
  phone: string;
  duration?: number;
  total_price?: number | null;
  guest_count?: number | null;
  booking_treatments?: BookingTreatment[];
  therapistName?: string | null;
}

// Compact display name for the planning: "Prénom N." (last name initial).
function shortTherapistName(firstName: string, lastName: string): string {
  const initial = lastName.trim().charAt(0);
  return `${firstName.trim()}${initial ? ` ${initial.toUpperCase()}.` : ""}`;
}

type BookingsView = "day" | "calendar" | "list";
type BookingsScope = "mine" | "venue";

const VIEW_STORAGE_KEY = "pwa-bookings-view";
const SELECTED_DATE_STORAGE_KEY = "pwa-calendar-date";

const PwaBookings = () => {
  const { t } = useTranslation("pwa");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [therapistRates, setTherapistRates] = useState<TherapistRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConcierge, setIsConcierge] = useState(false);
  const [conciergeHotelIds, setConciergeHotelIds] = useState<string[]>([]);
  const [scope, setScope] = useState<BookingsScope>("mine");
  const [view, setView] = useState<BookingsView>(() => {
    const stored = typeof window !== "undefined" ? sessionStorage.getItem(VIEW_STORAGE_KEY) : null;
    if (stored === "day" || stored === "calendar" || stored === "list") return stored;
    return "day";
  });
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const stored = typeof window !== "undefined" ? sessionStorage.getItem(SELECTED_DATE_STORAGE_KEY) : null;
    if (stored) {
      const d = new Date(stored);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });
  const navigate = useNavigate();
  const isMountedRef = useIsMounted();

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/pwa/dashboard");
  };

  useEffect(() => {
    try {
      sessionStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      // ignore
    }
  }, [view]);

  useEffect(() => {
    try {
      sessionStorage.setItem(SELECTED_DATE_STORAGE_KEY, selectedDate.toISOString());
    } catch {
      // ignore
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // Re-fetch when the app regains focus so reassigned bookings stop showing.
  useRefetchOnFocus(() => {
    fetchBookings();
  });

  const fetchBookings = async () => {
    if (!isMountedRef.current) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        navigate("/pwa/login");
        return;
      }

      if (!isMountedRef.current) return;

      const { data: therapist } = await supabase
        .from("therapists")
        .select("id, rate_45, rate_60, rate_75, rate_90, rate_105, rate_120, rate_150")
        .eq("user_id", user.id)
        .single();

      if (!isMountedRef.current) return;

      if (therapist) {
        setTherapistRates({
          rate_45: therapist.rate_45,
          rate_60: therapist.rate_60,
          rate_75: therapist.rate_75,
          rate_90: therapist.rate_90,
          rate_105: therapist.rate_105,
          rate_120: therapist.rate_120,
          rate_150: therapist.rate_150,
        });
      }

      if (!therapist) {
        if (isMountedRef.current) {
          toast.error("Profil introuvable");
        }
        return;
      }

      // A user can be both a therapist and a concierge. When they manage a venue,
      // they may switch the planning to show every booking of that venue.
      const { data: conciergeRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "concierge")
        .maybeSingle();

      let conciergeHotels: string[] = [];
      if (conciergeRole) {
        const { data: concierge } = await supabase
          .from("concierges")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (concierge) {
          const { data: ch } = await supabase
            .from("concierge_hotels")
            .select("hotel_id")
            .eq("concierge_id", concierge.id);
          conciergeHotels = ch?.map((h) => h.hotel_id) ?? [];
        }
      }

      if (!isMountedRef.current) return;

      setIsConcierge(conciergeHotels.length > 0);
      setConciergeHotelIds(conciergeHotels);

      const venueScope = scope === "venue" && conciergeHotels.length > 0;

      const mineSelect =
        "*, treatment_rooms!bookings_trunk_id_fkey(name), booking_treatments(therapist_id, treatment_menus(name, price, duration))";

      let query = supabase
        .from("bookings")
        .select(
          venueScope
            ? "*, treatment_rooms!bookings_trunk_id_fkey(name), therapists(first_name, last_name), booking_treatments(therapist_id, treatment_menus(name, price, duration))"
            : mineSelect,
        );

      query = venueScope
        ? query.in("hotel_id", conciergeHotels)
        : query.eq("therapist_id", therapist.id).neq("status", "cancelled");

      const { data, error } = await query
        .order("booking_date", { ascending: false })
        .order("booking_time", { ascending: false });

      if (!isMountedRef.current) return;

      if (error) throw error;

      type BookingRow = Booking & {
        treatment_rooms?: { name: string | null } | null;
        therapists?: { first_name: string; last_name: string } | null;
        therapist_name?: string | null;
      };

      let rows = (data ?? []) as BookingRow[];

      // In "mine" scope, also include duo bookings where this therapist is a
      // secondary participant — linked via booking_therapists, not the primary
      // therapist_id column. Without this, a duo soin assigned as secondary
      // shows on the dashboard but not on the planning. Mirrors Dashboard.tsx.
      if (!venueScope) {
        const { data: btData } = await supabase
          .from("booking_therapists")
          .select("booking_id")
          .eq("therapist_id", therapist.id)
          .eq("status", "accepted");

        if (!isMountedRef.current) return;

        const primaryIds = new Set(rows.map((b) => b.id));
        const secondaryIds = (btData ?? [])
          .map((bt) => bt.booking_id)
          .filter((id) => !primaryIds.has(id));

        if (secondaryIds.length > 0) {
          const { data: secondaryData, error: secondaryError } = await supabase
            .from("bookings")
            .select(mineSelect)
            .in("id", secondaryIds)
            .neq("status", "cancelled");

          if (!isMountedRef.current) return;

          if (secondaryError) throw secondaryError;

          rows = [...rows, ...((secondaryData ?? []) as BookingRow[])].sort((a, b) => {
            if (a.booking_date !== b.booking_date) {
              return a.booking_date < b.booking_date ? 1 : -1;
            }
            return a.booking_time < b.booking_time ? 1 : -1;
          });
        }
      }

      // For duo bookings (guest_count > 1), resolve the names of every
      // accepted therapist via the SECURITY DEFINER RPC — the therapists RLS
      // only exposes the caller's own profile, so a direct select would miss
      // the co-therapist.
      const duoBookingIds = rows
        .filter((b) => (b.guest_count ?? 1) > 1)
        .map((b) => b.id);

      const duoNamesByBooking = new Map<string, string[]>();
      const duoNamesByTherapist = new Map<string, string>();
      if (duoBookingIds.length > 0) {
        const { data: duoNames } = await supabase.rpc(
          "get_booking_therapist_names",
          { _booking_ids: duoBookingIds },
        );

        if (!isMountedRef.current) return;

        for (const row of duoNames ?? []) {
          const name = shortTherapistName(row.first_name, row.last_name);
          const list = duoNamesByBooking.get(row.booking_id) ?? [];
          duoNamesByBooking.set(row.booking_id, [...list, name]);
          duoNamesByTherapist.set(row.therapist_id, name);
        }
      }

      const mapped: Booking[] = rows.map((b) => {
        const isDuo = (b.guest_count ?? 1) > 1;
        const duoNames = duoNamesByBooking.get(b.id) ?? [];

        return {
          ...b,
          room_name: b.treatment_rooms?.name ?? null,
          booking_treatments: isDuo
            ? b.booking_treatments?.map((bt) => ({
                ...bt,
                therapistShortName: bt.therapist_id
                  ? duoNamesByTherapist.get(bt.therapist_id) ?? null
                  : null,
              }))
            : b.booking_treatments,
          therapistName:
            duoNames.length > 0
              ? duoNames.join(" + ")
              : venueScope
                ? b.therapists
                  ? shortTherapistName(b.therapists.first_name, b.therapists.last_name)
                  : b.therapist_name ?? null
                : null,
        };
      });
      setBookings(mapped);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      if (isMountedRef.current) {
        toast.error("Erreur lors du chargement des réservations");
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // Cancelled bookings stay visible in the list (traceability) but never on the
  // Day / 3-day grids: in "venue" scope they aren't filtered server-side, so a
  // cancelled slot would overlay — and hide — the booking that replaced it.
  const scheduleBookings = bookings.filter((b) => b.status !== "cancelled");

  const dayViewBookings: DayViewBooking[] = scheduleBookings.map((b) => ({
    id: b.id,
    booking_id: b.booking_id,
    booking_date: b.booking_date,
    booking_time: b.booking_time,
    client_first_name: b.client_first_name,
    client_last_name: b.client_last_name,
    hotel_name: b.hotel_name,
    room_number: b.room_number,
    room_name: b.room_name,
    status: b.status,
    payment_status: b.payment_status,
    phone: b.phone,
    duration: b.duration,
    total_price: b.total_price,
    guest_count: b.guest_count,
    booking_treatments: b.booking_treatments,
    therapistName: b.therapistName,
  }));

  const venueMode = scope === "venue";

  // Legend mirrors the admin/concierge planning: reservation-flow stages
  // (status + payment) shown in lifecycle order, deduped to what's on screen.
  const legendSource = view === "list" ? bookings : scheduleBookings;
  const legendStages = calendarFlowStageOrder.filter((key) =>
    legendSource.some((b) => getCalendarFlowStage(b.status, b.payment_status).key === key),
  );

  if (loading) {
    return <PwaPageLoader title={t("bookings.title")} />;
  }

  return (
    <div className="app-refonte flex h-full min-h-0 flex-col">
      <header className="hdr" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
        <button className="back-btn" onClick={goBack} aria-label={t("common:back", "Retour")}>
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontSize: 18, fontWeight: 400 }}>{t("bookings.title")}</span>
        <div className="spacer" />
        <div className="seg">
          <button className={view === "day" ? "on" : ""} onClick={() => setView("day")}>
            {t("bookings.viewDay", "Jour")}
          </button>
          <button className={view === "calendar" ? "on" : ""} onClick={() => setView("calendar")}>
            {t("bookings.view3Days", "3 jours")}
          </button>
          <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>
            {t("bookings.viewList", "Liste")}
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col">
        {(isConcierge || legendStages.length > 0) && (
          <div className="px-4 pb-2 space-y-3">
            {isConcierge && (
              <div className="seg" style={{ width: "100%" }}>
                {(["mine", "venue"] as const).map((s) => (
                  <button
                    key={s}
                    className={scope === s ? "on" : ""}
                    style={{ flex: 1 }}
                    onClick={() => setScope(s)}
                  >
                    {s === "mine" ? t("bookings.scopeMine", "Mes RDV") : t("bookings.scopeVenue", "Tout le lieu")}
                  </button>
                ))}
              </div>
            )}
            {legendStages.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {legendStages.map((key) => {
                  const stage = calendarFlowStages[key];
                  return (
                    <span key={key} className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--ink-mute)" }}>
                      <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", stage.swatchClass)} />
                      {stage.label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {view === "day" ? (
          <div className="flex-1 min-h-0">
            <PwaDayView
              bookings={dayViewBookings}
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              onBookingClick={(booking) => navigate(`/pwa/booking/${booking.id}`)}
              onSlotClick={(date, time) => navigate(`/pwa/new-booking?date=${date}&time=${time}`)}
              therapistRates={venueMode ? null : therapistRates}
              hideEarnings={venueMode}
            />
          </div>
        ) : view === "calendar" ? (
          <div className="flex-1 min-h-0">
            <PwaCalendarView
              bookings={scheduleBookings}
              onBookingClick={(booking) => navigate(`/pwa/booking/${booking.id}`)}
              onSlotClick={(date, time) => navigate(`/pwa/new-booking?date=${date}&time=${time}`)}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-auto pt-2 pb-4">
            {bookings.length === 0 ? (
              <div className="placeholder">
                <p>{t("bookings.empty", "Aucune réservation trouvée")}</p>
              </div>
            ) : (
              bookings.map((booking) => (
                <button
                  key={booking.id}
                  className="bk-row"
                  style={{ borderLeft: `3px solid ${getBookingStatusConfig(booking.status).hexColor}` }}
                  onClick={() => navigate(`/pwa/booking/${booking.id}`)}
                >
                  <div className="bk-main">
                    <div className="who">
                      {booking.client_first_name} {booking.client_last_name}
                      {(booking.guest_count ?? 1) > 1 && (
                        <span className="status info"><span className="dot" />Duo</span>
                      )}
                    </div>
                    <div className="what">
                      {format(new Date(booking.booking_date), "PPP", { locale: fr })} · {booking.booking_time.substring(0, 5)}
                    </div>
                    <div className="meta">
                      {booking.hotel_name}
                      {booking.room_number ? ` · Ch. ${booking.room_number}` : ""}
                      {booking.room_name ? ` · ${booking.room_name}` : ""}
                      {booking.therapistName ? ` · ${booking.therapistName}` : ""}
                    </div>
                  </div>
                  <div className="bk-right">
                    <span className={cn("px-2 py-1 rounded text-[11px] font-medium", getBookingStatusConfig(booking.status).badgeClass)}>
                      {getBookingStatusConfig(booking.status).label}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PwaBookings;
