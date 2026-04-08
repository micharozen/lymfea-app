import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Returns a function that picks the localized value of a field.
 * Convention: French value is in `field`, English in `field_en` (or `fieldEn`).
 * Falls back to the French value when the English translation is missing.
 *
 * Usage:
 *   const localize = useLocalizedField();
 *   localize(treatment.name, treatment.name_en);      // → EN value when lang=en
 *   localize(hotel.name, hotel.name_en);
 */
export function useLocalizedField() {
  const { i18n } = useTranslation();

  return useCallback(
    (frValue: string | null | undefined, enValue: string | null | undefined): string => {
      if (i18n.language === 'en' && enValue) return enValue;
      return frValue || '';
    },
    [i18n.language]
  );
}
