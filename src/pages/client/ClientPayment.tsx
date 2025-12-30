import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { useBasket } from './context/BasketContext';
import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import BookingProgressBar from '@/components/BookingProgressBar';
import { Badge } from '@/components/ui/badge';

export default function ClientPayment() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { items, total, fixedTotal, hasPriceOnRequest, clearBasket } = useBasket();
  const [selectedMethod] = useState<'room'>('room');
  const [isProcessing, setIsProcessing] = useState(false);
  const { t, i18n } = useTranslation('client');

  // Separate fixed and variable items for display
  const fixedItems = items.filter(item => !item.isPriceOnRequest);
  const variableItems = items.filter(item => item.isPriceOnRequest);

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
      // Create booking directly (room payment only)
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
          totalPrice: fixedTotal, // Only fixed items total - variable items will be quoted
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
        {/* Quote Warning Banner */}
        {hasPriceOnRequest && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <h3 className="font-semibold text-amber-800 mb-1">Quote Required</h3>
                <p className="text-sm text-amber-700">
                  Your cart contains services requiring a custom quote. 
                  An advisor will contact you to confirm the final price.
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
                    €{(item.price * item.quantity).toFixed(2)}
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
                  <span className="text-amber-600 text-xs font-medium whitespace-nowrap">On quote</span>
                </div>
              ))}
            </div>
          )}
          
          <div className="flex justify-between text-lg font-bold pt-3 border-t border-border">
            <span>{t('checkout.total')}</span>
            {hasPriceOnRequest ? (
              <div className="text-right">
                <span className="text-base">€{fixedTotal.toFixed(2)}</span>
                <span className="text-amber-600 text-sm ml-1">+ quote</span>
              </div>
            ) : (
              <span>€{total.toFixed(2)}</span>
            )}
          </div>
        </div>
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
            "Request Final Quote"
          ) : (
            t('payment.confirmBook')
          )}
        </Button>
      </div>
    </div>
  );
}
