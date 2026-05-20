import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction, invokeStripe } from "@/lib/supabaseEdgeFunctions";
import { formatPrice } from "@/lib/formatPrice";
import { Calendar, Clock, Timer, Euro, MoreVertical, Trash2, Navigation, X, User, Hotel, MessageCircle, Pen, MessageSquare, Wallet, Loader2, Package, CalendarDays, ShieldCheck, FileCheck, UserX, Hourglass, Plus, MapPin, DoorOpen, Users, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { AddTreatmentDialog } from "./AddTreatmentDialog";
import { ProposeAlternativeDialog } from "./ProposeAlternativeDialog";
import { CancelBookingDialog } from "@/components/booking/CancelBookingDialog";
import { InvoiceSignatureDialog } from "@/components/InvoiceSignatureDialog";
import { PaymentSelectionDrawer } from "@/components/pwa/PaymentSelectionDrawer";
import PwaHeader from "@/components/pwa/Header";
import PwaPageLoader from "@/components/pwa/PageLoader";
import { computeTherapistEarnings } from "@/lib/therapistEarnings";
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
  therapist_id: string | null;
  declined_by?: string[];
  hotel_image_url?: string;
  hotel_address?: string;
  hotel_city?: string;
  client_signature?: string | null;
  client_note?: string | null;
  client_email?: string | null;
  hotel_vat?: number;
  payment_status?: string | null;
  effective_payment_status?: string | null;
  payment_method?: string | null;
  therapist_commission?: number;
  global_therapist_commission?: boolean;
  therapist_hourly_rate?: number | null;
  therapist_rate_45?: number | null;
  therapist_rate_60?: number | null;
  therapist_rate_90?: number | null;
  hotel_currency?: string;
  room_id?: string | null;
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
}

interface BundleUsageResult {
  customer_bundle_id: string;
  customer_treatment_bundles: {
    total_sessions: number;
    used_sessions: number;
    treatment_bundles: { name: string } | null;
  } | null;
}

const getPaymentStatusBadge = (paymentStatus?: string | null) => {
  if (!paymentStatus) return null;
  switch (paymentStatus) {
    case 'paid': return { label: 'Payé', className: 'bg-green-100 text-green-700' };
    case 'charged_to_room': return { label: 'Facturé chambre', className: 'bg-blue-100 text-blue-700' };
    case 'card_saved': return { label: 'Carte enregistrée', className: 'bg-purple-100 text-purple-700' };
    case 'pending': return { label: 'Paiement requis', className: 'bg-yellow-100 text-yellow-700' };
    case 'pending_partner_billing': return { label: 'Paiement partenaire', className: 'bg-indigo-100 text-indigo-700' };
    case 'failed': return { label: 'Échoué', className: 'bg-red-100 text-red-700' };
    default: return null;
  }
};

interface Treatment {
  id: string;
  treatment_id: string;
  treatment_menus: {
    name: string;
    description: string;
    duration: number;
    price: number;
    image?: string;
  } | null;
}

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
  const isAcceptingRef = useRef(false);
  const isChargingRef = useRef(false);

  useEffect(() => {
    fetchBookingDetail();
    const bookingChannel = supabase
      .channel(`booking-changes-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `id=eq.${id}` }, () => fetchBookingDetail())
      .subscribe();
    const therapistsChannel = supabase
      .channel(`booking-therapists-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_therapists', filter: `booking_id=eq.${id}` }, () => fetchBookingDetail())
      .subscribe();
    return () => {
      supabase.removeChannel(bookingChannel);
      supabase.removeChannel(therapistsChannel);
    };
  }, [id]);

  // Fetch room gap for margin/extension display
  useEffect(() => {
    const fetchRoomGap = async () => {
      if (!booking?.room_id || !['confirmed', 'ongoing'].includes(booking.status)) {
        setRoomGap(null);
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

      if (!error && data && data.length > 0) {
        setRoomGap({ gapMinutes: data[0].gap_minutes });
      } else {
        setRoomGap(null); // No next booking = no constraint
      }
    };
    fetchRoomGap();
  }, [booking?.id, booking?.room_id, booking?.status, booking?.duration, treatments.length]);

  const fetchBookingDetail = async () => {
    try {
      const { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .select("*, booking_therapists(status), booking_payment_infos(payment_status, card_brand, card_last4), customers(first_name, last_name, email, phone)")
        .eq("id", id)
        .single();
        
      if (bookingError) throw bookingError;

      const { data: hotelData } = await supabase.from("hotels").select("*").eq("id", bookingData.hotel_id).single();

      // Toujours charger les taux du thérapeute CONNECTÉ (pas du thérapeute primaire).
      // Pour un soin duo, chaque thérapeute doit voir ses propres revenus.
      const { data: { user: authUser } } = await supabase.auth.getUser();
      let rates = { hr: null as number | null, r45: null as number | null, r60: null as number | null, r90: null as number | null };
      let myTherapistId: string | null = null;
      if (authUser) {
        const { data: myT } = await supabase
          .from("therapists")
          .select("id, hourly_rate, rate_45, rate_60, rate_90")
          .eq("user_id", authUser.id)
          .single();
        if (myT) {
          myTherapistId = myT.id;
          setMyTherapistId(myT.id);
          rates = { hr: myT.hourly_rate, r45: myT.rate_45, r60: myT.rate_60, r90: myT.rate_90 };
        }
      }

      const rawPaymentInfos = bookingData.booking_payment_infos as unknown as PaymentInfoResult | PaymentInfoResult[] | null;
      const paymentInfo: PaymentInfoResult | null = Array.isArray(rawPaymentInfos)
        ? (rawPaymentInfos[0] ?? null)
        : rawPaymentInfos;

      const effectivePaymentStatus = bookingData.payment_status === 'paid'
        ? 'paid'
        : (paymentInfo?.payment_status || bookingData.payment_status);

      const customer = (bookingData as unknown as { customers: CustomerResult | null }).customers;
      setBooking({
        ...bookingData,
        client_first_name: customer?.first_name || bookingData.client_first_name,
        client_last_name: customer?.last_name || bookingData.client_last_name,
        client_email: customer?.email || bookingData.client_email,
        phone: customer?.phone || bookingData.phone,
        hotel_image_url: hotelData?.image,
        hotel_address: hotelData?.address,
        hotel_city: hotelData?.city,
        hotel_vat: hotelData?.vat || 20,
        therapist_commission: hotelData?.therapist_commission || 70,
        global_therapist_commission: hotelData?.global_therapist_commission === true,
        therapist_hourly_rate: rates.hr,
        therapist_rate_45: rates.r45,
        therapist_rate_60: rates.r60,
        therapist_rate_90: rates.r90,
        hotel_currency: hotelData?.currency || 'EUR',
        venue_type: hotelData?.venue_type || null,
        card_brand: paymentInfo?.card_brand || null,
        card_last4: paymentInfo?.card_last4 || null,
        effective_payment_status: effectivePaymentStatus
      });

      const { data: trData } = await supabase.from("booking_treatments").select("*, treatment_menus(*)").eq("booking_id", id);
      if (trData) setTreatments(trData as Treatment[]);

      const { data: btData } = await supabase
        .from("booking_therapists")
        .select("id, therapist_id")
        .eq("booking_id", id)
        .eq("status", "accepted");
      setAcceptedTherapistCount(btData?.length ?? 0);
      setHasAlreadyAccepted(
        myTherapistId ? (btData?.some((bt) => (bt as { therapist_id: string }).therapist_id === myTherapistId) ?? false) : false
      );

      // Fetch bundle info if booking has a bundle_usage_id
      const bundleUsageId = bookingData.bundle_usage_id;
      if (bundleUsageId) {
        const { data: usageData } = await supabase
          .from("bundle_session_usages")
          .select("customer_bundle_id, customer_treatment_bundles(total_sessions, used_sessions, treatment_bundles(name))")
          .eq("id", bundleUsageId)
          .single();

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
      toast.error(t('common:errors.generic'));
    } finally {
      setLoading(false);
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

  const handleChargeSavedCard = async (amount: number) => {
    if (!booking || updating || isChargingRef.current) return;
    isChargingRef.current = true;
    setUpdating(true);
    try {
      const { data, error } = await invokeStripe<{ success?: boolean; error?: string }>('charge-saved-card', {
        bookingId: booking.id,
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

      const treatmentsPrice = treatments.reduce((s, t) => s + (t.treatment_menus?.price || 0), 0);
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
      const deletedPrice = treatments.find(t => t.id === treatmentId)?.treatment_menus?.price || 0;
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
      const currentPrice = Math.max(booking.total_price || 0, treatments.reduce((s, t) => s + (t.treatment_menus?.price || 0), 0));
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

  const treatmentsTotalPrice = treatments.reduce((sum, t) => sum + (t.treatment_menus?.price || 0), 0);
  const grossPrice = Math.max(booking.total_price || 0, treatmentsTotalPrice);
  const giftAppliedCents = booking.gift_amount_applied_cents || 0;
  const totalPrice = Math.max(0, grossPrice - giftAppliedCents / 100);
  const totalDuration = (booking.duration ?? 0) > 0 ? booking.duration! : (treatments.reduce((s, t) => s + (t.treatment_menus?.duration || 0), 0) || 60);
  const totalHT = totalPrice / (1 + (booking.hotel_vat || 20) / 100);
  // Mode taux fixes (global_therapist_commission = false) : chaque thérapeute
  // gagne son propre taux pour sa durée de travail, indépendamment du prix total.
  // Mode commission % (global_therapist_commission = true) : chaque thérapeute
  // gagne son % sur sa part du total (total / guest_count pour les duos).
  const estimatedEarnings = (() => {
    if (booking.global_therapist_commission === false) {
      return computeTherapistEarnings(
        { rate_45: booking.therapist_rate_45 ?? null, rate_60: booking.therapist_rate_60 ?? null, rate_90: booking.therapist_rate_90 ?? null },
        totalDuration,
      ) ?? 0;
    }
    const pricePerTherapist = grossPrice / Math.max(booking.guest_count || 1, 1);
    return Math.round(pricePerTherapist * ((booking.therapist_commission || 70) / 100) * 100) / 100;
  })();

  return (
    <div className="flex flex-1 flex-col bg-background h-full overflow-hidden">
      <PwaHeader
        title={t('bookingDetail.myBooking')}
        showBack
        onBack={() => {
          const from = (location.state as { from?: string } | null)?.from;
          if (from) {
            navigate(from);
          } else if (window.history.length > 1) {
            navigate(-1);
          } else {
            navigate('/pwa/dashboard');
          }
        }}
        rightSlot={
          booking.status !== 'pending' ? (
            <button onClick={() => setShowContactDrawer(true)} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted">
              <MoreVertical className="w-5 h-5" />
            </button>
          ) : undefined
        }
      />
      <div className="flex-1 overflow-y-auto pb-48 px-4 pt-3">
        {/* Header: venue + client (left) / date + time (right) */}
        <div className="flex gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2.5">
              <img src={booking.hotel_image_url || ""} className="w-10 h-10 object-cover rounded-lg bg-muted shrink-0" />
              <div className="min-w-0">
                <h2 className="font-semibold text-sm truncate">{booking.hotel_name}</h2>
                <p className="text-[10px] text-muted-foreground truncate">{booking.hotel_address}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {booking.effective_payment_status && <Badge className={getPaymentStatusBadge(booking.effective_payment_status)?.className}>{getPaymentStatusBadge(booking.effective_payment_status)?.label}</Badge>}
              {bundleInfo && (
                <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                  <Package className="w-3 h-3 mr-1" />
                  {t('bundleSession')}
                </Badge>
              )}
            </div>
            {bundleInfo && (
              <div className="mt-1 text-[10px] text-amber-700">
                {bundleInfo.bundleName} — {t('bundleRemaining', { remaining: bundleInfo.remainingSessions, total: bundleInfo.totalSessions })}
              </div>
            )}
          </div>
          <div className="shrink-0 text-right space-y-1">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('booking.date')}</div>
              <div className="text-sm font-semibold">{format(new Date(booking.booking_date), "d MMM yyyy")}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('booking.time')}</div>
              <div className="text-sm font-semibold">{booking.booking_time.substring(0, 5)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Réf.</div>
              <div className="text-sm font-semibold text-muted-foreground">#{booking.booking_id}</div>
            </div>
          </div>
        </div>

        {/* Therapist check-in */}
        {booking.status === "confirmed" && booking.booking_date === format(new Date(), "yyyy-MM-dd") && (
          <div className="mb-3">
            {booking.therapist_checked_in_at ? (
              <div className="rounded-xl border border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-900/10 p-3 flex items-center gap-2.5">
                <MapPin className="w-4 h-4 text-green-700 dark:text-green-400" />
                <span className="text-xs font-medium text-green-900 dark:text-green-100">
                  {t('bookingDetail.arrivedAt', { time: format(new Date(booking.therapist_checked_in_at), "HH:mm") })}
                </span>
              </div>
            ) : (
              <button
                onClick={handleCheckIn}
                disabled={checkInLoading}
                className="w-full rounded-xl bg-primary text-white p-3 flex items-center justify-center gap-2 font-semibold text-sm disabled:opacity-50"
              >
                {checkInLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                {t('bookingDetail.arrived')}
              </button>
            )}
          </div>
        )}

        <div className="border-t pt-3">
          {/* Duration & Price */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border bg-card p-3 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Timer className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('booking.duration')}</div>
                <div className="text-sm font-semibold truncate">{totalDuration} min</div>
              </div>
            </div>
            <div className="rounded-xl border bg-card p-3 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Euro className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('bookingDetail.price')}</div>
                <div className="text-sm font-semibold truncate">{formatPrice(totalPrice, booking.hotel_currency)}</div>
                {giftAppliedCents > 0 && (
                  <div className="text-[10px] text-amber-600 mt-0.5">
                    -{formatPrice(giftAppliedCents / 100, booking.hotel_currency)} carte cadeau
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Client info */}
          <div className="mt-3 rounded-xl border bg-card p-3 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium">{booking.client_first_name} {booking.client_last_name || ''}</span>
              {booking.client_type && (
                <ClientTypeBadge clientType={booking.client_type} size="sm" />
              )}
            </div>
            {booking.room_number && (
              <div className="flex items-center gap-2.5">
                <DoorOpen className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t('bookingDetail.roomNumber', { number: booking.room_number })}</span>
              </div>
            )}
            {booking.client_note && (
              <div className="flex items-center gap-2.5">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground italic">{booking.client_note}</span>
              </div>
            )}
          </div>

          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/10 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              </div>
              <span className="text-xs font-medium text-emerald-900 dark:text-emerald-100">
                {t('bookingDetail.yourEarnings')}
              </span>
            </div>
            <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">
              {formatPrice(estimatedEarnings, booking.hotel_currency)}
            </span>
          </div>

          {booking.effective_payment_status === 'card_saved' && (
            <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50 dark:border-purple-900/40 dark:bg-purple-900/10 p-3 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
                <CreditCard className="w-4 h-4 text-purple-700 dark:text-purple-400" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-medium text-purple-900 dark:text-purple-100 block">
                  Carte pré-enregistrée
                </span>
                <span className="text-[10px] text-purple-700/70 dark:text-purple-400/70">
                  {booking.card_brand && booking.card_last4
                    ? `${booking.card_brand.charAt(0).toUpperCase() + booking.card_brand.slice(1)} •••• ${booking.card_last4} — sera débitée à la finalisation`
                    : 'Sera débitée à la finalisation de la prestation'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Health Form / Waiver Status */}
        {booking.status === "confirmed" && (
          <div className="mt-3">
            {booking.client_signature ? (
              <div className="rounded-xl border border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-900/10 p-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-green-500/15 flex items-center justify-center">
                  <FileCheck className="w-4 h-4 text-green-700 dark:text-green-400" />
                </div>
                <span className="text-xs font-medium text-green-900 dark:text-green-100">
                  {t('bookingDetail.waiverSigned')}
                </span>
              </div>
            ) : (
              <button
                onClick={() => setShowHealthFormDialog(true)}
                className="w-full rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10 p-3 flex items-center gap-2.5"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                </div>
                <div className="text-left">
                  <span className="text-xs font-medium text-amber-900 dark:text-amber-100 block">
                    {t('bookingDetail.healthForm')}
                  </span>
                  <span className="text-[10px] text-amber-700/70 dark:text-amber-400/70">
                    {t('bookingDetail.healthFormHint')}
                  </span>
                </div>
              </button>
            )}
          </div>
        )}

        {/* Room margin & extension */}
        {['confirmed', 'ongoing'].includes(booking.status) && booking.room_id && (
          <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/10 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                  <Hourglass className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                </div>
                <div>
                  <span className="text-xs font-medium text-blue-900 dark:text-blue-100 block">
                    {t('bookingDetail.margin')}
                  </span>
                  <span className="text-[10px] text-blue-700/70 dark:text-blue-400/70">
                    {roomGap ? t('bookingDetail.marginMinutes', { minutes: roomGap.gapMinutes }) : t('bookingDetail.noConstraint')}
                  </span>
                </div>
              </div>
              {(!roomGap || roomGap.gapMinutes >= 15) && (
                <button
                  onClick={() => setShowExtendDialog(true)}
                  className="flex items-center gap-1 text-[10px] font-semibold bg-blue-600 text-white px-3 py-1.5 rounded-lg"
                >
                  <Plus className="w-3 h-3" /> {t('bookingDetail.extend')}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mt-6">
          {/* NOUVEL ENCART SOIN MULTI-PRATICIENS */}
          {(booking.guest_count || 1) > 1 && (
            <div className="flex items-center justify-between p-3 bg-blue-50/50 border border-blue-100 rounded-xl mb-4">
              <div className="flex items-center gap-2 text-blue-700">
                <Users className="w-4 h-4" />
                <span className="font-medium text-sm">{t('bookingDetail.duoService', { count: booking.guest_count })}</span>
              </div>
              <Badge variant="outline" className="bg-white text-blue-700 border-blue-200 shadow-sm">
                {t('bookingDetail.duoAccepted', {
                  accepted: booking.booking_therapists?.filter(bt => bt.status === 'accepted').length || 0,
                  total: booking.guest_count,
                })}
              </Badge>
            </div>
          )}
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-xs font-semibold">Soins</h3>
            {booking.status === "confirmed" && <button onClick={() => setShowAddTreatmentDialog(true)} className="text-[10px] bg-primary text-white px-3 py-1 rounded">+ Ajouter</button>}
          </div>
          {treatments.map(t => (
            <div key={t.id} className="flex justify-between items-center py-2 border-b border-border/50">
              <div className="text-xs"><p className="font-medium">{t.treatment_menus?.name}</p><p className="text-[10px] text-muted-foreground">{t.treatment_menus?.duration}min</p></div>
              <div className="flex items-center gap-3"><span className="text-xs">{formatPrice(t.treatment_menus?.price || 0, booking.hotel_currency)}</span>
              {booking.status !== "completed" && <button onClick={() => setTreatmentToDelete(t.id)}><Trash2 className="w-3.5 h-3.5 text-destructive"/></button>}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-md border-t p-4 pb-safe z-30">
        {booking.status === "awaiting_hairdresser_selection" && (
          <div className="mb-3 rounded-xl bg-violet-50 border border-violet-200 px-3 py-2 flex items-center gap-2">
            <Hourglass className="w-4 h-4 text-violet-600 shrink-0" />
            <span className="text-xs font-medium text-violet-800">
              {t('bookingDetail.duoTherapistsJoined', { accepted: acceptedTherapistCount, total: booking.guest_count ?? 2 })}
            </span>
          </div>
        )}
        {(booking.status === "pending" && (!booking.therapist_id || booking.therapist_id === myTherapistId)) ||
         (booking.status === "awaiting_hairdresser_selection" && !hasAlreadyAccepted) ? (
          <div className="flex gap-2">
            <button onClick={() => setShowDeclineDialog(true)} className="w-12 h-12 rounded-full border-2 border-destructive flex items-center justify-center"><X className="text-destructive"/></button>
            <button onClick={handleAcceptBooking} disabled={updating} className="flex-1 bg-primary text-white rounded-full font-bold">
              {booking.status === "awaiting_hairdresser_selection" ? t('bookingDetail.duoJoin') : t('dashboard.accept')}
            </button>
          </div>
        ) : booking.status === "awaiting_hairdresser_selection" && hasAlreadyAccepted ? (
          <div className="w-full rounded-full border border-violet-300 bg-violet-50 py-3 text-center">
            <span className="text-sm font-medium text-violet-700">{t('bookingDetail.duoWaiting')}</span>
          </div>
        ) : (
          <>
            {['confirmed', 'ongoing'].includes(booking.status) && (
              <div>
                {booking.effective_payment_status === 'card_saved' ? (
                  <button
                    onClick={() => handleChargeSavedCard(totalPrice)}
                    disabled={updating}
                    className="w-full bg-gradient-to-r from-purple-600 to-purple-500 text-white rounded-full font-bold flex items-center justify-center gap-2 h-12 shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                  >
                    {updating ? <Loader2 className="animate-spin w-4 h-4"/> : <Wallet className="w-4 h-4"/>}
                    Finaliser la prestation ({formatPrice(totalPrice, booking.hotel_currency)})
                  </button>
                ) : !['paid', 'charged_to_room', 'pending_partner_billing'].includes(booking.effective_payment_status || '') ? (
                  <button onClick={() => setShowPaymentSelection(true)} className="w-full h-12 bg-primary text-white rounded-full font-bold">Finaliser la prestation</button>
                ) : null}
              </div>
            )}
          </>
        )}
        
      </div>

      <Drawer open={showContactDrawer} onOpenChange={setShowContactDrawer}>
        <DrawerContent className="pb-safe">
          <div className="p-4 space-y-2">
            <button onClick={() => { setShowContactDrawer(false); setShowNoShowDialog(true); }} className="flex items-center gap-3 p-4 bg-amber-50 text-amber-800 rounded-xl w-full font-medium"><UserX className="w-5 h-5"/> {t('bookingDetail.noShow')}</button>
            <button onClick={() => setShowUnassignDialog(true)} className="flex items-center gap-3 p-4 bg-destructive/10 text-destructive rounded-xl w-full font-medium"><X/> Désassigner</button>
            {['pending', 'confirmed'].includes(booking.status) && (
              <button onClick={() => { setShowContactDrawer(false); setShowCancelDialog(true); }} className="flex items-center gap-3 p-4 bg-destructive/10 text-destructive rounded-xl w-full font-medium"><X className="w-5 h-5"/> {t("booking.cancelBooking")}</button>
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
        treatments={treatments.map(t => ({ name: t.treatment_menus?.name || "", duration: t.treatment_menus?.duration || 0, price: t.treatment_menus?.price || 0 }))}
        vatRate={booking.hotel_vat || 20}
        totalPrice={totalPrice}
        isAlreadyPaid={true}
      />
      <InvoiceSignatureDialog 
        open={showSignatureDialog} 
        onOpenChange={setShowSignatureDialog} 
        onConfirm={handleSignatureConfirm} 
        signatureToken={booking.signature_token}
        loading={signingLoading} 
        treatments={treatments.map(t => ({ name: t.treatment_menus?.name || "", duration: t.treatment_menus?.duration || 0, price: t.treatment_menus?.price || 0 }))} 
        vatRate={booking.hotel_vat || 20} 
        totalPrice={totalPrice} 
        isAlreadyPaid={booking.effective_payment_status === 'paid' || booking.effective_payment_status === 'card_saved'} 
      />
      <PaymentSelectionDrawer open={showPaymentSelection} onOpenChange={setShowPaymentSelection} bookingId={booking.id} bookingNumber={booking.booking_id} totalPrice={totalPrice} currency={booking.hotel_currency} treatments={treatments.map(t => ({ name: t.treatment_menus?.name || "", duration: t.treatment_menus?.duration || 0, price: t.treatment_menus?.price || 0 }))} vatRate={booking.hotel_vat || 20} venueType={booking.venue_type} roomNumber={booking.room_number} onPaymentComplete={fetchBookingDetail} onTapToPayRequested={() => { setShowPaymentSelection(false); setShowTapToPayDialog(true); }} hasSavedCard={booking.effective_payment_status === 'card_saved'} />
      
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