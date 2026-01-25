import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PractitionerCarousel } from '@/components/client/PractitionerCarousel';
import { WelcomeSkeleton } from '@/components/client/skeletons/WelcomeSkeleton';
import welcomeBgHotel from '@/assets/welcome-bg-couple.jpg';
import welcomeBgCoworking from '@/assets/background-coworking.jpg';
import oomLogo from '@/assets/oom-monogram-white-client.svg';
import { formatPrice } from '@/lib/formatPrice';
import { useVenueTerms, type VenueType } from '@/hooks/useVenueTerms';

// Optimize Supabase image URLs for thumbnails
const getOptimizedImageUrl = (url: string | null, width: number, quality = 75): string | null => {
  if (!url || !url.includes('supabase.co/storage')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}width=${width}&quality=${quality}`;
};

interface Treatment {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  duration: number | null;
  image: string | null;
  category: string;
  price_on_request: boolean | null;
}

export default function Welcome() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('client');

  const { data: hotel, isLoading: isHotelLoading } = useQuery({
    queryKey: ['public-hotel', hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_public_hotel_by_id', { _hotel_id: hotelId });

      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!hotelId,
    staleTime: 10 * 60 * 1000, // 10 minutes - hotel info rarely changes
    gcTime: 30 * 60 * 1000,    // 30 minutes cache
  });

  const { data: treatments = [], isLoading: isTreatmentsLoading } = useQuery({
    queryKey: ['public-treatments-preview', hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_public_treatments', { _hotel_id: hotelId });

      if (error) throw error;
      // Take first 4-5 treatments for preview
      return (data || []).slice(0, 5) as Treatment[];
    },
    enabled: !!hotelId,
    staleTime: 5 * 60 * 1000, // 5 minutes - treatments change occasionally
    gcTime: 15 * 60 * 1000,   // 15 minutes cache
  });

  const { data: venueType } = useQuery({
    queryKey: ['venue-type', hotelId],
    queryFn: async () => {
      const { data } = await supabase
        .from('hotels')
        .select('venue_type')
        .eq('id', hotelId)
        .single();
      return (data?.venue_type as VenueType) || null;
    },
    enabled: !!hotelId,
    staleTime: 30 * 60 * 1000, // 30 minutes - venue type never changes mid-session
    gcTime: 60 * 60 * 1000,    // 1 hour cache
  });

  const venueTerms = useVenueTerms(venueType);
  const backgroundImage = venueType === 'coworking' ? welcomeBgCoworking : welcomeBgHotel;

  const isLoading = isHotelLoading || isTreatmentsLoading;

  if (isLoading) {
    return <WelcomeSkeleton />;
  }

  if (!hotel) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black p-4 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-serif mb-2">{t('hotelNotFound')}</h1>
          <p className="text-white/60">{t('checkQrCode')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden flex flex-col justify-end pb-safe bg-black">
      
      {/* 1. Immersive Background */}
      <div className="absolute inset-0 z-0">
        <img
            src={backgroundImage}
            className="h-full w-full object-cover brightness-[0.5] scale-105 animate-[pulse_10s_infinite_alternate]"
            alt="Ambiance" 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/40" />
      </div>

       {/* Language Switcher */}
       <div className="absolute top-4 right-4 z-20">
        <LanguageSwitcher variant="client" />
      </div>

      {/* 2. Content Layer */}
      <div className="relative z-10 w-full flex flex-col max-w-lg mx-auto overflow-y-auto no-scrollbar pt-20">
        
        {/* Brand & Personalization */}
        <div className="px-6 mb-8 animate-fade-in">
             <a href="https://oomworld.com" target="_blank" rel="noopener noreferrer">
               <img src={oomLogo} alt="OOM" className="h-14 w-14 mb-8" />
             </a>
            <h3 className="text-[10px] uppercase tracking-[0.3em] text-gold-400 mb-4 font-semibold">
                {venueTerms.exclusiveServiceLabel}
            </h3>
            <h1 className="font-serif text-4xl md:text-5xl leading-tight mb-4 text-white">
                {t('welcome.artOfHairdressing')} <br/>
                <span className="italic text-gold-200">{t('welcome.at')} {hotel?.name}</span>
            </h1>
            <p className="text-gray-300 text-sm font-light leading-relaxed mb-6 max-w-sm">
                {venueTerms.serviceDescription}
            </p>
        </div>

        {/* Our Experts Section */}
        <PractitionerCarousel hotelId={hotelId!} />

        {/* 3. Visual Service Menu (Preview) */}
        {treatments.length > 0 && (
          <div className="mb-10 animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center justify-between px-6 mb-4">
              <h4 className="text-xs uppercase tracking-widest text-white/80 font-medium">{t('welcome.ourServices')}</h4>
              <button 
                onClick={() => navigate(`/client/${hotelId}/treatments`)}
                className="text-xs text-gold-400 hover:text-gold-300"
              >
                {t('welcome.seeAll')}
              </button>
            </div>
            <div className="flex gap-4 overflow-x-auto px-6 no-scrollbar pb-2">
              {treatments.map((treatment) => (
                <div 
                  key={treatment.id}
                  onClick={() => navigate(`/client/${hotelId}/treatments`)}
                  className="flex-shrink-0 w-32 group cursor-pointer"
                >
                  <div className="aspect-[3/4] rounded-sm overflow-hidden mb-2 bg-white/5 ring-1 ring-white/10 group-hover:ring-gold-400/50 transition-all">
                    {treatment.image ? (
                      <img
                        src={getOptimizedImageUrl(treatment.image, 256) || ''}
                        alt={treatment.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover grayscale-[0.3] group-hover:grayscale-0 transition-all duration-500 group-hover:scale-110"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-4">
                        <img src={oomLogo} className="w-full opacity-20" alt="" />
                      </div>
                    )}
                  </div>
                  <h5 className="text-[10px] font-medium text-white/90 truncate mb-0.5">{treatment.name}</h5>
                  <p className="text-[10px] text-gold-400/80 font-light">
                    {treatment.price_on_request ? t('welcome.onQuote') : formatPrice(treatment.price, treatment.currency || 'EUR', { decimals: 0 })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. Call to Action & Social Proof */}
        <div className="px-6 pb-10 space-y-6 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <Button 
                onClick={() => navigate(`/client/${hotelId}/treatments`)}
                className="w-full h-16 bg-white text-black hover:bg-gold-50 font-medium tracking-widest text-base rounded-none transition-all duration-300"
            >
                {t('welcome.bookSession')}
            </Button>
            
            <div className="flex flex-col items-center gap-4 py-4 border-y border-white/5">
                <div className="flex items-center gap-8 text-[10px] text-white/40 uppercase tracking-[0.2em] font-light">
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-gold-400/50"></span>
                    L'Oréal
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-gold-400/50"></span>
                    Kérastase
                  </span>
                   <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-gold-400/50"></span>
                    Dyson
                  </span>
                </div>
                <p className="text-[9px] text-white/30 text-center uppercase tracking-widest leading-relaxed">
                  {t('welcome.availability')} <br/>
                  {t('welcome.equipmentIncluded')}
                </p>
            </div>

             <Button 
                variant="ghost" 
                onClick={() => navigate(`/client/${hotelId}/info`)} 
                className="w-full text-white/50 hover:text-white hover:bg-white/5 text-[10px] uppercase tracking-widest font-light h-auto py-2"
            >
                {t('welcome.howItWorks')}
            </Button>
        </div>
      </div>
    </div>
  );
}