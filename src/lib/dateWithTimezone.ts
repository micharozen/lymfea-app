import { format as dateFnsFormat, parse, parseISO, Locale } from 'date-fns';
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { fr } from 'date-fns/locale';

/**
 * Formats a date in a specific timezone
 */
export function formatInTz(
  date: Date | string,
  formatStr: string,
  timezone: string,
  options?: { locale?: Locale }
): string {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return formatInTimeZone(dateObj, timezone, formatStr, {
      locale: options?.locale || fr,
    });
  } catch (error) {
    console.error('Error formatting date with timezone:', error);
    return dateFnsFormat(typeof date === 'string' ? parseISO(date) : date, formatStr);
  }
}

/**
 * Converts a UTC date to a specific timezone
 */
export function toTimezone(date: Date | string, timezone: string): Date {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return toZonedTime(dateObj, timezone);
}

/**
 * Converts a date from a specific timezone to UTC
 */
export function fromTimezone(date: Date, timezone: string): Date {
  return fromZonedTime(date, timezone);
}

/**
 * Formats a time string (HH:mm) considering timezone
 */
export function formatTimeInTz(
  time: string,
  date: Date | string,
  timezone: string
): string {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    const [hours, minutes] = time.split(':').map(Number);
    
    // Create a date with the specific time
    const dateWithTime = new Date(dateObj);
    dateWithTime.setHours(hours, minutes, 0, 0);
    
    // Format in the target timezone
    return formatInTimeZone(dateWithTime, timezone, 'HH:mm', { locale: fr });
  } catch (error) {
    console.error('Error formatting time with timezone:', error);
    return time;
  }
}

/**
 * Gets current time in a specific timezone
 */
export function getCurrentTimeInTz(timezone: string): Date {
  return toZonedTime(new Date(), timezone);
}

/**
 * Formats a booking date and time for display
 */
export function formatBookingDateTime(
  date: string,
  time: string,
  timezone: string,
  formatStr: string = "d MMM yyyy 'à' HH:mm"
): string {
  try {
    const dateObj = parseISO(date);
    const [hours, minutes] = time.split(':').map(Number);
    dateObj.setHours(hours, minutes, 0, 0);
    
    return formatInTimeZone(dateObj, timezone, formatStr, { locale: fr });
  } catch (error) {
    console.error('Error formatting booking date/time:', error);
    return `${date} ${time}`;
  }
}

/**
 * Checks if a given hour is the current hour in a timezone
 */
export function isCurrentHourInTz(
  date: Date | string,
  hour: number,
  timezone: string
): boolean {
  const now = getCurrentTimeInTz(timezone);
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  const zonedDate = toZonedTime(dateObj, timezone);
  
  return (
    now.getFullYear() === zonedDate.getFullYear() &&
    now.getMonth() === zonedDate.getMonth() &&
    now.getDate() === zonedDate.getDate() &&
    now.getHours() === hour
  );
}

/**
 * Gets the current hour position for timeline indicator
 */
export function getCurrentHourPosition(
  timezone: string,
  startHour: number,
  hourHeight: number
): { top: number; visible: boolean } {
  const now = getCurrentTimeInTz(timezone);
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  
  if (currentHour < startHour || currentHour >= 22) {
    return { top: 0, visible: false };
  }
  
  const totalMinutesFromStart = (currentHour - startHour) * 60 + currentMinutes;
  const top = (totalMinutesFromStart / 60) * hourHeight;
  
  return { top, visible: true };
}
