import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import PushNotificationPrompt from "@/components/PushNotificationPrompt";
import { Skeleton } from "@/components/ui/skeleton";
import { setOneSignalExternalUserId } from "@/hooks/useOneSignal";

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
  declined_by?: string[];
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
  const [showAllBookings, setShowAllBookings] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    checkAuth();
  }, []);

  // Single useEffect to handle initial load
  useEffect(() => {
    if (!hairdresser) return;

    // Check if we have cached bookings
    const cachedMyBookings = queryClient.getQueryData<any[]>(["myBookings", hairdresser.id]);
    const cachedPendingBookings = queryClient.getQueryData<any[]>(["pendingBookings", hairdresser.id]);

    if (cachedMyBookings && cachedPendingBookings) {
      console.log('📦 Using cached bookings data');
      const allData = [...cachedMyBookings, ...cachedPendingBookings];
      const sortedData = allData.sort((a, b) => {
        const dateCompare = a.booking_date.localeCompare(b.booking_date);
        if (dateCompare !== 0) return dateCompare;
        return a.booking_time.localeCompare(b.booking_time);
      });
      setAllBookings(sortedData);
      setLoading(false);
      return;
    }

    console.log('🔄 Fetching initial bookings...');
    fetchAllBookings(hairdresser.id);

    // Clear navigation state if needed
    if (location.state?.forceRefresh) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [hairdresser]);

  // Realtime listener for bookings
  useEffect(() => {
    if (!hairdresser) return;

    console.log('🎧 Setting up realtime listener...');
    
    const channel = supabase
      .channel('bookings-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings'
        },
        (payload) => {
          console.log('🔄 UPDATE received:', payload);
          const newData = payload.new as any;
          const oldData = payload.old as any;
          
          // Cas 1: Réservation assignée à un autre coiffeur - retirer immédiatement
          if (newData.hairdresser_id !== null && 
              newData.hairdresser_id !== hairdresser.id &&
              (newData.status === 'En attente' || newData.status === 'Pending' || newData.status === 'Confirmé' || newData.status === 'Assigné')) {
            console.log('⚡ Booking #' + newData.booking_id + ' taken by another hairdresser, removing');
            setAllBookings(prev => prev.filter(b => b.id !== newData.id));
            
            if (oldData.hairdresser_id === null) {
              toast.info(`Réservation #${newData.booking_id} prise par un autre coiffeur`);
            }
            return;
          }
          
          // Cas 2: Réservation non assignée mais statut change (refusée, annulée, etc.) - retirer
          if (newData.hairdresser_id === null && 
              newData.status !== 'En attente' && 
              newData.status !== 'Pending') {
            console.log('⚡ Booking #' + newData.booking_id + ' status changed to ' + newData.status + ', removing');
            setAllBookings(prev => prev.filter(b => b.id !== newData.id));
            return;
          }
          
          // Cas 3: Ma réservation confirmée - mettre à jour dans la liste
          if (newData.hairdresser_id === hairdresser.id) {
            console.log('✅ My booking #' + newData.booking_id + ' updated');
            setAllBookings(prev => {
              const index = prev.findIndex(b => b.id === newData.id);
              if (index !== -1) {
                const updated = [...prev];
                updated[index] = { ...updated[index], ...newData };
                return updated;
              }
              return prev;
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bookings'
        },
        (payload) => {
          console.log('➕ INSERT received:', payload);
          fetchAllBookings(hairdresser.id);
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime status:', status);
      });

    return () => {
      console.log('🔌 Cleanup realtime');
      supabase.removeChannel(channel);
    };
  }, [hairdresser]);


  const checkAuth = async () => {
    try {
      // Try to refresh the session first
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError) {
        console.log("⚠️ Session refresh failed:", refreshError.message);
      } else if (refreshedSession) {
        console.log("✅ Session refreshed successfully");
      }
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.log("❌ No user found, redirecting to login");
        navigate("/pwa/login");
        return;
      }

      console.log("✅ User authenticated:", user.email);

      // Set OneSignal external user ID for push notification targeting
      setOneSignalExternalUserId(user.id);

      // Use cached data if available
      const cachedData = queryClient.getQueryData<any>(["hairdresser", user.id]);
      
      if (cachedData) {
        console.log("📦 Using cached hairdresser data");
        setHairdresser(cachedData);
        setLoading(false);
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

      // Cache hairdresser data
      queryClient.setQueryData(["hairdresser", user.id], hairdresserData);
      setHairdresser(hairdresserData);
    } catch (error) {
      console.error("Auth error:", error);
      navigate("/pwa/login");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllBookings = async (hairdresserId: string) => {
    console.log('🔄 Fetching bookings for hairdresser:', hairdresserId);
    
    const { data: affiliatedHotels, error: hotelsError } = await supabase
      .from("hairdresser_hotels")
      .select("hotel_id")
      .eq("hairdresser_id", hairdresserId);

    if (hotelsError || !affiliatedHotels || affiliatedHotels.length === 0) {
      console.error("❌ Error fetching affiliated hotels:", hotelsError);
      setAllBookings([]);
      setLoading(false);
      return;
    }

    const hotelIds = affiliatedHotels.map(h => h.hotel_id);
    console.log('🏨 Hotel IDs:', hotelIds);

    // 1. Get bookings assigned to this hairdresser (any status)
    const { data: myBookings, error: myError } = await supabase
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
      .eq("hairdresser_id", hairdresserId)
      .in("hotel_id", hotelIds);

    if (myError) {
      console.error('❌ Error fetching my bookings:', myError);
    } else {
      // Cache my bookings
      queryClient.setQueryData(["myBookings", hairdresserId], myBookings);
    }

    console.log('👤 My bookings:', myBookings?.length || 0);

    // 2. Get ONLY pending bookings (not assigned to anyone)
    const { data: pendingBookings, error: pendingError } = await supabase
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
      .is("hairdresser_id", null)
      .in("status", ["En attente", "Pending"]);

    if (pendingError) {
      console.error('❌ Error fetching pending bookings:', pendingError);
    } else {
      // Cache pending bookings
      queryClient.setQueryData(["pendingBookings", hairdresserId], pendingBookings);
    }

    console.log('⏳ Pending bookings:', pendingBookings?.length || 0);

    // Only return if BOTH queries failed
    if (myError && pendingError) {
      console.error('❌ Both queries failed');
      setAllBookings([]);
      setLoading(false);
      return;
    }

    // Combine and sort both sets of bookings
    const allData = [...(myBookings || []), ...(pendingBookings || [])];
    const sortedData = allData.sort((a, b) => {
      const dateCompare = a.booking_date.localeCompare(b.booking_date);
      if (dateCompare !== 0) return dateCompare;
      return a.booking_time.localeCompare(b.booking_time);
    });

    console.log('✅ Total bookings loaded:', sortedData.length);
    setAllBookings(sortedData);
    setLoading(false);
  };

  const handleRefresh = async () => {
    if (!hairdresser || refreshing) return;
    setRefreshing(true);
    setShowAllBookings(false); // Reset to show only 3 on refresh
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
      
      // Si la réservation est assignée à ce coiffeur, elle doit être dans upcoming
      const isAssignedToMe = hairdresser && booking.hairdresser_id === hairdresser.id;
      
      console.log('Filtering booking:', {
        id: booking.booking_id,
        status: booking.status,
        date: booking.booking_date,
        bookingDate: bookingDate,
        today: today,
        isUpcoming: (booking.status === "Confirmé" || booking.status === "Assigné" || isAssignedToMe) && bookingDate >= today
      });
      
      if (activeTab === "upcoming") {
        return (booking.status === "Confirmé" || booking.status === "Assigné" || booking.status === "En attente de validation" || isAssignedToMe) && 
               bookingDate >= today;
      } else if (activeTab === "past") {
        return (bookingDate < today || booking.status === "Terminé" || booking.status === "Complété") && 
               booking.status !== "Annulé" &&
               booking.status !== "En attente" &&
               booking.status !== "Pending" &&
               booking.status !== "Confirmé" &&
               booking.status !== "Assigné" &&
               booking.status !== "En attente de validation";
      } else {
        return booking.status === "Annulé";
      }
    });
  };

  const handleAcceptBooking = async (bookingId: string) => {
    if (!hairdresser) return;

    try {
      const totalPrice = calculateTotalPrice(allBookings.find(b => b.id === bookingId)!);
      
      const { data, error } = await supabase.rpc('accept_booking', {
        _booking_id: bookingId,
        _hairdresser_id: hairdresser.id,
        _hairdresser_name: `${hairdresser.first_name} ${hairdresser.last_name}`,
        _total_price: totalPrice
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string } | null;
      
      if (result && !result.success) {
        toast.error("Réservation déjà prise par un autre coiffeur");
        fetchAllBookings(hairdresser.id);
        return;
      }

      toast.success("Réservation acceptée !");
      fetchAllBookings(hairdresser.id);
    } catch (error) {
      console.error("Error accepting booking:", error);
      toast.error("Erreur lors de l'acceptation");
    }
  };

  const handleDeclineBooking = async (bookingId: string) => {
    if (!hairdresser) return;

    try {
      const { data: currentBooking } = await supabase
        .from("bookings")
        .select("declined_by")
        .eq("id", bookingId)
        .single();

      const currentDeclined = currentBooking?.declined_by || [];
      const updatedDeclined = [...currentDeclined, hairdresser.id];

      const { error } = await supabase
        .from("bookings")
        .update({ declined_by: updatedDeclined })
        .eq("id", bookingId);

      if (error) throw error;

      toast.success("Réservation refusée");
      fetchAllBookings(hairdresser.id);
    } catch (error) {
      console.error("Error declining booking:", error);
      toast.error("Erreur");
    }
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
    const pending = allBookings.filter(b => {
      const isStatusPending = b.status === "En attente" || b.status === "Pending";
      const isUnassigned = b.hairdresser_id === null;
      
      // Exclure les réservations que ce coiffeur a déjà refusées
      const hasDeclined = hairdresser && b.declined_by?.includes(hairdresser.id);
      
      return isStatusPending && isUnassigned && !hasDeclined;
    });
    
    return pending;
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

  return (
    <div className="min-h-full bg-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <h1 className="text-4xl font-bold font-kormelink tracking-wider">OOM</h1>
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
        className="pb-4"
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
            {loading ? (
              <>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <Skeleton className="w-14 h-14 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="w-5 h-5 rounded" />
                  </div>
                ))}
              </>
            ) : filteredBookings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="text-6xl mb-4">
                  {activeTab === "upcoming" ? "📅" : activeTab === "past" ? "✅" : "🚫"}
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {activeTab === "upcoming" ? "Aucune réservation à venir" : 
                   activeTab === "past" ? "Aucune réservation passée" : 
                   "Aucune annulation"}
                </h3>
                <p className="text-sm text-gray-500">
                  {activeTab === "upcoming" ? "Les nouvelles réservations apparaîtront ici" : 
                   activeTab === "past" ? "Vos réservations terminées apparaîtront ici" : 
                   "Les réservations annulées apparaîtront ici"}
                </p>
              </div>
            ) : (
              <>
                {filteredBookings.slice(0, showAllBookings ? filteredBookings.length : 3).map((booking, index) => (
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
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-semibold text-[15px] text-black">{booking.hotel_name}</h3>
                        {booking.hairdresser_id && booking.status === "En attente" && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                            À confirmer
                          </Badge>
                        )}
                      </div>
                      <p className="text-[13px] text-gray-500">
                        {format(new Date(booking.booking_date), "EEE d MMM")}, {booking.booking_time.substring(0, 5)} • {calculateTotalDuration(booking)} min
                      </p>
                      <p className="text-[13px] text-gray-500">€{calculateTotalPrice(booking)}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
                  </div>
                ))}
              </>
            )}
            
            {filteredBookings.length > 3 && !showAllBookings && (
              <button 
                onClick={() => setShowAllBookings(true)}
                className="text-sm text-black font-medium w-full text-center py-3 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Show {filteredBookings.length - 3} More
              </button>
            )}
            
            {showAllBookings && filteredBookings.length > 3 && (
              <button 
                onClick={() => setShowAllBookings(false)}
                className="text-sm text-gray-500 font-medium w-full text-center py-3 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Show Less
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
          
          {loading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-14 h-14 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="w-5 h-5 rounded" />
                </div>
              ))}
            </div>
          ) : pendingRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="text-6xl mb-4">⏱️</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Aucune demande en attente
              </h3>
              <p className="text-sm text-gray-500">
                Les nouvelles demandes de réservation apparaîtront ici
              </p>
            </div>
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
                            <div className="flex items-center gap-2 mb-0.5">
                              <h3 className="font-semibold text-[15px] text-black">{booking.hotel_name}</h3>
                            </div>
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

      {/* Push Notification Prompt */}
      <PushNotificationPrompt />
    </div>
  );
};

export default PwaDashboard;
