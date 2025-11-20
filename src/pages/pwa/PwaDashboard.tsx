import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Home, Wallet, Bell, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { format, isPast, isFuture, parseISO } from "date-fns";

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
    const { data: affiliatedHotels, error: hotelsError } = await supabase
      .from("hairdresser_hotels")
      .select("hotel_id")
      .eq("hairdresser_id", hairdresserId);

    if (hotelsError || !affiliatedHotels || affiliatedHotels.length === 0) {
      console.error("Error fetching affiliated hotels:", hotelsError);
      setAllBookings([]);
      return;
    }

    const hotelIds = affiliatedHotels.map(h => h.hotel_id);

    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("hairdresser_id", hairdresserId)
      .in("hotel_id", hotelIds)
      .order("booking_date", { ascending: true })
      .order("booking_time", { ascending: true });

    if (!error && data) {
      setAllBookings(data);
    }
  };

  const getFilteredBookings = () => {
    return allBookings.filter((booking) => {
      const bookingDateTime = parseISO(`${booking.booking_date}T${booking.booking_time}`);
      
      if (activeTab === "upcoming") {
        return (booking.status === "Confirmé" || booking.status === "En cours") && 
               isFuture(bookingDateTime);
      } else if (activeTab === "past") {
        return (isPast(bookingDateTime) || booking.status === "Terminé") && 
               booking.status !== "Annulé" &&
               booking.status !== "En attente";
      } else {
        return booking.status === "Annulé";
      }
    });
  };

  const getPendingRequests = () => {
    return allBookings.filter(b => b.status === "En attente");
  };

  const filteredBookings = getFilteredBookings();
  const pendingRequests = getPendingRequests();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-black text-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-wide">BEAUTICK</h1>
        <Avatar className="h-8 w-8">
          <AvatarImage src={hairdresser?.profile_image || undefined} />
          <AvatarFallback className="bg-white text-black text-xs">
            {hairdresser?.first_name?.[0]}{hairdresser?.last_name?.[0]}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Content */}
      <div className="pb-20">
        {/* My Bookings Section */}
        <div className="px-6 pt-6">
          <h2 className="text-xs font-bold uppercase tracking-wide mb-4">MY BOOKINGS</h2>
          
          {/* Tabs */}
          <div className="flex gap-4 mb-6 border-b border-gray-200">
            <button
              onClick={() => setActiveTab("upcoming")}
              className={`pb-2 text-sm font-medium transition-colors ${
                activeTab === "upcoming"
                  ? "text-black border-b-2 border-black"
                  : "text-gray-400"
              }`}
            >
              Upcoming
            </button>
            <button
              onClick={() => setActiveTab("past")}
              className={`pb-2 text-sm font-medium transition-colors ${
                activeTab === "past"
                  ? "text-black border-b-2 border-black"
                  : "text-gray-400"
              }`}
            >
              Past
            </button>
            <button
              onClick={() => setActiveTab("cancelled")}
              className={`pb-2 text-sm font-medium transition-colors ${
                activeTab === "cancelled"
                  ? "text-black border-b-2 border-black"
                  : "text-gray-400"
              }`}
            >
              Cancelled
            </button>
          </div>

          {/* Bookings List */}
          <div className="space-y-4">
            {filteredBookings.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No bookings found</p>
            ) : (
              filteredBookings.slice(0, 3).map((booking) => (
                <div
                  key={booking.id}
                  onClick={() => navigate(`/pwa/booking/${booking.id}`)}
                  className="flex items-start gap-3 cursor-pointer"
                >
                  <div className="w-16 h-16 bg-gray-100 rounded flex-shrink-0 overflow-hidden">
                    <div className="w-full h-full bg-gray-200" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm mb-0.5">{booking.hotel_name}</h3>
                    <p className="text-xs text-gray-500">
                      {format(new Date(booking.booking_date), "EEE, d MMM")} • {booking.booking_time.substring(0, 5)} min
                    </p>
                    <p className="text-xs text-gray-500">{booking.total_price} €</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
                </div>
              ))
            )}
            
            {filteredBookings.length > 3 && (
              <button className="text-sm text-black font-medium w-full text-center py-2">
                Show 4 More
              </button>
            )}
          </div>
        </div>

        {/* Pending Requests Section */}
        {pendingRequests.length > 0 && (
          <div className="px-6 pt-8">
            <h2 className="text-xs font-bold uppercase tracking-wide mb-4">PENDING REQUESTS</h2>
            <div className="space-y-3">
              {pendingRequests.map((booking) => (
                <div key={booking.id} className="border-b border-gray-100 pb-3 last:border-0">
                  <p className="text-xs text-gray-400 mb-2">
                    {format(new Date(booking.booking_date), "d MMM")} • {format(new Date(), "EEEE")}
                  </p>
                  <div
                    onClick={() => navigate(`/pwa/booking/${booking.id}`)}
                    className="flex items-start gap-3 cursor-pointer"
                  >
                    <div className="w-16 h-16 bg-gray-100 rounded flex-shrink-0 overflow-hidden">
                      <div className="w-full h-full bg-gray-200" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm mb-0.5">{booking.hotel_name}</h3>
                      <p className="text-xs text-gray-500">
                        {booking.booking_time.substring(0, 5)} • {booking.booking_time.substring(0, 5)} min
                      </p>
                      <p className="text-xs text-gray-500">{booking.total_price} €</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
        <div className="flex items-center justify-around py-3">
          <button className="flex flex-col items-center gap-1">
            <Home className="w-6 h-6 text-black" />
          </button>
          <button className="flex flex-col items-center gap-1">
            <Wallet className="w-6 h-6 text-gray-400" />
          </button>
          <button className="flex flex-col items-center gap-1">
            <Bell className="w-6 h-6 text-gray-400" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PwaDashboard;
