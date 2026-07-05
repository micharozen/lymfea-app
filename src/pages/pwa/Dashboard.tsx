import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Check, CheckCircle2, ChevronRight, Clock, Euro, Loader2, RefreshCw, X, Users, DoorOpen } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import PushNotificationPrompt from "@/components/PushNotificationPrompt";
import { Skeleton } from "@/components/ui/skeleton";
import { setOneSignalExternalUserId } from "@/hooks/useOneSignal";
import { useIsMounted } from "@/hooks/useIsMounted";
import PwaHeader from "@/components/pwa/Header";
import { formatPrice } from "@/lib/formatPrice";
import { cn } from "@/lib/utils";
import { brand } from "@/config/brand";
import { useScheduleCompleteness, fetchTherapistUnavailableDates } from "@/hooks/pwa/useScheduleCompleteness";
import { useRefetchOnFocus } from "@/hooks/pwa/useRefetchOnFocus";
import { ScheduleReminderBanner } from "@/components/pwa/schedule/ScheduleReminderBanner";

interface Therapist {
  id: string;
  first_name: string;
  last_name: string;
  profile_image: string | null;
  email: string;
  gender: string | null;
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
  room_name?: string | null;
  status: string;
  total_price: number | null;
  therapist_id: string | null;
  therapist_gender_preference?: string | null;
  declined_by?: string[];
  payment_status?: string | null;
  guest_count?: number; 
  booking_therapists?: { status: string; therapist_id?: string }[];
  payment_method?: string | null;
  booking_treatments?: Array<{
    treatment_menus: {
      name: string;
      price: number;
      duration: number;
    } | null;
  }>;
  hotels?: { image: string | null; currency: string | null } | { image: string | null; currency: string | null }[] | null;
  proposed_slots?: {
    slot_1_date: string;
    slot_1_time: string;
    slot_2_date?: string | null;
    slot_2_time?: string | null;
    slot_3_date?: string | null;
    slot_3_time?: string | null;
  } | null;
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

const getPaymentStatusBadge = (paymentStatus: string | null | undefined, paymentMethod: string | null | undefined, t: (key: string) => string) => {
  if (!paymentStatus) return null;

  switch (paymentStatus) {
    case 'paid':
      return { label: t('dashboard.paymentPaid'), className: 'bg-green-100 text-green-700' };
    case 'charged_to_room':
      return { label: t('dashboard.paymentRoom'), className: 'bg-blue-100 text-blue-700' };
      case 'card_saved': 
      return { label: 'Carte enregistrée', className: 'bg-purple-100 text-purple-700' };
    case 'pending':
      return { label: t('dashboard.paymentPending'), className: 'bg-yellow-100 text-yellow-700' };
    case 'failed':
      return { label: t('dashboard.paymentFailed'), className: 'bg-red-100 text-red-700' };
    default:
      return null;
  }
};

const PwaDashboard = () => {
  const { t } = useTranslation('pwa');
  const [therapist, setTherapist] = useState<Therapist | null>(null);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"upcoming" | "history">("upcoming");
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [startY, setStartY] = useState(0);
  const [showAllBookings, setShowAllBookings] = useState(false);
  const [processing, setProcessing] = useState<{ id: string; action: "accept" | "decline" } | null>(null);
  const processingBookingId = processing?.id ?? null;
  const [unavailableDates, setUnavailableDates] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const isMountedRef = useIsMounted();
  const { data: scheduleCompleteness } = useScheduleCompleteness(therapist?.id);

  useEffect(() => {
    if (!therapist) return;

    const pendingDates = allBookings
      .filter((b) => b.status === "pending")
      .map((b) => b.booking_date);

    if (pendingDates.length === 0) {
      setUnavailableDates(new Set());
      return;
    }

    fetchTherapistUnavailableDates(therapist.id, pendingDates).then(
      setUnavailableDates
    );
  }, [therapist, allBookings]);

  useEffect(() => {
    checkAuth();
  }, []);

  // Single useEffect to handle initial load - use cache first
  useEffect(() => {
    if (!therapist) return;

    // Check if we need to force refresh (e.g., after unassigning a booking)
    const shouldForceRefresh = location.state?.forceRefresh;

    if (shouldForceRefresh) {
      queryClient.removeQueries({ queryKey: ["myBookings", therapist.id] });
      queryClient.removeQueries({ queryKey: ["pendingBookings", therapist.id] });
      // Clear navigation state
      navigate(location.pathname, { replace: true, state: {} });
      fetchAllBookings(therapist.id);
      return;
    }

    // Check for cached bookings first - show immediately if available
    const cachedMyBookings = queryClient.getQueryData<any[]>(["myBookings", therapist.id]);
    const cachedPendingBookings = queryClient.getQueryData<any[]>(["pendingBookings", therapist.id]);

    if (cachedMyBookings || cachedPendingBookings) {
      const allData = [...(cachedMyBookings || []), ...(cachedPendingBookings || [])];
      const uniqueData = Array.from(new Map(allData.map((b: any) => [b.id, b])).values());
      const sortedData = uniqueData.sort((a: any, b: any) => {
        const dateCompare = a.booking_date.localeCompare(b.booking_date);
        if (dateCompare !== 0) return dateCompare;
        return a.booking_time.localeCompare(b.booking_time);
      });
      if (isMountedRef.current) {
        setAllBookings(sortedData);
        setLoading(false);
      }
    }

    // Always fetch fresh data in background
    fetchAllBookings(therapist.id);
  }, [therapist, location.state?.forceRefresh]);

  // Realtime listener for bookings
  useEffect(() => {
    if (!therapist) return;

    let cancelled = false;

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
          if (cancelled || !isMountedRef.current) return;

          const newData = payload.new as any;
          const oldData = payload.old as any;
          
          setAllBookings(prev => {
            const idx = prev.findIndex(b => b.id === newData.id);

            // Solo pending taken by another therapist → toast.
            // Duos (guest_count > 1) stay visible to other therapists, so skip them.
            if (idx !== -1 &&
                oldData.therapist_id === null &&
                newData.therapist_id !== null &&
                newData.therapist_id !== therapist.id &&
                !(newData.guest_count > 1)) {
              const isSecondary = prev[idx].booking_therapists?.some(
                (bt) => bt.therapist_id === therapist.id && bt.status === 'accepted'
              );
              if (!isSecondary && isMountedRef.current) {
                toast.info(t('dashboard.bookingTakenByOther', { id: newData.booking_id }));
              }
            }

            // Booking not in our list → ignore
            if (idx === -1) return prev;

            // Cancelled/noshow and we're not involved → remove
            if (newData.status === 'cancelled' || newData.status === 'noshow') {
              const isInvolved = newData.therapist_id === therapist.id ||
                prev[idx].booking_therapists?.some(
                  (bt) => bt.therapist_id === therapist.id && bt.status === 'accepted'
                );
              if (!isInvolved) return prev.filter(b => b.id !== newData.id);
            }

            // Update in place — getFilteredBookings handles visibility
            const updated = [...prev];
            updated[idx] = { ...updated[idx], ...newData };
            return updated;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bookings'
        },
        (_payload) => {
          if (!cancelled && isMountedRef.current) {
            fetchAllBookings(therapist.id);
          }
        }
      )
      // Mise à jour du compteur duo en temps réel :
      // Quand A accepte, un INSERT dans booking_therapists se produit.
      // Sans cet écouteur, B voit 0/2 jusqu'au prochain fetch complet
      // car le realtime bookings UPDATE ne transporte pas les relations.
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'booking_therapists'
        },
        (payload) => {
          const newBt = payload.new as { booking_id: string; therapist_id: string; status: string };
          if (newBt.status !== 'accepted') return;
          if (cancelled || !isMountedRef.current) return;

          setAllBookings(prev => {
            const idx = prev.findIndex(b => b.id === newBt.booking_id);
            if (idx === -1) return prev;
            const existingBts = prev[idx].booking_therapists || [];
            if (existingBts.some(bt => bt.therapist_id === newBt.therapist_id)) return prev;
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              booking_therapists: [...existingBts, { status: newBt.status, therapist_id: newBt.therapist_id }],
            };
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [therapist]);

  // Re-fetch when the app regains focus/visibility: realtime is disabled in prod,
  // so this is what makes a reassigned booking disappear for the old therapist.
  useRefetchOnFocus(() => {
    if (therapist) fetchAllBookings(therapist.id);
  }, !!therapist);


  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        navigate("/pwa/login");
        return;
      }

      if (!isMountedRef.current) return;

      // Set OneSignal external user ID for push notification targeting
      setOneSignalExternalUserId(user.id);

      // Use cached data if available
      const cachedData = queryClient.getQueryData<any>(["therapist", user.id]);

      if (cachedData) {
        if (isMountedRef.current) {
          setTherapist(cachedData);
          setLoading(false);
        }
        return;
      }

      const { data: therapistData, error } = await supabase
        .from("therapists")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (!isMountedRef.current) return;

      if (error || !therapistData) {
        if (isMountedRef.current) {
          toast.error(t('dashboard.profileNotFound'));
        }
        await supabase.auth.signOut();
        navigate("/pwa/login");
        return;
      }

      // Cache therapist data
      queryClient.setQueryData(["therapist", user.id], therapistData);
      if (isMountedRef.current) {
        setTherapist(therapistData);
      }
    } catch (error) {
      console.error("Auth error:", error);
      navigate("/pwa/login");
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const fetchAllBookings = async (therapistId: string, forceRefresh = false) => {
    if (!isMountedRef.current) return;

    // Clear cache when force refreshing
    if (forceRefresh) {
      queryClient.removeQueries({ queryKey: ["myBookings", therapistId] });
      queryClient.removeQueries({ queryKey: ["pendingBookings", therapistId] });
    }

    const { data: affiliatedHotels, error: hotelsError } = await supabase
      .from("therapist_venues")
      .select("hotel_id")
      .eq("therapist_id", therapistId);

    if (!isMountedRef.current) return;

    if (hotelsError || !affiliatedHotels || affiliatedHotels.length === 0) {
      console.error("❌ Error fetching affiliated hotels:", hotelsError);
      if (isMountedRef.current) {
        setAllBookings([]);
        setLoading(false);
      }
      return;
    }

    const hotelIds = affiliatedHotels.map(h => h.hotel_id);

    // Fetch hotel images and currency separately (no FK relationship)
    const { data: hotelData } = await supabase
      .from("hotels")
      .select("id, image, currency")
      .in("id", hotelIds);

    if (!isMountedRef.current) return;

    const hotelDataMap = new Map(hotelData?.map(h => [h.id, { image: h.image, currency: h.currency }]) || []);

    // 1. Get bookings assigned to this therapist (any status)
    const { data: myBookings, error: myError } = await supabase
      .from("bookings")
      .select(`
        *,
        treatment_rooms!bookings_trunk_id_fkey ( name ),
        booking_therapists ( status, therapist_id ),
        booking_treatments (
          treatment_menus (
            name,
            price,
            duration
          )
        )
      `)
      .eq("therapist_id", therapistId)
      .in("hotel_id", hotelIds)
      .neq("status", "cancelled");

    if (!isMountedRef.current) return;

    let myBookingsWithImages: Booking[] = [];
    if (myError) {
      console.error('Error fetching my bookings:', myError);
    } else {
      myBookingsWithImages = (myBookings || []).map(b => ({
        ...b,
        room_name: (b as { treatment_rooms?: { name: string | null } | null }).treatment_rooms?.name ?? null,
        hotels: hotelDataMap.get(b.hotel_id) || { image: null, currency: null }
      }));

      // Fetch duo bookings where this therapist is secondary (in booking_therapists but not primary)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: btData } = await (supabase as any)
        .from("booking_therapists")
        .select("booking_id")
        .eq("therapist_id", therapistId)
        .eq("status", "accepted");

      if (!isMountedRef.current) return;

      const primaryIds = new Set((myBookings || []).map(b => b.id));
      const secondaryBookingIds = ((btData as { booking_id: string }[]) || [])
        .map((bt) => bt.booking_id)
        .filter((id) => !primaryIds.has(id));

      if (secondaryBookingIds.length > 0) {
        const { data: secondaryBookings } = await supabase
          .from("bookings")
          .select(`
            *,
            booking_therapists ( status, therapist_id ),
            booking_treatments (
              treatment_menus (
                name,
                price,
                duration
              )
            )
          `)
          .in("id", secondaryBookingIds)
          .neq("status", "cancelled");

        if (!isMountedRef.current) return;

        const secondaryWithImages = (secondaryBookings || []).map(b => ({
          ...b,
          room_name: (b as { treatment_rooms?: { name: string | null } | null }).treatment_rooms?.name ?? null,
          hotels: hotelDataMap.get(b.hotel_id) || { image: null, currency: null }
        }));
        myBookingsWithImages = [...myBookingsWithImages, ...secondaryWithImages];
      }

      queryClient.setQueryData(["myBookings", therapistId], myBookingsWithImages);
    }

    // 2. Get pending bookings (unassigned solos + duo bookings awaiting more therapists)
    const pendingQuery = supabase
      .from("bookings")
      .select(`
        *,
        treatment_rooms!bookings_trunk_id_fkey ( name ),
        booking_therapists ( status, therapist_id ),
        booking_treatments (
          treatment_menus (
            name,
            price,
            duration
          )
        )
      `)
      .in("hotel_id", hotelIds)
      .eq("status", "pending");

    const { data: pendingBookings, error: pendingError } = await pendingQuery;

    if (!isMountedRef.current) return;

    // Filter pending bookings
    const filteredPendingBookings = pendingBookings?.filter(b => {
      // Duo bookings (guest_count > 1) waiting for more therapists: show to all
      // hotel therapists who haven't accepted yet. A fully staffed duo is
      // already 'confirmed', so any pending duo here is still open.
      if (b.guest_count > 1) {
        const alreadyAccepted = (b.booking_therapists as { status: string; therapist_id?: string }[] | undefined)?.some(
          bt => bt.therapist_id === therapistId && bt.status === 'accepted'
        );
        return !alreadyAccepted;
      }
      // Solo pending bookings: must be unassigned (assigned ones come from myBookings).
      // Visible to all therapists of the venue, regardless of treatment room.
      return b.therapist_id === null;
    }) || [];


    // Fetch proposed slots for open duo bookings
    const awaitingBookingIds = filteredPendingBookings
      .filter(b => b.guest_count > 1)
      .map(b => b.id);

    let slotsMap = new Map<string, any>();
    if (awaitingBookingIds.length > 0) {
      const { data: slotsData } = await supabase
        .from("booking_proposed_slots")
        .select("booking_id, slot_1_date, slot_1_time, slot_2_date, slot_2_time, slot_3_date, slot_3_time")
        .in("booking_id", awaitingBookingIds);

      if (!isMountedRef.current) return;

      if (slotsData) {
        slotsMap = new Map(slotsData.map(s => [s.booking_id, s]));
      }
    }

    // Add hotel images and proposed slots to pending bookings
    const pendingBookingsWithImages = filteredPendingBookings.map(b => ({
      ...b,
      room_name: (b as { treatment_rooms?: { name: string | null } | null }).treatment_rooms?.name ?? null,
      hotels: hotelDataMap.get(b.hotel_id) || { image: null, currency: null },
      proposed_slots: slotsMap.get(b.id) || null,
    }));

    if (pendingError) {
      console.error('❌ Error fetching pending bookings:', pendingError);
    } else {
      // Cache pending bookings
      queryClient.setQueryData(["pendingBookings", therapistId], pendingBookingsWithImages);
    }


    // Only return if BOTH queries failed
    if (myError && pendingError) {
      console.error('❌ Both queries failed');
      if (isMountedRef.current) {
        setAllBookings([]);
        setLoading(false);
      }
      return;
    }

    // Combine, deduplicate, and sort both sets of bookings
    const allData = [...myBookingsWithImages, ...pendingBookingsWithImages];
    const uniqueData = Array.from(new Map(allData.map(b => [b.id, b])).values());
    const sortedData = uniqueData.sort((a, b) => {
      const dateCompare = a.booking_date.localeCompare(b.booking_date);
      if (dateCompare !== 0) return dateCompare;
      return a.booking_time.localeCompare(b.booking_time);
    });

    if (isMountedRef.current) {
      setAllBookings(sortedData);
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!therapist || refreshing) return;
    if (!isMountedRef.current) return;

    setRefreshing(true);
    setShowAllBookings(false); // Reset to show only 3 on refresh
    await fetchAllBookings(therapist.id);
    if (isMountedRef.current) {
      setRefreshing(false);
    }
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
      
      // Check if booking is assigned to this therapist (primary or secondary on a duo)
      const isAssignedToMe = therapist && (
        booking.therapist_id === therapist.id ||
        booking.booking_therapists?.some(
          (bt) => bt.therapist_id === therapist.id && bt.status === 'accepted'
        )
      );
      
      // Active statuses that block a slot (must be visible in "upcoming")
      const activeStatuses = ["confirmed", "ongoing"];
      const isActiveStatus = activeStatuses.includes(booking.status);
      
      if (activeTab === "upcoming") {
        // Pending bookings normally live in the pending requests section, not
        // here. Exception: an open duo (guest_count > 1) that THIS therapist has
        // already accepted stays 'pending' until the duo is fully staffed, but
        // it's filtered out of the pending requests section (already accepted).
        // Surface it here so it doesn't fall through the cracks (visible only in
        // the planning otherwise).
        const acceptedDuoPending =
          booking.status === "pending" &&
          (booking.guest_count ?? 1) > 1 &&
          booking.booking_therapists?.some(
            (bt) => bt.therapist_id === therapist?.id && bt.status === "accepted"
          );
        return isAssignedToMe &&
               (booking.status !== "pending" || acceptedDuoPending) &&
               booking.status !== "completed" &&
               bookingDate >= today;
      } else {
        return booking.status === "completed" && isAssignedToMe;
      }
    });
  };

  const handleAcceptBooking = async (bookingId: string) => {
    if (!therapist || !isMountedRef.current || processingBookingId) return;

    setProcessing({ id: bookingId, action: "accept" });
    try {
      const totalPrice = calculateTotalPrice(allBookings.find(b => b.id === bookingId)!);

      const { data, error } = await supabase.rpc('accept_booking', {
        _booking_id: bookingId,
        // Correction des noms de paramètres pour correspondre à la DB
        _hairdresser_id: therapist.id, 
        _hairdresser_name: `${therapist.first_name} ${therapist.last_name}`,
        _total_price: totalPrice
      });

      if (!isMountedRef.current) return;

      if (error) throw error;

      const result = data as { success: boolean; error?: string; data?: { status?: string } } | null;

      if (result && !result.success) {
        const errCode = result.error;
        if (isMountedRef.current) {
          if (errCode === 'already_taken' || errCode === 'fully_staffed') {
            toast.error(t('dashboard.bookingAlreadyTaken'));
          } else {
            toast.error(t('dashboard.acceptError'));
          }
          fetchAllBookings(therapist.id);
        }
        return;
      }

      // Only send confirmation notification once all therapists have accepted
      if (result?.data?.status === 'confirmed') {
        try {
          await invokeEdgeFunction('notify-booking-confirmed', { body: { bookingId } });
        } catch (notifError) {
          console.error("Email notification error (non-blocking):", notifError);
        }
      }

      if (!isMountedRef.current) return;

      toast.success(t('dashboard.bookingAccepted'));
      fetchAllBookings(therapist.id, true); // Force refresh to get updated data
    } catch (error) {
      console.error("Error accepting booking:", error);
      if (!isMountedRef.current) return;

      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('already_taken') || msg.includes('already assigned') || msg.includes('déjà assignée')) {
        toast.error(t('dashboard.bookingAlreadyTaken'));
        fetchAllBookings(therapist.id);
      } else {
        toast.error(t('dashboard.acceptError'));
      }
    } finally {
      if (isMountedRef.current) setProcessing(null);
    }
  };

  const handleDeclineBooking = async (bookingId: string) => {
    if (!therapist || !isMountedRef.current || processingBookingId) return;

    setProcessing({ id: bookingId, action: "decline" });
    try {
      const { data: currentBooking } = await supabase
        .from("bookings")
        .select("declined_by")
        .eq("id", bookingId)
        .single();

      if (!isMountedRef.current) return;

      const currentDeclined = currentBooking?.declined_by || [];
      const updatedDeclined = [...currentDeclined, therapist.id];

      const { error } = await supabase
        .from("bookings")
        .update({ declined_by: updatedDeclined })
        .eq("id", bookingId);

      if (!isMountedRef.current) return;

      if (error) throw error;

      toast.success(t('dashboard.bookingDeclined'));
      fetchAllBookings(therapist.id, true); // Force refresh
    } catch (error) {
      console.error("Error declining booking:", error);
      if (isMountedRef.current) {
        toast.error(t('dashboard.error'));
      }
    } finally {
      if (isMountedRef.current) setProcessing(null);
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
    return allBookings.filter(b => {
      const hasDeclined = therapist && b.declined_by?.includes(therapist.id);
      if (hasDeclined) return false;

      if (unavailableDates.has(b.booking_date)) return false;

      if (b.status === "pending" && b.guest_count > 1) {
        // Open duo booking (pending until fully staffed): show unless current
        // therapist already accepted.
        const alreadyAccepted = b.booking_therapists?.some(
          bt => bt.therapist_id === therapist?.id && bt.status === 'accepted'
        );
        return !alreadyAccepted;
      }

      if (b.status === "pending") {
        const myId = therapist?.id ?? '';
        const myGender = therapist?.gender ?? null;
        const genderPref = b.therapist_gender_preference ?? null;
        const iDeclined = (b.declined_by ?? []).includes(myId);

        // Assigned to me specifically
        if (b.therapist_id === myId) return true;
        // Assigned to someone else
        if (b.therapist_id !== null) return false;

        // Unassigned — I already declined, never show again
        if (iDeclined) return false;

        // No gender preference → visible to all
        if (!genderPref) return true;

        // Phase 1: only matching-gender therapists see it
        if (myGender === genderPref) return true;

        // Phase 2 fallback: non-matching gender sees it only after ≥1 priority decline
        return (b.declined_by?.length ?? 0) > 0;
      }

      return false;
    });
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

  const todayStats = (() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const todayBookings = allBookings.filter(
      (b) =>
        b.booking_date === todayStr &&
        (b.therapist_id === therapist?.id ||
          b.booking_therapists?.some(
            (bt) => bt.therapist_id === therapist?.id && bt.status === 'accepted'
          )) &&
        b.status !== "cancelled" &&
        b.status !== "noshow"
    );
    const count = todayBookings.length;
    const totalMinutes = todayBookings.reduce(
      (sum, b) => sum + calculateTotalDuration(b),
      0
    );
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const hoursLabel = mins > 0 ? `${hours}h${mins.toString().padStart(2, "0")}` : `${hours}h`;
    const totalRevenue = todayBookings.reduce(
      (sum, b) => sum + calculateTotalPrice(b),
      0
    );
    const totalHT = totalRevenue / 1.2;
    const earnings = Math.round(totalHT * 0.7);
    return { count, hoursLabel, earnings };
  })();

  return (
    <div className="flex flex-1 flex-col bg-background">
      <PwaHeader
        leftSlot={
          <span className="text-xl font-bold tracking-wider" style={{ fontFamily: "'Kormelink', serif" }}>{brand.name}</span>
        }
        rightSlot={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label={t('dashboard.refresh')}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </button>
            <Avatar
              className="h-7 w-7 ring-1 ring-border cursor-pointer"
              onClick={() => navigate("/pwa/profile")}
            >
              <AvatarImage src={therapist?.profile_image || undefined} />
              <AvatarFallback className="bg-muted text-foreground text-[10px] font-medium">
                {therapist?.first_name?.[0]}{therapist?.last_name?.[0]}
              </AvatarFallback>
            </Avatar>
          </div>
        }
      />

      {scheduleCompleteness && (
        <div className="px-4 pt-3">
          <ScheduleReminderBanner
            incomplete={scheduleCompleteness.isIncomplete}
            variant="dashboard"
            partialProgress={
              scheduleCompleteness.status === "partial"
                ? {
                    count: scheduleCompleteness.declaredDaysCount,
                    total:
                      scheduleCompleteness.expectedDaysCount > 0
                        ? scheduleCompleteness.expectedDaysCount
                        : scheduleCompleteness.horizonDays,
                  }
                : undefined
            }
          />
        </div>
      )}

      {/* Today's KPI banner */}
      <div className="px-4 pt-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border bg-card px-3 py-2.5 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-base font-bold leading-none">{todayStats.count}</div>
              <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                {t('dashboard.todayAppointments')}
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-card px-3 py-2.5 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-base font-bold leading-none">{todayStats.hoursLabel}</div>
              <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                {t('dashboard.todayHours')}
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-card px-3 py-2.5 flex items-center gap-2">
            <Euro className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-base font-bold leading-none">
                {formatPrice(todayStats.earnings, 'EUR', { decimals: 0 })}
              </div>
              <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                {t('dashboard.todayEarnings')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pull to refresh indicator */}
      {pullDistance > 0 && (
        <div 
          className="flex justify-center items-center py-1 transition-opacity flex-shrink-0"
          style={{ 
            opacity: Math.min(pullDistance / 60, 1),
            transform: `translateY(${Math.min(pullDistance - 20, 0)}px)`
          }}
        >
          <div className={`w-5 h-5 border-2 border-primary border-t-transparent rounded-full ${refreshing ? 'animate-spin' : ''}`} />
        </div>
      )}

      {/* Content - no scroll, parent handles it */}
      <div
        className="flex flex-col flex-1 min-h-0 pb-2"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* My Bookings Section */}
        <div className="order-2 px-4 pt-3">
          <h2 className="text-[10px] font-bold uppercase tracking-wider mb-2 text-foreground">{t('dashboard.myBookings')}</h2>
          
          {/* Tabs - Compact */}
          <div className="flex gap-4 mb-3 border-b border-border">
            <button
              onClick={() => setActiveTab("upcoming")}
              className={`pb-2 text-xs font-medium transition-colors relative ${
                activeTab === "upcoming"
                  ? "text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {t('dashboard.upcoming')}
              <div
                className={cn(
                  "absolute bottom-0 left-0 right-0 h-0.5 bg-primary transition-opacity",
                  activeTab === "upcoming" ? "opacity-100" : "opacity-0"
                )}
              />
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`pb-2 text-xs font-medium transition-colors relative ${
                activeTab === "history"
                  ? "text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {t('dashboard.history')}
              <div
                className={cn(
                  "absolute bottom-0 left-0 right-0 h-0.5 bg-primary transition-opacity",
                  activeTab === "history" ? "opacity-100" : "opacity-0"
                )}
              />
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
                <div className="mb-2 flex justify-center">
                  {activeTab === "upcoming" ? (
                    <CalendarDays className="h-8 w-8 text-muted-foreground" />
                  ) : (
                    <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <h3 className="text-sm font-medium text-foreground mb-1">
                  {activeTab === "upcoming" ? t('dashboard.noUpcoming') : t('dashboard.noHistory')}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {activeTab === "upcoming" ? t('dashboard.upcomingWillAppear') : t('dashboard.historyWillAppear')}
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
                    <div className="w-10 h-10 bg-muted rounded-lg flex-shrink-0 overflow-hidden">
                      {getHotelImage(booking) ? (
                        <img 
                          src={getHotelImage(booking)!} 
                          alt={booking.hotel_name} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-muted to-muted flex items-center justify-center">
                          <span className="text-muted-foreground text-xs font-bold">{booking.hotel_name?.[0]}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0">
                        <span className="font-semibold text-xs text-muted-foreground flex-shrink-0">#{booking.booking_id}</span>
                        <h3 className="font-semibold text-xs text-foreground truncate">{booking.hotel_name}</h3>

                        {/* NOUVEAU BADGE SOIN DUO */}
                        {(booking.guest_count || 1) > 1 && (
                          <Badge variant="outline" className="text-[8px] px-1 py-0 h-3 bg-blue-100 text-blue-700 border-blue-200 gap-0.5 flex-shrink-0 flex items-center">
                            <Users className="w-2.5 h-2.5 mr-0.5" />
                            {booking.booking_therapists?.filter(bt => bt.status === 'accepted').length || 0}/{booking.guest_count}
                          </Badge>
                        )}
                        
                        {booking.therapist_id && booking.status === "pending" && (
                          <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3">
                            {t('dashboard.toConfirm')}
                          </Badge>
                        )}
                        {(() => {
                          const paymentBadge = getPaymentStatusBadge(booking.payment_status, booking.payment_method, t);
                          return paymentBadge ? (
                            <Badge className={`text-[8px] px-1 py-0 h-3 ${paymentBadge.className}`}>
                              {paymentBadge.label}
                            </Badge>
                          ) : null;
                        })()}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {booking.booking_treatments?.map(bt => bt.treatment_menus?.name).filter(Boolean).join(', ') || ''}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {format(new Date(booking.booking_date), "EEE d MMM")}, {booking.booking_time.substring(0, 5)} • {calculateTotalDuration(booking)}min • {formatPrice(calculateTotalPrice(booking), getHotelCurrency(booking))}
                      </p>
                      {booking.room_name && (
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                          <DoorOpen className="h-3 w-3 shrink-0" />
                          {booking.room_name}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                  </div>
                ))}
              </>
            )}
            
            {filteredBookings.length > 3 && !showAllBookings && (
              <button 
                onClick={() => setShowAllBookings(true)}
                className="text-xs text-foreground font-medium w-full text-center py-2 hover:bg-muted rounded-lg transition-colors"
              >
                {t('dashboard.showMore', { count: filteredBookings.length - 3 })}
              </button>
            )}
            
            {showAllBookings && filteredBookings.length > 3 && (
              <button 
                onClick={() => setShowAllBookings(false)}
                className="text-xs text-muted-foreground font-medium w-full text-center py-2 hover:bg-muted rounded-lg transition-colors"
              >
                {t('dashboard.showLess')}
              </button>
            )}
          </div>
        </div>

        {/* Pending Requests Section - Compact */}
        <div className="order-1 px-4 pt-3 pb-2">
          <div className="flex items-center gap-1.5 mb-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-foreground">{t('dashboard.pendingRequests')}</h2>
            <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center">
              <span className="text-[9px] font-semibold text-muted-foreground">{pendingRequests.length}</span>
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
              <div className="mb-2 flex justify-center">
                <Clock className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-medium text-foreground mb-1">
                {t('dashboard.noPending')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.pendingWillAppear')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {groupedPendingRequests.map(([date, bookings]) => (
                <div key={date}>
                  <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">
                    {format(new Date(date), "d MMM")} • {format(new Date(date), "EEEE")}
                  </p>
                  <div className="space-y-1">
                    {bookings.map((booking, index) => (
                      <div key={booking.id}>
                        <div
                          onClick={() => navigate(`/pwa/booking/${booking.id}`)}
                          className="flex items-center gap-2 cursor-pointer py-1"
                        >
                          <div className="w-10 h-10 bg-muted rounded-lg flex-shrink-0 overflow-hidden">
                            {getHotelImage(booking) ? (
                              <img 
                                src={getHotelImage(booking)!} 
                                alt={booking.hotel_name} 
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-muted to-muted flex items-center justify-center">
                                <span className="text-muted-foreground text-xs font-bold">{booking.hotel_name?.[0]}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-xs text-muted-foreground flex-shrink-0">#{booking.booking_id}</span>
                              <h3 className="font-semibold text-xs text-foreground truncate">{booking.hotel_name}</h3>

                              {/* NOUVEAU BADGE SOIN DUO */}
                              {(booking.guest_count || 1) > 1 && (
                                <Badge variant="outline" className="text-[8px] px-1 py-0 h-3 bg-blue-100 text-blue-700 border-blue-200 gap-0.5 flex-shrink-0 flex items-center">
                                  <Users className="w-2.5 h-2.5 mr-0.5" />
                                  {booking.booking_therapists?.filter(bt => bt.status === 'accepted').length || 0}/{booking.guest_count}
                                </Badge>
                              )}

                              {booking.proposed_slots && (booking.proposed_slots.slot_2_date || booking.proposed_slots.slot_3_date) && (
                                <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3 bg-purple-100 text-purple-700 flex-shrink-0">
                                  {t('dashboard.slots', { count: [true, !!booking.proposed_slots.slot_2_date, !!booking.proposed_slots.slot_3_date].filter(Boolean).length })}
                                </Badge>
                              )}

                              {(() => {
                                const paymentBadge = getPaymentStatusBadge(booking.payment_status, booking.payment_method, t);
                                return paymentBadge ? (
                                  <Badge className={`text-[8px] px-1 py-0 h-3 flex-shrink-0 ${paymentBadge.className}`}>
                                    {paymentBadge.label}
                                  </Badge>
                                ) : null;
                              })()}
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {booking.booking_treatments?.map(bt => bt.treatment_menus?.name).filter(Boolean).join(', ') || ''}
                            </p>
                            {booking.proposed_slots ? (
                              <p className="text-[11px] text-muted-foreground">
                                {format(new Date(booking.proposed_slots.slot_1_date + "T00:00:00"), "d/MM")} {booking.proposed_slots.slot_1_time.substring(0, 5)}
                                {booking.proposed_slots.slot_2_date && booking.proposed_slots.slot_2_time &&
                                  ` / ${format(new Date(booking.proposed_slots.slot_2_date + "T00:00:00"), "d/MM")} ${booking.proposed_slots.slot_2_time.substring(0, 5)}`}
                                {booking.proposed_slots.slot_3_date && booking.proposed_slots.slot_3_time &&
                                  ` / ${format(new Date(booking.proposed_slots.slot_3_date + "T00:00:00"), "d/MM")} ${booking.proposed_slots.slot_3_time.substring(0, 5)}`}
                                {" "}• {calculateTotalDuration(booking)}min • {formatPrice(calculateTotalPrice(booking), getHotelCurrency(booking))}
                              </p>
                            ) : (
                              <p className="text-[11px] text-muted-foreground">
                                {booking.booking_time.substring(0, 5)} • {calculateTotalDuration(booking)}min • {formatPrice(calculateTotalPrice(booking), getHotelCurrency(booking))}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              type="button"
                              aria-label={t('dashboard.accept')}
                              disabled={processingBookingId !== null}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAcceptBooking(booking.id);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-700 transition-colors hover:bg-green-200 disabled:opacity-50"
                            >
                              {processing?.id === booking.id && processing.action === "accept" ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              aria-label={t('dashboard.decline')}
                              disabled={processingBookingId !== null}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeclineBooking(booking.id);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-700 transition-colors hover:bg-red-200 disabled:opacity-50"
                            >
                              {processing?.id === booking.id && processing.action === "decline" ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <X className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </div>
                        {index < bookings.length - 1 && (
                          <div className="h-px bg-muted mt-1" />
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