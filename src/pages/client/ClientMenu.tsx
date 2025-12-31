import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowLeft, ShoppingBag, Minus, Plus, MessageSquare } from 'lucide-react';
import { useBasket } from './context/BasketContext';
import { useState, useEffect } from 'react';
import OnRequestFormDrawer from '@/components/client/OnRequestFormDrawer';

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

export default function ClientMenu() {
  const { hotelId } = useParams<{ hotelId: string }>();
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

  const { data: hotel } = useQuery({
    queryKey: ['public-hotel', hotelId],
    queryFn: async () => {
      // Use secure function that doesn't expose commission rates
      const { data, error } = await supabase
        .rpc('get_public_hotel_by_id', { _hotel_id: hotelId });
      if (error) throw error;
      return data?.[0] || null;
    },
  });

  const { data: treatments = [], isLoading } = useQuery({
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
  });

  const categories = [...new Set(treatments.map(t => t.category))];

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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header + Tabs Sticky */}
      <div className="sticky top-0 z-20 bg-background border-b border-border">
        <div className="relative h-28 overflow-hidden">
          {hotel?.cover_image && (
            <img 
              src={hotel.cover_image} 
              alt={hotel.name}
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/60" />
          <div className="absolute inset-0 flex items-center justify-between px-4 pt-safe">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/client/${hotelId}`)}
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-white text-lg font-semibold truncate max-w-[200px]">{hotel?.name}</h1>
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(`/client/${hotelId}/basket`)}
                className="text-white hover:bg-white/20 relative"
              >
                <ShoppingBag className="h-5 w-5" />
                {itemCount > 0 && (
                  <Badge 
                    key={bounceKey}
                    className={`absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-primary text-primary-foreground text-xs ${
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

        {/* Categories Tabs - Inside sticky container */}
        <div className="w-full overflow-x-auto scrollbar-hide bg-background">
          <div className="flex">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${
                  activeCategory === category 
                    ? 'border-primary text-foreground font-medium' 
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(`menu.categories.${category}`, category)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content - Filtered by active category */}
      <div className="divide-y divide-border">
        {treatments
          .filter(treatment => treatment.category === activeCategory)
          .map(treatment => (
            <div key={treatment.id} className="p-4 active:bg-muted/50 transition-colors">
              <div className="flex gap-3">
                {treatment.image && (
                  <img
                    src={treatment.image}
                    alt={treatment.name}
                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground text-sm">
                    {treatment.name}
                  </h3>
                  {treatment.price_on_request && (
                    <Badge className="text-[10px] px-1.5 py-0.5 bg-amber-500 text-white border-0 font-medium mt-1">
                      On quote
                    </Badge>
                  )}
                  {treatment.description && (
                    <p className="text-xs text-muted-foreground mt-1 mb-2 line-clamp-2">
                      {treatment.description}
                    </p>
                  )}
                  {!treatment.price_on_request && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold text-foreground">
                        €{Number(treatment.price).toFixed(0)}
                      </span>
                      {treatment.duration && (
                        <span className="text-muted-foreground text-xs">• {treatment.duration} min</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Controls Row */}
              <div className="flex items-center justify-end mt-3 gap-2">
                {getItemQuantity(treatment.id) > 0 ? (
                  <div className="flex items-center gap-1 bg-muted rounded-full p-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateBasketQuantity(treatment.id, getItemQuantity(treatment.id) - 1);
                        if (navigator.vibrate) navigator.vibrate(30);
                      }}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-8 text-center font-semibold text-sm">
                      {getItemQuantity(treatment.id)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToBasket(treatment);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => handleAddToBasket(treatment)}
                    size="sm"
                    className="rounded-full px-4 h-8 text-xs"
                  >
                    {t('menu.add')}
                  </Button>
                )}
              </div>
            </div>
          ))}
      </div>

      {/* Fixed Bottom Button */}
      {itemCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border pb-safe">
          <Button
            onClick={() => navigate(`/client/${hotelId}/basket`)}
            className="w-full h-14 text-base rounded-full"
          >
            <ShoppingBag className="mr-2 h-5 w-5" />
            {t('menu.viewBasket')} ({itemCount} {itemCount === 1 ? t('menu.item') : t('menu.items')})
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
