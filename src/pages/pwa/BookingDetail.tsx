import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { formatPrice } from "@/lib/formatPrice";
import { Calendar, Clock, Timer, Euro, Phone, MoreVertical, Trash2, Navigation, X, User, Hotel, MessageCircle, Pen, MessageSquare, Wallet } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { AddTreatmentDialog } from "./AddTreatmentDialog";
import { ProposeAlternativeDialog } from "./ProposeAlternativeDialog";
import { InvoiceSignatureDialog } from "@/components/InvoiceSignatureDialog";
import { PaymentSelectionDrawer } from "@/components/pwa/PaymentSelectionDrawer";
import PwaHeader from "@/components/pwa/Header";
import { Skeleton } from "@/components/ui/skeleton";
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
    case 'paid':
      return { label: 'Payé', className: 'bg-green-100 text-green-700' };
    case 'charged_to_room':
      return { label: 'Facturé chambre', className: 'bg-blue-100 text-blue-700' };
    case 'card_saved': 
      return { label: 'Carte enregistrée', className: 'bg-purple-100 text-purple-700' };
    case 'pending':
      return { label: 'En attente', className: 'bg-yellow-100 text-yellow-700' };
    case 'failed':
      return { label: 'Échoué', className: 'bg-red-100 text-red-700' };
    default:
      return null;
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

interface ConciergeContact {
  phone: string;
  country_code: string;
  first_name: string;
  last_name: string;
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
  const [pendingSlotNumber, setPendingSlotNumber] = useState<1 | 2 | 3 | null>(null);
  const [showProposeAlternativeDialog, setShowProposeAlternativeDialog] = useState(false);
  const [treatmentToDelete, setTreatmentToDelete] = useState<string | null>(null);
  const [conciergeContact, setConciergeContact] = useState<ConciergeContact | null>(null);
  const [showNavigationDrawer, setShowNavigationDrawer] = useState(false);
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [signingLoading, setSigningLoading] = useState(false);
  const [showPaymentSelection, setShowPaymentSelection] = useState(false);
  const [pendingRoomPayment, setPendingRoomPayment] = useState(false);
  const [showTapToPayDialog, setShowTapToPayDialog] = useState(false);
  const [tapToPayLoading, setTapToPayLoading] = useState(false);
  const isAcceptingRef = useRef(false);
  const [proposedSlots, setProposedSlots] = useState<{
    slot_1_date: string; slot_1_time: string;
    slot_2_date?: string | null; slot_2_time?: string | null;
    slot_3_date?: string | null; slot_3_time?: string | null;
  } | null>(null);
  const [validatingSlot, setValidatingSlot] = useState<number | null>(null);

  useEffect(() => {
    if (booking && booking.id !== id) {
      setBooking(null);
      setTreatments([]);
      setLoading(true);
    } else if (!booking) {
      setLoading(true);
    }
    
    fetchBookingDetail();

    const bookingChannel = supabase
      .channel(`booking-changes-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `id=eq.${id}` },
        () => { if (!isAcceptingRef.current) fetchBookingDetail(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booking_treatments', filter: `booking_id=eq.${id}` },
        () => { if (!isAcceptingRef.current) fetchBookingDetail(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(bookingChannel); };
  }, [id]);

  const fetchBookingDetail = async () => {
    try {
      const { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", id)
        .single();

      if (bookingError) throw bookingError;

      let hotelData = null;
      if (bookingData.hotel_id) {
        const { data: hotel } = await supabase
          .from("hotels")
          .select("image, address, city, vat, therapist_commission, global_therapist_commission, currency")
          .eq("id", bookingData.hotel_id)
          .single();
        hotelData = hotel;
      }

      let therapistHourlyRate: number | null = null;
      let therapistRate45: number | null = null;
      let therapistRate60: number | null = null;
      let therapistRate90: number | null = null;
      if (bookingData.therapist_id && hotelData?.global_therapist_commission === false) {
        const { data: therapistData } = await supabase
          .from("therapists")
          .select("hourly_rate, rate_45, rate_60, rate_90")
          .eq("id", bookingData.therapist_id)
          .single();
        therapistHourlyRate = therapistData?.hourly_rate ?? null;
        therapistRate45 = therapistData?.rate_45 ?? null;
        therapistRate60 = therapistData?.rate_60 ?? null;
        therapistRate90 = therapistData?.rate_90 ?? null;
      }

      setBooking({
        ...bookingData,
        hotel_image_url: hotelData?.image,
        hotel_address: hotelData?.address,
        hotel_city: hotelData?.city,
        hotel_vat: hotelData?.vat || 20,
        therapist_commission: hotelData?.therapist_commission || 70,
        global_therapist_commission: hotelData?.global_therapist_commission !== false,
        therapist_hourly_rate: therapistHourlyRate,
        therapist_rate_45: therapistRate45,
        therapist_rate_60: therapistRate60,
        therapist_rate_90: therapistRate90,
        hotel_currency: hotelData?.currency || 'EUR'
      });

      const { data: treatmentsData, error: treatmentsError } = await supabase
        .from("booking_treatments")
        .select(`
          *,
          treatment_menus ( name, description, duration, price, image )
        `)
        .eq("booking_id", id);

      if (!treatmentsError && treatmentsData) {
        setTreatments(treatmentsData as any);
      }

      if (bookingData.status === "awaiting_hairdresser_selection") {
        const { data: slotsData } = await supabase
          .from("booking_proposed_slots")
          .select("*")
          .eq("booking_id", id)
          .maybeSingle();
        setProposedSlots(slotsData);
      } else {
        setProposedSlots(null);
      }

      const { data: conciergeData } = await supabase
        .from("concierge_hotels")
        .select(`concierges ( phone, country_code, first_name, last_name )`)
        .eq("hotel_id", bookingData.hotel_id)
        .limit(1)
        .maybeSingle();

      if (conciergeData && conciergeData.concierges) {
        setConciergeContact(conciergeData.concierges as any);
      }

    } catch (error) {
      console.error("Error fetching booking:", error);
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
        const { data, error } = await invokeEdgeFunction<unknown, { success: boolean; error?: string }>('finalize-payment', {
          body: {
            booking_id: booking.id,
            payment_method: 'room',
            final_amount: totalPrice,
            signature_data: signatureData,
          },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "Payment finalization failed");

        toast.success("Prestation finalisée !");
        setShowSignatureDialog(false);
        navigate("/pwa/dashboard", { state: { forceRefresh: true } });
        return;
      }

      const { error } = await supabase
        .from("bookings")
        .update({ 
          client_signature: signatureData,
          signed_at: new Date().toISOString(),
          status: "completed",
          updated_at: new Date().toISOString()
        })
        .eq("id", booking.id);

      if (error) throw error;
      toast.success(t('bookingDetail.completed'));
      setShowSignatureDialog(false);
      navigate("/pwa/dashboard", { state: { forceRefresh: true } });
    } catch (error: any) {
      toast.error(error.message || t('common:errors.generic'));
    } finally {
      setSigningLoading(false);
    }
  };

  const handleChargeSavedCard = async (amount: number) => {
    if (!booking) return;
    setUpdating(true);
    try {
      const { data, error } = await invokeEdgeFunction('charge-saved-card', {
        body: { bookingId: booking.id, finalAmount: amount },
      });
      if (error) throw error;
      if (!(data as any)?.success) throw new Error((data as any)?.error || "Le paiement a échoué.");

      toast.success("La prestation a été finalisée et la carte débitée !");
      navigate("/pwa/dashboard", { state: { forceRefresh: true } });
    } catch (error: any) {
      console.error("Erreur lors du débit:", error);
      toast.error(error.message || "Impossible de débiter la carte.");
      setShowPaymentSelection(true);
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteTreatment = async (treatmentId: string) => {
    if (!booking) return;
    setUpdating(true);
    try {
      const treatmentToDeleteObj = treatments.find(t => t.id === treatmentId);
      const priceToRemove = treatmentToDeleteObj?.treatment_menus?.price || 0;

      // On ajoute .select() à la fin pour forcer Supabase à nous dire ce qu'il a supprimé
      const { data, error: deleteError } = await supabase
        .from("booking_treatments")
        .delete()
        .eq("id", treatmentId)
        .select();

      if (deleteError) throw deleteError;

      // 🚨 LE DÉTECTEUR DE BLOCAGE RLS :
      if (!data || data.length === 0) {
        throw new Error("Droits insuffisants. Vérifie les RLS (Policies) 'DELETE' sur la table booking_treatments dans Supabase.");
      }

      // Si on arrive ici, c'est que Supabase a bien effacé la ligne !
      const newTotalPrice = Math.max(0, (booking.total_price || 0) - priceToRemove);
      await supabase
        .from("bookings")
        .update({ total_price: newTotalPrice })
        .eq("id", id);

      setTreatments(prev => prev.filter(t => t.id !== treatmentId));
      toast.success(t('bookingDetail.treatmentDeleted'));
      setTreatmentToDelete(null);
      await fetchBookingDetail(); 
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || t('common:errors.generic'));
    } finally {
      setUpdating(false);
    }
  };

  const handleAcceptBooking = async () => {
    if (!booking || updating || isAcceptingRef.current) return;
    isAcceptingRef.current = true;
    setUpdating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: tData } = await supabase.from("therapists").select("id, first_name, last_name").eq("user_id", user?.id).single();
      if (!tData) throw new Error("Profil non trouvé");

      // Calcul sécurisé : on envoie le plus grand entre le prix de la réservation et les soins
      const treatmentsPrice = treatments.reduce((sum, t) => sum + (t.treatment_menus?.price || 0), 0);
      const finalPrice = Math.max(booking.total_price || 0, treatmentsPrice);
      
      const { error } = await supabase.rpc('accept_booking', {
        _booking_id: booking.id,
        _hairdresser_id: tData.id, 
        _hairdresser_name: `${tData.first_name} ${tData.last_name}`,
        _total_price: finalPrice
      });

      if (error) throw error;
      toast.success(t('bookingDetail.accepted'));
      navigate("/pwa/dashboard", { state: { forceRefresh: true } });
    } catch (error) {
      toast.error(t('common:errors.generic'));
    } finally {
      isAcceptingRef.current = false;
      setUpdating(false);
    }
  };

  const handleUnassignBooking = async () => {
    if (!booking) return;
    setUpdating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: tData } = await supabase.from("therapists").select("id").eq("user_id", user?.id).single();
      
      const { error } = await supabase.rpc('unassign_booking', {
        _booking_id: booking.id,
        _hairdresser_id: tData?.id
      });
      if (error) throw error;

      toast.success(t('bookingDetail.unassigned'));
      navigate("/pwa/dashboard", { state: { forceRefresh: true } });
    } catch (error) {
      toast.error("Erreur lors de la désassignation");
    } finally {
      setUpdating(false);
    }
  };

  const handleTapToPayConfirm = async () => {
    if (!booking) return;
    setTapToPayLoading(true);
    try {
      const { data, error } = await invokeEdgeFunction('mark-tap-to-pay-paid', {
        body: { booking_id: booking.id, final_amount: totalPrice },
      });
      if (error) throw error;
      toast.success("Paiement Tap to Pay validé !");
      setShowTapToPayDialog(false);
      navigate("/pwa/dashboard", { state: { forceRefresh: true } });
    } catch (error: any) {
      console.error(error);
      toast.error("Erreur lors de la validation du paiement.");
    } finally {
      setTapToPayLoading(false);
    }
  };

  if (loading && !booking) return <PwaPageLoader title={t('bookingDetail.myBooking')} showBack backPath="/pwa/dashboard" />;
  if (!booking) return <div className="flex flex-1 items-center justify-center bg-background"><div className="text-sm text-muted-foreground">{t('bookingDetail.notFound')}</div></div>;

  const treatmentsTotalDuration = treatments.reduce((sum, t) => sum + (t.treatment_menus?.duration || 0), 0);
  const treatmentsTotalPrice = treatments.reduce((sum, t) => sum + (t.treatment_menus?.price || 0), 0);
  
  // LOGIQUE DE PRIX RÉSILIENTE : On prend le prix de la réservation, ou les soins si supérieur
  const totalPrice = Math.max(booking.total_price || 0, treatmentsTotalPrice);
  const totalDuration = (booking as any).duration > 0 ? (booking as any).duration : (treatmentsTotalDuration || 60);
  
  const totalHT = totalPrice / (1 + (booking.hotel_vat || 20) / 100);
  let estimatedEarnings = booking.global_therapist_commission !== false 
    ? Math.round(totalHT * ((booking.therapist_commission || 70) / 100) * 100) / 100
    : Math.min(booking.therapist_rate_60 || 0, totalHT);

  return (
    <>
      <div className="flex flex-1 flex-col bg-background h-full overflow-hidden">
        <PwaHeader title={t('bookingDetail.myBooking')} showBack onBack={() => navigate('/pwa/dashboard')} />

        <div className="flex-1 overflow-y-auto pb-48 px-4 pt-3">
          <div className="flex flex-col items-center mb-4">
            <div className="w-16 h-16 mb-2">
              {booking.hotel_image_url ? <img src={booking.hotel_image_url} className="w-full h-full object-cover rounded-xl" /> : <div className="w-full h-full bg-muted rounded-xl" />}
            </div>
            <h2 className="font-semibold text-sm text-foreground text-center">{booking.hotel_name}</h2>
            <button onClick={() => setShowNavigationDrawer(true)} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground mt-0.5">
              <Navigation className="w-3 h-3" />
              <span>{booking.hotel_address || booking.hotel_name}</span>
            </button>
            {booking.payment_status && (
              <div className="mt-1.5">
                {(() => {
                  const b = getPaymentStatusBadge(booking.payment_status);
                  return b ? <Badge className={`text-[10px] px-2 py-0 h-4 ${b.className}`}>{b.label}</Badge> : null;
                })()}
              </div>
            )}
          </div>

          <div className="space-y-0 mb-3">
            <div className="flex items-center gap-3 py-2 border-b border-border/50">
              <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground w-16">{t('booking.date')}</span>
              <span className="text-xs font-medium text-foreground ml-auto">{format(new Date(booking.booking_date), "d MMM yyyy")}</span>
            </div>
            <div className="flex items-center gap-3 py-2 border-b border-border/50">
              <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground w-16">{t('booking.time')}</span>
              <span className="text-xs font-medium text-foreground ml-auto">{booking.booking_time.substring(0, 5)}</span>
            </div>
            <div className="flex items-center gap-3 py-2 border-b border-border/50">
              <Euro className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground w-16">{t('bookingDetail.price')}</span>
              <span className="text-xs font-medium text-foreground ml-auto">{formatPrice(totalPrice, booking.hotel_currency)}</span>
            </div>
          </div>

          {estimatedEarnings > 0 && (
            <div className="flex items-center gap-3 py-2 border-b border-border/50 mb-3">
              <Wallet className="w-4 h-4 text-success flex-shrink-0" />
              <span className="text-xs text-success font-medium">{t('bookingDetail.yourEarnings')}</span>
              <span className="text-xs font-bold text-success ml-auto">{formatPrice(estimatedEarnings, booking.hotel_currency)}</span>
            </div>
          )}

          <div className="flex items-center gap-3 py-2 border-b border-border/50 mb-3">
            <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground">{booking.client_first_name} {booking.client_last_name}</p>
              {booking.room_number && <p className="text-[10px] text-muted-foreground">{t('booking.room')}: {booking.room_number}</p>}
            </div>
          </div>

          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-foreground">{t('booking.treatments')}</h3>
              {booking.status === "confirmed" && (
                <button onClick={() => setShowAddTreatmentDialog(true)} className="px-4 py-1 bg-primary text-primary-foreground font-medium text-[10px] rounded">+ {t('bookingDetail.add')}</button>
              )}
            </div>
            <div className="space-y-1.5">
              {treatments.map((t) => (
                <div key={t.id} className="flex items-center gap-2 group py-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{t.treatment_menus?.name}</p>
                    <p className="text-[10px] text-muted-foreground">{formatPrice(t.treatment_menus?.price || 0, booking.hotel_currency)} • {t.treatment_menus?.duration || 0}min</p>
                  </div>
                  {booking.status !== "completed" && (
                    <button onClick={() => setTreatmentToDelete(t.id)} disabled={updating} className="p-1 hover:bg-destructive/10 rounded transition-colors">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-md border-t border-border px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+10px)] z-20">
          <div className="flex flex-col gap-2">
            {booking.status === "pending" && !booking.therapist_id ? (
              <div className="flex gap-2">
                <button onClick={() => setShowDeclineDialog(true)} className="w-12 h-12 rounded-full border-2 border-destructive flex items-center justify-center bg-background"><X className="text-destructive" /></button>
                <button onClick={handleAcceptBooking} disabled={updating} className="flex-1 bg-primary text-primary-foreground rounded-full font-bold">Accepter</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Drawer open={showContactDrawer} onOpenChange={setShowContactDrawer}>
                  <DrawerTrigger asChild>
                    <button className="w-12 h-12 rounded-full border border-border flex items-center justify-center bg-background"><MoreVertical /></button>
                  </DrawerTrigger>
                  <DrawerContent className="pb-safe">
                    <div className="p-4 space-y-2">
                      {booking.phone && (
                        <button onClick={() => window.open(`https://wa.me/${booking.phone.replace(/\D/g,'')}`)} className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 w-full"><Phone className="text-primary" /> WhatsApp Client</button>
                      )}
                      <button onClick={() => setShowUnassignDialog(true)} className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 text-destructive w-full"><X /> Désassigner</button>
                    </div>
                  </DrawerContent>
                </Drawer>

                {booking.payment_status === 'card_saved' && !booking.client_signature ? (
                  <button 
                    onClick={() => handleChargeSavedCard(totalPrice)} 
                    disabled={updating} 
                    className="flex-1 bg-gradient-to-r from-purple-600 to-purple-500 text-white rounded-full font-bold flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all"
                  >
                    <Wallet className="w-4 h-4" /> Finaliser la prestation ({formatPrice(totalPrice, booking.hotel_currency)})
                  </button>
                ) : booking.payment_status !== 'paid' && !booking.client_signature ? (
                  <button onClick={() => setShowPaymentSelection(true)} className="flex-1 bg-primary text-primary-foreground rounded-full font-bold">Finaliser ({formatPrice(totalPrice, booking.hotel_currency)})</button>
                ) : !booking.client_signature && (
                  <button onClick={() => setShowSignatureDialog(true)} className="flex-1 bg-green-600 text-white rounded-full font-bold flex items-center justify-center gap-2 shadow-lg"><Pen className="w-4 h-4" /> Signature Client</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <AddTreatmentDialog open={showAddTreatmentDialog} onOpenChange={setShowAddTreatmentDialog} bookingId={booking.id} hotelId={booking.hotel_id} onTreatmentsAdded={fetchBookingDetail} />
      <InvoiceSignatureDialog open={showSignatureDialog} onOpenChange={setShowSignatureDialog} onConfirm={handleSignatureConfirm} loading={signingLoading} treatments={treatments.map(t => ({ name: t.treatment_menus?.name || "", duration: t.treatment_menus?.duration || 0, price: t.treatment_menus?.price || 0 }))} vatRate={booking.hotel_vat || 20} />
      
      <AlertDialog open={!!treatmentToDelete} onOpenChange={() => setTreatmentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce soin ?</AlertDialogTitle>
            <AlertDialogDescription>Le montant total de la réservation sera mis à jour.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => treatmentToDelete && handleDeleteTreatment(treatmentToDelete)} className="bg-destructive text-white">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showUnassignDialog} onOpenChange={setShowUnassignDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Se désassigner ?</AlertDialogTitle>
            <AlertDialogDescription>La réservation retournera dans la liste des demandes en attente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnassignBooking} className="bg-destructive text-white">Confirmer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showTapToPayDialog} onOpenChange={(o) => !tapToPayLoading && setShowTapToPayDialog(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer le paiement physique ?</AlertDialogTitle>
            <AlertDialogDescription>Marquer payé via Tap to Pay pour {formatPrice(totalPrice, booking.hotel_currency)} ?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={tapToPayLoading}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleTapToPayConfirm(); }} disabled={tapToPayLoading}>{tapToPayLoading ? "Chargement..." : "Confirmer"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PaymentSelectionDrawer
        open={showPaymentSelection}
        onOpenChange={setShowPaymentSelection}
        bookingId={booking.id}
        bookingNumber={booking.booking_id}
        totalPrice={totalPrice}
        currency={booking.hotel_currency}
        treatments={treatments.map(t => ({ name: t.treatment_menus?.name || "", duration: t.treatment_menus?.duration || 0, price: t.treatment_menus?.price || 0 }))}
        vatRate={booking.hotel_vat || 20}
        onSignatureRequired={() => { setPendingRoomPayment(true); setShowSignatureDialog(true); }}
        onPaymentComplete={() => navigate("/pwa/dashboard", { state: { forceRefresh: true } })}
        onTapToPayRequested={() => { setShowPaymentSelection(false); setShowTapToPayDialog(true); }}
      />
    </>
  );
};

export default PwaBookingDetail;