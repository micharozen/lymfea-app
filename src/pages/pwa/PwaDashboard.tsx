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
  hairdresser_id: string | null;
  booking_treatments?: Array<{
    treatment_menus: {
      price: number;
      duration: number;
    } | null;
  }>;
}

const PwaDashboard = () => {
  const [hairdresser, setHairdresser] = useState<Hairdresser | null>(null);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"upcoming" | "past" | "cancelled">("upcoming");
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [startY, setStartY] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  // Realtime listener for bookings
  useEffect(() => {
    if (!hairdresser) return;

    const channel = supabase
      .channel('bookings-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings'
        },
        (payload) => {
          console.log('Booking change detected:', payload);
          // Refresh bookings on any change
          fetchAllBookings(hairdresser.id);
          
          // Show toast for specific events
          if (payload.eventType === 'UPDATE') {
            const newStatus = (payload.new as any).status;
            const oldStatus = (payload.old as any)?.status;
            
            if (oldStatus !== 'Annulé' && newStatus === 'Annulé') {
              toast.error('Une réservation a été annulée');
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hairdresser]);

  // Realtime listener for notifications
  useEffect(() => {
    if (!hairdresser) return;

    const setupNotificationListener = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Initial fetch of unread count
      const { data: unreadData } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);

      if (unreadData !== null) {
        setUnreadNotifications(unreadData.length);
      }
      
      const notifChannel = supabase
        .channel('notifications-changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications'
          },
          (payload) => {
            console.log('New notification:', payload);
            const notification = payload.new as any;
            
            if (notification.user_id === user.id) {
              toast.info(notification.message);
              setUnreadNotifications(prev => prev + 1);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications'
          },
          async () => {
            // Refetch unread count when notifications are updated
            const { count } = await supabase
              .from("notifications")
              .select("*", { count: "exact", head: true })
              .eq("user_id", user.id)
              .eq("read", false);

            setUnreadNotifications(count || 0);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(notifChannel);
      };
    };

    setupNotificationListener();
  }, [hairdresser]);

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

    // Fetch bookings: either assigned to this hairdresser OR pending (unassigned) from their hotels
    const { data, error } = await supabase
      .from("bookings")
      .select(`
        *,
        booking_treatments (
          treatment_menus (
            price,
            duration
          )
        )
      `)
      .in("hotel_id", hotelIds)
      .or(`hairdresser_id.eq.${hairdresserId},hairdresser_id.is.null`)
      .order("booking_date", { ascending: true })
      .order("booking_time", { ascending: true });

    if (!error && data) {
      setAllBookings(data);
    }
  };

  const handleRefresh = async () => {
    if (!hairdresser || refreshing) return;
    setRefreshing(true);
    await fetchAllBookings(hairdresser.id);
    setRefreshing(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const scrollTop = (e.currentTarget as HTMLElement).scrollTop;
    if (scrollTop === 0 && !refreshing) {
      const currentY = e.touches[0].clientY;
      const distance = Math.min(Math.max(currentY - startY, 0), 80);
      setPullDistance(distance);
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance > 60) {
      await handleRefresh();
    }
    setPullDistance(0);
  };

  const getFilteredBookings = () => {
    return allBookings.filter((booking) => {
      const bookingDate = parseISO(booking.booking_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (activeTab === "upcoming") {
        return (booking.status === "Confirmé" || booking.status === "Assigné") && 
               bookingDate >= today;
      } else if (activeTab === "past") {
        return (bookingDate < today || booking.status === "Terminé") && 
               booking.status !== "Annulé" &&
               booking.status !== "En attente" &&
               booking.status !== "Pending" &&
               booking.status !== "Confirmé" &&
               booking.status !== "Assigné";
      } else {
        return booking.status === "Annulé";
      }
    });
  };

  const calculateTotalPrice = (booking: Booking) => {
    if (!booking.booking_treatments || booking.booking_treatments.length === 0) {
      return booking.total_price || 0;
    }
    return booking.booking_treatments.reduce((sum, bt) => sum + (bt.treatment_menus?.price || 0), 0);
  };

  const calculateTotalDuration = (booking: Booking) => {
    if (!booking.booking_treatments || booking.booking_treatments.length === 0) {
      return 60; // default
    }
    return booking.booking_treatments.reduce((sum, bt) => sum + (bt.treatment_menus?.duration || 0), 0);
  };


  const getPendingRequests = () => {
    return allBookings.filter(b => 
      (b.status === "En attente" || b.status === "Pending" || b.status === "Assigned") && 
      !b.hairdresser_id
    );
  };

  const groupBookingsByDate = (bookings: Booking[]) => {
    const groups: { [key: string]: Booking[] } = {};
    
    bookings.forEach(booking => {
      const dateKey = booking.booking_date;
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(booking);
    });
    
    return Object.entries(groups).sort(([dateA], [dateB]) => 
      new Date(dateA).getTime() - new Date(dateB).getTime()
    );
  };

  const filteredBookings = getFilteredBookings();
  const pendingRequests = getPendingRequests();
  const groupedPendingRequests = groupBookingsByDate(pendingRequests);

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
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <img src={oomLogo} alt="OOM" className="h-8 w-auto" />
        <Avatar 
          className="h-9 w-9 ring-2 ring-gray-200 cursor-pointer"
          onClick={() => navigate("/pwa/profile")}
        >
          <AvatarImage src={hairdresser?.profile_image || undefined} />
          <AvatarFallback className="bg-gray-100 text-black text-xs font-medium">
            {hairdresser?.first_name?.[0]}{hairdresser?.last_name?.[0]}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Pull to refresh indicator */}
      {pullDistance > 0 && (
        <div 
          className="flex justify-center items-center py-2 transition-opacity"
          style={{ 
            opacity: Math.min(pullDistance / 60, 1),
            transform: `translateY(${Math.min(pullDistance - 20, 0)}px)`
          }}
        >
          <div className={`w-6 h-6 border-2 border-black border-t-transparent rounded-full ${refreshing ? 'animate-spin' : ''}`} />
        </div>
      )}

      {/* Content */}
      <div 
        className="pb-20 overflow-y-auto"
        style={{ maxHeight: 'calc(100vh - 80px)' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
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
                      {format(new Date(booking.booking_date), "EEE d MMM")}, {booking.booking_time.substring(0, 5)} • {calculateTotalDuration(booking)} min
                    </p>
                    <p className="text-[13px] text-gray-500">€{calculateTotalPrice(booking)}</p>
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
            <div className="space-y-6">
              {groupedPendingRequests.map(([date, bookings]) => (
                <div key={date}>
                  <p className="text-[11px] text-gray-400 mb-3 font-medium uppercase tracking-wide">
                    {format(new Date(date), "d MMM")} • {format(new Date(date), "EEEE")}
                  </p>
                  <div className="space-y-4">
                    {bookings.map((booking, index) => (
                      <div key={booking.id}>
                        <div
                          onClick={() => navigate(`/pwa/booking/${booking.id}`)}
                          className="flex items-center gap-3 cursor-pointer"
                        >
                          <div className="w-14 h-14 bg-gradient-to-br from-orange-400 to-red-500 rounded-lg flex-shrink-0 overflow-hidden" />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-[15px] mb-0.5 text-black">{booking.hotel_name}</h3>
                            <p className="text-[13px] text-gray-500">
                              {booking.booking_time.substring(0, 5)} • {calculateTotalDuration(booking)} min
                            </p>
                            <p className="text-[13px] text-gray-500">€{calculateTotalPrice(booking)}</p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
                        </div>
                        {index < bookings.length - 1 && (
                          <div className="h-px bg-gray-100 mt-4" />
                        )}
                      </div>
                    ))}
                  </div>
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
          <button 
            onClick={() => navigate("/pwa/notifications")}
            className="flex flex-col items-center justify-center gap-1 flex-1 relative"
          >
            <div className="relative">
              <Bell className="w-6 h-6 text-gray-400" strokeWidth={1.5} />
              {unreadNotifications > 0 && (
                <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </div>
              )}
            </div>
            <span className="text-[10px] font-medium text-gray-400">Notifications</span>
          </button>
        </div>
        <div className="h-1 w-32 bg-black rounded-full mx-auto mb-1" />
      </div>
    </div>
  );
};

export default PwaDashboard;
