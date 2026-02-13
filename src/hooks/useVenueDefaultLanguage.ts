import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';

const FRENCH_COUNTRIES = [
  'france',
  'belgium',
  'belgique',
  'switzerland',
  'suisse',
  'luxembourg',
  'monaco',
];

function getVenueDefaultLanguage(
  venueType: string | null,
  country: string | null
): 'fr' | 'en' {
  if (!venueType || venueType === 'hotel') return 'en';
  if (country && FRENCH_COUNTRIES.includes(country.toLowerCase().trim())) return 'fr';
  return 'en';
}

export function useVenueDefaultLanguage(hotelId: string | undefined) {
  const { i18n } = useTranslation();
  const hasApplied = useRef(false);

  const { data: hotel } = useQuery({
    queryKey: ['public-hotel', hotelId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_hotel_by_id', {
        _hotel_id: hotelId!,
      });
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!hotelId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    if (!hotelId || !hotel || hasApplied.current) return;

    const storageKey = `oom-venue-lang-applied:${hotelId}`;
    const stored = sessionStorage.getItem(storageKey);
    const defaultLang = getVenueDefaultLanguage(hotel.venue_type, hotel.country);

    // Skip if already correctly applied in this session.
    // Old 'true' values (from previous code) are treated as stale → re-detect.
    if (stored === 'fr' || stored === 'en') {
      if (i18n.language !== stored) {
        i18n.changeLanguage(stored);
      }
      hasApplied.current = true;
      return;
    }

    if (i18n.language !== defaultLang) {
      i18n.changeLanguage(defaultLang);
    }

    sessionStorage.setItem(storageKey, defaultLang);
    hasApplied.current = true;
  }, [hotelId, hotel, i18n]);
}
