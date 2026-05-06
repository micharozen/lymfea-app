import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, format, parse } from 'date-fns';
import { enUS, fr } from 'date-fns/locale';
import { CheckCircle2, ChevronDown, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import TimePeriodSelector from '@/components/client/TimePeriodSelector';
import { ClientSpinner } from '@/components/client/ClientSpinner';
import { DatePillsRow } from '@/components/client/scheduler/DatePillsRow';
import { useDateOptions } from '@/components/client/scheduler/useDateOptions';
import { useTimeSlots } from '@/components/client/scheduler/useTimeSlots';
import {
  type BasketItem,
  getCartKey,
} from '@/pages/client/context/CartContext';
import {
  type BookingDateTime,
  type PerItemSchedule,
  type TherapistGender,
} from '@/pages/client/context/FlowContext';

interface VenueData {
  openingMinutes: number;
  closingMinutes: number;
  baseOpeningMinutes: number;
  baseClosingMinutes: number;
  allowOutOfHours: boolean;
  surchargePercent: number;
  slotInterval: number;
}

interface PerItemSchedulerProps {
  hotelId: string;
  baseItems: BasketItem[];
  perItemSchedule: PerItemSchedule;
  setItemSchedule: (cartKey: string, dt: BookingDateTime | null) => void;
  therapistGender: TherapistGender;
  venueData: VenueData | undefined;
  availableDates: Set<string> | undefined;
  cartAllowedDays: number[];
  maxDaysAhead: number;
}

const isComplete = (slot: BookingDateTime | undefined | null): boolean =>
  !!slot && !!slot.date && !!slot.time;

/**
 * Multi-time scheduler: one date+time picker per cart item.
 * Each item's availability query passes pendingHolds for the OTHER items
 * already scheduled in the cart, so the server filters slots accordingly.
 *
 * Cards collapse automatically once a complete slot is picked, and the next
 * un-scheduled card is opened — minimizing scroll. Users can re-expand any
 * collapsed card to edit by clicking its header.
 */
export function PerItemScheduler({
  hotelId,
  baseItems,
  perItemSchedule,
  setItemSchedule,
  therapistGender,
  venueData,
  availableDates,
  cartAllowedDays,
  maxDaysAhead,
}: PerItemSchedulerProps) {
  const firstIncompleteKey = useMemo(() => {
    for (const item of baseItems) {
      const k = getCartKey(item.id, item.variantId);
      if (!isComplete(perItemSchedule[k])) return k;
    }
    return null;
    // Only seed once per baseItems shape; subsequent advance is driven by handleSlotChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseItems]);

  const [openKey, setOpenKey] = useState<string | null>(firstIncompleteKey);

  // If items appear/disappear later, keep openKey valid.
  useEffect(() => {
    if (!openKey) return;
    const stillExists = baseItems.some(
      (b) => getCartKey(b.id, b.variantId) === openKey,
    );
    if (!stillExists) setOpenKey(firstIncompleteKey);
  }, [baseItems, openKey, firstIncompleteKey]);

  const advanceFrom = (currentKey: string) => {
    const idx = baseItems.findIndex(
      (b) => getCartKey(b.id, b.variantId) === currentKey,
    );
    // Look forward from the next item, then wrap around for any earlier incomplete cards.
    const ordered = [
      ...baseItems.slice(idx + 1),
      ...baseItems.slice(0, idx),
    ];
    for (const item of ordered) {
      const k = getCartKey(item.id, item.variantId);
      if (!isComplete(perItemSchedule[k])) {
        setOpenKey(k);
        return;
      }
    }
    setOpenKey(null);
  };

  const handleSlotChange = (key: string, dt: BookingDateTime | null) => {
    setItemSchedule(key, dt);
    if (isComplete(dt)) advanceFrom(key);
  };

  return (
    <div className="space-y-3">
      {baseItems.map((item) => {
        const key = getCartKey(item.id, item.variantId);
        const otherHolds = Object.entries(perItemSchedule)
          .filter(([k, dt]) => k !== key && !!dt.date && !!dt.time)
          .map(([k, dt]) => {
            const other = baseItems.find(
              (b) => getCartKey(b.id, b.variantId) === k,
            );
            return {
              date: dt.date,
              time: dt.time,
              duration: (other?.duration ?? 30) * (other?.quantity ?? 1),
            };
          });
        return (
          <ItemSlotCard
            key={key}
            cartKey={key}
            item={item}
            currentSlot={perItemSchedule[key] ?? null}
            isOpen={openKey === key}
            onToggle={() => setOpenKey((prev) => (prev === key ? null : key))}
            onChange={(dt) => handleSlotChange(key, dt)}
            hotelId={hotelId}
            therapistGender={therapistGender}
            venueData={venueData}
            availableDates={availableDates}
            cartAllowedDays={cartAllowedDays}
            maxDaysAhead={maxDaysAhead}
            pendingHolds={otherHolds}
          />
        );
      })}
    </div>
  );
}

interface ItemSlotCardProps {
  cartKey: string;
  item: BasketItem;
  currentSlot: BookingDateTime | null;
  isOpen: boolean;
  onToggle: () => void;
  onChange: (dt: BookingDateTime | null) => void;
  hotelId: string;
  therapistGender: TherapistGender;
  venueData: VenueData | undefined;
  availableDates: Set<string> | undefined;
  cartAllowedDays: number[];
  maxDaysAhead: number;
  pendingHolds: Array<{ date: string; time: string; duration: number }>;
}

function ItemSlotCard({
  cartKey,
  item,
  currentSlot,
  isOpen,
  onToggle,
  onChange,
  hotelId,
  therapistGender,
  venueData,
  availableDates,
  cartAllowedDays,
  maxDaysAhead,
  pendingHolds,
}: ItemSlotCardProps) {
  const { t, i18n } = useTranslation('client');
  const locale = i18n.language === 'fr' ? fr : enUS;
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const itemDuration = (item.duration || 30) * (item.quantity || 1);
  const requiredGuestCount = item.guestCount && item.guestCount > 1 ? item.guestCount : 1;
  const pendingHoldsKey = JSON.stringify(pendingHolds);
  const slotComplete = isComplete(currentSlot);

  const { data: daysWithSlots, isLoading: loadingDaysWithSlots } = useQuery({
    queryKey: [
      'venue-days-with-slots-per-item',
      hotelId,
      maxDaysAhead,
      therapistGender,
      requiredGuestCount,
      cartKey,
      pendingHoldsKey,
    ],
    queryFn: async () => {
      const today = new Date();
      const endDate = addDays(today, maxDaysAhead);

      const { data, error } = await supabase.functions.invoke('check-availability-range', {
        body: {
          hotelId,
          startDate: format(today, 'yyyy-MM-dd'),
          endDate: format(endDate, 'yyyy-MM-dd'),
          ...(therapistGender ? { therapistGender } : {}),
          ...(requiredGuestCount > 1 ? { requiredGuestCount } : {}),
          treatmentIds: [item.id],
          requestedDuration: itemDuration,
          pendingHolds,
        },
      });

      if (error) throw error;
      return new Set<string>((data?.daysWithSlots as string[]) || []);
    },
    enabled: !!hotelId && !!venueData && !!availableDates && isOpen,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const dateOptions = useDateOptions({
    availableDates,
    daysWithSlots,
    cartAllowedDays,
    maxDaysAhead,
  });

  const allTimeSlots = useTimeSlots({
    selectedDate: currentSlot?.date,
    venueData,
  });

  useEffect(() => {
    const date = currentSlot?.date;
    if (!isOpen || !date || !hotelId) {
      if (!date) setAvailableSlots([]);
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('check-availability', {
          body: {
            hotelId,
            date,
            ...(therapistGender ? { therapistGender } : {}),
            ...(requiredGuestCount > 1 ? { requiredGuestCount } : {}),
            treatmentIds: [item.id],
            requestedDuration: itemDuration,
            pendingHolds,
          },
        });
        if (cancelled) return;
        if (error) throw error;
        const slots: string[] = data?.availableSlots ?? [];
        setAvailableSlots(slots);
        if (currentSlot?.time && !slots.includes(currentSlot.time)) {
          onChange({ date, time: '' });
        }
      } catch (err) {
        console.error('check-availability per-item error:', err);
        if (!cancelled) setAvailableSlots([]);
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlot?.date, hotelId, therapistGender, pendingHoldsKey, requiredGuestCount, isOpen]);

  const handleDateSelect = (value: string) => {
    onChange({ date: value, time: '' });
  };

  const handleTimeSelect = (time: string) => {
    if (!currentSlot?.date) return;
    onChange({ date: currentSlot.date, time });
  };

  const summaryLabel = useMemo(() => {
    if (!slotComplete || !currentSlot) return null;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    let datePart: string;
    if (currentSlot.date === todayStr) datePart = t('common:dates.today');
    else if (currentSlot.date === tomorrowStr) datePart = t('common:dates.tomorrow');
    else datePart = format(parse(currentSlot.date, 'yyyy-MM-dd', new Date()), 'EEE d MMM', { locale });

    const [hRaw, mRaw] = currentSlot.time.split(':');
    const h = Number(hRaw);
    const m = Number(mRaw);
    let timePart: string;
    if (i18n.language === 'fr') {
      timePart = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    } else {
      const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const period = h >= 12 ? 'PM' : 'AM';
      timePart = `${hour12}:${String(m).padStart(2, '0')}${period}`;
    }
    return `${datePart} · ${timePart}`;
  }, [slotComplete, currentSlot, locale, i18n.language, t]);

  return (
    <div
      className={cn(
        'border rounded-lg bg-white transition-colors',
        slotComplete ? 'border-gold-200' : 'border-gray-200',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {slotComplete && (
              <CheckCircle2 className="h-4 w-4 text-gold-500 shrink-0" aria-hidden />
            )}
            <div className="text-sm font-medium text-gray-900 truncate">{item.name}</div>
          </div>
          <div className="text-[11px] uppercase tracking-widest text-gray-400 mt-0.5">
            {itemDuration} min
            {item.variantLabel ? ` · ${item.variantLabel}` : ''}
          </div>
          {!isOpen && summaryLabel && (
            <div className="text-xs text-gold-600 mt-1.5 font-medium">
              {summaryLabel}
            </div>
          )}
          {!isOpen && !summaryLabel && (
            <div className="text-xs text-gray-400 mt-1.5">
              {t('datetime.multiTime.tapToChoose', 'Toucher pour choisir un créneau')}
            </div>
          )}
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-gray-400 shrink-0 transition-transform',
            isOpen && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {/* Smooth expand/collapse via CSS grid animation — no layout jump */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 space-y-4">
            <DatePillsRow
              dateOptions={dateOptions}
              selectedDate={currentSlot?.date ?? ''}
              onSelectDate={handleDateSelect}
              availableDates={availableDates}
              cartAllowedDays={cartAllowedDays}
              maxDaysAhead={maxDaysAhead}
              loadingDates={loadingDaysWithSlots && !daysWithSlots}
              embedded
            />

            {!currentSlot?.date ? (
              <div className="text-center border border-dashed border-gray-200 rounded-lg bg-gray-50 py-6">
                <Clock className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400 text-xs">{t('datetime.selectDateFirst')}</p>
              </div>
            ) : loadingSlots ? (
              <div className="flex justify-center py-6">
                <ClientSpinner size="sm" />
              </div>
            ) : availableSlots.length === 0 ? (
              <div className="text-center border border-dashed border-gray-200 rounded-lg bg-gray-50 py-6">
                <Clock className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-xs mb-1">{t('datetime.noSlots')}</p>
                <p className="text-gray-400 text-[11px]">{t('datetime.tryAnotherDate')}</p>
              </div>
            ) : (
              <TimePeriodSelector
                availableSlots={availableSlots}
                selectedTime={currentSlot?.time ?? ''}
                onSelectTime={handleTimeSelect}
                allTimeSlots={allTimeSlots}
                surchargePercent={venueData?.surchargePercent ?? 0}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
