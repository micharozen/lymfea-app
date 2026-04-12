import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Clock, ShoppingBag, Sparkles, HandHeart, MapPin, Phone } from 'lucide-react';
import { useBasket } from './context/CartContext';
import { useLocalizedField } from '@/hooks/useLocalizedField';
import { useClientAnalytics } from '@/hooks/useClientAnalytics';
import { useVenueTerms, type VenueType } from '@/hooks/useVenueTerms';
import { VariantListSelector } from '@/components/client/VariantListSelector';
import OnRequestFormDrawer from '@/components/client/OnRequestFormDrawer';
import { formatPrice } from '@/lib/formatPrice';
import { cn } from '@/lib/utils';

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
  service_for?: string;
  variants?: TreatmentVariantData[];
}

export default function TreatmentLanding() {
  const hotelId = window.location.pathname.split('/')[2];
  const treatmentId = window.location.pathname.split('/')[4];
  const navigate = useNavigate();
  const { t } = useTranslation('client');
  const localize = useLocalizedField();
  const { addItem, itemCount } = useBasket();
  const { trackPageView, trackAction } = useClientAnalytics(hotelId);
  const hasTrackedPageView = useRef(false);

  const [selectedVariant, setSelectedVariant] = useState<TreatmentVariantData | null>(null);
  const [isOnRequestOpen, setIsOnRequestOpen] = useState(false);
  const [added, setAdded] = useState(false);

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
      return (data || []) as Treatment[];
    },
    enabled: !!hotelId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const treatment = allTreatments.find(t => t.id === treatmentId) || null;

  const venueType = hotel?.venue_type as VenueType | null;
  const venueTerms = useVenueTerms(venueType);
  const isOffert = !!hotel?.offert;
  const isCompanyOffered = !!hotel?.company_offered;

  const hasMultipleVariants = treatment?.variants != null && treatment.variants.length > 1;

  // Auto-select default variant
  useEffect(() => {
    if (treatment?.variants && treatment.variants.length > 0 && !selectedVariant) {
      const defaultV = treatment.variants.find(v => v.is_default) || treatment.variants[0];
      setSelectedVariant(defaultV);
    }
  }, [treatment, selectedVariant]);

  // Track page view once
  useEffect(() => {
    if (!hasTrackedPageView.current && treatment) {
      hasTrackedPageView.current = true;
      trackPageView('treatment_detail', { treatmentId: treatment.id, treatmentName: treatment.name });
    }
  }, [trackPageView, treatment]);

  const handleBook = () => {
    if (!treatment) return;

    const resolvedVariant = selectedVariant ||
      treatment.variants?.find(v => v.is_default) ||
      treatment.variants?.[0];

    // If price on request, open the quote drawer
    const isPriceOnRequest = resolvedVariant?.price_on_request ?? treatment.price_on_request;
    if (isPriceOnRequest) {
      setIsOnRequestOpen(true);
      return;
    }

    trackAction('add_to_cart', {
      treatmentId: treatment.id,
      treatmentName: treatment.name,
      price: resolvedVariant?.price ?? treatment.price,
      category: treatment.category,
      variantId: resolvedVariant?.id,
      source: 'treatment_landing',
    });

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
      isPriceOnRequest: false,
      isBundle: treatment.is_bundle ?? false,
      bundleId: treatment.bundle_id ?? undefined,
    });

    if (navigator.vibrate) navigator.vibrate(50);

    setAdded(true);
    setTimeout(() => {
      navigate(`/client/${hotelId}/schedule`);
    }, 600);
  };

  const isLoading = isHotelLoading || isTreatmentsLoading;

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        {/* Skeleton hero */}
        <div className="aspect-[4/3] max-h-[360px] bg-gray-100 animate-pulse" />
        <div className="p-6 space-y-4">
          <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
          <div className="h-8 w-3/4 bg-gray-100 rounded animate-pulse" />
          <div className="h-20 bg-gray-100 rounded animate-pulse" />
          <div className="h-6 w-1/3 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  // Treatment not found
  if (!treatment) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <Sparkles className="w-12 h-12 text-gray-200 mb-4" />
        <h1 className="font-serif text-xl text-gray-900 mb-2">
          {t('treatmentDetail.treatmentNotFound')}
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          {t('treatmentDetail.treatmentNotFoundDescription')}
        </p>
        <Button
          onClick={() => navigate(`/client/${hotelId}`)}
          className="bg-gold-400 text-black hover:bg-gold-200 font-medium"
        >
          {t('treatmentDetail.seeAllTreatments')}
        </Button>
      </div>
    );
  }

  const effectivePrice = selectedVariant?.price ?? treatment.price;
  const effectiveDuration = selectedVariant?.duration ?? treatment.duration;
  const effectivePriceOnRequest = selectedVariant?.price_on_request ?? treatment.price_on_request;
  const currency = treatment.currency || 'EUR';

  const maxVariantPrice = hasMultipleVariants && treatment.variants
    ? Math.max(...treatment.variants.filter(v => !v.price_on_request).map(v => v.price ?? 0))
    : null;
  const showFromPrice = maxVariantPrice != null
    && !effectivePriceOnRequest
    && (effectivePrice ?? 0) < maxVariantPrice;

  return (
    <div className="min-h-screen bg-white flex flex-col text-gray-900">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="relative h-14 overflow-hidden">
          <div className="absolute inset-0 flex items-center px-4 pt-safe">
            <div className="flex-1 flex justify-start">
              <Button
                variant="ghost"
                onClick={() => navigate(`/client/${hotelId}/treatments`)}
                className="h-9 px-2 gap-1.5 text-gray-900 hover:bg-gray-100 hover:text-gold-600 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-xs font-medium">
                  {t('treatmentDetail.seeAllTreatments')}
                </span>
              </Button>
            </div>

            <h1 className="absolute left-1/2 -translate-x-1/2 font-serif text-sm text-gold-600 tracking-wide leading-tight truncate max-w-[40%] text-center pointer-events-none">
              {localize(hotel?.name, hotel?.name_en)}
            </h1>

            <div className="flex-1 flex justify-end">
              {itemCount > 0 ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate(`/client/${hotelId}/treatments`)}
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
      </div>

      {/* Venue Contact Info */}
      {(hotel?.address || hotel?.contact_phone) && (
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-center space-y-0.5">
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

      {/* Content */}
      <div className="flex-1 w-full">
        {/* Treatment info */}
        <div className="max-w-md mx-auto px-6 pt-8 pb-4 flex flex-col items-center text-center">
          {/* Category badge */}
          <span className="text-[10px] uppercase tracking-[0.2em] text-gold-600 font-semibold">
            {treatment.category}
          </span>

          {/* Name */}
          <h2 className="font-serif text-2xl text-gray-900 font-medium leading-tight mt-2 mb-3">
            {localize(treatment.name, treatment.name_en)}
          </h2>

          {/* Description */}
          {(treatment.description || treatment.description_en) && (
            <p className="text-sm text-gray-500 leading-relaxed font-light mb-5">
              {localize(treatment.description, treatment.description_en)}
            </p>
          )}

          {/* Price & Duration */}
          <div className="flex items-start justify-center gap-6 mb-6">
            {!isCompanyOffered && (
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 block mb-0.5">
                  {t('treatmentDetail.price')}
                </span>
                {effectivePriceOnRequest ? (
                  <span className="text-lg font-medium text-gold-600">
                    {t('payment.onQuote')}
                  </span>
                ) : isOffert ? (
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm text-gray-400 line-through">
                      {formatPrice(effectivePrice, currency, { decimals: 0 })}
                    </span>
                    <span className="text-lg font-medium text-emerald-600">
                      {formatPrice(0, currency, { decimals: 0 })}
                    </span>
                  </div>
                ) : (
                  <span className="text-lg font-medium text-gray-900">
                    {showFromPrice && (
                      <span className="text-xs font-normal text-gray-400 mr-1">
                        {t('treatmentDetail.fromPrice')}
                      </span>
                    )}
                    {formatPrice(effectivePrice, currency, { decimals: 0 })}
                  </span>
                )}
              </div>
            )}

            {effectiveDuration && (
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 block mb-0.5">
                  {t('treatmentDetail.duration')}
                </span>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-lg font-medium text-gray-900">
                    {effectiveDuration} min
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Variant selector */}
          {hasMultipleVariants && treatment.variants && (
            <div className="mb-5 w-full">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-3 text-center">
                {t('treatmentDetail.selectDuration')}
              </p>
              <VariantListSelector
                variants={treatment.variants}
                selectedVariantId={selectedVariant?.id || null}
                onSelect={(variant) => setSelectedVariant(variant as TreatmentVariantData)}
                currency={currency}
                isOffert={isOffert}
                isCompanyOffered={isCompanyOffered}
              />
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom CTA */}
      <div className="sticky bottom-0 left-0 right-0 px-4 py-4 bg-gradient-to-t from-white via-white to-transparent pb-safe z-30">
        <Button
          onClick={handleBook}
          disabled={added}
          className={cn(
            "w-full h-14 text-base font-medium tracking-wide shadow-lg transition-all duration-300",
            added
              ? "bg-emerald-500 text-white hover:bg-emerald-500"
              : "bg-gold-400 text-black hover:bg-gold-200"
          )}
        >
          <HandHeart className="mr-2 h-5 w-5" />
          {added ? t('menu.added') : t('treatmentDetail.bookThisTreatment')}
        </Button>
      </div>

      {/* On Request Drawer */}
      <OnRequestFormDrawer
        open={isOnRequestOpen}
        onOpenChange={setIsOnRequestOpen}
        hotelId={hotelId}
        treatment={treatment ? {
          id: treatment.id,
          name: localize(treatment.name, treatment.name_en),
          description: localize(treatment.description, treatment.description_en),
          image: treatment.image,
          category: treatment.category,
        } : null}
      />
    </div>
  );
}
