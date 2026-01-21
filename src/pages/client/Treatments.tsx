import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ShoppingBag, Minus, Plus, Sparkles } from 'lucide-react';
import { useBasket } from './context/CartContext';
import { useState, useEffect } from 'react';
import OnRequestFormDrawer from '@/components/client/OnRequestFormDrawer';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatPrice';
import { useVenueTerms, type VenueType } from '@/hooks/useVenueTerms';

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

export default function Treatments() {
  // Extract hotelId from URL directly (useParams doesn't work in nested Routes)
  const hotelId = window.location.pathname.split('/')[2];
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const gender = searchParams.get('gender') || 'women';
  const { items, addItem, updateQuantity: updateBasketQuantity, itemCount } = useBasket();
  const [bounceKey, setBounceKey] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string>('');
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
  });

  const { data: treatments = [], isLoading: isTreatmentsLoading } = useQuery({
    queryKey: ['public-treatments', hotelId, gender],
    queryFn: async () => {
      const serviceFor = gender === 'women' ? 'Female' : gender === 'men' ? 'Male' : 'All';
      // Use secure function for public treatment data
      const { data, error } = await supabase
        .rpc('get_public_treatments', { _hotel_id: hotelId });

      if (error) throw error;

      // Filter by service_for client-side since the function returns all treatments for the hotel
      const filtered = (data || []).filter((t: any) =>
        t.service_for === serviceFor || t.service_for === 'All'
      );

      return filtered as Treatment[];
    },
    enabled: !!hotelId,
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
  });

  const venueTerms = useVenueTerms(venueType);

  // Define category order priority
  const categoryOrder = ['Blowout', 'Brushing', 'Haircut', 'Hair cut', 'Coloration', 'Nail', 'Nails'];
  
  const categories = [...new Set(treatments.map(t => t.category))].sort((a, b) => {
    const indexA = categoryOrder.findIndex(c => c.toLowerCase() === a.toLowerCase());
    const indexB = categoryOrder.findIndex(c => c.toLowerCase() === b.toLowerCase());
    // If not in order list, put at the end
    const orderA = indexA === -1 ? 999 : indexA;
    const orderB = indexB === -1 ? 999 : indexB;
    return orderA - orderB;
  });

  // Set initial active category when categories are loaded
  useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0]);
    }
  }, [categories.length, activeCategory]);

  const handleAddToBasket = (treatment: Treatment) => {
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="w-16 h-16 border-4 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'min-h-screen bg-black flex flex-col text-white',
        // Add padding for bottom button when items selected
        itemCount > 0 ? 'pb-20' : ''
      )}
    >
      {/* Header + Tabs Sticky */}
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

            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(`/client/${hotelId}/basket`)}
                className="text-white hover:bg-white/10 hover:text-gold-400 transition-colors relative"
              >
                <ShoppingBag className="h-5 w-5" />
                {itemCount > 0 && (
                  <Badge 
                    key={bounceKey}
                    className={`absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-gold-400 text-black font-bold text-xs border-none ${
                      bounceKey > 0 ? 'animate-[bounce_0.5s_ease-in-out]' : ''
                    }`}
                  >
                    {itemCount}
                  </Badge>
              )}
            </Button>
          </div>
          </div>
        </div>

        {/* Categories Tabs - Only show if more than 1 category */}
        {categories.length > 1 && (
          <div className="w-full overflow-x-auto scrollbar-hide bg-black/50 border-t border-white/5">
            <div className="flex px-2">
              {categories.map(category => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-all duration-300 ${
                    activeCategory === category 
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
      </div>

      {/* Reassurance Banner */}
      <div className="px-4 py-3 bg-white/5 flex items-center justify-center gap-2 border-b border-white/5">
          <Sparkles className="w-3 h-3 text-gold-400" />
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/60 font-medium text-center">
            {venueTerms.disclaimer}
          </p>
      </div>

      {/* Content - Filtered by active category */}
      <div className="flex-1 divide-y divide-white/5 overflow-y-auto">
        {treatments
          .filter(treatment => treatment.category === activeCategory)
          .map(treatment => (
            <div key={treatment.id} className="p-4 active:bg-white/5 transition-colors group">
              <div className="flex gap-4">
                <div className="w-24 h-24 flex-shrink-0 rounded-sm overflow-hidden bg-white/5 ring-1 ring-white/10 group-active:ring-gold-400/50 transition-all">
                    {treatment.image ? (
                        <img
                            src={treatment.image}
                            alt={treatment.name}
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

                    {/* Controls - Enhanced visibility */}
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
                            onClick={() => handleAddToBasket(treatment)}
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
