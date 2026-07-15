import { useEffect, useState, Fragment } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Loader2, RefreshCw, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import i18n from "@/i18n";
import PushNotificationPrompt from "@/components/PushNotificationPrompt";
import { setOneSignalExternalUserId } from "@/hooks/useOneSignal";
import { useIsMounted } from "@/hooks/useIsMounted";
import { formatPrice } from "@/lib/formatPrice";
import { cn } from "@/lib/utils";
import { fetchTherapistUnavailableDates } from "@/hooks/pwa/useScheduleCompleteness";
import { useTherapistOrganizationName } from "@/hooks/pwa/useTherapistOrganizationName";
import { useRefetchOnFocus } from "@/hooks/pwa/useRefetchOnFocus";
import { myLegDuration, estimateTherapistShare } from "@/lib/therapistLegDuration";

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

// Helper to get hotel currency from booking (handles both object and array)
const getHotelCurrency = (booking: Booking): string => {
  if (!booking.hotels) return 'EUR';
  if (Array.isArray(booking.hotels)) {
    return booking.hotels[0]?.currency || 'EUR';
  }
  return booking.hotels.currency || 'EUR';
};

type PaymentDesignStatus = { kind: 'ok' | 'due' | 'warn' | 'info'; label: string };

const getPaymentDesignStatus = (
  paymentStatus: string | null | undefined,
  t: (key: string) => string
): PaymentDesignStatus | null => {
  if (!paymentStatus) return null;

  switch (paymentStatus) {
    case 'paid':
      return { kind: 'ok', label: t('dashboard.paymentPaid') };
    case 'charged_to_room':
      return { kind: 'info', label: t('dashboard.paymentRoom') };
    case 'card_saved':
      return { kind: 'info', label: t('dashboard.paymentCardSaved') };
    case 'pending':
      return { kind: 'due', label: t('dashboard.paymentPending') };
    case 'failed':
      return { kind: 'warn', label: t('dashboard.paymentFailed') };
    default:
      return null;
  }
};

const PaymentStatus = ({ status }: { status: PaymentDesignStatus | null }) =>
  status ? (
    <span className={'status ' + status.kind}>
      <span className="dot" />
      {status.label}
    </span>
  ) : null;

const treatmentsLabel = (b: { booking_treatments?: Array<{ treatment_menus: { name: string } | null }> }) =>
  b.booking_treatments?.map((bt) => bt.treatment_menus?.name).filter(Boolean).join(', ') || '';

const acceptedCount = (b: { booking_therapists?: { status: string }[] }) =>
  b.booking_therapists?.filter((bt) => bt.status === 'accepted').length || 0;

const PwaDashboard = () => {
  const { t } = useTranslation('pwa');
  const [therapist, setTherapist] = useState<Therapist | null>(null);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"upcoming" | "history">("upcoming");
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [startY, setStartY] = useState(0);
  const [showGreeting, setShowGreeting] = useState(true);
  const [processing, setProcessing] = useState<{ id: string; action: "accept" | "decline" } | null>(null);
  const processingBookingId = processing?.id ?? null;
  const [unavailableDates, setUnavailableDates] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const isMountedRef = useIsMounted();
  const orgName = useTherapistOrganizationName(therapist?.id);

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

  // Le message de bienvenue disparaît après 30 secondes.
  useEffect(() => {
    const timer = setTimeout(() => setShowGreeting(false), 30000);
    return () => clearTimeout(timer);
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

    // Fetch hotel images/currency + commission & surcharge settings separately
    // (no FK relationship). Commission/surcharge live on the venue, not the booking.
    const { data: hotelData } = await supabase
      .from("hotels")
      .select("id, image, currency, global_therapist_commission, therapist_commission, out_of_hours_surcharge_percent")
      .in("id", hotelIds);

    if (!isMountedRef.current) return;

    const hotelDataMap = new Map(hotelData?.map(h => [h.id, {
      image: h.image,
      currency: h.currency,
      global_therapist_commission: h.global_therapist_commission === true,
      therapist_commission: h.therapist_commission,
      out_of_hours_surcharge_percent: h.out_of_hours_surcharge_percent,
    }]) || []);

    // 1. Get bookings assigned to this therapist (any status)
    const { data: myBookings, error: myError } = await supabase
      .from("bookings")
      .select(`
        *,
        treatment_rooms!bookings_trunk_id_fkey ( name ),
        booking_therapists ( status, therapist_id, assigned_at ),
        booking_treatments (
          therapist_id,
          is_addon,
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
            booking_therapists ( status, therapist_id, assigned_at ),
            booking_treatments (
              therapist_id,
              is_addon,
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
        booking_therapists ( status, therapist_id, assigned_at ),
        booking_treatments (
          therapist_id,
          is_addon,
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
    // My share of a booking: only my own soin(s) in a duo (stable link when
    // present, positional fallback otherwise); the full duration for a solo.
    const myLeg = (b: Booking): number => {
      const gc = (b as { guest_count?: number }).guest_count ?? 1;
      if (gc <= 1) return calculateTotalDuration(b);
      const orderedIds = ((b.booking_therapists ?? []) as { therapist_id: string; status: string; assigned_at?: string | null }[])
        .filter((bt) => bt.status === "accepted")
        .sort((x, y) => (x.assigned_at || "").localeCompare(y.assigned_at || ""))
        .map((bt) => bt.therapist_id);
      const legTreatments = ((b.booking_treatments ?? []) as { therapist_id?: string | null; is_addon?: boolean | null; treatment_menus?: { duration?: number | null } | null }[])
        .map((t) => ({ therapist_id: t.therapist_id ?? null, duration: t.treatment_menus?.duration ?? null, is_addon: t.is_addon ?? false }));
      return myLegDuration(therapist?.id ?? "", legTreatments, orderedIds, gc);
    };
    const totalMinutes = todayBookings.reduce((sum, b) => sum + myLeg(b), 0);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const hoursLabel = mins > 0 ? `${hours}h${mins.toString().padStart(2, "0")}` : `${hours}h`;
    const earnings = Math.round(
      todayBookings.reduce((sum, b) => {
        const hotel = (b as { hotels?: { global_therapist_commission?: boolean; therapist_commission?: number | null; out_of_hours_surcharge_percent?: number | null } }).hotels;
        const surchargePercent = (b as { is_out_of_hours?: boolean | null }).is_out_of_hours
          ? Number(hotel?.out_of_hours_surcharge_percent) || 0
          : 0;
        return sum + estimateTherapistShare({
          globalTherapistCommission: hotel?.global_therapist_commission ?? false,
          guestCount: (b as { guest_count?: number }).guest_count ?? 1,
          legDuration: myLeg(b),
          myRates: {
            rate_60: (therapist as { rate_60?: number | null } | null)?.rate_60 ?? null,
            rate_75: (therapist as { rate_75?: number | null } | null)?.rate_75 ?? null,
            rate_90: (therapist as { rate_90?: number | null } | null)?.rate_90 ?? null,
          },
          grossPrice: calculateTotalPrice(b),
          therapistCommissionPercent: hotel?.therapist_commission ?? null,
          surchargePercent,
        });
      }, 0)
    );
    return { count, hoursLabel, earnings };
  })();

  const locale = i18n.language?.startsWith('en') ? enUS : fr;

  const nextRdv = (() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const nowHM = format(new Date(), 'HH:mm');
    return allBookings
      .filter(
        (b) =>
          b.booking_date === todayStr &&
          (b.therapist_id === therapist?.id ||
            b.booking_therapists?.some((bt) => bt.therapist_id === therapist?.id && bt.status === 'accepted')) &&
          (b.status === 'confirmed' || b.status === 'ongoing') &&
          b.booking_time.substring(0, 5) >= nowHM
      )
      .sort((a, b) => a.booking_time.localeCompare(b.booking_time))[0] || null;
  })();

  const nextRdvIn = (() => {
    if (!nextRdv) return null;
    const [h, m] = nextRdv.booking_time.split(':').map(Number);
    const dt = new Date();
    dt.setHours(h, m, 0, 0);
    const diffMin = Math.round((dt.getTime() - Date.now()) / 60000);
    if (diffMin <= 0) return null;
    const hh = Math.floor(diffMin / 60);
    const mm = diffMin % 60;
    const timeLabel = hh > 0 ? `${hh} h ${mm.toString().padStart(2, '0')}` : `${mm} min`;
    return t('dashboard.inTime', { time: timeLabel });
  })();

  const groupedBookings = groupBookingsByDate(filteredBookings);

  return (
    <div
      className="app-refonte flex flex-1 flex-col"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <header className="hdr" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 14px)' }}>
        <span className="wordmark">{orgName}</span>
        <div className="spacer" />
        <button
          type="button"
          className="hdr-icon-btn"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label={t('dashboard.refresh')}
        >
          <RefreshCw className={cn('h-[15px] w-[15px]', refreshing && 'animate-spin')} />
        </button>
        <button type="button" className="avatar" onClick={() => navigate('/pwa/profile')}>
          {therapist?.first_name?.[0]}{therapist?.last_name?.[0]}
        </button>
      </header>

      {pullDistance > 0 && (
        <div className="flex justify-center items-center py-1" style={{ opacity: Math.min(pullDistance / 60, 1) }}>
          <div className={cn('w-5 h-5 border-2 border-t-transparent rounded-full', refreshing && 'animate-spin')} style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        </div>
      )}

      {showGreeting && (
        <div className="greeting">
          <h1>
            {t('dashboard.greeting')} <em>{therapist?.first_name}</em>
          </h1>
          <div className="date">{format(new Date(), 'EEEE d MMMM yyyy', { locale })}</div>
        </div>
      )}

      {/* Prochain rendez-vous */}
      <div className="hero-card">
        <div className="glow" />
        {nextRdv ? (
          <button
            className="hero-inner"
            style={{ border: 'none', width: '100%', background: 'none', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}
            onClick={() => navigate('/pwa/bookings')}
          >
            <div className="hero-top">
              <span className="lbl">{t('dashboard.nextAppointment')}</span>
              {nextRdvIn && <span className="in">{nextRdvIn}</span>}
            </div>
            <div className="hero-main">
              <div className="hero-time">{nextRdv.booking_time.substring(0, 5)}</div>
              <div className="hero-detail">
                <div className="who">{nextRdv.hotel_name}</div>
                <div className="what">
                  {treatmentsLabel(nextRdv)}{treatmentsLabel(nextRdv) ? ' · ' : ''}{calculateTotalDuration(nextRdv)} min
                </div>
              </div>
              <ChevronRight size={18} />
            </div>
            <div className="hero-foot">
              <span>{t('dashboard.todayLabel')}&nbsp;: <b>{todayStats.count} {t('dashboard.rdvShort')}</b></span>
              <span><b>{todayStats.hoursLabel}</b> {t('dashboard.ofCare')}</span>
              <span><b>{formatPrice(todayStats.earnings, 'EUR', { decimals: 0 })}</b> {t('dashboard.estimated')}</span>
            </div>
          </button>
        ) : (
          <div className="hero-empty">
            <div className="t">{t('dashboard.freeDay')}</div>
            <div className="s">{t('dashboard.noAppointmentToday')}</div>
          </div>
        )}
      </div>

      {/* Mes disponibilités */}
      <button className="quiet-row" onClick={() => navigate('/pwa/schedule')}>
        <CalendarClock size={19} />
        {t('dashboard.myAvailability')}
        <span className="chev"><ChevronRight size={16} /></span>
      </button>

      {/* Demandes en attente */}
      {pendingRequests.length > 0 && (
        <Fragment>
          <div className="sec-label">
            {t('dashboard.pendingRequests')} <span className="count">{pendingRequests.length}</span>
          </div>
          {pendingRequests.map((r) => {
            const when = r.proposed_slots
              ? `${format(new Date(r.proposed_slots.slot_1_date + 'T00:00:00'), 'EEE d MMM', { locale })} · ${r.proposed_slots.slot_1_time.substring(0, 5)}`
              : `${format(new Date(r.booking_date), 'EEE d MMM', { locale })} · ${r.booking_time.substring(0, 5)}`;
            const isProcessing = processing?.id === r.id;
            return (
              <div
                className="req-card"
                key={r.id}
                onClick={() => navigate(`/pwa/booking/${r.id}`)}
                role="button"
                tabIndex={0}
              >
                <div className="req-when">{when}</div>
                <div className="req-head">
                  <span className="who">{r.hotel_name}</span>
                  {(r.guest_count || 1) > 1 && (
                    <span className="status info"><span className="dot" />{acceptedCount(r)}/{r.guest_count}</span>
                  )}
                  <PaymentStatus status={getPaymentDesignStatus(r.payment_status, t)} />
                </div>
                <div className="req-body">{treatmentsLabel(r)}</div>
                <div className="req-meta">
                  {calculateTotalDuration(r)} min &nbsp;·&nbsp; {formatPrice(calculateTotalPrice(r), getHotelCurrency(r))}
                </div>
                <div className="req-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn-detail"
                    disabled={processingBookingId !== null}
                    onClick={() => handleDeclineBooking(r.id)}
                  >
                    {isProcessing && processing?.action === 'decline'
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : t('dashboard.decline')}
                  </button>
                  <button
                    className="btn-accept"
                    disabled={processingBookingId !== null}
                    onClick={() => handleAcceptBooking(r.id)}
                  >
                    {isProcessing && processing?.action === 'accept'
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <><Check size={15} /> {t('dashboard.accept')}</>}
                  </button>
                </div>
              </div>
            );
          })}
        </Fragment>
      )}

      {/* Mes réservations */}
      <div className="sec-label">
        {t('dashboard.myBookings')}
        <button className="sec-action" onClick={() => setActiveTab(activeTab === 'upcoming' ? 'history' : 'upcoming')}>
          {activeTab === 'upcoming' ? t('dashboard.history') : t('dashboard.upcoming')} →
        </button>
      </div>

      {loading && allBookings.length === 0 ? (
        <div className="placeholder" style={{ padding: '30px 40px' }}>
          <p>{t('dashboard.loading')}</p>
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="placeholder" style={{ padding: '30px 40px' }}>
          <p>{activeTab === 'upcoming' ? t('dashboard.upcomingWillAppear') : t('dashboard.historyWillAppear')}</p>
        </div>
      ) : (
        <Fragment>
          {groupedBookings.map(([date, list]) => (
            <Fragment key={date}>
              <div className="day-group-label">{format(new Date(date), 'EEEE d MMMM', { locale })}</div>
              {list.map((b) => {
                const toConfirm = !!b.therapist_id && b.status === 'pending';
                return (
                  <button className="bk-row" key={b.id} onClick={() => navigate(`/pwa/booking/${b.id}`)}>
                    <div className="bk-time">
                      <div className="h">{b.booking_time.substring(0, 5)}</div>
                      <div className="d">{calculateTotalDuration(b)} min</div>
                    </div>
                    <div className="bk-main">
                      <div className="who">
                        {b.hotel_name}
                        {(b.guest_count || 1) > 1 && (
                          <span className="status info"><span className="dot" />{acceptedCount(b)}/{b.guest_count}</span>
                        )}
                      </div>
                      <div className="what">{treatmentsLabel(b)}</div>
                      {(b.room_name || toConfirm) && (
                        <div className="meta">
                          {b.room_name || ''}{b.room_name && toConfirm ? ' · ' : ''}{toConfirm ? t('dashboard.toConfirm') : ''}
                        </div>
                      )}
                    </div>
                    <div className="bk-right">
                      <div className="price">{formatPrice(calculateTotalPrice(b), getHotelCurrency(b), { decimals: 0 })}</div>
                      <PaymentStatus status={getPaymentDesignStatus(b.payment_status, t)} />
                    </div>
                  </button>
                );
              })}
            </Fragment>
          ))}
          <div style={{ height: 24 }} />
        </Fragment>
      )}

      <PushNotificationPrompt />
    </div>
  );
};

export default PwaDashboard;