import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Home, Wallet, Bell, ChevronRight, LogOut } from "lucide-react";
import { toast } from "sonner";
import { format, isPast, isFuture, parseISO } from "date-fns";
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
  total_price: number | null;
}

const PwaDashboard = () => {
  const [hairdresser, setHairdresser] = useState<Hairdresser | null>(null);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"upcoming" | "past" | "cancelled">("upcoming");
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
        await supabase.auth.signOut();
        navigate("/pwa/login");
        return;
      }

      setHairdresser(hairdresserData);
      fetchAllBookings(hairdresserData.id);
    } catch (error) {
      console.error("Auth error:", error);
      navigate("/pwa/login");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllBookings = async (hairdresserId: string) => {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("hairdresser_id", hairdresserId)
      .order("booking_date", { ascending: true })
      .order("booking_time", { ascending: true });

    if (!error && data) {
      setAllBookings(data);
    }
  };

  const getFilteredBookings = () => {
    const now = new Date();
    
    return allBookings.filter((booking) => {
      const bookingDateTime = parseISO(`${booking.booking_date}T${booking.booking_time}`);
      
      if (activeTab === "upcoming") {
        return isFuture(bookingDateTime) && 
               booking.status !== "Annulé" && 
               booking.status !== "En attente" &&
               (booking.status === "Confirmé" || booking.status === "En cours");
      } else if (activeTab === "past") {
        return isPast(bookingDateTime) && booking.status !== "Annulé";
      } else {
        return booking.status === "Annulé";
      }
    });
  };

  const getPendingRequests = () => {
    return allBookings.filter((booking) => booking.status === "En attente");
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate("/pwa/login");
      toast.success("Déconnexion réussie");
    } catch (error) {
      toast.error("Erreur lors de la déconnexion");
    }
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
  const filteredBookings = getFilteredBookings();
  const pendingRequests = getPendingRequests();

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-bold">OOM</h1>
            <Avatar className="h-14 w-14">
              <AvatarImage src={hairdresser.profile_image || undefined} />
              <AvatarFallback className="bg-blue-400 text-white font-bold text-lg">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>

        {/* My Bookings Section */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-4">MY BOOKINGS</h2>
          
          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <Button
              variant={activeTab === "upcoming" ? "default" : "outline"}
              onClick={() => setActiveTab("upcoming")}
              className="rounded-full"
            >
              Upcoming
            </Button>
            <Button
              variant={activeTab === "past" ? "default" : "outline"}
              onClick={() => setActiveTab("past")}
              className="rounded-full"
            >
              Past
            </Button>
            <Button
              variant={activeTab === "cancelled" ? "default" : "outline"}
              onClick={() => setActiveTab("cancelled")}
              className="rounded-full"
            >
              Cancelled
            </Button>
          </div>

          {/* Bookings List */}
          {filteredBookings.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground">
              No bookings found
            </div>
          ) : (
            <div className="space-y-3">
              {filteredBookings.map((booking) => (
                <Card
                  key={booking.id}
                  className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => navigate(`/pwa/bookings/${booking.id}`)}
                >
                  <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{booking.client_first_name} {booking.client_last_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {booking.booking_time.substring(0, 5)} • {booking.hotel_name}
                    </div>
                  </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Pending Requests Section */}
        {pendingRequests.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold mb-4">
              PENDING REQUESTS <span className="text-muted-foreground">{pendingRequests.length}</span>
            </h2>
            
            <div className="space-y-4">
              {pendingRequests.map((booking) => {
                const bookingDate = parseISO(booking.booking_date);
                return (
                  <div key={booking.id}>
                    <div className="text-sm text-muted-foreground mb-2">
                      {format(bookingDate, "d MMM", { locale: fr })} / {format(bookingDate, "EEEE", { locale: fr })}
                    </div>
                    <Card
                      className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() => navigate(`/pwa/bookings/${booking.id}`)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-muted rounded-lg flex-shrink-0" />
                        <div className="flex-1">
                          <div className="font-semibold mb-1">{booking.client_first_name} {booking.client_last_name}</div>
                          <div className="text-sm text-muted-foreground mb-1">
                            {booking.booking_time.substring(0, 5)} • 84 min
                          </div>
                          <div className="text-sm font-semibold">€{booking.total_price || 0}</div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border">
        <div className="flex items-center justify-around py-4">
          <button className="flex flex-col items-center gap-1">
            <Home className="h-6 w-6" />
            <span className="text-xs font-medium">Home</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-muted-foreground">
            <Wallet className="h-6 w-6" />
            <span className="text-xs">Wallet</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-muted-foreground">
            <Bell className="h-6 w-6" />
            <span className="text-xs">Notifications</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PwaDashboard;
