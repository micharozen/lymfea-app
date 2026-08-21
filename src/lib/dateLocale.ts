import { useTranslation } from 'react-i18next';
import { enGB, fr } from 'date-fns/locale';
import type { Locale } from 'date-fns';

/**
 * date-fns locale matching the active i18n language.
 * Use instead of importing `fr` directly so dates follow the user's language.
 */
export function getDateLocale(language: string | undefined): Locale {
  return language?.startsWith('en') ? enGB : fr;
}

export function useDateLocale(): Locale {
  const { i18n } = useTranslation();
  return getDateLocale(i18n.language);
}
