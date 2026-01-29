import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, Clock, List } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PwaCalendarView from "@/components/pwa/PwaCalendarView";

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
}

const PwaBookings = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [view, setView] = useState<"list" | "calendar">("list");
  const navigate = useNavigate();

  useEffect(() => {
    fetchBookings();
  }, []);

  useEffect(() => {
    filterBookings();
  }, [bookings, statusFilter]);

  const fetchBookings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/pwa/login");
        return;
      }

      // Get hairdresser ID
      const { data: hairdresser } = await supabase
        .from("hairdressers")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!hairdresser) {
        toast.error("Profil introuvable");
        return;
      }

      // Fetch bookings
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("hairdresser_id", hairdresser.id)
        .order("booking_date", { ascending: false })
        .order("booking_time", { ascending: false });

      if (error) throw error;
      
      setBookings(data || []);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      toast.error("Erreur lors du chargement des réservations");
    } finally {
      setLoading(false);
    }
  };

  const filterBookings = () => {
    if (statusFilter === "all") {
      setFilteredBookings(bookings);
    } else {
      setFilteredBookings(bookings.filter(b => b.status === statusFilter));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-background">
      {/* Header */}
      <div className="bg-black text-white p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/pwa/dashboard")}
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold">Mes Réservations</h1>
          </div>
          <div className="flex gap-1 bg-white/10 rounded-lg p-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setView("list")}
              className={`h-8 w-8 ${view === "list" ? "bg-white text-black" : "text-white hover:bg-white/20"}`}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setView("calendar")}
              className={`h-8 w-8 ${view === "calendar" ? "bg-white text-black" : "text-white hover:bg-white/20"}`}
            >
              <Calendar className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Filters */}
        <div className="p-4 pb-2">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all">Toutes</TabsTrigger>
              <TabsTrigger value="pending">En attente</TabsTrigger>
              <TabsTrigger value="completed">Terminées</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* View Content */}
        {view === "list" ? (
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
        ) : (
          <div className="flex-1 min-h-0">
            <PwaCalendarView
              bookings={filteredBookings}
              onBookingClick={(booking) => navigate(`/pwa/booking/${booking.id}`)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default PwaBookings;
