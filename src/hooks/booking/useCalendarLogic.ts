import { useState, useMemo, useEffect, useCallback } from "react";
import { format, addDays, startOfWeek, addWeeks, subWeeks } from "date-fns";
import { getBookingStatusConfig, getPaymentStatusConfig } from "@/utils/statusStyles";
import type { BookingWithTreatments } from "./useBookingData";

export const CALENDAR_CONSTANTS = {
  START_HOUR: 7,
  END_HOUR: 24,
  HOUR_HEIGHT: 40,
} as const;

interface UseCalendarLogicOptions {
  filteredBookings: BookingWithTreatments[] | undefined;
  activeTimezone: string;
}

export function useCalendarLogic({ filteredBookings, activeTimezone }: UseCalendarLogicOptions) {
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [currentTime, setCurrentTime] = useState(new Date());

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
    return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  }, [currentWeekStart]);

  const handlePreviousWeek = useCallback(() => {
    setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  }, [currentWeekStart]);

  const handleNextWeek = useCallback(() => {
    setCurrentWeekStart(addWeeks(currentWeekStart, 1));
  }, [currentWeekStart]);

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
    // Week navigation
    currentWeekStart,
    weekDays,
    handlePreviousWeek,
    handleNextWeek,

    // Time
    currentTime,
    hours,
    timeSlots,

    // Booking helpers
    getBookingsForDay,
    getBookingPosition,
    isCurrentHour,
    getCurrentTimePosition,

    // Status helpers
    getStatusColor,
    getTranslatedStatus,
    getStatusCardColor,
    getCombinedStatusLabel,
    getPaymentStatusBadge,

    // Constants
    startHour: CALENDAR_CONSTANTS.START_HOUR,
    endHour: CALENDAR_CONSTANTS.END_HOUR,
    hourHeight: CALENDAR_CONSTANTS.HOUR_HEIGHT,
  };
}
