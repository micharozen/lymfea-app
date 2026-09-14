import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PortalGiftCard {
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
  claimed_at: string | null;
  created_at: string;
  hotel_id: string | null;
  hotel_name: string | null;
  hotel_slug: string | null;
}

export interface PortalBooking {
  id: string;
  booking_date: string;
  booking_time: string | null;
  status: string;
  total_price: number | null;
  duration: number | null;
  hotel_id: string | null;
  hotel_name: string | null;
  hotel_slug: string | null;
  treatments: { name: string; name_en: string | null }[] | null;
}

export interface PortalData {
  customer: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  };
  gift_cards: PortalGiftCard[];
  upcoming_bookings: PortalBooking[];
  past_bookings: PortalBooking[];
}

/** Lieu réservable depuis le portail, déduit des cartes cadeaux actives puis des réservations. */
export interface PortalVenue {
  id: string;
  name: string;
  slug: string;
}

export const usePortalData = () =>
  useQuery<PortalData>({
    queryKey: ['portal-data'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_customer_portal_data');
      if (error) throw error;
      return data as unknown as PortalData;
    },
  });

/**
 * Lieux vers lesquels proposer une réservation : d'abord ceux des cartes cadeaux
 * actives (le crédit y est rattaché), sinon ceux des réservations connues.
 */
export const portalBookableVenues = (data: PortalData | undefined): PortalVenue[] => {
  if (!data) return [];

  const collect = (entries: { hotel_id: string | null; hotel_name: string | null; hotel_slug: string | null }[]) => {
    const venues = new Map<string, PortalVenue>();
    for (const entry of entries) {
      if (!entry.hotel_id || !entry.hotel_slug) continue;
      if (venues.has(entry.hotel_id)) continue;
      venues.set(entry.hotel_id, {
        id: entry.hotel_id,
        name: entry.hotel_name ?? entry.hotel_slug,
        slug: entry.hotel_slug,
      });
    }
    return [...venues.values()];
  };

  const fromActiveCards = collect(data.gift_cards.filter((card) => card.status === 'active'));
  if (fromActiveCards.length > 0) return fromActiveCards;

  return collect([...data.upcoming_bookings, ...data.past_bookings]);
};
