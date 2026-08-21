import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { format, addDays, startOfWeek, startOfDay, parseISO, isValid } from "date-fns";
import { getBookingStatusConfig, getPaymentStatusConfig, getCalendarFlowStage, translateStatusLabel } from "@/utils/statusStyles";
import type { BookingWithTreatments } from "./useBookingData";

const DATE_PARAM = "date";

export const CALENDAR_CONSTANTS = {
  START_HOUR: 7,
  END_HOUR: 24,
  // Taller rows so a 50-min booking (~100px) comfortably fits its key info on
  // the card without clicking: time range + therapist name, client, treatments, room.
  HOUR_HEIGHT: 120,
} as const;

/** Minimal shape needed to lay out a block on the calendar grid. */
export interface CalendarLayoutItem {
  id: string;
  startMinutes: number;
  duration: number;
}

export interface CalendarLayoutSlot {
  column: number;
  totalColumns: number;
}

/** Convert a treatment booking into a layout item. */
export function toLayoutItem(booking: BookingWithTreatments): CalendarLayoutItem {
  const [h, m] = (booking.booking_time || "0:0").split(":").map(Number);
  return {
    id: booking.id,
    startMinutes: h * 60 + m,
    duration: (booking.totalDuration && booking.totalDuration > 0) ? booking.totalDuration : 60,
  };
}

/**
 * Assign non-overlapping columns to a set of time blocks: overlapping blocks are
 * grouped into clusters, then each cluster is split into as many columns as needed.
 */
export function computeColumnLayout(items: CalendarLayoutItem[]): Map<string, CalendarLayoutSlot> {
  const layout = new Map<string, CalendarLayoutSlot>();
  if (items.length === 0) return layout;

  // Sort by start time, then by id for stable ordering
  const sorted = [...items].sort((a, b) => {
    const diff = a.startMinutes - b.startMinutes;
    return diff !== 0 ? diff : (a.id || '').localeCompare(b.id || '');
  });

  // Group overlapping items into clusters
  const clusters: CalendarLayoutItem[][] = [];
  let currentCluster: CalendarLayoutItem[] = [];
  let clusterEnd = -1;

  for (const item of sorted) {
    const end = item.startMinutes + item.duration;

    if (currentCluster.length === 0 || item.startMinutes < clusterEnd) {
      currentCluster.push(item);
      clusterEnd = Math.max(clusterEnd, end);
    } else {
      clusters.push(currentCluster);
      currentCluster = [item];
      clusterEnd = end;
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster);

  // Assign columns within each cluster
  for (const cluster of clusters) {
    const columns: number[] = []; // end time of each column
    const assignments = new Map<string, number>();

    for (const item of cluster) {
      // Find first column where this item fits (no overlap)
      let col = columns.findIndex(colEnd => colEnd <= item.startMinutes);
      if (col === -1) {
        col = columns.length;
        columns.push(0);
      }
      columns[col] = item.startMinutes + item.duration;
      assignments.set(item.id, col);
    }

    const totalColumns = columns.length;
    for (const item of cluster) {
      layout.set(item.id, {
        column: assignments.get(item.id) || 0,
        totalColumns,
      });
    }
  }

  return layout;
}

interface UseCalendarLogicOptions {
  filteredBookings: BookingWithTreatments[] | undefined;
  activeTimezone: string;
  dayCount?: number;
  /**
   * Mirror the displayed date in the URL (`?date=yyyy-MM-dd`) so it survives
   * navigating to a booking and coming back, and stays shareable.
   */
  persistDateInUrl?: boolean;
}

export function useCalendarLogic({
  filteredBookings,
  activeTimezone,
  dayCount = 7,
  persistDateInUrl = false,
}: UseCalendarLogicOptions) {
  const [searchParams, setSearchParams] = useSearchParams();

  const normalize = useCallback(
    (date: Date) => (dayCount === 7 ? startOfWeek(date, { weekStartsOn: 1 }) : startOfDay(date)),
    [dayCount]
  );

  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const raw = persistDateInUrl ? searchParams.get(DATE_PARAM) : null;
    const parsed = raw ? parseISO(raw) : null;
    const base = parsed && isValid(parsed) ? parsed : new Date();
    return dayCount === 7 ? startOfWeek(base, { weekStartsOn: 1 }) : startOfDay(base);
  });
  const [currentTime, setCurrentTime] = useState(new Date());

  const goToDate = useCallback((date: Date) => {
    const next = normalize(date);
    setCurrentWeekStart(next);
    if (persistDateInUrl) {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set(DATE_PARAM, format(next, "yyyy-MM-dd"));
          return params;
        },
        { replace: true }
      );
    }
  }, [normalize, persistDateInUrl, setSearchParams]);

  // Re-normalize the *displayed* date when dayCount changes (week start vs day start)
  // instead of jumping back to today.
  useEffect(() => {
    setCurrentWeekStart(prev => normalize(prev));
  }, [normalize]);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const hours = useMemo(() => {
    return Array.from(
      { length: CALENDAR_CONSTANTS.END_HOUR - CALENDAR_CONSTANTS.START_HOUR },
      (_, i) => i + CALENDAR_CONSTANTS.START_HOUR
    );
  }, []);

  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = 7; hour <= 22; hour++) {
      for (let minute = 0; minute < 60; minute += 10) {
        slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
      }
    }
    slots.push('23:00');
    return slots;
  }, []);

  const weekDays = useMemo(() => {
    return Array.from({ length: dayCount }, (_, i) => addDays(currentWeekStart, i));
  }, [currentWeekStart, dayCount]);

  const handlePrevious = useCallback(() => {
    goToDate(addDays(currentWeekStart, -dayCount));
  }, [goToDate, currentWeekStart, dayCount]);

  const handleNext = useCallback(() => {
    goToDate(addDays(currentWeekStart, dayCount));
  }, [goToDate, currentWeekStart, dayCount]);

  const goToToday = useCallback(() => {
    goToDate(new Date());
  }, [goToDate]);

  const setViewDate = goToDate;

  const getBookingsForDay = useCallback((date: Date) => {
    return filteredBookings?.filter((booking) => {
      const bookingDate = booking.booking_date === format(date, "yyyy-MM-dd");
      if (!bookingDate || !booking.booking_time) return false;

      const [hours] = booking.booking_time.split(':').map(Number);
      return hours >= CALENDAR_CONSTANTS.START_HOUR && hours < CALENDAR_CONSTANTS.END_HOUR;
    }) || [];
  }, [filteredBookings]);

  const getBookingPosition = useCallback((booking: BookingWithTreatments) => {
    if (!booking.booking_time) return { top: 0, height: CALENDAR_CONSTANTS.HOUR_HEIGHT };

    const [hours, minutes] = booking.booking_time.split(':').map(Number);
    const duration = booking.totalDuration && booking.totalDuration > 0
      ? booking.totalDuration
      : 60;

    const totalMinutesFromStart = (hours - CALENDAR_CONSTANTS.START_HOUR) * 60 + minutes;
    const top = (totalMinutesFromStart / 60) * CALENDAR_CONSTANTS.HOUR_HEIGHT;
    const height = (duration / 60) * CALENDAR_CONSTANTS.HOUR_HEIGHT;

    return { top, height: Math.max(height, 20) };
  }, []);

  const getBookingsLayoutForDay = useCallback((bookings: BookingWithTreatments[]) => {
    return computeColumnLayout(bookings.map(toLayoutItem));
  }, []);

  const isCurrentHour = useCallback((date: Date, hour: number) => {
    if (format(date, "yyyy-MM-dd") !== format(new Date(), "yyyy-MM-dd")) return false;
    const now = new Date(currentTime.toLocaleString("en-US", { timeZone: activeTimezone }));
    return now.getHours() === hour;
  }, [currentTime, activeTimezone]);

  const getCurrentTimePosition = useCallback((date: Date) => {
    const isToday = format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
    const now = new Date(currentTime.toLocaleString("en-US", { timeZone: activeTimezone }));
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const showIndicator = isToday && currentHour >= CALENDAR_CONSTANTS.START_HOUR && currentHour < CALENDAR_CONSTANTS.END_HOUR;
    const position = showIndicator
      ? ((currentHour - CALENDAR_CONSTANTS.START_HOUR) * 60 + currentMinute) / 60 * CALENDAR_CONSTANTS.HOUR_HEIGHT
      : 0;

    return { showIndicator, position };
  }, [currentTime, activeTimezone]);

  // Status helpers
  const getStatusColor = useCallback((status: string) => {
    return getBookingStatusConfig(status).badgeClass;
  }, []);

  const getTranslatedStatus = useCallback((status: string) => {
    return getBookingStatusConfig(status).label;
  }, []);

  const getStatusCardColor = useCallback((status: string, paymentStatus?: string | null) => {
    if (paymentStatus === 'pending' && status !== 'cancelled') {
      return getPaymentStatusConfig('pending').cardClass;
    }
    return getBookingStatusConfig(status).cardClass;
  }, []);

  const getCalendarCardColor = useCallback((status: string, paymentStatus?: string | null) => {
    return getCalendarFlowStage(status, paymentStatus).cardClass;
  }, []);

  const getCombinedStatusLabel = useCallback((status: string, paymentStatus?: string | null) => {
    return translateStatusLabel(getCalendarFlowStage(status, paymentStatus).labelKey);
  }, []);

  const getPaymentStatusBadge = useCallback((paymentStatus?: string | null) => {
    if (!paymentStatus) return { label: '-', className: 'bg-muted/50 text-muted-foreground' };
    const config = getPaymentStatusConfig(paymentStatus);
    return { label: config.label, className: config.badgeClass };
  }, []);

  return {
    // Navigation
    currentWeekStart,
    weekDays,
    handlePreviousWeek: handlePrevious,
    handleNextWeek: handleNext,
    goToToday,
    setViewDate,

    // Time
    currentTime,
    hours,
    timeSlots,

    // Booking helpers
    getBookingsForDay,
    getBookingPosition,
    getBookingsLayoutForDay,
    isCurrentHour,
    getCurrentTimePosition,

    // Status helpers
    getStatusColor,
    getTranslatedStatus,
    getStatusCardColor,
    getCalendarCardColor,
    getCombinedStatusLabel,
    getPaymentStatusBadge,

    // Constants
    startHour: CALENDAR_CONSTANTS.START_HOUR,
    endHour: CALENDAR_CONSTANTS.END_HOUR,
    hourHeight: CALENDAR_CONSTANTS.HOUR_HEIGHT,
  };
}
