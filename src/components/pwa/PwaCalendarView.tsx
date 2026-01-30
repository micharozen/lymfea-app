import { useState, useMemo, useEffect, useCallback } from "react";
import { format, addDays, startOfWeek, addWeeks, subWeeks } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getBookingStatusConfig } from "@/utils/statusStyles";

interface Booking {
  id: string;
  booking_id: number;
  booking_date: string;
  booking_time: string;
  client_first_name: string;
  client_last_name: string;
  hotel_name: string;
  room_number: string;
  status: string;
  phone: string;
  duration?: number;
}

interface PwaCalendarViewProps {
  bookings: Booking[];
  onBookingClick: (booking: Booking) => void;
}

const HOUR_HEIGHT = 48;
const START_HOUR = 7;
const END_HOUR = 23;

export function PwaCalendarView({ bookings, onBookingClick }: PwaCalendarViewProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 }) // Monday start
  );
  const [startDayIndex, setStartDayIndex] = useState(() => {
    // Start with today visible if possible
    const today = new Date();
    const dayOfWeek = today.getDay();
    // Convert to Monday-based index (Mon=0, Sun=6)
    const mondayBasedIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    // Ensure 3 days are visible (max startDayIndex is 4)
    return Math.min(mondayBasedIndex, 4);
  });
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  }, [currentWeekStart]);

  const visibleDays = useMemo(() => {
    return weekDays.slice(startDayIndex, startDayIndex + 3);
  }, [weekDays, startDayIndex]);

  const hours = useMemo(() => {
    return Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR);
  }, []);

  const handlePreviousWeek = useCallback(() => {
    setCurrentWeekStart(subWeeks(currentWeekStart, 1));
    setStartDayIndex(0);
  }, [currentWeekStart]);

  const handleNextWeek = useCallback(() => {
    setCurrentWeekStart(addWeeks(currentWeekStart, 1));
    setStartDayIndex(0);
  }, [currentWeekStart]);

  const getBookingsForDay = useCallback(
    (date: Date) => {
      const dateStr = format(date, "yyyy-MM-dd");
      return bookings.filter((booking) => {
        if (booking.booking_date !== dateStr || !booking.booking_time) return false;
        const [hours] = booking.booking_time.split(":").map(Number);
        return hours >= START_HOUR && hours < END_HOUR;
      });
    },
    [bookings]
  );

  const getBookingPosition = useCallback((booking: Booking) => {
    if (!booking.booking_time) return { top: 0, height: HOUR_HEIGHT };

    const [hours, minutes] = booking.booking_time.split(":").map(Number);
    const duration = booking.duration || 60;

    const totalMinutesFromStart = (hours - START_HOUR) * 60 + minutes;
    const top = (totalMinutesFromStart / 60) * HOUR_HEIGHT;
    const height = (duration / 60) * HOUR_HEIGHT;

    return { top, height: Math.max(height, 24) };
  }, []);

  const getCurrentTimePosition = useCallback(
    (date: Date) => {
      const isToday = format(date, "yyyy-MM-dd") === format(currentTime, "yyyy-MM-dd");
      const currentHour = currentTime.getHours();
      const currentMinute = currentTime.getMinutes();
      const showIndicator = isToday && currentHour >= START_HOUR && currentHour < END_HOUR;
      const position = showIndicator
        ? ((currentHour - START_HOUR) * 60 + currentMinute) / 60 * HOUR_HEIGHT
        : 0;

      return { showIndicator, position };
    },
    [currentTime]
  );

  const getBookingCountForDay = useCallback(
    (date: Date) => {
      return getBookingsForDay(date).length;
    },
    [getBookingsForDay]
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Week Navigation */}
      <div className="flex items-center justify-between px-2 py-3 border-b bg-background">
        <Button variant="ghost" size="sm" onClick={handlePreviousWeek} className="px-2">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold text-center">
          {format(currentWeekStart, "d MMM", { locale: fr })} -{" "}
          {format(addDays(currentWeekStart, 6), "d MMM yyyy", { locale: fr })}
        </h2>
        <Button variant="ghost" size="sm" onClick={handleNextWeek} className="px-2">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day Selector Strip */}
      <div className="flex items-center gap-1 px-2 py-2 border-b bg-muted/30 overflow-x-auto">
        {weekDays.map((day, index) => {
          const isSelected = index >= startDayIndex && index < startDayIndex + 3;
          const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
          const bookingCount = getBookingCountForDay(day);

          return (
            <button
              key={day.toISOString()}
              onClick={() => setStartDayIndex(Math.min(index, 4))}
              className={`flex flex-col items-center min-w-[42px] px-2 py-1.5 rounded-lg transition-colors ${
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : isToday
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted"
              }`}
            >
              <span className="text-[10px] font-medium uppercase">
                {format(day, "EEE", { locale: fr })}
              </span>
              <span className="text-sm font-bold">{format(day, "d")}</span>
              {bookingCount > 0 && (
                <span
                  className={`text-[9px] rounded-full px-1.5 mt-0.5 ${
                    isSelected ? "bg-primary-foreground/20" : "bg-primary/20 text-primary"
                  }`}
                >
                  {bookingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto">
        <div className="min-h-full">
          {/* Day Headers */}
          <div className="sticky top-0 z-10 grid grid-cols-[50px_repeat(3,1fr)] bg-background border-b">
            <div className="p-2 border-r bg-muted/50">
              <span className="text-[10px] font-medium text-muted-foreground">Heure</span>
            </div>
            {visibleDays.map((day) => {
              const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
              return (
                <div
                  key={day.toISOString()}
                  className={`p-2 text-center border-r last:border-r-0 ${
                    isToday ? "bg-primary/5" : "bg-muted/50"
                  }`}
                >
                  <div className="text-[10px] font-medium text-muted-foreground uppercase">
                    {format(day, "EEE", { locale: fr })}
                  </div>
                  <div className={`text-lg font-bold ${isToday ? "text-primary" : ""}`}>
                    {format(day, "d")}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time Grid */}
          <div className="grid grid-cols-[50px_repeat(3,1fr)]">
            {/* Hours Column */}
            <div className="border-r bg-muted/20">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="border-b flex items-start justify-end pr-2 pt-1"
                  style={{ height: `${HOUR_HEIGHT}px` }}
                >
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {hour.toString().padStart(2, "0")}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Day Columns */}
            {visibleDays.map((day) => {
              const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
              const dayBookings = getBookingsForDay(day);
              const { showIndicator, position: currentTimeTop } = getCurrentTimePosition(day);

              return (
                <div
                  key={day.toISOString()}
                  className={`relative border-r last:border-r-0 ${isToday ? "bg-primary/[0.02]" : ""}`}
                >
                  {/* Hour Grid Lines */}
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="border-b"
                      style={{ height: `${HOUR_HEIGHT}px` }}
                    />
                  ))}

                  {/* Bookings */}
                  {dayBookings.map((booking) => {
                    const { top, height } = getBookingPosition(booking);
                    const statusConfig = getBookingStatusConfig(booking.status);

                    return (
                      <div
                        key={booking.id}
                        className={`absolute left-0.5 right-0.5 rounded text-xs cursor-pointer overflow-hidden z-10 ${statusConfig.cardClass}`}
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          minHeight: "24px",
                        }}
                        onClick={() => onBookingClick(booking)}
                      >
                        <div className="p-1 h-full flex flex-col">
                          <div className="font-bold text-[11px] leading-tight">
                            {booking.booking_time?.substring(0, 5)}
                          </div>
                          {height >= 36 && (
                            <div className="truncate text-[9px] opacity-90">
                              {booking.client_first_name}
                            </div>
                          )}
                          {height >= 48 && (
                            <div className="truncate text-[8px] opacity-75">
                              {booking.hotel_name}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Current Time Indicator */}
                  {showIndicator && (
                    <div
                      className="absolute left-0 right-0 h-0.5 bg-destructive z-20 pointer-events-none"
                      style={{ top: `${currentTimeTop}px` }}
                    >
                      <div className="absolute -left-1 -top-1 w-2 h-2 bg-destructive rounded-full" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PwaCalendarView;
