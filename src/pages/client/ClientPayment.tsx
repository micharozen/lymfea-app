import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, AlertTriangle, CreditCard, Building } from 'lucide-react';
import { useBasket } from './context/BasketContext';
import { useClientFlow } from './context/ClientFlowContext';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import BookingProgressBar from '@/components/BookingProgressBar';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatPrice';

export default function ClientPayment() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { items, total, fixedTotal, hasPriceOnRequest, clearBasket } = useBasket();
  const { bookingDateTime, clientInfo, setPendingCheckoutSession, clearFlow, canProceedToStep } = useClientFlow();
  const [selectedMethod, setSelectedMethod] = useState<'room' | 'card'>('room');
  const [isProcessing, setIsProcessing] = useState(false);
  const { t } = useTranslation('client');

  // Redirect if missing required data
  useEffect(() => {
    if (!canProceedToStep('payment')) {
      navigate(`/client/${hotelId}/basket`);
    }
  }, [canProceedToStep, navigate, hotelId]);

  // Separate fixed and variable items for display
  const fixedItems = items.filter(item => !item.isPriceOnRequest);
  const variableItems = items.filter(item => item.isPriceOnRequest);

  const handlePayment = async () => {
    // Use context data directly instead of sessionStorage
    if (!bookingDateTime || !clientInfo) {
      toast.error(t('common:errors.generic'));
      navigate(`/client/${hotelId}/basket`);
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
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border pt-safe">
        <div className="flex items-center gap-4 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/client/${hotelId}/info`)}
            disabled={isProcessing}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">{t('payment.title')}</h1>
        </div>
        <BookingProgressBar currentStep={4} totalSteps={4} />
      </div>

      <div className="p-4 space-y-6">
        {/* Quote Warning Banner */}
        {hasPriceOnRequest && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <h3 className="font-semibold text-amber-800 mb-1">{t('payment.quoteRequired')}</h3>
                <p className="text-sm text-amber-700">
                  {t('payment.quoteRequiredDesc')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Order Summary */}
        <div className="bg-card rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold text-base mb-3">{t('payment.orderSummary')}</h2>
          
          {/* Fixed Price Items */}
          {fixedItems.length > 0 && (
            <div className="space-y-2">
              {fixedItems.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {item.name} x{item.quantity}
                  </span>
                  <span className="font-medium">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
          )}
          
          {/* Variable Price Items (Quote Required) */}
          {variableItems.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-border">
              {variableItems.map(item => (
                <div key={item.id} className="flex justify-between text-sm items-center">
                  <span className="text-muted-foreground">
                    {item.name} x{item.quantity}
                  </span>
                  <span className="text-amber-600 text-xs font-medium whitespace-nowrap">{t('payment.onQuote')}</span>
                </div>
              ))}
            </div>
          )}
          
          <div className="flex justify-between text-lg font-bold pt-3 border-t border-border">
            <span>{t('checkout.total')}</span>
            {hasPriceOnRequest ? (
              <div className="text-right">
                <span className="text-base">{formatPrice(fixedTotal)}</span>
                <span className="text-amber-600 text-sm ml-1">{t('payment.plusQuote')}</span>
              </div>
            ) : (
              <span>{formatPrice(total)}</span>
            )}
          </div>
        </div>

        {/* Payment Method Selection - Only show if no quote required */}
        {!hasPriceOnRequest && (
          <div className="space-y-3">
            <h2 className="font-semibold text-base">{t('payment.paymentMethod')}</h2>
            
            {/* Room Payment Option */}
            <button
              onClick={() => setSelectedMethod('room')}
              className={cn(
                "w-full p-4 rounded-xl border-2 transition-all text-left",
                selectedMethod === 'room' 
                  ? "border-primary bg-primary/5" 
                  : "border-border hover:border-primary/50"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  selectedMethod === 'room' ? "bg-primary text-primary-foreground" : "bg-muted"
                )}>
                  <Building className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">{t('payment.addToRoom')}</p>
                  <p className="text-sm text-muted-foreground">{t('payment.addToRoomDesc')}</p>
                </div>
              </div>
            </button>

            {/* Card Payment Option */}
            <button
              onClick={() => setSelectedMethod('card')}
              className={cn(
                "w-full p-4 rounded-xl border-2 transition-all text-left",
                selectedMethod === 'card' 
                  ? "border-primary bg-primary/5" 
                  : "border-border hover:border-primary/50"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  selectedMethod === 'card' ? "bg-primary text-primary-foreground" : "bg-muted"
                )}>
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">{t('payment.payNow')}</p>
                  <p className="text-sm text-muted-foreground">{t('payment.payNowDesc')}</p>
                </div>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border pb-safe">
        <Button
          onClick={handlePayment}
          disabled={isProcessing}
          className={`w-full h-14 text-base rounded-full ${hasPriceOnRequest ? 'bg-amber-500 hover:bg-amber-600' : ''}`}
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
