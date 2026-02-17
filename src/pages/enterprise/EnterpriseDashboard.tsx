import { useState, useMemo, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { useEnterpriseDashboard, useAvailableDates } from './hooks/useEnterpriseDashboard';
import { useVenueDefaultLanguage } from '@/hooks/useVenueDefaultLanguage';
import { DashboardHero } from './components/DashboardHero';
import { SessionSelector } from './components/SessionSelector';
import { SessionMetrics } from './components/SessionMetrics';
import { DayTimeline } from './components/DayTimeline';
import { PopularServices } from './components/PopularServices';
import { DashboardFooter } from './components/DashboardFooter';
import { DashboardSkeleton } from './components/DashboardSkeleton';
import { AlertCircle, CalendarOff } from 'lucide-react';

export default function EnterpriseDashboard() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation('client');
  const today = useMemo(() => new Date(), []);
  const urlDate = searchParams.get('date');

  // Auto-detect language based on venue country (FR for France/Belgium/etc, EN otherwise)
  useVenueDefaultLanguage(hotelId);

  // Fetch available dates (180 days past + future)
  const { data: availableDates = [], isLoading: isDatesLoading } = useAvailableDates(hotelId, today);

  // Find closest date to today from available dates (or use URL date if provided)
  const initialDate = useMemo(() => {
    // If a date is provided via URL query param, use it directly
    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) return urlDate;

    if (availableDates.length === 0) return format(today, 'yyyy-MM-dd');
    const todayStr = format(today, 'yyyy-MM-dd');

    // Find the closest date to today (prefer today or next future date, else latest past)
    const futureOrToday = availableDates.filter(d => d >= todayStr);
    if (futureOrToday.length > 0) return futureOrToday[0];

    // All dates are in the past, pick the most recent
    return availableDates[availableDates.length - 1];
  }, [availableDates, today, urlDate]);

  const [selectedDate, setSelectedDate] = useState<string>('');

  // Set initial date once available dates load
  useEffect(() => {
    if (initialDate && !selectedDate) {
      setSelectedDate(initialDate);
    }
  }, [initialDate, selectedDate]);

  // Fetch session data for selected date
  const {
    data: dashboardData,
    isLoading: isSessionLoading,
    error: sessionError,
  } = useEnterpriseDashboard(hotelId, selectedDate);

  const isLoading = isDatesLoading || (isSessionLoading && !dashboardData);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  // Hotel not found
  if (sessionError?.message === 'hotel_not_found' || (!dashboardData && !isSessionLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-6">
        <div className="text-center max-w-sm">
          <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h1 className="font-serif text-xl text-gray-900 mb-2">
            {t('enterpriseDashboard.error.notFound')}
          </h1>
          <p className="text-sm text-gray-500 font-light">
            {t('enterpriseDashboard.error.notFoundDesc')}
          </p>
        </div>
      </div>
    );
  }

  const hotel = dashboardData?.hotel;
  const session = dashboardData?.session;
  const isDeployed = dashboardData?.is_deployed;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Hero */}
      {hotel && <DashboardHero hotel={hotel} />}

      {/* Session Selector */}
      {availableDates.length > 0 && selectedDate && (
        <SessionSelector
          currentDate={selectedDate}
          availableDates={availableDates}
          onDateChange={setSelectedDate}
        />
      )}

      {/* No sessions available */}
      {availableDates.length === 0 && !isDatesLoading && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <CalendarOff className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 font-light">
              {t('enterpriseDashboard.sessionSelector.noSessions')}
            </p>
          </div>
        </div>
      )}

      {/* Session content */}
      {isDeployed && session && (
        <>
          <SessionMetrics session={session} />

          <DayTimeline
            openingTime={hotel?.opening_time || '06:00'}
            closingTime={hotel?.closing_time || '23:00'}
            slotInterval={hotel?.slot_interval || 30}
            bookings={session.bookings}
            blockedSlots={session.blocked_slots}
          />

          <PopularServices treatments={session.popular_treatments} />
        </>
      )}

      {/* Not deployed on selected date */}
      {!isDeployed && selectedDate && !isSessionLoading && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <CalendarOff className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 font-light">
              {t('enterpriseDashboard.error.notDeployed')}
            </p>
          </div>
        </div>
      )}

      <DashboardFooter />
    </div>
  );
}
