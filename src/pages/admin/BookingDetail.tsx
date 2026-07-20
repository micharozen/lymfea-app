import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, ArrowLeft, User, Users, Banknote, Gift, Ticket, Smartphone,
  Calendar, Clock, Building2, MoreHorizontal, ChevronDown,
  CheckCircle2, AlertCircle, Send, Pencil,
  PenTool, ChevronRight, Package, History, MessageSquare,
  FileText, CreditCard, ListTodo, Undo2
} from "lucide-react";
import { BookingHistoryTab } from "@/components/admin/booking/BookingHistoryTab";
import { BookingTasksTab } from "@/components/admin/tasks/BookingTasksTab";
import { TreatmentsByTherapist } from "@/components/admin/booking/TreatmentsByTherapist";
import { ConvertToDuoDialog } from "@/components/admin/booking/ConvertToDuoDialog";
import { BookingStatusStepper } from "@/components/admin/booking/BookingStatusStepper";
import { BookingNotesSection } from "@/components/admin/details/BookingNotesSection";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { formatPrice } from "@/lib/formatPrice";
import { getBookingStatusConfig } from "@/utils/statusStyles";
import { SendPaymentLinkDialog } from "@/components/booking/SendPaymentLinkDialog";
import { InvoicePreviewDialog } from "@/components/booking/InvoicePreviewDialog";
import EditBookingDialog from "@/components/EditBookingDialog";
import { useBookingData } from "@/hooks/booking/useBookingData";
import { useEffectiveRole } from "@/hooks/useEffectiveRole";
import { InvoiceSignatureDialog } from "@/components/InvoiceSignatureDialog";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { type TherapistRates } from "@/lib/therapistEarnings";
import {
  CLIENT_TYPE_META, PARTNER_BILLED_CLIENT_TYPES, isPartnerBilledClientType,
  normalizeBookingClientType, type BookingClientType,
} from "@/lib/clientTypeMeta";
import { derivePaymentForClientType, isPaymentStatusLocked } from "@/lib/clientTypePayment";

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
  stripe: "Stripe",
  cash: "Espèces",
  tap_to_pay: "Tap to Pay",
  offert: "Offert",
  gift_amount: "Carte cadeau",
  voucher: "Payé par voucher — encaissé par le lieu",
  partner_billed: "Facturé au partenaire (fin de mois)",
};

// Origine de la réservation (colonne bookings.source) → tag affiché dans le header.
// label = texte, className = couleurs du badge (bg + texte + bordure).
const SOURCE_TAGS: Record<string, { label: string; className: string }> = {
  client: { label: "Site", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  admin: { label: "Admin", className: "bg-blue-50 text-blue-700 border-blue-200" },
  concierge: { label: "Gestion du lieu", className: "bg-amber-50 text-amber-700 border-amber-200" },
  pwa: { label: "App thérapeute", className: "bg-purple-50 text-purple-700 border-purple-200" },
  phone: { label: "Téléphone", className: "bg-stone-100 text-stone-600 border-stone-200" },
  email: { label: "Email", className: "bg-stone-100 text-stone-600 border-stone-200" },
  api: { label: "API", className: "bg-stone-100 text-stone-600 border-stone-200" },
};

const PAYMENT_METHOD_ICONS: Record<string, typeof CreditCard> = {
  room: Building2,
  card: CreditCard,
  stripe: CreditCard,
  cash: Banknote,
  tap_to_pay: Smartphone,
  offert: Gift,
  gift_amount: Gift,
  voucher: Ticket,
  partner_billed: Building2,
};

// Hex → pastille : la couleur vient de statusStyles, le rendu est un point +
// label (moins de bruit visuel que deux badges pleins côte à côte).
function StatusDot({ hexColor, label, pulse, muted }: { hexColor: string; label: string; pulse?: boolean; muted?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-0.5 text-xs font-medium ${muted ? "text-gray-400 line-through" : "text-gray-700"}`}>
      <span
        className={`h-1.5 w-1.5 rounded-full shrink-0 ${pulse ? "animate-pulse" : ""}`}
        style={{ backgroundColor: hexColor }}
      />
      {label}
    </span>
  );
}

/** Regroupe les états open/close des dialogues de la page (aucune logique métier). */
function useBookingDetailDialogs() {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPaymentLinkOpen, setIsPaymentLinkOpen] = useState(false);
  const [isMarkPaidOpen, setIsMarkPaidOpen] = useState(false);
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false);
  const [isConvertToDuoOpen, setIsConvertToDuoOpen] = useState(false);
  return {
    isEditOpen, setIsEditOpen,
    isPaymentLinkOpen, setIsPaymentLinkOpen,
    isMarkPaidOpen, setIsMarkPaidOpen,
    isSignatureOpen, setIsSignatureOpen,
    isInvoicePreviewOpen, setIsInvoicePreviewOpen,
    isConvertToDuoOpen, setIsConvertToDuoOpen,
  };
}

export default function BookingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { t } = useTranslation('admin');
  const { showsConciergeUx: isConcierge } = useEffectiveRole();

  const [activeTab, setActiveTab] = useState("history");
  const dialogs = useBookingDetailDialogs();
  const [markPaidMethod, setMarkPaidMethod] = useState<string>("");
  const [markPaidPartner, setMarkPaidPartner] = useState<BookingClientType | "">("");
  const [markPaidLoading, setMarkPaidLoading] = useState(false);
  // "pay" = encaissement (fixe le statut), "method" = correction de la méthode
  // sur une réservation déjà réglée (le statut n'est pas touché).
  const [markPaidMode, setMarkPaidMode] = useState<"pay" | "method">("pay");
  const [invoiceHTML, setInvoiceHTML] = useState("");
  const [invoiceBookingId, setInvoiceBookingId] = useState<number | null>(null);
  const [invoiceIsRoomPayment, setInvoiceIsRoomPayment] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [signingLoading, setSigningLoading] = useState(false);
  const [isPaymentDetailOpen, setIsPaymentDetailOpen] = useState(false);
  const [bundleInfo, setBundleInfo] = useState<{
    bundleName: string;
    remainingSessions: number;
    totalSessions: number;
  } | null>(null);
  const [therapistRatesMap, setTherapistRatesMap] = useState<Record<string, TherapistRates>>({});
  const [hotelCommission, setHotelCommission] = useState<{ therapist_commission: number; global_therapist_commission: boolean } | null>(null);
  const [acceptedTherapists, setAcceptedTherapists] = useState<Array<{ id: string; first_name: string; last_name: string }>>([]);
  const [therapistRefreshKey, setTherapistRefreshKey] = useState(0);

  const { bookings, therapists, getHotelInfo, refetch } = useBookingData();
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

  // Payment metadata from booking_payment_infos: when it was paid (payment_at) and,
  // for cancellations, the time + who cancelled (cancelled_by = staff user id;
  // NULL means the client cancelled via the public flow).
  const { data: paymentMeta } = useQuery({
    queryKey: ["booking-payment-meta", booking?.id],
    enabled: !!booking?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("booking_payment_infos")
        .select("payment_at, cancelled_at, cancelled_by, refund_amount, stripe_refund_id")
        .eq("booking_id", booking!.id)
        .maybeSingle();
      return data ?? null;
    },
  });

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
        .select("therapist_id, assigned_at")
        .eq("booking_id", booking.id)
        .eq("status", "accepted")
        .order("assigned_at", { ascending: true });
      if (!btData || btData.length === 0) { setAcceptedTherapists([]); return; }
      const { data: tData } = await supabase
        .from("therapists")
        .select("id, first_name, last_name")
        .in("id", btData.map((bt) => bt.therapist_id));
      // Preserve acceptance order (assigned_at) — the .in() result order is not guaranteed
      // and the positional treatment↔therapist mapping depends on a stable order.
      const byId = new Map((tData || []).map((t) => [t.id, t]));
      setAcceptedTherapists(
        btData.map((bt) => byId.get(bt.therapist_id)).filter((t): t is NonNullable<typeof t> => !!t),
      );
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
  const isRoomPayment = booking.payment_method === 'room' || booking.payment_status === 'charged_to_room';
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

  // Out-of-hours surcharge percent (derived from the stored amount, matches the
  // client breakdown). Applied as an uplift on the therapist earning below.
  const surchargeAmount = booking.is_out_of_hours ? (booking.surcharge_amount ?? 0) : 0;
  const offertOriginalPrice = isOffert ? (booking.treatmentsTotalPrice || 0) : 0;
  const subtotal = isOffert
    ? offertOriginalPrice
    : Math.max(displayPrice - surchargeAmount, 0);
  const surchargePercent = subtotal > 0 ? Math.round((surchargeAmount / subtotal) * 100) : 0;
  const hasSurcharge = surchargeAmount > 0;

  const totalDuration = booking.totalDuration || booking.treatmentsTotalDuration || 0;
  const guestCount = (booking as any)?.guest_count ?? 1;
  const isDuo = guestCount > 1;
  // Un accès « amenity » (piscine, sauna…) ne consomme ni salle ni thérapeute.
  // hasService = au moins un vrai soin ; un booking 100% accès n'a aucun
  // praticien à afficher/assigner (TreatmentsByTherapist s'en charge au rendu).
  const treatmentsList = booking.treatments ?? [];
  const hasService = treatmentsList.some((t) => !t.is_amenity);
  // One-way conversion solo → duo (dispatch a therapist per soin). Requires ≥ 2
  // soins and a live booking. awaiting_hairdresser_selection was removed.
  const canConvertToDuo =
    !isDuo &&
    hasService &&
    treatmentsList.filter((t) => !t.is_amenity).length > 1 &&
    ["pending", "confirmed"].includes(booking.status);
  const clientType = (booking as any).client_type || (booking.room_number ? "hotel" : "external");
  const isExternal = clientType === "external";
  // Nom + logo du partenaire (déjà stocké dans client_type), pour l'affichage.
  const normalizedClientType = normalizeBookingClientType(clientType);
  const partnerMeta = isPartnerBilledClientType(normalizedClientType)
    ? CLIENT_TYPE_META[normalizedClientType]
    : null;
  const partnerName = partnerMeta ? t(partnerMeta.labelKey) : null;
  const sourceTag = SOURCE_TAGS[(booking as any).source] ?? null;
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
  // out-of-hours surcharge (surchargeAmount / subtotal / surchargePercent computed above).
  const giftPaid = ((booking as any).gift_amount_applied_cents ?? 0) / 100;
  // Facturation partenaire : le client a réglé le partenaire, rien n'est dû ici.
  // Le montant est donc considéré comme soldé (le libellé reste "Paiement partenaire").
  const isSettled = isPaid || isPartnerBilled;
  const paidAmount = isSettled ? displayPrice : Math.min(giftPaid, displayPrice);
  const remainingDue = Math.max(displayPrice - paidAmount, 0);
  const paidRatio = displayPrice > 0 ? Math.min(paidAmount / displayPrice, 1) : (isSettled || isOffert ? 1 : 0);
  const methodLabel = booking.payment_method
    ? (PAYMENT_METHOD_LABELS[booking.payment_method] || booking.payment_method)
    : "À définir";
  const MethodIcon = booking.payment_method ? (PAYMENT_METHOD_ICONS[booking.payment_method] ?? CreditCard) : CreditCard;

  const cancellationDetail =
    booking.status === "cancelled" && paymentMeta?.cancelled_at
      ? `${format(new Date(paymentMeta.cancelled_at), "d MMM à HH:mm", { locale: fr })} · ${paymentMeta.cancelled_by ? "Annulé par l'établissement" : "Annulé par le client"}`
      : undefined;

  // Success banner is only meaningful for a real collected payment — not a room
  // charge (settled on the hotel folio, not actually paid here).
  const showPaymentSuccess = isPaid && !isRoomPayment;
  const paidAtDetail = paymentMeta?.payment_at
    ? format(new Date(paymentMeta.payment_at), "d MMM à HH:mm", { locale: fr })
    : undefined;

  // Remboursement (source de vérité = booking_payment_infos.refund_amount, en €).
  const refundedAmount = Number(paymentMeta?.refund_amount ?? 0);
  const hasRefund = refundedAmount > 0;

  const bookingStatusConfig = getBookingStatusConfig(booking.status);

  const canSendPaymentLink = !isConcierge && !isPartnerBilled && !cardSavedToCharge && !isPaid && !isOffert;
  const showInvoice = booking.status === "completed";
  const invoiceLabel = booking.stripe_invoice_url
    ? "Facture"
    : booking.payment_method === "room" ? "Bon de prestation" : "Facture";
  // Une seule action primaire, dictée par l'état du booking : terminé → facture,
  // impayé → encaisser, sinon → modifier.
  const primaryAction: "invoice" | "payment" | "edit" = showInvoice
    ? "invoice"
    : canSendPaymentLink
      ? "payment"
      : "edit";

  const openPaymentMethodDialog = (mode: "pay" | "method") => {
    setMarkPaidMode(mode);
    setMarkPaidMethod(booking.payment_method ?? "");
    setMarkPaidPartner(
      isPartnerBilledClientType(normalizeBookingClientType(clientType))
        ? normalizeBookingClientType(clientType)
        : "",
    );
    dialogs.setIsMarkPaidOpen(true);
  };

  const handleMarkAsPaid = async () => {
    if (!booking || !markPaidMethod) return;
    // Facturation partenaire : le partenaire doit être choisi, et le paiement
    // reste "pending_partner_billing" (encaissé côté partenaire en fin de mois),
    // pas "paid". Le partenaire choisi est persisté dans client_type.
    const isPartner = markPaidMethod === "partner_billed";
    const isMethodOnly = markPaidMode === "method" && !isPartner;
    if (isPartner && !markPaidPartner) return;
    // Ne pas réécraser un paiement déjà abouti/remboursé.
    if (isPartner && isPaymentStatusLocked(booking.payment_status)) {
      toast.error("Le statut de paiement est verrouillé (payé ou remboursé).");
      return;
    }
    setMarkPaidLoading(true);
    try {
      let update: Record<string, string | null>;
      if (isPartner) {
        const derived = derivePaymentForClientType(markPaidPartner as BookingClientType);
        update = {
          client_type: markPaidPartner,
          payment_method: derived.paymentMethod,
          payment_status: derived.paymentStatus,
        };
      } else if (isMethodOnly) {
        update = { payment_method: markPaidMethod };
      } else {
        update = { payment_status: "paid", payment_method: markPaidMethod };
      }
      const { error } = await supabase
        .from("bookings")
        .update(update)
        .eq("id", booking.id);
      if (error) throw error;
      // Stamp the payment time so the detail view can show "payé le …" — seulement
      // pour un vrai encaissement. La facturation partenaire n'est pas un paiement.
      if (!isPartner && !isMethodOnly) {
        await supabase
          .from("booking_payment_infos")
          .update({ payment_at: new Date().toISOString() })
          .eq("booking_id", booking.id);
      }
      toast.success(
        isPartner
          ? "Facturation partenaire enregistrée."
          : isMethodOnly
            ? "Méthode de paiement mise à jour."
            : "Paiement enregistré.",
      );
      dialogs.setIsMarkPaidOpen(false);
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
      dialogs.setIsSignatureOpen(false);

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
    dialogs.setIsInvoicePreviewOpen(true);
  };

  return (
    <div className="flex flex-col min-h-screen bg-stone-50 pb-20">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-stone-200 px-6 py-3">
        <div className="flex items-start justify-between gap-4 max-w-6xl mx-auto w-full">
          <div className="flex items-start gap-3 min-w-0">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="flex-shrink-0 mt-0.5 -ml-2">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Retour</span>
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap min-w-0">
                <h1 className="font-serif text-2xl leading-tight text-gray-900 truncate">
                  {booking.client_first_name} {booking.client_last_name}
                </h1>
                <span className="text-lg text-gray-400 whitespace-nowrap">#{booking.booking_id}</span>
                <StatusDot
                  hexColor={bookingStatusConfig.hexColor}
                  label={bookingStatusConfig.label}
                  pulse={bookingStatusConfig.pulse}
                  muted={booking.status === "cancelled"}
                />
                <StatusDot
                  hexColor={isPaid ? "#22c55e" : isPartnerBilled ? "#6366f1" : "#eab308"}
                  label={paymentLabel}
                />
                {sourceTag && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${sourceTag.className}`}
                  >
                    <span className="opacity-60">Source</span>
                    {sourceTag.label}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
                <span>{clientType === "hotel" ? "Client hôtel" : "Client externe"}</span>
                {booking.room_number && booking.room_number !== "TBD" ? (
                  <><span className="text-gray-300">·</span><span>Ch. {booking.room_number}</span></>
                ) : clientType === "hotel" && (
                  <><span className="text-gray-300">·</span><span className="text-amber-600">Chambre à renseigner</span></>
                )}
                {isDuo && hasService && (
                  <><span className="text-gray-300">·</span>
                  <span className="inline-flex items-center gap-1 text-purple-700">
                    <Users className="w-3 h-3" /> Duo {acceptedTherapists.length}/{guestCount}
                  </span></>
                )}
                {bundleInfo && (
                  <><span className="text-gray-300">·</span>
                  <span className="inline-flex items-center gap-1 text-amber-700">
                    <Package className="w-3 h-3" />
                    {t('cures.bundleSession')} — {bundleInfo.bundleName} ({t('cures.remainingCount', { remaining: bundleInfo.remainingSessions, total: bundleInfo.totalSessions })})
                  </span></>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {primaryAction === "invoice" && (
              <Button variant="default" size="sm" onClick={handleInvoiceClick} disabled={invoiceLoading}>
                {invoiceLabel}
                {invoiceLoading ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <FileText className="h-4 w-4 ml-2" />}
              </Button>
            )}
            {primaryAction === "payment" && (
              <Button variant="default" size="sm" onClick={() => dialogs.setIsPaymentLinkOpen(true)}>
                Envoyer le paiement <Send className="h-4 w-4 ml-2" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="rounded-md border-stone-200 px-2.5 text-xs text-stone-700 hover:bg-stone-50 hover:text-stone-900 [&_svg]:size-3.5"
              onClick={() => dialogs.setIsEditOpen(true)}
            >
              Modifier <Pencil />
            </Button>
            {(canConvertToDuo || (showInvoice && primaryAction !== "invoice") || (!isSigned && !isConcierge)) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="px-2">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Plus d'actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canConvertToDuo && (
                    <DropdownMenuItem onClick={() => dialogs.setIsConvertToDuoOpen(true)}>
                      <Users className="h-4 w-4 mr-2" /> {t("booking.convertToDuo.button")}
                    </DropdownMenuItem>
                  )}
                  {!isSigned && !isConcierge && (
                    <DropdownMenuItem onClick={() => dialogs.setIsSignatureOpen(true)}>
                      <PenTool className="h-4 w-4 mr-2" /> Demander la signature
                    </DropdownMenuItem>
                  )}
                  {showInvoice && primaryAction !== "invoice" && (
                    <DropdownMenuItem onClick={handleInvoiceClick} disabled={invoiceLoading}>
                      <FileText className="h-4 w-4 mr-2" /> {invoiceLabel}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-6">
        <BookingStatusStepper status={booking.status} paymentStatus={booking.payment_status || "pending"} cancellationDetail={cancellationDetail} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Colonne principale : le « quoi » — soins, thérapeutes, client, activité */}
          <div className="lg:col-span-2 space-y-6 min-w-0">
            {!isSigned && !isConcierge && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-1.5 flex items-center justify-between gap-2.5 text-red-800">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                  <span className="font-medium text-xs truncate">Décharge non signée</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 flex-shrink-0 px-2 text-xs text-purple-600 border-purple-200 bg-white hover:bg-purple-50 hover:text-purple-700 [&_svg]:size-3.5"
                  onClick={() => dialogs.setIsSignatureOpen(true)}
                >
                  <PenTool className="mr-1" /> Signature
                </Button>
              </div>
            )}
            {isSigned && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 text-blue-800">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  <span className="font-medium text-sm truncate">Décharge signée</span>
                </div>
                <span className="text-xs opacity-70">
                  Le {format(new Date(booking.signed_at), "d MMM à HH:mm", { locale: fr })}
                </span>
              </div>
            )}

            <TreatmentsByTherapist
              bookingId={booking.id}
              hotelId={booking.hotel_id}
              guestCount={guestCount}
              treatments={treatmentsList}
              primaryTherapistId={booking.therapist_id}
              acceptedTherapists={acceptedTherapists}
              roomName={booking.room_name}
              secondaryRoomName={booking.secondary_room_name}
              currency={currency}
              therapistRatesMap={therapistRatesMap}
              globalTherapistCommission={hotelCommission?.global_therapist_commission}
              therapistCommission={hotelCommission?.therapist_commission}
              surchargePercent={surchargePercent}
              onReassigned={() => { refetch(); setTherapistRefreshKey((k) => k + 1); }}
            />

            <section
              onClick={() => (booking as any).customer_id && navigate(`/admin/customers/${(booking as any).customer_id}`)}
              className={`bg-white rounded-2xl border border-stone-100 p-6 shadow-sm transition-all duration-200 ${(booking as any).customer_id ? 'cursor-pointer hover:border-primary/50 hover:shadow-md group' : ''}`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-semibold tracking-[0.15em] text-gray-400 uppercase flex items-center gap-2">
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
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Contact</p>
                  <p className="text-sm break-words">
                    {booking.phone || "-"} /{" "}
                    {booking.client_email ? (
                      <a
                        href={`mailto:${booking.client_email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary hover:underline"
                      >
                        {booking.client_email}
                      </a>
                    ) : (
                      "-"
                    )}
                  </p>
                </div>
              </div>
              {(booking as any).client_note && (
                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-xs text-amber-700 dark:text-amber-400 mb-1 font-medium">Note réservation</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{(booking as any).client_note}</p>
                </div>
              )}
              {booking.customer_health_notes && (
                <div className="mt-4 p-3 bg-sky-500/10 border border-sky-500/30 rounded-lg">
                  <p className="text-xs text-sky-700 dark:text-sky-400 mb-1 font-medium">Note client</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{booking.customer_health_notes}</p>
                </div>
              )}
            </section>

            {/* Zone Activité : historique / notes / tâches en sous-onglets */}
            <section className="bg-white rounded-2xl border border-stone-100 p-6 shadow-sm">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="history" className="gap-1.5">
                    <History className="h-3.5 w-3.5" />
                    Historique
                  </TabsTrigger>
                  <TabsTrigger value="notes" className="gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Notes
                  </TabsTrigger>
                  {!isConcierge && (
                    <TabsTrigger value="tasks" className="gap-1.5">
                      <ListTodo className="h-3.5 w-3.5" />
                      {t("tasks.bookingTab.label")}
                    </TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="history" className="mt-4">
                  <BookingHistoryTab bookingId={id!} enabled={activeTab === "history"} />
                </TabsContent>

                <TabsContent value="notes" className="mt-4">
                  <BookingNotesSection bookingId={id!} />
                </TabsContent>

                {!isConcierge && (
                  <TabsContent value="tasks" className="mt-4">
                    <BookingTasksTab
                      booking={{
                        id: booking.id,
                        booking_id: booking.booking_id,
                        client_first_name: booking.client_first_name,
                        client_last_name: booking.client_last_name,
                      }}
                    />
                  </TabsContent>
                )}
              </Tabs>
            </section>
          </div>

          {/* Colonne latérale sticky : le « combien / où / quand » */}
          <div className="space-y-6 lg:sticky lg:top-24">
            <section className="bg-white rounded-2xl border border-stone-100 p-6 shadow-sm">
              <div className="flex items-center gap-2.5 mb-4">
                <CreditCard className="h-5 w-5 text-gray-400" />
                <span className="text-xs font-semibold tracking-[0.15em] text-gray-400 uppercase">Paiement</span>
              </div>

              <div className="flex justify-between items-baseline">
                <span className="text-sm font-medium text-gray-500">Total</span>
                <span className="text-2xl font-medium text-gray-900 tabular-nums tracking-tight">{formatPrice(displayPrice, currency)}</span>
              </div>

              <div className="mt-3 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${paidRatio >= 1 ? "bg-emerald-500" : "bg-amber-500"}`}
                  style={{ width: `${Math.round(paidRatio * 100)}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-gray-500">Payé <span className="font-medium text-gray-900 tabular-nums">{formatPrice(paidAmount, currency)}</span></span>
                <span className={`font-medium tabular-nums ${remainingDue > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  {remainingDue > 0 ? `Reste ${formatPrice(remainingDue, currency)}` : "Soldé"}
                </span>
              </div>

              {hasRefund && (
                <div className="mt-2 flex justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-rose-600">
                    <Undo2 className="h-3.5 w-3.5 shrink-0" /> Remboursé
                  </span>
                  <span className="font-medium tabular-nums text-rose-600">
                    −{formatPrice(refundedAmount, currency)}
                  </span>
                </div>
              )}

              <div className="mt-4">
                {showPaymentSuccess ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 flex items-center gap-2 text-green-800">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <span className="font-medium text-xs">
                      Paiement réalisé avec succès{paidAtDetail && <span className="font-normal opacity-70"> — le {paidAtDetail}</span>}
                    </span>
                  </div>
                ) : isRoomPayment ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 flex items-center gap-2 text-blue-800">
                    <Building2 className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <span className="font-medium text-xs">Facturé en chambre.</span>
                  </div>
                ) : isPartnerBilled ? (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 flex items-center gap-2 text-indigo-800">
                    {partnerMeta ? (
                      <img src={partnerMeta.logo} alt="" className="h-4 w-4 flex-shrink-0 object-contain" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                    )}
                    <span className="font-medium text-xs">
                      {partnerName
                        ? `Facturé au partenaire ${partnerName} (facturation mensuelle).`
                        : "Paiement géré par le partenaire (facturation mensuelle)."}
                    </span>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2 text-amber-800">
                    <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                    <span className="font-medium text-xs">En attente de règlement.</span>
                  </div>
                )}
              </div>

              <Collapsible open={isPaymentDetailOpen} onOpenChange={setIsPaymentDetailOpen} className="mt-4 border-t border-stone-100 pt-3">
                <CollapsibleTrigger className="flex w-full items-center justify-between text-sm text-gray-500 hover:text-gray-900 transition-colors">
                  <span>Détail</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${isPaymentDetailOpen ? "rotate-180" : ""}`} />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 flex items-center gap-2">
                      <MethodIcon className="h-4 w-4 shrink-0" /> Méthode
                    </span>
                    <button
                      type="button"
                      onClick={() => openPaymentMethodDialog("method")}
                      className="group flex items-center gap-1.5 text-right text-gray-900 font-medium capitalize hover:text-primary transition-colors"
                      title="Modifier la méthode de paiement"
                    >
                      {methodLabel}
                      <Pencil className="h-3.5 w-3.5 shrink-0 text-gray-400 group-hover:text-primary" />
                    </button>
                  </div>
                  {(booking as any).payment_reference && (
                    <p className="font-mono text-[11px] text-gray-400 text-right">
                      Réf. voucher : {(booking as any).payment_reference}
                    </p>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Sous-total</span>
                    <span className="text-gray-900 tabular-nums">{formatPrice(subtotal, currency)}</span>
                  </div>
                  {hasSurcharge && (
                    <div className="flex justify-between items-center text-sm font-medium text-amber-600">
                      <span className="flex items-center gap-2">
                        <Clock className="h-4 w-4 shrink-0" />
                        Majoration hors horaires ({surchargePercent}%)
                      </span>
                      <span className="whitespace-nowrap tabular-nums">+{formatPrice(surchargeAmount, currency)}</span>
                    </div>
                  )}
                  {isOffert && (
                    <div className="flex justify-between items-center text-sm font-medium text-amber-600">
                      <span>Offert</span>
                      <span className="whitespace-nowrap tabular-nums">−{formatPrice(offertOriginalPrice, currency)}</span>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>

              {!isPaid && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-4"
                  onClick={() => openPaymentMethodDialog("pay")}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Marquer comme payé
                </Button>
              )}
            </section>

            <section className="bg-white rounded-2xl border border-stone-100 p-6 shadow-sm">
              <div className="flex items-center gap-2.5 mb-4">
                <Calendar className="h-5 w-5 text-gray-400" />
                <span className="text-xs font-semibold tracking-[0.15em] text-gray-400 uppercase">Rendez-vous</span>
              </div>
              <dl className="divide-y divide-stone-100">
                <div className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-[11px] font-medium tracking-[0.12em] text-gray-400 uppercase shrink-0">Date</dt>
                  <dd className="text-sm font-medium text-gray-900 text-right capitalize">
                    {booking.booking_date ? format(new Date(booking.booking_date), "EEEE d MMMM", { locale: fr }) : "-"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-[11px] font-medium tracking-[0.12em] text-gray-400 uppercase shrink-0">Horaire</dt>
                  <dd className="text-sm font-medium text-gray-900 text-right">
                    {booking.booking_time?.substring(0, 5) || "-"}{totalDuration > 0 && ` · ${totalDuration} min`}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-[11px] font-medium tracking-[0.12em] text-gray-400 uppercase shrink-0">Lieu</dt>
                  <dd className="text-sm font-medium text-gray-900 text-right break-words">{hotelInfo?.name || "-"}</dd>
                </div>
                {booking.room_name && (
                  <div className="flex items-center justify-between gap-4 py-2.5">
                    <dt className="text-[11px] font-medium tracking-[0.12em] text-gray-400 uppercase shrink-0">
                      Cabine{isDuo && booking.secondary_room_name ? "s" : ""}
                    </dt>
                    <dd className="text-sm font-medium text-gray-900 text-right break-words">
                      {booking.room_name}
                      {isDuo && booking.secondary_room_name && ` · ${booking.secondary_room_name}`}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          </div>
        </div>
      </main>

      <EditBookingDialog
        open={dialogs.isEditOpen}
        onOpenChange={dialogs.setIsEditOpen}
        booking={booking}
        initialMode="edit"
        onSuccess={() => setTherapistRefreshKey(k => k + 1)}
      />

      <ConvertToDuoDialog
        open={dialogs.isConvertToDuoOpen}
        onOpenChange={dialogs.setIsConvertToDuoOpen}
        booking={booking}
        therapists={therapists}
        onSuccess={() => { refetch(); setTherapistRefreshKey(k => k + 1); }}
      />

      <SendPaymentLinkDialog
        open={dialogs.isPaymentLinkOpen}
        onOpenChange={dialogs.setIsPaymentLinkOpen}
        booking={booking}
      />

      <Dialog open={dialogs.isMarkPaidOpen} onOpenChange={dialogs.setIsMarkPaidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-normal">
              {markPaidMode === "method" ? "Modifier la méthode de paiement" : "Marquer comme payé"}
            </DialogTitle>
          </DialogHeader>
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
            {markPaidMethod === "partner_billed" && (
              <div className="space-y-2 pt-2">
                <label className="text-sm text-gray-500">Partenaire facturé</label>
                <Select value={markPaidPartner} onValueChange={(v) => setMarkPaidPartner(v as BookingClientType)}>
                  <SelectTrigger><SelectValue placeholder="Choisir un partenaire" /></SelectTrigger>
                  <SelectContent>
                    {PARTNER_BILLED_CLIENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{t(CLIENT_TYPE_META[type].labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => dialogs.setIsMarkPaidOpen(false)}>Annuler</Button>
            <Button onClick={handleMarkAsPaid} disabled={!markPaidMethod || (markPaidMethod === "partner_billed" && !markPaidPartner) || markPaidLoading}>
              {markPaidLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {markPaidMode === "method" ? "Enregistrer" : "Confirmer le paiement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InvoicePreviewDialog
        open={dialogs.isInvoicePreviewOpen}
        onOpenChange={dialogs.setIsInvoicePreviewOpen}
        invoiceHTML={invoiceHTML}
        bookingId={invoiceBookingId}
        isRoomPayment={invoiceIsRoomPayment}
      />

      <InvoiceSignatureDialog
        open={dialogs.isSignatureOpen}
        onOpenChange={dialogs.setIsSignatureOpen}
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
    </div>
  );
}
