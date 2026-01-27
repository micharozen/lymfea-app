import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, AlertTriangle, CreditCard, Building } from 'lucide-react';
import { useBasket } from './context/CartContext';
import { useClientFlow } from './context/FlowContext';
import { useVenueTerms, type VenueType } from '@/hooks/useVenueTerms';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatPrice';
import { ProgressBar } from '@/components/client/ProgressBar';

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

  // Coworking spaces don't support room payment
  const supportsRoomPayment = venueTerms.supportsRoomPayment;

  // Set default payment method based on venue type
  useEffect(() => {
    if (venueType === 'coworking') {
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
      if (selectedMethod === 'card' && !hasPriceOnRequest) {
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
    <div className="relative min-h-[100dvh] w-full bg-black pb-safe">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/95 backdrop-blur-sm border-b border-white/10 pt-safe">
        <div className="flex items-center gap-4 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/client/${hotelId}/guest-info`)}
            disabled={isProcessing}
            className="text-white hover:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-light text-white">{t('payment.title')}</h1>
        </div>
        <ProgressBar currentStep="payment" />
      </div>

      <div className="px-6 py-6 space-y-8 pb-32">
        {/* Page headline */}
        <div className="animate-fade-in">
          <h3 className="text-[10px] uppercase tracking-[0.3em] text-gold-400 mb-3 font-semibold">
            {t('payment.stepLabel')}
          </h3>
          <h2 className="font-serif text-2xl text-white leading-tight">
            {t('payment.headline')}
          </h2>
        </div>

        {/* Quote Warning Banner */}
        {hasPriceOnRequest && (
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
        <div className="bg-white/5 border border-white/10 rounded-lg p-5 space-y-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <h4 className="text-xs uppercase tracking-widest text-white/60 font-medium">
            {t('payment.orderSummary')}
          </h4>

          {/* Fixed Price Items */}
          {fixedItems.length > 0 && (
            <div className="space-y-3">
              {fixedItems.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-white/70">
                    {item.name} <span className="text-white/40">x{item.quantity}</span>
                  </span>
                  <span className="text-white font-light">
                    {formatPrice(item.price * item.quantity, item.currency || 'EUR')}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Variable Price Items (Quote Required) */}
          {variableItems.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-white/10">
              {variableItems.map(item => (
                <div key={item.id} className="flex justify-between text-sm items-center">
                  <span className="text-white/70">
                    {item.name} <span className="text-white/40">x{item.quantity}</span>
                  </span>
                  <span className="text-amber-400 text-xs font-medium">{t('payment.onQuote')}</span>
                </div>
              ))}
            </div>
          )}

          {/* Total */}
          <div className="flex justify-between items-center pt-4 border-t border-white/10">
            <span className="text-white/60 text-sm uppercase tracking-wider">{t('checkout.total')}</span>
            {hasPriceOnRequest ? (
              <div className="text-right">
                <span className="text-white text-lg font-light">{formatPrice(fixedTotal, items[0]?.currency || 'EUR')}</span>
                <span className="text-amber-400 text-sm ml-2">{t('payment.plusQuote')}</span>
              </div>
            ) : (
              <span className="text-gold-400 text-xl font-serif">{formatPrice(total, items[0]?.currency || 'EUR')}</span>
            )}
          </div>
        </div>

        {/* Payment Method Selection - Only show if no quote required */}
        {!hasPriceOnRequest && (
          <div className="space-y-4 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <h4 className="text-xs uppercase tracking-widest text-white/60 font-medium">
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
                  : "border-white/20 bg-white/5 hover:border-white/40"
              )}
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                  selectedMethod === 'card' ? "bg-gold-400 text-black" : "bg-white/10 text-white/60"
                )}>
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <p className={cn(
                    "font-medium",
                    selectedMethod === 'card' ? "text-gold-400" : "text-white"
                  )}>{t('payment.payNow')}</p>
                  <p className="text-sm text-white/50">{t('payment.payNowDesc')}</p>
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
                    : "border-white/20 bg-white/5 hover:border-white/40"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                    selectedMethod === 'room' ? "bg-gold-400 text-black" : "bg-white/10 text-white/60"
                  )}>
                    <Building className="h-5 w-5" />
                  </div>
                  <div>
                    <p className={cn(
                      "font-medium",
                      selectedMethod === 'room' ? "text-gold-400" : "text-white"
                    )}>{venueTerms.addToLocationLabel}</p>
                    <p className="text-sm text-white/50">{venueTerms.addToLocationDesc}</p>
                  </div>
                </div>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black to-transparent pb-safe">
        <Button
          onClick={handlePayment}
          disabled={isProcessing}
          className={cn(
            "w-full h-16 font-medium tracking-widest text-base rounded-none transition-all duration-300 disabled:bg-white/20 disabled:text-white/40",
            hasPriceOnRequest
              ? "bg-amber-500 text-black hover:bg-amber-400"
              : "bg-white text-black hover:bg-gold-50"
          )}
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {t('payment.processing')}
            </>
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
