import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ShoppingBag, HandHeart, Minus, Plus, Sparkles, ChevronDown, Gift, Building, Package, MapPin, Phone } from 'lucide-react';
import { useBasket } from './context/CartContext';
import { useState, useEffect, useMemo, useRef } from 'react';
import OnRequestFormDrawer from '@/components/client/OnRequestFormDrawer';
import { CartDrawer } from '@/components/client/CartDrawer';
import { BestsellerSection } from '@/components/client/BestsellerSection';
import { TreatmentsSkeleton } from '@/components/client/skeletons/TreatmentsSkeleton';
import { VariantSelector, type TreatmentVariant } from '@/components/client/VariantSelector';
import { TreatmentVariantDrawer } from '@/components/client/TreatmentVariantDrawer';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatPrice';
import { useVenueTerms, type VenueType } from '@/hooks/useVenueTerms';
import { useClientAnalytics } from '@/hooks/useClientAnalytics';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useLocalizedField } from '@/hooks/useLocalizedField';
import { SchedulePanel } from '@/components/client/SchedulePanel';
import { TreatmentsBreadcrumb } from '@/components/client/TreatmentsBreadcrumb';
import { TreatmentsSummaryPanel } from '@/components/client/TreatmentsSummaryPanel';
import { useClientFlow } from './context/FlowContext';

interface TreatmentVariantData {
  id: string;
  label: string | null;
  label_en: string | null;
  duration: number;
  price: number | null;
  price_on_request: boolean;
  is_default: boolean;
  sort_order: number;
}

interface Treatment {
  id: string;
  name: string;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
  price: number | null;
  duration: number | null;
  image: string | null;
  category: string;
  price_on_request: boolean | null;
  currency: string | null;
  is_bestseller?: boolean;
  is_addon?: boolean;
  is_bundle?: boolean;
  bundle_id?: string | null;
  variants?: TreatmentVariantData[];
}

export default function Treatments() {
  // Extract hotelId from URL directly (useParams doesn't work in nested Routes)
  const hotelId = window.location.pathname.split('/')[2];
  const navigate = useNavigate();
  const { items, addItem, removeItem, updateQuantity: updateBasketQuantity, itemCount, hasBaseItem, isBundleOnly } = useBasket();
  const { setIsBundleOnlyPurchase } = useClientFlow();
  const [bounceKey, setBounceKey] = useState(0);
  const { t } = useTranslation('client');
  const isDesktop = useIsDesktop();
  const localize = useLocalizedField();

  // On Request drawer state
  const [isOnRequestOpen, setIsOnRequestOpen] = useState(false);
  const [selectedOnRequestTreatment, setSelectedOnRequestTreatment] = useState<Treatment | null>(null);

  // Cart drawer state
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Desktop schedule panel state — explicit open/close (not auto)
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);

  // Expanded treatment for variant selection (only one at a time)
  const [expandedTreatmentId, setExpandedTreatmentId] = useState<string | null>(null);
  // Closing animation state
  const [closingTreatmentId, setClosingTreatmentId] = useState<string | null>(null);
  // Selected variant per treatment
  const [selectedVariants, setSelectedVariants] = useState<Record<string, TreatmentVariantData>>({});

  // Variant drawer state — opened when user clicks + on a multi-variant treatment
  const [variantDrawerTreatment, setVariantDrawerTreatment] = useState<Treatment | null>(null);
  const openVariantDrawer = (treatment: Treatment) => setVariantDrawerTreatment(treatment);
  const closeVariantDrawer = () => setVariantDrawerTreatment(null);

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
        .select('id, name, name_en, sort_order, is_addon')
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

  // Build set of add-on category names for conditional rendering
  const addonCategoryNames = useMemo(() => {
    const addonSet = new Set<string>();
    for (const cat of treatmentCategories) {
      if ((cat as any).is_addon) {
        addonSet.add(cat.name);
      }
    }
    return addonSet;
  }, [treatmentCategories]);

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
      const sections: { id: string; name: string; displayName: string; isAddon: boolean; treatments: Treatment[] }[] = [];
      const matchedNames = new Set<string>();

      for (const cat of treatmentCategories) {
        const treatments = grouped.get(cat.name);
        if (treatments && treatments.length > 0) {
          sections.push({ id: cat.id, name: cat.name, displayName: localize(cat.name, (cat as any).name_en), isAddon: !!(cat as any).is_addon, treatments });
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
        sections.push({ id: 'other', name: t('menu.otherCategory', 'Autres'), displayName: t('menu.otherCategory', 'Other'), isAddon: false, treatments: unmatched });
      }

      return sections;
    }

    // Fallback: no admin categories — derive from treatments alphabetically
    const uniqueCategories = [...grouped.keys()].sort();
    return uniqueCategories.map(name => ({
      id: name,
      name,
      displayName: name,
      isAddon: false,
      treatments: grouped.get(name) || [],
    }));
  }, [allTreatments, treatmentCategories, t, localize]);

  // Collapsed category section state — sections are open by default
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => new Set());

  const isCategoryExpanded = (sectionId: string) => !collapsedCategories.has(sectionId);

  const handleCategoryToggle = (sectionId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  // venue_type is now included in the RPC response (get_public_hotel_by_id)
  // No need for a separate query that could fail due to RLS policies
  const venueType = hotel?.venue_type as VenueType | null;
  const venueTerms = useVenueTerms(venueType);
  const isOffert = !!hotel?.offert;
  const isCompanyOffered = !!hotel?.company_offered;
  const { trackPageView, trackAction } = useClientAnalytics(hotelId);
  const hasTrackedPageView = useRef(false);

  // Close expanded variants when entering schedule mode
  useEffect(() => {
    if (isScheduleOpen) {
      setExpandedTreatmentId(null);
    }
  }, [isScheduleOpen]);

  // Auto-close schedule panel if cart is emptied
  useEffect(() => {
    if (itemCount === 0 && isScheduleOpen) {
      setIsScheduleOpen(false);
    }
  }, [itemCount, isScheduleOpen]);

  // Track page view once
  useEffect(() => {
    if (!hasTrackedPageView.current) {
      hasTrackedPageView.current = true;
      trackPageView('treatments');
    }
  }, [trackPageView]);
  useEffect(() => {
    if (!isTreatmentsLoading && allTreatments.length > 0) {
      const searchParams = new URLSearchParams(window.location.search);
      const treatmentsParam = searchParams.get('treatments');

      if (treatmentsParam) {
        const requestedIds = treatmentsParam.split(',');
        let hasAddedItems = false;

        requestedIds.forEach(id => {
          const treatmentToAdd = allTreatments.find(t => t.id === id);
          const isAlreadyInCart = items.some(item => item.id === id);

          if (treatmentToAdd && !isAlreadyInCart) {
            const resolvedVariant = treatmentToAdd.variants?.find(v => v.is_default) || treatmentToAdd.variants?.[0];

            addItem({
              id: treatmentToAdd.id,
              variantId: resolvedVariant?.id,
              variantLabel: (resolvedVariant ? localize(resolvedVariant.label, resolvedVariant.label_en) : undefined) || (resolvedVariant ? `${resolvedVariant.duration} min` : undefined),
              name: localize(treatmentToAdd.name, treatmentToAdd.name_en),
              price: Number(resolvedVariant?.price ?? treatmentToAdd.price) || 0,
              currency: treatmentToAdd.currency || 'EUR',
              duration: resolvedVariant?.duration ?? treatmentToAdd.duration ?? 0,
              image: treatmentToAdd.image || undefined,
              category: treatmentToAdd.category,
              isPriceOnRequest: resolvedVariant?.price_on_request ?? treatmentToAdd.price_on_request ?? false,
              isAddon: addonCategoryNames.has(treatmentToAdd.category),
              isBundle: treatmentToAdd.is_bundle ?? false,
              bundleId: treatmentToAdd.bundle_id ?? undefined,
            });
            hasAddedItems = true;
          }
        });

        if (hasAddedItems) {
          setIsCartOpen(true);
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
        }
      }
    }
  }, [allTreatments, isTreatmentsLoading, items, addItem, localize, addonCategoryNames]);

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
      variantLabel: (resolvedVariant ? localize(resolvedVariant.label, resolvedVariant.label_en) : undefined) || (resolvedVariant ? `${resolvedVariant.duration} min` : undefined),
      name: localize(treatment.name, treatment.name_en),
      price: Number(resolvedVariant?.price ?? treatment.price) || 0,
      currency: treatment.currency || 'EUR',
      duration: resolvedVariant?.duration ?? treatment.duration ?? 0,
      image: treatment.image || undefined,
      category: treatment.category,
      isPriceOnRequest: resolvedVariant?.price_on_request ?? treatment.price_on_request ?? false,
      isAddon: addonCategoryNames.has(treatment.category),
      isBundle: treatment.is_bundle ?? false,
      bundleId: treatment.bundle_id ?? undefined,
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
          {treatment.duration > 0 && (
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
        {treatment.duration > 0 && (
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
                  openVariantDrawer(treatment);
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
        variant="ghost"
        size="icon"
        aria-label={t('menu.select')}
        onClick={(e) => {
          e.stopPropagation();
          if (hasMultipleVariants(treatment)) {
            openVariantDrawer(treatment);
          } else {
            handleAddToBasket(treatment);
          }
        }}
        className="h-11 w-11 rounded-full bg-gold-600 text-white hover:bg-gold-700 ring-1 ring-gold-700/20 shadow-md transition-all duration-200"
      >
        <Plus className="h-5 w-5" strokeWidth={2.5} />
      </Button>
    );
  };

  /** Render a single treatment card */
  const renderTreatmentCard = (treatment: Treatment, i: number) => {
    const isExpanded = expandedTreatmentId === treatment.id;
    const isSelected = getTreatmentTotalQuantity(treatment.id) > 0;

    return (
      <div
        key={treatment.id}
        className={cn(
          "p-4 transition-all group cursor-pointer bg-white rounded-xl",
          isSelected
            ? "border-2 border-gold-500 shadow-md ring-1 ring-gold-300/40"
            : "border border-gray-200 hover:border-gold-300 hover:shadow-sm",
          isExpanded && !isSelected && "lg:bg-gray-50/80 bg-gray-50 border-gold-300",
          !isExpanded && "active:bg-black/5"
        )}
        onClick={() => {
          if (hasMultipleVariants(treatment)) {
            openVariantDrawer(treatment);
          } else {
            handleAddToBasket(treatment);
          }
        }}
      >
        <div>
          <h3 className="font-serif text-base sm:text-lg text-gray-900 font-medium leading-tight mb-1">
            {localize(treatment.name, treatment.name_en)}
          </h3>
          {(treatment.description || treatment.description_en) && (
            <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed font-light">
              {localize(treatment.description, treatment.description_en)}
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
      className="min-h-screen bg-white flex flex-col text-gray-900"
    >
      {/* Header Sticky — mobile only */}
      <div className="lg:hidden sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-200">
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
              {localize(hotel?.name, hotel?.name_en)}
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

      {/* Venue Contact Info — mobile only (desktop shows it inside the right summary panel) */}
      {(hotel?.address || hotel?.contact_phone) && (
        <div className="lg:hidden px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-center space-y-0.5">
          {hotel?.address && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([hotel.name, hotel.address, hotel.city].filter(Boolean).join(', '))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 justify-center"
            >
              <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
              <p className="text-xs text-gray-500 underline decoration-gray-300">
                {[hotel.address, hotel.postal_code, hotel.city].filter(Boolean).join(', ')}
              </p>
            </a>
          )}
          {hotel?.contact_phone && (
            <div className="flex items-center gap-1.5 justify-center">
              <Phone className="w-3 h-3 text-gray-400 shrink-0" />
              <a
                href={`tel:${hotel.contact_phone.replace(/\s/g, '')}`}
                className="text-xs text-gray-500 underline decoration-gray-300"
              >
                {hotel.contact_phone}
              </a>
            </div>
          )}
        </div>
      )}

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

      {/* Main content — split layout on desktop */}
      <div className="flex-1 flex lg:flex-row overflow-hidden lg:px-8 lg:gap-8 lg:max-w-7xl lg:mx-auto lg:w-full lg:py-6">
        {/* Left panel — treatments list */}
        <div className={cn(
          "flex-1 overflow-y-auto lg:overflow-visible",
          // Bottom padding for the fixed "Book" button (mobile only)
          !isDesktop && itemCount > 0 ? 'pb-20' : ''
        )}>
         {/* Desktop breadcrumb + title */}
         <div className="hidden lg:block mb-6">
           <TreatmentsBreadcrumb currentStep="treatments" className="mb-4" />
           <h1 className="font-serif text-3xl text-gray-900 tracking-tight">
             {t('breadcrumb.treatments')}
           </h1>
           {hotel && (
             <p className="font-serif text-lg text-gray-500 mt-1">
               {localize(hotel.name, hotel.name_en)}
             </p>
           )}
         </div>
         <div className={cn(
           // Read-only when schedule panel is open on desktop
           isDesktop && isScheduleOpen && "pointer-events-none opacity-50 select-none transition-opacity duration-300"
         )}>
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

          {/* Bundle / Cure Section */}
          {/* Category Sections */}
          {categorySections.map((section) => {
            const isAddonLocked = section.isAddon && !hasBaseItem;

            return (
              <div
                key={section.id}
                className="border-b border-gray-200"
              >
                {isAddonLocked ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          disabled
                          className="w-full flex items-center justify-between px-5 py-5 transition-all opacity-40 cursor-not-allowed"
                        >
                          <div className="flex flex-col items-start gap-1">
                            <span className="font-serif text-xl text-gray-400 tracking-wide">
                              {section.displayName}
                            </span>
                            <span className="text-gray-300 text-[11px] uppercase tracking-[0.15em]">
                              {section.treatments.length} {section.treatments.length === 1 ? t('menu.item') : t('menu.items')}
                            </span>
                          </div>
                          <ChevronDown className="w-5 h-5 text-gray-300" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('menu.addonDisabledTooltip')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleCategoryToggle(section.id)}
                    className="w-full flex items-center justify-between px-5 py-5 transition-all"
                  >
                    <div className="flex flex-col items-start gap-1">
                      <span className="font-serif text-xl text-gray-900 tracking-wide">
                        {section.displayName}
                      </span>
                      <span className="text-gray-400 text-[11px] uppercase tracking-[0.15em]">
                        {section.treatments.length} {section.treatments.length === 1 ? t('menu.item') : t('menu.items')}
                      </span>
                    </div>
                    <ChevronDown
                      className={cn(
                        "w-5 h-5 text-gold-600 transition-transform duration-200",
                        isCategoryExpanded(section.id) && "rotate-180"
                      )}
                    />
                  </button>
                )}

                {isCategoryExpanded(section.id) && !isAddonLocked && (
                  <div className="px-4 pb-4">
                    <div className="flex flex-col gap-3">
                      {section.treatments.map((treatment, i) => renderTreatmentCard(treatment, i))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
         </div>{/* end read-only wrapper */}
        </div>

        {/* Right panel — desktop only: summary panel OR schedule panel */}
        {isDesktop && (
          <div className="shrink-0 lg:sticky lg:top-6 lg:self-start">
            {isScheduleOpen ? (
              <div className="w-[480px] border border-gray-200 rounded-2xl bg-gray-50/50 overflow-hidden max-h-[calc(100vh-3rem)] overflow-y-auto">
                {/* Back button — return to treatment selection */}
                <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm border-b border-gray-200 px-4 py-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsScheduleOpen(false)}
                    className="text-gray-600 hover:text-gray-900 hover:bg-gray-200/50 font-grotesk"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {t('menu.editTreatments', 'Modifier les soins')}
                  </Button>
                </div>
                <SchedulePanel
                  hotelId={hotelId}
                  onContinue={() => navigate(`/client/${hotelId}/guest-info`)}
                  embedded
                />
              </div>
            ) : (
              <TreatmentsSummaryPanel
                hotel={hotel}
                displayName={localize(hotel?.name, hotel?.name_en) || ''}
                isOffert={isOffert}
                isCompanyOffered={isCompanyOffered}
                onContinue={() => {
                  if (isBundleOnly) {
                    setIsBundleOnlyPurchase(true);
                    navigate(`/client/${hotelId}/guest-info`);
                  } else {
                    setIsScheduleOpen(true);
                  }
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Fixed Bottom Button — mobile only (desktop uses the right summary panel CTA) */}
      {/* For bundle-only carts, skip schedule and go directly to guest info */}
      {itemCount > 0 && !isScheduleOpen && (
        <div className="lg:hidden fixed bottom-4 left-0 right-0 px-4 bg-gradient-to-t from-white via-white to-transparent pb-safe z-30">
          <Button
            onClick={() => {
              if (isBundleOnly) {
                setIsBundleOnlyPurchase(true);
                navigate(`/client/${hotelId}/guest-info`);
              } else {
                isDesktop ? setIsScheduleOpen(true) : navigate(`/client/${hotelId}/schedule`);
              }
            }}
            className="w-full h-12 sm:h-14 md:h-16 text-base bg-gold-400 text-black hover:bg-gold-200 font-medium tracking-wide shadow-lg transition-all duration-300"
          >
            {isBundleOnly ? (
              <>
                <Package className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                {t('menu.purchaseBundle', 'Acheter cette cure')} ({itemCount} {itemCount === 1 ? t('menu.item') : t('menu.items')})
              </>
            ) : (
              <>
                <HandHeart className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                {t('menu.bookTreatment')} ({itemCount} {itemCount === 1 ? t('menu.item') : t('menu.items')})
              </>
            )}
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

      {/* Variant selection drawer (multi-variant treatments) */}
      <TreatmentVariantDrawer
        open={variantDrawerTreatment !== null}
        onOpenChange={(open) => { if (!open) closeVariantDrawer(); }}
        treatment={variantDrawerTreatment}
        isOffert={isOffert}
        isCompanyOffered={isCompanyOffered}
        onConfirm={(variant) => {
          if (variantDrawerTreatment) {
            handleAddToBasket(variantDrawerTreatment, variant);
          }
        }}
      />
    </div>
  );
}
