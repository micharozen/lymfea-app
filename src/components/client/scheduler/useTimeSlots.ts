import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';

export interface TimeSlotOption {
  value: string;
  label: string;
  hour: number;
  isOutOfHours: boolean;
}

export interface VenueHours {
  openingMinutes: number;
  closingMinutes: number;
  baseOpeningMinutes: number;
  baseClosingMinutes: number;
  allowOutOfHours: boolean;
  slotInterval: number;
}

interface UseTimeSlotsArgs {
  selectedDate: string | undefined;
  venueData: VenueHours | undefined;
}

/**
 * Generate venue-hour-aligned time slots for the selected date, filtering out
 * past times when the date is today and flagging out-of-hours slots.
 */
export function useTimeSlots({ selectedDate, venueData }: UseTimeSlotsArgs): TimeSlotOption[] {
  const { i18n } = useTranslation('client');

  return useMemo(() => {
    if (!selectedDate || !venueData) return [];

    const slots: TimeSlotOption[] = [];
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    const {
      openingMinutes,
      closingMinutes,
      baseOpeningMinutes,
      baseClosingMinutes,
      allowOutOfHours,
      slotInterval,
    } = venueData;

    for (let minutes = openingMinutes; minutes < closingMinutes; minutes += slotInterval) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;

      if (selectedDate === todayStr) {
        if (hour < currentHour || (hour === currentHour && minute <= currentMinute)) {
          continue;
        }
      }

      const minuteStr = minute.toString().padStart(2, '0');
      const time24 = `${hour.toString().padStart(2, '0')}:${minuteStr}:00`;

      let timeLabel: string;
      if (i18n.language === 'fr') {
        timeLabel = `${hour.toString().padStart(2, '0')}:${minuteStr}`;
      } else {
        const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const period = hour >= 12 ? 'PM' : 'AM';
        timeLabel = `${hour12}:${minuteStr}${period}`;
      }

      const slotMinutes = hour * 60 + minute;
      const isOutOfHours = !!allowOutOfHours && (slotMinutes < baseOpeningMinutes || slotMinutes >= baseClosingMinutes);

      slots.push({ value: time24, label: timeLabel, hour, isOutOfHours });
    }

    return slots;
  }, [selectedDate, venueData, i18n.language]);
}
