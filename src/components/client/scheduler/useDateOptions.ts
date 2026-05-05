import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, format } from 'date-fns';
import { enUS, fr } from 'date-fns/locale';

export interface DateOption {
  value: string;
  label: string;
  dayLabel: string;
  fullLabel: string;
  isSpecial: boolean;
  hasSlots: boolean;
  isAllowedByCart: boolean;
}

interface UseDateOptionsArgs {
  availableDates: Set<string> | undefined;
  daysWithSlots: Set<string> | undefined;
  cartAllowedDays: number[];
  maxDaysAhead: number;
}

export function useDateOptions({
  availableDates,
  daysWithSlots,
  cartAllowedDays,
  maxDaysAhead,
}: UseDateOptionsArgs): DateOption[] {
  const { t, i18n } = useTranslation('client');
  const locale = i18n.language === 'fr' ? fr : enUS;

  return useMemo(() => {
    if (!availableDates) return [];

    const dates: DateOption[] = [];
    const today = new Date();

    for (let i = 0; i < maxDaysAhead; i++) {
      const date = addDays(today, i);
      const dateStr = format(date, 'yyyy-MM-dd');

      if (!availableDates.has(dateStr)) continue;

      const isAllowedByCart = cartAllowedDays.includes(date.getDay());
      const actuallyHasSlots = daysWithSlots ? daysWithSlots.has(dateStr) : true;

      let label = format(date, 'd MMM', { locale });
      if (i === 0) label = t('common:dates.today');
      else if (i === 1) label = t('common:dates.tomorrow');

      dates.push({
        value: dateStr,
        label,
        dayLabel: format(date, 'EEE', { locale }).toUpperCase(),
        fullLabel: format(date, 'd MMM', { locale }),
        isSpecial: i === 0 || i === 1,
        hasSlots: actuallyHasSlots,
        isAllowedByCart,
      });
    }

    return dates;
  }, [locale, t, availableDates, maxDaysAhead, daysWithSlots, cartAllowedDays]);
}
