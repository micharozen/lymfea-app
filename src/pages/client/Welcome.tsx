import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useClientAnalytics } from '@/hooks/useClientAnalytics';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { WelcomeSkeleton } from '@/components/client/skeletons/WelcomeSkeleton';
import { VideoDialog } from '@/components/client/VideoDialog';
import OnRequestFormDrawer from '@/components/client/OnRequestFormDrawer';
import welcomeBgHotel from '@/assets/welcome-bg-couple.jpg';
import welcomeBgCoworking from '@/assets/background-coworking.jpg';
import oomLogo from '@/assets/oom-monogram-white-client.svg';
import { formatPrice } from '@/lib/formatPrice';
import { useVenueTerms, type VenueType } from '@/hooks/useVenueTerms';
import { useBasket } from './context/CartContext';
import { cn } from '@/lib/utils';
import { ShoppingBag, Minus, Plus, Sparkles, ChevronDown } from 'lucide-react';

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
  currency: string | null;
}

export default function Welcome() {
  const hotelId = window.location.pathname.split('/')[2];
  const navigate = useNavigate();
  const { t } = useTranslation('client');
  const [videoOpen, setVideoOpen] = useState(false);
  const { items, addItem, updateQuantity: updateBasketQuantity, itemCount } = useBasket();

  // On Request drawer state
  const [isOnRequestOpen, setIsOnRequestOpen] = useState(false);
  const [selectedOnRequestTreatment, setSelectedOnRequestTreatment] = useState<Treatment | null>(null);

  // Bounce animation state
  const [bounceKey, setBounceKey] = useState(0);

  const getItemQuantity = (id: string) => {
    const item = items.find(i => i.id === id);
    return item?.quantity || 0;
  };

  const { data: hotel, isLoading: isHotelLoading } = useQuery({
    queryKey: ['public-hotel', hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_public_hotel_by_id', { _hotel_id: hotelId });
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!hotelId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const { data: allTreatments = [], isLoading: isTreatmentsLoading } = useQuery({
    queryKey: ['public-treatments', hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_public_treatments', { _hotel_id: hotelId });
      if (error) throw error;
      return (data || []) as (Treatment & { service_for: string })[];
    },
    enabled: !!hotelId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Group treatments by gender
  const treatmentsByGender = useMemo(() => ({
    women: allTreatments.filter(t => t.service_for === 'Female' || t.service_for === 'All'),
    men: allTreatments.filter(t => t.service_for === 'Male' || t.service_for === 'All'),
  }), [allTreatments]);

  // Expanded gender section state - default to women
  const [expandedGender, setExpandedGender] = useState<'women' | 'men' | null>('women');

  const venueType = hotel?.venue_type as VenueType | null;
  const isEnterprise = venueType === 'enterprise';
  const venueTerms = useVenueTerms(venueType);
  const backgroundImage = useMemo(() => {
    if (isEnterprise && hotel?.cover_image) return hotel.cover_image;
    if (venueType === 'coworking') return welcomeBgCoworking;
    return welcomeBgHotel;
  }, [isEnterprise, venueType, hotel?.cover_image]);
  const { trackPageView, trackAction } = useClientAnalytics(hotelId);
  const hasTrackedPageView = useRef(false);

  // Track page view once
  useEffect(() => {
    if (!hasTrackedPageView.current && hotel?.name) {
      hasTrackedPageView.current = true;
      trackPageView('welcome', { hotelName: hotel.name });
    }
  }, [hotel?.name, trackPageView]);

  // Define category order priority
  const categoryOrder = ['Blowout', 'Brushing', 'Haircut', 'Hair cut', 'Coloration', 'Nail', 'Nails'];

  const getCategoriesFromTreatments = (treatments: Treatment[]) => {
    return [...new Set(treatments.map(t => t.category))].sort((a, b) => {
      const indexA = categoryOrder.findIndex(c => c.toLowerCase() === a.toLowerCase());
      const indexB = categoryOrder.findIndex(c => c.toLowerCase() === b.toLowerCase());
      const orderA = indexA === -1 ? 999 : indexA;
      const orderB = indexB === -1 ? 999 : indexB;
      return orderA - orderB;
    });
  };

  const categoriesByGender = useMemo(() => ({
    women: getCategoriesFromTreatments(treatmentsByGender.women),
    men: getCategoriesFromTreatments(treatmentsByGender.men),
  }), [treatmentsByGender]);

  const [activeCategoryByGender, setActiveCategoryByGender] = useState<{ women: string; men: string }>({
    women: '',
    men: '',
  });

  useEffect(() => {
    if (categoriesByGender.women.length > 0 && !activeCategoryByGender.women) {
      setActiveCategoryByGender(prev => ({ ...prev, women: categoriesByGender.women[0] }));
    }
    if (categoriesByGender.men.length > 0 && !activeCategoryByGender.men) {
      setActiveCategoryByGender(prev => ({ ...prev, men: categoriesByGender.men[0] }));
    }
  }, [categoriesByGender.women.length, categoriesByGender.men.length]);

  const handleAddToBasket = (treatment: Treatment) => {
    trackAction('add_to_cart', {
      treatmentId: treatment.id,
      treatmentName: treatment.name,
      price: treatment.price,
      category: treatment.category,
    });

    addItem({
      id: treatment.id,
      name: treatment.name,
      price: Number(treatment.price) || 0,
      currency: treatment.currency || 'EUR',
      duration: treatment.duration || 0,
      image: treatment.image || undefined,
      category: treatment.category,
      isPriceOnRequest: treatment.price_on_request || false,
    });

    if (navigator.vibrate) {
      navigator.vibrate(50);
    }

    setBounceKey(prev => prev + 1);
  };

  useEffect(() => {
    if (bounceKey > 0) {
      const timer = setTimeout(() => setBounceKey(0), 500);
      return () => clearTimeout(timer);
    }
  }, [bounceKey]);

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

  // Render a treatment card (shared between Women and Men sections)
  const renderTreatmentCard = (treatment: Treatment & { service_for?: string }) => (
    <div
      key={treatment.id}
      className="p-4 active:bg-white/5 transition-colors group cursor-pointer"
      onClick={() => handleAddToBasket(treatment)}
    >
      <div className="flex gap-4">
        <div className="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 rounded-sm overflow-hidden bg-white/5 ring-1 ring-white/10 group-active:ring-gold-400/50 transition-all">
          {treatment.image ? (
            <img
              src={getOptimizedImageUrl(treatment.image, 192) || ''}
              alt={treatment.name}
              loading="lazy"
              width={96}
              height={96}
              className="w-full h-full object-cover grayscale-[0.3] group-active:grayscale-0 transition-all duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/10">
              <ShoppingBag className="w-8 h-8" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
          <div>
            <h3 className="font-serif text-base sm:text-lg text-white font-medium leading-tight mb-1">
              {treatment.name}
            </h3>
            {treatment.description && (
              <p className="text-xs text-white/50 line-clamp-2 leading-relaxed font-light">
                {treatment.description}
              </p>
            )}
          </div>

          <div className="flex items-end justify-between mt-2">
            <div className="flex flex-col">
              {treatment.price_on_request ? (
                <Badge className="text-[10px] px-1.5 py-0.5 bg-white/10 text-gold-400 border-gold-400/20 font-medium w-fit">
                  {t('payment.onQuote')}
                </Badge>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-base sm:text-lg font-light text-gold-200">
                    {formatPrice(treatment.price, treatment.currency || 'EUR', { decimals: 0 })}
                  </span>
                  {treatment.duration && (
                    <span className="text-white/30 text-xs font-light tracking-wider uppercase">• {treatment.duration} min</span>
                  )}
                </div>
              )}
            </div>

            {/* Quantity Controls */}
            {getItemQuantity(treatment.id) > 0 ? (
              <div className="flex items-center gap-2 bg-white/10 rounded-none p-1 pl-2 border border-white/10">
                <span className="w-4 text-center font-medium text-sm text-gold-400">
                  {getItemQuantity(treatment.id)}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 sm:h-11 sm:w-11 rounded-none hover:bg-white/10 text-white/70 hover:text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateBasketQuantity(treatment.id, getItemQuantity(treatment.id) - 1);
                      if (navigator.vibrate) navigator.vibrate(30);
                    }}
                  >
                    <Minus className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 sm:h-11 sm:w-11 rounded-none bg-gold-400 text-black hover:bg-gold-300"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddToBasket(treatment);
                    }}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddToBasket(treatment);
                }}
                className="rounded-none px-4 h-10 sm:px-6 sm:h-9 text-[10px] uppercase tracking-[0.2em] bg-gold-400 text-black hover:bg-white transition-all duration-300 font-bold border-none"
              >
                {t('menu.add')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Render a gender section (Women or Men)
  const renderGenderSection = (
    gender: 'women' | 'men',
    label: string,
    treatments: (Treatment & { service_for?: string })[],
    categories: string[],
  ) => (
    <div className="border-b border-white/10">
      <button
        type="button"
        onClick={() => setExpandedGender(g => g === gender ? null : gender)}
        className="w-full flex items-center justify-between px-5 py-5 transition-all"
      >
        <div className="flex flex-col items-start gap-1">
          <span className="font-serif text-xl text-white tracking-wide">{label}</span>
          <span className="text-white/40 text-[11px] uppercase tracking-[0.15em]">{treatments.length} {t('menu.items')}</span>
        </div>
        <ChevronDown
          className={cn(
            "w-5 h-5 text-gold-400 transition-transform duration-200",
            expandedGender === gender && "rotate-180"
          )}
        />
      </button>

      {expandedGender === gender && (
        <div className="animate-fade-in">
          {/* Category Tabs */}
          {categories.length > 1 && (
            <div className="w-full overflow-x-auto scrollbar-hide bg-black/50 border-t border-white/5">
              <div className="flex px-2">
                {categories.map(category => (
                  <button
                    key={category}
                    onClick={() => setActiveCategoryByGender(prev => ({ ...prev, [gender]: category }))}
                    className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-all duration-300 ${
                      activeCategoryByGender[gender] === category
                        ? 'border-gold-400 text-gold-400 font-medium tracking-wide'
                        : 'border-transparent text-white/50 hover:text-white font-light'
                    }`}
                  >
                    {t(`menu.categories.${category}`, category)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Treatments List */}
          <div className="divide-y divide-white/5">
            {treatments
              .filter(treatment => treatment.category === activeCategoryByGender[gender])
              .map(treatment => renderTreatmentCard(treatment))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        'min-h-screen flex flex-col text-white',
        isEnterprise ? 'bg-[#1a1a1a]' : 'bg-black',
        itemCount > 0 ? 'pb-20' : ''
      )}
    >
      {/* Hero Section (compact) */}
      <div className="relative w-full overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0 z-0">
          <img
            src={backgroundImage}
            className={cn(
              "h-full w-full object-cover scale-105 animate-[pulse_10s_infinite_alternate]",
              isEnterprise ? "brightness-[0.6]" : "brightness-[0.5]"
            )}
            alt="Ambiance"
          />
          <div className={cn(
            "absolute inset-0 bg-gradient-to-t",
            isEnterprise
              ? "from-[#1a1a1a] via-black/10 to-black/30"
              : "from-black via-black/20 to-black/40"
          )} />
        </div>

        {/* Language Switcher */}
        <div className="absolute top-4 right-4 z-20">
          <LanguageSwitcher variant="client" />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 w-full max-w-[92vw] sm:max-w-md md:max-w-xl lg:max-w-2xl mx-auto pt-12 sm:pt-16 pb-8 sm:pb-10">
          <div className="px-4 sm:px-6 animate-fade-in">
            <a href="https://oomworld.com" target="_blank" rel="noopener noreferrer">
              <img
                src={oomLogo}
                alt="OOM"
                className={cn(
                  "mb-4 sm:mb-6",
                  isEnterprise && hotel?.image
                    ? "h-6 w-6 sm:h-7 sm:w-7 opacity-60"
                    : "h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14"
                )}
              />
            </a>
            {isEnterprise && hotel?.image && (
              <img
                src={hotel.image}
                alt={hotel.name}
                className="h-14 w-auto sm:h-16 md:h-20 mb-4 sm:mb-6 object-contain"
              />
            )}
            <h3 className="text-[10px] uppercase tracking-[0.3em] text-gold-400 mb-4 font-semibold">
              {venueTerms.exclusiveServiceLabel}
            </h3>
            <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl lg:text-5xl leading-tight mb-4 text-white">
              {isEnterprise ? (
                <>
                  <span className="italic text-gold-200">{hotel?.name}</span>
                  <br />
                  {t('welcome.enterpriseWellnessTitle')}
                </>
              ) : (
                <>
                  {t('welcome.artOfHairdressing')} <br/>
                  <span className="italic text-gold-200">{t('welcome.at')} {hotel?.name}</span>
                </>
              )}
            </h1>
            <p className="text-gray-300 text-xs sm:text-sm font-light leading-relaxed w-full max-w-[280px] sm:max-w-sm">
              {isEnterprise && (hotel as any)?.description
                ? (hotel as any).description
                : venueTerms.serviceDescription}
            </p>
          </div>

        </div>
      </div>

      {/* Reassurance Banner */}
      {!isEnterprise && (
        <div className="px-4 py-3 bg-white/5 flex items-center justify-center gap-2 border-b border-white/5">
          <Sparkles className="w-3 h-3 text-gold-400" />
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/60 font-medium text-center">
            {venueTerms.disclaimer}
          </p>
        </div>
      )}

      {/* Treatments - Gender Sections */}
      <div className="flex-1 w-full max-w-2xl mx-auto">
        {renderGenderSection('women', t('welcome.womensMenu'), treatmentsByGender.women, categoriesByGender.women)}
        {renderGenderSection('men', t('welcome.mensMenu'), treatmentsByGender.men, categoriesByGender.men)}
      </div>

      {/* How it works + Equipment */}
      <div className="py-6 flex items-center justify-center gap-4">
        <Button
          variant="ghost"
          onClick={() => setVideoOpen(true)}
          className="text-white/50 hover:text-white hover:bg-white/5 text-[10px] uppercase tracking-widest font-light h-auto py-2 px-0"
        >
          {t('welcome.howItWorks')}
        </Button>
        <span className="text-white/20">|</span>
        <p className="text-[9px] text-white/30 uppercase tracking-widest leading-relaxed">
          {t('welcome.equipmentIncluded')}
        </p>
      </div>

      {/* Fixed Bottom Button */}
      {itemCount > 0 && (
        <div className={cn(
          "fixed bottom-4 left-0 right-0 px-4 pb-safe z-30",
          isEnterprise
            ? "bg-gradient-to-t from-[#1a1a1a] via-[#1a1a1a] to-transparent"
            : "bg-gradient-to-t from-black via-black to-transparent"
        )}>
          <Button
            onClick={() => navigate(`/client/${hotelId}/schedule`)}
            className="w-full h-12 sm:h-14 md:h-16 text-base rounded-none bg-white text-black hover:bg-gold-100 font-medium tracking-wide shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all duration-300"
          >
            <ShoppingBag className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
            {t('menu.bookTreatment')} ({itemCount} {itemCount === 1 ? t('menu.item') : t('menu.items')})
          </Button>
        </div>
      )}

      {/* Video Dialog */}
      <VideoDialog
        open={videoOpen}
        onOpenChange={setVideoOpen}
        videoId={venueType === 'coworking' ? 'u8HxuKPgtco' : 'Lw0gv5VjqY8'}
        hotelId={hotelId!}
      />

      {/* On Request Form Drawer */}
      <OnRequestFormDrawer
        open={isOnRequestOpen}
        onOpenChange={setIsOnRequestOpen}
        treatment={selectedOnRequestTreatment}
        hotelId={hotelId || ''}
        hotelName={hotel?.name}
      />
    </div>
  );
}
