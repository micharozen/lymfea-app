import { useTranslation } from 'react-i18next';
import { CalendarCheck, Users, TrendingUp } from 'lucide-react';
import type { SessionData } from '../hooks/useEnterpriseDashboard';

interface SessionMetricsProps {
  session: SessionData;
}

export function SessionMetrics({ session }: SessionMetricsProps) {
  const { t } = useTranslation('client');

  const fillRate = session.total_slots > 0
    ? Math.round((session.booked_units / session.total_slots) * 100)
    : 0;

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="grid grid-cols-3 gap-3 max-w-2xl mx-auto">
        {/* Available Slots */}
        <div className="bg-white rounded-lg border border-gray-100 p-4 text-center animate-slide-up-fade" style={{ animationDelay: '0.1s' }}>
          <div className="flex justify-center mb-2">
            <CalendarCheck className="h-5 w-5 text-gold-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-semibold text-gray-900 font-grotesk">
            {session.booked_count}
            <span className="text-sm font-light text-gray-400">/{session.total_slots}</span>
          </p>
          <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 mt-1 font-medium">
            {t('enterpriseDashboard.metrics.bookedSlots')}
          </p>
        </div>

        {/* Fill Rate */}
        <div className="bg-white rounded-lg border border-gray-100 p-4 text-center animate-slide-up-fade" style={{ animationDelay: '0.2s' }}>
          <div className="flex justify-center mb-2">
            <TrendingUp className="h-5 w-5 text-gold-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-semibold text-gold-500 font-grotesk">
            {fillRate}%
          </p>
          <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 mt-1 font-medium">
            {t('enterpriseDashboard.metrics.fillRate')}
          </p>
        </div>

        {/* Unique Clients */}
        <div className="bg-white rounded-lg border border-gray-100 p-4 text-center animate-slide-up-fade" style={{ animationDelay: '0.3s' }}>
          <div className="flex justify-center mb-2">
            <Users className="h-5 w-5 text-gold-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-semibold text-gray-900 font-grotesk">
            {session.unique_clients}
          </p>
          <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 mt-1 font-medium">
            {t('enterpriseDashboard.metrics.uniqueClients')}
          </p>
        </div>
      </div>
    </div>
  );
}
