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
import { format, addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import TimePeriodSelector from '@/components/client/TimePeriodSelector';
import { ClientSpinner } from '@/components/client/ClientSpinner';
import { AddonProposalDrawer } from '@/components/client/AddonProposalDrawer';
import { useFeasibleAddons } from '@/hooks/client/useFeasibleAddons';
import { useQuery } from '@tanstack/react-query';
import { useClientAnalytics } from '@/hooks/useClientAnalytics';
import { PerItemScheduler } from '@/components/client/PerItemScheduler';
import { buildMultiBookingItems } from '@/lib/multiTimeBooking';
import { DatePillsRow } from '@/components/client/scheduler/DatePillsRow';
import { useDateOptions } from '@/components/client/scheduler/useDateOptions';
import { useTimeSlots } from '@/components/client/scheduler/useTimeSlots';
import { FunctionsHttpError } from '@supabase/supabase-js';

/** Parse JSON body from a failed edge-function invoke (e.g. 409 hold_disabled). */
async function parseFunctionErrorBody(error: unknown): Promise<Record<string, unknown> | null> {
  if (!(error instanceof FunctionsHttpError)) return null;
  try {
    const ctx = error.context as Response | undefined;
    if (ctx && typeof ctx.clone === 'function') {
      return (await ctx.clone().json()) as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function isHoldDisabledResponse(body: Record<string, unknown> | null): boolean {
  return body?.reason === 'hold_disabled' || body?.holdSkipped === true;
}

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
    scheduleMode,
    setScheduleMode,
    perItemSchedule,
    setItemSchedule,
    bookingIds,
    setBookingIds,
    setGroupId,
  } = useClientFlow();
  const { t } = useTranslation('client');

  const {
    date: urlDate,
    time: urlTime,
    setDateTime: setUrlDateTime,
  } = useUrlBookingState();

  // URL wins on cold load — `takenDate` override > URL > empty
  const [selectedDate, setSelectedDate] = useState(takenDate || urlDate || '');
  const [selectedTime, setSelectedTime] = useState(urlTime || '');
  // When 2+ base treatments are in cart, force an explicit choice between
  // shared and per-item slots before showing any picker. Deeplinks with a
  // pre-selected date count as an implicit "shared" choice so links keep working.
  const [scheduleModeChosen, setScheduleModeChosen] = useState<boolean>(
    () => Boolean(takenDate || urlDate),
  );
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
  const [isAddonDrawerOpen, setIsAddonDrawerOpen] = useState(false);
  const [pendingContinueTime, setPendingContinueTime] = useState<string | null>(null);
  const [addonCheckArmed, setAddonCheckArmed] = useState(false);
  const proceedAfterAddonsInFlightRef = useRef(false);

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
  // Track page view once (only for standalone page, not embedded)
  useEffect(() => {
    if (!embedded && !hasTrackedPageView.current) {
      hasTrackedPageView.current = true;
      trackPageView('schedule');
    }
  }, [embedded, trackPageView]);

  // Fetch venue opening/closing hours and schedule info
  const { data: venueData, isLoading: loadingVenueData, isError: venueDataError } = useQuery({
    queryKey: ['venue-data', hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_public_hotel_by_id', { _hotel_id: hotelId });

      if (error) throw error;
      const hotel = data?.[0];
      if (!hotel) {
        throw new Error('Venue not found or inactive');
      }

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
      const holdRaw = (hotel as { booking_hold_enabled?: boolean } | undefined)?.booking_hold_enabled;
      // Fail-closed in prod when RPC omits booking_hold_enabled (staging safety).
      // In dev, fall back to true so local DBs behind on migrations stay usable.
      let holdEnabled: boolean | undefined =
        typeof holdRaw === 'boolean' ? holdRaw : undefined;
      if (holdEnabled === undefined && import.meta.env.DEV) {
        console.warn(
          '[SchedulePanel] booking_hold_enabled missing from get_public_hotel_by_id — defaulting hold=true in dev. Run: bun run sup:reset',
        );
        holdEnabled = true;
      }
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
  const dateOptions = useDateOptions({
    availableDates,
    daysWithSlots,
    cartAllowedDays,
    maxDaysAhead,
  });

  // Auto-select the closest day that actually has slots. The availability of
  // each day arrives asynchronously (via `daysWithSlots`), so we re-run when
  // `dateOptions` updates and override the current selection if it turns out
  // to be fully booked — unless the user has already picked a date manually,
  // or the date comes from a recovery flow (`takenDate`) or a deep link (`urlDate`).
  const userPickedDateRef = useRef(false);
  useEffect(() => {
    if (takenDate || urlDate) return;
    if (userPickedDateRef.current) return;
    const firstAvailable = dateOptions.find(d => d.hasSlots && d.isAllowedByCart);
    if (!firstAvailable) return;
    if (!selectedDate) {
      setSelectedDate(firstAvailable.value);
      setUrlDateTime(firstAvailable.value, '');
      return;
    }
    const current = dateOptions.find(d => d.value === selectedDate);
    if (current && (!current.hasSlots || !current.isAllowedByCart) && current.value !== firstAvailable.value) {
      setSelectedDate(firstAvailable.value);
      setUrlDateTime(firstAvailable.value, '');
    }
  }, [dateOptions, selectedDate, takenDate, urlDate, setUrlDateTime]);

  // Generate time slots based on venue hours, filtering out past times for today
  const timeSlots = useTimeSlots({
    selectedDate,
    venueData,
  });

  // Fetch available slots when date or gender preference changes
  useEffect(() => {
    const fetchAvailability = async () => {
      if (!selectedDate || !hotelId) return;

      setLoadingAvailability(true);
      setNoTherapists(false);
      try {
        const treatmentIds = Array.from(new Set(baseItems.map((item) => item.id)));
        const { data, error } = await supabase.functions.invoke('check-availability', {
          body: {
            hotelId,
            date: selectedDate,
            ...(treatmentIds.length > 0 ? { treatmentIds } : {}),
            ...(totalBaseDuration > 0 ? { requestedDuration: totalBaseDuration } : {}),
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
  }, [selectedDate, hotelId, therapistGenderPreference, requiredGuestCount, baseItems, totalBaseDuration, t]);

  /**
   * Creates a draft booking (holds the slot) then navigates forward.
   * When the venue has hold disabled, skips draft creation — the slot will be locked
   * at confirm-setup-intent via the reserve_trunk_atomically fallback path.
   *
   * Hold OFF does not invoke create-draft-booking, so any prior draft rows are only
   * released via priorDraftIds when the client still had a draft id, or by pg_cron
   * (check-expired-slots) after hold TTL — max ~5 min orphan window.
   */
  const skipHoldAndContinue = (date: string, time: string) => {
    flushSync(() => {
      setDraftBookingId(null);
      setBookingIds([]);
      setGroupId(null);
      setHoldExpiresAt(null);
      setBookingDateTime({ date, time });
    });
    onContinue();
  };

  const executeHoldAndContinue = async (date: string, time: string) => {
    if (!venueData) return;

    const holdEnabled = venueData.holdEnabled;
    const holdMinutes = venueData.holdDurationMinutes ?? 5;
    const priorDraftIds = draftBookingId ? [draftBookingId] : [];

    setIsHolding(true);
    try {
      if (!holdEnabled) {
        skipHoldAndContinue(date, time);
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
          ...(priorDraftIds.length > 0 ? { priorDraftIds } : {}),
        },
      });

      if (error) {
        const errBody = await parseFunctionErrorBody(error);
        if (isHoldDisabledResponse(errBody)) {
          skipHoldAndContinue(date, time);
          return;
        }
        throw error;
      }

      if (data?.holdSkipped || data?.reason === 'hold_disabled') {
        skipHoldAndContinue(date, time);
        return;
      }

      if (!data?.bookingId) throw new Error('No booking ID returned');

      flushSync(() => {
        setDraftBookingId(data.bookingId);
        setBookingIds([data.bookingId]);
        setGroupId(null);
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

  /**
   * Multi-time variant: holds N slots in one shot, sharing a booking_group_id.
   * Used when scheduleMode === 'per_item' and the client picked distinct slots
   * for each base item.
   */
  const executeHoldAndContinueMulti = async () => {
    const items = buildMultiBookingItems(baseItems, perItemSchedule);
    if (!items || items.length === 0) {
      toast.error(t('datetime.selectTime'));
      return;
    }

    if (!venueData) return;

    const holdEnabled = venueData.holdEnabled;
    const holdMinutes = venueData.holdDurationMinutes ?? 5;
    const priorIds = bookingIds.length > 0
      ? bookingIds
      : (draftBookingId ? [draftBookingId] : []);

    setIsHolding(true);
    try {
      const firstSlot = { date: items[0].date, time: items[0].time };

      if (!holdEnabled) {
        skipHoldAndContinue(firstSlot.date, firstSlot.time);
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-draft-booking', {
        body: {
          hotelId,
          items,
          therapistGender: therapistGenderPreference || null,
          ...(priorIds.length > 0 ? { priorDraftIds: priorIds } : {}),
        },
      });

      if (error) {
        const errBody = await parseFunctionErrorBody(error);
        if (isHoldDisabledResponse(errBody)) {
          skipHoldAndContinue(firstSlot.date, firstSlot.time);
          return;
        }
        throw error;
      }

      if (data?.holdSkipped || data?.reason === 'hold_disabled') {
        skipHoldAndContinue(firstSlot.date, firstSlot.time);
        return;
      }

      if (!data?.bookingIds || data.bookingIds.length === 0) {
        throw new Error('No booking IDs returned');
      }

      flushSync(() => {
        setDraftBookingId(null);
        setBookingIds(data.bookingIds);
        setGroupId(data.groupId ?? null);
        setHoldExpiresAt(Date.now() + holdMinutes * 60 * 1000);
        setBookingDateTime(firstSlot);
      });
      onContinue();
    } catch (err: unknown) {
      console.error('Multi-hold error:', err);
      setShowSlotTakenBanner(true);
      toast.error(t('datetime.slotTakenBanner', 'Ce créneau vient d\'être pris. Veuillez en choisir un autre.'));
    } finally {
      setIsHolding(false);
    }
  };

  const proceedAfterAddons = (time: string) => {
    if (proceedAfterAddonsInFlightRef.current) return;
    proceedAfterAddonsInFlightRef.current = true;
    setIsAddonDrawerOpen(false);
    setAddonCheckArmed(false);
    setUrlDateTime(selectedDate, time);
    setTimeout(async () => {
      try {
        await executeHoldAndContinue(selectedDate, time);
      } finally {
        proceedAfterAddonsInFlightRef.current = false;
      }
    }, 300);
  };

  // When the addon-feasibility check resolves, either show the drawer (if
  // anything is actually bookable) or continue straight through. This keeps the
  // drawer from flashing on "no availability".
  useEffect(() => {
    if (!addonCheckArmed || !addonsReady || !pendingContinueTime) return;
    if (feasibleAddons.length > 0) {
      setIsAddonDrawerOpen(true);
      return;
    }
    setAddonCheckArmed(false);
    proceedAfterAddons(pendingContinueTime);
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
    if (!venueConfigReady) return;

    if (scheduleMode === 'per_item') {
      if (!allItemsScheduled) {
        toast.error(t('datetime.selectTime'));
        return;
      }
      executeHoldAndContinueMulti();
      return;
    }

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

  // In per_item mode (PR1), enable the Continue button only after every base
  // item has a complete date+time, so the visual flow exercises the full UI.
  // The handler still shows a "coming soon" toast — payment lands in PR2.
  const allItemsScheduled = useMemo(() => {
    if (scheduleMode !== 'per_item') return true;
    return baseItems.every((it) => {
      const k = it.variantId ? `${it.id}__${it.variantId}` : it.id;
      const slot = perItemSchedule[k];
      return !!slot?.date && !!slot?.time;
    });
  }, [scheduleMode, baseItems, perItemSchedule]);

  const venueConfigReady =
    !loadingVenueData && !venueDataError && venueData !== undefined && typeof venueData.holdEnabled === 'boolean';
  const isBusy = !venueConfigReady || loadingAvailability || isHolding || (addonCheckArmed && !addonsReady);

  useEffect(() => {
    if (venueDataError) {
      toast.error(t('common:errors.generic'));
    }
  }, [venueDataError, t]);

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

      {/* Schedule mode chooser: blocking question when 2+ base treatments in cart */}
      {baseItems.length > 1 && !scheduleModeChosen && (
        <div className="p-4 rounded-lg border border-gray-200 bg-gray-50 space-y-3">
          <div>
            <div className="text-sm font-medium text-gray-900">
              {t(
                'datetime.multiTime.question',
                'Souhaitez-vous réserver ces soins sur le même créneau ?',
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {t(
                'datetime.multiTime.questionHelper',
                "Choisissez si vos soins se déroulent simultanément (en couple/duo) ou l'un après l'autre à des horaires distincts.",
              )}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setScheduleMode('shared');
                setScheduleModeChosen(true);
              }}
            >
              {t('datetime.multiTime.yesShared', 'Oui, même créneau')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                // Reset shared selection when switching to per-item
                setSelectedDate('');
                setSelectedTime('');
                setUrlDateTime('', '');
                setScheduleMode('per_item');
                setScheduleModeChosen(true);
              }}
            >
              {t('datetime.multiTime.noSeparate', 'Non, créneaux séparés')}
            </Button>
          </div>
        </div>
      )}

      {/* Recap of chosen schedule mode (with "change" link) */}
      {baseItems.length > 1 && scheduleModeChosen && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-600">
            {scheduleMode === 'per_item'
              ? t('datetime.multiTime.recapSeparate', 'Un créneau distinct par soin')
              : t('datetime.multiTime.recapShared', 'Créneau unique pour tous les soins')}
          </p>
          <button
            type="button"
            className="text-xs font-medium text-gray-900 underline underline-offset-2"
            onClick={() => {
              setSelectedDate('');
              setSelectedTime('');
              setUrlDateTime('', '');
              setScheduleMode('shared');
              setScheduleModeChosen(false);
            }}
          >
            {t('datetime.multiTime.change', 'Modifier')}
          </button>
        </div>
      )}

      {/* Day constraint info banner */}
      {hasCartDayConstraint && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2.5">
          <CalendarDays className="h-4 w-4 text-blue-500 shrink-0" />
          <p className="text-xs text-blue-700">
            {t('datetime.dayConstraintInfo')}
          </p>
        </div>
      )}

      {/* Per-item scheduler: one date+time picker per cart item (multi-time mode) */}
      {scheduleMode === 'per_item' && baseItems.length > 1 && scheduleModeChosen && (
        <>
          <PerItemScheduler
            hotelId={hotelId}
            baseItems={baseItems}
            perItemSchedule={perItemSchedule}
            setItemSchedule={setItemSchedule}
            therapistGender={therapistGenderPreference}
            venueData={venueData}
            availableDates={availableDates}
            cartAllowedDays={cartAllowedDays}
            maxDaysAhead={maxDaysAhead}
          />
        </>
      )}

      {/* Date Selection (shared single-slot mode) */}
      {scheduleMode === 'shared' && (baseItems.length <= 1 || scheduleModeChosen) && (
      <>
      <div className={cn("space-y-4", !embedded && "animate-fade-in")} style={embedded ? undefined : { animationDelay: '0.2s' }}>
        <DatePillsRow
          dateOptions={dateOptions}
          selectedDate={selectedDate}
          onSelectDate={(value) => {
            userPickedDateRef.current = true;
            setSelectedDate(value);
            setUrlDateTime(value, '');
          }}
          availableDates={availableDates}
          cartAllowedDays={cartAllowedDays}
          maxDaysAhead={maxDaysAhead}
          loadingDates={loadingAvailableDates}
          embedded={embedded}
          headerLabel={t('checkout.dateTime').split('&')[0].trim()}
        />
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
      </>
      )}

      {/* Continue button — sticky for embedded, fixed for standalone */}
      {embedded ? (
        <div className="sticky bottom-0 z-10 p-4 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent">
          <Button
            onClick={handleContinue}
            disabled={
              scheduleMode === 'per_item'
                ? !allItemsScheduled || isBusy
                : !selectedDate || !selectedTime || isBusy
            }
            className="w-full h-12 bg-[var(--venue-button-bg,theme(colors.gray.900))] text-[var(--venue-button-text,#fff)] hover:opacity-90 font-medium tracking-widest text-base transition-all duration-300 disabled:bg-gray-200 disabled:text-gray-400"
          >
            {isHolding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('datetime.securing', 'Sécurisation du créneau…')}
              </>
            ) : loadingVenueData || loadingAvailability ? (
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
              disabled={
              scheduleMode === 'per_item'
                ? !allItemsScheduled || isBusy
                : !selectedDate || !selectedTime || isBusy
            }
              className="w-full h-12 sm:h-14 md:h-16 bg-[var(--venue-button-bg,theme(colors.gray.900))] text-[var(--venue-button-text,#fff)] hover:opacity-90 font-medium tracking-widest text-base transition-all duration-300 disabled:bg-gray-200 disabled:text-gray-400"
            >
              {isHolding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('datetime.securing', 'Sécurisation du créneau…')}
                </>
              ) : loadingVenueData || loadingAvailability ? (
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