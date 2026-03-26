import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ShoppingBag, HandHeart, Minus, Plus, Sparkles, ChevronDown, Gift, Building } from 'lucide-react';
import { useBasket } from './context/CartContext';
import { useState, useEffect, useMemo, useRef } from 'react';
import OnRequestFormDrawer from '@/components/client/OnRequestFormDrawer';
import { CartDrawer } from '@/components/client/CartDrawer';
import { BestsellerSection } from '@/components/client/BestsellerSection';
import { TreatmentsSkeleton } from '@/components/client/skeletons/TreatmentsSkeleton';
import { VariantSelector, type TreatmentVariant } from '@/components/client/VariantSelector';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatPrice';
import { useVenueTerms, type VenueType } from '@/hooks/useVenueTerms';
import { useClientAnalytics } from '@/hooks/useClientAnalytics';

interface TreatmentVariantData {
  id: string;
  label: string | null;
  duration: number;
  price: number | null;
  price_on_request: boolean;
  is_default: boolean;
  sort_order: number;
}

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
  is_bestseller?: boolean;
  variants?: TreatmentVariantData[];
}

export default function Treatments() {
  // Extract hotelId from URL directly (useParams doesn't work in nested Routes)
  const hotelId = window.location.pathname.split('/')[2];
  const navigate = useNavigate();
  const { items, addItem, removeItem, updateQuantity: updateBasketQuantity, itemCount } = useBasket();
  const [bounceKey, setBounceKey] = useState(0);
  const { t } = useTranslation('client');

  // On Request drawer state
  const [isOnRequestOpen, setIsOnRequestOpen] = useState(false);
  const [selectedOnRequestTreatment, setSelectedOnRequestTreatment] = useState<Treatment | null>(null);

  // Cart drawer state
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Expanded treatment for variant selection (only one at a time)
  const [expandedTreatmentId, setExpandedTreatmentId] = useState<string | null>(null);
  // Closing animation state
  const [closingTreatmentId, setClosingTreatmentId] = useState<string | null>(null);
  // Selected variant per treatment
  const [selectedVariants, setSelectedVariants] = useState<Record<string, TreatmentVariantData>>({});

  const getItemQuantity = (id: string) => {
    const item = items.find(i => i.id === id);
    return item?.quantity || 0;
  };

  /** Total quantity across all variants of a treatment */
  const getTreatmentTotalQuantity = (treatmentId: string) => {
    return items.filter(i => i.id === treatmentId).reduce((sum, i) => sum + i.quantity, 0);
  };

  /** Check if a treatment has multiple variants */
  const hasMultipleVariants = (treatment: Treatment) =>
    treatment.variants != null && treatment.variants.length > 1;

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

  const { data: treatmentCategories = [], isLoading: isCategoriesLoading } = useQuery({
    queryKey: ['treatment-categories', hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('treatment_categories')
        .select('id, name, sort_order')
        .eq('hotel_id', hotelId)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!hotelId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Build category sections from admin-defined categories
  const categorySections = useMemo(() => {
    const grouped = new Map<string, Treatment[]>();
    for (const treatment of allTreatments) {
      const key = treatment.category;
      const existing = grouped.get(key) || [];
      grouped.set(key, [...existing, treatment]);
    }

    // When admin has defined categories, use them in sort_order
    if (treatmentCategories.length > 0) {
      const sections: { id: string; name: string; treatments: Treatment[] }[] = [];
      const matchedNames = new Set<string>();

      for (const cat of treatmentCategories) {
        const treatments = grouped.get(cat.name);
        if (treatments && treatments.length > 0) {
          sections.push({ id: cat.id, name: cat.name, treatments });
          matchedNames.add(cat.name);
        }
      }

      // Unmatched treatments go into "Other"
      const unmatched: Treatment[] = [];
      for (const [categoryName, treatments] of grouped) {
        if (!matchedNames.has(categoryName)) {
          unmatched.push(...treatments);
        }
      }
      if (unmatched.length > 0) {
        sections.push({ id: 'other', name: t('menu.otherCategory', 'Autres'), treatments: unmatched });
      }

      return sections;
    }

    // Fallback: no admin categories — derive from treatments alphabetically
    const uniqueCategories = [...grouped.keys()].sort();
    return uniqueCategories.map(name => ({
      id: name,
      name,
      treatments: grouped.get(name) || [],
    }));
  }, [allTreatments, treatmentCategories, t]);

  // Expanded category section state
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // venue_type is now included in the RPC response (get_public_hotel_by_id)
  // No need for a separate query that could fail due to RLS policies
  const venueType = hotel?.venue_type as VenueType | null;
  const venueTerms = useVenueTerms(venueType);
  const isOffert = !!hotel?.offert;
  const isCompanyOffered = !!hotel?.company_offered;
  const { trackPageView, trackAction } = useClientAnalytics(hotelId);
  const hasTrackedPageView = useRef(false);

  // Track page view once
  useEffect(() => {
    if (!hasTrackedPageView.current) {
      hasTrackedPageView.current = true;
      trackPageView('treatments');
    }
  }, [trackPageView]);


  const handleAddToBasket = (treatment: Treatment, variant?: TreatmentVariantData) => {
    const resolvedVariant = variant ||
      treatment.variants?.find(v => v.is_default) ||
      treatment.variants?.[0];

    // Track add to cart action
    trackAction('add_to_cart', {
      treatmentId: treatment.id,
      treatmentName: treatment.name,
      price: resolvedVariant?.price ?? treatment.price,
      category: treatment.category,
      variantId: resolvedVariant?.id,
    });

    // Add to basket - including price_on_request items for mixed cart logic
    addItem({
      id: treatment.id,
      variantId: resolvedVariant?.id,
      variantLabel: resolvedVariant?.label || (resolvedVariant ? `${resolvedVariant.duration} min` : undefined),
      name: treatment.name,
      price: Number(resolvedVariant?.price ?? treatment.price) || 0,
      currency: treatment.currency || 'EUR',
      duration: resolvedVariant?.duration ?? treatment.duration ?? 0,
      image: treatment.image || undefined,
      category: treatment.category,
      isPriceOnRequest: resolvedVariant?.price_on_request ?? treatment.price_on_request ?? false,
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

  const isLoading = isHotelLoading || isTreatmentsLoading || isCategoriesLoading;

  if (isLoading) {
    return <TreatmentsSkeleton />;
  }

  /** Get the minimum price across all non-on-request variants */
  const getMinVariantPrice = (variants: TreatmentVariantData[]) => {
    const prices = variants.filter(v => !v.price_on_request).map(v => v.price || 0);
    return prices.length > 0 ? Math.min(...prices) : 0;
  };

  /** Get duration range string like "30-90" */
  const getVariantDurationRange = (variants: TreatmentVariantData[]) => {
    const durations = variants.map(v => v.duration);
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    return min === max ? `${min}` : `${min}-${max}`;
  };

  /** Render the price/duration line for a treatment */
  const renderPriceLine = (treatment: Treatment) => {
    // Multi-variant treatments show "from X" when collapsed
    if (hasMultipleVariants(treatment) && expandedTreatmentId !== treatment.id) {
      const variants = treatment.variants!;
      if (isCompanyOffered) {
        return (
          <span className="text-gray-400 text-xs font-light tracking-wider uppercase">
            {getVariantDurationRange(variants)} min
          </span>
        );
      }
      if (isOffert) {
        return (
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-gray-400 line-through font-light">
              {formatPrice(getMinVariantPrice(variants), treatment.currency || 'EUR', { decimals: 0 })}
            </span>
            <span className="text-base sm:text-lg font-medium text-emerald-600">
              {formatPrice(0, treatment.currency || 'EUR', { decimals: 0 })}
            </span>
            <span className="text-gray-400 text-xs font-light tracking-wider uppercase">
              {getVariantDurationRange(variants)} min
            </span>
          </div>
        );
      }
      return (
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-wider text-gray-400">{t('menu.fromPrice')}</span>
          <span className="text-base sm:text-lg font-light text-gray-700">
            {formatPrice(getMinVariantPrice(variants), treatment.currency || 'EUR', { decimals: 0 })}
          </span>
          <span className="text-gray-400 text-xs font-light tracking-wider uppercase">
            {getVariantDurationRange(variants)} min
          </span>
        </div>
      );
    }

    // When expanded, variant selector handles pricing — hide the price line
    if (expandedTreatmentId === treatment.id) {
      return null;
    }

    // Single variant or no variants — show like today
    if (isCompanyOffered) {
      return treatment.duration ? (
        <span className="text-gray-400 text-xs font-light tracking-wider uppercase">{treatment.duration} min</span>
      ) : null;
    }
    if (isOffert) {
      return (
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-gray-400 line-through font-light">
            {treatment.price_on_request ? t('payment.onQuote') : formatPrice(treatment.price, treatment.currency || 'EUR', { decimals: 0 })}
          </span>
          <span className="text-base sm:text-lg font-medium text-emerald-600">
            {formatPrice(0, treatment.currency || 'EUR', { decimals: 0 })}
          </span>
          {treatment.duration && (
            <span className="text-gray-400 text-xs font-light tracking-wider uppercase">{treatment.duration} min</span>
          )}
        </div>
      );
    }
    if (treatment.price_on_request) {
      return (
        <Badge className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gold-600 border-gold-300/30 font-medium w-fit">
          {t('payment.onQuote')}
        </Badge>
      );
    }
    return (
      <div className="flex items-baseline gap-2">
        <span className="text-base sm:text-lg font-light text-gray-700">
          {formatPrice(treatment.price, treatment.currency || 'EUR', { decimals: 0 })}
        </span>
        {treatment.duration && (
          <span className="text-gray-400 text-xs font-light tracking-wider uppercase">{treatment.duration} min</span>
        )}
      </div>
    );
  };

  /** Render the add button / quantity controls for non-expanded treatments */
  const renderControls = (treatment: Treatment) => {
    const totalQty = getTreatmentTotalQuantity(treatment.id);

    if (totalQty > 0) {
      return (
        <div className="flex items-center gap-2 bg-gray-100 rounded-md p-1 pl-2 border border-gray-200">
          <span className="w-4 text-center font-medium text-sm text-gold-600">
            {totalQty}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 sm:h-11 sm:w-11 hover:bg-gray-200 text-gray-500 hover:text-gray-700"
              onClick={(e) => {
                e.stopPropagation();
                // For multi-variant, find the last added variant item and decrement it
                const treatmentItems = items.filter(i => i.id === treatment.id);
                const lastItem = treatmentItems[treatmentItems.length - 1];
                if (lastItem) {
                  updateBasketQuantity(lastItem.id, lastItem.quantity - 1, lastItem.variantId);
                }
                if (navigator.vibrate) navigator.vibrate(30);
              }}
            >
              <Minus className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 sm:h-11 sm:w-11 bg-gold-400 text-black hover:bg-gold-200"
              onClick={(e) => {
                e.stopPropagation();
                if (hasMultipleVariants(treatment)) {
                  setSelectedVariants(prev => {
                    const { [treatment.id]: _, ...rest } = prev;
                    return rest;
                  });
                  setExpandedTreatmentId(treatment.id);
                } else {
                  handleAddToBasket(treatment);
                }
              }}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>
      );
    }

    return (
      <Button
        onClick={(e) => {
          e.stopPropagation();
          if (hasMultipleVariants(treatment)) {
            // For multi-variant, expand and reset selection for a fresh pick
            setSelectedVariants(prev => {
              const { [treatment.id]: _, ...rest } = prev;
              return rest;
            });
            setExpandedTreatmentId(treatment.id);
          } else {
            handleAddToBasket(treatment);
          }
        }}
        className={cn(
          "transition-all duration-300 border-none",
          hasMultipleVariants(treatment)
            ? "px-2 h-7 text-[11px] tracking-wide bg-gold-400 text-black hover:bg-gold-200 font-medium"
            : "px-3 h-8 sm:px-4 sm:h-8 text-[10px] uppercase tracking-[0.2em] bg-gold-400 text-black hover:bg-gold-200 font-bold"
        )}
      >
        {t('menu.select')}
      </Button>
    );
  };

  /** Render a single treatment card */
  const renderTreatmentCard = (treatment: Treatment, i: number) => {
    const isExpanded = expandedTreatmentId === treatment.id;

    return (
      <div
        key={treatment.id}
        className={cn(
          "p-4 transition-colors group cursor-pointer animate-slide-up-fade",
          isExpanded ? "bg-gray-50" : "active:bg-black/5"
        )}
        style={{ animationDelay: `${i * 0.05}s` }}
        onClick={() => {
          if (hasMultipleVariants(treatment)) {
            if (expandedTreatmentId === treatment.id) {
              setExpandedTreatmentId(null);
            } else {
              setSelectedVariants(prev => {
                const { [treatment.id]: _, ...rest } = prev;
                return rest;
              });
              setExpandedTreatmentId(treatment.id);
            }
          } else {
            handleAddToBasket(treatment);
          }
        }}
      >
        <div>
          <h3 className="font-serif text-base sm:text-lg text-gray-900 font-medium leading-tight mb-1">
            {treatment.name}
          </h3>
          {treatment.description && (
            <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed font-light">
              {treatment.description}
            </p>
          )}
        </div>

        <div className="flex items-end justify-between mt-2">
          <div className="flex flex-col">
            {renderPriceLine(treatment)}
          </div>

          {/* Controls — only show when NOT expanded */}
          {!isExpanded && (
            <div className="flex items-center gap-1">
              {renderControls(treatment)}
            </div>
          )}
        </div>

        {/* Expanded variant selector */}
        {isExpanded && treatment.variants && (
          <div className={cn(
            "mt-3 transition-all duration-300",
            closingTreatmentId === treatment.id
              ? "opacity-0 max-h-0 overflow-hidden"
              : "opacity-100 max-h-96 animate-fade-in"
          )} onClick={(e) => e.stopPropagation()}>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">
              {t('menu.selectDuration')}
            </p>
            <VariantSelector
              variants={treatment.variants}
              selectedVariantId={null}
              onSelect={(variant) => {
                handleAddToBasket(treatment, variant);
                setClosingTreatmentId(treatment.id);
                setTimeout(() => {
                  setExpandedTreatmentId(null);
                  setClosingTreatmentId(null);
                }, 350);
              }}
              currency={treatment.currency || 'EUR'}
              isOffert={isOffert}
              isCompanyOffered={isCompanyOffered}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={cn(
        'min-h-screen bg-white flex flex-col text-gray-900',
        // Add padding for bottom button when items selected
        itemCount > 0 ? 'pb-20' : ''
      )}
    >
      {/* Header Sticky */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="relative h-16 sm:h-18 md:h-20 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-between px-4 pt-safe">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/client/${hotelId}`)}
              className="text-gray-900 hover:bg-gray-100 hover:text-gold-600 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <h1 className="font-serif text-base sm:text-lg md:text-xl text-gold-600 tracking-wide text-center flex-1 px-2 leading-tight">
              {hotel?.name}
            </h1>

            {/* Cart icon */}
            {itemCount > 0 ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsCartOpen(true)}
                className="relative text-gray-900 hover:bg-gray-100 hover:text-gold-600 transition-colors"
              >
                <ShoppingBag className="h-5 w-5" />
                <span className="absolute -top-1 -right-1 bg-gold-600 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                  {itemCount}
                </span>
              </Button>
            ) : (
              <div className="w-10" />
            )}
          </div>
        </div>
      </div>

      {/* Reassurance Banner — commented out: not always accurate (spa rooms vs in-room) */}
      {/* <div className="px-4 py-3 bg-gray-50 flex items-center justify-center gap-2 border-b border-gray-100">
          <Sparkles className="w-3 h-3 text-gold-600" />
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-medium text-center">
            {venueTerms.disclaimer}
          </p>
      </div> */}

      {/* Company Offered Banner */}
      {isCompanyOffered && (
        <div className="px-4 py-3 bg-blue-50 flex items-center justify-center gap-2 border-b border-blue-100">
          <Building className="w-4 h-4 text-blue-600" />
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-blue-700 font-semibold">
              {t('companyOffered.banner')}
            </p>
            <p className="text-[9px] text-blue-600 font-light">
              {t('companyOffered.bannerDesc')}
            </p>
          </div>
        </div>
      )}

      {/* Offert Banner */}
      {isOffert && !isCompanyOffered && (
        <div className="px-4 py-3 bg-emerald-50 flex items-center justify-center gap-2 border-b border-emerald-100">
          <Gift className="w-4 h-4 text-emerald-600" />
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-700 font-semibold">
              {t('offert.banner')}
            </p>
            <p className="text-[9px] text-emerald-600 font-light">
              {t('offert.bannerDesc')}
            </p>
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Bestseller Section - only for hotels */}
        {venueType === 'hotel' && (
          <BestsellerSection
            treatments={allTreatments}
            onAddToBasket={handleAddToBasket}
            getItemQuantity={getItemQuantity}
            onUpdateQuantity={updateBasketQuantity}
            isOffert={isOffert}
            isCompanyOffered={isCompanyOffered}
          />
        )}

        {/* Category Sections */}
        {categorySections.map((section) => (
          <div key={section.id} className="border-b border-gray-200">
            <button
              type="button"
              onClick={() => setExpandedCategory(c => c === section.id ? null : section.id)}
              className="w-full flex items-center justify-between px-5 py-5 transition-all"
            >
              <div className="flex flex-col items-start gap-1">
                <span className="font-serif text-xl text-gray-900 tracking-wide">
                  {section.name}
                </span>
                <span className="text-gray-400 text-[11px] uppercase tracking-[0.15em]">
                  {section.treatments.length} {section.treatments.length === 1 ? t('menu.item') : t('menu.items')}
                </span>
              </div>
              <ChevronDown
                className={cn(
                  "w-5 h-5 text-gold-600 transition-transform duration-200",
                  expandedCategory === section.id && "rotate-180"
                )}
              />
            </button>

            {expandedCategory === section.id && (
              <div className="animate-fade-in">
                <div className="divide-y divide-gray-100">
                  {section.treatments.map((treatment, i) => renderTreatmentCard(treatment, i))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Fixed Bottom Button - Direct to datetime (basket page skipped) */}
      {itemCount > 0 && (
        <div className="fixed bottom-4 left-0 right-0 px-4 bg-gradient-to-t from-white via-white to-transparent pb-safe z-30">
          <Button
            onClick={() => navigate(`/client/${hotelId}/schedule`)}
            className="w-full h-12 sm:h-14 md:h-16 text-base bg-gold-400 text-black hover:bg-gold-200 font-medium tracking-wide shadow-lg transition-all duration-300"
          >
            <HandHeart className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
            {t('menu.bookTreatment')} ({itemCount} {itemCount === 1 ? t('menu.item') : t('menu.items')})
          </Button>
        </div>
      )}

      {/* Cart Drawer */}
      <CartDrawer open={isCartOpen} onOpenChange={setIsCartOpen} isOffert={isOffert} isCompanyOffered={isCompanyOffered} />

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
