import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Gift, CalendarDays, ArrowRight, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface PortalData {
  customer: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  };
  gift_cards: GiftCard[];
  upcoming_bookings: Booking[];
  past_bookings: Booking[];
}

interface GiftCard {
  id: string;
  bundle_type: string;
  bundle_name: string;
  bundle_name_en: string | null;
  total_sessions: number | null;
  used_sessions: number;
  total_amount_cents: number | null;
  used_amount_cents: number;
  status: string;
  expires_at: string;
  hotel_name: string | null;
}

interface Booking {
  id: string;
  booking_date: string;
  booking_time: string | null;
  status: string;
  total_price: number | null;
  duration: number | null;
  hotel_name: string | null;
  treatments: { name: string; name_en: string | null }[] | null;
}

export default function PortalDashboard() {
  const { t, i18n } = useTranslation('client');
  const dateLocale = i18n.language === 'fr' ? fr : enUS;

  const { data, isLoading } = useQuery<PortalData>({
    queryKey: ['portal-data'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_customer_portal_data');
      if (error) throw error;
      return data as unknown as PortalData;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded-lg w-48" />
        <div className="h-32 bg-gray-200 rounded-xl" />
        <div className="h-24 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const activeCards = data.gift_cards.filter((c) => c.status === 'active');
  const totalCreditCents = activeCards
    .filter((c) => c.bundle_type === 'gift_amount')
    .reduce((sum, c) => sum + (c.total_amount_cents ?? 0) - c.used_amount_cents, 0);

  const totalSessions = activeCards
    .filter((c) => c.bundle_type !== 'gift_amount')
    .reduce((sum, c) => sum + (c.total_sessions ?? 0) - c.used_sessions, 0);

  return (
    <div className="space-y-6 py-2">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-serif text-gray-900">
          {t('portal.greeting', { name: data.customer.first_name || '' })}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{t('portal.dashboardSubtitle')}</p>
      </div>

      {/* Credit summary */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-medium text-gray-700">{t('portal.yourCredit')}</span>
        </div>
        <div className="flex items-baseline gap-6">
          {totalCreditCents > 0 && (
            <div>
              <span className="text-3xl font-serif font-light text-gray-900">
                {Math.round(totalCreditCents / 100)}
              </span>
              <span className="text-lg text-gray-400 ml-1">€</span>
            </div>
          )}
          {totalSessions > 0 && (
            <div>
              <span className="text-3xl font-serif font-light text-gray-900">
                {totalSessions}
              </span>
              <span className="text-sm text-gray-400 ml-1">
                {totalSessions > 1 ? t('portal.sessionsLeft') : t('portal.sessionLeft')}
              </span>
            </div>
          )}
          {totalCreditCents === 0 && totalSessions === 0 && (
            <p className="text-sm text-gray-400">{t('portal.noCredit')}</p>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/portal/gift-cards"
          className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-2"
        >
          <Gift className="w-5 h-5 text-rose-500" />
          <span className="text-sm font-medium text-gray-900">{t('portal.nav.giftCards')}</span>
          <span className="text-xs text-gray-400">
            {activeCards.length} {t('portal.active')}
          </span>
        </Link>
        <Link
          to="/portal/bookings"
          className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-2"
        >
          <CalendarDays className="w-5 h-5 text-blue-500" />
          <span className="text-sm font-medium text-gray-900">{t('portal.nav.bookings')}</span>
          <span className="text-xs text-gray-400">
            {data.upcoming_bookings.length} {t('portal.upcoming')}
          </span>
        </Link>
      </div>

      {/* Upcoming bookings preview */}
      {data.upcoming_bookings.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-700">{t('portal.nextBookings')}</h2>
            <Link to="/portal/bookings" className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              {t('portal.seeAll')} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {data.upcoming_bookings.slice(0, 3).map((booking) => {
              const treatmentName = booking.treatments?.[0]
                ? (i18n.language === 'en' && booking.treatments[0].name_en
                  ? booking.treatments[0].name_en
                  : booking.treatments[0].name)
                : null;

              return (
                <div
                  key={booking.id}
                  className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {treatmentName || t('portal.treatment')}
                        {booking.treatments && booking.treatments.length > 1 && (
                          <span className="text-gray-400"> +{booking.treatments.length - 1}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {format(new Date(booking.booking_date), 'EEEE d MMMM', { locale: dateLocale })}
                        {booking.booking_time && ` · ${booking.booking_time.slice(0, 5)}`}
                      </p>
                      {booking.hotel_name && (
                        <p className="text-xs text-gray-400 mt-0.5">{booking.hotel_name}</p>
                      )}
                    </div>
                    <span className={cn(
                      "text-[10px] font-medium px-2 py-0.5 rounded-full",
                      booking.status === 'confirmed' ? "bg-green-50 text-green-700" :
                      booking.status === 'pending' ? "bg-amber-50 text-amber-700" :
                      "bg-gray-100 text-gray-500"
                    )}>
                      {t(`portal.status.${booking.status}`, booking.status)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
