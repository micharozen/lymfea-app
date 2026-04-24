import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader2, Calendar as CalendarIcon, Clock, AlertTriangle, CalendarDays } from 'lucide-react';
import { useBasket, getCartAvailableDays } from '@/pages/client/context/CartContext';
import { TherapistGenderSelector } from '@/components/client/TherapistGenderSelector';
import { useClientFlow } from '@/pages/client/context/FlowContext';
import { useUrlBookingState } from '@/pages/client/hooks/useUrlBookingState';
import { useState, useMemo, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import { format, addDays, parse } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import TimePeriodSelector from '@/components/client/TimePeriodSelector';
import { ClientSpinner } from '@/components/client/ClientSpinner';
import { AddonProposalDrawer } from '@/components/client/AddonProposalDrawer';
import { useFeasibleAddons } from '@/hooks/client/useFeasibleAddons';
import { useQuery } from '@tanstack/react-query';
import { useClientAnalytics } from '@/hooks/useClientAnalytics';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface SchedulePanelProps {
  hotelId: string;
  onContinue: () => void;
  takenDate?: string;
  slotTaken?: boolean;
  sessionExpired?: boolean;
  /** When true, renders with tighter spacing for embedding inside another page */
  embedded?: boolean;
  className?: string;
}

export function SchedulePanel({
  hotelId,
  onContinue,
  takenDate,
  slotTaken = false,
  sessionExpired = false,
  embedded = false,
  className,
}: SchedulePanelProps) {
  const { items } = useBasket();
  const cartAllowedDays = useMemo(() => getCartAvailableDays(items), [items]);
  const hasCartDayConstraint = cartAllowedDays.length < 7;
  const {
    setBookingDateTime,
    therapistGenderPreference,
    setTherapistGenderPreference,
    draftBookingId,
    setDraftBookingId,
    setHoldExpiresAt,
  } = useClientFlow();
  const { t, i18n } = useTranslation('client');
  const locale = i18n.language === 'fr' ? fr : enUS;

  const {
    date: urlDate,
    time: urlTime,
    setDateTime: setUrlDateTime,
  } = useUrlBookingState();

  // URL wins on cold load — `takenDate` override > URL > empty
  const [selectedDate, setSelectedDate] = useState(takenDate || urlDate || '');
  const [selectedTime, setSelectedTime] = useState(urlTime || '');
  const selectedTimeRef = useRef(selectedTime);
  const [showSlotTakenBanner, setShowSlotTakenBanner] = useState(slotTaken);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [noTherapists, setNoTherapists] = useState(false);
  const [isHolding, setIsHolding] = useState(false);

  // Max guest_count across all items determines therapist/room capacity needed
  const requiredGuestCount = useMemo(
    () => Math.max(1, ...items.map(i => i.guestCount ?? 1)),
    [items]
  );
  const { trackAction, trackPageView } = useClientAnalytics(hotelId);
  const hasTrackedPageView = useRef(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isAddonDrawerOpen, setIsAddonDrawerOpen] = useState(false);
  const [pendingContinueTime, setPendingContinueTime] = useState<string | null>(null);
  const [addonCheckArmed, setAddonCheckArmed] = useState(false);

  const baseItems = useMemo(
    () => items.filter((i) => !i.isAddon && !i.isBundle),
    [items],
  );

  const totalBaseDuration = useMemo(
    () => baseItems.reduce((sum, i) => sum + (i.duration || 0) * (i.quantity || 1), 0),
    [baseItems],
  );

  const formatBaseEndTime = (time: string): string => {
    if (!time) return '';
    const [h, m] = time.split(':').map(Number);
    const total = (h || 0) * 60 + (m || 0) + totalBaseDuration;
    const eh = Math.floor(total / 60);
    const em = total % 60;
    return `${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`;
  };

  const { feasibleAddons, isChecking: isCheckingAddons, isReady: addonsReady } =
    useFeasibleAddons({
      hotelId,
      date: selectedDate,
      time: pendingContinueTime ?? '',
      baseItems,
      enabled: addonCheckArmed && !!pendingContinueTime,
    });
  const dateScrollRef = useRef<HTMLDivElement>(null);
  const dateButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Scroll the horizontal date strip to the selected date
  useEffect(() => {
    if (selectedDate && dateButtonRefs.current[selectedDate] && dateScrollRef.current) {
      const button = dateButtonRefs.current[selectedDate];
      const container = dateScrollRef.current;
      const scrollLeft = button!.offsetLeft - container.offsetWidth / 2 + button!.offsetWidth / 2;
      container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }
  }, [selectedDate]);

  // Track page view once (only for standalone page, not embedded)
  useEffect(() => {
    if (!embedded && !hasTrackedPageView.current) {
      hasTrackedPageView.current = true;
      trackPageView('schedule');
    }
  }, [embedded, trackPageView]);

  // Fetch venue opening/closing hours and schedule info
  const { data: venueData } = useQuery({
    queryKey: ['venue-data', hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_public_hotel_by_id', { _hotel_id: hotelId });

      if (error) throw error;
      const hotel = data?.[0];

      const baseOpeningMinutes = hotel?.opening_time
        ? parseInt(hotel.opening_time.split(':')[0], 10) * 60 + parseInt(hotel.opening_time.split(':')[1] || '0', 10)
        : 10 * 60;
      const baseClosingMinutes = hotel?.closing_time
        ? parseInt(hotel.closing_time.split(':')[0], 10) * 60 + parseInt(hotel.closing_time.split(':')[1] || '0', 10)
        : 20 * 60;

      const isOneTime = hotel?.schedule_type === 'one_time';
      const isRecurring = hotel?.schedule_type === 'specific_days';
      const daysPerWeek = hotel?.days_of_week?.length ?? 7;
      const maxDaysAhead = isOneTime ? 90 : (isRecurring && daysPerWeek < 5) ? 90 : 90;

      const slotInterval = hotel?.slot_interval || 30;
      const holdEnabled = (hotel as { booking_hold_enabled?: boolean } | undefined)?.booking_hold_enabled ?? true;
      const holdDurationMinutes = (hotel as { booking_hold_duration_minutes?: number } | undefined)?.booking_hold_duration_minutes ?? 5;

      const allowOutOfHours = !!(hotel as { allow_out_of_hours_booking?: boolean } | undefined)?.allow_out_of_hours_booking;
      const surchargePercent = Number((hotel as { out_of_hours_surcharge_percent?: number | string } | undefined)?.out_of_hours_surcharge_percent ?? 0) || 0;

      // Widen generation window by ±2h when out-of-hours bookings are allowed
      const openingMinutes = allowOutOfHours ? Math.max(0, baseOpeningMinutes - 120) : baseOpeningMinutes;
      const closingMinutes = allowOutOfHours ? Math.min(24 * 60, baseClosingMinutes + 120) : baseClosingMinutes;

      return {
        openingMinutes,
        closingMinutes,
        baseOpeningMinutes,
        baseClosingMinutes,
        allowOutOfHours,
        surchargePercent,
        maxDaysAhead,
        slotInterval,
        holdEnabled,
        holdDurationMinutes,
      };
    },
    enabled: !!hotelId,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  // Fetch available dates based on venue deployment schedule
  const maxDaysAhead = venueData?.maxDaysAhead ?? 90;
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
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Fetch per-day availability (which deployed days actually have at least one free slot)
  const { data: daysWithSlots } = useQuery({
    queryKey: ['venue-days-with-slots', hotelId, maxDaysAhead, therapistGenderPreference, requiredGuestCount],
    queryFn: async () => {
      const today = new Date();
      const endDate = addDays(today, maxDaysAhead);

      const { data, error } = await supabase.functions.invoke('check-availability-range', {
        body: {
          hotelId,
          startDate: format(today, 'yyyy-MM-dd'),
          endDate: format(endDate, 'yyyy-MM-dd'),
          ...(therapistGenderPreference ? { therapistGender: therapistGenderPreference } : {}),
          ...(requiredGuestCount > 1 ? { requiredGuestCount } : {}),
        },
      });

      if (error) throw error;
      return new Set<string>((data?.daysWithSlots as string[]) || []);
    },
    enabled: !!hotelId && !!venueData && !!availableDates,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // Generate date options (all venue-deployed dates) with a flag for per-day availability
  const dateOptions = useMemo(() => {
    if (!availableDates) return [];

    const dates = [];
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

  // Auto-select the first deployed day (usually today) so the slot grid is
  // populated without an extra click. If the day ends up being fully booked,
  // the user sees the "fully booked" state and can browse from there.
  useEffect(() => {
    if (selectedDate) return;
    if (takenDate) return;
    const first = dateOptions.find(d => d.hasSlots && d.isAllowedByCart);
    if (first) {
      setSelectedDate(first.value);
      setUrlDateTime(first.value, '');
    }
  }, [dateOptions, selectedDate, takenDate, setUrlDateTime]);

  // Generate time slots based on venue hours, filtering out past times for today
  const timeSlots = useMemo(() => {
    const slots = [];
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    const openingMinutes = venueData?.openingMinutes ?? 10 * 60;
    const closingMinutes = venueData?.closingMinutes ?? 20 * 60;
    const slotInterval = venueData?.slotInterval ?? 30;

    for (let minutes = openingMinutes; minutes < closingMinutes; minutes += slotInterval) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;

      if (selectedDate === todayStr) {
        if (hour < currentHour || (hour === currentHour && minute <= currentMinute)) {
          continue;
        }
      }

      const time24 = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
      const minuteStr = minute.toString().padStart(2, '0');

      let timeLabel: string;
      if (i18n.language === 'fr') {
        timeLabel = `${hour.toString().padStart(2, '0')}:${minuteStr}`;
      } else {
        const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const period = hour >= 12 ? 'PM' : 'AM';
        timeLabel = `${hour12}:${minuteStr}${period}`;
      }

      const slotMinutes = hour * 60 + minute;
      const baseOpen = venueData?.baseOpeningMinutes ?? openingMinutes;
      const baseClose = venueData?.baseClosingMinutes ?? closingMinutes;
      const slotIsOutOfHours = !!venueData?.allowOutOfHours && (slotMinutes < baseOpen || slotMinutes >= baseClose);

      slots.push({
        value: time24,
        label: timeLabel,
        hour,
        isOutOfHours: slotIsOutOfHours,
      });
    }
    return slots;
  }, [selectedDate, venueData]);

  // Fetch available slots when date or gender preference changes
  useEffect(() => {
    const fetchAvailability = async () => {
      if (!selectedDate || !hotelId) return;

      setLoadingAvailability(true);
      setNoTherapists(false);
      try {
        const { data, error } = await supabase.functions.invoke('check-availability', {
          body: {
            hotelId,
            date: selectedDate,
            ...(therapistGenderPreference ? { therapistGender: therapistGenderPreference } : {}),
            ...(requiredGuestCount > 1 ? { requiredGuestCount } : {}),
          }
        });

        if (error) throw error;

        const slots = data?.availableSlots || [];
        setAvailableSlots(slots);

        if (slots.length === 0 && data) {
          setNoTherapists(true);
        }

        if (selectedTimeRef.current && !slots.includes(selectedTimeRef.current)) {
          setSelectedTime('');
          selectedTimeRef.current = '';
        }
      } catch (error) {
        console.error('Error checking availability:', error);
        toast.error(t('common:errors.generic'));
      } finally {
        setLoadingAvailability(false);
      }
    };

    fetchAvailability();
  }, [selectedDate, hotelId, therapistGenderPreference, requiredGuestCount, t]);

  /**
   * Creates a draft booking (holds the slot) then navigates forward.
   * When the venue has hold disabled, skips draft creation — the slot will be locked
   * at confirm-setup-intent via the reserve_trunk_atomically fallback path.
   */
  const executeHoldAndContinue = async (date: string, time: string) => {
    const holdEnabled = venueData?.holdEnabled ?? true;
    const holdMinutes = venueData?.holdDurationMinutes ?? 5;

    setIsHolding(true);
    try {
      if (draftBookingId) {
        await supabase.from('bookings').delete()
          .eq('id', draftBookingId)
          .eq('status', 'awaiting_payment');
        setDraftBookingId(null);
        setHoldExpiresAt(null);
      }

      if (!holdEnabled) {
        flushSync(() => {
          setDraftBookingId(null);
          setHoldExpiresAt(null);
          setBookingDateTime({ date, time });
        });
        onContinue();
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-draft-booking', {
        body: {
          hotelId,
          bookingData: { date, time },
          treatments: items.map(item => ({
            id: item.id,
            variantId: item.variantId,
            quantity: item.quantity,
          })),
          therapistGender: therapistGenderPreference || null,
          ...(requiredGuestCount > 1 ? { guestCount: requiredGuestCount } : {}),
        },
      });

      if (error) throw error;
      if (!data?.bookingId) throw new Error('No booking ID returned');

      flushSync(() => {
        setDraftBookingId(data.bookingId);
        setHoldExpiresAt(Date.now() + holdMinutes * 60 * 1000);
        setBookingDateTime({ date, time });
      });
      onContinue();
    } catch (err: unknown) {
      console.error('Hold error:', err);
      setSelectedTime('');
      setShowSlotTakenBanner(true);
      toast.error(t('datetime.slotTakenBanner', 'Ce créneau vient d\'être pris. Veuillez en choisir un autre.'));
    } finally {
      setIsHolding(false);
    }
  };

  const proceedAfterAddons = (time: string) => {
    setIsAddonDrawerOpen(false);
    setAddonCheckArmed(false);
    setUrlDateTime(selectedDate, time);
    setTimeout(async () => {
      await executeHoldAndContinue(selectedDate, time);
    }, 300);
  };

  // When the addon-feasibility check resolves, either show the drawer (if
  // anything is actually bookable) or continue straight through. This keeps the
  // drawer from flashing on "no availability".
  useEffect(() => {
    if (!addonCheckArmed || !addonsReady || !pendingContinueTime) return;
    if (feasibleAddons.length > 0) {
      setIsAddonDrawerOpen(true);
    } else {
      proceedAfterAddons(pendingContinueTime);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addonCheckArmed, addonsReady, feasibleAddons.length, pendingContinueTime]);

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    selectedTimeRef.current = time;
    setShowSlotTakenBanner(false);
    if (selectedDate) setUrlDateTime(selectedDate, time);
    trackAction('select_time_slot', { date: selectedDate, time });

    // Note: le hold ne démarre que sur "Continuer", pas au clic du créneau
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

    if (baseItems.length > 0) {
      setPendingContinueTime(selectedTime);
      setAddonCheckArmed(true);
      // Drawer (or fallthrough) is handled by the effect watching addonsReady.
      return;
    }

    executeHoldAndContinue(selectedDate, selectedTime);
  };

  const isBusy = loadingAvailability || isHolding || (addonCheckArmed && !addonsReady);

  return (
    <div className={cn(
      embedded ? "px-4 py-4 space-y-6" : "px-4 py-4 sm:px-6 sm:py-6 space-y-8",
      className
    )}>
      {/* Slot taken alert banner */}
      {showSlotTakenBanner && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg animate-fade-in flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-medium text-red-700 text-sm mb-1">
              {t('datetime.slotTakenBanner')}
            </h3>
            <p className="text-xs text-red-600/70">
              {t('datetime.slotTakenDesc')}
            </p>
          </div>
        </div>
      )}

      {/* Session expired banner */}
      {sessionExpired && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg animate-fade-in flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-medium text-amber-700 text-sm mb-1">
              {t('datetime.sessionExpiredBanner')}
            </h3>
            <p className="text-xs text-amber-600/70">
              {t('datetime.sessionExpiredDesc')}
            </p>
          </div>
        </div>
      )}

      {/* Page headline */}
      {!embedded && (
        <div className="animate-fade-in">
          <h3 className="text-[10px] uppercase tracking-[0.3em] text-gold-600 mb-3 font-semibold">
            {t('datetime.stepLabel')}
          </h3>
          <h2 className="font-serif text-xl sm:text-2xl md:text-3xl text-gray-900 leading-tight">
            {t('datetime.headline')}
          </h2>
        </div>
      )}

      {/* Embedded panel title */}
      {embedded && (
        <div>
          <h3 className="font-serif text-lg text-gray-900 leading-tight">
            {t('datetime.headline')}
          </h3>
        </div>
      )}

      {/* Therapist Gender Preference */}
      <div className={embedded ? "" : "animate-fade-in"} style={embedded ? undefined : { animationDelay: '0.1s' }}>
        <TherapistGenderSelector
          value={therapistGenderPreference}
          onChange={setTherapistGenderPreference}
        />
      </div>

      {/* Day constraint info banner */}
      {hasCartDayConstraint && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2.5">
          <CalendarDays className="h-4 w-4 text-blue-500 shrink-0" />
          <p className="text-xs text-blue-700">
            {t('datetime.dayConstraintInfo')}
          </p>
        </div>
      )}

      {/* Date Selection */}
      <div className={cn("space-y-4", !embedded && "animate-fade-in")} style={embedded ? undefined : { animationDelay: '0.2s' }}>
        <div className="flex items-center justify-between">
          <h4 className="text-xs uppercase tracking-widest text-gray-500 font-medium">
            {t('checkout.dateTime').split('&')[0].trim()}
          </h4>

          {/* Calendar picker button */}
          {availableDates && dateOptions.length > 0 && (
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all duration-200",
                    isCalendarOpen || selectedDate
                      ? "border-gold-500 bg-gold-500/10 text-gold-600"
                      : "border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300"
                  )}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  {selectedDate
                    ? format(parse(selectedDate, 'yyyy-MM-dd', new Date()), 'd MMM', { locale })
                    : t('datetime.pickDate', 'Calendrier')
                  }
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end" sideOffset={8}>
                <Calendar
                  mode="single"
                  selected={selectedDate ? parse(selectedDate, 'yyyy-MM-dd', new Date()) : undefined}
                  onSelect={(date) => {
                    if (date) {
                      const value = format(date, 'yyyy-MM-dd');
                      setSelectedDate(value);
                      setUrlDateTime(value, '');
                      setIsCalendarOpen(false);
                    }
                  }}
                  disabled={(date) => {
                    const dateStr = format(date, 'yyyy-MM-dd');
                    if (!availableDates.has(dateStr)) return true;
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
          )}
        </div>
        <div className="relative">
          {(loadingAvailableDates || !availableDates) ? (
            <div className="flex justify-center py-8">
              <ClientSpinner size="md" />
            </div>
          ) : dateOptions.length === 0 ? (
            <div className="text-center py-8 border border-gray-200 rounded-lg bg-gray-50">
              <CalendarIcon className="w-10 h-10 sm:w-12 sm:h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 text-sm mb-2">{t('datetime.noDatesAvailable') || 'Aucune date disponible'}</p>
              <p className="text-gray-400 text-xs">{t('datetime.contactVenue') || 'Veuillez contacter le lieu'}</p>
            </div>
          ) : (
            <div
              ref={dateScrollRef}
              className={cn(
                "flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory",
                embedded ? "gap-1.5" : "sm:gap-3"
              )}
            >
              {dateOptions.map(({ value, label, dayLabel, fullLabel, isSpecial, hasSlots, isAllowedByCart }) => {
                // Un jour est cliquable s'il a des créneaux ET qu'il est autorisé par les soins du panier
                const isClickable = hasSlots && isAllowedByCart;

                return (
                  <button
                    key={value}
                    ref={el => { dateButtonRefs.current[value] = el; }}
                    type="button"
                    disabled={!isClickable} // 🔒 LE VERROU EST ICI
                    onClick={() => {
                      if (!isClickable) return; // Double sécurité
                      setSelectedDate(value);
                      setUrlDateTime(value, '');
                    }}
                    aria-disabled={!isClickable}
                    className={cn(
                      "flex-shrink-0 snap-start rounded-lg border transition-all duration-200",
                      embedded
                        ? "px-2.5 py-2.5 min-w-[60px]"
                        : "px-3 py-3 sm:px-5 sm:py-4 min-w-[70px] sm:min-w-[90px]",
                      selectedDate === value
                        ? "border-gold-500 bg-gold-500/10"
                        : !isClickable
                          ? "border-gray-200 bg-gray-100/60 opacity-60 cursor-not-allowed" // Rend le bouton visiblement inactif
                          : "border-gray-200 bg-gray-50 hover:border-gray-300"
                    )}
                  >
                    <div className="text-center">
                      {!isSpecial && (
                        <div className={cn(
                          "text-[10px] mb-1 tracking-wider",
                          !isClickable && selectedDate !== value ? "text-gray-300" : "text-gray-400"
                        )}>
                          {dayLabel}
                        </div>
                      )}
                      <div className={cn(
                        "whitespace-nowrap",
                        embedded ? "text-xs" : "text-sm",
                        selectedDate === value
                          ? "text-gold-600 font-medium"
                          : !isClickable
                            ? "text-gray-400 font-light line-through" // Barre le texte du jour
                            : "text-gray-900 font-light"
                      )}>
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

      {/* Time Selection */}
      <div className={cn("space-y-4", !embedded && "animate-fade-in")} style={embedded ? undefined : { animationDelay: '0.3s' }}>
        <h4 className="text-xs uppercase tracking-widest text-gray-500 font-medium">
          {t('checkout.dateTime').split('&')[1]?.trim() || 'Time'}
        </h4>

        {!selectedDate ? (
          <div className={cn("text-center border border-gray-200 rounded-lg bg-gray-50", embedded ? "py-8" : "py-12")}>
            <CalendarIcon className={cn("text-gray-200 mx-auto mb-4", embedded ? "w-8 h-8" : "w-10 h-10 sm:w-12 sm:h-12")} />
            <p className="text-gray-400 text-sm">{t('datetime.selectDateFirst')}</p>
          </div>
        ) : loadingAvailability ? (
          <div className={cn("flex justify-center", embedded ? "py-8" : "py-12")}>
            <ClientSpinner size="md" />
          </div>
        ) : noTherapists || availableSlots.length === 0 ? (
          <div className={cn("text-center border border-gray-200 rounded-lg bg-gray-50", embedded ? "py-8" : "py-12")}>
            <Clock className={cn("text-gray-200 mx-auto mb-4", embedded ? "w-8 h-8" : "w-10 h-10 sm:w-12 sm:h-12")} />
            <p className="text-gray-500 text-sm mb-2">{t('datetime.noSlots')}</p>
            <p className="text-gray-400 text-xs">{t('datetime.tryAnotherDate')}</p>
          </div>
        ) : (
          <TimePeriodSelector
            availableSlots={availableSlots}
            selectedTime={selectedTime}
            onSelectTime={handleTimeSelect}
            allTimeSlots={timeSlots}
            surchargePercent={venueData?.surchargePercent ?? 0}
          />
        )}
      </div>

      {/* Continue button — sticky for embedded, fixed for standalone */}
      {embedded ? (
        <div className="sticky bottom-0 z-10 p-4 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent">
          <Button
            onClick={handleContinue}
            disabled={!selectedDate || !selectedTime || isBusy}
            className="w-full h-12 bg-gray-900 text-white hover:bg-gray-800 font-medium tracking-widest text-base transition-all duration-300 disabled:bg-gray-200 disabled:text-gray-400"
          >
            {isHolding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('datetime.securing', 'Sécurisation du créneau…')}
              </>
            ) : loadingAvailability ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('common:loading')}
              </>
            ) : (
              t('datetime.continue')
            )}
          </Button>
        </div>
      ) : (
        <>
          <div className="h-20" />
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent pb-safe z-30">
            <Button
              onClick={handleContinue}
              disabled={!selectedDate || !selectedTime || isBusy}
              className="w-full h-12 sm:h-14 md:h-16 bg-gray-900 text-white hover:bg-gray-800 font-medium tracking-widest text-base transition-all duration-300 disabled:bg-gray-200 disabled:text-gray-400"
            >
              {isHolding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('datetime.securing', 'Sécurisation du créneau…')}
                </>
              ) : loadingAvailability ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common:loading')}
                </>
              ) : (
                t('datetime.continue')
              )}
            </Button>
          </div>
        </>
      )}

      <AddonProposalDrawer
        open={isAddonDrawerOpen}
        onOpenChange={(open) => {
          setIsAddonDrawerOpen(open);
          if (!open) {
            setPendingContinueTime(null);
            setAddonCheckArmed(false);
          }
        }}
        feasibleAddons={feasibleAddons}
        baseEndTime={formatBaseEndTime(pendingContinueTime ?? selectedTime)}
        onContinue={() => {
          if (pendingContinueTime) {
            proceedAfterAddons(pendingContinueTime);
          }
        }}
      />
    </div>
  );
}