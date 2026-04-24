import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, AlertTriangle, CreditCard, Building, Gift, ShieldCheck, Calendar, Clock, Repeat, X, Package, MapPin, Phone } from 'lucide-react';
import { useBasket } from './context/CartContext';
import { useClientFlow } from './context/FlowContext';
import { useClientVenue } from './context/ClientVenueContext';
import { useVenueTerms, type VenueType } from '@/hooks/useVenueTerms';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatPrice';
import { ProgressBar } from '@/components/client/ProgressBar';
import { useClientAnalytics } from '@/hooks/useClientAnalytics';
import { useCreateOffertBooking } from './hooks/useCreateOffertBooking';
import { useBundleTemplate } from '@/hooks/client/useBundleTemplate';
import { GiftCardSelector } from '@/components/client/GiftCardSelector';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { HoldBanner } from '@/components/client/HoldBanner';
import { computeOutOfHoursSurcharge } from '@/lib/surcharge';

export default function Payment() {
  const { slug, hotelId } = useClientVenue();
  const navigate = useNavigate();
  const { items, total, fixedTotal, hasPriceOnRequest, clearBasket, isBundleOnly } = useBasket();
  const { bookingDateTime, clientInfo, therapistGenderPreference, selectedBundle, setSelectedBundle, setPendingCheckoutSession, clearFlow, canProceedToStep, isBundleOnlyPurchase, draftBookingId, setHoldExpiresAt, authBundles } = useClientFlow();
  const [selectedMethod, setSelectedMethod] = useState<'room' | 'card'>('card');

  useEffect(() => {
    if (selectedMethod === 'room' && clientInfo?.isExternalGuest) {
      setSelectedMethod('card');
    }
  }, [selectedMethod, clientInfo?.isExternalGuest]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { t } = useTranslation('client');
  const { createOffertBooking, isCreating: isOffertProcessing } = useCreateOffertBooking(hotelId);

  // Fetch the bundle template so gift cards can show tailored copy on the payment screen
  const bundleTemplateId = isBundleOnlyPurchase ? items.find((i) => i.bundleId)?.bundleId ?? null : null;
  const { data: bundleTemplate } = useBundleTemplate(bundleTemplateId);
  const bundleType = bundleTemplate?.bundle_type ?? 'cure';
  const isGiftPurchase = bundleType === 'gift_amount' || bundleType === 'gift_treatments';

  const { data: hotel } = useQuery({
    queryKey: ['public-hotel', hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_public_hotel_by_id', { _hotel_id: hotelId });
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!hotelId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const venueType = hotel?.venue_type as VenueType | null;
  const venueTerms = useVenueTerms(venueType);
  const isOffert = !!hotel?.offert || !!hotel?.company_offered;
  const supportsRoomPayment = venueTerms.supportsRoomPayment;
  const { trackPageView } = useClientAnalytics(hotelId);
  const hasTrackedPageView = useRef(false);

  useEffect(() => {
    if (!hasTrackedPageView.current) {
      hasTrackedPageView.current = true;
      trackPageView('payment');
    }
  }, [trackPageView]);

  useEffect(() => {
    if (venueType === 'coworking' || venueType === 'enterprise') {
      setSelectedMethod('card');
    }
  }, [venueType]);

  useEffect(() => {
    if (!canProceedToStep('payment')) {
      navigate(`/client/${slug}/schedule`);
    }
  }, [canProceedToStep, navigate, slug]);

  const fixedItems = items.filter(item => !item.isPriceOnRequest);
  const variableItems = items.filter(item => item.isPriceOnRequest);

  // Bundle: split items into covered (free) vs uncovered (charged normally)
  const isAmountBundle = selectedBundle?.bundleType === 'gift_amount';
  const eligibleSet = new Set(selectedBundle?.eligibleTreatmentIds ?? []);
  const bundleCoveredItems = selectedBundle && !isAmountBundle
    ? items.filter(item => eligibleSet.has(item.id))
    : [];
  const bundleUncoveredItems = selectedBundle && !isAmountBundle
    ? items.filter(item => !eligibleSet.has(item.id))
    : [];
  const uncoveredTotal = isAmountBundle
    ? Math.max(0, Math.round((total * 100 - (selectedBundle?.amountToUseCents ?? 0)) / 100))
    : bundleUncoveredItems.reduce(
        (sum, item) => sum + item.price * item.quantity, 0
      );
  const giftAmountAppliedEuros = isAmountBundle
    ? Math.round((selectedBundle?.amountToUseCents ?? 0) / 100)
    : 0;
  const giftAmountRemainingAfter = isAmountBundle
    ? Math.round(((selectedBundle?.remainingAmountCents ?? 0) - (selectedBundle?.amountToUseCents ?? 0)) / 100)
    : 0;

  // Out-of-hours surcharge (affichage — le serveur recalcule et fait foi)
  const surcharge = computeOutOfHoursSurcharge(bookingDateTime?.time, total, hotel);
  const surchargeUncovered = computeOutOfHoursSurcharge(bookingDateTime?.time, uncoveredTotal, hotel);
  const totalWithSurcharge = total + surcharge.surchargeAmount;
  const uncoveredTotalWithSurcharge = uncoveredTotal + surchargeUncovered.surchargeAmount;
  const fixedTotalWithSurcharge = fixedTotal + computeOutOfHoursSurcharge(bookingDateTime?.time, fixedTotal, hotel).surchargeAmount;

  const handlePayment = async () => {
    if (!clientInfo) {
      toast.error(t('common:errors.generic'));
      navigate(`/client/${slug}/cart`);
      return;
    }

    // Bundle-only purchase: no booking, direct payment via Stripe Checkout
    if (isBundleOnlyPurchase) {
      if (!isBundleOnly) return;
      setIsProcessing(true);
      try {
        const { data, error } = await supabase.functions.invoke('create-bundle-payment', {
          body: {
            hotelId,
            clientData: {
              firstName: clientInfo.firstName,
              lastName: clientInfo.lastName,
              phone: `${clientInfo.countryCode}${clientInfo.phone}`,
              email: clientInfo.email,
              roomNumber: clientInfo.roomNumber,
              note: clientInfo.note || '',
            },
            bundleItems: items.map(item => ({
              treatmentId: item.id,
              bundleId: item.bundleId,
              quantity: item.quantity,
            })),
            totalPrice: total,
          },
        });

        if (error) throw error;

        if (data?.url) {
          const url = new URL(data.url);
          const trustedDomains = ['checkout.stripe.com', 'stripe.com'];
          if (!trustedDomains.some(domain => url.hostname.endsWith(domain))) {
            throw new Error('Invalid redirect URL');
          }
          setPendingCheckoutSession(data.sessionId);
          window.location.href = data.url;
        }
      } catch (error: unknown) {
        console.error('Bundle payment error:', error);
        toast.error(error instanceof Error ? error.message : t('common:errors.generic'));
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (!bookingDateTime) {
      toast.error(t('common:errors.generic'));
      navigate(`/client/${slug}/cart`);
      return;
    }

    setIsProcessing(true);

    try {
      // Gift amount bundle — full or partial coverage
      if (selectedBundle && isAmountBundle && selectedBundle.amountToUseCents) {
        if (uncoveredTotal === 0) {
          // Full coverage by gift amount
          const { data, error } = await supabase.functions.invoke('create-client-booking', {
            body: {
              hotelId,
              clientData: {
                firstName: clientInfo.firstName,
                lastName: clientInfo.lastName,
                phone: `${clientInfo.countryCode}${clientInfo.phone}`,
                email: clientInfo.email,
                roomNumber: clientInfo.roomNumber,
                note: clientInfo.note || '',
                pmsGuestCheckIn: clientInfo.pmsGuestCheckIn,
                pmsGuestCheckOut: clientInfo.pmsGuestCheckOut,
              },
              bookingData: {
                date: bookingDateTime.date,
                time: bookingDateTime.time,
              },
              treatments: items.map(item => ({
                treatmentId: item.id,
                variantId: item.variantId,
                quantity: item.quantity,
                note: item.note,
              })),
              paymentMethod: 'gift_amount',
              giftAmountUsage: {
                customerBundleId: selectedBundle.customerBundleId,
                amountCents: selectedBundle.amountToUseCents,
              },
              totalPrice: 0,
              ...(therapistGenderPreference ? { therapistGender: therapistGenderPreference } : {}),
              ...(draftBookingId ? { draftBookingId } : {}),
            },
          });

          if (error) throw error;

          clearBasket();
          clearFlow();
          navigate(`/client/${slug}/confirmation/${data.bookingId}`);
          return;
        } else {
          // Partial coverage — pay remainder via Stripe
          const { data, error } = await supabase.functions.invoke('create-setup-intent', {
            body: {
              hotelId,
              clientData: {
                firstName: clientInfo.firstName,
                lastName: clientInfo.lastName,
                phone: `${clientInfo.countryCode}${clientInfo.phone}`,
                email: clientInfo.email,
                roomNumber: clientInfo.roomNumber,
                note: clientInfo.note || '',
              },
              bookingData: {
                date: bookingDateTime.date,
                time: bookingDateTime.time,
              },
              treatmentIds: items.map(item => item.id),
              treatments: items.map(item => ({
                treatmentId: item.id,
                variantId: item.variantId,
              })),
              totalPrice: uncoveredTotal,
              giftAmountUsage: {
                customerBundleId: selectedBundle.customerBundleId,
                amountCents: selectedBundle.amountToUseCents,
              },
              ...(therapistGenderPreference ? { therapistGender: therapistGenderPreference } : {}),
            },
          });

          if (error) throw error;

          if (data?.url) {
            const url = new URL(data.url);
            const trustedDomains = ['checkout.stripe.com', 'stripe.com'];
            if (!trustedDomains.some(domain => url.hostname.endsWith(domain))) {
              throw new Error('Invalid redirect URL');
            }
            setPendingCheckoutSession(data.sessionId);
            window.location.href = data.url;
          }
          return;
        }
      }

      // Session bundle — all items covered
      if (selectedBundle && bundleCoveredItems.length > 0 && uncoveredTotal === 0) {
        const { data, error } = await supabase.functions.invoke('create-client-booking', {
          body: {
            hotelId,
            clientData: {
              firstName: clientInfo.firstName,
              lastName: clientInfo.lastName,
              phone: `${clientInfo.countryCode}${clientInfo.phone}`,
              email: clientInfo.email,
              roomNumber: clientInfo.roomNumber,
              note: clientInfo.note || '',
              pmsGuestCheckIn: clientInfo.pmsGuestCheckIn,
              pmsGuestCheckOut: clientInfo.pmsGuestCheckOut,
            },
            bookingData: {
              date: bookingDateTime.date,
              time: bookingDateTime.time,
            },
            treatments: items.map(item => ({
              treatmentId: item.id,
              variantId: item.variantId,
              quantity: item.quantity,
              note: item.note,
            })),
            paymentMethod: 'bundle',
            bundleUsage: {
              customerBundleId: selectedBundle.customerBundleId,
              treatmentId: bundleCoveredItems[0].id,
            },
            totalPrice: 0,
            ...(therapistGenderPreference ? { therapistGender: therapistGenderPreference } : {}),
            ...(draftBookingId ? { draftBookingId } : {}),
          },
        });

        if (error) throw error;

        clearBasket();
        clearFlow();
        navigate(`/client/${slug}/confirmation/${data.bookingId}`);
        return;
      } else if (isOffert) {
        await createOffertBooking(clientInfo, bookingDateTime);
        return;
      } else if (selectedMethod === 'card' && !hasPriceOnRequest) {
        // Le draft reste en DB — confirm-setup-intent le promouvra en 'pending'.
        // On coupe seulement le timer pour ne pas expulser l'utilisateur pendant Stripe.
        setHoldExpiresAt(null);
        const { data, error } = await supabase.functions.invoke('create-setup-intent', {
          body: {
            hotelId,
            clientData: {
              firstName: clientInfo.firstName,
              lastName: clientInfo.lastName,
              phone: `${clientInfo.countryCode}${clientInfo.phone}`,
              email: clientInfo.email,
              roomNumber: clientInfo.roomNumber,
              note: clientInfo.note || '',
            },
            bookingData: {
              date: bookingDateTime.date,
              time: bookingDateTime.time,
            },
            treatmentIds: items.map(item => item.id),
            treatments: items.map(item => ({
              treatmentId: item.id,
              variantId: item.variantId,
            })),
            totalPrice: total,
            ...(therapistGenderPreference ? { therapistGender: therapistGenderPreference } : {}),
            ...(draftBookingId ? { draftBookingId } : {}),
          },
        });

        if (error) throw error;

        if (data?.url) {
          const url = new URL(data.url);
          const trustedDomains = ['checkout.stripe.com', 'stripe.com'];
          if (!trustedDomains.some(domain => url.hostname.endsWith(domain))) {
            throw new Error('Invalid redirect URL');
          }
          setPendingCheckoutSession(data.sessionId);
          window.location.href = data.url;
        }
      } else {
        const { data, error } = await supabase.functions.invoke('create-client-booking', {
          body: {
            hotelId,
            clientData: {
              firstName: clientInfo.firstName,
              lastName: clientInfo.lastName,
              phone: `${clientInfo.countryCode}${clientInfo.phone}`,
              email: clientInfo.email,
              roomNumber: clientInfo.roomNumber,
              note: clientInfo.note || '',
              pmsGuestCheckIn: clientInfo.pmsGuestCheckIn,
              pmsGuestCheckOut: clientInfo.pmsGuestCheckOut,
            },
            bookingData: {
              date: bookingDateTime.date,
              time: bookingDateTime.time,
            },
            treatments: items.map(item => ({
              treatmentId: item.id,
              variantId: item.variantId,
              quantity: item.quantity,
              note: item.note,
            })),
            paymentMethod: 'room',
            totalPrice: fixedTotal,
            ...(therapistGenderPreference ? { therapistGender: therapistGenderPreference } : {}),
            ...(draftBookingId ? { draftBookingId } : {}),
          },
        });

        if (error) throw error;

        clearBasket();
        clearFlow();
        // Redirection vers la page dynamique
        navigate(`/client/${slug}/confirmation/${data.bookingId}`);
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      const errorBody = error?.context?.body;
      let errorCode = '';
      if (typeof errorBody === 'string') {
        try { errorCode = JSON.parse(errorBody)?.error || ''; } catch { /* ignore */ }
      } else if (errorBody?.error) {
        errorCode = errorBody.error;
      }
      if (!errorCode && error?.message) {
        errorCode = error.message;
      }

      if (errorCode === 'SLOT_TAKEN' || errorCode === 'BLOCKED_SLOT' || errorCode === 'LEAD_TIME_VIOLATION') {
        const messageKey = errorCode === 'SLOT_TAKEN' ? 'errors.slotTaken'
          : errorCode === 'BLOCKED_SLOT' ? 'errors.blockedSlot'
          : 'errors.leadTimeViolation';
        toast.error(t(messageKey));
        navigate(`/client/${slug}/schedule`, {
          state: { takenDate: bookingDateTime?.date, takenTime: bookingDateTime?.time },
        });
        return;
      }

      toast.error(error instanceof Error ? error.message : t('common:errors.generic'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="relative min-h-[100dvh] w-full bg-white pb-safe">
      <HoldBanner />
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200 pt-safe">
        <div className="flex items-center gap-4 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/client/${slug}/guest-info`, { replace: true })}
            disabled={isProcessing || isOffertProcessing}
            className="text-gray-900 hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-light text-gray-900">Paiement</h1>
        </div>
        <ProgressBar currentStep="payment" isBundleOnly={isBundleOnlyPurchase} />
      </div>

      <div className="px-4 py-4 sm:px-6 sm:py-6 space-y-8 pb-32">
        
        {/* Titre élégant */}
        <div className="text-center space-y-1.5 mt-4">
          <h3 className="text-xl font-serif text-gray-900">
            {isBundleOnlyPurchase
              ? t('payment.bundleTitle', 'Finaliser votre achat')
              : 'Finaliser votre réservation'}
          </h3>
          <p className="text-sm text-gray-500">
            {isBundleOnlyPurchase
              ? isGiftPurchase
                ? t('payment.giftSubtitle', 'La carte cadeau sera activée immédiatement après le paiement')
                : t('payment.bundleSubtitle', 'Votre cure sera activée immédiatement après le paiement')
              : 'Dernière étape avant votre moment de détente'}
          </p>
        </div>

        {/* Gift card / cure selector (bundles loaded from GuestInfo login) */}
        {!selectedBundle && !isBundleOnlyPurchase && !isOffert && authBundles && (
          <GiftCardSelector
            sessionBundles={authBundles.session_bundles}
            amountBundles={authBundles.amount_bundles}
            bookingTotalCents={Math.round(total * 100)}
            onSelect={(bundle) => setSelectedBundle(bundle)}
          />
        )}

        {/* Bundle active banner */}
        {selectedBundle && (
          <div className="bg-amber-50/80 border border-amber-200/60 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              {isAmountBundle ? <Gift className="w-4 h-4 text-amber-700" /> : <Repeat className="w-4 h-4 text-amber-700" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-900">
                {isAmountBundle
                  ? t('giftCardLogin.giftCard') + ' — ' + selectedBundle.bundleName
                  : t('bundle.bundleName', { name: selectedBundle.bundleName })}
              </p>
              <p className="text-xs text-amber-700">
                {isAmountBundle
                  ? t('giftCardLogin.creditApplied', { amount: giftAmountAppliedEuros })
                  : t('bundle.remaining', { count: selectedBundle.remainingSessions })}
              </p>
              {isAmountBundle && giftAmountRemainingAfter > 0 && (
                <p className="text-[10px] text-amber-600 mt-0.5">
                  {t('giftCardLogin.creditRemainingAfter', { amount: giftAmountRemainingAfter })}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setSelectedBundle(null); }}
              className="text-amber-400 hover:text-amber-600 transition-colors p-1 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Nouveau Récapitulatif Design Luxe */}
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 space-y-4">
          {(hotel?.name || hotel?.address || hotel?.contact_phone) && (
            <div className="pb-3 border-b border-gray-100 space-y-1">
              {hotel?.name && (
                <p className="text-sm font-medium text-gray-900">{hotel.name}</p>
              )}
              {hotel?.address && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([hotel.name, hotel.address, hotel.city].filter(Boolean).join(', '))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5"
                >
                  <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                  <p className="text-xs text-gray-500 underline decoration-gray-300">
                    {[hotel.address, hotel.postal_code, hotel.city].filter(Boolean).join(', ')}
                  </p>
                </a>
              )}
              {hotel?.contact_phone && (
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                  <a
                    href={`tel:${hotel.contact_phone.replace(/\s/g, '')}`}
                    className="text-xs text-gray-500 underline decoration-gray-300"
                  >
                    {hotel.contact_phone}
                  </a>
                </div>
              )}
            </div>
          )}
          <div className="space-y-3">
            {items.map(item => {
              const isCovered = selectedBundle && eligibleSet.has(item.id);
              return (
                <div key={item.id} className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">
                    {item.name} {item.quantity > 1 ? `x${item.quantity}` : ''}
                  </span>
                  <span className="font-medium text-right">
                    {isCovered ? (
                      <span className="flex items-center gap-2">
                        <span className="line-through text-gray-400 text-xs">
                          {formatPrice(item.price * item.quantity, item.currency || 'EUR')}
                        </span>
                        <span className="text-emerald-600">
                          {formatPrice(0, item.currency || 'EUR')}
                        </span>
                      </span>
                    ) : (
                      <span className="text-gray-900">
                        {item.isPriceOnRequest ? t('payment.onQuote') : formatPrice(item.price * item.quantity, item.currency || 'EUR')}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
            
            {!isBundleOnlyPurchase && (
              <>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Date</span>
                  <span className="font-medium text-gray-900 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    {bookingDateTime?.date ? format(new Date(bookingDateTime.date), 'd MMMM yyyy', { locale: fr }) : '-'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Heure</span>
                  <span className="font-medium text-gray-900 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    {bookingDateTime?.time ? bookingDateTime.time.substring(0, 5) : '-'}
                  </span>
                </div>
              </>
            )}

            {surcharge.isOutOfHours && surcharge.surchargeAmount > 0 && !isOffert && !hasPriceOnRequest && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">
                  {t('payment.outOfHoursSurcharge', 'Majoration hors horaires')} ({surcharge.surchargePercent}%)
                </span>
                <span className="font-medium text-amber-600">
                  +{formatPrice(surcharge.surchargeAmount, items[0]?.currency || 'EUR')}
                </span>
              </div>
            )}
          </div>

          <div className="h-px w-full bg-gray-100" />

          <div className="flex justify-between items-end">
            <div className="flex flex-col">
              <span className="font-medium text-gray-900">Total à régler</span>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                {isAmountBundle
                  ? t('giftCardLogin.giftCard')
                  : selectedBundle
                    ? t('bundle.bundleName', { name: selectedBundle.bundleName })
                    : 'Sur place à la fin du soin'}
              </span>
            </div>
            <div className="text-right">
              {isAmountBundle && giftAmountAppliedEuros > 0 && (
                <span className="text-sm line-through text-gray-400 mr-2">
                  {formatPrice(totalWithSurcharge, items[0]?.currency || 'EUR')}
                </span>
              )}
              <span className="text-xl font-serif font-semibold text-gray-900">
                {selectedBundle
                  ? formatPrice(uncoveredTotalWithSurcharge, items[0]?.currency || 'EUR')
                  : isOffert
                    ? formatPrice(0, items[0]?.currency || 'EUR')
                    : formatPrice(hasPriceOnRequest ? fixedTotalWithSurcharge : totalWithSurcharge, items[0]?.currency || 'EUR')
                }
                {hasPriceOnRequest && !selectedBundle && <span className="text-xs text-amber-500 ml-1">+ Devis</span>}
              </span>
            </div>
          </div>
        </div>

        {/* Message de réassurance (Bouclier) */}
        {!isOffert && !hasPriceOnRequest && !(selectedBundle && uncoveredTotal === 0) && selectedMethod === 'card' && (
          <div className="flex items-start gap-3 bg-gray-50/80 border border-gray-100 p-4 rounded-xl">
            <ShieldCheck className="w-5 h-5 flex-shrink-0 text-gray-900 mt-0.5" />
            <p className="text-xs text-gray-500 leading-relaxed">
              {isBundleOnlyPurchase ? (
                <>
                  {t('payment.bundleSecure', 'Paiement sécurisé par Stripe.')}
                  <strong className="text-gray-900 font-medium">
                    {' '}
                    {isGiftPurchase
                      ? t('payment.giftActivation', 'La carte cadeau sera activée immédiatement.')
                      : t('payment.bundleActivation', 'Votre cure sera activée immédiatement.')}
                  </strong>
                </>
              ) : (
                <>
                  Pour garantir votre rendez-vous, une empreinte bancaire sécurisée vous sera demandée.
                  <strong className="text-gray-900 font-medium"> Aucun montant ne sera débité aujourd'hui.</strong>
                </>
              )}
            </p>
          </div>
        )}

        {/* Sélection du mode de garantie — hidden for bundle-only (card only) */}
        {!isBundleOnlyPurchase && !isOffert && !hasPriceOnRequest && !(selectedBundle && uncoveredTotal === 0) && (
          <div className="space-y-3">
            
            {/* Carte */}
            <button
              type="button"
              onClick={() => setSelectedMethod('card')}
              className={cn(
                "w-full p-4 rounded-xl border transition-all duration-200 text-left",
                selectedMethod === 'card'
                  ? "border-gray-900 bg-gray-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              )}
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                  selectedMethod === 'card' ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"
                )}>
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <p className={cn(
                    "font-medium text-sm",
                    selectedMethod === 'card' ? "text-gray-900" : "text-gray-700"
                  )}>Garantie par carte bancaire</p>
                  <p className="text-xs text-gray-500 mt-0.5">Aucun débit immédiat. Paiement sur place.</p>
                </div>
              </div>
            </button>

            {/* Chambre */}
            {supportsRoomPayment && !isBundleOnlyPurchase && !clientInfo?.isExternalGuest && (
              <button
                type="button"
                onClick={() => setSelectedMethod('room')}
                className={cn(
                  "w-full p-4 rounded-xl border transition-all duration-200 text-left",
                  selectedMethod === 'room'
                    ? "border-gray-900 bg-gray-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                    selectedMethod === 'room' ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"
                  )}>
                    <Building className="h-5 w-5" />
                  </div>
                  <div>
                    <p className={cn(
                      "font-medium text-sm",
                      selectedMethod === 'room' ? "text-gray-900" : "text-gray-700"
                    )}>{venueTerms.addToLocationLabel}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{venueTerms.addToLocationDesc}</p>
                  </div>
                </div>
              </button>
            )}
          </div>
        )}

        {/* Politique d'annulation */}
        <div className="pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-500 leading-relaxed">
            <span className="font-medium text-gray-700">{t('payment.cancellationPolicyTitle')}</span>{' '}
            {t('payment.cancellationPolicyText')}
          </p>
        </div>
      </div>

      {/* Bouton Fixe en bas - Design "Classe" */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-gray-100 pb-safe z-20">
        <Button
          onClick={handlePayment}
          disabled={isProcessing || isOffertProcessing}
          className={cn(
            "w-full h-14 rounded-xl font-medium text-base transition-all duration-300 shadow-md active:scale-[0.98]",
            isBundleOnlyPurchase
              ? "bg-amber-600 text-white hover:bg-amber-500"
              : selectedBundle && uncoveredTotal === 0
                ? "bg-amber-600 text-white hover:bg-amber-500"
                : selectedBundle && isAmountBundle
                  ? "bg-amber-600 text-white hover:bg-amber-500"
                  : isOffert
                  ? "bg-emerald-600 text-white hover:bg-emerald-500"
                  : hasPriceOnRequest
                    ? "bg-amber-500 text-black hover:bg-amber-400"
                    : "bg-gray-900 text-white hover:bg-gray-800"
          )}
        >
          {(isProcessing || isOffertProcessing) ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Traitement en cours...
            </>
          ) : isBundleOnlyPurchase ? (
            <>
              <Package className="mr-2 h-5 w-5" />
              {isGiftPurchase
                ? t('payment.purchaseGiftCard', 'Offrir cette carte cadeau')
                : t('payment.purchaseBundle', 'Acheter la cure')}{' '}
              — {formatPrice(total, items[0]?.currency || 'EUR')}
            </>
          ) : selectedBundle && isAmountBundle && uncoveredTotal === 0 ? (
            <>
              <Gift className="mr-2 h-5 w-5" />
              {t('giftCardLogin.confirmGiftAmount')}
            </>
          ) : selectedBundle && isAmountBundle && uncoveredTotal > 0 ? (
            <>
              <CreditCard className="mr-2 h-5 w-5" />
              {t('giftCardLogin.confirmMixedPayment', { amount: formatPrice(uncoveredTotal, items[0]?.currency || 'EUR') })}
            </>
          ) : selectedBundle && uncoveredTotal === 0 ? (
            <>
              <Repeat className="mr-2 h-5 w-5" />
              Confirmer (séance cure)
            </>
          ) : isOffert ? (
            t('offert.confirmFreeBooking')
          ) : hasPriceOnRequest ? (
            t('payment.requestQuote')
          ) : (
            "Confirmer ma réservation"
          )}
        </Button>
      </div>
    </div>
  );
}