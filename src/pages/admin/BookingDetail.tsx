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
import { useUser } from "@/contexts/UserContext";
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
  pending_partner_billing: "Paiement partenaire",
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
  const { isConcierge } = useUser();

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
  const [therapistRatesMap, setTherapistRatesMap] = useState<Record<string, TherapistRates>>({});
  const [hotelCommission, setHotelCommission] = useState<{ therapist_commission: number; global_therapist_commission: boolean } | null>(null);
  const [acceptedTherapists, setAcceptedTherapists] = useState<Array<{ id: string; first_name: string; last_name: string }>>([]);

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
  }, [booking?.id, (booking as any)?.guest_count]);

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
        .select("id, rate_45, rate_60, rate_90")
        .in("id", acceptedTherapists.map((t) => t.id))
        .then(({ data }) => {
          const map: Record<string, TherapistRates> = {};
          (data || []).forEach((t: any) => {
            map[t.id] = { rate_45: t.rate_45, rate_60: t.rate_60, rate_90: t.rate_90 };
          });
          setTherapistRatesMap(map);
        });
    } else {
      const therapistId = booking?.therapist_id;
      if (!therapistId) { setTherapistRatesMap({}); return; }
      supabase
        .from("therapists")
        .select("id, rate_45, rate_60, rate_90")
        .eq("id", therapistId)
        .single()
        .then(({ data }) => {
          if (data) setTherapistRatesMap({ [data.id]: { rate_45: data.rate_45, rate_60: data.rate_60, rate_90: data.rate_90 } });
          else setTherapistRatesMap({});
        });
    }
  }, [booking?.therapist_id, booking?.id, (booking as any)?.guest_count, acceptedTherapists]);

  if (isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!booking) return <div className="p-10 text-center text-muted-foreground">Réservation introuvable.</div>;

  // États logiques
  const isPaid = booking.payment_status === 'paid' || booking.payment_status === 'charged_to_room';
  const isPartnerBilled = booking.payment_status === 'pending_partner_billing';
  const isSigned = !!booking.signed_at; // Vérifie si la date de signature existe

  const hotelInfo = getHotelInfo(booking.hotel_id);
  const currency = hotelInfo?.currency || 'EUR';
  
  const displayPrice = booking.total_price && booking.total_price > 0
    ? booking.total_price
    : booking.treatmentsTotalPrice;

  const totalDuration = booking.totalDuration || booking.treatmentsTotalDuration || 0;
  const guestCount = (booking as any)?.guest_count ?? 1;
  const isDuo = guestCount > 1;
  // Solo path (unchanged behaviour for non-duo bookings)
  const soloRates = !isDuo && booking.therapist_id ? (therapistRatesMap[booking.therapist_id] ?? null) : null;
  const therapistEarnings = computeTherapistEarnings(soloRates, totalDuration);
  const ratesComplete = hasCompleteRates(soloRates);
  const showEarnings = !isDuo && !!booking.therapist_id && Object.keys(therapistRatesMap).length > 0;
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
          {bundleInfo && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
              <Package className="w-3 h-3 mr-1" />
              {t('cures.bundleSession')} — {bundleInfo.bundleName} ({t('cures.remainingCount', { remaining: bundleInfo.remainingSessions, total: bundleInfo.totalSessions })})
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* BOUTON SIGNATURE */}
          {!isConcierge && (isSigned ? (
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
          ))}

          <Button variant="outline" size="sm" onClick={() => setIsNotesOpen(true)}>
            <MessageSquare className="h-4 w-4 mr-2" /> Notes
          </Button>
          {!isConcierge && !isPartnerBilled && (
            <Button variant="outline" size="sm" onClick={() => setIsPaymentLinkOpen(true)}>
              <Send className="h-4 w-4 mr-2" /> Paiement
            </Button>
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
        {/* ALERTES DE STATUT (PAIEMENT) */}
        {isPaid ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3 text-green-800">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="font-medium text-sm">Le paiement a été réalisé avec succès.</span>
          </div>
        ) : isPartnerBilled ? (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center gap-3 text-indigo-800">
            <CheckCircle2 className="h-5 w-5 text-indigo-600" />
            <span className="font-medium text-sm">Paiement géré par le partenaire (facturation mensuelle).</span>
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
              
              {/* ENCART THERAPEUTE(S) */}
              {(booking as any).guest_count > 1 ? (
                <div className="mb-4 space-y-2">
                  <p className="text-xs text-gray-500">
                    Thérapeutes assignés ({acceptedTherapists.length}/{(booking as any).guest_count})
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
                  {acceptedTherapists.length > 0 && acceptedTherapists.length < ((booking as any).guest_count ?? 2) && (
                    <p className="text-xs text-violet-600">
                      En attente de {(booking as any).guest_count - acceptedTherapists.length} thérapeute(s) supplémentaire(s)…
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

              {/* Gains — soin solo */}
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

              {/* Gains — soin duo : répartition par thérapeute */}
              {isDuo && acceptedTherapists.length > 0 && hotelCommission && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <p className="text-xs opacity-70 uppercase mb-2">Répartition des gains</p>
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
                        <p className="text-xs opacity-80">{therapist.first_name} {therapist.last_name}</p>
                        {earnings != null ? (
                          <p className="text-sm font-semibold">{formatPrice(earnings, currency)}</p>
                        ) : (
                          <p className="text-xs text-amber-300">Tarifs incomplets</p>
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
                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/10">
                        <p className="text-xs opacity-60">Part établissement</p>
                        <p className="text-sm font-semibold opacity-80">{formatPrice(hotelShare, currency)}</p>
                      </div>
                    );
                  })()}
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