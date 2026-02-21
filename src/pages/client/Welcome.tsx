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
import { brand, brandLogos } from '@/config/brand';
import { formatPrice } from '@/lib/formatPrice';
import { useVenueTerms, type VenueType } from '@/hooks/useVenueTerms';
import { useBasket } from './context/CartContext';
import { cn } from '@/lib/utils';
import { ShoppingBag, Minus, Plus, Sparkles, ChevronDown, CalendarDays } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';

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
  const { t, i18n } = useTranslation('client');
  const dateLocale = i18n.language === 'fr' ? fr : enUS;
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

  // Expanded gender section state - default to closed
  const [expandedGender, setExpandedGender] = useState<'women' | 'men' | null>(null);

  const venueType = hotel?.venue_type as VenueType | null;
  const isHotel = venueType === 'hotel' || (!venueType && !hotel?.venue_type);
  const isEnterprise = venueType === 'enterprise';
  const venueTerms = useVenueTerms(venueType);
  const isCompanyOffered = !!hotel?.company_offered;


  // Fetch next available date for enterprise venues
  const { data: nextServiceDate } = useQuery({
    queryKey: ['enterprise-next-date', hotelId],
    queryFn: async () => {
      const today = new Date();
      const endDate = addDays(today, 90);
      const { data, error } = await supabase.rpc('get_venue_available_dates', {
        _hotel_id: hotelId,
        _start_date: format(today, 'yyyy-MM-dd'),
        _end_date: format(endDate, 'yyyy-MM-dd'),
      });
      if (error) throw error;
      const dates = data || [];
      return dates.length > 0 ? dates[0] : null;
    },
    enabled: !!hotelId && isEnterprise,
    staleTime: 10 * 60 * 1000,
  });

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
      <div className="min-h-screen flex items-center justify-center bg-white p-4 text-gray-900">
        <div className="text-center">
          <h1 className="text-2xl font-serif mb-2">{t('hotelNotFound')}</h1>
          <p className="text-gray-500">{t('checkQrCode')}</p>
        </div>
      </div>
    );
  }

  // Hotel venues: full-screen landing page
  if (isHotel) {
    const hotelBg = hotel.cover_image || welcomeBgHotel;
    const subtitle = (hotel as any)?.landing_subtitle || 'Beauty Services';

    return (
      <div className="h-dvh w-full relative overflow-hidden">
        {/* Background Image — cinematic zoom-out */}
        <div className="absolute inset-0">
          <img
            src={hotelBg}
            className="h-full w-full object-cover object-[center_20%] brightness-[0.4] animate-hero-zoom"
            alt="Ambiance"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/40" />
        </div>

        {/* Top Bar */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 pt-safe pb-4 mt-4">
          <a href={brand.website} target="_blank" rel="noopener noreferrer">
            <img
              src={brandLogos.monogramWhiteClient}
              alt={brand.name}
              className="h-10 w-10 sm:h-12 sm:w-12"
            />
          </a>
          <LanguageSwitcher variant="client" />
        </div>

        {/* Content — cinematic sequential reveal */}
        <div className="absolute inset-0 z-10 flex flex-col items-center px-8 sm:px-12">
          {/* Spacer top */}
          <div className="flex-1" />

          {/* Venue Name + Subtitle — centered vertically & horizontally */}
          <div className="text-center">
            <h1
              className="font-grotesk font-light text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-[0.95] text-white uppercase tracking-wide animate-reveal-text"
              style={{ animationDelay: '0.5s' }}
            >
              {hotel.name}
            </h1>
            <div
              className="w-12 h-px bg-white/40 mx-auto mt-4 mb-3 animate-expand-line"
              style={{ animationDelay: '1s' }}
            />
            <p
              className="font-grotesk font-light italic text-2xl sm:text-3xl md:text-4xl text-white uppercase tracking-wide animate-slide-up-fade"
              style={{ animationDelay: '1.3s' }}
            >
              {subtitle}
            </p>
          </div>

          {/* Spacer bottom */}
          <div className="flex-1" />

          {/* CTA Button — bas de page avec espace */}
          <div
            className="w-full pb-safe mb-10 animate-slide-up-fade"
            style={{ animationDelay: '1.8s' }}
          >
            <Button
              onClick={() => navigate(`/client/${hotelId}/treatments`)}
              className="w-full h-14 sm:h-16 text-base sm:text-lg font-grotesk font-medium tracking-widest uppercase bg-white text-black hover:bg-gray-100 transition-all duration-300 shadow-lg"
            >
              {t('welcome.booking')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Render a treatment card (shared between Women and Men sections)
  const renderTreatmentCard = (treatment: Treatment & { service_for?: string }) => (
    <div
      key={treatment.id}
      className={cn(
        "p-4 transition-colors group cursor-pointer",
        "active:bg-black/5"
      )}
      onClick={() => handleAddToBasket(treatment)}
    >
      <div className="flex gap-3">
        <div className={cn(
          "w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 rounded-sm overflow-hidden ring-1 group-active:ring-gold-400/50 transition-all",
          "bg-gray-100 ring-gray-200"
        )}>
          {treatment.image ? (
            <img
              src={getOptimizedImageUrl(treatment.image, 128) || ''}
              alt={treatment.name}
              loading="lazy"
              width={64}
              height={64}
              className="w-full h-full object-cover grayscale-[0.3] group-active:grayscale-0 transition-all duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-200">
              <ShoppingBag className="w-8 h-8" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-serif text-sm sm:text-base font-medium leading-tight text-gray-900">
              {treatment.name}
            </h3>
            {treatment.description && (
              <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed font-light mt-0.5">
                {treatment.description}
              </p>
            )}
            {isCompanyOffered ? (
              treatment.duration ? (
                <span className="text-[11px] font-light text-gray-400 mt-0.5">
                  {treatment.duration} min
                </span>
              ) : null
            ) : (
              <div className="flex items-baseline gap-2 mt-0.5">
                {treatment.price_on_request ? (
                  <Badge className="text-[10px] px-1.5 py-0.5 font-medium w-fit bg-gray-100 text-gold-600 border-gold-300/30">
                    {t('payment.onQuote')}
                  </Badge>
                ) : (
                  <>
                    <span className="text-sm font-light text-gray-700">
                      {formatPrice(treatment.price, treatment.currency || 'EUR', { decimals: 0 })}
                    </span>
                    {treatment.duration && (
                      <span className="text-[11px] font-light text-gray-400">
                        • {treatment.duration} min
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Quantity Controls */}
          {getItemQuantity(treatment.id) > 0 ? (
            <div className="flex items-center gap-2 rounded-md p-1 pl-2 border flex-shrink-0 bg-gray-100 border-gray-200">
              <span className="w-4 text-center font-medium text-sm text-gold-400">
                {getItemQuantity(treatment.id)}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 sm:h-11 sm:w-11 hover:bg-gray-200 text-gray-500 hover:text-gray-700"
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
                  className="h-10 w-10 sm:h-11 sm:w-11 bg-gold-400 text-black hover:bg-gold-300"
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
              className="px-4 h-10 sm:px-6 sm:h-9 text-[10px] uppercase tracking-[0.2em] bg-gold-400 text-black hover:bg-gold-300 transition-all duration-300 font-bold border-none flex-shrink-0"
            >
              {t('menu.add')}
            </Button>
          )}
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
    reveal?: { ref: React.RefObject<HTMLDivElement>; isVisible: boolean },
  ) => (
    <div
      ref={reveal?.ref}
      className={cn(
        "border-b border-gray-200",
        reveal && "scroll-reveal",
        reveal?.isVisible && "visible"
      )}>
      <button
        type="button"
        onClick={() => setExpandedGender(g => g === gender ? null : gender)}
        className="w-full flex items-center justify-between px-5 py-5 transition-all"
      >
        <div className="flex flex-col items-start gap-1">
          <span className="font-serif text-xl tracking-wide text-gray-900">{label}</span>
          <span className="text-[11px] uppercase tracking-[0.15em] text-gray-400">{treatments.length} {treatments.length === 1 ? t('menu.item') : t('menu.items')}</span>
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
            <div className="w-full overflow-x-auto scrollbar-hide border-t bg-gray-50 border-gray-100">
              <div className="flex px-2">
                {categories.map(category => (
                  <button
                    key={category}
                    onClick={() => setActiveCategoryByGender(prev => ({ ...prev, [gender]: category }))}
                    className={cn(
                      "px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-all duration-300",
                      activeCategoryByGender[gender] === category
                        ? 'border-gold-400 text-gold-400 font-medium tracking-wide'
                        : 'border-transparent text-gray-400 hover:text-gray-700 font-light'
                    )}
                  >
                    {t(`menu.categories.${category}`, category)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Treatments List */}
          <div className="divide-y divide-gray-100">
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
        'min-h-screen flex flex-col bg-white text-gray-900',
        itemCount > 0 ? 'pb-20' : ''
      )}
    >
      {/* Hero Section (compact) */}
      <div className="relative w-full overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0 z-0">
          <img
            src={backgroundImage}
            className="h-full w-full object-cover scale-105 brightness-[0.5]"
            alt="Ambiance"
          />
          <div className="absolute inset-0 bg-black/50" />
        </div>

        {/* Language Switcher */}
        <div className="absolute top-4 right-4 z-20">
          <LanguageSwitcher variant="client" />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 w-full max-w-[92vw] sm:max-w-md md:max-w-xl lg:max-w-2xl mx-auto pt-12 sm:pt-16 pb-8 sm:pb-10">
          <div className="px-4 sm:px-6 animate-fade-in">
            {isEnterprise && hotel?.image ? (
              <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                <a href={brand.website} target="_blank" rel="noopener noreferrer">
                  <img
                    src={brandLogos.monogramWhiteClient}
                    alt={brand.name}
                    className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12"
                  />
                </a>
                <span className="text-gold-400/60 text-lg sm:text-xl font-light select-none">×</span>
                <img
                  src={hotel.image}
                  alt={hotel.name}
                  className="h-10 w-auto sm:h-12 md:h-14 object-contain"
                />
              </div>
            ) : (
              <a href={brand.website} target="_blank" rel="noopener noreferrer">
                <img
                  src={brandLogos.monogramWhiteClient}
                  alt={brand.name}
                  className="h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 mb-4 sm:mb-6"
                />
              </a>
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
            {isEnterprise && nextServiceDate && (
              <div className="mt-4 sm:mt-5 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/10">
                <CalendarDays className="w-3.5 h-3.5 text-gold-400" />
                <span className="text-xs text-white/80 font-medium">
                  {t('welcome.nextSession')}{' '}
                  <span className="text-gold-300">
                    {format(new Date(nextServiceDate + 'T00:00:00'), 'EEEE d MMMM', { locale: dateLocale })}
                  </span>
                </span>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Reassurance Banner — commented out: not always accurate (spa rooms vs in-room) */}
      {/* {!isEnterprise && (
        <div className="px-4 py-3 bg-gray-50 flex items-center justify-center gap-2 border-b border-gray-100">
          <Sparkles className="w-3 h-3 text-gold-400" />
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-medium text-center">
            {venueTerms.disclaimer}
          </p>
        </div>
      )} */}

      {/* Treatments - Gender Sections */}
      <div className="flex-1 w-full max-w-2xl mx-auto">
        {renderGenderSection('women', t('welcome.womensMenu'), treatmentsByGender.women, categoriesByGender.women)}
        {renderGenderSection('men', t('welcome.mensMenu'), treatmentsByGender.men, categoriesByGender.men)}

        {/* How it works + Equipment */}
        <div className="py-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Button
          variant="ghost"
          onClick={() => setVideoOpen(true)}
          className="text-[10px] uppercase tracking-widest font-light h-auto py-2 px-0 text-gray-400 hover:text-gray-700 hover:bg-gray-50"
        >
          {t('welcome.howItWorks')}
        </Button>
        <span className="text-gray-200">|</span>
        <p className="text-[9px] uppercase tracking-widest leading-relaxed text-gray-300">
          {t('welcome.equipmentIncluded')}
        </p>
        </div>
      </div>

      {/* Fixed Bottom Button */}
      {itemCount > 0 && (
        <div className="fixed bottom-4 left-0 right-0 px-4 pb-safe z-30 bg-gradient-to-t from-white via-white to-transparent">
          <Button
            onClick={() => navigate(`/client/${hotelId}/schedule`)}
            className="w-full h-12 sm:h-14 md:h-16 text-base font-medium tracking-wide transition-all duration-300 bg-gray-900 text-white hover:bg-gray-800 shadow-lg"
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
