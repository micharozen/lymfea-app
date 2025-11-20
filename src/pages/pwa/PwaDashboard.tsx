import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Home, Wallet, Bell, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { format, isPast, isFuture, parseISO } from "date-fns";
import oomLogo from "@/assets/oom-monogram-black.svg";

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
      <div className="bg-black text-white px-6 py-3 flex items-center justify-between">
        <img src={oomLogo} alt="OOM" className="h-8 w-auto" />
        <Avatar className="h-9 w-9 ring-2 ring-white/20">
          <AvatarImage src={hairdresser?.profile_image || undefined} />
          <AvatarFallback className="bg-white text-black text-xs font-medium">
            {hairdresser?.first_name?.[0]}{hairdresser?.last_name?.[0]}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Content */}
      <div className="pb-20">
        {/* My Bookings Section */}
        <div className="px-6 pt-5">
          <h2 className="text-xs font-bold uppercase tracking-wider mb-3 text-black">MY BOOKINGS</h2>
          
          {/* Tabs */}
          <div className="flex gap-6 mb-5 border-b border-gray-200">
            <button
              onClick={() => setActiveTab("upcoming")}
              className={`pb-3 text-sm font-medium transition-colors relative ${
                activeTab === "upcoming"
                  ? "text-black"
                  : "text-gray-400"
              }`}
            >
              Upcoming
              {activeTab === "upcoming" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("past")}
              className={`pb-3 text-sm font-medium transition-colors relative ${
                activeTab === "past"
                  ? "text-black"
                  : "text-gray-400"
              }`}
            >
              Past
              {activeTab === "past" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("cancelled")}
              className={`pb-3 text-sm font-medium transition-colors relative ${
                activeTab === "cancelled"
                  ? "text-black"
                  : "text-gray-400"
              }`}
            >
              Cancelled
              {activeTab === "cancelled" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />
              )}
            </button>
          </div>

          {/* Bookings List */}
          <div className="space-y-3">
            {filteredBookings.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No bookings found</p>
            ) : (
              filteredBookings.slice(0, 3).map((booking, index) => (
                <div
                  key={booking.id}
                  onClick={() => navigate(`/pwa/booking/${booking.id}`)}
                  className="flex items-center gap-3 cursor-pointer py-2"
                >
                  <div className="w-14 h-14 bg-gradient-to-br from-pink-400 to-purple-500 rounded-lg flex-shrink-0 overflow-hidden relative">
                    {index === 0 && (
                      <div className="absolute inset-0 bg-gradient-to-br from-red-400 to-pink-500" />
                    )}
                    {index === 1 && (
                      <div className="absolute inset-0 bg-gradient-to-br from-purple-400 to-indigo-500" />
                    )}
                    {index === 2 && (
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-cyan-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[15px] mb-0.5 text-black">{booking.hotel_name}</h3>
                    <p className="text-[13px] text-gray-500">
                      {format(new Date(booking.booking_date), "EEE, d MMM")} • {booking.booking_time.substring(0, 5)} • 60 min
                    </p>
                    <p className="text-[13px] text-gray-500">{booking.total_price} €</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
                </div>
              ))
            )}
            
            {filteredBookings.length > 3 && (
              <button className="text-sm text-black font-medium w-full text-center py-3">
                Show 4 More
              </button>
            )}
          </div>
        </div>

        {/* Pending Requests Section - Always visible */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-black">PENDING REQUESTS</h2>
            <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
              <span className="text-[10px] font-semibold text-gray-600">{pendingRequests.length}</span>
            </div>
          </div>
          
          {pendingRequests.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No pending requests</p>
          ) : (
            <div className="space-y-4">
              {pendingRequests.map((booking, index) => (
                <div key={booking.id}>
                  <p className="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">
                    {format(new Date(booking.booking_date), "d MMM")} • {format(new Date(booking.booking_date), "EEEE")}
                  </p>
                  <div
                    onClick={() => navigate(`/pwa/booking/${booking.id}`)}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <div className="w-14 h-14 bg-gradient-to-br from-orange-400 to-red-500 rounded-lg flex-shrink-0 overflow-hidden" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-[15px] mb-0.5 text-black">{booking.hotel_name}</h3>
                      <p className="text-[13px] text-gray-500">
                        {booking.booking_time.substring(0, 5)} • 45 min
                      </p>
                      <p className="text-[13px] text-gray-500">{booking.total_price} €</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
                  </div>
                  {index < pendingRequests.length - 1 && (
                    <div className="h-px bg-gray-100 mt-4" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-pb">
        <div className="flex items-center justify-around h-16">
          <button className="flex flex-col items-center justify-center gap-1 flex-1">
            <Home className="w-6 h-6 text-black" strokeWidth={1.5} />
            <span className="text-[10px] font-medium text-black">Home</span>
          </button>
          <button className="flex flex-col items-center justify-center gap-1 flex-1">
            <Wallet className="w-6 h-6 text-gray-400" strokeWidth={1.5} />
            <span className="text-[10px] font-medium text-gray-400">Wallet</span>
          </button>
          <button className="flex flex-col items-center justify-center gap-1 flex-1">
            <Bell className="w-6 h-6 text-gray-400" strokeWidth={1.5} />
            <span className="text-[10px] font-medium text-gray-400">Notifications</span>
          </button>
        </div>
        <div className="h-1 w-32 bg-black rounded-full mx-auto mb-1" />
      </div>
    </div>
  );
};

export default PwaDashboard;
