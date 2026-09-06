import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { usePortalData, portalBookableVenues, type PortalBooking } from '@/hooks/portal/usePortalData';
import { BookTreatmentCta } from '@/components/portal/BookTreatmentCta';

const statusKind = (status: string) => {
  if (status === 'confirmed') return 'ok';
  if (status === 'pending') return 'due';
  if (status === 'cancelled' || status === 'no_show') return 'warn';
  return 'info';
};

export default function PortalBookings() {
  const { t, i18n } = useTranslation('client');
  const dateLocale = i18n.language === 'fr' ? fr : enUS;
  const { data, isLoading } = usePortalData();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 px-4 pt-2">
        <div className="sk h-8 w-40" />
        <div className="sk h-24" />
        <div className="sk h-24" />
      </div>
    );
  }

  const upcoming = data?.upcoming_bookings ?? [];
  const past = data?.past_bookings ?? [];
  const venues = portalBookableVenues(data);

  const renderBooking = (booking: PortalBooking) => {
    const first = booking.treatments?.[0];
    const name = first
      ? (i18n.language === 'en' && first.name_en ? first.name_en : first.name)
      : t('portal.treatment');
    const extra = (booking.treatments?.length ?? 0) - 1;

    return (
      <div className="bk-row" key={booking.id}>
        <div className="bk-time">
          <div className="h">{booking.booking_time?.slice(0, 5) ?? '—'}</div>
          <div className="d">{format(new Date(booking.booking_date), 'd MMM', { locale: dateLocale })}</div>
        </div>
        <div className="bk-main">
          <div className="who">
            {name}
            {extra > 0 && <span className="num"> +{extra}</span>}
          </div>
          {booking.hotel_name && <div className="what">{booking.hotel_name}</div>}
          <div className="meta">
            {format(new Date(booking.booking_date), 'EEEE d MMMM yyyy', { locale: dateLocale })}
          </div>
        </div>
        <div className="bk-right">
          {booking.total_price != null && <div className="price">{booking.total_price} €</div>}
          <div className="bk-status">
            <span className={`status ${statusKind(booking.status)}`}>
              <span className="dot" />
              {t(`portal.status.${booking.status}`, booking.status)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="pb-6">
      <div className="greeting">
        <h1>{t('portal.bookingsTitle')}</h1>
      </div>

      {upcoming.length === 0 && past.length === 0 && (
        <div className="placeholder">
          <CalendarDays size={28} />
          <p>{t('portal.noBookings')}</p>
        </div>
      )}

      <BookTreatmentCta venues={venues} />

      {upcoming.length > 0 && (
        <>
          <div className="sec-label">
            {t('portal.upcomingBookings')} <span className="count">{upcoming.length}</span>
          </div>
          {upcoming.map(renderBooking)}
        </>
      )}

      {past.length > 0 && (
        <>
          <div className="sec-label">{t('portal.pastBookings')}</div>
          {past.map(renderBooking)}
        </>
      )}
    </div>
  );
}
