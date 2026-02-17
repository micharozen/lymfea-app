import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatPrice';
import { useScrollReveal } from '@/hooks/useScrollReveal';

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

interface BestsellerSectionProps {
  treatments: (Treatment & { service_for: string; is_bestseller?: boolean })[];
  onAddToBasket: (treatment: Treatment) => void;
  getItemQuantity: (id: string) => number;
  onUpdateQuantity: (id: string, quantity: number) => void;
  isOffert?: boolean;
  isCompanyOffered?: boolean;
}

export function BestsellerSection({
  treatments,
  onAddToBasket,
  getItemQuantity,
  onUpdateQuantity,
  isOffert = false,
  isCompanyOffered = false,
}: BestsellerSectionProps) {
  const { t } = useTranslation('client');
  const reveal = useScrollReveal();

  const bestsellerTreatments = useMemo(() => {
    const flagged = treatments.filter(t => t.is_bestseller);
    if (flagged.length === 0) return [];

    // Try to get 2 women + 1 man
    const women = flagged.filter(t => t.service_for === 'Female' || t.service_for === 'All');
    const men = flagged.filter(t => t.service_for === 'Male' || t.service_for === 'All');

    const result: typeof flagged = [];

    // Pick up to 2 women
    result.push(...women.slice(0, 2));

    // Pick 1 man (avoid duplicates if service_for === 'All')
    const remainingMen = men.filter(m => !result.some(r => r.id === m.id));
    if (remainingMen.length > 0) {
      result.push(remainingMen[0]);
    }

    // If we still have fewer than 3, fill from remaining flagged
    if (result.length < 3) {
      const remaining = flagged.filter(f => !result.some(r => r.id === f.id));
      result.push(...remaining.slice(0, 3 - result.length));
    }

    return result.slice(0, 3);
  }, [treatments]);

  if (bestsellerTreatments.length === 0) return null;

  return (
    <div
      ref={reveal.ref}
      className={cn('scroll-reveal', reveal.isVisible && 'visible')}
    >
      {/* Section Header */}
      <div className="px-5 pt-6 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-3.5 h-3.5 text-gold-400" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-gold-400 font-semibold">
            {t('menu.bestsellers')}
          </span>
        </div>
        <p className="text-xs text-gray-400 font-light">
          {t('menu.bestsellersSubtitle')}
        </p>
      </div>

      {/* Cards Grid - 3 columns */}
      <div className="grid grid-cols-3 gap-2 px-4 pb-5">
        {bestsellerTreatments.map((treatment, i) => {
          const quantity = getItemQuantity(treatment.id);

          return (
            <div
              key={treatment.id}
              className="bg-gray-50/80 border border-gray-100 rounded-none overflow-hidden animate-slide-up-fade cursor-pointer active:bg-gray-100/80 transition-colors"
              style={{ animationDelay: `${i * 0.1}s` }}
              onClick={() => onAddToBasket(treatment)}
            >
              {/* Image area — compact */}
              <div className="aspect-[4/3] bg-gradient-to-br from-gray-100 to-gray-50 relative overflow-hidden">
                {treatment.image ? (
                  <img
                    src={treatment.image}
                    alt={treatment.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-gray-200" />
                  </div>
                )}
                {/* Gender badge */}
                <span className="absolute top-1 left-1 text-[7px] uppercase tracking-[0.1em] px-1 py-0.5 bg-white/90 backdrop-blur-sm text-gray-500 font-medium">
                  {treatment.service_for === 'Male' ? t('menu.forMen') : t('menu.forWomen')}
                </span>
              </div>

              {/* Card body — compact */}
              <div className="p-2">
                <p className="text-[7px] uppercase tracking-[0.1em] text-gold-400 font-medium mb-0.5">
                  {t(`menu.categories.${treatment.category}`, treatment.category)}
                </p>
                <h3 className="font-serif text-[11px] sm:text-xs text-gray-900 font-medium leading-tight mb-1.5 line-clamp-2">
                  {treatment.name}
                </h3>

                {isCompanyOffered ? (
                  treatment.duration ? (
                    <span className="text-[8px] text-gray-400 font-light">
                      {treatment.duration} min
                    </span>
                  ) : null
                ) : isOffert ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-[8px] text-gray-400 line-through font-light">
                      {treatment.price_on_request ? t('payment.onQuote') : formatPrice(treatment.price, treatment.currency || 'EUR', { decimals: 0 })}
                    </span>
                    <span className="text-xs font-medium text-emerald-600">
                      {formatPrice(0, treatment.currency || 'EUR', { decimals: 0 })}
                    </span>
                  </div>
                ) : treatment.price_on_request ? (
                  <Badge className="text-[8px] px-1 py-0.5 bg-gray-100 text-gold-600 border-gold-300/30 font-medium">
                    {t('payment.onQuote')}
                  </Badge>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs font-light text-gray-700">
                      {formatPrice(treatment.price, treatment.currency || 'EUR', { decimals: 0 })}
                    </span>
                    {treatment.duration && (
                      <span className="text-[8px] text-gray-400 font-light">
                        {treatment.duration}'
                      </span>
                    )}
                  </div>
                )}

                {/* Add button or quantity */}
                <div className="mt-2">
                  {quantity > 0 ? (
                    <div className="flex items-center justify-between bg-gray-100 rounded-none p-0.5 border border-gray-200">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-none hover:bg-gray-200 text-gray-500 hover:text-gray-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateQuantity(treatment.id, quantity - 1);
                          if (navigator.vibrate) navigator.vibrate(30);
                        }}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="text-center font-medium text-xs text-gold-400">
                        {quantity}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-none bg-gold-400 text-black hover:bg-gold-300"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToBasket(treatment);
                        }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddToBasket(treatment);
                      }}
                      className="w-full h-6 text-[8px] uppercase tracking-[0.15em] bg-gold-400 text-black hover:bg-gold-300 font-bold border-none"
                    >
                      {t('menu.add')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Separator */}
      <div className="border-b border-gray-200" />
    </div>
  );
}
