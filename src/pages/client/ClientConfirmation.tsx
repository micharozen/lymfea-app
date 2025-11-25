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

  useEffect(() => {
    console.log('[ClientConfirmation] Component mounted');
    
    const sessionId = searchParams.get('session_id');
    console.log('[ClientConfirmation] Session ID:', sessionId);

    // Process payment in background but show success immediately after 1.5s
    const timer = setTimeout(() => {
      console.log('[ClientConfirmation] Showing success page');
      setIsProcessing(false);
    }, 1500);

    // Call edge function in background if session_id exists
    if (sessionId) {
      console.log('[ClientConfirmation] Calling handle-checkout-success in background');
      supabase.functions.invoke('handle-checkout-success', {
        body: { sessionId },
      }).then(({ data, error }) => {
        if (error) {
          console.error('[ClientConfirmation] Background error:', error);
        } else {
          console.log('[ClientConfirmation] Background success:', data);
        }
      }).catch(err => {
        console.error('[ClientConfirmation] Background exception:', err);
      });
    }

    return () => clearTimeout(timer);
  }, [searchParams]);

  if (isProcessing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-base text-muted-foreground">Traitement du paiement...</p>
        <p className="text-sm text-muted-foreground mt-2">Veuillez patienter</p>
      </div>
    );
  }

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
