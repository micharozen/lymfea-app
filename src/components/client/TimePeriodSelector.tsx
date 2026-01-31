import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sun, Sunset, Moon, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimePeriod {
  id: 'morning' | 'afternoon' | 'evening';
  labelKey: string;
  icon: React.ReactNode;
  startHour: number;
  endHour: number;
}

const TIME_PERIODS: TimePeriod[] = [
  { id: 'morning', labelKey: 'datetime.morning', icon: <Sun className="w-4 h-4" />, startHour: 6, endHour: 12 },
  { id: 'afternoon', labelKey: 'datetime.afternoon', icon: <Sunset className="w-4 h-4" />, startHour: 12, endHour: 17 },
  { id: 'evening', labelKey: 'datetime.evening', icon: <Moon className="w-4 h-4" />, startHour: 17, endHour: 23 },
];

interface TimeSlot {
  value: string;
  label: string;
  hour: number;
}

interface TimePeriodSelectorProps {
  availableSlots: string[];
  selectedTime: string;
  onSelectTime: (time: string) => void;
  allTimeSlots: TimeSlot[];
}

export default function TimePeriodSelector({
  availableSlots,
  selectedTime,
  onSelectTime,
  allTimeSlots,
}: TimePeriodSelectorProps) {
  const { t } = useTranslation('client');

  // Filter to only available slots
  const availableTimeSlots = useMemo(() => {
    return allTimeSlots.filter(slot => availableSlots.includes(slot.value));
  }, [allTimeSlots, availableSlots]);

  // Group slots by period
  const slotsByPeriod = useMemo(() => {
    const grouped: Record<string, TimeSlot[]> = {
      morning: [],
      afternoon: [],
      evening: [],
    };

    availableTimeSlots.forEach(slot => {
      if (slot.hour >= 6 && slot.hour < 12) {
        grouped.morning.push(slot);
      } else if (slot.hour >= 12 && slot.hour < 17) {
        grouped.afternoon.push(slot);
      } else if (slot.hour >= 17 && slot.hour < 23) {
        grouped.evening.push(slot);
      }
    });

    return grouped;
  }, [availableTimeSlots]);

  // Find the period with most slots to expand by default
  const defaultExpandedPeriod = useMemo(() => {
    let maxSlots = 0;
    let periodId: string = 'morning';

    Object.entries(slotsByPeriod).forEach(([id, slots]) => {
      if (slots.length > maxSlots) {
        maxSlots = slots.length;
        periodId = id;
      }
    });

    return periodId;
  }, [slotsByPeriod]);

  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(defaultExpandedPeriod);

  const togglePeriod = (periodId: string) => {
    setExpandedPeriod(current => current === periodId ? null : periodId);
  };

  return (
    <div className="space-y-0">
      {TIME_PERIODS.map((period) => {
        const slotsInPeriod = slotsByPeriod[period.id] || [];
        const isExpanded = expandedPeriod === period.id;
        const hasSlots = slotsInPeriod.length > 0;

        return (
          <div key={period.id} className="border-b border-white/10 last:border-b-0">
            <button
              type="button"
              onClick={() => hasSlots && togglePeriod(period.id)}
              disabled={!hasSlots}
              className={cn(
                "w-full flex items-center justify-between py-4 transition-all",
                hasSlots ? "cursor-pointer" : "cursor-not-allowed opacity-40"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 sm:w-8 sm:h-8 rounded-full bg-white/5 flex items-center justify-center text-gold-400">
                  {period.icon}
                </div>
                <span className="text-white font-light">{t(period.labelKey)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white/40 text-xs">
                  {slotsInPeriod.length} {t('datetime.available')}
                </span>
                {hasSlots && (
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-white/40 transition-transform duration-200",
                      isExpanded && "rotate-180"
                    )}
                  />
                )}
              </div>
            </button>

            {isExpanded && hasSlots && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pb-4 animate-fade-in">
                {slotsInPeriod.map((slot) => (
                  <button
                    key={slot.value}
                    type="button"
                    onClick={() => onSelectTime(slot.value)}
                    className={cn(
                      "py-3 min-h-[44px] rounded-lg text-sm transition-all duration-200",
                      selectedTime === slot.value
                        ? "bg-gold-400 text-black font-medium"
                        : "bg-white/5 text-white font-light hover:bg-white/10"
                    )}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
