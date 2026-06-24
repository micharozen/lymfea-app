import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Calendar, Clock, List, CalendarClock, DoorOpen, User } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { getBookingStatusConfig } from "@/utils/statusStyles";
import PwaCalendarView from "@/components/pwa/PwaCalendarView";
import PwaDayView, { DayViewBooking } from "@/components/pwa/PwaDayView";
import type { TherapistRates } from "@/lib/therapistEarnings";
import PwaHeader from "@/components/pwa/Header";
import { useIsMounted } from "@/hooks/useIsMounted";

interface BookingTreatment {
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
  phone: string;
  duration?: number;
  total_price?: number | null;
  booking_treatments?: BookingTreatment[];
  therapistName?: string | null;
}

type BookingsView = "day" | "calendar" | "list";
type BookingsScope = "mine" | "venue";

const VIEW_STORAGE_KEY = "pwa-bookings-view";
const SELECTED_DATE_STORAGE_KEY = "pwa-calendar-date";

const PwaBookings = () => {
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
        .select("id, rate_60, rate_75, rate_90")
        .eq("user_id", user.id)
        .single();

      if (!isMountedRef.current) return;

      if (therapist) {
        setTherapistRates({
          rate_60: therapist.rate_60,
          rate_75: therapist.rate_75,
          rate_90: therapist.rate_90,
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

      let query = supabase
        .from("bookings")
        .select(
          venueScope
            ? "*, treatment_rooms(name), therapists(first_name, last_name), booking_treatments(treatment_menus(name, price, duration))"
            : "*, treatment_rooms(name), booking_treatments(treatment_menus(name, price, duration))",
        );

      query = venueScope
        ? query.in("hotel_id", conciergeHotels)
        : query.eq("therapist_id", therapist.id).neq("status", "cancelled");

      const { data, error } = await query
        .order("booking_date", { ascending: false })
        .order("booking_time", { ascending: false });

      if (!isMountedRef.current) return;

      if (error) throw error;

      const rows = (data ?? []) as Array<
        Booking & {
          treatment_rooms?: { name: string | null } | null;
          therapists?: { first_name: string; last_name: string } | null;
          therapist_name?: string | null;
        }
      >;
      const mapped: Booking[] = rows.map((b) => ({
        ...b,
        room_name: b.treatment_rooms?.name ?? null,
        therapistName: venueScope
          ? b.therapists
            ? `${b.therapists.first_name} ${b.therapists.last_name}`.trim()
            : b.therapist_name ?? null
          : null,
      }));
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

  const dayViewBookings: DayViewBooking[] = bookings.map((b) => ({
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
    phone: b.phone,
    duration: b.duration,
    total_price: b.total_price,
    booking_treatments: b.booking_treatments,
    therapistName: b.therapistName,
  }));

  const venueMode = scope === "venue";

  const legendStatuses = Array.from(new Set(bookings.map((b) => b.status)));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-background">
      <PwaHeader
        title="Agenda"
        showBack
        onBack={() => {
          if (window.history.length > 1) {
            navigate(-1);
          } else {
            navigate("/pwa/dashboard");
          }
        }}
        rightSlot={
          <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setView("day")}
              className={`p-1.5 rounded-md transition-colors ${view === "day" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              aria-label="Day view"
            >
              <CalendarClock className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`p-1.5 rounded-md transition-colors ${view === "calendar" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              aria-label="3-day view"
            >
              <Calendar className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-1.5 rounded-md transition-colors ${view === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        }
      />

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="p-4 pb-2 space-y-3">
          {isConcierge && (
            <div className="inline-flex w-full rounded-full bg-muted p-1">
              {(["mine", "venue"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={cn(
                    "flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors",
                    scope === s
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s === "mine" ? "Mes RDV" : "Tout le lieu"}
                </button>
              ))}
            </div>
          )}
          {legendStatuses.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {legendStatuses.map((s) => {
                const cfg = getBookingStatusConfig(s);
                return (
                  <span key={s} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: cfg.hexColor }}
                    />
                    {cfg.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>

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
              bookings={bookings}
              onBookingClick={(booking) => navigate(`/pwa/booking/${booking.id}`)}
              onSlotClick={(date, time) => navigate(`/pwa/new-booking?date=${date}&time=${time}`)}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-auto px-4 pb-4 space-y-3">
            {bookings.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                Aucune réservation trouvée
              </Card>
            ) : (
              bookings.map((booking) => (
                <Card
                  key={booking.id}
                  className="p-4 cursor-pointer hover:bg-muted/50 transition-colors border-l-4"
                  style={{ borderLeftColor: getBookingStatusConfig(booking.status).hexColor }}
                  onClick={() => navigate(`/pwa/booking/${booking.id}`)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-semibold text-lg">
                        {booking.client_first_name} {booking.client_last_name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Réservation #{booking.booking_id}
                      </div>
                    </div>
                    <span className={cn("px-2 py-1 rounded text-xs font-medium", getBookingStatusConfig(booking.status).badgeClass)}>
                      {getBookingStatusConfig(booking.status).label}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {format(new Date(booking.booking_date), "PPP", { locale: fr })}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {booking.booking_time}
                    </div>
                    <div className="text-muted-foreground">
                      {booking.hotel_name}
                      {booking.room_number && ` - Chambre ${booking.room_number}`}
                    </div>
                    {booking.room_name && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <DoorOpen className="h-4 w-4" />
                        {booking.room_name}
                      </div>
                    )}
                    {booking.therapistName && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <User className="h-4 w-4" />
                        {booking.therapistName}
                      </div>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PwaBookings;
