import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, format, parse } from 'date-fns';
import { enUS, fr } from 'date-fns/locale';
import { CalendarDays, Calendar as CalendarIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ClientSpinner } from '@/components/client/ClientSpinner';
import type { DateOption } from './useDateOptions';

interface DatePillsRowProps {
  dateOptions: DateOption[];
  selectedDate: string;
  onSelectDate: (value: string) => void;
  availableDates: Set<string> | undefined;
  cartAllowedDays: number[];
  maxDaysAhead: number;
  loadingDates?: boolean;
  embedded?: boolean;
  showHeader?: boolean;
  headerLabel?: string;
}

export function DatePillsRow({
  dateOptions,
  selectedDate,
  onSelectDate,
  availableDates,
  cartAllowedDays,
  maxDaysAhead,
  loadingDates = false,
  embedded = false,
  showHeader = true,
  headerLabel,
}: DatePillsRowProps) {
  const { t, i18n } = useTranslation('client');
  const locale = i18n.language === 'fr' ? fr : enUS;
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const dateScrollRef = useRef<HTMLDivElement>(null);
  const dateButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (selectedDate && dateButtonRefs.current[selectedDate] && dateScrollRef.current) {
      const button = dateButtonRefs.current[selectedDate];
      const container = dateScrollRef.current;
      if (!button) return;
      const scrollLeft = button.offsetLeft - container.offsetWidth / 2 + button.offsetWidth / 2;
      container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }
  }, [selectedDate]);

  const calendarLabel = selectedDate
    ? format(parse(selectedDate, 'yyyy-MM-dd', new Date()), 'd MMM', { locale })
    : t('datetime.pickDate', 'Calendrier');

  const calendarTrigger = (
    <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all duration-200',
            isCalendarOpen || selectedDate
              ? 'border-gold-500 bg-gold-500/10 text-gold-600'
              : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300',
          )}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {calendarLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end" sideOffset={8}>
        <Calendar
          mode="single"
          selected={selectedDate ? parse(selectedDate, 'yyyy-MM-dd', new Date()) : undefined}
          onSelect={(date) => {
            if (date) {
              const value = format(date, 'yyyy-MM-dd');
              onSelectDate(value);
              setIsCalendarOpen(false);
            }
          }}
          disabled={(date) => {
            const dateStr = format(date, 'yyyy-MM-dd');
            if (availableDates && !availableDates.has(dateStr)) return true;
            if (!cartAllowedDays.includes(date.getDay())) return true;
            return false;
          }}
          showOutsideDays={false}
          fromDate={new Date()}
          toDate={addDays(new Date(), maxDaysAhead)}
          locale={locale}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="space-y-3">
      {(showHeader || availableDates) && (
        <div className="flex items-center justify-between">
          {showHeader ? (
            <h4 className="text-xs uppercase tracking-widest text-gray-500 font-medium">
              {headerLabel ?? t('datetime.dateLabel', 'Date')}
            </h4>
          ) : (
            <span aria-hidden />
          )}
          {availableDates && dateOptions.length > 0 && calendarTrigger}
        </div>
      )}

      <div className="relative">
        {(loadingDates || !availableDates) ? (
          <div className="flex justify-center py-6">
            <ClientSpinner size="md" />
          </div>
        ) : dateOptions.length === 0 ? (
          <div className="text-center py-8 border border-gray-200 rounded-lg bg-gray-50">
            <CalendarIcon className="w-10 h-10 sm:w-12 sm:h-12 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 text-sm mb-2">
              {t('datetime.noDatesAvailable', 'Aucune date disponible')}
            </p>
            <p className="text-gray-400 text-xs">
              {t('datetime.contactVenue', 'Veuillez contacter le lieu')}
            </p>
          </div>
        ) : (
          <div
            ref={dateScrollRef}
            className={cn(
              'flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory',
              embedded ? 'gap-1.5' : 'sm:gap-3',
            )}
          >
            {dateOptions.map(({ value, label, dayLabel, fullLabel, isSpecial, hasSlots, isAllowedByCart }) => {
              const isClickable = hasSlots && isAllowedByCart;
              return (
                <button
                  key={value}
                  ref={(el) => {
                    dateButtonRefs.current[value] = el;
                  }}
                  type="button"
                  disabled={!isClickable}
                  onClick={() => {
                    if (!isClickable) return;
                    onSelectDate(value);
                  }}
                  aria-disabled={!isClickable}
                  className={cn(
                    'flex-shrink-0 snap-start rounded-lg border transition-all duration-200',
                    embedded
                      ? 'px-2.5 py-2.5 min-w-[60px]'
                      : 'px-3 py-3 sm:px-5 sm:py-4 min-w-[70px] sm:min-w-[90px]',
                    selectedDate === value
                      ? 'border-gold-500 bg-gold-500/10'
                      : !isClickable
                        ? 'border-gray-200 bg-gray-100/60 opacity-60 cursor-not-allowed'
                        : 'border-gray-200 bg-gray-50 hover:border-gray-300',
                  )}
                >
                  <div className="text-center">
                    {!isSpecial && (
                      <div
                        className={cn(
                          'text-[10px] mb-1 tracking-wider',
                          !isClickable && selectedDate !== value ? 'text-gray-300' : 'text-gray-400',
                        )}
                      >
                        {dayLabel}
                      </div>
                    )}
                    <div
                      className={cn(
                        'whitespace-nowrap',
                        embedded ? 'text-xs' : 'text-sm',
                        selectedDate === value
                          ? 'text-gold-600 font-medium'
                          : !isClickable
                            ? 'text-gray-400 font-light line-through'
                            : 'text-gray-900 font-light',
                      )}
                    >
                      {isSpecial ? label : fullLabel}
                    </div>
                    {!isClickable && (
                      <div className="text-[9px] uppercase tracking-wider text-gray-400 mt-0.5">
                        {!isAllowedByCart ? t('datetime.dayRestricted') : t('datetime.dayFull')}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
