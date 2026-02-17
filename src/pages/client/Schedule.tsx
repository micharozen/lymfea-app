import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Calendar, Clock, ShoppingBag } from 'lucide-react';
import { useBasket } from './context/CartContext';
import { CartDrawer } from '@/components/client/CartDrawer';
import { useClientFlow } from './context/FlowContext';
import { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import TimePeriodSelector from '@/components/client/TimePeriodSelector';
import { ScheduleSkeleton } from '@/components/client/skeletons/ScheduleSkeleton';
import { ProgressBar } from '@/components/client/ProgressBar';
import { ClientSpinner } from '@/components/client/ClientSpinner';
import { useQuery } from '@tanstack/react-query';
import { useClientAnalytics } from '@/hooks/useClientAnalytics';

export default function Schedule() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { items, itemCount } = useBasket();
  const { setBookingDateTime } = useClientFlow();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { t, i18n } = useTranslation('client');
  const locale = i18n.language === 'fr' ? fr : enUS;

  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [noHairdressers, setNoHairdressers] = useState(false);
  const { trackPageView, trackAction } = useClientAnalytics(hotelId);
  const hasTrackedPageView = useRef(false);

  // Track page view once
  useEffect(() => {
    if (!hasTrackedPageView.current) {
      hasTrackedPageView.current = true;
      trackPageView('schedule');
    }
  }, [trackPageView]);

  // Fetch venue opening/closing hours and schedule info
  const { data: venueData } = useQuery({
    queryKey: ['venue-data', hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_public_hotel_by_id', { _hotel_id: hotelId });

      if (error) throw error;
      const hotel = data?.[0];

      // Parse opening/closing times as total minutes, default to 6:00-23:00 if not set
      const openingMinutes = hotel?.opening_time
        ? parseInt(hotel.opening_time.split(':')[0], 10) * 60 + parseInt(hotel.opening_time.split(':')[1] || '0', 10)
        : 6 * 60;
      const closingMinutes = hotel?.closing_time
        ? parseInt(hotel.closing_time.split(':')[0], 10) * 60 + parseInt(hotel.closing_time.split(':')[1] || '0', 10)
        : 23 * 60;

      // Determine max days based on schedule
      // Extend to 90 days for one_time schedules or recurring with < 5 days/week
      const isOneTime = hotel?.schedule_type === 'one_time';
      const isRecurring = hotel?.schedule_type === 'specific_days';
      const daysPerWeek = hotel?.days_of_week?.length ?? 7;
      const maxDaysAhead = isOneTime ? 90 : (isRecurring && daysPerWeek < 5) ? 90 : 14;

      const slotInterval = hotel?.slot_interval || 30;

      return { openingMinutes, closingMinutes, maxDaysAhead, slotInterval };
    },
    enabled: !!hotelId,
    staleTime: 30 * 60 * 1000, // 30 minutes - opening hours rarely change
    gcTime: 60 * 60 * 1000,    // 1 hour cache
  });

  // Fetch available dates based on venue deployment schedule
  const maxDaysAhead = venueData?.maxDaysAhead ?? 14;
  const { data: availableDates, isLoading: loadingAvailableDates } = useQuery({
    queryKey: ['venue-available-dates', hotelId, maxDaysAhead],
    queryFn: async () => {
      const today = new Date();
      const endDate = addDays(today, maxDaysAhead);

      const { data, error } = await supabase.rpc('get_venue_available_dates', {
        _hotel_id: hotelId,
        _start_date: format(today, 'yyyy-MM-dd'),
        _end_date: format(endDate, 'yyyy-MM-dd'),
      });

      if (error) throw error;
      return new Set(data || []);
    },
    enabled: !!hotelId && !!venueData,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000,   // 30 minutes cache
  });

  // Generate date options filtered by venue deployment schedule
  const dateOptions = useMemo(() => {
    // Don't generate dates until availableDates is loaded
    // This prevents showing all dates when the RPC call fails or is pending
    if (!availableDates) {
      return [];
    }

    const dates = [];
    const today = new Date();

    for (let i = 0; i < maxDaysAhead; i++) {
      const date = addDays(today, i);
      const dateStr = format(date, 'yyyy-MM-dd');

      // Skip dates not in the venue's deployment schedule
      if (!availableDates.has(dateStr)) {
        continue;
      }

      let label = format(date, 'd MMM', { locale });

      if (i === 0) label = t('common:dates.today');
      else if (i === 1) label = t('common:dates.tomorrow');

      dates.push({
        value: dateStr,
        label,
        dayLabel: format(date, 'EEE', { locale }).toUpperCase(),
        fullLabel: format(date, 'd MMM', { locale }),
        isSpecial: i === 0 || i === 1,
      });
    }

    return dates;
  }, [locale, t, availableDates, maxDaysAhead]);

  // Generate time slots based on venue hours, filtering out past times for today
  const timeSlots = useMemo(() => {
    const slots = [];
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    const openingMinutes = venueData?.openingMinutes ?? 6 * 60;
    const closingMinutes = venueData?.closingMinutes ?? 23 * 60;
    const slotInterval = venueData?.slotInterval ?? 30;

    for (let minutes = openingMinutes; minutes < closingMinutes; minutes += slotInterval) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;

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
    return slots;
  }, [selectedDate, venueData]);

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

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    trackAction('select_time_slot', { date: selectedDate, time });
  };

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
    <div className="relative min-h-[100dvh] w-full bg-white pb-safe">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200 pt-safe">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="text-gray-900 hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-light text-gray-900">{t('datetime.title')}</h1>
          </div>
          {itemCount > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCartOpen(true)}
              className="relative text-gray-900 hover:bg-gray-100 hover:text-gold-400 transition-colors"
            >
              <ShoppingBag className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 bg-gold-400 text-black text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                {itemCount}
              </span>
            </Button>
          )}
        </div>
        <ProgressBar currentStep="schedule" />
      </div>

      <div className="px-4 py-4 sm:px-6 sm:py-6 space-y-8">
        {/* Page headline */}
        <div className="animate-fade-in">
          <h3 className="text-[10px] uppercase tracking-[0.3em] text-gold-400 mb-3 font-semibold">
            {t('datetime.stepLabel')}
          </h3>
          <h2 className="font-serif text-xl sm:text-2xl md:text-3xl text-gray-900 leading-tight">
            {t('datetime.headline')}
          </h2>
        </div>

        {/* Date Selection */}
        <div className="space-y-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <h4 className="text-xs uppercase tracking-widest text-gray-500 font-medium">
            {t('checkout.dateTime').split('&')[0].trim()}
          </h4>
          <div className="relative">
            {(loadingAvailableDates || !availableDates) ? (
              <div className="flex justify-center py-8">
                <ClientSpinner size="md" />
              </div>
            ) : dateOptions.length === 0 ? (
              <div className="text-center py-8 border border-gray-200 rounded-lg bg-gray-50">
                <Calendar className="w-10 h-10 sm:w-12 sm:h-12 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-500 text-sm mb-2">{t('datetime.noDatesAvailable') || 'Aucune date disponible'}</p>
                <p className="text-gray-400 text-xs">{t('datetime.contactVenue') || 'Veuillez contacter le lieu'}</p>
              </div>
            ) : (
              <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
                {dateOptions.map(({ value, label, dayLabel, fullLabel, isSpecial }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSelectedDate(value)}
                    className={cn(
                      "flex-shrink-0 snap-start px-3 py-3 sm:px-5 sm:py-4 rounded-lg border transition-all duration-200 min-w-[70px] sm:min-w-[90px]",
                      selectedDate === value
                        ? "border-gold-400 bg-gold-400/10"
                        : "border-gray-200 bg-gray-50 hover:border-gray-300"
                    )}
                  >
                    <div className="text-center">
                      {!isSpecial && (
                        <div className="text-[10px] text-gray-400 mb-1 tracking-wider">
                          {dayLabel}
                        </div>
                      )}
                      <div className={cn(
                        "text-sm whitespace-nowrap",
                        selectedDate === value
                          ? "text-gold-400 font-medium"
                          : "text-gray-900 font-light"
                      )}>
                        {isSpecial ? label : fullLabel}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Time Selection */}
        <div className="space-y-4 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <h4 className="text-xs uppercase tracking-widest text-gray-500 font-medium">
            {t('checkout.dateTime').split('&')[1]?.trim() || 'Time'}
          </h4>

          {!selectedDate ? (
            <div className="text-center py-12">
              <Calendar className="w-10 h-10 sm:w-12 sm:h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-400 text-sm">{t('datetime.selectDateFirst')}</p>
            </div>
          ) : loadingAvailability ? (
            <div className="flex justify-center py-12">
              <ClientSpinner size="md" />
            </div>
          ) : noHairdressers || availableSlots.length === 0 ? (
            <div className="text-center py-12 border border-gray-200 rounded-lg bg-gray-50">
              <Clock className="w-10 h-10 sm:w-12 sm:h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 text-sm mb-2">{t('datetime.noSlots')}</p>
              <p className="text-gray-400 text-xs">{t('datetime.tryAnotherDate')}</p>
            </div>
          ) : (
            <TimePeriodSelector
              availableSlots={availableSlots}
              selectedTime={selectedTime}
              onSelectTime={handleTimeSelect}
              allTimeSlots={timeSlots}
            />
          )}
        </div>
      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent pb-safe">
        <Button
          onClick={handleContinue}
          disabled={!selectedDate || !selectedTime || loadingAvailability}
          className="w-full h-12 sm:h-14 md:h-16 bg-gray-900 text-white hover:bg-gray-800 font-medium tracking-widest text-base transition-all duration-300 disabled:bg-gray-200 disabled:text-gray-400"
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

      {/* Cart Drawer */}
      <CartDrawer open={isCartOpen} onOpenChange={setIsCartOpen} />
    </div>
  );
}
