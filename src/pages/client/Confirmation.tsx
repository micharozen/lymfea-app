import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useRef, useState } from 'react';
import { useClientAnalytics } from '@/hooks/useClientAnalytics';
import { useBasket } from './context/CartContext';
import { useClientFlow } from './context/FlowContext';
import { toast } from 'sonner';

export default function Confirmation() {
  const { hotelId, bookingId: urlBookingId } = useParams<{ hotelId: string; bookingId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('client');
  const { trackConversion } = useClientAnalytics(hotelId);
  const hasTrackedConversion = useRef(false);

  // NOUVEAU : Outils pour la finalisation post-Stripe
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const { items, clearBasket } = useBasket();
  const { clientInfo, bookingDateTime, therapistGenderPreference, clearFlow } = useClientFlow();

  // On gère un état local pour le VRAI ID de réservation
  const [realBookingId, setRealBookingId] = useState<string | null>(urlBookingId === 'setup' ? null : urlBookingId || null);
  const [isConfirmingSetup, setIsConfirmingSetup] = useState(urlBookingId === 'setup');
  
  const bookingId = realBookingId; // On utilise ça pour tout le reste du fichier

  // Intercepter le retour de Stripe et créer la réservation
  useEffect(() => {
    if (urlBookingId === 'setup' && sessionId && isConfirmingSetup) {
      const confirmSetup = async () => {
        try {
          const { data, error } = await supabase.functions.invoke('confirm-setup-intent', {
            body: {
              sessionId, // On envoie l'ID de session à notre Edge Function
              hotelId,
              clientData: {
                firstName: clientInfo?.firstName,
                lastName: clientInfo?.lastName,
                phone: `${clientInfo?.countryCode}${clientInfo?.phone}`,
                email: clientInfo?.email,
                roomNumber: clientInfo?.roomNumber,
                note: clientInfo?.note || '',
              },
              bookingData: {
                date: bookingDateTime?.date,
                time: bookingDateTime?.time,
              },
              treatmentIds: items.map(item => item.id),
              treatments: items.map(item => ({
                treatmentId: item.id,
                variantId: item.variantId,
              })),
              therapistGender: therapistGenderPreference
            }
          });

          if (error) throw error;

          // Succès ! On stocke le vrai ID et on nettoie le panier
          setRealBookingId(data.bookingId);
          clearBasket();
          clearFlow();
        } catch (error) {
          console.error('Erreur confirmation Stripe:', error);
          toast.error("Le créneau n'est plus disponible ou une erreur est survenue.");
          navigate(`/client/${hotelId}/payment`);
        } finally {
          setIsConfirmingSetup(false);
        }
      };

      confirmSetup();
    }
  }, [urlBookingId, sessionId, isConfirmingSetup]); 

  // Track conversion once when booking is confirmed
  useEffect(() => {
    if (bookingId && !hasTrackedConversion.current) {
      hasTrackedConversion.current = true;
      trackConversion('booking_completed', { bookingId });
    }
  }, [bookingId, trackConversion]);

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
    enabled: !!bookingId, // Ne se lance QUE si on a un vrai ID
  });

  const isQuotePending = booking?.status === 'quote_pending';

  // Show loading while fetching booking status OR confirming setup
  if (isLoading || isConfirmingSetup) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        {isConfirmingSetup && (
          <p className="mt-4 text-gray-500 font-medium animate-pulse">
            Finalisation de votre réservation...
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-[92vw] sm:max-w-sm md:max-w-md text-center space-y-6">
        {/* Success Checkmark */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className={`absolute inset-0 ${isQuotePending ? 'bg-amber-500/20' : 'bg-green-500/20'} rounded-full animate-ping`} />
            <div className={`relative ${isQuotePending ? 'bg-amber-500/10' : 'bg-green-500/10'} rounded-full p-4 sm:p-6`}>
              {isQuotePending ? (
                <Clock className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 text-amber-600" strokeWidth={2.5} />
              ) : (
                <CheckCircle2 className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 text-green-600" strokeWidth={2.5} />
              )}
            </div>
          </div>
        </div>
        
        {/* Success Message */}
        <div className="space-y-3">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            {isQuotePending ? t('confirmation.quotePendingTitle') : t('confirmation.title')}
          </h1>
          
          <p className="text-gray-600 leading-relaxed px-2 sm:px-4">
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
            className="w-full h-12 sm:h-14 text-base rounded-full"
            size="lg"
          >
            {t('confirmation.backHome')}
          </Button>
        </div>
      </div>
    </div>
  );
}