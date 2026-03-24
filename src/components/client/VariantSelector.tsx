import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatPrice';
import { useTranslation } from 'react-i18next';

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
      {variants.map((variant) => {
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
              "flex flex-col items-center px-4 py-2.5 rounded-lg border-2 transition-all duration-200 min-w-[80px]",
              isSelected
                ? "border-gold-400 bg-gold-50 shadow-sm"
                : "border-gray-200 bg-white hover:border-gray-300"
            )}
          >
            <span
              className={cn(
                "text-sm font-medium",
                isSelected ? "text-gold-600" : "text-gray-700"
              )}
            >
              {variant.label || `${variant.duration} min`}
            </span>
            {!isCompanyOffered && (
              <span
                className={cn(
                  "text-xs mt-0.5",
                  isSelected ? "text-gold-500" : "text-gray-400"
                )}
              >
                {variant.price_on_request
                  ? t('payment.onQuote')
                  : isOffert
                    ? formatPrice(0, currency, { decimals: 0 })
                    : formatPrice(variant.price, currency, { decimals: 0 })}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
