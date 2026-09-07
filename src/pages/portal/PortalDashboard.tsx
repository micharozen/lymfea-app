import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronRight, Gift, CalendarDays } from 'lucide-react';
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

export default function PortalDashboard() {
  const { t, i18n } = useTranslation('client');
  const dateLocale = i18n.language === 'fr' ? fr : enUS;
  const { data, isLoading } = usePortalData();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 px-4 pt-2">
        <div className="sk h-8 w-48" />
        <div className="sk h-36" />
        <div className="sk h-24" />
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

  const hasCredit = totalCreditCents > 0 || totalSessions > 0;
  const venues = portalBookableVenues(data);

  const treatmentLabel = (booking: PortalBooking) => {
    const first = booking.treatments?.[0];
    if (!first) return t('portal.treatment');
    const name = i18n.language === 'en' && first.name_en ? first.name_en : first.name;
    const extra = (booking.treatments?.length ?? 0) - 1;
    return extra > 0 ? `${name} +${extra}` : name;
  };

  return (
    <div className="pb-6">
      <div className="greeting">
        <h1>
          {t('portal.greetingPrefix')} <em>{data.customer.first_name || ''}</em>
        </h1>
        <div className="date">{t('portal.dashboardSubtitle')}</div>
      </div>

      {/* Crédit disponible */}
      <div className="hero-card">
        <div className="glow" />
        {hasCredit ? (
          <div className="hero-inner">
            <div className="hero-top">
              <span className="lbl">{t('portal.yourCredit')}</span>
              <span className="in">
                {activeCards.length} {t('portal.active')}
              </span>
            </div>
            <div className="hero-main">
              {totalCreditCents > 0 && (
                <div className="hero-time">
                  {Math.round(totalCreditCents / 100)}
                  <span style={{ fontSize: 20, marginLeft: 2 }}>€</span>
                </div>
              )}
              {totalSessions > 0 && (
                <div className="hero-detail">
                  <div className="who">
                    {totalSessions}{' '}
                    {totalSessions > 1 ? t('portal.sessionsLeft') : t('portal.sessionLeft')}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="hero-empty">
            <div className="t">{t('portal.noCredit')}</div>
            <div className="s">{t('portal.noCreditSubtitle')}</div>
          </div>
        )}
      </div>

      {/* Réserver un soin */}
      <div style={{ marginTop: 'calc(14px * var(--sp))' }}>
        <BookTreatmentCta venues={venues} />
      </div>

      {/* Raccourcis */}
      <Link to="/portal/gift-cards" className="quiet-row">
        <Gift size={19} />
        {t('portal.nav.giftCards')}
        <span className="chev">
          {activeCards.length} <ChevronRight size={16} style={{ display: 'inline', verticalAlign: 'middle' }} />
        </span>
      </Link>
      <Link to="/portal/bookings" className="quiet-row">
        <CalendarDays size={19} />
        {t('portal.nav.bookings')}
        <span className="chev">
          {data.upcoming_bookings.length} <ChevronRight size={16} style={{ display: 'inline', verticalAlign: 'middle' }} />
        </span>
      </Link>

      {/* Prochains soins */}
      {data.upcoming_bookings.length > 0 && (
        <>
          <div className="sec-label">
            {t('portal.nextBookings')}
            <Link to="/portal/bookings" className="sec-action">
              {t('portal.seeAll')}
            </Link>
          </div>
          {data.upcoming_bookings.slice(0, 3).map((booking) => (
              <div className="bk-row" key={booking.id}>
                <div className="bk-time">
                  <div className="h">{booking.booking_time?.slice(0, 5) ?? '—'}</div>
                  <div className="d">
                    {format(new Date(booking.booking_date), 'd MMM', { locale: dateLocale })}
                  </div>
                </div>
                <div className="bk-main">
                  <div className="who">{treatmentLabel(booking)}</div>
                  {booking.hotel_name && <div className="what">{booking.hotel_name}</div>}
                  <div className="meta">
                    {format(new Date(booking.booking_date), 'EEEE d MMMM', { locale: dateLocale })}
                  </div>
                </div>
                <div className="bk-right">
                  <span className={`status ${statusKind(booking.status)}`}>
                    <span className="dot" />
                    {t(`portal.status.${booking.status}`, booking.status)}
                  </span>
                </div>
              </div>
          ))}
        </>
      )}
    </div>
  );
}
