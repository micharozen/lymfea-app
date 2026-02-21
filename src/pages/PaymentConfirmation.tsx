import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { brand, brandLogos } from '@/config/brand';

export default function PaymentConfirmation() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('client');

  // Fetch booking to get hotel_id and hotel_name for navigation and display
  const { data: booking, isLoading } = useQuery({
    queryKey: ['payment-confirmation', bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('hotel_id, hotel_name, status, payment_status')
        .eq('id', bookingId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!bookingId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
        <img src={brandLogos.monogramWhiteClient} alt={brand.name} className="h-16 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden flex flex-col justify-center pb-safe bg-black">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-black via-black/95 to-black" />

      {/* Content */}
      <div className="relative z-10 w-full flex flex-col items-center max-w-lg mx-auto px-6 animate-fade-in">

        {/* Brand Logo */}
        <a href={brand.website} target="_blank" rel="noopener noreferrer">
          <img src={brandLogos.monogramWhiteClient} alt={brand.name} className="h-14 w-14 mb-12" />
        </a>

        {/* Success Icon */}
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-gold-400/20 rounded-full animate-ping" />
          <div className="relative bg-gold-400/10 rounded-full p-6 ring-1 ring-gold-400/30">
            <CheckCircle2 className="h-16 w-16 text-gold-400" strokeWidth={1.5} />
          </div>
        </div>

        {/* Label */}
        <h3 className="text-[10px] uppercase tracking-[0.3em] text-gold-400 mb-4 font-semibold">
          {t('paymentConfirmation.label')}
        </h3>

        {/* Main Message */}
        <h1 className="font-serif text-3xl md:text-4xl leading-tight mb-4 text-white text-center">
          {t('paymentConfirmation.title')}<br/>
          <span className="italic text-gold-200">{t('paymentConfirmation.titleHighlight')}</span>
        </h1>

        <p className="text-gray-400 text-sm font-light leading-relaxed mb-10 max-w-sm text-center">
          {t('paymentConfirmation.message')}
        </p>

        {/* Hotel info if available */}
        {booking?.hotel_name && (
          <div className="flex items-center gap-2 text-[10px] text-white/40 uppercase tracking-[0.2em] font-light mb-10 py-4 border-y border-white/5 w-full justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-gold-400/50"></span>
            {booking.hotel_name}
          </div>
        )}

        {/* Action Button */}
        {booking?.hotel_id && (
          <Button
            onClick={() => navigate(`/client/${booking.hotel_id}`)}
            className="w-full h-16 bg-white text-black hover:bg-gold-50 font-medium tracking-widest text-base rounded-none transition-all duration-300"
          >
            {t('paymentConfirmation.discoverServices')}
          </Button>
        )}
      </div>
    </div>
  );
}
