import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export default function ClientConfirmation() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isProcessing, setIsProcessing] = useState(true);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const handlePaymentSuccess = async () => {
      const sessionId = searchParams.get('session_id');
      
      if (sessionId) {
        try {
          console.log('[ClientConfirmation] Processing payment for session:', sessionId);
          
          const { data, error } = await supabase.functions.invoke('handle-checkout-success', {
            body: { sessionId },
          });

          if (error) throw error;

          if (data?.bookingId) {
            console.log('[ClientConfirmation] Booking created:', data.bookingId);
            setSuccess(true);
          } else {
            throw new Error('No booking ID received');
          }
        } catch (error: any) {
          console.error('[ClientConfirmation] Error:', error);
          toast.error('Erreur lors de la confirmation du paiement');
          setTimeout(() => navigate(`/client/${hotelId}`), 2000);
        } finally {
          setIsProcessing(false);
        }
      } else {
        // Direct access without session_id (e.g., room payment)
        setSuccess(true);
        setIsProcessing(false);
      }
    };

    handlePaymentSuccess();
  }, [searchParams, hotelId, navigate]);

  if (isProcessing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Processing your payment...</p>
      </div>
    );
  }

  if (!success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-4">Une erreur est survenue</h1>
          <Button onClick={() => navigate(`/client/${hotelId}`)}>
            Retour à l'accueil
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-6 animate-fade-in">
        {/* Success Checkmark */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" />
            <div className="relative bg-green-500/10 rounded-full p-6">
              <CheckCircle2 className="h-16 w-16 text-green-600" strokeWidth={2.5} />
            </div>
          </div>
        </div>
        
        {/* Success Message */}
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-foreground">
            Your booking is completed.
          </h1>
          
          <p className="text-muted-foreground leading-relaxed px-4">
            You will receive a message by WhatsApp and email for updates and confirmation
          </p>
        </div>

        {/* Action Button */}
        <div className="pt-8">
          <Button
            onClick={() => navigate(`/client/${hotelId}`)}
            className="w-full h-14 text-base"
            size="lg"
          >
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
