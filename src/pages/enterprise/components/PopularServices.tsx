import { useTranslation } from 'react-i18next';
import type { PopularTreatment } from '../hooks/useEnterpriseDashboard';

interface PopularServicesProps {
  treatments: PopularTreatment[];
}

export function PopularServices({ treatments }: PopularServicesProps) {
  const { t } = useTranslation('client');

  if (!treatments || treatments.length === 0) return null;

  const maxCount = Math.max(...treatments.map(tr => tr.count));

  return (
    <div className="px-4 sm:px-6 py-6 border-t border-gray-100">
      <div className="max-w-2xl mx-auto">
        <h2 className="font-serif text-lg text-gray-900 mb-4">
          {t('enterpriseDashboard.popularServices.title')}
        </h2>

        <div className="space-y-3">
          {treatments.map((treatment, idx) => (
            <div key={treatment.name} className="flex items-center gap-3">
              {/* Rank */}
              <span className="w-5 text-right text-sm font-light text-gray-300">
                {idx + 1}
              </span>

              {/* Bar + Label */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {treatment.name}
                  </span>
                  <span className="text-xs text-gray-400 font-light ml-2 flex-shrink-0">
                    {treatment.count} {t('enterpriseDashboard.popularServices.bookings')}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gold-400 rounded-full transition-all duration-500"
                    style={{ width: `${(treatment.count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
