import { useState, useMemo, useEffect, useCallback } from "react";
import { format, addDays, startOfWeek, startOfDay } from "date-fns";
import { getBookingStatusConfig, getPaymentStatusConfig } from "@/utils/statusStyles";
import type { BookingWithTreatments } from "./useBookingData";

export const CALENDAR_CONSTANTS = {
  START_HOUR: 7,
  END_HOUR: 24,
  HOUR_HEIGHT: 48,
} as const;

interface UseCalendarLogicOptions {
  filteredBookings: BookingWithTreatments[] | undefined;
  activeTimezone: string;
  dayCount?: number;
}

export function useCalendarLogic({ filteredBookings, activeTimezone, dayCount = 7 }: UseCalendarLogicOptions) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    if (dayCount === 7) {
      return startOfWeek(new Date(), { weekStartsOn: 1 });
    }
    return startOfDay(new Date());
  });
  const [currentTime, setCurrentTime] = useState(new Date());

  // Reset start date when dayCount changes
  useEffect(() => {
    if (dayCount === 7) {
      setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
    } else {
      setCurrentWeekStart(startOfDay(new Date()));
    }
  }, [dayCount]);

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
    setCurrentWeekStart(prev => addDays(prev, -dayCount));
  }, [dayCount]);

  const handleNext = useCallback(() => {
    setCurrentWeekStart(prev => addDays(prev, dayCount));
  }, [dayCount]);

  const goToToday = useCallback(() => {
    if (dayCount === 7) {
      setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
    } else {
      setCurrentWeekStart(startOfDay(new Date()));
    }
  }, [dayCount]);

  const setViewDate = useCallback((date: Date) => {
    if (dayCount === 7) {
      setCurrentWeekStart(startOfWeek(date, { weekStartsOn: 1 }));
    } else {
      setCurrentWeekStart(startOfDay(date));
    }
  }, [dayCount]);

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

  const getBookingsLayoutForDay = useCallback((bookings: BookingWithTreatments[]): Map<string, { column: number; totalColumns: number }> => {
    const layout = new Map<string, { column: number; totalColumns: number }>();
    if (bookings.length === 0) return layout;

    const getStartMinutes = (b: BookingWithTreatments) => {
      if (!b.booking_time) return 0;
      const [h, m] = b.booking_time.split(':').map(Number);
      return h * 60 + m;
    };

    const getDuration = (b: BookingWithTreatments) =>
      (b.totalDuration && b.totalDuration > 0) ? b.totalDuration : 60;

    // Sort by start time, then by id for stable ordering
    const sorted = [...bookings].sort((a, b) => {
      const diff = getStartMinutes(a) - getStartMinutes(b);
      return diff !== 0 ? diff : (a.id || '').localeCompare(b.id || '');
    });

    // Group overlapping bookings into clusters
    const clusters: BookingWithTreatments[][] = [];
    let currentCluster: BookingWithTreatments[] = [];
    let clusterEnd = -1;

    for (const booking of sorted) {
      const start = getStartMinutes(booking);
      const end = start + getDuration(booking);

      if (currentCluster.length === 0 || start < clusterEnd) {
        currentCluster.push(booking);
        clusterEnd = Math.max(clusterEnd, end);
      } else {
        clusters.push(currentCluster);
        currentCluster = [booking];
        clusterEnd = end;
      }
    }
    if (currentCluster.length > 0) clusters.push(currentCluster);

    // Assign columns within each cluster
    for (const cluster of clusters) {
      const columns: number[] = []; // end time of each column
      const assignments = new Map<string, number>();

      for (const booking of cluster) {
        const start = getStartMinutes(booking);
        // Find first column where this booking fits (no overlap)
        let col = columns.findIndex(colEnd => colEnd <= start);
        if (col === -1) {
          col = columns.length;
          columns.push(0);
        }
        columns[col] = start + getDuration(booking);
        assignments.set(booking.id, col);
      }

      const totalColumns = columns.length;
      for (const booking of cluster) {
        layout.set(booking.id, {
          column: assignments.get(booking.id) || 0,
          totalColumns,
        });
      }
    }

    return layout;
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
    if (paymentStatus === 'pending' && status !== 'cancelled') {
      return 'bg-yellow-50 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-100';
    }
    const config = getBookingStatusConfig(status);
    return config.calendarCardClass || config.cardClass;
  }, []);

  const getCombinedStatusLabel = useCallback((status: string, paymentStatus?: string | null) => {
    if (paymentStatus === 'pending' && status !== 'cancelled') {
      return "€ Paiement";
    }
    return getBookingStatusConfig(status).label;
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
