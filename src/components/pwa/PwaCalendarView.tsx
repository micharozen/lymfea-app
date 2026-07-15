import { useState, useMemo, useEffect, useCallback } from "react";
import { format, addDays, startOfWeek, addWeeks, subWeeks } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getCalendarFlowStage } from "@/utils/statusStyles";
import { useLongPress } from "@/hooks/pwa/useLongPress";
import { BookingPreviewPopover } from "@/components/pwa/BookingPreviewPopover";

interface BookingTreatment {
  treatment_menus: { name: string; price?: number; duration?: number } | null;
}

interface Booking {
  id: string;
  booking_id: number;
  booking_date: string;
  booking_time: string;
  client_first_name: string;
  client_last_name: string;
  hotel_name: string;
  room_number: string;
  room_name?: string | null;
  status: string;
  payment_status?: string | null;
  phone: string;
  duration?: number;
  guest_count?: number | null;
  therapistName?: string | null;
  booking_treatments?: BookingTreatment[];
}

interface PwaCalendarViewProps {
  bookings: Booking[];
  onBookingClick: (booking: Booking) => void;
  onSlotClick?: (date: string, time: string) => void;
}

const HOUR_HEIGHT = 48;
const START_HOUR = 7;
const END_HOUR = 23;
// Trim a couple px off each block so back-to-back bookings keep a readable seam.
const BLOCK_GAP = 2;

const WEEK_STORAGE_KEY = "pwa-calendar-3day-week";
const INDEX_STORAGE_KEY = "pwa-calendar-3day-index";

export function PwaCalendarView({ bookings, onBookingClick, onSlotClick }: PwaCalendarViewProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const stored = typeof window !== "undefined" ? sessionStorage.getItem(WEEK_STORAGE_KEY) : null;
    if (stored) {
      const d = new Date(stored);
      if (!isNaN(d.getTime())) return d;
    }
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  });
  const [startDayIndex, setStartDayIndex] = useState(() => {
    const stored = typeof window !== "undefined" ? sessionStorage.getItem(INDEX_STORAGE_KEY) : null;
    if (stored !== null) {
      const n = parseInt(stored, 10);
      if (!isNaN(n) && n >= 0 && n <= 4) return n;
    }
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayBasedIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    return Math.min(mondayBasedIndex, 4);
  });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [preview, setPreview] = useState<Booking | null>(null);
  const { bind, consumeLongPress } = useLongPress();

  useEffect(() => {
    try {
      sessionStorage.setItem(WEEK_STORAGE_KEY, currentWeekStart.toISOString());
    } catch {
      // storage disabled — ignore
    }
  }, [currentWeekStart]);

  useEffect(() => {
    try {
      sessionStorage.setItem(INDEX_STORAGE_KEY, String(startDayIndex));
    } catch {
      // storage disabled — ignore
    }
  }, [startDayIndex]);

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

    return { top, height: Math.max(height - BLOCK_GAP, 24) };
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
    <div className="app-refonte flex flex-col h-full overflow-hidden">
      {/* Week Navigation */}
      <div className="ag-datenav">
        <button className="navb" onClick={handlePreviousWeek} aria-label="Semaine précédente">
          <ChevronLeft size={16} />
        </button>
        <div className="cur">
          <div className="d">
            {format(currentWeekStart, "d MMM", { locale: fr })} –{" "}
            {format(addDays(currentWeekStart, 6), "d MMM yyyy", { locale: fr })}
          </div>
        </div>
        <button className="navb" onClick={handleNextWeek} aria-label="Semaine suivante">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day Selector Strip */}
      <div className="flex items-center gap-1 px-2 py-2 overflow-x-auto" style={{ borderBottom: "1px solid var(--line-soft)" }}>
        {weekDays.map((day, index) => {
          const isSelected = index >= startDayIndex && index < startDayIndex + 3;
          const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
          const bookingCount = getBookingCountForDay(day);

          return (
            <button
              key={day.toISOString()}
              onClick={() => setStartDayIndex(Math.min(index, 4))}
              className="flex flex-col items-center min-w-[42px] px-2 py-1.5 rounded-lg transition-colors"
              style={
                isSelected
                  ? { background: "var(--accent)", color: "var(--on-accent)" }
                  : isToday
                    ? { background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)" }
                    : { color: "var(--ink-soft)" }
              }
            >
              <span className="text-[10px] font-medium uppercase">
                {format(day, "EEE", { locale: fr })}
              </span>
              <span className="text-sm font-bold" style={{ fontFamily: "var(--serif)" }}>{format(day, "d")}</span>
              {bookingCount > 0 && (
                <span
                  className="text-[9px] rounded-full px-1.5 mt-0.5"
                  style={isSelected
                    ? { background: "color-mix(in srgb, var(--on-accent) 22%, transparent)" }
                    : { background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }}
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
          <div className="sticky top-0 z-10 grid grid-cols-[50px_repeat(3,1fr)]" style={{ background: "var(--sand-100)", borderBottom: "1px solid var(--line-soft)" }}>
            <div className="p-2" style={{ borderRight: "1px solid var(--line-soft)" }}>
              <span className="text-[10px] font-medium" style={{ color: "var(--ink-mute)" }}>Heure</span>
            </div>
            {visibleDays.map((day) => {
              const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
              return (
                <div
                  key={day.toISOString()}
                  className="p-2 text-center"
                  style={{ borderRight: "1px solid var(--line-soft)" }}
                >
                  <div className="text-[10px] font-medium uppercase" style={{ color: "var(--ink-mute)" }}>
                    {format(day, "EEE", { locale: fr })}
                  </div>
                  <div className="text-lg font-bold" style={{ fontFamily: "var(--serif)", color: isToday ? "var(--accent)" : "var(--ink)" }}>
                    {format(day, "d")}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time Grid */}
          <div className="grid grid-cols-[50px_repeat(3,1fr)]">
            {/* Hours Column */}
            <div style={{ borderRight: "1px solid var(--line-soft)" }}>
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="flex items-start justify-end pr-2 pt-1"
                  style={{ height: `${HOUR_HEIGHT}px`, borderBottom: "1px solid var(--line-soft)" }}
                >
                  <span className="text-[10px] font-medium" style={{ color: "var(--ink-mute)" }}>
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
                  className="relative"
                  style={{
                    borderRight: "1px solid var(--line-soft)",
                    background: isToday ? "color-mix(in srgb, var(--accent) 4%, transparent)" : undefined,
                  }}
                >
                  {/* Hour Grid Lines */}
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className={onSlotClick ? "cursor-pointer transition-colors" : ""}
                      style={{ height: `${HOUR_HEIGHT}px`, borderBottom: "1px solid var(--line-soft)" }}
                      onClick={() => {
                        if (onSlotClick) {
                          onSlotClick(
                            format(day, "yyyy-MM-dd"),
                            `${hour.toString().padStart(2, "0")}:00`
                          );
                        }
                      }}
                    />
                  ))}

                  {/* Bookings */}
                  {dayBookings.map((booking) => {
                    const { top, height } = getBookingPosition(booking);
                    const flowStage = getCalendarFlowStage(booking.status, booking.payment_status);

                    return (
                      <div
                        key={booking.id}
                        className={`absolute left-0.5 right-0.5 rounded text-xs cursor-pointer overflow-hidden z-10 select-none ${flowStage.cardClass}`}
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          minHeight: "24px",
                        }}
                        {...bind(() => setPreview(booking))}
                        onClick={() => {
                          if (consumeLongPress()) return;
                          onBookingClick(booking);
                        }}
                      >
                        <div className="p-1 h-full flex flex-col">
                          <div className="flex items-center gap-1 font-bold text-[11px] leading-tight">
                            {booking.booking_time?.substring(0, 5)}
                            {(booking.guest_count ?? 1) > 1 && (
                              <span className="rounded-full bg-blue-600 px-1 py-px text-[8px] font-bold uppercase leading-none text-white shrink-0">
                                Duo
                              </span>
                            )}
                          </div>
                          {height >= 36 && (
                            <div className="truncate text-[9px] opacity-90">
                              {booking.client_first_name}
                            </div>
                          )}
                          {height >= 48 && booking.room_name && (
                            <div className="truncate text-[8px] opacity-80 font-medium">
                              {booking.room_name}
                            </div>
                          )}
                          {height >= 48 && !booking.room_name && (
                            <div className="truncate text-[8px] opacity-75">
                              {booking.hotel_name}
                            </div>
                          )}
                          {height >= 64 && booking.therapistName && (
                            <div className="truncate text-[8px] opacity-75">
                              {booking.therapistName}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Current Time Indicator */}
                  {showIndicator && (
                    <div
                      className="absolute left-0 right-0 z-20 pointer-events-none"
                      style={{ top: `${currentTimeTop}px`, height: 0, borderTop: "1.5px solid var(--clay)" }}
                    >
                      <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full" style={{ background: "var(--clay)" }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <BookingPreviewPopover booking={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

export default PwaCalendarView;
