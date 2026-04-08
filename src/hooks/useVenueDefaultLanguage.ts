import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { brand } from '@/config/brand';

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
  const [searchParams] = useSearchParams();
  const appliedHotelIdRef = useRef<string | null>(null);
  const [isLanguageReady, setIsLanguageReady] = useState(false);

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
    if (!hotelId) {
      appliedHotelIdRef.current = null;
      setIsLanguageReady(true);
      return;
    }

    if (appliedHotelIdRef.current !== hotelId) {
      setIsLanguageReady(false);
    }
  }, [hotelId]);

  useEffect(() => {
    if (!hotelId || !hotel) return;
    if (appliedHotelIdRef.current === hotelId) {
      setIsLanguageReady(true);
      return;
    }

    const storageKey = `${brand.storageKeys.venueLangPrefix}:${hotelId}`;
    const stored = sessionStorage.getItem(storageKey);
    const urlLang = searchParams.get('lang');
    const forcedLang = urlLang === 'fr' || urlLang === 'en' ? urlLang : null;
    const defaultLang = getVenueDefaultLanguage(hotel.venue_type, hotel.country);
    const targetLanguage = forcedLang || (stored === 'fr' || stored === 'en' ? stored : defaultLang);
    const currentLanguage = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];

    sessionStorage.setItem(storageKey, targetLanguage);

    if (currentLanguage === targetLanguage) {
      appliedHotelIdRef.current = hotelId;
      setIsLanguageReady(true);
      return;
    }

    Promise.resolve(i18n.changeLanguage(targetLanguage)).finally(() => {
      appliedHotelIdRef.current = hotelId;
      setIsLanguageReady(true);
    });
  }, [hotelId, hotel, i18n, searchParams]);

  return { isLanguageReady };
}
