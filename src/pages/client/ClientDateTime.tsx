import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useBasket } from './context/BasketContext';
import { useClientFlow } from './context/ClientFlowContext';
import { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import BookingProgressBar from '@/components/BookingProgressBar';

export default function ClientDateTime() {
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
        dayLabel: format(date, 'EEE', { locale }),
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
    
    navigate(`/client/${hotelId}/info`);
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border pt-safe">
        <div className="flex items-center gap-4 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/client/${hotelId}/basket`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">{t('datetime.title')}</h1>
        </div>
        <BookingProgressBar currentStep={2} totalSteps={4} />
      </div>

      <div className="px-6 py-4 space-y-6">
        {/* Date Selection */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">{t('checkout.dateTime').split('&')[0].trim()}</Label>
          <div className="relative">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory -mx-4 px-4">
              {dateOptions.map(({ value, label, dayLabel, fullLabel, isSpecial }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelectedDate(value)}
                  className={`flex-shrink-0 snap-start px-4 py-3 rounded-2xl border-2 transition-all min-w-[80px] ${
                    selectedDate === value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border active:border-primary/50'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-xs font-medium opacity-70 uppercase">
                      {isSpecial ? '' : dayLabel}
                    </div>
                    <div className="text-sm font-semibold whitespace-nowrap">
                      {isSpecial ? label : fullLabel}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Time Selection */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">
            {t('checkout.dateTime').split('&')[1]?.trim() || 'Time'}
            {loadingAvailability && (
              <span className="ml-2 text-xs text-muted-foreground">({t('common:loading')})</span>
            )}
          </Label>
          {!selectedDate ? (
            <p className="text-sm text-muted-foreground">{t('datetime.selectDate')}</p>
          ) : noHairdressers ? (
            <div className="bg-muted/50 border border-border rounded-2xl p-6 text-center">
              <p className="text-sm text-muted-foreground mb-2">
                {t('datetime.noSlots')}
              </p>
            </div>
          ) : (
            <div className="relative">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory -mx-4 px-4">
                {timeSlots
                  .filter(({ value }) => availableSlots.includes(value))
                  .map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSelectedTime(value)}
                      disabled={loadingAvailability}
                      className={`flex-shrink-0 snap-start px-5 py-3 rounded-2xl border-2 transition-all font-medium text-sm ${
                        selectedTime === value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border active:border-primary/50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border pb-safe">
        <Button
          onClick={handleContinue}
          className="w-full h-14 text-base rounded-full"
          disabled={!selectedDate || !selectedTime || loadingAvailability}
        >
          {loadingAvailability ? "Chargement..." : t('datetime.continue')}
          {loadingAvailability && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
        </Button>
      </div>
    </div>
  );
}
