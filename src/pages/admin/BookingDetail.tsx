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
  Loader2, ArrowLeft, User, Phone,
  Calendar, Clock, Building2, HandHeart,
  CheckCircle2, AlertCircle, Send, Pencil,
  PenTool, ChevronRight, Package, History, MessageSquare
} from "lucide-react";
import { BookingHistoryTab } from "@/components/admin/booking/BookingHistoryTab";
import { BookingStatusStepper } from "@/components/admin/booking/BookingStatusStepper";
import { BookingNotesSection } from "@/components/admin/details/BookingNotesSection";
import { ClientTypeBadge } from "@/components/booking/ClientTypeBadge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

import { formatPrice } from "@/lib/formatPrice";
import { SendPaymentLinkDialog } from "@/components/booking/SendPaymentLinkDialog";
import EditBookingDialog from "@/components/EditBookingDialog";
import { useBookingData } from "@/hooks/booking/useBookingData";
import { InvoiceSignatureDialog } from "@/components/InvoiceSignatureDialog";
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
  pending_partner_billing: "Facturation partenaire",
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

  const [activeTab, setActiveTab] = useState("details");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPaymentLinkOpen, setIsPaymentLinkOpen] = useState(false);
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [signingLoading, setSigningLoading] = useState(false);
  const [bundleInfo, setBundleInfo] = useState<{
    bundleName: string;
    remainingSessions: number;
    totalSessions: number;
  } | null>(null);
  const [therapistRates, setTherapistRates] = useState<TherapistRates | null>(null);

  const { bookings, getHotelInfo, refetch } = useBookingData(); // <-- Ajout de refetch ici
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

  // Fetch therapist rates for earnings estimation
  useEffect(() => {
    const therapistId = booking?.therapist_id;
    if (!therapistId) {
      setTherapistRates(null);
      return;
    }
    supabase
      .from("therapists")
      .select("rate_45, rate_60, rate_90")
      .eq("id", therapistId)
      .single()
      .then(({ data }) => {
        setTherapistRates(data ?? null);
      });
  }, [booking?.therapist_id]);

  if (isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!booking) return <div className="p-10 text-center text-muted-foreground">Réservation introuvable.</div>;

  // États logiques
  const isPaid = booking.payment_status === 'paid' || booking.payment_status === 'charged_to_room';
  const isPartnerBilling = booking.payment_status === 'pending_partner_billing';
  const isSigned = !!booking.signed_at; // Vérifie si la date de signature existe

  const hotelInfo = getHotelInfo(booking.hotel_id);
  const currency = hotelInfo?.currency || 'EUR';
  
  const displayPrice = booking.total_price && booking.total_price > 0
    ? booking.total_price
    : booking.treatmentsTotalPrice;

  const totalDuration = booking.totalDuration || booking.treatmentsTotalDuration || 0;
  const therapistEarnings = computeTherapistEarnings(therapistRates, totalDuration);
  const ratesComplete = hasCompleteRates(therapistRates);
  const showEarnings = !!booking.therapist_id && therapistRates !== null;
  const paymentLabel = PAYMENT_LABELS[booking.payment_status || "pending"] ?? PAYMENT_LABELS.pending;

  // Fonction pour enregistrer la signature depuis l'admin
  const handleSignatureConfirm = async (signatureData: string) => {
    setSigningLoading(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({
          client_signature: signatureData,
          signed_at: new Date().toISOString(),
          // On peut aussi passer le statut à 'completed' si l'admin veut clôturer la resa
          status: booking.status === 'confirmed' ? 'completed' : booking.status 
        })
        .eq("id", booking.id);

      if (error) throw error;
      
      toast.success("Signature ajoutée avec succès au dossier !");
      setIsSignatureOpen(false);
      
      // LA LIGNE MAGIQUE : Force le rechargement invisible des données instantanément 🪄
      refetch();
      
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erreur lors de l'enregistrement de la signature");
    } finally {
      setSigningLoading(false);
    }
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
          {booking.room_number && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              Ch. {booking.room_number}
            </Badge>
          )}
          <StatusBadge status={booking.status} type="booking" />
          <StatusBadge
            status={booking.payment_status || "pending"}
            type="payment"
            customLabel={paymentLabel}
          />
          {bundleInfo && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
              <Package className="w-3 h-3 mr-1" />
              {t('cures.bundleSession')} — {bundleInfo.bundleName} ({t('cures.remainingCount', { remaining: bundleInfo.remainingSessions, total: bundleInfo.totalSessions })})
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* BOUTON SIGNATURE */}
          {isSigned ? (
            <Button 
              variant="outline" 
              size="sm" 
              className="text-green-600 border-green-200 bg-green-50 hover:bg-green-100"
              onClick={() => window.open(`/client/signature/${booking.signature_token}`, '_blank')}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" /> Signé
            </Button>
          ) : (
            <Button 
              variant="outline" 
              size="sm" 
              className="text-purple-600 border-purple-200 hover:bg-purple-50 hover:text-purple-700"
              onClick={() => setIsSignatureOpen(true)}
            >
              <PenTool className="h-4 w-4 mr-2" /> Signature
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={() => setIsNotesOpen(true)}>
            <MessageSquare className="h-4 w-4 mr-2" /> Notes
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsPaymentLinkOpen(true)}>
            <Send className="h-4 w-4 mr-2" /> Paiement
          </Button>
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
        {/* ALERTES DE STATUT (PAIEMENT) */}
        {isPaid ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3 text-green-800">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="font-medium text-sm">Le paiement a été réalisé avec succès.</span>
          </div>
        ) : isPartnerBilling ? (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center gap-3 text-indigo-800">
            <Building2 className="h-5 w-5 text-indigo-600" />
            <span className="font-medium text-sm">Facturation partenaire en attente.</span>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 text-amber-800">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            <span className="font-medium text-sm">En attente de règlement.</span>
          </div>
        )}

        {/* ALERTES DE STATUT (SIGNATURE) */}
        {isSigned ? (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between text-blue-800">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-blue-600" />
              <span className="font-medium text-sm">Document de décharge signé.</span>
            </div>
            <span className="text-xs opacity-70">
              Le {format(new Date(booking.signed_at), "d MMMM à HH:mm", { locale: fr })}
            </span>
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-800">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <span className="font-medium text-sm">Décharge non signée : signature obligatoire avant le soin.</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          
          {/* COLONNE GAUCHE (Client + Soins) */}
          <div className="md:col-span-2 space-y-6">
            
            {/* SECTION CLIENT (Cliquable) */}
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

            {/* SECTION SOINS & PRATICIEN */}
            <section className="bg-white rounded-xl border p-6 shadow-sm">
              <h3 className="text-sm font-bold text-muted-foreground uppercase mb-4 flex items-center gap-2">
                <HandHeart className="h-4 w-4" /> Soins & Praticien
              </h3>
              
              {/* ENCART THERAPEUTE (Cliquable) */}
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
              
              {/* LISTE DES SOINS */}
              <div className="space-y-3">
                {booking.treatments?.map((t, i) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium">{t.name} ({t.duration} min)</span>
                    <span className="font-semibold">{formatPrice(t.price || 0, currency)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* COLONNE DROITE (Organisation + Prix) */}
          <div className="space-y-6">
            <section className="bg-white rounded-xl border p-6 shadow-sm">
              <h3 className="text-sm font-bold text-muted-foreground uppercase mb-4">Organisation</h3>
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
              </div>
            </section>

            <section className="bg-gray-900 text-white rounded-xl p-6 shadow-lg">
              <p className="text-xs opacity-70 uppercase mb-1">Montant Total</p>
              <p className="text-3xl font-bold">{formatPrice(displayPrice, currency)}</p>
              {showEarnings && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <p className="text-xs opacity-70 uppercase mb-1">Gain thérapeute</p>
                  {ratesComplete && therapistEarnings != null ? (
                    <p className="text-xl font-semibold">{formatPrice(therapistEarnings, currency)}</p>
                  ) : (
                    <p className="text-xs text-amber-300">Tarifs thérapeute incomplets — gain non calculable</p>
                  )}
                </div>
              )}
              <div className="mt-4 pt-4 border-t border-white/10 text-xs opacity-70">
                Méthode : {booking.payment_method ? (PAYMENT_METHOD_LABELS[booking.payment_method] || booking.payment_method) : "À définir"}
                {(booking as any).payment_reference && (
                  <div className="mt-1 font-mono text-[10px] opacity-80">
                    Réf. voucher : {(booking as any).payment_reference}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <BookingHistoryTab bookingId={id!} enabled={activeTab === "history"} />
          </TabsContent>
        </Tabs>
      </main>

      {/* MODALES */}
      <EditBookingDialog 
        open={isEditOpen} 
        onOpenChange={setIsEditOpen} 
        booking={booking} 
        initialMode="edit" 
      />
      
      <SendPaymentLinkDialog 
        open={isPaymentLinkOpen} 
        onOpenChange={setIsPaymentLinkOpen} 
        booking={booking} 
      />

      {/* Modale de Signature commune avec la PWA */}
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
        vatRate={20} // Valeur par défaut
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