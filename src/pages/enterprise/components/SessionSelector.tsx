import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';

interface SessionSelectorProps {
  currentDate: string;
  availableDates: string[];
  onDateChange: (date: string) => void;
}

export function SessionSelector({ currentDate, availableDates, onDateChange }: SessionSelectorProps) {
  const { t, i18n } = useTranslation('client');
  const dateLocale = i18n.language === 'fr' ? fr : enUS;

  const currentIndex = useMemo(
    () => availableDates.indexOf(currentDate),
    [availableDates, currentDate]
  );

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < availableDates.length - 1;

  const handlePrev = () => {
    if (hasPrev) {
      onDateChange(availableDates[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      onDateChange(availableDates[currentIndex + 1]);
    }
  };

  const formattedDate = format(
    parseISO(currentDate),
    'EEEE d MMMM yyyy',
    { locale: dateLocale }
  );

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100">
      <Button
        variant="ghost"
        size="icon"
        onClick={handlePrev}
        disabled={!hasPrev}
        className="h-10 w-10 text-gray-400 hover:text-gray-700 disabled:opacity-30"
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>

      <div className="text-center">
        <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-medium mb-1">
          {t('enterpriseDashboard.sessionSelector.title')}
        </p>
        <p className="font-serif text-lg sm:text-xl text-gray-900 capitalize">
          {formattedDate}
        </p>
        {availableDates.length > 0 && (
          <p className="text-[10px] text-gray-400 mt-0.5">
            {currentIndex + 1} / {availableDates.length}
          </p>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleNext}
        disabled={!hasNext}
        className="h-10 w-10 text-gray-400 hover:text-gray-700 disabled:opacity-30"
      >
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  );
}
