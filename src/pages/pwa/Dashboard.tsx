import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Loader2, RefreshCw, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
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
import {
  myLegDuration,
  myLegTreatments,
  bookingSlotDuration,
  estimateTherapistShare,
} from "@/lib/therapistLegDuration";
import { useCurrentTherapist } from "@/hooks/pwa/useCurrentTherapist";
import { useTherapistVenues } from "@/hooks/pwa/useTherapistVenues";
import {
  useMyBookingsWindow,
  useMyNextBookings,
  usePendingBookingsWindow,
  type PwaBooking,
} from "@/hooks/pwa/usePwaBookings";
import { pwaBookingKeys } from "@/hooks/pwa/pwaBookingKeys";
import { dashboardWindow, historyWindow } from "@/lib/pwaBookingWindow";

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
    therapist_id?: string | null;
    treatment_id?: string | null;
    is_addon?: boolean | null;
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

/**
 * Libellé des soins d'une réservation. Sur un duo, chaque thérapeute a son
 * propre leg (booking_treatments.therapist_id) : on n'affiche que le sien,
 * sinon la carte répète le même soin autant de fois qu'il y a de participants.
 * Sans leg qui m'est assigné (demande ouverte, réservation non répartie), on
 * retombe sur la liste complète.
 */
const treatmentsLabel = (
  b: {
    booking_treatments?: Array<{
      therapist_id?: string | null;
      treatment_menus: { name: string } | null;
    }>;
  },
  therapistId?: string | null,
) => {
  const all = b.booking_treatments ?? [];
  const mine = therapistId ? all.filter((bt) => bt.therapist_id === therapistId) : [];
  return (mine.length > 0 ? mine : all)
    .map((bt) => bt.treatment_menus?.name)
    .filter(Boolean)
    .join(', ');
};

const acceptedCount = (b: { booking_therapists?: { status: string }[] }) =>
  b.booking_therapists?.filter((bt) => bt.status === 'accepted').length || 0;

const EMPTY_PRIORITIES: Record<string, number> = {};

/**
 * Nombre minimum de réservations que l'onglet « À venir » doit montrer, quitte
 * à aller chercher au-delà de la fenêtre J+30 du tableau de bord.
 */
const MIN_UPCOMING = 3;

/**
 * Une réservation appartient-elle à l'onglet « À venir » de ce thérapeute ?
 *
 * Extrait du filtre de la page pour que le filet « au moins MIN_UPCOMING »
 * compte exactement ce que l'onglet affiche, et pas une approximation.
 */
const isUpcomingForTherapist = (
  b: Pick<Booking, "booking_date" | "status" | "therapist_id" | "guest_count" | "booking_therapists">,
  therapistId: string | null | undefined,
  todayKey: string,
): boolean => {
  if (!therapistId) return false;

  const acceptedByMe = !!b.booking_therapists?.some(
    (bt) => bt.therapist_id === therapistId && bt.status === "accepted",
  );
  if (b.therapist_id !== therapistId && !acceptedByMe) return false;

  // Les demandes en attente vivent dans la section « demandes », pas ici.
  // Exception : une réservation que CE thérapeute a déjà acceptée reste 'pending'
  // tant que l'équipe n'est pas complète — duo, ou booking simple dont une autre
  // prestation attend encore un confrère (issue #547). Elle est justement exclue
  // de la section demandes : sans ça, elle ne serait visible que sur le planning.
  const acceptedStillPending = b.status === "pending" && acceptedByMe;

  return (
    (b.status !== "pending" || acceptedStillPending) &&
    b.status !== "completed" &&
    b.booking_date >= todayKey
  );
};

const PwaDashboard = () => {
  const { t } = useTranslation('pwa');
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

  const { data: me, isPending: identityPending } = useCurrentTherapist();
  const therapist = me?.therapist ?? null;
  const orgName = useTherapistOrganizationName(therapist?.id);

  // Mon groupe de priorité sur chaque lieu (therapist_venues.priority). Sert à
  // masquer les demandes dont la vague de broadcast n'est pas encore arrivée
  // jusqu'à moi : le push est filtré côté serveur, cette liste doit l'être aussi.
  const { data: venues } = useTherapistVenues(therapist?.id);
  const priorityByHotel = venues?.priorityByHotel ?? EMPTY_PRIORITIES;

  // La fenêtre est mémoïsée sur la date du jour, pas sur `new Date()` : sinon
  // la clé de requête changerait à chaque rendu. `dayKey` est rafraîchi au
  // retour au premier plan, sans quoi une app laissée ouverte la nuit garderait
  // la fenêtre de la veille.
  const [dayKey, setDayKey] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const window_ = useMemo(() => dashboardWindow(new Date(`${dayKey}T00:00:00`)), [dayKey]);
  const historyWindow_ = useMemo(() => historyWindow(new Date(`${dayKey}T00:00:00`)), [dayKey]);

  const mine = useMyBookingsWindow(therapist?.id, window_);
  const pending = usePendingBookingsWindow(therapist?.id, venues?.hotelIds, window_);
  // L'onglet Historique a sa propre fenêtre : la fenêtre J-7 du tableau de bord
  // le tronquerait à une semaine.
  const history = useMyBookingsWindow(therapist?.id, historyWindow_, {
    enabled: activeTab === "history",
  });

  // Combien de rendez-vous à venir la fenêtre J+30 ramène-t-elle réellement ?
  const upcomingInWindow = useMemo(
    () =>
      (mine.data ?? []).filter((b) =>
        isUpcomingForTherapist(b as unknown as Booking, therapist?.id, dayKey),
      ).length,
    [mine.data, therapist?.id, dayKey],
  );

  // Filet de sécurité : un thérapeute dont le prochain rendez-vous est dans deux
  // mois tombe hors de la fenêtre J+30 et voyait un onglet « À venir » vide.
  // La requête ne part que dans ce cas et ne ramène que MIN_UPCOMING lignes.
  const nextBeyondWindow = useMyNextBookings(therapist?.id, window_.to, MIN_UPCOMING, {
    enabled: activeTab === "upcoming" && !mine.isPending && upcomingInWindow < MIN_UPCOMING,
  });

  const loading = identityPending || mine.isPending;

  /**
   * Vue unifiée consommée par la page. L'enrichissement (image/devise du lieu,
   * créneaux proposés) se fait ici et n'est jamais réécrit dans le cache : une
   * seule requête écrit chaque clé, ce qui rend impossible le désaccord de
   * forme qui faisait afficher au tableau de bord des réservations annulées.
   */
  const allBookings: Booking[] = useMemo(() => {
    const settings = venues?.settingsByHotel;
    const slots = pending.data?.slotsByBooking;

    const rows: PwaBooking[] = [
      ...(mine.data ?? []),
      ...(pending.data?.bookings ?? []),
      ...(activeTab === "history" ? history.data ?? [] : []),
      ...(activeTab === "upcoming" ? nextBeyondWindow.data ?? [] : []),
    ];

    const unique = Array.from(new Map(rows.map((b) => [b.id, b])).values());

    return unique
      .map((b) => ({
        ...b,
        hotels: settings?.get(b.hotel_id) ?? { image: null, currency: null },
        proposed_slots: slots?.get(b.id) ?? null,
      }))
      .sort((a, b) => {
        const byDate = a.booking_date.localeCompare(b.booking_date);
        return byDate !== 0 ? byDate : a.booking_time.localeCompare(b.booking_time);
      }) as unknown as Booking[];
  }, [mine.data, pending.data, history.data, nextBeyondWindow.data, venues?.settingsByHotel, activeTab]);

  const refreshBookings = useCallback(
    () => queryClient.invalidateQueries({ queryKey: pwaBookingKeys.all }),
    [queryClient],
  );

  // Lu par l'écouteur realtime sans le faire dépendre des données : sinon le
  // canal serait détruit et recréé à chaque rafraîchissement.
  const bookingsRef = useRef(allBookings);
  bookingsRef.current = allBookings;

  useEffect(() => {
    if (!me) return;
    if (!me.userId) {
      navigate("/pwa/login");
      return;
    }
    // Ciblage des notifications push.
    setOneSignalExternalUserId(me.userId);
    if (!me.therapist) {
      toast.error(t('dashboard.profileNotFound'));
      void supabase.auth.signOut().then(() => navigate("/pwa/login"));
    }
  }, [me, navigate, t]);

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

  // Le message de bienvenue disparaît après 30 secondes.
  useEffect(() => {
    const timer = setTimeout(() => setShowGreeting(false), 30000);
    return () => clearTimeout(timer);
  }, []);

  // Retour depuis le détail d'une réservation après une action (accepter,
  // désassigner...). Les clés étant préfixées, une seule invalidation rafraîchit
  // aussi le planning — ce que l'ancien removeQueries ne faisait pas.
  useEffect(() => {
    if (!location.state?.forceRefresh) return;
    void refreshBookings();
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state?.forceRefresh, location.pathname, navigate, refreshBookings]);

  // Realtime listener for bookings.
  // NB : la table `bookings` n'est pas dans la publication supabase_realtime,
  // ces écouteurs sont donc inertes en production. Conservés pour parité.
  useEffect(() => {
    if (!therapist) return;

    let cancelled = false;

    const channel = supabase
      .channel('bookings-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bookings' },
        (payload) => {
          if (cancelled || !isMountedRef.current) return;

          const newData = payload.new as { id: string; booking_id: number; therapist_id: string | null; guest_count?: number };
          const oldData = payload.old as { therapist_id: string | null };

          // Solo pending taken by another therapist → toast.
          // Duos (guest_count > 1) stay visible to other therapists, so skip them.
          if (oldData.therapist_id === null &&
              newData.therapist_id !== null &&
              newData.therapist_id !== therapist.id &&
              !(newData.guest_count && newData.guest_count > 1)) {
            const known = bookingsRef.current.find((b) => b.id === newData.id);
            const isSecondary = known?.booking_therapists?.some(
              (bt) => bt.therapist_id === therapist.id && bt.status === 'accepted'
            );
            if (known && !isSecondary) {
              toast.info(t('dashboard.bookingTakenByOther', { id: newData.booking_id }));
            }
          }

          void refreshBookings();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bookings' },
        () => {
          if (!cancelled && isMountedRef.current) void refreshBookings();
        }
      )
      // Mise à jour du compteur duo en temps réel : quand A accepte, un INSERT
      // dans booking_therapists se produit. Le realtime bookings UPDATE ne
      // transporte pas les relations, d'où cet écouteur dédié.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'booking_therapists' },
        (payload) => {
          const newBt = payload.new as { status: string };
          if (newBt.status !== 'accepted') return;
          if (cancelled || !isMountedRef.current) return;
          void refreshBookings();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [therapist, isMountedRef, refreshBookings, t]);

  // Re-fetch when the app regains focus/visibility: realtime is disabled in prod,
  // so this is what makes a reassigned booking disappear for the old therapist.
  useRefetchOnFocus(() => {
    setDayKey(format(new Date(), "yyyy-MM-dd"));
    void refreshBookings();
  }, !!therapist);

  const handleRefresh = async () => {
    if (!therapist || refreshing) return;
    if (!isMountedRef.current) return;

    setRefreshing(true);
    await refreshBookings();
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
      if (activeTab === "upcoming") {
        return isUpcomingForTherapist(booking, therapist?.id, dayKey);
      }

      // Check if booking is assigned to this therapist (primary or secondary on a duo)
      const isAssignedToMe = therapist && (
        booking.therapist_id === therapist.id ||
        booking.booking_therapists?.some(
          (bt) => bt.therapist_id === therapist.id && bt.status === 'accepted'
        )
      );

      return booking.status === "completed" && isAssignedToMe;
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
          void refreshBookings();
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
      void refreshBookings();
    } catch (error) {
      console.error("Error accepting booking:", error);
      if (!isMountedRef.current) return;

      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('already_taken') || msg.includes('already assigned') || msg.includes('déjà assignée')) {
        toast.error(t('dashboard.bookingAlreadyTaken'));
        void refreshBookings();
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
      void refreshBookings();
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
    // Fallback: Calculate from treatments (duo legs run in parallel, never summed)
    if (!booking.booking_treatments || booking.booking_treatments.length === 0) {
      return 60; // default fallback
    }
    const duration = bookingSlotDuration(
      booking.booking_treatments.map((bt) => ({
        therapist_id: bt.therapist_id ?? null,
        duration: bt.treatment_menus?.duration ?? null,
        is_addon: bt.is_addon ?? false,
      })),
      (booking as { guest_count?: number }).guest_count ?? 1
    );
    return duration > 0 ? duration : 60; // fallback if all are 0
  };


  const getPendingRequests = () => {
    return allBookings.filter(b => {
      const hasDeclined = therapist && b.declined_by?.includes(therapist.id);
      if (hasDeclined) return false;

      if (unavailableDates.has(b.booking_date)) return false;

      // Vagues de sollicitation : tant que le broadcast n'a pas atteint mon groupe
      // sur ce lieu, la demande ne m'est pas encore ouverte. Miroir du filtrage
      // serveur du push (trigger-new-booking-notifications), sans quoi la liste le
      // contournerait. broadcast_wave reste null quand le lieu n'a qu'un groupe.
      const currentWave = (b as { broadcast_wave?: number | null }).broadcast_wave ?? null;
      const alreadyMine = b.therapist_id === therapist?.id
        || b.booking_therapists?.some(bt => bt.therapist_id === therapist?.id);
      if (currentWave !== null && !alreadyMine && (priorityByHotel[b.hotel_id] ?? 1) > currentWave) {
        return false;
      }

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

        // Réservation partagée : un confrère a pris une prestation, une autre
        // attend encore (issue #547). Elle reste une demande ouverte bien que
        // bookings.therapist_id nomme déjà quelqu'un. Exiger une jambe DÉJÀ
        // attribuée écarte les réservations historiques, dont aucune ligne ne
        // porte d'affectation alors que le praticien principal assure tout.
        const baseLegs = (b.booking_treatments ?? []).filter(bt => !bt.is_addon);
        const openLegCount = baseLegs.filter(bt => !bt.therapist_id).length;
        const hasOpenSharedLeg = openLegCount > 0 && openLegCount < baseLegs.length;

        // Assigned to me specifically
        if (b.therapist_id === myId) return true;
        // Assigned to someone else
        if (b.therapist_id !== null) return hasOpenSharedLeg && !alreadyMine;

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
    const legLineInputs = (b: Booking) =>
      ((b.booking_treatments ?? []) as { therapist_id?: string | null; treatment_id?: string | null; is_addon?: boolean | null; treatment_menus?: { duration?: number | null } | null }[])
        .map((t) => ({ therapist_id: t.therapist_id ?? null, treatment_id: t.treatment_id ?? null, duration: t.treatment_menus?.duration ?? null, is_addon: t.is_addon ?? false }));
    const orderedIdsOf = (b: Booking) =>
      ((b.booking_therapists ?? []) as { therapist_id: string; status: string; assigned_at?: string | null }[])
        .filter((bt) => bt.status === "accepted")
        .sort((x, y) => (x.assigned_at || "").localeCompare(y.assigned_at || ""))
        .map((bt) => bt.therapist_id);
    const myLeg = (b: Booking): number => {
      const gc = (b as { guest_count?: number }).guest_count ?? 1;
      if (gc <= 1) return calculateTotalDuration(b);
      return myLegDuration(therapist?.id ?? "", legLineInputs(b), orderedIdsOf(b), gc);
    };
    // Lignes dont `myLeg` est la somme — un solo est payé sur toutes.
    const myLegLines = (b: Booking) => {
      const gc = (b as { guest_count?: number }).guest_count ?? 1;
      const lines = legLineInputs(b);
      return gc <= 1 ? lines : myLegTreatments(therapist?.id ?? "", lines, orderedIdsOf(b), gc);
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
          legLines: myLegLines(b),
          myRates: {
            rate_60: (therapist as { rate_60?: number | null } | null)?.rate_60 ?? null,
            rate_75: (therapist as { rate_75?: number | null } | null)?.rate_75 ?? null,
            rate_90: (therapist as { rate_90?: number | null } | null)?.rate_90 ?? null,
          },
          // Le flag est honoré ici : le moteur ne reçoit jamais une map inactive.
          myTreatmentRates: therapist?.treatment_rates_active
            ? therapist.treatment_rates ?? null
            : null,
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
                  {treatmentsLabel(nextRdv, therapist?.id)}{treatmentsLabel(nextRdv, therapist?.id) ? ' · ' : ''}{calculateTotalDuration(nextRdv)} min
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

      {(loading && allBookings.length === 0) ||
      (filteredBookings.length === 0 && nextBeyondWindow.isFetching) ? (
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
                      <div className="who">{b.hotel_name}</div>
                      <div className="what">{treatmentsLabel(b, therapist?.id)}</div>
                      {(b.room_name || toConfirm) && (
                        <div className="meta">
                          {b.room_name || ''}{b.room_name && toConfirm ? ' · ' : ''}{toConfirm ? t('dashboard.toConfirm') : ''}
                        </div>
                      )}
                    </div>
                    <div className="bk-right">
                      <div className="price">{formatPrice(calculateTotalPrice(b), getHotelCurrency(b), { decimals: 0 })}</div>
                      <div className="bk-status">
                        {(b.guest_count || 1) > 1 && (
                          <span className="status info">{acceptedCount(b)}/{b.guest_count}</span>
                        )}
                        <PaymentStatus status={getPaymentDesignStatus(b.payment_status, t)} />
                      </div>
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