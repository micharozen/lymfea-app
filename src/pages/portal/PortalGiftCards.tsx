import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Gift, Calendar, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface GiftCard {
  id: string;
  bundle_type: string;
  bundle_name: string;
  bundle_name_en: string | null;
  cover_image_url: string | null;
  total_sessions: number | null;
  used_sessions: number;
  total_amount_cents: number | null;
  used_amount_cents: number;
  status: string;
  expires_at: string;
  is_gift: boolean;
  sender_name: string | null;
  gift_message: string | null;
  hotel_name: string | null;
  claimed_at: string | null;
  created_at: string;
}

interface PortalData {
  gift_cards: GiftCard[];
  customer: { id: string };
  upcoming_bookings: unknown[];
  past_bookings: unknown[];
}

export default function PortalGiftCards() {
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
        <div className="h-40 bg-gray-200 rounded-xl" />
        <div className="h-40 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  const cards = data?.gift_cards ?? [];
  const active = cards.filter((c) => c.status === 'active');
  const inactive = cards.filter((c) => c.status !== 'active');

  const renderCard = (card: GiftCard) => {
    const isAmount = card.bundle_type === 'gift_amount';
    const isExpired = new Date(card.expires_at) < new Date();
    const title = i18n.language === 'en' && card.bundle_name_en ? card.bundle_name_en : card.bundle_name;

    const remaining = isAmount
      ? (card.total_amount_cents ?? 0) - card.used_amount_cents
      : (card.total_sessions ?? 0) - card.used_sessions;

    const total = isAmount ? (card.total_amount_cents ?? 0) : (card.total_sessions ?? 0);
    const progress = total > 0 ? ((total - remaining) / total) * 100 : 0;

    return (
      <div
        key={card.id}
        className={cn(
          "bg-white rounded-2xl border overflow-hidden shadow-sm",
          card.status === 'active' ? "border-gray-100" : "border-gray-100 opacity-60"
        )}
      >
        {card.cover_image_url && (
          <div className="h-28 overflow-hidden">
            <img src={card.cover_image_url} className="w-full h-full object-cover" alt="" />
          </div>
        )}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gift className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-900">{title}</span>
            </div>
            <span className={cn(
              "text-[10px] font-medium px-2 py-0.5 rounded-full",
              isExpired ? "bg-red-50 text-red-600" :
              card.status === 'active' ? "bg-green-50 text-green-700" :
              card.status === 'completed' ? "bg-blue-50 text-blue-600" :
              "bg-gray-100 text-gray-500"
            )}>
              {isExpired
                ? t('portal.cardExpired')
                : t(`portal.cardStatus.${card.status}`, card.status)
              }
            </span>
          </div>

          {/* Balance */}
          <div className="text-center py-3 border-y border-gray-50">
            {isAmount ? (
              <p className="text-3xl font-serif font-light text-gray-900">
                {Math.round(remaining / 100)} <span className="text-xl text-gray-400">€</span>
                <span className="text-sm text-gray-300 ml-1">/ {Math.round(total / 100)} €</span>
              </p>
            ) : (
              <p className="text-3xl font-serif font-light text-gray-900">
                {remaining} <span className="text-sm text-gray-400">{t('portal.sessionsLeft')}</span>
                <span className="text-sm text-gray-300 ml-1">/ {total}</span>
              </p>
            )}
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gray-900 rounded-full transition-all"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>

          {/* Meta */}
          <div className="flex items-center justify-between text-xs text-gray-400">
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>
                {t('portal.validUntil', { date: format(new Date(card.expires_at), 'd MMM yyyy', { locale: dateLocale }) })}
              </span>
            </div>
            {card.hotel_name && <span>{card.hotel_name}</span>}
          </div>

          {/* Gift message */}
          {card.is_gift && card.sender_name && (
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                <Sparkles className="w-3 h-3" />
                <span>{t('portal.fromSender', { name: card.sender_name })}</span>
              </div>
              {card.gift_message && (
                <p className="text-xs text-gray-500 italic">"{card.gift_message}"</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 py-2">
      <h1 className="text-xl font-serif text-gray-900">{t('portal.giftCardsTitle')}</h1>

      {cards.length === 0 && (
        <div className="text-center py-12">
          <Gift className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">{t('portal.noGiftCards')}</p>
        </div>
      )}

      {active.length > 0 && (
        <div className="space-y-3">
          {active.map(renderCard)}
        </div>
      )}

      {inactive.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-gray-400">{t('portal.pastCards')}</h2>
          {inactive.map(renderCard)}
        </div>
      )}
    </div>
  );
}
