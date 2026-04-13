import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatPrice';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { useLocalizedField } from '@/hooks/useLocalizedField';

export interface TreatmentVariant {
  id: string;
  label: string | null;
  label_en?: string | null;
  duration: number;
  price: number | null;
  price_on_request: boolean;
  is_default: boolean;
  sort_order: number;
}

interface VariantListSelectorProps {
  variants: TreatmentVariant[];
  selectedVariantId: string | null;
  onSelect: (variant: TreatmentVariant) => void;
  currency: string;
  isOffert?: boolean;
  isCompanyOffered?: boolean;
}

export function VariantListSelector({
  variants,
  selectedVariantId,
  onSelect,
  currency,
  isOffert,
  isCompanyOffered,
}: VariantListSelectorProps) {
  const { t } = useTranslation('client');
  const localize = useLocalizedField();

  const sorted = [...variants].sort((a, b) => a.duration - b.duration);

  return (
    <div className="flex flex-col gap-2 w-full">
      {sorted.map((variant) => {
        const isSelected = variant.id === selectedVariantId;
        const customLabel = localize(variant.label, variant.label_en ?? null);

        return (
          <button
            key={variant.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(variant);
            }}
            className={cn(
              'w-full flex items-center justify-between gap-4 px-4 py-4 rounded-xl border-2 text-left transition-all duration-200',
              isSelected
                ? 'border-gold-500 bg-gold-50 shadow-sm'
                : 'border-gray-200 bg-white hover:border-gray-300'
            )}
          >
            <div className="flex flex-col min-w-0">
              <span
                className={cn(
                  'text-sm font-medium',
                  isSelected ? 'text-gold-700' : 'text-gray-900'
                )}
              >
                {variant.duration} {t('treatmentDetail.minutes', { defaultValue: 'minutes' })}
              </span>
              {customLabel && (
                <span className="text-xs text-gray-400 mt-0.5 truncate">
                  {customLabel}
                </span>
              )}
              {variant.is_default && (
                <span className="inline-flex self-start text-[9px] uppercase tracking-wider text-gold-600 bg-gold-50 border border-gold-200 rounded-full px-1.5 py-0.5 mt-1.5 font-medium">
                  {t('menu.popular')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isCompanyOffered && (
                <span
                  className={cn(
                    'text-sm font-medium',
                    isSelected ? 'text-gold-700' : 'text-gray-700'
                  )}
                >
                  {variant.price_on_request
                    ? t('payment.onQuote')
                    : isOffert
                      ? formatPrice(0, currency, { decimals: 0 })
                      : formatPrice(variant.price, currency, { decimals: 0 })}
                </span>
              )}
              {isSelected && (
                <span className="bg-gold-600 rounded-full p-0.5">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
