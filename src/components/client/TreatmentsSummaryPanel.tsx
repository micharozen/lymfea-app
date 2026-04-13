import { useTranslation } from 'react-i18next';
import { Minus, Plus, Trash2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBasket } from '@/pages/client/context/CartContext';
import { formatPrice } from '@/lib/formatPrice';
import { cn } from '@/lib/utils';

interface VenueSummary {
  name?: string | null;
  name_en?: string | null;
  image?: string | null;
  cover_image?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
}

interface TreatmentsSummaryPanelProps {
  hotel: VenueSummary | null | undefined;
  displayName: string;
  isOffert?: boolean;
  isCompanyOffered?: boolean;
  onContinue: () => void;
  className?: string;
}

export function TreatmentsSummaryPanel({
  hotel,
  displayName,
  isOffert = false,
  isCompanyOffered = false,
  onContinue,
  className,
}: TreatmentsSummaryPanelProps) {
  const { items, total, updateQuantity, removeItem } = useBasket();
  const { t } = useTranslation('client');

  const thumbnail = hotel?.image || hotel?.cover_image || null;
  const addressLine = [hotel?.address, hotel?.postal_code, hotel?.city]
    .filter(Boolean)
    .join(', ');
  const mapsQuery = encodeURIComponent(
    [hotel?.name, hotel?.address, hotel?.city].filter(Boolean).join(', '),
  );
  const mapsUrl = mapsQuery
    ? `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`
    : null;
  const isEmpty = items.length === 0;
  const currency = items[0]?.currency || 'EUR';

  return (
    <aside
      className={cn(
        'w-[380px] shrink-0 rounded-2xl border border-gray-200 bg-white shadow-sm flex flex-col overflow-hidden',
        className,
      )}
    >
      {/* Venue header */}
      <div className="flex items-start gap-3 p-4 border-b border-gray-100">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={displayName}
            className="h-14 w-14 rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="h-14 w-14 rounded-lg bg-gray-100 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-base text-gray-900 leading-tight truncate">
            {displayName}
          </h2>
          {addressLine && (
            mapsUrl ? (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex items-start gap-1 text-xs text-gray-500 font-light leading-snug hover:text-gold-600 transition-colors"
              >
                <MapPin className="h-3 w-3 mt-0.5 shrink-0 text-gray-400" />
                <span className="line-clamp-2 underline decoration-gray-300 underline-offset-2">
                  {addressLine}
                </span>
              </a>
            ) : (
              <div className="mt-1 flex items-start gap-1 text-xs text-gray-500 font-light leading-snug">
                <MapPin className="h-3 w-3 mt-0.5 shrink-0 text-gray-400" />
                <span className="line-clamp-2">{addressLine}</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 min-h-[120px] max-h-[420px] overflow-y-auto">
        {isEmpty ? (
          <div className="flex items-center justify-center h-full px-6 py-10 text-center">
            <p className="text-sm text-gray-400 font-light">
              {t('basket.emptyShort')}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((item) => {
              const cartKey = item.variantId ? `${item.id}__${item.variantId}` : item.id;
              return (
                <li key={cartKey} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 leading-tight">
                        {item.name}
                        {item.variantLabel && (
                          <span className="text-gray-500 font-normal"> — {item.variantLabel}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {item.category} · {item.duration} min
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(item.id, item.variantId)}
                      className="h-8 w-8 text-gray-300 hover:text-red-500 hover:bg-red-50 shrink-0"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1 bg-gray-100 rounded-md p-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => updateQuantity(item.id, item.quantity - 1, item.variantId)}
                        className="h-7 w-7 hover:bg-gray-200 text-gray-500"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-6 text-center font-medium text-sm text-gray-900">
                        {item.quantity}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => updateQuantity(item.id, item.quantity + 1, item.variantId)}
                        className="h-7 w-7 bg-gold-400 text-black hover:bg-gold-200"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      {isCompanyOffered ? (
                        <span className="text-xs text-gray-400 font-light">
                          {item.duration} min
                        </span>
                      ) : isOffert ? (
                        <span className="inline-flex items-baseline gap-1">
                          <span className="text-xs text-gray-400 line-through font-light">
                            {item.isPriceOnRequest
                              ? t('payment.onQuote')
                              : formatPrice(item.price * item.quantity, item.currency || 'EUR', { decimals: 0 })}
                          </span>
                          <span className="text-sm font-medium text-emerald-600">
                            {formatPrice(0, item.currency || 'EUR', { decimals: 0 })}
                          </span>
                        </span>
                      ) : item.isPriceOnRequest ? (
                        t('payment.onQuote')
                      ) : (
                        formatPrice(item.price * item.quantity, item.currency || 'EUR', { decimals: 0 })
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Total + CTA */}
      <div className="border-t border-gray-100 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-500">{t('checkout.total')}</span>
          <span className="text-base font-semibold text-gray-900">
            {isCompanyOffered || total === 0 ? (
              <span className="text-gray-400 font-light">{t('basket.free')}</span>
            ) : isOffert ? (
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-xs text-gray-400 line-through font-light">
                  {formatPrice(total, currency, { decimals: 0 })}
                </span>
                <span className="text-base font-semibold text-emerald-600">
                  {formatPrice(0, currency, { decimals: 0 })}
                </span>
              </span>
            ) : (
              formatPrice(total, currency, { decimals: 0 })
            )}
          </span>
        </div>
        <Button
          onClick={onContinue}
          disabled={isEmpty}
          className={cn(
            'w-full h-12 rounded-full font-medium tracking-wide transition-all',
            isEmpty
              ? 'bg-gray-200 text-gray-400 hover:bg-gray-200 cursor-not-allowed'
              : 'bg-gold-400 text-black hover:bg-gold-200 shadow-sm',
          )}
        >
          {t('basket.continue')}
        </Button>
      </div>
    </aside>
  );
}
