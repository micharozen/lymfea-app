import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowLeft, ShoppingBag } from 'lucide-react';
import { useBasket } from './context/BasketContext';
import { useState, useEffect } from 'react';
import { Minus, Plus } from 'lucide-react';

export default function ClientMenu() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const gender = searchParams.get('gender') || 'women';
  const { addItem, itemCount } = useBasket();
  const [bounceKey, setBounceKey] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const { data: hotel } = useQuery({
    queryKey: ['hotel', hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hotels')
        .select('*')
        .eq('id', hotelId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: treatments = [], isLoading } = useQuery({
    queryKey: ['treatments', hotelId, gender],
    queryFn: async () => {
      const serviceFor = gender === 'women' ? 'Female' : gender === 'men' ? 'Male' : 'All';
      const { data, error } = await supabase
        .from('treatment_menus')
        .select('*')
        .or(`hotel_id.eq.${hotelId},hotel_id.is.null`)
        .in('service_for', [serviceFor, 'All'])
        .eq('status', 'Actif')
        .order('sort_order');
      
      if (error) throw error;
      return data;
    },
  });

  const categories = [...new Set(treatments.map(t => t.category))];

  const handleAddToBasket = (treatment: typeof treatments[0], quantity: number = 1) => {
    for (let i = 0; i < quantity; i++) {
      addItem({
        id: treatment.id,
        name: treatment.name,
        price: Number(treatment.price),
        duration: treatment.duration || 0,
        image: treatment.image || undefined,
        category: treatment.category,
      });
    }
    
    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
    
    // Badge bounce animation
    setBounceKey(prev => prev + 1);
    
    // Reset quantity
    setQuantities(prev => ({ ...prev, [treatment.id]: 1 }));
  };

  useEffect(() => {
    if (bounceKey > 0) {
      const timer = setTimeout(() => setBounceKey(0), 500);
      return () => clearTimeout(timer);
    }
  }, [bounceKey]);

  const updateQuantity = (treatmentId: string, delta: number) => {
    setQuantities(prev => {
      const current = prev[treatmentId] || 1;
      const newValue = Math.max(1, Math.min(10, current + delta));
      return { ...prev, [treatmentId]: newValue };
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border">
        <div className="relative h-32 overflow-hidden">
          {hotel?.cover_image && (
            <img 
              src={hotel.cover_image} 
              alt={hotel.name}
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/60" />
          <div className="absolute inset-0 flex items-center justify-between px-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/client/${hotelId}`)}
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-white text-xl font-semibold">{hotel?.name}</h1>
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
      </div>

      {/* Categories Tabs */}
      <Tabs defaultValue={categories[0]} className="w-full">
        <TabsList className="w-full justify-start rounded-none border-b border-border bg-background p-0 h-auto overflow-x-auto">
          {categories.map(category => (
            <TabsTrigger
              key={category}
              value={category}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
            >
              {category}
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map(category => (
          <TabsContent key={category} value={category} className="mt-0">
            <div className="divide-y divide-border">
              {treatments
                .filter(t => t.category === category)
                .map(treatment => (
                  <div key={treatment.id} className="p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex gap-4">
                      {treatment.image && (
                        <img
                          src={treatment.image}
                          alt={treatment.name}
                          className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground mb-1">
                          {treatment.name}
                        </h3>
                        {treatment.description && (
                          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                            {treatment.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="font-semibold text-foreground">
                            €{Number(treatment.price).toFixed(2)}
                          </span>
                          {treatment.duration && (
                            <span>• {treatment.duration} min</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateQuantity(treatment.id, -1);
                            }}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-8 text-center font-semibold">
                            {quantities[treatment.id] || 1}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateQuantity(treatment.id, 1);
                            }}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <Button
                          onClick={() => handleAddToBasket(treatment, quantities[treatment.id] || 1)}
                          size="sm"
                          className="w-full"
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Fixed Bottom Button */}
      {itemCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
          <Button
            onClick={() => navigate(`/client/${hotelId}/basket`)}
            className="w-full h-14 text-lg"
          >
            <ShoppingBag className="mr-2 h-5 w-5" />
            View Basket ({itemCount} {itemCount === 1 ? 'item' : 'items'})
          </Button>
        </div>
      )}
    </div>
  );
}
