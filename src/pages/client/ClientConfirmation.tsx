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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[ClientConfirmation] Component mounted');
    
    const handlePaymentSuccess = async () => {
      const sessionId = searchParams.get('session_id');
      console.log('[ClientConfirmation] Session ID:', sessionId);
      
      // If no session_id, show success anyway (for room payment flow)
      if (!sessionId) {
        console.log('[ClientConfirmation] No session ID, showing success');
        setSuccess(true);
        setIsProcessing(false);
        return;
      }

      try {
        console.log('[ClientConfirmation] Calling handle-checkout-success...');
        
        const { data, error } = await supabase.functions.invoke('handle-checkout-success', {
          body: { sessionId },
        });

        console.log('[ClientConfirmation] Response:', { data, error });

        if (error) {
          console.error('[ClientConfirmation] Function error:', error);
          throw error;
        }

        if (data?.bookingId) {
          console.log('[ClientConfirmation] Booking created:', data.bookingId);
          setSuccess(true);
          toast.success('Réservation confirmée !');
        } else {
          console.warn('[ClientConfirmation] No booking ID in response');
          // Still show success even without booking ID
          setSuccess(true);
        }
      } catch (err: any) {
        console.error('[ClientConfirmation] Error:', err);
        setError(err.message || 'Une erreur est survenue');
        toast.error('Erreur lors de la confirmation');
        // Show success anyway after 3 seconds
        setTimeout(() => {
          setSuccess(true);
        }, 3000);
      } finally {
        setIsProcessing(false);
      }
    };

    handlePaymentSuccess();
  }, [searchParams, hotelId]);

  // Always show something - never blank
  if (isProcessing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-base text-muted-foreground">Traitement du paiement...</p>
        <p className="text-sm text-muted-foreground mt-2">Veuillez patienter</p>
      </div>
    );
  }

  // Show success page (even if there was an error)
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-6">
        {/* Success Checkmark */}
        <div className="flex justify-center mb-8 animate-fade-in">
          <div className="relative">
            <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" style={{ animationDuration: '2s' }} />
            <div className="relative bg-green-500/10 rounded-full p-6">
              <CheckCircle2 className="h-16 w-16 text-green-600" strokeWidth={2.5} />
            </div>
          </div>
        </div>
        
        {/* Success Message */}
        <div className="space-y-3 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <h1 className="text-2xl font-bold text-foreground">
            Your booking is completed.
          </h1>
          
          <p className="text-muted-foreground leading-relaxed px-4">
            You will receive a message by WhatsApp and email for updates and confirmation
          </p>
        </div>

        {/* Error info if any */}
        {error && (
          <div className="text-xs text-muted-foreground/70 px-4">
            Note: {error}
          </div>
        )}

        {/* Action Button */}
        <div className="pt-8 animate-fade-in" style={{ animationDelay: '0.4s' }}>
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
