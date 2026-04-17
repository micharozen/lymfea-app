import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';

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

interface PortalData {
  customer: { id: string };
  gift_cards: unknown[];
  upcoming_bookings: Booking[];
  past_bookings: Booking[];
}

export default function PortalBookings() {
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
      <div className="space-y-4 animate-pulse py-2">
        <div className="h-8 bg-gray-200 rounded-lg w-40" />
        <div className="h-24 bg-gray-200 rounded-xl" />
        <div className="h-24 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  const upcoming = data?.upcoming_bookings ?? [];
  const past = data?.past_bookings ?? [];

  const renderBooking = (booking: Booking) => {
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
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-900">
              {treatmentName || t('portal.treatment')}
              {booking.treatments && booking.treatments.length > 1 && (
                <span className="text-gray-400"> +{booking.treatments.length - 1}</span>
              )}
            </p>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                <span>{format(new Date(booking.booking_date), 'EEEE d MMMM yyyy', { locale: dateLocale })}</span>
              </div>
              {booking.booking_time && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{booking.booking_time.slice(0, 5)}</span>
                </div>
              )}
            </div>
            {booking.hotel_name && (
              <p className="text-xs text-gray-400">{booking.hotel_name}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={cn(
              "text-[10px] font-medium px-2 py-0.5 rounded-full",
              booking.status === 'confirmed' ? "bg-green-50 text-green-700" :
              booking.status === 'pending' ? "bg-amber-50 text-amber-700" :
              booking.status === 'completed' ? "bg-blue-50 text-blue-600" :
              booking.status === 'cancelled' ? "bg-red-50 text-red-500" :
              "bg-gray-100 text-gray-500"
            )}>
              {t(`portal.status.${booking.status}`, booking.status)}
            </span>
            {booking.total_price != null && (
              <span className="text-xs text-gray-400">{booking.total_price} €</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 py-2">
      <h1 className="text-xl font-serif text-gray-900">{t('portal.bookingsTitle')}</h1>

      {upcoming.length === 0 && past.length === 0 && (
        <div className="text-center py-12">
          <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">{t('portal.noBookings')}</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-gray-700">{t('portal.upcomingBookings')}</h2>
          {upcoming.map(renderBooking)}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-gray-400">{t('portal.pastBookings')}</h2>
          {past.map(renderBooking)}
        </div>
      )}
    </div>
  );
}
