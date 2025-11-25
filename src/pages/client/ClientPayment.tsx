import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CreditCard, Hotel, Loader2 } from 'lucide-react';
import { useBasket } from './context/BasketContext';
import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function ClientPayment() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { items, total, clearBasket } = useBasket();
  const [selectedMethod, setSelectedMethod] = useState<'card' | 'room'>('room');
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePayment = async () => {
    const checkoutData = sessionStorage.getItem('checkoutData');
    if (!checkoutData) {
      toast.error('Checkout data not found');
      navigate(`/client/${hotelId}/checkout`);
      return;
    }

    const formData = JSON.parse(checkoutData);
    setIsProcessing(true);

    try {
      // Call edge function to create booking
      const { data, error } = await supabase.functions.invoke('create-client-booking', {
        body: {
          hotelId,
          clientData: {
            firstName: formData.firstName,
            lastName: formData.lastName,
            phone: `${formData.countryCode}${formData.phone}`,
            email: formData.email,
            roomNumber: formData.roomNumber,
          },
          bookingData: {
            date: formData.date,
            time: formData.time,
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

      if (selectedMethod === 'card') {
        // TODO: Integrate Stripe checkout
        toast.info('Stripe integration coming soon');
        return;
      }

      // Clear basket and navigate to confirmation
      clearBasket();
      sessionStorage.removeItem('checkoutData');
      navigate(`/client/${hotelId}/confirmation/${data.bookingId}`);
      
    } catch (error: any) {
      console.error('Payment error:', error);
      toast.error(error.message || 'Failed to process booking');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="flex items-center gap-4 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/client/${hotelId}/checkout`)}
            disabled={isProcessing}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">Payment</h1>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Order Summary */}
        <div className="bg-card rounded-lg p-4 space-y-3">
          <h2 className="font-semibold text-lg mb-4">Order Summary</h2>
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
            <span>Total</span>
            <span>€{total.toFixed(2)}</span>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="space-y-3">
          <h2 className="font-semibold text-lg">Payment Method</h2>
          
          {/* Add to Room */}
          <button
            onClick={() => setSelectedMethod('room')}
            disabled={isProcessing}
            className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
              selectedMethod === 'room'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                selectedMethod === 'room' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}>
                <Hotel className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Add to Room</h3>
                <p className="text-sm text-muted-foreground">
                  Charge will be added to your room bill
                </p>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                selectedMethod === 'room' 
                  ? 'border-primary' 
                  : 'border-border'
              }`}>
                {selectedMethod === 'room' && (
                  <div className="w-3 h-3 rounded-full bg-primary" />
                )}
              </div>
            </div>
          </button>

          {/* Pay with Card */}
          <button
            onClick={() => setSelectedMethod('card')}
            disabled={isProcessing}
            className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
              selectedMethod === 'card'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                selectedMethod === 'card' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}>
                <CreditCard className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Pay Now</h3>
                <p className="text-sm text-muted-foreground">
                  Credit card, Apple Pay, Google Pay
                </p>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                selectedMethod === 'card' 
                  ? 'border-primary' 
                  : 'border-border'
              }`}>
                {selectedMethod === 'card' && (
                  <div className="w-3 h-3 rounded-full bg-primary" />
                )}
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
        <Button
          onClick={handlePayment}
          disabled={isProcessing}
          className="w-full h-14 text-lg"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              {selectedMethod === 'room' ? 'Confirm & Book' : `Pay €${total.toFixed(2)}`}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
