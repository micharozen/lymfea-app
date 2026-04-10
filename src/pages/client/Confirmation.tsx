import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle, Calendar, Clock, MapPin, CreditCard, Loader2, AlertCircle, Repeat, ShoppingBag, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function Confirmation() {
  const navigate = useNavigate();
  const { hotelId, bookingId: paramBookingId } = useParams();
  const [searchParams] = useSearchParams();

  const sessionId = searchParams.get('session_id');
  const isBundlePurchase = paramBookingId === 'bundle';
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paramBookingId || '');

  // États pour gérer le chargement
  const [booking, setBooking] = useState<any>(null);
  const [bundleData, setBundleData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bouclier Anti-Double Appel (Strict Mode React)
  const hasConfirmed = useRef(false);

  // Bundle purchase confirmation flow
  useEffect(() => {
    async function confirmBundlePurchase() {
      if (hasConfirmed.current) return;
      hasConfirmed.current = true;

      try {
        if (!sessionId) {
          throw new Error("Identifiant de session manquant.");
        }

        const { data, error: fnError } = await supabase.functions.invoke('purchase-bundle', {
          body: { sessionId },
        });

        if (fnError) throw new Error("La confirmation de votre achat a échoué.");
        if (!data?.customerBundles || data.customerBundles.length === 0) {
          throw new Error("Aucune cure trouvée.");
        }

        setBundleData(data.customerBundles);
      } catch (err: any) {
        console.error("Erreur Confirmation Bundle :", err);
        setError(err.message || "Une erreur est survenue.");
      } finally {
        setIsLoading(false);
      }
    }

    async function confirmAndFetchBooking() {
      if (hasConfirmed.current) return;
      hasConfirmed.current = true;

      try {
        let finalBookingId = paramBookingId;

        // 1. Validation Stripe si on revient de la passerelle de paiement
        if (!isUUID && sessionId) {
          const { data: confirmData, error: confirmError } = await supabase.functions.invoke('confirm-setup-intent', {
            body: { sessionId }
          });

          if (confirmError) throw new Error("La validation de votre garantie bancaire a échoué.");
          if (confirmData?.bookingId) {
            finalBookingId = confirmData.bookingId;
          }
        }

        // Sécurité sur l'ID
        if (!finalBookingId || finalBookingId === 'setup') {
          throw new Error("Identifiant de réservation invalide.");
        }

        // 2. Appel du RPC sécurisé pour récupérer le résumé (Bypass RLS)
        const { data, error: dbError } = await supabase.rpc('get_booking_summary', {
          _booking_id: finalBookingId
        });

        if (dbError) throw dbError;
        if (!data) throw new Error("Votre réservation est introuvable.");

        setBooking(data);
      } catch (err: any) {
        console.error("Erreur Confirmation :", err);
        setError(err.message || "Une erreur est survenue lors de la récupération.");
      } finally {
        setIsLoading(false);
      }
    }

    if (isBundlePurchase) {
      confirmBundlePurchase();
    } else if (isUUID || sessionId) {
      confirmAndFetchBooking();
    } else {
      setIsLoading(false);
      setError("Aucune donnée de réservation trouvée.");
    }
  }, [paramBookingId, sessionId, isUUID, isBundlePurchase]);

  const handleReturnHome = () => {
    navigate(hotelId ? `/client/${hotelId}` : "/");
  };

  // ---------------------------------------------------------------------------
  // RENDER : Écrans de chargement et d'erreur
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-gray-400" />
        <p className="text-sm text-gray-500 font-medium">
          {isBundlePurchase ? 'Activation de votre cure...' : 'Finalisation de votre réservation...'}
        </p>
      </div>
    );
  }

  // --- Bundle purchase confirmation ---
  if (isBundlePurchase && bundleData) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center p-4 pb-20">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Header */}
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center">
              <Package className="w-10 h-10 text-amber-600" strokeWidth={1.5} />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-serif text-gray-900">Cure achetée !</h1>
              <p className="text-gray-500 text-sm">
                Votre cure est maintenant active. Vous pouvez réserver vos séances quand vous le souhaitez.
              </p>
            </div>
          </div>

          {/* Bundle details */}
          <div className="bg-[#FAFAFA] rounded-xl p-5 border border-gray-100 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Détails de votre cure</h3>
            {bundleData.map((bundle: any) => (
              <div key={bundle.id} className="space-y-3">
                <div className="flex items-start gap-3">
                  <Repeat className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {bundle.treatment_bundles?.name || 'Cure'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {bundle.total_sessions} séance{bundle.total_sessions > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                {bundle.expires_at && (
                  <div className="flex items-start gap-3">
                    <Calendar className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Validité</p>
                      <p className="text-sm text-gray-500">
                        Jusqu'au {format(new Date(bundle.expires_at), 'd MMMM yyyy', { locale: fr })}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* CTA: Book a session */}
          <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
            <CheckCircle className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-900">Réservez votre première séance</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                Rendez-vous sur notre page de soins pour planifier votre premier rendez-vous.
              </p>
            </div>
          </div>

          {/* Return button */}
          <div className="pt-2 space-y-3">
            <Button
              onClick={() => navigate(`/client/${hotelId}/treatments`)}
              className="w-full h-14 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-base font-medium shadow-md transition-all active:scale-[0.98]"
            >
              <ShoppingBag className="mr-2 h-5 w-5" />
              Réserver une séance
            </Button>
            <Button
              onClick={handleReturnHome}
              variant="outline"
              className="w-full h-12 rounded-xl text-sm"
            >
              Retourner à l'accueil
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (error || (!booking && !bundleData)) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center p-4 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Oups, un problème est survenu</h2>
        <p className="text-gray-500 mb-6">{error || "Réservation introuvable."}</p>
        <Button onClick={handleReturnHome} variant="outline" className="h-12 px-6 rounded-xl">
          Retourner à l'accueil
        </Button>
      </div>
    );
  }

 // ---------------------------------------------------------------------------
  // EXTRACTION SÉCURISÉE DES DONNÉES
  // ---------------------------------------------------------------------------
  let treatmentNames = "Vos soins";

  // Cas 1 : La donnée est un tableau simple de noms
  if (Array.isArray(booking?.treatments) && booking.treatments.length > 0) {
    treatmentNames = booking.treatments.join(", ");
  } 
  // Cas 2 : La donnée est imbriquée
  else if (Array.isArray(booking?.booking_treatments) && booking.booking_treatments.length > 0) {
    const names = booking.booking_treatments
      .map((bt: any) => bt?.treatment_menus?.name)
      .filter(Boolean);
    
    if (names.length > 0) {
      treatmentNames = names.join(", ");
    }
  }

  const hotelName = booking?.hotels?.name || "Au sein de votre établissement";

  // ---------------------------------------------------------------------------
  // RENDER : Écran de succès
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center p-4 pb-20">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* En-tête */}
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-green-600" strokeWidth={1.5} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-serif text-gray-900">Réservation Confirmée</h1>
            <p className="text-gray-500 text-sm">
              Un email de confirmation vous a été envoyé. Nous avons hâte de vous accueillir.
            </p>
          </div>
        </div>

        {/* Détails de la réservation */}
        <div className="bg-[#FAFAFA] rounded-xl p-5 border border-gray-100 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Détails de votre rendez-vous</h3>
          
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">Votre prestation</p>
                <p className="text-sm text-gray-500">{treatmentNames}</p>
                {booking?.booking_date && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    Le {format(new Date(booking.booking_date), 'd MMMM yyyy', { locale: fr })}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">Horaire</p>
                <p className="text-sm text-gray-500">
                  {booking?.booking_time ? booking.booking_time.substring(0, 5) : "Heure à confirmer"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">Lieu</p>
                <p className="text-sm text-gray-500">{hotelName}</p>
                {booking?.room_number && (
                  <p className="text-sm text-gray-500 mt-0.5">Chambre : {booking.room_number}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bundle session used banner */}
        {booking?.bundle_usage_id && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
            <Repeat className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-900">Séance de cure utilisée</p>
              {booking?.bundle_remaining_sessions != null && (
                <p className="text-xs text-amber-700 leading-relaxed">
                  {booking.bundle_remaining_sessions === 0
                    ? "Toutes les séances ont été utilisées."
                    : `${booking.bundle_remaining_sessions} séance${booking.bundle_remaining_sessions > 1 ? 's' : ''} restante${booking.bundle_remaining_sessions > 1 ? 's' : ''}`
                  }
                </p>
              )}
              {booking?.bundle_remaining_sessions === 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/client/${hotelId}/treatments`)}
                  className="mt-2 h-8 text-xs border-amber-300 text-amber-800 hover:bg-amber-100"
                >
                  <ShoppingBag className="w-3.5 h-3.5 mr-1.5" />
                  Racheter cette cure
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Info Paiement (Bouclier de réassurance) */}
        {!booking?.bundle_usage_id && (
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <CreditCard className="w-5 h-5 text-gray-900 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-900">Règlement sur place</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                Votre empreinte bancaire a bien été validée pour garantir le rendez-vous. <strong>Aucun montant n'a été débité aujourd'hui.</strong> Le paiement s'effectuera à la fin de votre soin.
              </p>
            </div>
          </div>
        )}

        {/* Bouton de retour */}
        <div className="pt-2">
          <Button 
            onClick={handleReturnHome}
            className="w-full h-14 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-base font-medium shadow-md transition-all active:scale-[0.98]"
          >
            Retourner à l'accueil
          </Button>
        </div>

      </div>
    </div>
  );
}