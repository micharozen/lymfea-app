import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function Confirmation() {
  const { hotelId, bookingId } = useParams<{ hotelId: string; bookingId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('client');

  // Fetch booking to check if it's a quote
  const { data: booking, isLoading } = useQuery({
    queryKey: ['booking-confirmation', bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('status')
        .eq('id', bookingId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!bookingId,
  });

  const isQuotePending = booking?.status === 'quote_pending';

  // Show loading while fetching booking status
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-6">
        {/* Success Checkmark */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className={`absolute inset-0 ${isQuotePending ? 'bg-amber-500/20' : 'bg-green-500/20'} rounded-full animate-ping`} />
            <div className={`relative ${isQuotePending ? 'bg-amber-500/10' : 'bg-green-500/10'} rounded-full p-6`}>
              {isQuotePending ? (
                <Clock className="h-16 w-16 text-amber-600" strokeWidth={2.5} />
              ) : (
                <CheckCircle2 className="h-16 w-16 text-green-600" strokeWidth={2.5} />
              )}
            </div>
          </div>
        </div>
        
        {/* Success Message */}
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-white">
            {isQuotePending ? t('confirmation.quotePendingTitle') : t('confirmation.title')}
          </h1>
          
          <p className="text-white/70 leading-relaxed px-4">
            {isQuotePending 
              ? t('confirmation.quotePendingMessage')
              : t('confirmation.message')
            }
          </p>
        </div>

        {/* Action Button */}
        <div className="pt-8">
          <Button
            onClick={() => navigate(`/client/${hotelId}`)}
            className="w-full h-14 text-base rounded-full"
            size="lg"
          >
            {t('confirmation.backHome')}
          </Button>
        </div>
      </div>
    </div>
  );
}
