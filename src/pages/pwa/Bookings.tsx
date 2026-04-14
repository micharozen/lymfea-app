import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Calendar, Clock, List, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PwaCalendarView from "@/components/pwa/PwaCalendarView";
import PwaDayView, { DayViewBooking } from "@/components/pwa/PwaDayView";
import PwaHeader from "@/components/pwa/Header";

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
  status: string;
  phone: string;
  duration?: number;
  total_price?: number | null;
  therapist_commission?: number | null;
  booking_treatments?: BookingTreatment[];
}

type BookingsView = "day" | "calendar" | "list";

const VIEW_STORAGE_KEY = "pwa-bookings-view";
const SELECTED_DATE_STORAGE_KEY = "pwa-calendar-date";

const PwaBookings = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
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
  }, []);

  useEffect(() => {
    if (statusFilter === "all") {
      setFilteredBookings(bookings);
    } else {
      setFilteredBookings(bookings.filter((b) => b.status === statusFilter));
    }
  }, [bookings, statusFilter]);

  const fetchBookings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        navigate("/pwa/login");
        return;
      }

      const { data: therapist } = await supabase
        .from("therapists")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!therapist) {
        toast.error("Profil introuvable");
        return;
      }

      const { data, error } = await supabase
        .from("bookings")
        .select("*, booking_treatments(treatment_menus(name, price, duration))")
        .eq("therapist_id", therapist.id)
        .order("booking_date", { ascending: false })
        .order("booking_time", { ascending: false });

      if (error) throw error;

      setBookings((data as Booking[]) || []);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      toast.error("Erreur lors du chargement des réservations");
    } finally {
      setLoading(false);
    }
  };

  const dayViewBookings: DayViewBooking[] = filteredBookings.map((b) => ({
    id: b.id,
    booking_id: b.booking_id,
    booking_date: b.booking_date,
    booking_time: b.booking_time,
    client_first_name: b.client_first_name,
    client_last_name: b.client_last_name,
    hotel_name: b.hotel_name,
    room_number: b.room_number,
    status: b.status,
    phone: b.phone,
    duration: b.duration,
    total_price: b.total_price,
    therapist_commission: b.therapist_commission,
    booking_treatments: b.booking_treatments,
  }));

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
        <div className="p-4 pb-2">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all">Toutes</TabsTrigger>
              <TabsTrigger value="pending">En attente</TabsTrigger>
              <TabsTrigger value="completed">Terminées</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {view === "day" ? (
          <div className="flex-1 min-h-0">
            <PwaDayView
              bookings={dayViewBookings}
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              onBookingClick={(booking) => navigate(`/pwa/booking/${booking.id}`)}
              onSlotClick={(date, time) => navigate(`/pwa/new-booking?date=${date}&time=${time}`)}
            />
          </div>
        ) : view === "calendar" ? (
          <div className="flex-1 min-h-0">
            <PwaCalendarView
              bookings={filteredBookings}
              onBookingClick={(booking) => navigate(`/pwa/booking/${booking.id}`)}
              onSlotClick={(date, time) => navigate(`/pwa/new-booking?date=${date}&time=${time}`)}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-auto px-4 pb-4 space-y-3">
            {filteredBookings.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                Aucune réservation trouvée
              </Card>
            ) : (
              filteredBookings.map((booking) => (
                <Card
                  key={booking.id}
                  className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
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
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        booking.status === "completed"
                          ? "bg-green-500/10 text-green-700"
                          : booking.status === "confirmed"
                          ? "bg-blue-500/10 text-blue-700"
                          : booking.status === "ongoing"
                          ? "bg-blue-600/10 text-blue-600 animate-pulse"
                          : booking.status === "noshow"
                          ? "bg-purple-700/10 text-purple-800"
                          : booking.status === "cancelled"
                          ? "bg-red-500/10 text-red-700"
                          : "bg-orange-500/10 text-orange-700"
                      }`}
                    >
                      {booking.status === "pending" ? "En attente" :
                       booking.status === "confirmed" ? "Confirmé" :
                       booking.status === "ongoing" ? "En cours" :
                       booking.status === "completed" ? "Terminé" :
                       booking.status === "cancelled" ? "Annulé" :
                       booking.status === "noshow" ? "No-show" : booking.status}
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
