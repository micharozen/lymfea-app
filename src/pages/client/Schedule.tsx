import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Calendar, Clock } from 'lucide-react';
import { useBasket } from './context/CartContext';
import { useClientFlow } from './context/FlowContext';
import { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import TimePeriodSelector from '@/components/client/TimePeriodSelector';

export default function Schedule() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { items } = useBasket();
  const { setBookingDateTime } = useClientFlow();
  const { t, i18n } = useTranslation('client');
  const locale = i18n.language === 'fr' ? fr : enUS;

  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [noHairdressers, setNoHairdressers] = useState(false);

  // Generate date options (next 14 days)
  const dateOptions = useMemo(() => {
    const dates = [];
    const today = new Date();

    for (let i = 0; i < 14; i++) {
      const date = addDays(today, i);
      let label = format(date, 'd MMM', { locale });

      if (i === 0) label = t('common:dates.today');
      else if (i === 1) label = t('common:dates.tomorrow');

      dates.push({
        value: format(date, 'yyyy-MM-dd'),
        label,
        dayLabel: format(date, 'EEE', { locale }).toUpperCase(),
        fullLabel: format(date, 'd MMM', { locale }),
        isSpecial: i === 0 || i === 1,
      });
    }

    return dates;
  }, [locale, t]);

  // Generate time slots (6AM to 11PM every 10 minutes), filtering out past times for today
  const timeSlots = useMemo(() => {
    const slots = [];
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    for (let hour = 6; hour < 23; hour++) {
      for (let minute = 0; minute < 60; minute += 10) {
        // Skip past times if selected date is today
        if (selectedDate === todayStr) {
          if (hour < currentHour || (hour === currentHour && minute <= currentMinute)) {
            continue;
          }
        }

        const time24 = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
        const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const period = hour >= 12 ? 'PM' : 'AM';
        const time12 = `${hour12}:${minute.toString().padStart(2, '0')}${period}`;

        slots.push({
          value: time24,
          label: time12,
          hour,
        });
      }
    }
    return slots;
  }, [selectedDate]);

  // Fetch available slots when date changes
  useEffect(() => {
    const fetchAvailability = async () => {
      if (!selectedDate || !hotelId) return;

      setLoadingAvailability(true);
      setNoHairdressers(false);
      try {
        const { data, error } = await supabase.functions.invoke('check-availability', {
          body: { hotelId, date: selectedDate }
        });

        if (error) throw error;

        const slots = data?.availableSlots || [];
        setAvailableSlots(slots);

        if (slots.length === 0 && data) {
          setNoHairdressers(true);
        }

        if (selectedTime && !slots.includes(selectedTime)) {
          setSelectedTime('');
        }
      } catch (error) {
        console.error('Error checking availability:', error);
        toast.error(t('common:errors.generic'));
      } finally {
        setLoadingAvailability(false);
      }
    };

    fetchAvailability();
  }, [selectedDate, hotelId, t]);

  const handleContinue = () => {
    if (!selectedDate) {
      toast.error(t('datetime.selectDate'));
      return;
    }

    if (!selectedTime) {
      toast.error(t('datetime.selectTime'));
      return;
    }

    if (items.length === 0) {
      toast.error(t('basket.empty'));
      return;
    }

    setBookingDateTime({
      date: selectedDate,
      time: selectedTime,
    });

    navigate(`/client/${hotelId}/guest-info`);
  };

  return (
    <div className="relative min-h-[100dvh] w-full bg-black pb-safe">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/95 backdrop-blur-sm border-b border-white/10 pt-safe">
        <div className="flex items-center gap-4 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/client/${hotelId}/treatments`)}
            className="text-white hover:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-light text-white">{t('datetime.title')}</h1>
        </div>
        {/* Progress bar */}
        <div className="w-full bg-white/10 h-0.5">
          <div
            className="bg-gold-400 h-full transition-all duration-500"
            style={{ width: '33.33%' }}
          />
        </div>
      </div>

      <div className="px-6 py-6 space-y-8">
        {/* Page headline */}
        <div className="animate-fade-in">
          <h3 className="text-[10px] uppercase tracking-[0.3em] text-gold-400 mb-3 font-semibold">
            {t('datetime.stepLabel')}
          </h3>
          <h2 className="font-serif text-2xl text-white leading-tight">
            {t('datetime.headline')}
          </h2>
        </div>

        {/* Date Selection */}
        <div className="space-y-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <h4 className="text-xs uppercase tracking-widest text-white/60 font-medium">
            {t('checkout.dateTime').split('&')[0].trim()}
          </h4>
          <div className="relative">
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
              {dateOptions.map(({ value, label, dayLabel, fullLabel, isSpecial }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelectedDate(value)}
                  className={cn(
                    "flex-shrink-0 snap-start px-5 py-4 rounded-lg border transition-all duration-200 min-w-[90px]",
                    selectedDate === value
                      ? "border-gold-400 bg-gold-400/10"
                      : "border-white/20 bg-white/5 hover:border-white/40"
                  )}
                >
                  <div className="text-center">
                    {!isSpecial && (
                      <div className="text-[10px] text-white/50 mb-1 tracking-wider">
                        {dayLabel}
                      </div>
                    )}
                    <div className={cn(
                      "text-sm whitespace-nowrap",
                      selectedDate === value
                        ? "text-gold-400 font-medium"
                        : "text-white font-light"
                    )}>
                      {isSpecial ? label : fullLabel}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Time Selection */}
        <div className="space-y-4 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <h4 className="text-xs uppercase tracking-widest text-white/60 font-medium">
            {t('checkout.dateTime').split('&')[1]?.trim() || 'Time'}
          </h4>

          {!selectedDate ? (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <p className="text-white/40 text-sm">{t('datetime.selectDateFirst')}</p>
            </div>
          ) : loadingAvailability ? (
            <div className="flex justify-center py-12">
              <div className="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : noHairdressers || availableSlots.length === 0 ? (
            <div className="text-center py-12 border border-white/10 rounded-lg bg-white/5">
              <Clock className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <p className="text-white/60 text-sm mb-2">{t('datetime.noSlots')}</p>
              <p className="text-white/40 text-xs">{t('datetime.tryAnotherDate')}</p>
            </div>
          ) : (
            <TimePeriodSelector
              availableSlots={availableSlots}
              selectedTime={selectedTime}
              onSelectTime={setSelectedTime}
              allTimeSlots={timeSlots}
            />
          )}
        </div>
      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black to-transparent pb-safe">
        <Button
          onClick={handleContinue}
          disabled={!selectedDate || !selectedTime || loadingAvailability}
          className="w-full h-16 bg-white text-black hover:bg-gold-50 font-medium tracking-widest text-base rounded-none transition-all duration-300 disabled:bg-white/20 disabled:text-white/40"
        >
          {loadingAvailability ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('common:loading')}
            </>
          ) : (
            t('datetime.continue')
          )}
        </Button>
      </div>
    </div>
  );
}
