import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle, Calendar, Clock, MapPin, CreditCard, Loader2,
  AlertCircle, Repeat, ShoppingBag, Package, Gift, Copy, Check, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { toast } from "sonner";
import { brand, brandLogos } from "@/config/brand";

export default function Confirmation() {
  const navigate = useNavigate();
  const { hotelId, bookingId: paramBookingId } = useParams();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation('client');
  const { changeLanguage, language: currentLanguage } = i18n;
  const dateLocale = currentLanguage === 'fr' ? fr : enUS;

  const sessionId = searchParams.get('session_id');
  const isPaymentSuccess = searchParams.get('payment') === 'success';
  const isBundlePurchase = paramBookingId === 'bundle';
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paramBookingId || '');

  const [booking, setBooking] = useState<Record<string, unknown> | null>(null);
  const [bundleData, setBundleData] = useState<Record<string, unknown>[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  const hasConfirmed = useRef(false);

  useEffect(() => {
    console.log("[Confirmation] URL:", window.location.href);
    console.log("[Confirmation] paramBookingId:", paramBookingId, "| sessionId:", sessionId, "| isPaymentSuccess:", isPaymentSuccess, "| isUUID:", isUUID);

    async function confirmBundlePurchase() {
      if (hasConfirmed.current) return;
      hasConfirmed.current = true;

      try {
        if (!sessionId) throw new Error("Identifiant de session manquant.");

        const { data, error: fnError } = await supabase.functions.invoke('purchase-bundle', {
          body: { sessionId },
        });

        if (fnError) throw new Error("La confirmation de votre achat a échoué.");
        if (!data?.customerBundles || data.customerBundles.length === 0) {
          throw new Error("Aucune cure trouvée.");
        }

        setBundleData(data.customerBundles);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Une erreur est survenue.";
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    }

    async function confirmAndFetchBooking() {
      if (hasConfirmed.current) return;
      hasConfirmed.current = true;

      try {
        let finalBookingId = paramBookingId;

        if (!isUUID && sessionId) {
          console.log("[Confirmation] Appel confirm-setup-intent...");
          const { data: confirmData, error: confirmError } = await supabase.functions.invoke('confirm-setup-intent', {
            body: { sessionId }
          });
          if (confirmError) throw new Error("La validation de votre garantie bancaire a échoué.");
          if (confirmData?.bookingId) finalBookingId = confirmData.bookingId;
        }

        if (!finalBookingId || finalBookingId === 'setup') {
          throw new Error("Identifiant de réservation invalide.");
        }

        const { data, error: dbError } = await supabase.rpc('get_booking_summary', {
          _booking_id: finalBookingId
        });

        if (dbError) throw dbError;
        if (!data) throw new Error("Votre réservation est introuvable.");

        const bookingData = data as Record<string, unknown>;
        setBooking(bookingData);

        // Apply language from payment link if the client arrived via a payment link
        if (isPaymentSuccess && bookingData.payment_link_language) {
          changeLanguage(bookingData.payment_link_language as string);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Une erreur est survenue lors de la récupération.";
        console.error("[Confirmation] Erreur:", msg);
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    }

    if (isBundlePurchase) {
      confirmBundlePurchase();
    } else if (isUUID || sessionId || isPaymentSuccess) {
      confirmAndFetchBooking();
    } else {
      setIsLoading(false);
      setError("Aucune donnée de réservation trouvée.");
    }

  }, [paramBookingId, sessionId, isUUID, isPaymentSuccess, isBundlePurchase, changeLanguage]);

  const handleReturnHome = () => {
    navigate(hotelId ? `/client/${hotelId}` : "/");
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCodeCopied(true);
      toast.success(t('common:copied', 'Copié !'));
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  const bundleType = (bundleData?.[0] as Record<string, unknown>)?.treatment_bundles as Record<string, unknown> | undefined;
  const isGiftCard = bundleType?.bundle_type === 'gift_treatments' || bundleType?.bundle_type === 'gift_amount';
  const isGiftForSomeone = (bundleData?.[0] as Record<string, unknown>)?.is_gift === true;
  const giftDeliveryMode = (bundleData?.[0] as Record<string, unknown>)?.gift_delivery_mode as string | undefined;

  // ---------------------------------------------------------------------------
  // LOADING
  // ---------------------------------------------------------------------------
  if (isLoading) {
    const loadingText = isBundlePurchase && isGiftCard
      ? t('bundle.giftLoading')
      : isBundlePurchase
        ? t('bundle.purchasedMessage', 'Activation de votre cure...')
        : t('confirmation.message', 'Finalisation de votre réservation...');

    return (
      <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-gray-400" />
        <p className="text-sm text-gray-500 font-medium">{loadingText}</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // BUNDLE / GIFT CARD CONFIRMATION
  // ---------------------------------------------------------------------------
  if (isBundlePurchase && bundleData) {
    if (isGiftCard) {
      let title: string;
      let subtitle: string;

      if (isGiftForSomeone) {
        const recipientName = (bundleData[0] as Record<string, unknown>)?.recipient_name as string || '';
        if (giftDeliveryMode === 'print') {
          title = t('bundle.giftSentPrint');
          subtitle = t('bundle.giftSentPrintMessage');
        } else {
          title = t('bundle.giftSentEmail');
          subtitle = t('bundle.giftSentEmailMessage', { name: recipientName });
        }
      } else {
        title = t('bundle.giftPurchased');
        subtitle = t('bundle.giftPurchasedSelf');
      }

      return (
        <div className="min-h-dvh bg-gradient-to-b from-gray-50 to-white flex flex-col items-center p-4 pb-safe pt-safe">
          <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 py-8">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-serif text-gray-900">{title}</h1>
              <p className="text-gray-500 text-sm">{subtitle}</p>
            </div>

            {bundleData.map((bundle: Record<string, unknown>) => {
              const treatmentBundles = bundle.treatment_bundles as Record<string, unknown> | undefined;
              const amountCents = (bundle.total_amount_cents ?? treatmentBundles?.amount_cents) as number | undefined;
              const isAmountType = treatmentBundles?.bundle_type === 'gift_amount';

              return (
                <div key={bundle.id as string} className="space-y-6">
                  <div className="[perspective:800px]">
                    <div
                      className="relative rounded-2xl overflow-hidden transition-transform duration-500 ease-out [transform:rotateX(2deg)_rotateY(-1deg)] hover:[transform:rotateX(0deg)_rotateY(0deg)]"
                      style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15), 0 12px 24px -8px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.03)' }}
                    >
                      <div className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6 min-h-[220px] flex flex-col justify-between">
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
                        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.03] to-transparent" />
                        <div className="relative flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <img src={brandLogos.monogramBlack} alt={brand.name} className="h-5 w-5 brightness-0 invert opacity-60" />
                            <span className="text-white/60 font-serif text-sm tracking-wide">{brand.name}</span>
                          </div>
                          <Gift className="w-5 h-5 text-[#03bfac]/70" strokeWidth={1.5} />
                        </div>
                        <div className="relative text-center py-2">
                          {isAmountType && amountCents ? (
                            <p className="text-5xl font-serif font-light text-white tracking-tight">
                              {Math.round(amountCents / 100)} <span className="text-3xl text-white/60">€</span>
                            </p>
                          ) : (
                            <p className="text-5xl font-serif font-light text-white tracking-tight">
                              {bundle.total_sessions as number} <span className="text-2xl text-white/50">
                                {t('bundle.sessions', { count: bundle.total_sessions as number }).replace(`${bundle.total_sessions} `, '')}
                              </span>
                            </p>
                          )}
                          <p className="text-sm text-white/50 mt-1 font-light">
                            {treatmentBundles?.name as string || t('bundle.giftDetails')}
                          </p>
                        </div>
                        <div className="relative flex items-end justify-between text-xs text-white/40">
                          {isGiftForSomeone && bundle.recipient_name ? (
                            <div className="flex items-center gap-1.5">
                              <Sparkles className="w-3 h-3" />
                              <span className="uppercase tracking-wider">{bundle.recipient_name as string}</span>
                            </div>
                          ) : <div />}
                          {bundle.expires_at && (
                            <span className="uppercase tracking-wider">
                              {format(new Date(bundle.expires_at as string), 'MM/yyyy')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="h-1 bg-gradient-to-r from-gray-700 via-gray-600 to-gray-700" />
                    </div>
                  </div>

                  <div className="space-y-3 px-2">
                    {bundle.expires_at && (
                      <div className="flex items-center gap-2.5 text-sm text-gray-500">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span>{t('bundle.validUntil', { date: format(new Date(bundle.expires_at as string), 'd MMMM yyyy', { locale: dateLocale }) })}</span>
                      </div>
                    )}
                  </div>

                  {import.meta.env.DEV && bundle.redemption_code && (
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 mx-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                        {t('bundle.giftRedemptionCode')}
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-2xl font-mono font-bold text-gray-900 tracking-[0.15em] select-all">
                          {bundle.redemption_code as string}
                        </code>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600" onClick={() => handleCopyCode(bundle.redemption_code as string)}>
                          {codeCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-3 p-3 rounded-xl border bg-[#03bfac]/5 border-[#03bfac]/20 mx-2">
                    <CheckCircle className="w-4 h-4 text-[#03bfac] mt-0.5 shrink-0" />
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {t('bundle.giftSentEmailMessage', { name: bundle.recipient_name as string || '' })}
                    </p>
                  </div>
                </div>
              );
            })}

            <Button onClick={() => navigate(`/client/${hotelId}/treatments`)} className="w-full h-14 bg-gray-900 text-white hover:bg-gray-800 rounded-xl text-base font-medium shadow-sm transition-all active:scale-[0.98]">
              <ShoppingBag className="mr-2 h-5 w-5" />
              {t('bundle.giftBookTreatment')}
            </Button>

            <div className="flex items-center justify-center gap-2 pt-4 opacity-40">
              <img src={brandLogos.monogramBlack} alt={brand.name} className="h-4 w-4" />
              <span className="text-xs text-gray-500 font-serif">{brand.name}</span>
            </div>
          </div>
        </div>
      );
    }

    // --- CURE confirmation ---
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center p-4 pb-20">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center">
              <Package className="w-10 h-10 text-amber-600" strokeWidth={1.5} />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-serif text-gray-900">{t('bundle.purchased')}</h1>
              <p className="text-gray-500 text-sm">{t('bundle.purchasedMessage')}</p>
            </div>
          </div>

          <div className="bg-[#FAFAFA] rounded-xl p-5 border border-gray-100 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">{t('bundle.purchased')}</h3>
            {bundleData.map((bundle: Record<string, unknown>) => {
              const treatmentBundles = bundle.treatment_bundles as Record<string, unknown> | undefined;
              return (
                <div key={bundle.id as string} className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Repeat className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{treatmentBundles?.name as string || 'Cure'}</p>
                      <p className="text-sm text-gray-500">{bundle.total_sessions as number} {t('bundle.sessions', { count: bundle.total_sessions as number })}</p>
                    </div>
                  </div>
                  {bundle.expires_at && (
                    <div className="flex items-start gap-3">
                      <Calendar className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                      <p className="text-sm font-medium text-gray-900">
                        {t('bundle.validUntil', { date: format(new Date(bundle.expires_at as string), 'd MMMM yyyy', { locale: dateLocale }) })}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
            <CheckCircle className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0" />
            <p className="text-sm font-medium text-amber-900">{t('bundle.bookFirstSession')}</p>
          </div>

          <div className="pt-2 space-y-3">
            <Button onClick={() => navigate(`/client/${hotelId}/treatments`)} className="w-full h-14 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-base font-medium shadow-md transition-all active:scale-[0.98]">
              <ShoppingBag className="mr-2 h-5 w-5" />
              {t('bundle.bookFirstSession')}
            </Button>
            <Button onClick={handleReturnHome} variant="outline" className="w-full h-12 rounded-xl text-sm">
              {t('confirmation.backHome')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // ERROR
  // ---------------------------------------------------------------------------
  if (error || (!booking && !bundleData)) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center p-4 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Oups, un problème est survenu</h2>
        <p className="text-gray-500 mb-6">{error || "Réservation introuvable."}</p>
        <Button onClick={handleReturnHome} variant="outline" className="h-12 px-6 rounded-xl">
          {t('confirmation.backHome')}
        </Button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // BOOKING CONFIRMATION
  // ---------------------------------------------------------------------------
  let treatmentNames = "Vos soins";
  if (Array.isArray((booking as Record<string, unknown>)?.treatments) && ((booking as Record<string, unknown>)?.treatments as unknown[]).length > 0) {
    treatmentNames = ((booking as Record<string, unknown>)?.treatments as string[]).join(", ");
  } else if (Array.isArray((booking as Record<string, unknown>)?.booking_treatments) && ((booking as Record<string, unknown>)?.booking_treatments as unknown[]).length > 0) {
    const names = ((booking as Record<string, unknown>)?.booking_treatments as Record<string, unknown>[])
      .map((bt) => (bt?.treatment_menus as Record<string, unknown>)?.name)
      .filter(Boolean);
    if (names.length > 0) treatmentNames = (names as string[]).join(", ");
  }

  const hotelName = ((booking as Record<string, unknown>)?.hotels as Record<string, unknown>)?.name as string || "Au sein de votre établissement";

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center p-4 pb-20">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-green-600" strokeWidth={1.5} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-serif text-gray-900">{t('confirmation.title')}</h1>
            <p className="text-gray-500 text-sm">{t('confirmation.message')}</p>
          </div>
        </div>

        <div className="bg-[#FAFAFA] rounded-xl p-5 border border-gray-100 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
            {t('confirmation.yourService')}
          </h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">{t('confirmation.treatments')}</p>
                <p className="text-sm text-gray-500">{treatmentNames}</p>
                {(booking as Record<string, unknown>)?.booking_date && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {format(new Date((booking as Record<string, unknown>)?.booking_date as string), 'd MMMM yyyy', { locale: dateLocale })}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">{t('confirmation.time')}</p>
                <p className="text-sm text-gray-500">
                  {(booking as Record<string, unknown>)?.booking_time
                    ? ((booking as Record<string, unknown>)?.booking_time as string).substring(0, 5)
                    : t('confirmation.timeToConfirm')}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">{t('confirmation.venue')}</p>
                <p className="text-sm text-gray-500">{hotelName}</p>
                {(booking as Record<string, unknown>)?.room_number && (
                  <p className="text-sm text-gray-500 mt-0.5">{t('confirmation.room')} : {(booking as Record<string, unknown>)?.room_number as string}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {(booking as Record<string, unknown>)?.bundle_usage_id && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
            <Repeat className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-900">{t('bundle.sessionUsed')}</p>
              {(booking as Record<string, unknown>)?.bundle_remaining_sessions != null && (
                <p className="text-xs text-amber-700 leading-relaxed">
                  {(booking as Record<string, unknown>)?.bundle_remaining_sessions === 0
                    ? t('bundle.noCreditsLeft')
                    : t('bundle.remaining', { count: (booking as Record<string, unknown>)?.bundle_remaining_sessions as number })
                  }
                </p>
              )}
              {(booking as Record<string, unknown>)?.bundle_remaining_sessions === 0 && (
                <Button variant="outline" size="sm" onClick={() => navigate(`/client/${hotelId}/treatments`)} className="mt-2 h-8 text-xs border-amber-300 text-amber-800 hover:bg-amber-100">
                  <ShoppingBag className="w-3.5 h-3.5 mr-1.5" />
                  {t('bundle.rebuy')}
                </Button>
              )}
            </div>
          </div>
        )}

        {!(booking as Record<string, unknown>)?.bundle_usage_id && (booking as Record<string, unknown>)?.payment_method === 'gift_amount' ? (
          <div className="flex items-start gap-3 p-4 bg-[#03bfac]/5 rounded-xl border border-[#03bfac]/20">
            <Gift className="w-5 h-5 text-[#03bfac] mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-900">{t('confirmation.giftCardPaymentTitle')}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{t('confirmation.giftCardPaymentMessage')}</p>
            </div>
          </div>
        ) : !(booking as Record<string, unknown>)?.bundle_usage_id && isPaymentSuccess ? (
          <div className="flex items-start gap-3 p-4 bg-green-50 rounded-xl border border-green-200">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-900">{t('confirmation.paidOnlineTitle')}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{t('confirmation.paidOnlineMessage')}</p>
            </div>
          </div>
        ) : !(booking as Record<string, unknown>)?.bundle_usage_id && (
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <CreditCard className="w-5 h-5 text-gray-900 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-900">{t('confirmation.onSitePaymentTitle')}</p>
              <p className="text-xs text-gray-500 leading-relaxed" dangerouslySetInnerHTML={{ __html: t('confirmation.onSitePaymentMessage') }} />
            </div>
          </div>
        )}

        <div className="pt-2">
          <Button onClick={handleReturnHome} className="w-full h-14 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-base font-medium shadow-md transition-all active:scale-[0.98]">
            {t('confirmation.backHome')}
          </Button>
        </div>

      </div>
    </div>
  );
}
