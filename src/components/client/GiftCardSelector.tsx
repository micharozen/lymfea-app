import { useTranslation } from 'react-i18next';
import { Gift, Repeat, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { SessionBundle, AmountBundle } from './GiftCardLoginModal';
import type { SelectedBundle } from '@/pages/client/context/FlowContext';

interface GiftCardSelectorProps {
  sessionBundles: SessionBundle[];
  amountBundles: AmountBundle[];
  bookingTotalCents: number;
  onSelect: (bundle: SelectedBundle) => void;
}

export function GiftCardSelector({
  sessionBundles,
  amountBundles,
  bookingTotalCents,
  onSelect,
}: GiftCardSelectorProps) {
  const { t, i18n } = useTranslation('client');
  const dateLocale = i18n.language === 'fr' ? fr : enUS;

  const allEmpty = sessionBundles.length === 0 && amountBundles.length === 0;

  if (allEmpty) {
    return (
      <div className="text-center py-6">
        <Gift className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-400">{t('giftCardLogin.noBundles')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">{t('giftCardLogin.selectCard')}</p>

      {sessionBundles.map((bundle) => {
        const name = i18n.language === 'en' && bundle.bundle_name_en
          ? bundle.bundle_name_en
          : bundle.bundle_name;
        const isCure = bundle.bundle_type === 'cure';

        return (
          <button
            key={bundle.customer_bundle_id}
            type="button"
            onClick={() =>
              onSelect({
                customerBundleId: bundle.customer_bundle_id,
                bundleName: name,
                bundleType: bundle.bundle_type,
                remainingSessions: bundle.remaining_sessions,
                eligibleTreatmentIds: bundle.eligible_treatment_ids,
              })
            }
            className="w-full p-4 rounded-xl border border-gray-200 bg-white hover:border-gray-400 transition-all text-left"
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
                isCure ? "bg-blue-50" : "bg-rose-50"
              )}>
                {isCure
                  ? <Repeat className="w-4 h-4 text-blue-600" />
                  : <Gift className="w-4 h-4 text-rose-500" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {bundle.remaining_sessions} {bundle.remaining_sessions > 1
                    ? t('bundle.remaining_plural', { count: bundle.remaining_sessions })
                    : t('bundle.remaining', { count: bundle.remaining_sessions })}
                </p>
                <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {t('bundle.validUntil', {
                    date: format(new Date(bundle.expires_at), 'd MMM yyyy', { locale: dateLocale }),
                  })}
                </p>
              </div>
            </div>
          </button>
        );
      })}

      {amountBundles.map((bundle) => {
        const name = i18n.language === 'en' && bundle.bundle_name_en
          ? bundle.bundle_name_en
          : bundle.bundle_name;
        const remainingEuros = Math.round(bundle.remaining_amount_cents / 100);
        const amountToUse = Math.min(bundle.remaining_amount_cents, bookingTotalCents);

        return (
          <button
            key={bundle.customer_bundle_id}
            type="button"
            onClick={() =>
              onSelect({
                customerBundleId: bundle.customer_bundle_id,
                bundleName: name,
                bundleType: 'gift_amount',
                remainingAmountCents: bundle.remaining_amount_cents,
                amountToUseCents: amountToUse,
              })
            }
            className="w-full p-4 rounded-xl border border-gray-200 bg-white hover:border-gray-400 transition-all text-left"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                <Gift className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {t('giftCardLogin.giftCard')} — {name}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('giftCardLogin.creditAvailable', { amount: remainingEuros })}
                </p>
                <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {t('bundle.validUntil', {
                    date: format(new Date(bundle.expires_at), 'd MMM yyyy', { locale: dateLocale }),
                  })}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
