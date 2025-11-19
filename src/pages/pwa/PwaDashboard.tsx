import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, LogOut, User } from "lucide-react";
import { toast } from "sonner";
import { format, startOfDay, endOfDay } from "date-fns";
import { fr } from "date-fns/locale";

interface Hairdresser {
  id: string;
  first_name: string;
  last_name: string;
  profile_image: string | null;
  email: string;
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
}

const PwaDashboard = () => {
  const [hairdresser, setHairdresser] = useState<Hairdresser | null>(null);
  const [todayBookings, setTodayBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/pwa/login");
        return;
      }

      // Get hairdresser profile
      const { data: hairdresserData, error } = await supabase
        .from("hairdressers")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error || !hairdresserData) {
        toast.error("Profil introuvable");
        handleLogout();
        return;
      }

      setHairdresser(hairdresserData);
      fetchTodayBookings(hairdresserData.id);
    } catch (error) {
      console.error("Auth error:", error);
      navigate("/pwa/login");
    } finally {
      setLoading(false);
    }
  };

  const fetchTodayBookings = async (hairdresserId: string) => {
    const today = new Date();
    const startDate = startOfDay(today).toISOString();
    const endDate = endOfDay(today).toISOString();

    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("hairdresser_id", hairdresserId)
      .gte("booking_date", startDate)
      .lte("booking_date", endDate)
      .order("booking_time", { ascending: true });

    if (!error && data) {
      setTodayBookings(data);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/pwa/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Chargement...</div>
      </div>
    );
  }

  if (!hairdresser) {
    return null;
  }

  const initials = `${hairdresser.first_name[0]}${hairdresser.last_name[0]}`.toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      {/* Header with black background */}
      <div className="bg-black text-white p-6 pb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Avatar className="h-14 w-14 border-2 border-white">
              <AvatarImage src={hairdresser.profile_image || undefined} />
              <AvatarFallback className="bg-white text-black font-bold text-lg">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-lg font-bold">
                {hairdresser.first_name} {hairdresser.last_name}
              </h1>
              <p className="text-sm text-white/70">Coiffeur</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="text-white hover:bg-white/10"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-white/10 backdrop-blur border-white/20 p-4 text-white">
            <div className="text-3xl font-bold mb-1">{todayBookings.length}</div>
            <div className="text-xs text-white/80">Réservations aujourd'hui</div>
          </Card>
          <Card className="bg-white/10 backdrop-blur border-white/20 p-4 text-white">
            <div className="text-3xl font-bold mb-1">
              {todayBookings.filter(b => b.status === "Terminé").length}
            </div>
            <div className="text-xs text-white/80">Terminées</div>
          </Card>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 space-y-4 -mt-4">
        {/* Today's Bookings Section */}
        <div className="bg-card rounded-lg shadow-sm p-4">
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Réservations du jour
          </h2>
          
          {todayBookings.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Aucune réservation aujourd'hui
            </div>
          ) : (
            <div className="space-y-2">
              {todayBookings.map((booking) => (
                <Card
                  key={booking.id}
                  className="p-3 cursor-pointer hover:bg-accent/50 transition-colors border"
                  onClick={() => navigate(`/pwa/bookings/${booking.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm mb-1">
                        {booking.client_first_name} {booking.client_last_name}
                      </div>
                      <div className="text-xs text-muted-foreground mb-1">
                        {booking.hotel_name}
                        {booking.room_number && ` • Ch. ${booking.room_number}`}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {booking.booking_time}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                          booking.status === "Terminé"
                            ? "bg-green-500/10 text-green-700 dark:text-green-400"
                            : booking.status === "En cours"
                            ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                            : "bg-orange-500/10 text-orange-700 dark:text-orange-400"
                        }`}
                      >
                        {booking.status}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="h-20 flex-col gap-2 bg-card"
            onClick={() => navigate("/pwa/bookings")}
          >
            <Calendar className="h-5 w-5" />
            <span className="text-sm">Planning</span>
          </Button>
          <Button
            variant="outline"
            className="h-20 flex-col gap-2 bg-card"
            onClick={() => navigate("/pwa/profile")}
          >
            <User className="h-5 w-5" />
            <span className="text-sm">Profil</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PwaDashboard;
