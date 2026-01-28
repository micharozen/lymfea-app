import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ShoppingBag, Minus, Plus, Sparkles, ChevronDown } from 'lucide-react';
import { useBasket } from './context/CartContext';
import { useState, useEffect, useMemo, useRef } from 'react';
import OnRequestFormDrawer from '@/components/client/OnRequestFormDrawer';
import { TreatmentsSkeleton } from '@/components/client/skeletons/TreatmentsSkeleton';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatPrice';
import { useVenueTerms, type VenueType } from '@/hooks/useVenueTerms';
import { useClientAnalytics } from '@/hooks/useClientAnalytics';

// Optimize Supabase image URLs for thumbnails
const getOptimizedImageUrl = (url: string | null, width: number, quality = 75): string | null => {
  if (!url || !url.includes('supabase.co/storage')) return url;
  // Supabase image transformation API
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

export default function Treatments() {
  // Extract hotelId from URL directly (useParams doesn't work in nested Routes)
  const hotelId = window.location.pathname.split('/')[2];
  const navigate = useNavigate();
  const { items, addItem, updateQuantity: updateBasketQuantity, itemCount } = useBasket();
  const [bounceKey, setBounceKey] = useState(0);
  const { t } = useTranslation('client');
  
  // On Request drawer state
  const [isOnRequestOpen, setIsOnRequestOpen] = useState(false);
  const [selectedOnRequestTreatment, setSelectedOnRequestTreatment] = useState<Treatment | null>(null);

  const getItemQuantity = (id: string) => {
    const item = items.find(i => i.id === id);
    return item?.quantity || 0;
  };

  const { data: hotel, isLoading: isHotelLoading } = useQuery({
    queryKey: ['public-hotel', hotelId],
    queryFn: async () => {
      // Use secure function that doesn't expose commission rates
      const { data, error } = await supabase
        .rpc('get_public_hotel_by_id', { _hotel_id: hotelId });
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!hotelId,
    staleTime: 10 * 60 * 1000, // 10 minutes - hotel info rarely changes
    gcTime: 30 * 60 * 1000,    // 30 minutes cache
  });

  const { data: allTreatments = [], isLoading: isTreatmentsLoading } = useQuery({
    queryKey: ['public-treatments', hotelId],
    queryFn: async () => {
      // Use secure function for public treatment data - returns all treatments
      const { data, error } = await supabase
        .rpc('get_public_treatments', { _hotel_id: hotelId });

      if (error) throw error;
      return (data || []) as (Treatment & { service_for: string })[];
    },
    enabled: !!hotelId,
    staleTime: 5 * 60 * 1000, // 5 minutes - treatments change occasionally
    gcTime: 15 * 60 * 1000,   // 15 minutes cache
  });

  // Group treatments by gender
  const treatmentsByGender = useMemo(() => {
    return {
      women: allTreatments.filter(t => t.service_for === 'Female' || t.service_for === 'All'),
      men: allTreatments.filter(t => t.service_for === 'Male' || t.service_for === 'All'),
    };
  }, [allTreatments]);

  // Expanded gender section state - default to women
  const [expandedGender, setExpandedGender] = useState<'women' | 'men' | null>('women');

  // venue_type is now included in the RPC response (get_public_hotel_by_id)
  // No need for a separate query that could fail due to RLS policies
  const venueType = hotel?.venue_type as VenueType | null;
  const venueTerms = useVenueTerms(venueType);
  const { trackPageView, trackAction } = useClientAnalytics(hotelId);
  const hasTrackedPageView = useRef(false);

  // Track page view once
  useEffect(() => {
    if (!hasTrackedPageView.current) {
      hasTrackedPageView.current = true;
      trackPageView('treatments');
    }
  }, [trackPageView]);

  // Define category order priority
  const categoryOrder = ['Blowout', 'Brushing', 'Haircut', 'Hair cut', 'Coloration', 'Nail', 'Nails'];

  // Helper function to get sorted categories from treatments
  const getCategoriesFromTreatments = (treatments: Treatment[]) => {
    return [...new Set(treatments.map(t => t.category))].sort((a, b) => {
      const indexA = categoryOrder.findIndex(c => c.toLowerCase() === a.toLowerCase());
      const indexB = categoryOrder.findIndex(c => c.toLowerCase() === b.toLowerCase());
      const orderA = indexA === -1 ? 999 : indexA;
      const orderB = indexB === -1 ? 999 : indexB;
      return orderA - orderB;
    });
  };

  // Get categories for each gender
  const categoriesByGender = useMemo(() => ({
    women: getCategoriesFromTreatments(treatmentsByGender.women),
    men: getCategoriesFromTreatments(treatmentsByGender.men),
  }), [treatmentsByGender]);

  // Active category per gender section
  const [activeCategoryByGender, setActiveCategoryByGender] = useState<{ women: string; men: string }>({
    women: '',
    men: '',
  });

  // Set initial active categories when data loads
  useEffect(() => {
    if (categoriesByGender.women.length > 0 && !activeCategoryByGender.women) {
      setActiveCategoryByGender(prev => ({ ...prev, women: categoriesByGender.women[0] }));
    }
    if (categoriesByGender.men.length > 0 && !activeCategoryByGender.men) {
      setActiveCategoryByGender(prev => ({ ...prev, men: categoriesByGender.men[0] }));
    }
  }, [categoriesByGender.women.length, categoriesByGender.men.length]);

  const handleAddToBasket = (treatment: Treatment) => {
    // Track add to cart action
    trackAction('add_to_cart', {
      treatmentId: treatment.id,
      treatmentName: treatment.name,
      price: treatment.price,
      category: treatment.category,
    });

    // Add to basket - including price_on_request items for mixed cart logic
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

  const handleOnRequestClick = (treatment: Treatment) => {
    setSelectedOnRequestTreatment(treatment);
    setIsOnRequestOpen(true);
  };

  useEffect(() => {
    if (bounceKey > 0) {
      const timer = setTimeout(() => setBounceKey(0), 500);
      return () => clearTimeout(timer);
    }
  }, [bounceKey]);

  const isLoading = isHotelLoading || isTreatmentsLoading;

  if (isLoading) {
    return <TreatmentsSkeleton />;
  }

  return (
    <div
      className={cn(
        'min-h-screen bg-black flex flex-col text-white',
        // Add padding for bottom button when items selected
        itemCount > 0 ? 'pb-20' : ''
      )}
    >
      {/* Header Sticky */}
      <div className="sticky top-0 z-20 bg-black/80 backdrop-blur-md border-b border-white/10">
        <div className="relative h-20 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-between px-4 pt-safe">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/client/${hotelId}`)}
              className="text-white hover:bg-white/10 hover:text-gold-400 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <h1 className="font-serif text-lg md:text-xl text-gold-200 tracking-wide text-center flex-1 px-2 leading-tight">
              {hotel?.name}
            </h1>

            {/* Spacer to balance header */}
            <div className="w-10" />
          </div>
        </div>
      </div>

      {/* Reassurance Banner */}
      <div className="px-4 py-3 bg-white/5 flex items-center justify-center gap-2 border-b border-white/5">
          <Sparkles className="w-3 h-3 text-gold-400" />
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/60 font-medium text-center">
            {venueTerms.disclaimer}
          </p>
      </div>

      {/* Gender Sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Women Section */}
        <div className="border-b border-white/10">
          <button
            type="button"
            onClick={() => setExpandedGender(g => g === 'women' ? null : 'women')}
            className="w-full flex items-center justify-between px-5 py-5 transition-all"
          >
            <div className="flex flex-col items-start gap-1">
              <span className="font-serif text-xl text-white tracking-wide">{t('welcome.womensMenu')}</span>
              <span className="text-white/40 text-[11px] uppercase tracking-[0.15em]">{treatmentsByGender.women.length} {t('menu.items')}</span>
            </div>
            <ChevronDown
              className={cn(
                "w-5 h-5 text-gold-400 transition-transform duration-200",
                expandedGender === 'women' && "rotate-180"
              )}
            />
          </button>

          {expandedGender === 'women' && (
            <div className="animate-fade-in">
              {/* Categories Tabs for Women */}
              {categoriesByGender.women.length > 1 && (
                <div className="w-full overflow-x-auto scrollbar-hide bg-black/50 border-t border-white/5">
                  <div className="flex px-2">
                    {categoriesByGender.women.map(category => (
                      <button
                        key={category}
                        onClick={() => setActiveCategoryByGender(prev => ({ ...prev, women: category }))}
                        className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-all duration-300 ${
                          activeCategoryByGender.women === category
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

              {/* Women Treatments List */}
              <div className="divide-y divide-white/5">
                {treatmentsByGender.women
                  .filter(treatment => treatment.category === activeCategoryByGender.women)
                  .map(treatment => (
                    <div
                      key={treatment.id}
                      className="p-4 active:bg-white/5 transition-colors group cursor-pointer"
                      onClick={() => handleAddToBasket(treatment)}
                    >
                      <div className="flex gap-4">
                        <div className="w-24 h-24 flex-shrink-0 rounded-sm overflow-hidden bg-white/5 ring-1 ring-white/10 group-active:ring-gold-400/50 transition-all">
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
                            <h3 className="font-serif text-lg text-white font-medium leading-tight mb-1">
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
                                        <span className="text-lg font-light text-gold-200">
                                            {formatPrice(treatment.price, treatment.currency || 'EUR', { decimals: 0 })}
                                        </span>
                                        {treatment.duration && (
                                            <span className="text-white/30 text-xs font-light tracking-wider uppercase">• {treatment.duration} min</span>
                                        )}
                                    </div>
                                )}
                             </div>

                            {/* Controls */}
                            {getItemQuantity(treatment.id) > 0 ? (
                                <div className="flex items-center gap-2 bg-white/10 rounded-none p-1 pl-2 border border-white/10">
                                    <span className="w-4 text-center font-medium text-sm text-gold-400">
                                        {getItemQuantity(treatment.id)}
                                    </span>
                                    <div className="flex gap-1">
                                        <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-none hover:bg-white/10 text-white/70 hover:text-white"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            updateBasketQuantity(treatment.id, getItemQuantity(treatment.id) - 1);
                                            if (navigator.vibrate) navigator.vibrate(30);
                                        }}
                                        >
                                        <Minus className="h-4 w-4" />
                                        </Button>
                                        <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-none bg-gold-400 text-black hover:bg-gold-300"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleAddToBasket(treatment);
                                        }}
                                        >
                                        <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <Button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAddToBasket(treatment);
                                    }}
                                    className="rounded-none px-6 h-9 text-[10px] uppercase tracking-[0.2em] bg-gold-400 text-black hover:bg-white transition-all duration-300 font-bold border-none"
                                >
                                    {t('menu.add')}
                                </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Men Section */}
        <div className="border-b border-white/10">
          <button
            type="button"
            onClick={() => setExpandedGender(g => g === 'men' ? null : 'men')}
            className="w-full flex items-center justify-between px-5 py-5 transition-all"
          >
            <div className="flex flex-col items-start gap-1">
              <span className="font-serif text-xl text-white tracking-wide">{t('welcome.mensMenu')}</span>
              <span className="text-white/40 text-[11px] uppercase tracking-[0.15em]">{treatmentsByGender.men.length} {t('menu.items')}</span>
            </div>
            <ChevronDown
              className={cn(
                "w-5 h-5 text-gold-400 transition-transform duration-200",
                expandedGender === 'men' && "rotate-180"
              )}
            />
          </button>

          {expandedGender === 'men' && (
            <div className="animate-fade-in">
              {/* Categories Tabs for Men */}
              {categoriesByGender.men.length > 1 && (
                <div className="w-full overflow-x-auto scrollbar-hide bg-black/50 border-t border-white/5">
                  <div className="flex px-2">
                    {categoriesByGender.men.map(category => (
                      <button
                        key={category}
                        onClick={() => setActiveCategoryByGender(prev => ({ ...prev, men: category }))}
                        className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-all duration-300 ${
                          activeCategoryByGender.men === category
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

              {/* Men Treatments List */}
              <div className="divide-y divide-white/5">
                {treatmentsByGender.men
                  .filter(treatment => treatment.category === activeCategoryByGender.men)
                  .map(treatment => (
                    <div
                      key={treatment.id}
                      className="p-4 active:bg-white/5 transition-colors group cursor-pointer"
                      onClick={() => handleAddToBasket(treatment)}
                    >
                      <div className="flex gap-4">
                        <div className="w-24 h-24 flex-shrink-0 rounded-sm overflow-hidden bg-white/5 ring-1 ring-white/10 group-active:ring-gold-400/50 transition-all">
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
                            <h3 className="font-serif text-lg text-white font-medium leading-tight mb-1">
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
                                        <span className="text-lg font-light text-gold-200">
                                            {formatPrice(treatment.price, treatment.currency || 'EUR', { decimals: 0 })}
                                        </span>
                                        {treatment.duration && (
                                            <span className="text-white/30 text-xs font-light tracking-wider uppercase">• {treatment.duration} min</span>
                                        )}
                                    </div>
                                )}
                             </div>

                            {/* Controls */}
                            {getItemQuantity(treatment.id) > 0 ? (
                                <div className="flex items-center gap-2 bg-white/10 rounded-none p-1 pl-2 border border-white/10">
                                    <span className="w-4 text-center font-medium text-sm text-gold-400">
                                        {getItemQuantity(treatment.id)}
                                    </span>
                                    <div className="flex gap-1">
                                        <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-none hover:bg-white/10 text-white/70 hover:text-white"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            updateBasketQuantity(treatment.id, getItemQuantity(treatment.id) - 1);
                                            if (navigator.vibrate) navigator.vibrate(30);
                                        }}
                                        >
                                        <Minus className="h-4 w-4" />
                                        </Button>
                                        <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-none bg-gold-400 text-black hover:bg-gold-300"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleAddToBasket(treatment);
                                        }}
                                        >
                                        <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <Button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAddToBasket(treatment);
                                    }}
                                    className="rounded-none px-6 h-9 text-[10px] uppercase tracking-[0.2em] bg-gold-400 text-black hover:bg-white transition-all duration-300 font-bold border-none"
                                >
                                    {t('menu.add')}
                                </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fixed Bottom Button - Direct to datetime (basket page skipped) */}
      {itemCount > 0 && (
        <div className="fixed bottom-4 left-0 right-0 px-4 bg-gradient-to-t from-black via-black to-transparent pb-safe z-30">
          <Button
            onClick={() => navigate(`/client/${hotelId}/schedule`)}
            className="w-full h-14 text-base rounded-none bg-white text-black hover:bg-gold-100 font-medium tracking-wide shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all duration-300"
          >
            <ShoppingBag className="mr-2 h-5 w-5" />
            {t('menu.bookTreatment')} ({itemCount} {itemCount === 1 ? t('menu.item') : t('menu.items')})
          </Button>
        </div>
      )}

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
