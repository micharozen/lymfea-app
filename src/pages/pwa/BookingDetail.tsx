import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { formatPrice } from "@/lib/formatPrice";
import { Calendar, Clock, Timer, Euro, Phone, MoreVertical, Trash2, Navigation, X, User, Hotel, MessageCircle, Pen, MessageSquare, Wallet, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { AddTreatmentDialog } from "./AddTreatmentDialog";
import { ProposeAlternativeDialog } from "./ProposeAlternativeDialog";
import { InvoiceSignatureDialog } from "@/components/InvoiceSignatureDialog";
import { PaymentSelectionDrawer } from "@/components/pwa/PaymentSelectionDrawer";
import PwaHeader from "@/components/pwa/Header";
import PwaPageLoader from "@/components/pwa/PageLoader";
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
}

const getPaymentStatusBadge = (paymentStatus?: string | null) => {
  if (!paymentStatus) return null;
  switch (paymentStatus) {
    case 'paid': return { label: 'Payé', className: 'bg-green-100 text-green-700' };
    case 'charged_to_room': return { label: 'Facturé chambre', className: 'bg-blue-100 text-blue-700' };
    case 'card_saved': return { label: 'Carte enregistrée', className: 'bg-purple-100 text-purple-700' };
    case 'pending': return { label: 'En attente', className: 'bg-yellow-100 text-yellow-700' };
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
  const [pendingRoomPayment, setPendingRoomPayment] = useState(false);
  const [showTapToPayDialog, setShowTapToPayDialog] = useState(false);
  const [tapToPayLoading, setTapToPayLoading] = useState(false);
  
  const [bundleInfo, setBundleInfo] = useState<{
    bundleName: string;
    remainingSessions: number;
    totalSessions: number;
  } | null>(null);

  const isAcceptingRef = useRef(false);
  const isChargingRef = useRef(false);

  useEffect(() => {
    fetchBookingDetail();
    const bookingChannel = supabase
      .channel(`booking-changes-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `id=eq.${id}` }, () => fetchBookingDetail())
      .subscribe();
    return () => { supabase.removeChannel(bookingChannel); };
  }, [id]);

  const fetchBookingDetail = async () => {
    try {
      const { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .select("*, booking_payment_infos(payment_status)")
        .eq("id", id)
        .single();
        
      if (bookingError) throw bookingError;

      const { data: hotelData } = await supabase.from("hotels").select("*").eq("id", bookingData.hotel_id).single();
      
      let rates = { hr: null, r45: null, r60: null, r90: null };
      if (bookingData.therapist_id && hotelData?.global_therapist_commission === false) {
        const { data: tData } = await supabase.from("therapists").select("hourly_rate, rate_45, rate_60, rate_90").eq("id", bookingData.therapist_id).single();
        rates = { hr: tData?.hourly_rate, r45: tData?.rate_45, r60: tData?.rate_60, r90: tData?.rate_90 };
      }

      const infosStatus = Array.isArray(bookingData.booking_payment_infos) 
        ? bookingData.booking_payment_infos[0]?.payment_status 
        : (bookingData.booking_payment_infos as any)?.payment_status;
        
      const effectivePaymentStatus = bookingData.payment_status === 'paid' 
        ? 'paid' 
        : (infosStatus || bookingData.payment_status);

      setBooking({
        ...bookingData,
        hotel_image_url: hotelData?.image,
        hotel_address: hotelData?.address,
        hotel_city: hotelData?.city,
        hotel_vat: hotelData?.vat || 20,
        therapist_commission: hotelData?.therapist_commission || 70,
        global_therapist_commission: hotelData?.global_therapist_commission !== false,
        therapist_hourly_rate: rates.hr,
        therapist_rate_45: rates.r45,
        therapist_rate_60: rates.r60,
        therapist_rate_90: rates.r90,
        hotel_currency: hotelData?.currency || 'EUR',
        effective_payment_status: effectivePaymentStatus
      });

      const { data: trData } = await supabase.from("booking_treatments").select("*, treatment_menus(*)").eq("booking_id", id);
      if (trData) setTreatments(trData as any);

      // Fetch bundle info if booking has a bundle_usage_id
      const bundleUsageId = (bookingData as any).bundle_usage_id;
      if (bundleUsageId) {
        const { data: usageData } = await supabase
          .from("bundle_session_usages")
          .select("customer_bundle_id, customer_treatment_bundles(total_sessions, used_sessions, treatment_bundles(name))")
          .eq("id", bundleUsageId)
          .single();

        if (usageData) {
          const customerBundle = (usageData as any).customer_treatment_bundles;
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
      if (pendingRoomPayment) {
        const { data, error } = await invokeEdgeFunction<any, any>('finalize-payment', {
          body: { booking_id: booking.id, payment_method: 'room', final_amount: totalPrice, signature_data: signatureData },
        });
        if (error || !data?.success) throw new Error(data?.error || "Erreur finalisation");
        toast.success("Prestation finalisée !");
      } else {
        const { error } = await supabase.from("bookings").update({ 
          client_signature: signatureData, 
          signed_at: new Date().toISOString(), 
          status: "completed" 
        }).eq("id", booking.id);
        if (error) throw error;
        toast.success(t('bookingDetail.completed'));
      }
      navigate("/pwa/dashboard", { state: { forceRefresh: true } });
    } catch (error: any) {
      toast.error(error.message || t('common:errors.generic'));
    } finally {
      setSigningLoading(false);
    }
  };

  const handleChargeSavedCard = async (amount: number) => {
    if (!booking || updating || isChargingRef.current) return;
    isChargingRef.current = true;
    setUpdating(true);
    try {
      const { data, error } = await invokeEdgeFunction('charge-saved-card', {
        body: { bookingId: booking.id, finalAmount: amount },
      });
      if (error || !(data as any)?.success) throw new Error((data as any)?.error || "Échec débit");
      toast.success("Carte débitée avec succès !");
      navigate("/pwa/dashboard", { state: { forceRefresh: true } });
    } catch (error: any) {
      toast.error(error.message || "Erreur débit");
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

      const { data: updateData, error: updateError } = await supabase
        .from('bookings')
        .update({ therapist_id: tData.id, status: 'confirmed', total_price: finalPrice })
        .eq('id', booking.id)
        .select();

      if (updateError || !updateData || updateData.length === 0) {
         const { error: rpcError } = await supabase.rpc('accept_booking', {
           _booking_id: booking.id,
           _hairdresser_id: tData.id,
           _hairdresser_name: `${tData.first_name} ${tData.last_name}`,
           _total_price: finalPrice
         });
         if (rpcError) throw new Error(`Erreur RPC: ${rpcError.message}`);
      }

      invokeEdgeFunction('notify-booking-confirmed', { body: { bookingId: booking.id } }).catch(() => {});
      
      toast.success(t('bookingDetail.accepted'));
      navigate("/pwa/dashboard", { state: { forceRefresh: true } });
      
    } catch (error: any) {
      toast.error(error.message || t('common:errors.generic'));
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
    } catch (error: any) {
      toast.error(error.message);
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
  const totalPrice = Math.max(booking.total_price || 0, treatmentsTotalPrice);
  const totalDuration = (booking as any).duration > 0 ? (booking as any).duration : (treatments.reduce((s, t) => s + (t.treatment_menus?.duration || 0), 0) || 60);
  const totalHT = totalPrice / (1 + (booking.hotel_vat || 20) / 100);
  const estimatedEarnings = booking.global_therapist_commission !== false 
    ? Math.round(totalHT * ((booking.therapist_commission || 70) / 100) * 100) / 100
    : Math.min(booking.therapist_rate_60 || 0, totalHT);

  return (
    <div className="flex flex-1 flex-col bg-background h-full overflow-hidden">
      <PwaHeader title={t('bookingDetail.myBooking')} showBack onBack={() => navigate('/pwa/dashboard')} />
      <div className="flex-1 overflow-y-auto pb-48 px-4 pt-3">
        <div className="flex flex-col items-center mb-4">
          <img src={booking.hotel_image_url || ""} className="w-16 h-16 object-cover rounded-xl mb-2 bg-muted" />
          <h2 className="font-semibold text-sm">{booking.hotel_name}</h2>
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Navigation className="w-3 h-3"/> {booking.hotel_address}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
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

        <div className="space-y-3 border-t pt-3">
          <div className="flex justify-between text-xs"><span>Date</span><span className="font-medium">{format(new Date(booking.booking_date), "d MMM yyyy")}</span></div>
          <div className="flex justify-between text-xs"><span>Heure</span><span className="font-medium">{booking.booking_time.substring(0, 5)}</span></div>
          <div className="flex justify-between text-xs"><span>Prix</span><span className="font-medium">{formatPrice(totalPrice, booking.hotel_currency)}</span></div>
          <div className="flex justify-between text-xs text-success"><span>Vos revenus</span><span className="font-bold">{formatPrice(estimatedEarnings, booking.hotel_currency)}</span></div>
        </div>

        <div className="mt-6">
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
        {booking.status === "pending" && !booking.therapist_id ? (
          <div className="flex gap-2">
            <button onClick={() => setShowDeclineDialog(true)} className="w-12 h-12 rounded-full border-2 border-destructive flex items-center justify-center"><X className="text-destructive"/></button>
            <button onClick={handleAcceptBooking} disabled={updating} className="flex-1 bg-primary text-white rounded-full font-bold">Accepter</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setShowContactDrawer(true)} className="w-12 h-12 rounded-full border flex items-center justify-center"><MoreVertical/></button>
            {booking.effective_payment_status === 'card_saved' && !booking.client_signature ? (
              <button 
                onClick={() => handleChargeSavedCard(totalPrice)} 
                disabled={updating} 
                className="flex-1 bg-gradient-to-r from-purple-600 to-purple-500 text-white rounded-full font-bold flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
              >
                {updating ? <Loader2 className="animate-spin w-4 h-4"/> : <Wallet className="w-4 h-4"/>} 
                Finaliser la prestation ({formatPrice(totalPrice, booking.hotel_currency)})
              </button>
            ) : booking.effective_payment_status !== 'paid' && !booking.client_signature ? (
              <button onClick={() => setShowPaymentSelection(true)} className="flex-1 bg-primary text-white rounded-full font-bold">Finaliser la prestation</button>
            ) : !booking.client_signature && (
              <button onClick={() => setShowSignatureDialog(true)} className="flex-1 bg-green-600 text-white rounded-full font-bold flex items-center justify-center gap-2"><Pen className="w-4 h-4"/> Signature client</button>
            )}
          </div>
        )}
      </div>

      <Drawer open={showContactDrawer} onOpenChange={setShowContactDrawer}>
        <DrawerContent className="pb-safe">
          <div className="p-4 space-y-2">
            <button onClick={() => window.open(`https://wa.me/${booking.phone.replace(/\D/g,'')}`)} className="flex items-center gap-3 p-4 bg-muted/50 rounded-xl w-full font-medium"><Phone className="text-primary"/> WhatsApp Client</button>
            <button onClick={() => setShowUnassignDialog(true)} className="flex items-center gap-3 p-4 bg-destructive/10 text-destructive rounded-xl w-full font-medium"><X/> Désassigner</button>
          </div>
        </DrawerContent>
      </Drawer>

      <AddTreatmentDialog open={showAddTreatmentDialog} onOpenChange={setShowAddTreatmentDialog} bookingId={booking.id} hotelId={booking.hotel_id} onTreatmentsAdded={fetchBookingDetail} />
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
      <PaymentSelectionDrawer open={showPaymentSelection} onOpenChange={setShowPaymentSelection} bookingId={booking.id} bookingNumber={booking.booking_id} totalPrice={totalPrice} currency={booking.hotel_currency} treatments={treatments.map(t => ({ name: t.treatment_menus?.name || "", duration: t.treatment_menus?.duration || 0, price: t.treatment_menus?.price || 0 }))} vatRate={booking.hotel_vat || 20} onSignatureRequired={() => { setPendingRoomPayment(true); setShowSignatureDialog(true); }} onPaymentComplete={fetchBookingDetail} onTapToPayRequested={() => { setShowPaymentSelection(false); setShowTapToPayDialog(true); }} hasSavedCard={booking.effective_payment_status === 'card_saved'} />
      
      <AlertDialog open={!!treatmentToDelete} onOpenChange={() => setTreatmentToDelete(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Supprimer ?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Non</AlertDialogCancel><AlertDialogAction onClick={() => treatmentToDelete && handleDeleteTreatment(treatmentToDelete)}>Oui</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={showUnassignDialog} onOpenChange={setShowUnassignDialog}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Désassigner ?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Non</AlertDialogCancel><AlertDialogAction onClick={handleUnassignBooking}>Confirmer</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
};

export default PwaBookingDetail;