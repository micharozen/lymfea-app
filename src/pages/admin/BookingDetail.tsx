import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, ArrowLeft, User, Users, Phone,
  Calendar, Clock, Building2, HandHeart, DoorOpen,
  CheckCircle2, AlertCircle, Send, Pencil,
  PenTool, ChevronRight, Package, History, MessageSquare,
  FileText, CreditCard
} from "lucide-react";
import { BookingHistoryTab } from "@/components/admin/booking/BookingHistoryTab";
import { BookingStatusStepper } from "@/components/admin/booking/BookingStatusStepper";
import { BookingNotesSection } from "@/components/admin/details/BookingNotesSection";
import { ClientTypeBadge } from "@/components/booking/ClientTypeBadge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { formatPrice } from "@/lib/formatPrice";
import { SendPaymentLinkDialog } from "@/components/booking/SendPaymentLinkDialog";
import { InvoicePreviewDialog } from "@/components/booking/InvoicePreviewDialog";
import EditBookingDialog from "@/components/EditBookingDialog";
import { useBookingData } from "@/hooks/booking/useBookingData";
import { useEffectiveRole } from "@/hooks/useEffectiveRole";
import { InvoiceSignatureDialog } from "@/components/InvoiceSignatureDialog";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import {
  computeTherapistEarnings,
  hasCompleteRates,
  type TherapistRates,
} from "@/lib/therapistEarnings";

const PAYMENT_LABELS: Record<string, string> = {
  pending: "Paiement en attente",
  paid: "Payé",
  failed: "Paiement échoué",
  refunded: "Remboursé",
  charged_to_room: "Facturé chambre",
  pending_partner_billing: "Paiement partenaire",
  card_saved: "Carte enregistrée",
  offert: "Offert",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  room: "Facturé en chambre",
  card: "Carte bancaire",
  tap_to_pay: "Tap to Pay",
  offert: "Offert",
  gift_amount: "Carte cadeau",
  voucher: "Payé par voucher — encaissé par le lieu",
  partner_billed: "Facturé au partenaire (fin de mois)",
};

export default function BookingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { t } = useTranslation('admin');
  const { showsConciergeUx: isConcierge } = useEffectiveRole();

  const [activeTab, setActiveTab] = useState("details");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPaymentLinkOpen, setIsPaymentLinkOpen] = useState(false);
  const [isMarkPaidOpen, setIsMarkPaidOpen] = useState(false);
  const [markPaidMethod, setMarkPaidMethod] = useState<string>("");
  const [markPaidLoading, setMarkPaidLoading] = useState(false);
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false);
  const [invoiceHTML, setInvoiceHTML] = useState("");
  const [invoiceBookingId, setInvoiceBookingId] = useState<number | null>(null);
  const [invoiceIsRoomPayment, setInvoiceIsRoomPayment] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [signingLoading, setSigningLoading] = useState(false);
  const [bundleInfo, setBundleInfo] = useState<{
    bundleName: string;
    remainingSessions: number;
    totalSessions: number;
  } | null>(null);
  const [therapistRatesMap, setTherapistRatesMap] = useState<Record<string, TherapistRates>>({});
  const [hotelCommission, setHotelCommission] = useState<{ therapist_commission: number; global_therapist_commission: boolean } | null>(null);
  const [acceptedTherapists, setAcceptedTherapists] = useState<Array<{ id: string; first_name: string; last_name: string }>>([]);
  const [therapistRefreshKey, setTherapistRefreshKey] = useState(0);

  const { bookings, getHotelInfo, refetch } = useBookingData();
  const isLoading = !bookings; 
  
  const booking = bookings?.find((b) => b.id === id);

  // Fetch bundle info when booking has a bundle_usage_id
  useEffect(() => {
    const bundleUsageId = (booking as any)?.bundle_usage_id;
    if (!bundleUsageId) {
      setBundleInfo(null);
      return;
    }
    supabase
      .from("bundle_session_usages")
      .select("customer_bundle_id, customer_treatment_bundles(total_sessions, used_sessions, treatment_bundles(name))")
      .eq("id", bundleUsageId)
      .single()
      .then(({ data }) => {
        if (data) {
          const customerBundle = (data as any).customer_treatment_bundles;
          const bundleName = customerBundle?.treatment_bundles?.name || "";
          const total = customerBundle?.total_sessions || 0;
          const used = customerBundle?.used_sessions || 0;
          setBundleInfo({ bundleName, remainingSessions: total - used, totalSessions: total });
        }
      });
  }, [booking?.id]);

  // Fetch all accepted therapists for duo bookings
  useEffect(() => {
    const guestCount = (booking as any)?.guest_count ?? 1;
    if (!booking?.id || guestCount <= 1) {
      setAcceptedTherapists([]);
      return;
    }
    (async () => {
      const { data: btData } = await supabase
        .from("booking_therapists")
        .select("therapist_id")
        .eq("booking_id", booking.id)
        .eq("status", "accepted");
      if (!btData || btData.length === 0) { setAcceptedTherapists([]); return; }
      const { data: tData } = await supabase
        .from("therapists")
        .select("id, first_name, last_name")
        .in("id", btData.map((bt) => bt.therapist_id));
      setAcceptedTherapists(tData || []);
    })();
  }, [booking?.id, (booking as any)?.guest_count, therapistRefreshKey]);

  // Fetch hotel commission settings for earnings calculation
  useEffect(() => {
    if (!booking?.hotel_id) { setHotelCommission(null); return; }
    supabase
      .from("hotels")
      .select("therapist_commission, global_therapist_commission")
      .eq("id", booking.hotel_id)
      .single()
      .then(({ data }) => {
        if (data) setHotelCommission({
          therapist_commission: (data as any).therapist_commission ?? 70,
          global_therapist_commission: (data as any).global_therapist_commission !== false,
        });
      });
  }, [booking?.hotel_id]);

  // Fetch therapist rates for earnings estimation (all accepted therapists for duo, primary for solo)
  useEffect(() => {
    const guestCount = (booking as any)?.guest_count ?? 1;
    if (guestCount > 1) {
      if (acceptedTherapists.length === 0) { setTherapistRatesMap({}); return; }
      supabase
        .from("therapists")
        .select("id, rate_60, rate_75, rate_90")
        .in("id", acceptedTherapists.map((t) => t.id))
        .then(({ data }) => {
          const map: Record<string, TherapistRates> = {};
          (data || []).forEach((t: any) => {
            map[t.id] = { rate_60: t.rate_60, rate_75: t.rate_75, rate_90: t.rate_90 };
          });
          setTherapistRatesMap(map);
        });
    } else {
      const therapistId = booking?.therapist_id;
      if (!therapistId) { setTherapistRatesMap({}); return; }
      supabase
        .from("therapists")
        .select("id, rate_60, rate_75, rate_90")
        .eq("id", therapistId)
        .single()
        .then(({ data }) => {
          if (data) setTherapistRatesMap({ [data.id]: { rate_60: data.rate_60, rate_75: data.rate_75, rate_90: data.rate_90 } });
          else setTherapistRatesMap({});
        });
    }
  }, [booking?.therapist_id, booking?.id, (booking as any)?.guest_count, acceptedTherapists]);

  if (isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!booking) return <div className="p-10 text-center text-muted-foreground">Réservation introuvable.</div>;

  const isPaid = booking.payment_status === 'paid' || booking.payment_status === 'charged_to_room';
  const isPartnerBilled = booking.payment_status === 'pending_partner_billing';
  const isSigned = !!booking.signed_at;

  const hotelInfo = getHotelInfo(booking.hotel_id);
  const currency = hotelInfo?.currency || 'EUR';
  
  // Réservation offerte : prix forcé à 0 (sinon le fallback ci-dessous
  // réafficherait le prix réel des soins).
  const isOffert = booking.payment_status === "offert";
  const displayPrice = isOffert
    ? 0
    : (booking.total_price && booking.total_price > 0
      ? booking.total_price
      : booking.treatmentsTotalPrice);

  const totalDuration = booking.totalDuration || booking.treatmentsTotalDuration || 0;
  const guestCount = (booking as any)?.guest_count ?? 1;
  const isDuo = guestCount > 1;
  const soloRates = !isDuo && booking.therapist_id ? (therapistRatesMap[booking.therapist_id] ?? null) : null;
  const therapistEarnings = computeTherapistEarnings(soloRates, totalDuration);
  const ratesComplete = hasCompleteRates(soloRates);
  const showEarnings = !isDuo && !!booking.therapist_id && Object.keys(therapistRatesMap).length > 0;
  const clientType = (booking as any).client_type || (booking.room_number ? "hotel" : "external");
  const isExternal = clientType === "external";
  const paymentInfos = booking.booking_payment_infos;
  const hasSavedCard = !!paymentInfos
    && paymentInfos.payment_status === "card_saved"
    && !!paymentInfos.stripe_payment_method_id;
  const cardSavedToCharge = isExternal
    && (hasSavedCard || booking.payment_status === "card_saved")
    && ["pending", "card_saved"].includes(booking.payment_status || "pending");
  const paymentLabel = cardSavedToCharge
    ? "Carte enregistrée à débiter"
    : (PAYMENT_LABELS[booking.payment_status || "pending"] ?? PAYMENT_LABELS.pending);

  // Payment breakdown for the "Paiement" card. total_price already includes the
  // out-of-hours surcharge, which is also stored separately on surcharge_amount.
  const surchargeAmount = booking.is_out_of_hours ? (booking.surcharge_amount ?? 0) : 0;
  // Offert: show the real treatment price as subtotal, then a negative "Offert"
  // line that brings the total back to 0 (instead of a flat 0 everywhere).
  const offertOriginalPrice = isOffert ? (booking.treatmentsTotalPrice || 0) : 0;
  const subtotal = isOffert
    ? offertOriginalPrice
    : Math.max(displayPrice - surchargeAmount, 0);
  const surchargePercent = subtotal > 0 ? Math.round((surchargeAmount / subtotal) * 100) : 0;
  const hasSurcharge = surchargeAmount > 0;
  const giftPaid = ((booking as any).gift_amount_applied_cents ?? 0) / 100;
  const paidAmount = isPaid ? displayPrice : Math.min(giftPaid, displayPrice);
  const remainingDue = Math.max(displayPrice - paidAmount, 0);
  const methodLabel = booking.payment_method
    ? (PAYMENT_METHOD_LABELS[booking.payment_method] || booking.payment_method)
    : "À définir";

  const handleMarkAsPaid = async () => {
    if (!booking || !markPaidMethod) return;
    setMarkPaidLoading(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ payment_status: "paid", payment_method: markPaidMethod })
        .eq("id", booking.id);
      if (error) throw error;
      toast.success("Paiement enregistré.");
      setIsMarkPaidOpen(false);
      refetch();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erreur lors de l'enregistrement du paiement.");
    } finally {
      setMarkPaidLoading(false);
    }
  };

  const handleSignatureConfirm = async (signatureData: string) => {
    setSigningLoading(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({
          client_signature: signatureData,
          signed_at: new Date().toISOString(),
          status: booking.status === 'confirmed' ? 'completed' : booking.status 
        })
        .eq("id", booking.id);

      if (error) throw error;
      
      toast.success("Signature ajoutée avec succès au dossier !");
      setIsSignatureOpen(false);
      
      refetch();
      
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erreur lors de l'enregistrement de la signature");
    } finally {
      setSigningLoading(false);
    }
  };

  const handleInvoiceClick = async () => {
    if (!booking) return;
    if (booking.stripe_invoice_url) {
      window.open(booking.stripe_invoice_url, "_blank");
      return;
    }
    setInvoiceLoading(true);
    const { data, error } = await invokeEdgeFunction<unknown, { html: string; bookingId: string }>(
      "generate-invoice",
      { body: { bookingId: booking.id } }
    );
    setInvoiceLoading(false);
    if (error || !data) {
      toast.error("Impossible de générer la facture.");
      return;
    }
    setInvoiceHTML(data.html);
    setInvoiceBookingId(Number(data.bookingId));
    setInvoiceIsRoomPayment(booking.payment_method === "room");
    setIsInvoicePreviewOpen(true);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 pb-20">
      <header className="sticky top-0 z-10 bg-white border-b px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="flex-shrink-0">
            <ArrowLeft className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Retour</span>
          </Button>
        </div>

        <div className="flex flex-1 items-center gap-3 justify-center flex-wrap min-w-0">
          <h1 className="text-xl font-bold text-gray-900 whitespace-nowrap">Réservation #{booking.booking_id}</h1>
          <ClientTypeBadge clientType={(booking as any).client_type || (booking.room_number ? "hotel" : "external")} />
          {booking.room_number ? (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              Ch. {booking.room_number}
            </Badge>
          ) : (booking as any).client_type === "hotel" && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
              <AlertCircle className="w-3 h-3 mr-1" />
              Chambre à renseigner
            </Badge>
          )}
          <StatusBadge status={booking.status} type="booking" />
          <StatusBadge
            status={booking.payment_status || "pending"}
            type="payment"
            customLabel={paymentLabel}
          />
          {isDuo && (
            <span className="inline-flex items-center rounded-md border font-medium h-6 px-2 text-xs gap-1.5 bg-purple-100 text-purple-800 border-purple-200">
              <Users className="w-3.5 h-3.5 shrink-0" />
              Duo
            </span>
          )}
          {bundleInfo && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
              <Package className="w-3 h-3 mr-1" />
              {t('cures.bundleSession')} — {bundleInfo.bundleName} ({t('cures.remainingCount', { remaining: bundleInfo.remainingSessions, total: bundleInfo.totalSessions })})
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={() => setIsNotesOpen(true)}>
            <MessageSquare className="h-4 w-4 mr-2" /> Notes
          </Button>
          {booking.status === "completed" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleInvoiceClick}
                  disabled={invoiceLoading}
                >
                  {invoiceLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4 mr-2" />
                  )}
                  {booking.stripe_invoice_url
                    ? "Facture"
                    : booking.payment_method === "room"
                      ? "Bon"
                      : "Facture"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {booking.stripe_invoice_url
                  ? "Voir la facture Stripe"
                  : booking.payment_method === "room"
                    ? "Télécharger le Bon de Prestation"
                    : "Aperçu de la facture (PDF)"}
              </TooltipContent>
            </Tooltip>
          )}
          {!isConcierge && !isPartnerBilled && !cardSavedToCharge && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={isPaid ? 0 : -1} className={isPaid ? "cursor-not-allowed" : undefined}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsPaymentLinkOpen(true)}
                    disabled={isPaid}
                    className={isPaid ? "pointer-events-none" : undefined}
                  >
                    <Send className="h-4 w-4 mr-2" /> Paiement
                  </Button>
                </span>
              </TooltipTrigger>
              {isPaid && (
                <TooltipContent>
                  Paiement déjà effectué pour cette réservation
                </TooltipContent>
              )}
            </Tooltip>
          )}
          <Button variant="default" size="sm" onClick={() => setIsEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" /> Modifier
          </Button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-4">
        <BookingStatusStepper status={booking.status} paymentStatus={booking.payment_status || "pending"} />
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="details">Détails</TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="h-3.5 w-3.5" />
              Historique
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {isPaid ? (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 flex items-center gap-2.5 text-green-800">
            <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
            <span className="font-medium text-sm">Le paiement a été réalisé avec succès.</span>
          </div>
        ) : isPartnerBilled ? (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5 flex items-center gap-2.5 text-indigo-800">
            <CheckCircle2 className="h-4 w-4 text-indigo-600 flex-shrink-0" />
            <span className="font-medium text-sm">Paiement géré par le partenaire (facturation mensuelle).</span>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2.5 text-amber-800">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <span className="font-medium text-sm">En attente de règlement.</span>
          </div>
        )}

        {isSigned ? (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-blue-800">
            <div className="flex items-center gap-2.5 min-w-0">
              <CheckCircle2 className="h-4 w-4 text-blue-600 flex-shrink-0" />
              <span className="font-medium text-sm truncate">Décharge signée</span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-xs opacity-70 hidden lg:inline">
                Le {format(new Date(booking.signed_at), "d MMM à HH:mm", { locale: fr })}
              </span>
              {!isConcierge && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="cursor-not-allowed">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled
                        className="pointer-events-none text-green-600 border-green-200 bg-green-50"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" /> Signé
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Décharge déjà signée
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-red-800">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
              <span className="font-medium text-sm truncate">Décharge non signée</span>
            </div>
            {!isConcierge && (
              <Button
                variant="outline"
                size="sm"
                className="flex-shrink-0 text-purple-600 border-purple-200 bg-white hover:bg-purple-50 hover:text-purple-700"
                onClick={() => setIsSignatureOpen(true)}
              >
                <PenTool className="h-4 w-4 mr-2" /> Signature
              </Button>
            )}
          </div>
        )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          
          <div className="space-y-6">

            <section
              onClick={() => (booking as any).customer_id && navigate(`/admin/customers/${(booking as any).customer_id}`)}
              className={`bg-white rounded-xl border p-6 shadow-sm transition-all duration-200 ${(booking as any).customer_id ? 'cursor-pointer hover:border-primary/50 hover:shadow-md group' : ''}`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-muted-foreground uppercase flex items-center gap-2">
                  <User className="h-4 w-4" /> Client
                </h3>
                {(booking as any).customer_id && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-200 translate-x-[-10px] group-hover:translate-x-0" />
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Nom</p>
                  <p className="font-medium">{booking.client_first_name} {booking.client_last_name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Contact</p>
                  <p className="text-sm">{booking.phone || "-"} / {booking.client_email || "-"}</p>
                </div>
              </div>
              {(booking as any).client_note && (
                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-xs text-amber-700 dark:text-amber-400 mb-1 font-medium">Note</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{(booking as any).client_note}</p>
                </div>
              )}
            </section>

            <section className="bg-white rounded-xl border p-6 shadow-sm">
              <h3 className="text-sm font-bold text-muted-foreground uppercase mb-4 flex items-center gap-2">
                <HandHeart className="h-4 w-4" /> Soins & Praticien
              </h3>
              
              {isDuo ? (
                <div className="mb-4 space-y-2">
                  <p className="text-xs text-gray-500">
                    Thérapeutes assignés ({acceptedTherapists.length}/{guestCount})
                  </p>
                  {acceptedTherapists.length > 0 ? acceptedTherapists.map((therapist) => (
                    <div
                      key={therapist.id}
                      onClick={() => navigate(`/admin/therapists/${therapist.id}`)}
                      className="p-3 bg-muted/30 rounded-lg flex items-center justify-between transition-all duration-200 border border-transparent cursor-pointer hover:bg-muted/50 hover:border-primary/40 group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {therapist.first_name?.charAt(0) || "?"}
                        </div>
                        <p className="font-semibold text-sm">{therapist.first_name} {therapist.last_name}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-[-10px] group-hover:translate-x-0" />
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground">Aucun thérapeute n'a encore rejoint ce soin</p>
                  )}
                  {acceptedTherapists.length > 0 && acceptedTherapists.length < guestCount && (
                    <p className="text-xs text-violet-600">
                      En attente de {guestCount - acceptedTherapists.length} thérapeute(s) supplémentaire(s)…
                    </p>
                  )}
                </div>
              ) : (
                <div
                  onClick={() => booking.therapist_id && navigate(`/admin/therapists/${booking.therapist_id}`)}
                  className={`mb-4 p-3 bg-muted/30 rounded-lg flex items-center justify-between transition-all duration-200 border border-transparent ${booking.therapist_id ? 'cursor-pointer hover:bg-muted/50 hover:border-primary/40 group' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {booking.therapist_name?.charAt(0) || "?"}
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Thérapeute assigné</p>
                      <p className="font-semibold text-sm">{booking.therapist_name || "Non assigné"}</p>
                    </div>
                  </div>
                  {booking.therapist_id && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-[-10px] group-hover:translate-x-0" />
                  )}
                </div>
              )}
              
              <div className="space-y-3">
                {booking.treatments?.map((t, i) => (
                  <div key={i} className="flex flex-col gap-1 p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium">{t.name} ({t.duration} min)</span>
                    <span className="font-semibold whitespace-nowrap">{formatPrice(t.price || 0, currency)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="bg-white rounded-xl border p-6 shadow-sm">
              <h3 className="text-sm font-bold text-muted-foreground uppercase mb-4">Date/Horaire/Lieu</h3>
              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span>{booking.booking_date ? format(new Date(booking.booking_date), "EEEE d MMMM", { locale: fr }) : "-"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span>{booking.booking_time?.substring(0, 5) || "-"}{totalDuration > 0 && ` — ${totalDuration} min`}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-gray-400" />
                  <span>{hotelInfo?.name || "-"}</span>
                </div>
                {booking.room_name && (
                  <div className="flex items-center gap-3">
                    <DoorOpen className="h-4 w-4 text-gray-400" />
                    <span>{booking.room_name}</span>
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center gap-2.5 mb-5">
                <CreditCard className="h-5 w-5 text-gray-400" />
                <span className="text-xs font-semibold tracking-[0.15em] text-gray-400 uppercase">Paiement</span>
              </div>

              <p className="text-sm text-gray-400 mb-1">Méthode</p>
              <p className="text-lg font-bold text-gray-900 capitalize">{methodLabel}</p>
              {(booking as any).payment_reference && (
                <p className="mt-1 font-mono text-[11px] text-gray-400">
                  Réf. voucher : {(booking as any).payment_reference}
                </p>
              )}

              <div className="border-t border-gray-100 my-4" />

              <div className="flex justify-between items-center text-base">
                <span className="text-gray-500">Sous-total</span>
                <span className="text-gray-500">{formatPrice(subtotal, currency)}</span>
              </div>

              {hasSurcharge && (
                <div className="flex justify-between items-center mt-3 text-base font-semibold text-amber-600">
                  <span className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0" />
                    Majoration hors horaires ({surchargePercent}%)
                  </span>
                  <span className="whitespace-nowrap">+{formatPrice(surchargeAmount, currency)}</span>
                </div>
              )}

              {isOffert && (
                <div className="flex justify-between items-center mt-3 text-base font-semibold text-amber-600">
                  <span>Offert</span>
                  <span className="whitespace-nowrap">−{formatPrice(offertOriginalPrice, currency)}</span>
                </div>
              )}

              <div className="border-t border-gray-100 my-4" />

              <div className="flex justify-between items-baseline">
                <span className="text-lg text-gray-500">Total</span>
                <span className="text-3xl font-extrabold text-gray-900">{formatPrice(displayPrice, currency)}</span>
              </div>

              <div className="border-t border-gray-100 my-4" />

              <div className="flex justify-between items-baseline">
                <span className="text-gray-500">Payé</span>
                <span className="text-base">
                  <span className="font-bold text-gray-900">{formatPrice(paidAmount, currency)}</span>
                  <span className="text-gray-400"> / {formatPrice(displayPrice, currency)}</span>
                </span>
              </div>

              <div className="flex justify-between items-baseline mt-3">
                <span className="text-gray-500">Reste dû</span>
                <span className={`text-lg font-bold ${remainingDue > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  {formatPrice(remainingDue, currency)}
                </span>
              </div>

              {!isPaid && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-5"
                  onClick={() => { setMarkPaidMethod(booking.payment_method ?? ""); setIsMarkPaidOpen(true); }}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Marquer comme payé
                </Button>
              )}
            </section>

            {(showEarnings || (isDuo && acceptedTherapists.length > 0 && hotelCommission)) && (
              <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                {showEarnings && (
                  <div>
                    <p className="text-xs font-semibold tracking-[0.15em] text-gray-400 uppercase mb-2">Gain thérapeute</p>
                    {ratesComplete && therapistEarnings != null ? (
                      <p className="text-xl font-bold text-gray-900">{formatPrice(therapistEarnings, currency)}</p>
                    ) : (
                      <p className="text-xs text-amber-600">Tarifs thérapeute incomplets — gain non calculable</p>
                    )}
                  </div>
                )}

                {isDuo && acceptedTherapists.length > 0 && hotelCommission && (
                  <div className={showEarnings ? "mt-4 pt-4 border-t border-gray-100" : undefined}>
                    <p className="text-xs font-semibold tracking-[0.15em] text-gray-400 uppercase mb-2">Répartition des gains</p>
                    {acceptedTherapists.map((therapist) => {
                      let earnings: number | null;
                      if (!hotelCommission.global_therapist_commission) {
                        earnings = computeTherapistEarnings(therapistRatesMap[therapist.id] ?? null, totalDuration);
                      } else {
                        const pricePerTherapist = displayPrice / guestCount;
                        earnings = Math.round(pricePerTherapist * (hotelCommission.therapist_commission / 100) * 100) / 100;
                      }
                      return (
                        <div key={therapist.id} className="flex justify-between items-center mb-1.5">
                          <p className="text-sm text-gray-500">{therapist.first_name} {therapist.last_name}</p>
                          {earnings != null ? (
                            <p className="text-sm font-semibold text-gray-900">{formatPrice(earnings, currency)}</p>
                          ) : (
                            <p className="text-xs text-amber-600">Tarifs incomplets</p>
                          )}
                        </div>
                      );
                    })}
                    {hotelCommission.global_therapist_commission && (() => {
                      const totalTherapistEarnings = acceptedTherapists.reduce((sum) => {
                        const pricePerTherapist = displayPrice / guestCount;
                        return sum + Math.round(pricePerTherapist * (hotelCommission.therapist_commission / 100) * 100) / 100;
                      }, 0);
                      const hotelShare = Math.round((displayPrice - totalTherapistEarnings) * 100) / 100;
                      return (
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
                          <p className="text-sm text-gray-400">Part établissement</p>
                          <p className="text-sm font-semibold text-gray-500">{formatPrice(hotelShare, currency)}</p>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>

          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <BookingHistoryTab bookingId={id!} enabled={activeTab === "history"} />
          </TabsContent>
        </Tabs>
      </main>

      <EditBookingDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        booking={booking}
        initialMode="edit"
        onSuccess={() => setTherapistRefreshKey(k => k + 1)}
      />
      
      <SendPaymentLinkDialog
        open={isPaymentLinkOpen}
        onOpenChange={setIsPaymentLinkOpen}
        booking={booking}
      />

      <Dialog open={isMarkPaidOpen} onOpenChange={setIsMarkPaidOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Marquer comme payé</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label className="text-sm text-gray-500">Méthode de paiement</label>
            <Select value={markPaidMethod} onValueChange={setMarkPaidMethod}>
              <SelectTrigger><SelectValue placeholder="Choisir une méthode" /></SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMarkPaidOpen(false)}>Annuler</Button>
            <Button onClick={handleMarkAsPaid} disabled={!markPaidMethod || markPaidLoading}>
              {markPaidLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmer le paiement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InvoicePreviewDialog
        open={isInvoicePreviewOpen}
        onOpenChange={setIsInvoicePreviewOpen}
        invoiceHTML={invoiceHTML}
        bookingId={invoiceBookingId}
        isRoomPayment={invoiceIsRoomPayment}
      />

      <InvoiceSignatureDialog
        open={isSignatureOpen}
        onOpenChange={setIsSignatureOpen}
        onConfirm={handleSignatureConfirm}
        signatureToken={booking.signature_token}
        loading={signingLoading}
        treatments={(booking.treatments || []).map(t => ({
          name: t.name || "",
          duration: t.duration || 0,
          price: t.price || 0
        }))}
        vatRate={20}
        totalPrice={displayPrice}
        isAlreadyPaid={isPaid}
        currency={currency}
      />

      <Sheet open={isNotesOpen} onOpenChange={setIsNotesOpen}>
        <SheetContent side="right" className="sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Notes internes
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-hidden px-1">
            <BookingNotesSection bookingId={id!} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}