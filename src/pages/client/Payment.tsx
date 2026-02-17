import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, AlertTriangle, CreditCard, Building, Gift } from 'lucide-react';
import { useBasket } from './context/CartContext';
import { useClientFlow } from './context/FlowContext';
import { useVenueTerms, type VenueType } from '@/hooks/useVenueTerms';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatPrice';
import { ProgressBar } from '@/components/client/ProgressBar';
import { useClientAnalytics } from '@/hooks/useClientAnalytics';

export default function Payment() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { items, total, fixedTotal, hasPriceOnRequest, clearBasket } = useBasket();
  const { bookingDateTime, clientInfo, setPendingCheckoutSession, clearFlow, canProceedToStep } = useClientFlow();
  const [selectedMethod, setSelectedMethod] = useState<'room' | 'card'>('card');
  const [isProcessing, setIsProcessing] = useState(false);
  const { t } = useTranslation('client');

  // Fetch venue type via RPC (bypasses RLS policies for anonymous users)
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
  const isOffert = !!hotel?.offert;

  // Coworking spaces don't support room payment
  const supportsRoomPayment = venueTerms.supportsRoomPayment;
  const { trackPageView } = useClientAnalytics(hotelId);
  const hasTrackedPageView = useRef(false);

  // Track page view once
  useEffect(() => {
    if (!hasTrackedPageView.current) {
      hasTrackedPageView.current = true;
      trackPageView('payment');
    }
  }, [trackPageView]);

  // Set default payment method based on venue type
  useEffect(() => {
    if (venueType === 'coworking' || venueType === 'enterprise') {
      setSelectedMethod('card');
    }
  }, [venueType]);

  // Redirect if missing required data
  useEffect(() => {
    if (!canProceedToStep('payment')) {
      navigate(`/client/${hotelId}/cart`);
    }
  }, [canProceedToStep, navigate, hotelId]);

  // Separate fixed and variable items for display
  const fixedItems = items.filter(item => !item.isPriceOnRequest);
  const variableItems = items.filter(item => item.isPriceOnRequest);

  const handlePayment = async () => {
    // Use context data directly instead of sessionStorage
    if (!bookingDateTime || !clientInfo) {
      toast.error(t('common:errors.generic'));
      navigate(`/client/${hotelId}/cart`);
      return;
    }

    setIsProcessing(true);

    try {
      if (isOffert) {
        // Offert mode - create booking directly with zero price
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
            },
            bookingData: {
              date: bookingDateTime.date,
              time: bookingDateTime.time,
            },
            treatments: items.map(item => ({
              treatmentId: item.id,
              quantity: item.quantity,
              note: item.note,
            })),
            paymentMethod: 'offert',
            totalPrice: 0,
          },
        });

        if (error) throw error;

        clearBasket();
        clearFlow();
        navigate(`/client/${hotelId}/confirmation/${data.bookingId}`);
      } else if (selectedMethod === 'card' && !hasPriceOnRequest) {
        // Stripe payment flow
        const { data, error } = await supabase.functions.invoke('create-checkout-session', {
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
            totalPrice: total,
          },
        });

        if (error) throw error;

        if (data?.url) {
          // Validate URL is from trusted Stripe domain before redirect
          const url = new URL(data.url);
          const trustedDomains = ['checkout.stripe.com', 'stripe.com'];
          if (!trustedDomains.some(domain => url.hostname.endsWith(domain))) {
            throw new Error('Invalid redirect URL');
          }
          // Store session info in context for later retrieval
          setPendingCheckoutSession(data.sessionId);
          window.location.href = data.url;
        }
      } else {
        // Room payment - create booking directly
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
            },
            bookingData: {
              date: bookingDateTime.date,
              time: bookingDateTime.time,
            },
            treatments: items.map(item => ({
              treatmentId: item.id,
              quantity: item.quantity,
              note: item.note,
            })),
            paymentMethod: 'room',
            totalPrice: fixedTotal,
          },
        });

        if (error) throw error;

        clearBasket();
        clearFlow();
        navigate(`/client/${hotelId}/confirmation/${data.bookingId}`);
      }
    } catch (error) {
      console.error('Payment error:', error);
      const errorMessage = error instanceof Error ? error.message : t('common:errors.generic');
      toast.error(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="relative min-h-[100dvh] w-full bg-white pb-safe">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200 pt-safe">
        <div className="flex items-center gap-4 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/client/${hotelId}/guest-info`)}
            disabled={isProcessing}
            className="text-gray-900 hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-light text-gray-900">{t('payment.title')}</h1>
        </div>
        <ProgressBar currentStep="payment" />
      </div>

      <div className="px-4 py-4 sm:px-6 sm:py-6 space-y-8 pb-32">
        {/* Page headline */}
        <div className="animate-fade-in">
          <h3 className="text-[10px] uppercase tracking-[0.3em] text-gold-400 mb-3 font-semibold">
            {t('payment.stepLabel')}
          </h3>
          <h2 className="font-serif text-xl sm:text-2xl md:text-3xl text-gray-900 leading-tight">
            {t('payment.headline')}
          </h2>
        </div>

        {/* Offert Banner */}
        {isOffert && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-start gap-3">
              <Gift className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <h3 className="font-medium text-emerald-700 mb-1">{t('offert.banner')}</h3>
                <p className="text-sm text-emerald-600/70">
                  {t('offert.bannerDesc')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Quote Warning Banner */}
        {!isOffert && hasPriceOnRequest && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <h3 className="font-medium text-amber-400 mb-1">{t('payment.quoteRequired')}</h3>
                <p className="text-sm text-amber-400/70">
                  {t('payment.quoteRequiredDesc')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Order Summary */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 sm:p-5 space-y-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <h4 className="text-xs uppercase tracking-widest text-gray-500 font-medium">
            {t('payment.orderSummary')}
          </h4>

          {/* All Items (offert mode shows all together) */}
          {isOffert ? (
            <div className="space-y-3">
              {items.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    {item.name} <span className="text-gray-400">x{item.quantity}</span>
                  </span>
                  <span className="inline-flex items-baseline gap-1.5">
                    <span className="text-xs text-gray-400 line-through font-light">
                      {item.isPriceOnRequest ? t('payment.onQuote') : formatPrice(item.price * item.quantity, item.currency || 'EUR')}
                    </span>
                    <span className="text-sm font-medium text-emerald-600">
                      {formatPrice(0, item.currency || 'EUR')}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Fixed Price Items */}
              {fixedItems.length > 0 && (
                <div className="space-y-3">
                  {fixedItems.map(item => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        {item.name} <span className="text-gray-400">x{item.quantity}</span>
                      </span>
                      <span className="text-gray-900 font-light">
                        {formatPrice(item.price * item.quantity, item.currency || 'EUR')}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Variable Price Items (Quote Required) */}
              {variableItems.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-gray-200">
                  {variableItems.map(item => (
                    <div key={item.id} className="flex justify-between text-sm items-center">
                      <span className="text-gray-600">
                        {item.name} <span className="text-gray-400">x{item.quantity}</span>
                      </span>
                      <span className="text-amber-400 text-xs font-medium">{t('payment.onQuote')}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Total */}
          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            <span className="text-gray-500 text-sm uppercase tracking-wider">{t('checkout.total')}</span>
            {isOffert ? (
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-sm text-gray-400 line-through font-light">{formatPrice(total, items[0]?.currency || 'EUR')}</span>
                <span className="text-emerald-600 text-xl font-serif">{formatPrice(0, items[0]?.currency || 'EUR')}</span>
              </span>
            ) : hasPriceOnRequest ? (
              <div className="text-right">
                <span className="text-gray-900 text-lg font-light">{formatPrice(fixedTotal, items[0]?.currency || 'EUR')}</span>
                <span className="text-amber-400 text-sm ml-2">{t('payment.plusQuote')}</span>
              </div>
            ) : (
              <span className="text-gold-400 text-xl font-serif">{formatPrice(total, items[0]?.currency || 'EUR')}</span>
            )}
          </div>
        </div>

        {/* Payment Method Selection - Only show if no quote required and not offert */}
        {!isOffert && !hasPriceOnRequest && (
          <div className="space-y-4 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <h4 className="text-xs uppercase tracking-widest text-gray-500 font-medium">
              {t('payment.paymentMethod')}
            </h4>

            {/* Card Payment Option */}
            <button
              type="button"
              onClick={() => setSelectedMethod('card')}
              className={cn(
                "w-full p-4 rounded-lg border transition-all duration-200 text-left",
                selectedMethod === 'card'
                  ? "border-gold-400 bg-gold-400/10"
                  : "border-gray-200 bg-gray-50 hover:border-gray-300"
              )}
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all",
                  selectedMethod === 'card' ? "bg-gold-400 text-black" : "bg-gray-100 text-gray-500"
                )}>
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <p className={cn(
                    "font-medium",
                    selectedMethod === 'card' ? "text-gold-400" : "text-gray-900"
                  )}>{t('payment.payNow')}</p>
                  <p className="text-sm text-gray-400">{t('payment.payNowDesc')}</p>
                </div>
              </div>
            </button>

            {/* Room Payment Option - Only for hotels */}
            {supportsRoomPayment && (
              <button
                type="button"
                onClick={() => setSelectedMethod('room')}
                className={cn(
                  "w-full p-4 rounded-lg border transition-all duration-200 text-left",
                  selectedMethod === 'room'
                    ? "border-gold-400 bg-gold-400/10"
                    : "border-gray-200 bg-gray-50 hover:border-gray-300"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all",
                    selectedMethod === 'room' ? "bg-gold-400 text-black" : "bg-gray-100 text-gray-500"
                  )}>
                    <Building className="h-5 w-5" />
                  </div>
                  <div>
                    <p className={cn(
                      "font-medium",
                      selectedMethod === 'room' ? "text-gold-400" : "text-gray-900"
                    )}>{venueTerms.addToLocationLabel}</p>
                    <p className="text-sm text-gray-400">{venueTerms.addToLocationDesc}</p>
                  </div>
                </div>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent pb-safe">
        <Button
          onClick={handlePayment}
          disabled={isProcessing}
          className={cn(
            "w-full h-12 sm:h-14 md:h-16 font-medium tracking-widest text-base rounded-none transition-all duration-300 disabled:bg-gray-200 disabled:text-gray-400",
            isOffert
              ? "bg-emerald-600 text-white hover:bg-emerald-500"
              : hasPriceOnRequest
                ? "bg-amber-500 text-black hover:bg-amber-400"
                : "bg-gray-900 text-white hover:bg-gray-800"
          )}
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
              {t('payment.processing')}
            </>
          ) : isOffert ? (
            t('offert.confirmFreeBooking')
          ) : hasPriceOnRequest ? (
            t('payment.requestQuote')
          ) : selectedMethod === 'card' ? (
            t('payment.payNow')
          ) : (
            t('payment.confirmBook')
          )}
        </Button>
      </div>
    </div>
  );
}
