import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CreditCard, Hotel, Loader2 } from 'lucide-react';
import { useBasket } from './context/BasketContext';
import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import BookingProgressBar from '@/components/BookingProgressBar';

export default function ClientPayment() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { items, total, clearBasket } = useBasket();
  const [selectedMethod, setSelectedMethod] = useState<'card' | 'room'>('room');
  const [isProcessing, setIsProcessing] = useState(false);
  const { t, i18n } = useTranslation('client');

  const handlePayment = async () => {
    const dateTimeStr = sessionStorage.getItem('bookingDateTime');
    const clientInfoStr = sessionStorage.getItem('clientInfo');
    
    if (!dateTimeStr || !clientInfoStr) {
      toast.error(t('common:errors.generic'));
      navigate(`/client/${hotelId}/basket`);
      return;
    }

    const dateTime = JSON.parse(dateTimeStr);
    const clientInfo = JSON.parse(clientInfoStr);
    setIsProcessing(true);

    try {
      if (selectedMethod === 'card') {
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
              date: dateTime.date,
              time: dateTime.time,
            },
            treatments: items.map(item => ({
              id: item.id,
              quantity: item.quantity,
              note: item.note,
            })),
            totalPrice: total,
          },
        });

        if (error) {
          console.error('Stripe checkout error:', error);
          throw error;
        }

        if (data?.url) {
          window.location.replace(data.url);
          return;
        } else {
          throw new Error('No checkout URL received');
        }
      }

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
            date: dateTime.date,
            time: dateTime.time,
          },
          treatments: items.map(item => ({
            treatmentId: item.id,
            quantity: item.quantity,
            note: item.note,
          })),
          paymentMethod: selectedMethod,
          totalPrice: total,
        },
      });

      if (error) throw error;

      clearBasket();
      sessionStorage.removeItem('bookingDateTime');
      sessionStorage.removeItem('clientInfo');
      navigate(`/client/${hotelId}/confirmation/${data.bookingId}`);
      
    } catch (error: any) {
      console.error('Payment error:', error);
      toast.error(error.message || t('common:errors.generic'));
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
        {/* Order Summary */}
        <div className="bg-card rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold text-base mb-3">{t('payment.orderSummary')}</h2>
          {items.map(item => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {item.name} x{item.quantity}
              </span>
              <span className="font-medium">
                €{(item.price * item.quantity).toFixed(2)}
              </span>
            </div>
          ))}
          <div className="flex justify-between text-lg font-bold pt-3 border-t border-border">
            <span>{t('checkout.total')}</span>
            <span>€{total.toFixed(2)}</span>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="space-y-3">
          <h2 className="font-semibold text-base">{t('payment.paymentMethod')}</h2>
          
          {/* Add to Room */}
          <button
            onClick={() => setSelectedMethod('room')}
            disabled={isProcessing}
            className={`w-full p-4 rounded-2xl border-2 transition-all text-left active:scale-[0.98] ${
              selectedMethod === 'room'
                ? 'border-primary bg-primary/5'
                : 'border-border'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                selectedMethod === 'room' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}>
                <Hotel className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-sm mb-0.5">{t('payment.addToRoom')}</h3>
                <p className="text-xs text-muted-foreground">
                  {t('payment.addToRoomDesc')}
                </p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                selectedMethod === 'room' ? 'border-primary' : 'border-border'
              }`}>
                {selectedMethod === 'room' && (
                  <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                )}
              </div>
            </div>
          </button>

          {/* Pay with Card */}
          <button
            onClick={() => setSelectedMethod('card')}
            disabled={isProcessing}
            className={`w-full p-4 rounded-2xl border-2 transition-all text-left active:scale-[0.98] ${
              selectedMethod === 'card'
                ? 'border-primary bg-primary/5'
                : 'border-border'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                selectedMethod === 'card' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}>
                <CreditCard className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-sm mb-0.5">{t('payment.payNow')}</h3>
                <p className="text-xs text-muted-foreground">
                  {t('payment.payNowDesc')}
                </p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                selectedMethod === 'card' ? 'border-primary' : 'border-border'
              }`}>
                {selectedMethod === 'card' && (
                  <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                )}
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border pb-safe">
        <Button
          onClick={handlePayment}
          disabled={isProcessing}
          className="w-full h-14 text-base rounded-full"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {t('payment.processing')}
            </>
          ) : (
            <>
              {selectedMethod === 'room' ? t('payment.confirmBook') : `${t('payment.payNow')} €${total.toFixed(2)}`}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
