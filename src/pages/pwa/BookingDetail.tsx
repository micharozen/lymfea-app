import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction, invokeStripe } from "@/lib/supabaseEdgeFunctions";
import { formatPrice } from "@/lib/formatPrice";
import { Euro, MoreVertical, Trash2, X, User, MessageSquare, Wallet, Loader2, ShieldCheck, UserX, UserMinus, CalendarX, Hourglass, MapPin, DoorOpen, CreditCard, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import i18n from "@/i18n";
import { AddTreatmentDialog } from "./AddTreatmentDialog";
import { ProposeAlternativeDialog } from "./ProposeAlternativeDialog";
import { CancelBookingDialog } from "@/components/booking/CancelBookingDialog";
import { InvoiceSignatureDialog } from "@/components/InvoiceSignatureDialog";
import { PaymentSelectionDrawer } from "@/components/pwa/PaymentSelectionDrawer";
import PwaPageLoader from "@/components/pwa/PageLoader";
import { useIsMounted } from "@/hooks/useIsMounted";
import { useRefetchOnFocus } from "@/hooks/pwa/useRefetchOnFocus";
import { myLegDuration, estimateTherapistShare } from "@/lib/therapistLegDuration";
import { ClientTypeBadge } from "@/components/booking/ClientTypeBadge";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Booking {
  id: string;
  signature_token?: string;
  booking_id: number;
  booking_date: string;
  booking_time: string;
  client_first_name: string;
  booking_therapists?: { status: string }[];
  client_last_name: string;
  hotel_name: string;
  hotel_id: string;
  room_number: string;
  status: string;
  phone: string;
  total_price: number;
  surcharge_amount?: number | null;
  is_out_of_hours?: boolean | null;
  out_of_hours_surcharge_percent?: number | null;
  therapist_id: string | null;
  declined_by?: string[];
  hotel_image_url?: string;
  hotel_address?: string;
  hotel_city?: string;
  client_signature?: string | null;
  client_note?: string | null;
  customer_health_notes?: string | null;
  client_email?: string | null;
  hotel_vat?: number;
  payment_status?: string | null;
  effective_payment_status?: string | null;
  payment_method?: string | null;
  therapist_commission?: number;
  global_therapist_commission?: boolean;
  therapist_rate_75?: number | null;
  therapist_rate_60?: number | null;
  therapist_rate_90?: number | null;
  hotel_currency?: string;
  room_id?: string | null;
  room_name?: string | null;
  duration?: number | null;
  therapist_checked_in_at?: string | null;
  guest_count?: number | null;
  gift_amount_applied_cents?: number | null;
  venue_type?: 'hotel' | 'spa' | null;
  card_brand?: string | null;
  card_last4?: string | null;
  client_type?: string | null;
  bundle_usage_id?: string | null;
}

interface PaymentInfoResult {
  payment_status: string | null;
  card_brand: string | null;
  card_last4: string | null;
}

interface CustomerResult {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  health_notes: string | null;
}

interface BundleUsageResult {
  customer_bundle_id: string;
  customer_treatment_bundles: {
    total_sessions: number;
    used_sessions: number;
    treatment_bundles: { name: string } | null;
  } | null;
}

type PaymentKind = { kind: 'ok' | 'due' | 'warn' | 'info'; label: string };

const getPaymentKind = (paymentStatus?: string | null): PaymentKind | null => {
  if (!paymentStatus) return null;
  switch (paymentStatus) {
    case 'paid': return { kind: 'ok', label: 'Payé' };
    case 'charged_to_room': return { kind: 'info', label: 'Facturé chambre' };
    case 'card_saved': return { kind: 'info', label: 'Carte enregistrée' };
    case 'pending': return { kind: 'due', label: 'Paiement requis' };
    case 'pending_partner_billing': return { kind: 'info', label: 'Paiement partenaire' };
    case 'failed': return { kind: 'warn', label: 'Échoué' };
    default: return null;
  }
};

interface Treatment {
  id: string;
  treatment_id: string;
  therapist_id?: string | null;
  variant_id?: string | null;
  price_override?: number | null;
  treatment_menus: {
    name: string;
    description: string;
    duration: number;
    price: number;
    image?: string;
  } | null;
  treatment_variants?: {
    id: string;
    label?: string | null;
    duration?: number | null;
    price?: number | null;
  } | null;
}

/** Override-aware effective price for a booking treatment line. */
const treatmentLinePrice = (t: Treatment): number =>
  t.price_override ?? t.treatment_variants?.price ?? t.treatment_menus?.price ?? 0;

const PwaBookingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('pwa');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showAddTreatmentDialog, setShowAddTreatmentDialog] = useState(false);
  const [showContactDrawer, setShowContactDrawer] = useState(false);
  const [showUnassignDialog, setShowUnassignDialog] = useState(false);
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);
  const [showAcceptDialog, setShowAcceptDialog] = useState(false);
  const [showProposeAlternativeDialog, setShowProposeAlternativeDialog] = useState(false);
  const [treatmentToDelete, setTreatmentToDelete] = useState<string | null>(null);
  const [showNavigationDrawer, setShowNavigationDrawer] = useState(false);
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [signingLoading, setSigningLoading] = useState(false);
  const [showPaymentSelection, setShowPaymentSelection] = useState(false);
  const [showTapToPayDialog, setShowTapToPayDialog] = useState(false);
  const [tapToPayLoading, setTapToPayLoading] = useState(false);
  const [showHealthFormDialog, setShowHealthFormDialog] = useState(false);
  const [showNoShowDialog, setShowNoShowDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [roomGap, setRoomGap] = useState<{ gapMinutes: number } | null>(null);
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  const [extendLoading, setExtendLoading] = useState(false);
  const [checkInLoading, setCheckInLoading] = useState(false);
  
  const [bundleInfo, setBundleInfo] = useState<{
    bundleName: string;
    remainingSessions: number;
    totalSessions: number;
  } | null>(null);

  const [acceptedTherapistCount, setAcceptedTherapistCount] = useState(0);
  const [hasAlreadyAccepted, setHasAlreadyAccepted] = useState(false);
  const [myTherapistId, setMyTherapistId] = useState<string | null>(null);
  // Accepted therapist ids ordered by assigned_at (stable positional fallback).
  const [orderedTherapistIds, setOrderedTherapistIds] = useState<string[]>([]);
  const isAcceptingRef = useRef(false);
  const isChargingRef = useRef(false);
  const isMountedRef = useIsMounted();

  useEffect(() => {
    let cancelled = false;

    fetchBookingDetail();
    const bookingChannel = supabase
      .channel(`booking-changes-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `id=eq.${id}` }, () => {
        if (!cancelled && isMountedRef.current) fetchBookingDetail();
      })
      .subscribe();
    const therapistsChannel = supabase
      .channel(`booking-therapists-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_therapists', filter: `booking_id=eq.${id}` }, () => {
        if (!cancelled && isMountedRef.current) fetchBookingDetail();
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(bookingChannel);
      supabase.removeChannel(therapistsChannel);
    };
  }, [id]);

  // Re-fetch when the app regains focus (realtime is disabled in prod). The
  // ownership guard inside fetchBookingDetail redirects away if reassigned.
  useRefetchOnFocus(() => {
    fetchBookingDetail();
  });

  // Fetch room gap for margin/extension display
  useEffect(() => {
    const fetchRoomGap = async () => {
      if (!booking?.room_id || !['confirmed', 'ongoing'].includes(booking.status)) {
        if (isMountedRef.current) setRoomGap(null);
        return;
      }
      const dur = booking.duration || treatments.reduce((s, t) => s + (t.treatment_menus?.duration || 0), 0) || 60;
      const [hours, minutes] = booking.booking_time.split(':').map(Number);
      const endMinutes = hours * 60 + minutes + dur;
      const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}:00`;

      const { data, error } = await supabase.rpc('get_room_next_booking_gap', {
        _room_id: booking.room_id,
        _booking_date: booking.booking_date,
        _booking_end_time: endTime,
        _current_booking_id: booking.id,
      });

      if (!isMountedRef.current) return;

      if (!error && data && data.length > 0) {
        setRoomGap({ gapMinutes: data[0].gap_minutes });
      } else {
        setRoomGap(null); // No next booking = no constraint
      }
    };
    fetchRoomGap();
  }, [booking?.id, booking?.room_id, booking?.status, booking?.duration, treatments.length, isMountedRef]);

  const fetchBookingDetail = async () => {
    if (!isMountedRef.current) return;

    try {
      const { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .select("*, booking_therapists(status), booking_payment_infos(payment_status, card_brand, card_last4), customers(first_name, last_name, email, phone, health_notes), treatment_rooms!bookings_trunk_id_fkey(name)")
        .eq("id", id)
        .single();

      if (!isMountedRef.current) return;
        
      if (bookingError) throw bookingError;

      const { data: hotelData } = await supabase.from("hotels").select("*").eq("id", bookingData.hotel_id).single();

      if (!isMountedRef.current) return;

      // Toujours charger les taux du thérapeute CONNECTÉ (pas du thérapeute primaire).
      // Pour un soin duo, chaque thérapeute doit voir ses propres revenus.
      const { data: { user: authUser } } = await supabase.auth.getUser();
      let therapistRates = { rate_60: null as number | null, rate_75: null as number | null, rate_90: null as number | null };
      let myTherapistId: string | null = null;
      if (authUser) {
        const { data: myT } = await supabase
          .from("therapists")
          .select("id, rate_60, rate_75, rate_90")
          .eq("user_id", authUser.id)
          .single();
        if (myT) {
          myTherapistId = myT.id;
          if (isMountedRef.current) setMyTherapistId(myT.id);
          therapistRates = { rate_60: myT.rate_60, rate_75: myT.rate_75, rate_90: myT.rate_90 };
        }
      }

      if (!isMountedRef.current) return;

      const rawPaymentInfos = bookingData.booking_payment_infos as unknown as PaymentInfoResult | PaymentInfoResult[] | null;
      const paymentInfo: PaymentInfoResult | null = Array.isArray(rawPaymentInfos)
        ? (rawPaymentInfos[0] ?? null)
        : rawPaymentInfos;

      const effectivePaymentStatus = bookingData.payment_status === 'paid'
        ? 'paid'
        : (paymentInfo?.payment_status || bookingData.payment_status);

      const customer = (bookingData as unknown as { customers: CustomerResult | null }).customers;
      const treatmentRoom = (bookingData as unknown as { treatment_rooms: { name: string } | null }).treatment_rooms;
      if (!isMountedRef.current) return;

      setBooking({
        ...bookingData,
        room_name: treatmentRoom?.name || null,
        client_first_name: customer?.first_name || bookingData.client_first_name,
        client_last_name: customer?.last_name || bookingData.client_last_name,
        client_email: customer?.email || bookingData.client_email,
        customer_health_notes: customer?.health_notes || null,
        phone: customer?.phone || bookingData.phone,
        hotel_image_url: hotelData?.image,
        hotel_address: hotelData?.address,
        hotel_city: hotelData?.city,
        hotel_vat: hotelData?.vat || 20,
        therapist_commission: hotelData?.therapist_commission || 70,
        global_therapist_commission: hotelData?.global_therapist_commission === true,
        therapist_rate_75: therapistRates.rate_75,
        therapist_rate_60: therapistRates.rate_60,
        therapist_rate_90: therapistRates.rate_90,
        hotel_currency: hotelData?.currency || 'EUR',
        out_of_hours_surcharge_percent: hotelData?.out_of_hours_surcharge_percent ?? null,
        venue_type: hotelData?.venue_type || null,
        card_brand: paymentInfo?.card_brand || null,
        card_last4: paymentInfo?.card_last4 || null,
        effective_payment_status: effectivePaymentStatus
      });

      const { data: trData } = await supabase.from("booking_treatments").select("*, treatment_menus(*), treatment_variants(id, label, duration, price)").eq("booking_id", id);

      if (!isMountedRef.current) return;

      if (trData) setTreatments(trData as Treatment[]);

      const { data: btData } = await supabase
        .from("booking_therapists")
        .select("id, therapist_id, assigned_at")
        .eq("booking_id", id)
        .eq("status", "accepted");

      if (!isMountedRef.current) return;

      const acceptedRows = (btData ?? []) as { therapist_id: string; assigned_at: string | null }[];
      const isAcceptedParticipant = myTherapistId
        ? acceptedRows.some((bt) => bt.therapist_id === myTherapistId)
        : false;

      setAcceptedTherapistCount(acceptedRows.length);
      setHasAlreadyAccepted(isAcceptedParticipant);
      setOrderedTherapistIds(
        [...acceptedRows]
          .sort((a, b) => (a.assigned_at || "").localeCompare(b.assigned_at || ""))
          .map((bt) => bt.therapist_id),
      );

      // Booking no longer belongs to the connected therapist (e.g. reassigned by
      // an admin while the app was open / opened from a stale push notification).
      // Pending/awaiting bookings stay visible as open requests.
      const isOpenRequest = bookingData.status === "pending";
      const isMine = bookingData.therapist_id === myTherapistId || isAcceptedParticipant;
      if (myTherapistId && !isOpenRequest && !isMine) {
        if (isMountedRef.current) {
          toast.info(t('bookingDetail.reassignedAway'));
          navigate("/pwa/dashboard", { state: { forceRefresh: true } });
        }
        return;
      }

      // Fetch bundle info if booking has a bundle_usage_id
      const bundleUsageId = bookingData.bundle_usage_id;
      if (bundleUsageId) {
        const { data: usageData } = await supabase
          .from("bundle_session_usages")
          .select("customer_bundle_id, customer_treatment_bundles(total_sessions, used_sessions, treatment_bundles(name))")
          .eq("id", bundleUsageId)
          .single();

        if (!isMountedRef.current) return;

        if (usageData) {
          const customerBundle = (usageData as unknown as BundleUsageResult).customer_treatment_bundles;
          const bundleName = customerBundle?.treatment_bundles?.name || "";
          const total = customerBundle?.total_sessions || 0;
          const used = customerBundle?.used_sessions || 0;
          setBundleInfo({ bundleName, remainingSessions: total - used, totalSessions: total });
        }
      } else {
        setBundleInfo(null);
      }

    } catch (error) {
      console.error(error);
      if (isMountedRef.current) {
        toast.error(t('common:errors.generic'));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleSignatureConfirm = async (signatureData: string) => {
    if (!booking) return;
    setSigningLoading(true);
    try {
      const { error } = await supabase.from("bookings").update({
        client_signature: signatureData,
        signed_at: new Date().toISOString(),
        status: "completed",
      }).eq("id", booking.id);
      if (error) throw error;
      toast.success(t('bookingDetail.completed'));
      navigate("/pwa/dashboard", { state: { forceRefresh: true } });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('common:errors.generic'));
    } finally {
      setSigningLoading(false);
    }
  };

  const handleSkipSignature = async () => {
    if (!booking) return;
    setSigningLoading(true);
    try {
      const { error } = await supabase.from("bookings").update({
        status: "completed",
      }).eq("id", booking.id);
      if (error) throw error;
      toast.success(t('bookingDetail.completed'));
      navigate("/pwa/dashboard", { state: { forceRefresh: true } });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('common:errors.generic'));
    } finally {
      setSigningLoading(false);
    }
  };

  const handleChargeSavedCard = async (amount: number) => {
    if (!booking || updating || isChargingRef.current) return;
    isChargingRef.current = true;
    setUpdating(true);
    try {
      const { data, error } = await invokeStripe<{ success?: boolean; error?: string }>('charge-saved-card', {
        bookingId: booking.id,
        hotelId: booking.hotel_id,
        finalAmount: amount,
      });
      if (error || !data?.success) throw new Error(data?.error || "Échec débit");
      toast.success("Carte débitée avec succès !");
      navigate("/pwa/dashboard", { state: { forceRefresh: true } });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur débit");
    } finally {
      isChargingRef.current = false;
      setUpdating(false);
    }
  };

  const handleAcceptBooking = async () => {
    if (!booking || updating || isAcceptingRef.current) return;
    isAcceptingRef.current = true;
    setUpdating(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: tData, error: tError } = await supabase.from("therapists").select("id, first_name, last_name").eq("user_id", user?.id).single();
        
      if (tError || !tData) throw new Error("Profil thérapeute non trouvé");

      const treatmentsPrice = treatments.reduce((s, t) => s + treatmentLinePrice(t), 0);
      const finalPrice = Math.max(booking.total_price || 0, treatmentsPrice);

      const { data: rpcResult, error: rpcError } = await supabase.rpc('accept_booking', {
        _booking_id: booking.id,
        _hairdresser_id: tData.id,
        _hairdresser_name: `${tData.first_name} ${tData.last_name}`,
        _total_price: finalPrice,
      });
      if (rpcError) throw new Error(t('bookingDetail.acceptError'));
      if (!rpcResult?.success) {
        const err = rpcResult?.error;
        if (err === 'already_taken' || err === 'fully_staffed') {
          toast.error(t('bookingDetail.alreadyTaken'));
          navigate("/pwa/dashboard", { state: { forceRefresh: true } });
          return;
        }
        if (err === 'already_accepted') throw new Error(t('bookingDetail.alreadyAccepted'));
        throw new Error(t('bookingDetail.acceptError'));
      }

      // Send confirmation only when all therapists have accepted (booking is now confirmed)
      if (rpcResult?.data?.status === 'confirmed') {
        invokeEdgeFunction('notify-booking-confirmed', { body: { bookingId: booking.id } }).catch(() => {});
      }
      
      toast.success(t('bookingDetail.accepted'));
      navigate("/pwa/dashboard", { state: { forceRefresh: true } });

    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('common:errors.generic'));
    } finally {
      isAcceptingRef.current = false;
      setUpdating(false);
    }
  };

  const handleDeleteTreatment = async (treatmentId: string) => {
    if (!booking) return;
    setUpdating(true);
    try {
      const found = treatments.find(t => t.id === treatmentId);
      const deletedPrice = found ? treatmentLinePrice(found) : 0;
      const { data, error } = await supabase.from("booking_treatments").delete().eq("id", treatmentId).select();
      if (error || !data?.length) throw new Error("Suppression impossible (RLS ?)");

      const newTotal = Math.max(0, (booking.total_price || 0) - deletedPrice);
      await supabase.from("bookings").update({ total_price: newTotal }).eq("id", id);
      
      toast.success(t('bookingDetail.treatmentDeleted'));
      setTreatmentToDelete(null);
      fetchBookingDetail();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('common:errors.generic'));
    } finally {
      setUpdating(false);
    }
  };

  const handleUnassignBooking = async () => {
    if (!booking) return;
    setUpdating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: tData } = await supabase.from("therapists").select("id").eq("user_id", user?.id).single();
      const { error } = await supabase.rpc('unassign_booking', { _booking_id: booking.id, _hairdresser_id: tData?.id });
      if (error) throw error;
      toast.success(t('bookingDetail.unassigned'));
      navigate("/pwa/dashboard", { state: { forceRefresh: true } });
    } catch (error) {
      toast.error("Erreur désassignation");
    } finally {
      setUpdating(false);
    }
  };

  const handleDeclineBooking = async () => {
    if (!booking || updating) return;
    setUpdating(true);
    try {
      // Appel de notre nouvelle fonction RPC sécurisée
      const { error } = await supabase.rpc('decline_booking', {
        _booking_id: booking.id
      });
      
      if (error) throw error;

      // Re-trigger notifications so the fallback gender group gets notified if all priority therapists have declined
      invokeEdgeFunction('trigger-new-booking-notifications', { body: { bookingId: booking.id, notifyAll: true } }).catch(() => {});

      toast.success("Réservation refusée.");
      navigate("/pwa/dashboard", { state: { forceRefresh: true } });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur lors du refus");
    } finally {
      setUpdating(false);
      setShowDeclineDialog(false);
    }
  };

  const handleNoShow = async () => {
    if (!booking || updating) return;
    setUpdating(true);
    try {
      const { data, error } = await invokeEdgeFunction<{ bookingId: string; reason?: string }, { success?: boolean; error?: string }>(
        "mark-booking-noshow",
        {
          body: { bookingId: booking.id },
        },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(t('bookingDetail.noShowSuccess'));
      navigate("/pwa/dashboard", { state: { forceRefresh: true } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('common:errors.generic');
      toast.error(message);
    } finally {
      setUpdating(false);
      setShowNoShowDialog(false);
    }
  };

  const handleCheckIn = async () => {
    if (!booking || checkInLoading) return;
    setCheckInLoading(true);
    try {
      const { error } = await supabase.from("bookings").update({
        therapist_checked_in_at: new Date().toISOString(),
      }).eq("id", booking.id);
      if (error) throw error;

      // Get therapist name for the notification
      const { data: { user } } = await supabase.auth.getUser();
      const { data: tData } = await supabase.from("therapists").select("first_name, last_name").eq("user_id", user?.id).single();
      const therapistName = tData ? `${tData.first_name} ${tData.last_name}` : '';

      await invokeEdgeFunction('notify-therapist-arrived', { body: { bookingId: booking.id, therapistName } });
      toast.success(t('bookingDetail.arrivedSuccess'));
      fetchBookingDetail();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('common:errors.generic');
      toast.error(message);
    } finally {
      setCheckInLoading(false);
    }
  };

  const handleExtendBooking = async (extensionMinutes: number) => {
    if (!booking || extendLoading) return;
    setExtendLoading(true);
    try {
      const currentDuration = booking.duration || treatments.reduce((s, t) => s + (t.treatment_menus?.duration || 0), 0) || 60;
      const currentPrice = Math.max(booking.total_price || 0, treatments.reduce((s, t) => s + treatmentLinePrice(t), 0));
      const pricePerMinute = currentPrice / currentDuration;
      const extensionPrice = Math.round(pricePerMinute * extensionMinutes * 100) / 100;

      const { error } = await supabase.from("bookings").update({
        duration: currentDuration + extensionMinutes,
        total_price: currentPrice + extensionPrice,
      }).eq("id", booking.id);

      if (error) throw error;
      toast.success(t('bookingDetail.extendSuccess', { minutes: extensionMinutes }));
      setShowExtendDialog(false);
      fetchBookingDetail();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('common:errors.generic');
      toast.error(message);
    } finally {
      setExtendLoading(false);
    }
  };

  const handleTapToPayConfirm = async () => {
    if (!booking) return;
    setTapToPayLoading(true);
    try {
      const { error } = await invokeEdgeFunction('mark-tap-to-pay-paid', { body: { booking_id: booking.id, final_amount: totalPrice } });
      if (error) throw error;
      toast.success("Paiement validé !");
      navigate("/pwa/dashboard", { state: { forceRefresh: true } });
    } catch (error) {
      toast.error("Erreur paiement");
    } finally {
      setTapToPayLoading(false);
    }
  };

  if (loading && !booking) return <PwaPageLoader title={t('bookingDetail.myBooking')} showBack backPath="/pwa/dashboard" />;
  if (!booking) return <div className="flex h-screen items-center justify-center">RDV non trouvé</div>;

  const treatmentsTotalPrice = treatments.reduce((sum, t) => sum + treatmentLinePrice(t), 0);
  const grossPrice = Math.max(booking.total_price || 0, treatmentsTotalPrice);
  const giftAppliedCents = booking.gift_amount_applied_cents || 0;
  const totalPrice = Math.max(0, grossPrice - giftAppliedCents / 100);
  const totalDuration = (booking.duration ?? 0) > 0 ? booking.duration! : (treatments.reduce((s, t) => s + (t.treatment_menus?.duration || 0), 0) || 60);
  const totalHT = totalPrice / (1 + (booking.hotel_vat || 20) / 100);
  // Mode taux fixes (global_therapist_commission = false) : chaque thérapeute
  // gagne son propre taux pour sa durée de travail, indépendamment du prix total.
  // Mode commission % (global_therapist_commission = true) : chaque thérapeute
  // gagne son % sur sa part du total (total / guest_count pour les duos).
  // Out-of-hours surcharge uplift (venue percent), applied to the fixed-rate estimate.
  const surchargePercent = booking.is_out_of_hours
    ? (Number(booking.out_of_hours_surcharge_percent) || 0)
    : 0;
  const estimatedEarnings = (() => {
    const gc = Math.max(booking.guest_count || 1, 1);
    // Duo: pay on my own leg — my soin plus the add-ons hanging off it. Stable link
    // (booking_treatments.therapist_id) when present, positional fallback otherwise.
    // Solo: the full booking duration.
    const legDuration = gc > 1
      ? myLegDuration(
          myTherapistId ?? "",
          treatments.map((t) => ({
            therapist_id: t.therapist_id ?? null,
            duration: t.treatment_variants?.duration ?? t.treatment_menus?.duration ?? null,
            is_addon: t.is_addon ?? false,
          })),
          orderedTherapistIds,
          gc,
        )
      : totalDuration;
    return estimateTherapistShare({
      globalTherapistCommission: booking.global_therapist_commission,
      guestCount: gc,
      legDuration,
      myRates: {
        rate_60: booking.therapist_rate_60 ?? null,
        rate_75: booking.therapist_rate_75 ?? null,
        rate_90: booking.therapist_rate_90 ?? null,
      },
      grossPrice,
      therapistCommissionPercent: booking.therapist_commission ?? null,
      surchargePercent,
    });
  })();

  const locale = i18n.language?.startsWith('en') ? enUS : fr;
  const payKind = getPaymentKind(booking.effective_payment_status);
  const acceptedTotal = booking.booking_therapists?.filter((bt) => bt.status === 'accepted').length || 0;
  const isToday = booking.booking_date === format(new Date(), "yyyy-MM-dd");
  const isConfirmed = booking.status === "confirmed";
  const isPaidLike = ['paid', 'charged_to_room', 'pending_partner_billing'].includes(booking.effective_payment_status || '');
  const canExtend = ['confirmed', 'ongoing'].includes(booking.status) && !!booking.room_id && (!roomGap || roomGap.gapMinutes >= 15);

  const goBack = () => {
    const from = (location.state as { from?: string } | null)?.from;
    if (from) navigate(from);
    else if (window.history.length > 1) navigate(-1);
    else navigate('/pwa/dashboard');
  };

  return (
    <div className="app-refonte flex flex-1 flex-col h-full overflow-hidden">
      <div className="sub-hdr" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
        <button className="back-btn" onClick={goBack} aria-label={t('common:back', 'Retour')}>
          <ChevronLeft size={18} />
        </button>
        <span className="ttl">
          {booking.status === 'pending' ? t('bookingDetail.request', 'Demande') : t('bookingDetail.booking', 'Réservation')}{' '}
          <span style={{ color: 'var(--ink-mute)', fontWeight: 500 }}>#{booking.booking_id}</span>
        </span>
        {booking.status !== 'pending' ? (
          <button className="back-btn" onClick={() => setShowContactDrawer(true)} aria-label={t('common:more', 'Plus')}>
            <MoreVertical size={18} />
          </button>
        ) : (
          <span style={{ width: 38 }} />
        )}
      </div>
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 170 }}>
        {/* En-tête lieu */}
        <div className="fiche-head">
          <div className="venue">{booking.hotel_name}</div>
          {(booking.hotel_address || booking.hotel_city) && (
            <div className="addr">{[booking.hotel_address, booking.hotel_city].filter(Boolean).join(', ')}</div>
          )}
          <div className="statusline">
            {payKind && <span className={'status ' + payKind.kind}><span className="dot" />{payKind.label}</span>}
            {(booking.guest_count || 1) > 1 && (
              <span className={'status ' + (acceptedTotal >= (booking.guest_count || 1) ? 'ok' : 'warn')}><span className="dot" />{t('bookingDetail.duoAccepted', { accepted: acceptedTotal, total: booking.guest_count })}</span>
            )}
            {bundleInfo && <span className="status due"><span className="dot" />{t('bundleSession')}</span>}
          </div>
          {bundleInfo && (
            <div className="addr" style={{ marginTop: 6 }}>
              {bundleInfo.bundleName} — {t('bundleRemaining', { remaining: bundleInfo.remainingSessions, total: bundleInfo.totalSessions })}
            </div>
          )}
        </div>

        {/* Date / Heure / Durée */}
        <div className="fiche-when">
          <div className="cell"><div className="v">{format(new Date(booking.booking_date), "EEE d MMM", { locale })}</div><div className="l">{t('booking.date')}</div></div>
          <div className="cell"><div className="v">{booking.booking_time.substring(0, 5)}</div><div className="l">{t('booking.time')}</div></div>
          <div className="cell"><div className="v">{totalDuration} min</div><div className="l">{t('booking.duration')}</div></div>
        </div>

        {/* Infos client */}
        <div className="info-list">
          <div className="info-row">
            <span className="ic"><User size={18} /></span>
            <span className="lab">{t('bookingDetail.client', 'Client')}</span>
            <span className="val">
              {booking.client_last_name
                ? `${booking.client_first_name?.[0] ? booking.client_first_name[0].toUpperCase() + '. ' : ''}${booking.client_last_name}`
                : booking.client_first_name}
              {booking.client_type && (
                <span style={{ display: 'inline-flex', marginLeft: 6, verticalAlign: 'middle' }}>
                  <ClientTypeBadge clientType={booking.client_type} size="sm" />
                </span>
              )}
            </span>
          </div>
          {booking.room_number && (
            <div className="info-row">
              <span className="ic"><DoorOpen size={18} /></span>
              <span className="lab">{t('bookingDetail.roomLabel', 'Chambre')}</span>
              <span className="val">{booking.room_number}</span>
            </div>
          )}
          {booking.room_name && (
            <div className="info-row">
              <span className="ic"><MapPin size={18} /></span>
              <span className="lab">{t('bookingDetail.roomTreatment', 'Salle')}</span>
              <span className="val">{booking.room_name}</span>
            </div>
          )}
          {['confirmed', 'ongoing'].includes(booking.status) && booking.room_id && (
            <div className="info-row">
              <span className="ic"><Hourglass size={18} /></span>
              <span className="lab">{t('bookingDetail.afterLabel', 'Après')}</span>
              <span className="val">{roomGap ? t('bookingDetail.marginMinutes', { minutes: roomGap.gapMinutes }) : t('bookingDetail.noConstraint')}</span>
            </div>
          )}
          {booking.client_note && (
            <div className="info-row">
              <span className="ic"><MessageSquare size={18} /></span>
              <span className="lab">{t('bookingDetail.noteLabel', 'Note')}</span>
              <span className="val" style={{ fontStyle: 'italic', fontWeight: 400 }}>{booking.client_note}</span>
            </div>
          )}
          {booking.customer_health_notes && (
            <div className="info-row">
              <span className="ic"><MessageSquare size={18} /></span>
              <span className="lab">{t('bookingDetail.healthLabel', 'Santé')}</span>
              <span className="val" style={{ fontStyle: 'italic', fontWeight: 400, whiteSpace: 'pre-wrap' }}>{booking.customer_health_notes}</span>
            </div>
          )}
        </div>

        {/* Honoraires */}
        <div className="fee-row">
          <Wallet size={20} />
          <span className="t">{t('bookingDetail.yourEarnings')}</span>
          <span className="v">{formatPrice(estimatedEarnings, booking.hotel_currency)}</span>
        </div>

        {/* Carte pré-enregistrée */}
        {booking.effective_payment_status === 'card_saved' && (
          <div className="info-list" style={{ marginTop: 12 }}>
            <div className="info-row">
              <span className="ic"><CreditCard size={18} /></span>
              <span className="val">
                {t('bookingDetail.savedCard', 'Carte pré-enregistrée')}
                <small>
                  {booking.card_brand && booking.card_last4
                    ? `${booking.card_brand.charAt(0).toUpperCase() + booking.card_brand.slice(1)} •••• ${booking.card_last4} — débitée à la finalisation`
                    : 'Sera débitée à la finalisation de la prestation'}
                </small>
              </span>
            </div>
          </div>
        )}

        {/* Avant la séance */}
        {isConfirmed && (() => {
          const items: { key: string; done: boolean; icon: JSX.Element; title: string; sub: string; onClick: () => void }[] = [];
          if (!isPaidLike && booking.effective_payment_status !== 'card_saved') {
            items.push({ key: 'pay', done: false, icon: <Euro size={14} />, title: t('bookingDetail.checklistPay', 'Paiement à encaisser'), sub: formatPrice(totalPrice, booking.hotel_currency), onClick: () => setShowPaymentSelection(true) });
          }
          items.push({ key: 'waiver', done: !!booking.client_signature, icon: <ShieldCheck size={14} />, title: t('bookingDetail.healthForm'), sub: booking.client_signature ? t('bookingDetail.waiverSigned') : t('bookingDetail.healthFormHint'), onClick: () => { if (!booking.client_signature) setShowHealthFormDialog(true); } });
          if (isToday) {
            items.push({ key: 'presence', done: !!booking.therapist_checked_in_at, icon: <MapPin size={14} />, title: t('bookingDetail.arrived'), sub: booking.therapist_checked_in_at ? t('bookingDetail.arrivedAt', { time: format(new Date(booking.therapist_checked_in_at), "HH:mm") }) : t('bookingDetail.presenceHint', 'Signalez votre arrivée'), onClick: () => { if (!booking.therapist_checked_in_at) handleCheckIn(); } });
          }
          return (
            <>
              <div className="sec-label">{t('bookingDetail.beforeSession', 'Avant la séance')}</div>
              <div className="check-list">
                {items.map((c) => (
                  <button className="check-item" key={c.key} onClick={c.onClick}>
                    <span className={'st ' + (c.done ? 'done' : 'todo')}>{c.done ? <Check size={14} /> : c.icon}</span>
                    <span className="tx"><span className="t">{c.title}</span><span className="s">{c.sub}</span></span>
                    <span className="go"><ChevronRight size={16} /></span>
                  </button>
                ))}
              </div>
            </>
          );
        })()}

        {/* Prolonger la séance */}
        {canExtend && (
          <button className="quiet-row" onClick={() => setShowExtendDialog(true)} style={{ marginTop: 12 }}>
            <Hourglass size={18} />
            {t('bookingDetail.extendCta', 'Prolonger la séance')}
            <span className="chev"><ChevronRight size={16} /></span>
          </button>
        )}

        {/* Soins */}
        <div className="sec-label">
          {t('bookingDetail.treatments', 'Soins')} · {treatments.length}
          {isConfirmed && <button className="sec-action" onClick={() => setShowAddTreatmentDialog(true)}>+ {t('bookingDetail.add', 'Ajouter')}</button>}
        </div>
        <div className="card">
          {treatments.map((tr) => {
            const effectiveDuration = tr.treatment_variants?.duration ?? tr.treatment_menus?.duration;
            const variantLabel = tr.treatment_variants?.label;
            // La durée a déjà sa propre colonne : on n'affiche le label de variante
            // que s'il apporte une info autre qu'une durée (ex. « Dos », « Corps »).
            const showVariant = variantLabel && !/^\s*\d+\s*(min|minutes|mn|')?\s*$/i.test(variantLabel);
            return (
              <div key={tr.id} className="soin-row">
                <span className="nm">{tr.treatment_menus?.name}{showVariant ? ` · ${variantLabel}` : ''}</span>
                <span className="dur">{effectiveDuration} min</span>
                <span className="pr">{formatPrice(treatmentLinePrice(tr), booking.hotel_currency)}</span>
                {booking.status !== "completed" && (
                  <button onClick={() => setTreatmentToDelete(tr.id)} aria-label={t('bookingDetail.deleteTreatment', 'Supprimer')} style={{ background: 'none', border: 'none', color: 'var(--clay)', padding: 0, display: 'flex' }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
          <div className="soin-row" style={{ background: 'var(--sand-100)' }}>
            <span className="nm" style={{ fontWeight: 600 }}>{t('bookingDetail.clientTotal', 'Total client')}</span>
            <span className="pr" style={{ fontSize: 17 }}>{formatPrice(totalPrice, booking.hotel_currency)}</span>
          </div>
        </div>

        {((booking.is_out_of_hours && (booking.surcharge_amount ?? 0) > 0) || giftAppliedCents > 0) && (
          <div style={{ margin: '8px 16px 0', fontSize: 12, color: 'var(--ink-mute)' }}>
            {booking.is_out_of_hours && (booking.surcharge_amount ?? 0) > 0 && (
              <div>
                {t('bookingDetail.outOfHoursSurcharge')}
                {booking.out_of_hours_surcharge_percent ? ` (+${booking.out_of_hours_surcharge_percent}%)` : ''} +{formatPrice(booking.surcharge_amount!, booking.hotel_currency)}
              </div>
            )}
            {giftAppliedCents > 0 && <div>-{formatPrice(giftAppliedCents / 100, booking.hotel_currency)} {t('bookingDetail.giftCard', 'carte cadeau')}</div>}
          </div>
        )}
      </div>

      <div
        className="fiche-foot"
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30, paddingBottom: 'calc(18px + env(safe-area-inset-bottom))' }}
      >
        {booking.status === "pending" && (booking.guest_count ?? 1) > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, padding: '10px 14px', borderRadius: 14, background: 'var(--gold-soft)', color: 'var(--gold-deep)' }}>
            <Hourglass size={16} />
            <span style={{ fontSize: 12, fontWeight: 500 }}>
              {t('bookingDetail.duoTherapistsJoined', { accepted: acceptedTherapistCount, total: booking.guest_count ?? 2 })}
            </span>
          </div>
        )}
        {(booking.status === "pending" && (booking.guest_count ?? 1) <= 1 && (!booking.therapist_id || booking.therapist_id === myTherapistId)) ||
         (booking.status === "pending" && (booking.guest_count ?? 1) > 1 && !hasAlreadyAccepted) ? (
          <>
            <button className="btn-primary-lg" onClick={handleAcceptBooking} disabled={updating}>
              {(booking.guest_count ?? 1) > 1 ? t('bookingDetail.duoJoin') : t('dashboard.accept')}
            </button>
            <button className="btn-ghost" onClick={() => setShowDeclineDialog(true)}>
              {t('bookingDetail.declineCta', 'Refuser cette demande')}
            </button>
          </>
        ) : booking.status === "pending" && (booking.guest_count ?? 1) > 1 && hasAlreadyAccepted ? (
          <div style={{ textAlign: 'center', padding: 12, borderRadius: 999, border: '1px solid var(--line)', color: 'var(--ink-soft)', fontSize: 14, fontWeight: 500 }}>
            {t('bookingDetail.duoWaiting')}
          </div>
        ) : ['confirmed', 'ongoing'].includes(booking.status) ? (
          booking.effective_payment_status === 'card_saved' ? (
            <button
              className="btn-primary-lg"
              onClick={() => handleChargeSavedCard(totalPrice)}
              disabled={updating}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 500 }}
            >
              {updating ? <Loader2 className="animate-spin" size={18} /> : <Wallet size={18} />}
              {t('bookingDetail.finalize', 'Finaliser la prestation')} ({formatPrice(totalPrice, booking.hotel_currency)})
            </button>
          ) : !isPaidLike ? (
            <button className="btn-primary-lg" onClick={() => setShowPaymentSelection(true)} style={{ fontWeight: 500 }}>
              {t('bookingDetail.finalize', 'Finaliser la prestation')}
            </button>
          ) : (
            <button className="btn-primary-lg" onClick={() => setShowSignatureDialog(true)}>
              {t('bookingDetail.finish', 'Terminer la prestation')}
            </button>
          )
        ) : null}
      </div>

      <Drawer open={showContactDrawer} onOpenChange={setShowContactDrawer}>
        <DrawerContent className="app-refonte pb-safe">
          <div className="act-sheet">
            <div className="act-hdr">{t('bookingDetail.manageBooking', 'Gérer la réservation')}</div>
            <button onClick={() => { setShowContactDrawer(false); setShowNoShowDialog(true); }} className="act-row warn">
              <span className="ic"><UserX size={18} /></span>
              <span className="tx">
                <span className="t">{t('bookingDetail.noShow')}</span>
                <span className="s">{t('bookingDetail.noShowRowHint', "Le client ne s'est pas présenté")}</span>
              </span>
            </button>
            {/* <button onClick={() => { setShowContactDrawer(false); setShowUnassignDialog(true); }} className="act-row">
              <span className="ic"><UserMinus size={18} /></span>
              <span className="tx">
                <span className="t">{t('bookingDetail.unassignBooking')}</span>
                <span className="s">{t('bookingDetail.unassignRowHint', "La réservation sera proposée à d'autres thérapeutes")}</span>
              </span>
            </button> */}
            {['pending', 'confirmed'].includes(booking.status) && (
              <button onClick={() => { setShowContactDrawer(false); setShowCancelDialog(true); }} className="act-row danger">
                <span className="ic"><CalendarX size={18} /></span>
                <span className="tx">
                  <span className="t">{t('booking.cancelBooking')}</span>
                  <span className="s">{t('bookingDetail.cancelRowHint', 'Annulation définitive de la réservation')}</span>
                </span>
              </button>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <AddTreatmentDialog open={showAddTreatmentDialog} onOpenChange={setShowAddTreatmentDialog} bookingId={booking.id} hotelId={booking.hotel_id} onTreatmentsAdded={fetchBookingDetail} />
      <InvoiceSignatureDialog
        open={showHealthFormDialog}
        onOpenChange={setShowHealthFormDialog}
        onConfirm={async (signatureData: string) => {
          try {
            const { error } = await supabase.from("bookings").update({
              client_signature: signatureData,
              signed_at: new Date().toISOString(),
            }).eq("id", booking.id);
            if (error) throw error;
            toast.success(t('bookingDetail.waiverSaved'));
            fetchBookingDetail();
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : t('common:errors.generic');
            toast.error(message);
          }
        }}
        signatureToken={booking.signature_token}
        loading={false}
        treatments={treatments.map(t => ({ name: (t.treatment_menus?.name || "") + (t.treatment_variants?.label ? ` · ${t.treatment_variants.label}` : ""), duration: t.treatment_variants?.duration ?? t.treatment_menus?.duration ?? 0, price: treatmentLinePrice(t) }))}
        vatRate={booking.hotel_vat || 20}
        totalPrice={totalPrice}
        isAlreadyPaid={true}
      />
      <InvoiceSignatureDialog
        open={showSignatureDialog}
        onOpenChange={setShowSignatureDialog}
        onConfirm={handleSignatureConfirm}
        onSkip={handleSkipSignature}
        signatureToken={booking.signature_token}
        loading={signingLoading} 
        treatments={treatments.map(t => ({ name: (t.treatment_menus?.name || "") + (t.treatment_variants?.label ? ` · ${t.treatment_variants.label}` : ""), duration: t.treatment_variants?.duration ?? t.treatment_menus?.duration ?? 0, price: treatmentLinePrice(t) }))} 
        vatRate={booking.hotel_vat || 20} 
        totalPrice={totalPrice} 
        isAlreadyPaid={booking.effective_payment_status === 'paid' || booking.effective_payment_status === 'card_saved'} 
      />
      <PaymentSelectionDrawer open={showPaymentSelection} onOpenChange={setShowPaymentSelection} bookingId={booking.id} hotelId={booking.hotel_id} bookingNumber={booking.booking_id} totalPrice={totalPrice} currency={booking.hotel_currency} treatments={treatments.map(t => ({ name: (t.treatment_menus?.name || "") + (t.treatment_variants?.label ? ` · ${t.treatment_variants.label}` : ""), duration: t.treatment_variants?.duration ?? t.treatment_menus?.duration ?? 0, price: t.treatment_variants?.price ?? t.treatment_menus?.price ?? 0 }))} vatRate={booking.hotel_vat || 20} venueType={booking.venue_type} roomNumber={booking.room_number} onPaymentComplete={fetchBookingDetail} onTapToPayRequested={() => { setShowPaymentSelection(false); setShowTapToPayDialog(true); }} hasSavedCard={booking.effective_payment_status === 'card_saved'} />
      
      <AlertDialog open={!!treatmentToDelete} onOpenChange={() => setTreatmentToDelete(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Supprimer ?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Non</AlertDialogCancel><AlertDialogAction onClick={() => treatmentToDelete && handleDeleteTreatment(treatmentToDelete)}>Oui</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={showUnassignDialog} onOpenChange={setShowUnassignDialog}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Désassigner ?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Non</AlertDialogCancel><AlertDialogAction onClick={handleUnassignBooking}>Confirmer</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <Drawer open={showExtendDialog} onOpenChange={setShowExtendDialog}>
        <DrawerContent className="pb-safe">
          <div className="p-4 space-y-3">
            <p className="text-sm font-semibold text-center">{t('bookingDetail.extendTitle')}</p>
            {[15, 30].filter(m => !roomGap || roomGap.gapMinutes >= m).map(minutes => {
              const pricePerMin = totalPrice / totalDuration;
              const extPrice = Math.round(pricePerMin * minutes * 100) / 100;
              return (
                <button
                  key={minutes}
                  onClick={() => handleExtendBooking(minutes)}
                  disabled={extendLoading}
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-xl w-full font-medium text-sm disabled:opacity-50"
                >
                  <span>+{minutes} min</span>
                  <span className="text-primary font-bold">+{formatPrice(extPrice, booking.hotel_currency)}</span>
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={showNoShowDialog} onOpenChange={setShowNoShowDialog}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('bookingDetail.noShowTitle')}</AlertDialogTitle><AlertDialogDescription>{t('bookingDetail.noShowDesc')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('bookingDetail.keepBooking')}</AlertDialogCancel><AlertDialogAction onClick={handleNoShow} disabled={updating}>{t('bookingDetail.noShowConfirm')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

      <Drawer open={showDeclineDialog} onOpenChange={setShowDeclineDialog}>
        <DrawerContent className="pb-safe">
          <div className="p-4 space-y-3">
            <p className="text-sm font-semibold text-center">Refuser cette réservation ?</p>
            <button
              onClick={() => { setShowDeclineDialog(false); handleDeclineBooking(); }}
              disabled={updating}
              className="flex items-center gap-3 p-4 bg-destructive/10 text-destructive rounded-xl w-full font-medium text-sm disabled:opacity-50"
            >
              <X className="w-5 h-5 shrink-0" />
              Refuser
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      <ProposeAlternativeDialog
        open={showProposeAlternativeDialog}
        onOpenChange={setShowProposeAlternativeDialog}
        booking={{
          id: booking.id,
          booking_date: booking.booking_date,
          booking_time: booking.booking_time,
          client_first_name: booking.client_first_name,
          client_last_name: booking.client_last_name,
          phone: booking.phone,
        }}
        onProposalSent={() => navigate("/pwa/dashboard", { state: { forceRefresh: true } })}
      />

      <CancelBookingDialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onSuccess={() => {
          setShowCancelDialog(false);
          navigate("/pwa/bookings");
        }}
        bookingId={booking.id}
        booking={{
          booking_id: booking.booking_id,
          client_first_name: booking.client_first_name,
          client_last_name: booking.client_last_name,
          total_price: Number(booking.total_price),
          hotel_id: booking.hotel_id,
          status: booking.status,
          payment_method: booking.payment_method,
          payment_status: booking.effective_payment_status ?? booking.payment_status,
          booking_date: booking.booking_date,
          booking_time: booking.booking_time,
        }}
        userRole="therapist"
      />
    </div>
  );
};

export default PwaBookingDetail;