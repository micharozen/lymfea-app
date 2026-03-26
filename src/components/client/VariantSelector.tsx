import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatPrice';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';

export interface TreatmentVariant {
  id: string;
  label: string | null;
  duration: number;
  price: number | null;
  price_on_request: boolean;
  is_default: boolean;
  sort_order: number;
}

interface VariantSelectorProps {
  variants: TreatmentVariant[];
  selectedVariantId: string | null;
  onSelect: (variant: TreatmentVariant) => void;
  currency: string;
  isOffert?: boolean;
  isCompanyOffered?: boolean;
}

export function VariantSelector({
  variants,
  selectedVariantId,
  onSelect,
  currency,
  isOffert,
  isCompanyOffered,
}: VariantSelectorProps) {
  const { t } = useTranslation('client');

  return (
    <div className="flex flex-wrap gap-2 py-3">
      {[...variants].sort((a, b) => a.duration - b.duration).map((variant) => {
        const isSelected = variant.id === selectedVariantId;
        return (
          <button
            key={variant.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(variant);
            }}
            className={cn(
              "relative flex flex-col items-center px-4 py-2.5 rounded-lg border-2 transition-all duration-200 min-w-[80px]",
              isSelected
                ? "border-gold-500 bg-gold-50 shadow-sm"
                : "border-gray-200 bg-white hover:border-gray-300"
            )}
          >
            {isSelected && (
              <span className="absolute -top-1.5 -right-1.5 bg-gold-600 rounded-full p-0.5">
                <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
              </span>
            )}
            <span
              className={cn(
                "text-sm font-medium",
                isSelected ? "text-gold-600" : "text-gray-700"
              )}
            >
              {variant.label ? `${variant.label} min` : `${variant.duration} min`}
            </span>
            {!isCompanyOffered && (
              <span
                className={cn(
                  "text-xs mt-0.5",
                  isSelected ? "text-gold-600" : "text-gray-400"
                )}
              >
                {variant.price_on_request
                  ? t('payment.onQuote')
                  : isOffert
                    ? formatPrice(0, currency, { decimals: 0 })
                    : formatPrice(variant.price, currency, { decimals: 0 })}
              </span>
            )}
            {variant.is_default && (
              <span className="text-[9px] uppercase tracking-wider text-gold-600 bg-gold-50 border border-gold-200 rounded-full px-1.5 py-0.5 mt-1 font-medium">
                {t('menu.popular')}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
