import { useTranslation } from 'react-i18next';
import { Repeat, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useLocalizedField } from '@/hooks/useLocalizedField';
import type { ActiveBundle } from '@/pages/client/hooks/useBundleDetection';
import type { SelectedBundle } from '@/pages/client/context/FlowContext';

interface BundleDetectionBannerProps {
  bundles: ActiveBundle[];
  onSelectBundle: (bundle: SelectedBundle) => void;
  onDismiss: () => void;
}

export function BundleDetectionBanner({ bundles, onSelectBundle, onDismiss }: BundleDetectionBannerProps) {
  const { t, i18n } = useTranslation('client');
  const localize = useLocalizedField();

  if (bundles.length === 0) return null;

  return (
    <Card className="bg-amber-50/80 border-amber-200/60 p-4 space-y-3 animate-fade-in">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Repeat className="w-4 h-4 text-amber-700" />
          </div>
          <p className="text-sm font-medium text-amber-900">
            {t('bundle.detected')}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-amber-400 hover:text-amber-600 transition-colors p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2">
        {bundles.map((bundle) => {
          const name = localize(bundle.bundleName, bundle.bundleNameEn);
          const remaining = bundle.remainingSessions;

          return (
            <div
              key={bundle.customerBundleId}
              className="bg-white/60 rounded-lg p-3 border border-amber-100"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                  <p className="text-xs text-amber-700">
                    {t('bundle.remaining', { count: remaining })}
                    {' '}&middot;{' '}
                    {t('bundle.expires', {
                      date: format(new Date(bundle.expiresAt), 'd MMM yyyy', {
                        locale: i18n.language === 'fr' ? fr : undefined,
                      }),
                    })}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    onSelectBundle({
                      customerBundleId: bundle.customerBundleId,
                      bundleName: name,
                      remainingSessions: remaining,
                      eligibleTreatmentIds: bundle.eligibleTreatmentIds,
                    })
                  }
                  className="shrink-0 bg-amber-600 hover:bg-amber-500 text-white text-xs h-8 px-3"
                >
                  {t('bundle.useBundleSession')}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        className="text-xs text-amber-600 hover:text-amber-800 underline underline-offset-2 transition-colors"
      >
        {t('bundle.skipBundle')}
      </button>
    </Card>
  );
}
