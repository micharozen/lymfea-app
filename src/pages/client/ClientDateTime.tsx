import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ArrowLeft } from 'lucide-react';
import { useBasket } from './context/BasketContext';
import { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import BookingProgressBar from '@/components/BookingProgressBar';

export default function ClientDateTime() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { items } = useBasket();

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
      let label = format(date, 'd MMM');
      
      if (i === 0) label = 'Today';
      else if (i === 1) label = 'Tomorrow';
      
      dates.push({
        value: format(date, 'yyyy-MM-dd'),
        label,
        dayLabel: format(date, 'EEEE'),
        fullLabel: format(date, 'd MMM'),
      });
    }
    
    return dates;
  }, []);

  // Generate time slots (6AM to 11PM every 30 minutes)
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = 6; hour < 23; hour++) {
      for (let minute of [0, 30]) {
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
  }, []);

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
        
        // Check if no hairdressers are available
        if (slots.length === 0 && data) {
          setNoHairdressers(true);
        }
        
        // Clear time if it's no longer available
        if (selectedTime && !slots.includes(selectedTime)) {
          setSelectedTime('');
        }
      } catch (error) {
        console.error('Error checking availability:', error);
        toast.error('Unable to check availability');
      } finally {
        setLoadingAvailability(false);
      }
    };

    fetchAvailability();
  }, [selectedDate, hotelId]);

  const handleContinue = () => {
    if (!selectedDate) {
      toast.error('Please select a date');
      return;
    }

    if (!selectedTime) {
      toast.error('Please select a time');
      return;
    }

    if (items.length === 0) {
      toast.error('Your basket is empty');
      return;
    }

    // Store date/time in sessionStorage
    sessionStorage.setItem('bookingDateTime', JSON.stringify({
      date: selectedDate,
      time: selectedTime,
    }));
    
    navigate(`/client/${hotelId}/info`);
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="flex items-center gap-4 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/client/${hotelId}/basket`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">Select Date & Time</h1>
        </div>
        <BookingProgressBar currentStep={2} totalSteps={4} />
      </div>

      <div className="p-4 space-y-6">
        {/* Date Selection */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Date</Label>
          <div className="relative">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
              {dateOptions.map(({ value, label, dayLabel, fullLabel }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelectedDate(value)}
                  className={`flex-shrink-0 snap-start px-4 py-3 rounded-xl border-2 transition-all ${
                    selectedDate === value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:border-primary/50'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-sm font-semibold whitespace-nowrap">
                      {label === 'Today' || label === 'Tomorrow' ? label : dayLabel}
                    </div>
                    {(label === 'Today' || label === 'Tomorrow') && (
                      <div className="text-xs opacity-80 whitespace-nowrap">{fullLabel}</div>
                    )}
                    {label !== 'Today' && label !== 'Tomorrow' && (
                      <div className="text-xs opacity-80 whitespace-nowrap">{fullLabel}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Time Selection */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">
            Time
            {loadingAvailability && (
              <span className="ml-2 text-xs text-muted-foreground">(Loading...)</span>
            )}
          </Label>
          {!selectedDate ? (
            <p className="text-sm text-muted-foreground">Please select a date first</p>
          ) : noHairdressers ? (
            <div className="bg-muted/50 border border-border rounded-lg p-6 text-center">
              <p className="text-sm text-muted-foreground mb-2">
                No hairdressers are currently available for this hotel.
              </p>
              <p className="text-xs text-muted-foreground">
                Please contact the hotel reception for assistance.
              </p>
            </div>
          ) : (
            <div className="relative">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
                {timeSlots.map(({ value, label }) => {
                  const isAvailable = availableSlots.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => isAvailable && setSelectedTime(value)}
                      disabled={!isAvailable || loadingAvailability}
                      className={`flex-shrink-0 snap-start px-6 py-3 rounded-xl border-2 transition-all font-medium ${
                        selectedTime === value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : isAvailable
                          ? 'bg-background border-border hover:border-primary/50'
                          : 'bg-muted border-border text-muted-foreground cursor-not-allowed opacity-50'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
        <Button
          onClick={handleContinue}
          className="w-full h-14 text-lg"
          disabled={!selectedDate || !selectedTime || loadingAvailability}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
