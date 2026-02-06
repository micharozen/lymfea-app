import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import PushNotificationPrompt from "@/components/PushNotificationPrompt";
import { Skeleton } from "@/components/ui/skeleton";
import { setOneSignalExternalUserId } from "@/hooks/useOneSignal";
import PwaHeader from "@/components/pwa/Header";
import { formatPrice } from "@/lib/formatPrice";

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
  hotel_id: string;
  room_number: string;
  status: string;
  total_price: number | null;
  hairdresser_id: string | null;
  declined_by?: string[];
  payment_status?: string | null;
  payment_method?: string | null;
  booking_treatments?: Array<{
    treatment_menus: {
      price: number;
      duration: number;
    } | null;
  }>;
  hotels?: { image: string | null; currency: string | null } | { image: string | null; currency: string | null }[] | null;
}

// Helper to get hotel image from booking (handles both object and array)
const getHotelImage = (booking: Booking): string | null => {
  if (!booking.hotels) return null;
  if (Array.isArray(booking.hotels)) {
    return booking.hotels[0]?.image || null;
  }
  return booking.hotels.image;
};

// Helper to get hotel currency from booking (handles both object and array)
const getHotelCurrency = (booking: Booking): string => {
  if (!booking.hotels) return 'EUR';
  if (Array.isArray(booking.hotels)) {
    return booking.hotels[0]?.currency || 'EUR';
  }
  return booking.hotels.currency || 'EUR';
};

const getPaymentStatusBadge = (paymentStatus?: string | null, paymentMethod?: string | null) => {
  if (!paymentStatus) return null;
  
  switch (paymentStatus) {
    case 'paid':
      return { label: 'Payé', className: 'bg-green-100 text-green-700' };
    case 'charged_to_room':
      return { label: 'Chambre', className: 'bg-blue-100 text-blue-700' };
    case 'pending':
      return { label: 'En attente', className: 'bg-yellow-100 text-yellow-700' };
    case 'failed':
      return { label: 'Échoué', className: 'bg-red-100 text-red-700' };
    default:
      return null;
  }
};

const PwaDashboard = () => {
  const { t } = useTranslation('pwa');
  const [hairdresser, setHairdresser] = useState<Hairdresser | null>(null);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"upcoming" | "history" | "cancelled">("upcoming");
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

  // Single useEffect to handle initial load - use cache first
  useEffect(() => {
    if (!hairdresser) return;

    // Check if we need to force refresh (e.g., after unassigning a booking)
    const shouldForceRefresh = location.state?.forceRefresh;
    
    if (shouldForceRefresh) {
      console.log('🔄 Force refresh requested, clearing cache...');
      queryClient.removeQueries({ queryKey: ["myBookings", hairdresser.id] });
      queryClient.removeQueries({ queryKey: ["pendingBookings", hairdresser.id] });
      // Clear navigation state
      navigate(location.pathname, { replace: true, state: {} });
      fetchAllBookings(hairdresser.id);
      return;
    }

    // Check for cached bookings first - show immediately if available
    const cachedMyBookings = queryClient.getQueryData<any[]>(["myBookings", hairdresser.id]);
    const cachedPendingBookings = queryClient.getQueryData<any[]>(["pendingBookings", hairdresser.id]);

    if (cachedMyBookings || cachedPendingBookings) {
      console.log('📦 Using cached bookings data');
      const allData = [...(cachedMyBookings || []), ...(cachedPendingBookings || [])];
      const sortedData = allData.sort((a, b) => {
        const dateCompare = a.booking_date.localeCompare(b.booking_date);
        if (dateCompare !== 0) return dateCompare;
        return a.booking_time.localeCompare(b.booking_time);
      });
      setAllBookings(sortedData);
      setLoading(false);
    }

    // Always fetch fresh data in background
    console.log('🔄 Fetching bookings in background...');
    fetchAllBookings(hairdresser.id);
  }, [hairdresser, location.state?.forceRefresh]);

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
              (newData.status === 'pending' || newData.status === 'confirmed' || newData.status === 'awaiting_hairdresser_selection')) {
            console.log('⚡ Booking #' + newData.booking_id + ' taken by another hairdresser, removing');
            setAllBookings(prev => prev.filter(b => b.id !== newData.id));
            
            if (oldData.hairdresser_id === null) {
              toast.info(`Réservation #${newData.booking_id} prise par un autre coiffeur`);
            }
            return;
          }
          
          // Cas 2: Réservation non assignée mais statut change (refusée, annulée, etc.) - retirer
          if (newData.hairdresser_id === null && newData.status !== 'pending' && newData.status !== 'awaiting_hairdresser_selection') {
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
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/pwa/login");
        return;
      }

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

  const fetchAllBookings = async (hairdresserId: string, forceRefresh = false) => {
    console.log('🔄 Fetching bookings for hairdresser:', hairdresserId, 'forceRefresh:', forceRefresh);
    
    // Clear cache when force refreshing
    if (forceRefresh) {
      queryClient.removeQueries({ queryKey: ["myBookings", hairdresserId] });
      queryClient.removeQueries({ queryKey: ["pendingBookings", hairdresserId] });
    }
    
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

    // Fetch hairdresser's trunk assignments
    const { data: hairdresserData } = await supabase
      .from("hairdressers")
      .select("trunks")
      .eq("id", hairdresserId)
      .single();
    
    // Parse trunk IDs from hairdresser's trunks field (comma-separated text or single value)
    const hairdresserTrunkIds: string[] = hairdresserData?.trunks 
      ? hairdresserData.trunks.split(',').map((t: string) => t.trim()).filter(Boolean)
      : [];
    console.log('🧳 Hairdresser trunk IDs:', hairdresserTrunkIds);

    // Fetch hotel images and currency separately (no FK relationship)
    const { data: hotelData } = await supabase
      .from("hotels")
      .select("id, image, currency")
      .in("id", hotelIds);

    const hotelDataMap = new Map(hotelData?.map(h => [h.id, { image: h.image, currency: h.currency }]) || []);

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

    // Add hotel images to bookings
    const myBookingsWithImages = myBookings?.map(b => ({
      ...b,
      hotels: hotelDataMap.get(b.hotel_id) || { image: null, currency: null }
    })) || [];

    if (myError) {
      console.error('❌ Error fetching my bookings:', myError);
    } else {
      // Cache my bookings
      queryClient.setQueryData(["myBookings", hairdresserId], myBookingsWithImages);
    }

    console.log('👤 My bookings:', myBookingsWithImages?.length || 0);

    // 2. Get ONLY pending bookings (not assigned to anyone)
    let pendingQuery = supabase
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
      .in("status", ["pending", "awaiting_hairdresser_selection"]);

    const { data: pendingBookings, error: pendingError } = await pendingQuery;

    // Filter pending bookings by hairdresser's trunk assignments
    // Only show bookings where trunk_id matches one of the hairdresser's trunks
    const filteredPendingBookings = pendingBookings?.filter(b => {
      // If hairdresser has no trunk assignments, show bookings from their hotels (legacy behavior)
      if (hairdresserTrunkIds.length === 0) return true;
      // If booking has no trunk, show it (legacy data)
      if (!b.trunk_id) return true;
      // Only show if booking's trunk matches hairdresser's trunk
      return hairdresserTrunkIds.includes(b.trunk_id);
    }) || [];

    console.log('🔍 Filtered pending bookings by trunk:', filteredPendingBookings.length, 'of', pendingBookings?.length || 0);

    // Add hotel images to pending bookings
    const pendingBookingsWithImages = filteredPendingBookings.map(b => ({
      ...b,
      hotels: hotelDataMap.get(b.hotel_id) || { image: null, currency: null }
    }));

    if (pendingError) {
      console.error('❌ Error fetching pending bookings:', pendingError);
    } else {
      // Cache pending bookings
      queryClient.setQueryData(["pendingBookings", hairdresserId], pendingBookingsWithImages);
    }

    console.log('⏳ Pending bookings:', pendingBookingsWithImages?.length || 0);

    // Only return if BOTH queries failed
    if (myError && pendingError) {
      console.error('❌ Both queries failed');
      setAllBookings([]);
      setLoading(false);
      return;
    }

    // Combine and sort both sets of bookings
    const allData = [...myBookingsWithImages, ...pendingBookingsWithImages];
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
      
      // Si la réservation est assignée à ce coiffeur
      const isAssignedToMe = hairdresser && booking.hairdresser_id === hairdresser.id;
      
      // Statuts actifs qui bloquent un créneau (doivent être visibles dans "upcoming")
      const activeStatuses = ["confirmed", "ongoing"];
      const isActiveStatus = activeStatuses.includes(booking.status);
      
      if (activeTab === "upcoming") {
        // Show all bookings assigned to me that are not completed or cancelled
        return isAssignedToMe && 
               booking.status !== "completed" && 
               booking.status !== "cancelled" &&
               bookingDate >= today;
      } else if (activeTab === "history") {
        return booking.status === "completed" && isAssignedToMe;
      } else {
        return booking.status === "cancelled" && isAssignedToMe;
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

      // Trigger email notifications to admins and concierges
      try {
        await invokeEdgeFunction('notify-booking-confirmed', {
          body: { bookingId }
        });
      } catch (notifError) {
        console.error("Email notification error (non-blocking):", notifError);
      }

      toast.success("Réservation acceptée !");
      fetchAllBookings(hairdresser.id, true); // Force refresh to get updated data
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
      fetchAllBookings(hairdresser.id, true); // Force refresh
    } catch (error) {
      console.error("Error declining booking:", error);
      toast.error("Erreur");
    }
  };

  const calculateTotalPrice = (booking: Booking) => {
    // Priority: Use booking.total_price if set (admin custom price for "on request" services)
    if (booking.total_price && booking.total_price > 0) {
      return booking.total_price;
    }
    // Fallback: Calculate from treatments
    if (!booking.booking_treatments || booking.booking_treatments.length === 0) {
      return 0;
    }
    return booking.booking_treatments.reduce((sum, bt) => sum + (bt.treatment_menus?.price || 0), 0);
  };

  const calculateTotalDuration = (booking: Booking) => {
    // Priority: Use booking.duration if set (admin custom duration for "on request" services)
    if ((booking as any).duration && (booking as any).duration > 0) {
      return (booking as any).duration;
    }
    // Fallback: Calculate from treatments
    if (!booking.booking_treatments || booking.booking_treatments.length === 0) {
      return 60; // default fallback
    }
    const duration = booking.booking_treatments.reduce((sum, bt) => sum + (bt.treatment_menus?.duration || 0), 0);
    return duration > 0 ? duration : 60; // fallback if all are 0
  };


  const getPendingRequests = () => {
    const pending = allBookings.filter(b => {
      const isStatusPending = b.status === "pending" || b.status === "awaiting_hairdresser_selection";
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
    <div className="flex flex-1 flex-col bg-white">
      <PwaHeader
        leftSlot={
          <span className="text-xl font-bold tracking-wider" style={{ fontFamily: "'Kormelink', serif" }}>OOM</span>
        }
        rightSlot={
          <Avatar
            className="h-7 w-7 ring-1 ring-border cursor-pointer"
            onClick={() => navigate("/pwa/profile")}
          >
            <AvatarImage src={hairdresser?.profile_image || undefined} />
            <AvatarFallback className="bg-muted text-foreground text-[10px] font-medium">
              {hairdresser?.first_name?.[0]}{hairdresser?.last_name?.[0]}
            </AvatarFallback>
          </Avatar>
        }
      />

      {/* Pull to refresh indicator */}
      {pullDistance > 0 && (
        <div 
          className="flex justify-center items-center py-1 transition-opacity flex-shrink-0"
          style={{ 
            opacity: Math.min(pullDistance / 60, 1),
            transform: `translateY(${Math.min(pullDistance - 20, 0)}px)`
          }}
        >
          <div className={`w-5 h-5 border-2 border-black border-t-transparent rounded-full ${refreshing ? 'animate-spin' : ''}`} />
        </div>
      )}

      {/* Content - no scroll, parent handles it */}
      <div 
        className="flex-1 min-h-0 pb-2"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* My Bookings Section */}
        <div className="px-4 pt-3">
          <h2 className="text-[10px] font-bold uppercase tracking-wider mb-2 text-black">{t('dashboard.myBookings')}</h2>
          
          {/* Tabs - Compact */}
          <div className="flex gap-4 mb-3 border-b border-gray-200">
            <button
              onClick={() => setActiveTab("upcoming")}
              className={`pb-2 text-xs font-medium transition-colors relative ${
                activeTab === "upcoming"
                  ? "text-black"
                  : "text-gray-400"
              }`}
            >
              {t('dashboard.upcoming')}
              {activeTab === "upcoming" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`pb-2 text-xs font-medium transition-colors relative ${
                activeTab === "history"
                  ? "text-black"
                  : "text-gray-400"
              }`}
            >
              {t('dashboard.history')}
              {activeTab === "history" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("cancelled")}
              className={`pb-2 text-xs font-medium transition-colors relative ${
                activeTab === "cancelled"
                  ? "text-black"
                  : "text-gray-400"
              }`}
            >
              {t('dashboard.cancelled')}
              {activeTab === "cancelled" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />
              )}
            </button>
          </div>

          {/* Bookings List - Compact */}
          <div className="space-y-1">
            {loading && allBookings.length === 0 ? (
              <>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5">
                    <Skeleton className="w-10 h-10 rounded-lg" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-2.5 w-40" />
                    </div>
                    <Skeleton className="w-4 h-4 rounded" />
                  </div>
                ))}
              </>
            ) : filteredBookings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
                <div className="text-3xl mb-2">
                  {activeTab === "upcoming" ? "📅" : activeTab === "history" ? "✅" : "🚫"}
                </div>
                <h3 className="text-sm font-medium text-gray-900 mb-1">
                  {activeTab === "upcoming" ? t('dashboard.noUpcoming') : 
                   activeTab === "history" ? t('dashboard.noHistory') : 
                   t('dashboard.noCancelled')}
                </h3>
                <p className="text-xs text-gray-500">
                  {activeTab === "upcoming" ? t('dashboard.upcomingWillAppear') : 
                   activeTab === "history" ? t('dashboard.historyWillAppear') : 
                   t('dashboard.cancelledWillAppear')}
                </p>
              </div>
            ) : (
              <>
                {filteredBookings.slice(0, showAllBookings ? filteredBookings.length : 3).map((booking, index) => (
                  <div
                    key={booking.id}
                    onClick={() => navigate(`/pwa/booking/${booking.id}`)}
                    className="flex items-center gap-2 cursor-pointer py-1.5"
                  >
                    <div className="w-10 h-10 bg-gray-200 rounded-lg flex-shrink-0 overflow-hidden">
                      {getHotelImage(booking) ? (
                        <img 
                          src={getHotelImage(booking)!} 
                          alt={booking.hotel_name} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center">
                          <span className="text-gray-500 text-xs font-bold">{booking.hotel_name?.[0]}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0">
                        <h3 className="font-semibold text-xs text-black truncate">{booking.hotel_name}</h3>
                        {booking.hairdresser_id && booking.status === "pending" && (
                          <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3">
                            {t('dashboard.toConfirm')}
                          </Badge>
                        )}
                        {(() => {
                          const paymentBadge = getPaymentStatusBadge(booking.payment_status, booking.payment_method);
                          return paymentBadge ? (
                            <Badge className={`text-[8px] px-1 py-0 h-3 ${paymentBadge.className}`}>
                              {paymentBadge.label}
                            </Badge>
                          ) : null;
                        })()}
                      </div>
                      <p className="text-[11px] text-gray-500">
                        {format(new Date(booking.booking_date), "EEE d MMM")}, {booking.booking_time.substring(0, 5)} • {calculateTotalDuration(booking)}min • {formatPrice(calculateTotalPrice(booking), getHotelCurrency(booking))}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </div>
                ))}
              </>
            )}
            
            {filteredBookings.length > 3 && !showAllBookings && (
              <button 
                onClick={() => setShowAllBookings(true)}
                className="text-xs text-black font-medium w-full text-center py-2 hover:bg-gray-50 rounded-lg transition-colors"
              >
                {t('dashboard.showMore', { count: filteredBookings.length - 3 })}
              </button>
            )}
            
            {showAllBookings && filteredBookings.length > 3 && (
              <button 
                onClick={() => setShowAllBookings(false)}
                className="text-xs text-gray-500 font-medium w-full text-center py-2 hover:bg-gray-50 rounded-lg transition-colors"
              >
                {t('dashboard.showLess')}
              </button>
            )}
          </div>
        </div>

        {/* Pending Requests Section - Compact */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-1.5 mb-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-black">{t('dashboard.pendingRequests')}</h2>
            <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center">
              <span className="text-[9px] font-semibold text-gray-600">{pendingRequests.length}</span>
            </div>
          </div>
          
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="w-10 h-10 rounded-lg" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-2.5 w-40" />
                  </div>
                  <Skeleton className="w-4 h-4 rounded" />
                </div>
              ))}
            </div>
          ) : pendingRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
              <div className="text-3xl mb-2">⏱️</div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">
                {t('dashboard.noPending')}
              </h3>
              <p className="text-xs text-gray-500">
                {t('dashboard.pendingWillAppear')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {groupedPendingRequests.map(([date, bookings]) => (
                <div key={date}>
                  <p className="text-[10px] text-gray-400 mb-1.5 font-medium uppercase tracking-wide">
                    {format(new Date(date), "d MMM")} • {format(new Date(date), "EEEE")}
                  </p>
                  <div className="space-y-1">
                    {bookings.map((booking, index) => (
                      <div key={booking.id}>
                        <div
                          onClick={() => navigate(`/pwa/booking/${booking.id}`)}
                          className="flex items-center gap-2 cursor-pointer py-1"
                        >
                          <div className="w-10 h-10 bg-gray-200 rounded-lg flex-shrink-0 overflow-hidden">
                            {getHotelImage(booking) ? (
                              <img 
                                src={getHotelImage(booking)!} 
                                alt={booking.hotel_name} 
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center">
                                <span className="text-gray-500 text-xs font-bold">{booking.hotel_name?.[0]}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-xs text-black truncate">{booking.hotel_name}</h3>
                            <p className="text-[11px] text-gray-500">
                              {booking.booking_time.substring(0, 5)} • {calculateTotalDuration(booking)}min • {formatPrice(calculateTotalPrice(booking), getHotelCurrency(booking))}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                        </div>
                        {index < bookings.length - 1 && (
                          <div className="h-px bg-gray-100 mt-1" />
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
