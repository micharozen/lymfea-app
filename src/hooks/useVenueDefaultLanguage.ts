import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { brand } from '@/config/brand';
import type { PublicHotel } from '@/pages/client/context/ClientVenueContext';

function getVenueDefaultLanguage(): 'fr' | 'en' {
  // Client booking links default to French. The user can override per-link
  // via the `?lang=` URL parameter, or in-session via the language switcher.
  return 'fr';
}

/**
 * Applies the right default language for the venue.
 * Accepts the already-fetched venue so we don't duplicate the RPC roundtrip.
 */
export function useVenueDefaultLanguage(
  hotelId: string | null,
  venue: PublicHotel | null
) {
  const { i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const appliedHotelIdRef = useRef<string | null>(null);
  const [isLanguageReady, setIsLanguageReady] = useState(false);

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
    if (!hotelId || !venue) return;
    if (appliedHotelIdRef.current === hotelId) {
      setIsLanguageReady(true);
      return;
    }

    const storageKey = `${brand.storageKeys.venueLangPrefix}:${hotelId}`;
    const stored = sessionStorage.getItem(storageKey);
    const urlLang = searchParams.get('lang');
    const forcedLang = urlLang === 'fr' || urlLang === 'en' ? urlLang : null;
    const defaultLang = getVenueDefaultLanguage();
    const targetLanguage =
      forcedLang || (stored === 'fr' || stored === 'en' ? stored : defaultLang);
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
  }, [hotelId, venue, i18n, searchParams]);

  return { isLanguageReady };
}
