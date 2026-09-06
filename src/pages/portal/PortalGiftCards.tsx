import { useTranslation } from 'react-i18next';
import { Gift, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { usePortalData, type PortalGiftCard } from '@/hooks/portal/usePortalData';

export default function PortalGiftCards() {
  const { t, i18n } = useTranslation('client');
  const dateLocale = i18n.language === 'fr' ? fr : enUS;
  const { data, isLoading } = usePortalData();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 px-4 pt-2">
        <div className="sk h-8 w-40" />
        <div className="sk h-44" />
        <div className="sk h-44" />
      </div>
    );
  }

  const cards = data?.gift_cards ?? [];
  const active = cards.filter((c) => c.status === 'active');
  const inactive = cards.filter((c) => c.status !== 'active');

  const renderCard = (card: PortalGiftCard) => {
    const isAmount = card.bundle_type === 'gift_amount';
    const isExpired = new Date(card.expires_at) < new Date();
    const title = i18n.language === 'en' && card.bundle_name_en ? card.bundle_name_en : card.bundle_name;

    const remaining = isAmount
      ? (card.total_amount_cents ?? 0) - card.used_amount_cents
      : (card.total_sessions ?? 0) - card.used_sessions;
    const total = isAmount ? (card.total_amount_cents ?? 0) : (card.total_sessions ?? 0);
    const progress = total > 0 ? ((total - remaining) / total) * 100 : 0;

    const statusKind = isExpired ? 'warn' : card.status === 'active' ? 'ok' : 'info';

    return (
      <div className="card" key={card.id} style={{ marginBottom: 'calc(10px * var(--sp))', opacity: card.status === 'active' ? 1 : 0.6 }}>
        {card.cover_image_url && (
          <div style={{ height: 108, overflow: 'hidden' }}>
            <img src={card.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}
        <div style={{ padding: 'calc(16px * var(--sp)) 18px', display: 'flex', flexDirection: 'column', gap: 'calc(12px * var(--sp))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Gift size={16} style={{ color: 'var(--ink-mute)', flexShrink: 0 }} />
            <span style={{ fontSize: 14.5, fontWeight: 500, flex: 1, minWidth: 0 }}>{title}</span>
            <span className={`status ${statusKind}`}>
              <span className="dot" />
              {isExpired ? t('portal.cardExpired') : t(`portal.cardStatus.${card.status}`, card.status)}
            </span>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 34, lineHeight: 1 }}>
              {isAmount ? Math.round(remaining / 100) : remaining}
              <span style={{ fontSize: 16, color: 'var(--ink-mute)', marginLeft: 4 }}>
                {isAmount ? '€' : t('portal.sessionsLeft')}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 4 }}>
              {t('portal.outOfTotal', {
                total: isAmount ? `${Math.round(total / 100)} €` : total,
              })}
            </div>
          </div>

          <div style={{ height: 5, background: 'var(--sand-200)', borderRadius: 999, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(progress, 100)}%`,
                background: 'var(--accent)',
                borderRadius: 999,
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11.5, color: 'var(--ink-mute)' }}>
            <span>
              {t('portal.validUntil', {
                date: format(new Date(card.expires_at), 'd MMM yyyy', { locale: dateLocale }),
              })}
            </span>
            {card.hotel_name && <span>{card.hotel_name}</span>}
          </div>

          {card.is_gift && card.sender_name && (
            <div style={{ background: 'var(--sand-100)', borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-soft)' }}>
                <Sparkles size={12} />
                {t('portal.fromSender', { name: card.sender_name })}
              </div>
              {card.gift_message && (
                <p style={{ margin: '4px 0 0', fontSize: 12.5, fontStyle: 'italic', color: 'var(--ink-soft)' }}>
                  « {card.gift_message} »
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="pb-6">
      <div className="greeting">
        <h1>{t('portal.giftCardsTitle')}</h1>
      </div>

      {cards.length === 0 && (
        <div className="placeholder">
          <Gift size={28} />
          <p>{t('portal.noGiftCards')}</p>
        </div>
      )}

      {active.length > 0 && (
        <>
          <div className="sec-label">
            {t('portal.activeCards')} <span className="count">{active.length}</span>
          </div>
          {active.map(renderCard)}
        </>
      )}

      {inactive.length > 0 && (
        <>
          <div className="sec-label">{t('portal.pastCards')}</div>
          {inactive.map(renderCard)}
        </>
      )}
    </div>
  );
}
