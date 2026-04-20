import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatPrice';
import { useLocalizedField } from '@/hooks/useLocalizedField';

export interface TreatmentVariantData {
  id: string;
  label: string | null;
  label_en?: string | null;
  duration: number;
  price: number | null;
  price_on_request: boolean;
  is_default: boolean;
  sort_order: number;
  guest_count?: number;
}

export interface DrawerTreatment {
  id: string;
  name: string;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
  currency: string | null;
  variants?: TreatmentVariantData[];
}

interface TreatmentVariantDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  treatment: DrawerTreatment | null;
  isOffert?: boolean;
  isCompanyOffered?: boolean;
  onConfirm: (variant: TreatmentVariantData) => void;
}

const DESCRIPTION_TRUNCATE = 180;

export function TreatmentVariantDrawer({
  open,
  onOpenChange,
  treatment,
  isOffert,
  isCompanyOffered,
  onConfirm,
}: TreatmentVariantDrawerProps) {
  const { t } = useTranslation('client');
  const localize = useLocalizedField();

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedVariantId(null);
      setDescExpanded(false);
    }
  }, [open, treatment?.id]);

  if (!treatment) return null;

  const currency = treatment.currency || 'EUR';
  const variants = [...(treatment.variants ?? [])].sort(
    (a, b) => (a.guest_count ?? 1) - (b.guest_count ?? 1) || a.duration - b.duration
  );
  const selectedVariant = variants.find((v) => v.id === selectedVariantId) || null;

  const description = localize(treatment.description, treatment.description_en) ?? '';
  const isLongDescription = description.length > DESCRIPTION_TRUNCATE;
  const displayedDescription = !isLongDescription || descExpanded
    ? description
    : `${description.slice(0, DESCRIPTION_TRUNCATE).trimEnd()}…`;

  const formatVariantPrice = (variant: TreatmentVariantData) => {
    if (variant.price_on_request) return t('payment.onQuote');
    if (isCompanyOffered) return null;
    if (isOffert) return formatPrice(0, currency, { decimals: 0 });
    return formatPrice(variant.price, currency, { decimals: 0 });
  };

  const handleConfirm = () => {
    if (!selectedVariant) return;
    onConfirm(selectedVariant);
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="lymfea-client max-h-[90dvh] bg-white flex flex-col font-grotesk text-gray-900">
        <DrawerHeader className="text-left border-b border-gray-100 pb-4 relative">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute top-3 right-4 p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label={t('menu.title')}
          >
            <X className="h-5 w-5" />
          </button>
          <DrawerTitle className="font-serif text-xl sm:text-2xl text-gray-900 font-medium leading-tight pr-8">
            {localize(treatment.name, treatment.name_en)}
          </DrawerTitle>
          {description && (
            <DrawerDescription asChild>
              <div className="text-sm text-gray-500 leading-relaxed font-light mt-2">
                {displayedDescription}
                {isLongDescription && (
                  <button
                    type="button"
                    onClick={() => setDescExpanded((v) => !v)}
                    className="ml-1 text-gold-600 hover:text-gold-700 underline-offset-2 hover:underline font-light"
                  >
                    {descExpanded ? t('menu.readLess') : t('menu.readMore')}
                  </button>
                )}
              </div>
            </DrawerDescription>
          )}
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          <p className="font-serif text-base text-gray-900 font-medium mb-3">
            {t('menu.selectAnOption')} <span className="text-red-500">*</span>
          </p>

          <div className="flex flex-col">
            {variants.map((variant, idx) => {
              const isSelected = variant.id === selectedVariantId;
              const customLabel = localize(variant.label, variant.label_en ?? null);
              const priceLabel = formatVariantPrice(variant);

              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => setSelectedVariantId(variant.id)}
                  className={cn(
                    'w-full flex items-center justify-between gap-4 py-4 text-left transition-colors',
                    idx > 0 && 'border-t border-gray-100'
                  )}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-serif text-base sm:text-lg text-gray-900 font-medium leading-tight">
                      {variant.duration} {t('treatmentDetail.minutes', { defaultValue: 'minutes' })}
                      {(variant.guest_count ?? 1) > 1 && (
                        <span className="text-sm font-light text-gray-500 ml-1.5">
                          · {variant.guest_count} {t('variant.guestShort', { defaultValue: 'pers.' })}
                        </span>
                      )}
                    </span>
                    {customLabel && (
                      <span className="text-xs text-gray-400 mt-0.5 truncate font-light">
                        {customLabel}
                      </span>
                    )}
                    {priceLabel && (
                      <span className="text-sm text-gray-700 mt-1 font-light">{priceLabel}</span>
                    )}
                  </div>

                  <span
                    className={cn(
                      'shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
                      isSelected
                        ? 'border-gold-600 bg-gold-600'
                        : 'border-gray-300 bg-white'
                    )}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="border-t border-gray-100 px-4 pt-4 flex items-center justify-end bg-white"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
        >
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedVariant}
            className={cn(
              'h-11 px-6 rounded-full font-medium tracking-wide transition-colors shrink-0 font-grotesk',
              selectedVariant
                ? 'bg-gold-400 text-black hover:bg-gold-200'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            )}
          >
            {t('menu.add')}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
