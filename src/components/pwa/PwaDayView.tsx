import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { format, addDays, subDays, isToday, addMinutes, parse } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays, Clock, Euro, Check } from "lucide-react";
import { getBookingStatusConfig } from "@/utils/statusStyles";
import { formatPrice } from "@/lib/formatPrice";

interface BookingTreatment {
  treatment_menus: {
    name: string;
    price: number;
    duration: number;
  } | null;
}

export interface DayViewBooking {
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
  isUnassigned?: boolean;
  total_price?: number | null;
  therapist_commission?: number | null;
  booking_treatments?: BookingTreatment[];
}

interface PwaDayViewProps {
  bookings: DayViewBooking[];
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onBookingClick: (booking: DayViewBooking) => void;
  onSlotClick?: (date: string, time: string) => void;
  onAcceptBooking?: (booking: DayViewBooking) => void;
}

const HOUR_HEIGHT = 80;
const START_HOUR = 7;
const END_HOUR = 23;
const SWIPE_THRESHOLD = 50;

function getTreatmentNames(booking: DayViewBooking): string {
  if (!booking.booking_treatments || booking.booking_treatments.length === 0) return "";
  return booking.booking_treatments
    .map((bt) => bt.treatment_menus?.name)
    .filter(Boolean)
    .join(", ");
}

function calculateTotalPrice(booking: DayViewBooking): number {
  if (booking.total_price && booking.total_price > 0) return booking.total_price;
  if (!booking.booking_treatments || booking.booking_treatments.length === 0) return 0;
  return booking.booking_treatments.reduce(
    (sum, bt) => sum + (bt.treatment_menus?.price || 0),
    0
  );
}

function calculateDuration(booking: DayViewBooking): number {
  if (booking.duration && booking.duration > 0) return booking.duration;
  if (!booking.booking_treatments || booking.booking_treatments.length === 0) return 60;
  const dur = booking.booking_treatments.reduce(
    (sum, bt) => sum + (bt.treatment_menus?.duration || 0),
    0
  );
  return dur > 0 ? dur : 60;
}

function formatEndTime(startTime: string, durationMin: number): string {
  const parsed = parse(startTime.substring(0, 5), "HH:mm", new Date());
  const end = addMinutes(parsed, durationMin);
  return format(end, "HH:mm");
}

export function PwaDayView({
  bookings,
  selectedDate,
  onDateChange,
  onBookingClick,
  onSlotClick,
  onAcceptBooking,
}: PwaDayViewProps) {
  const { t, i18n } = useTranslation("pwa");
  const [currentTime, setCurrentTime] = useState(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const dateLocale = i18n.language === "fr" ? fr : enUS;

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const hours = useMemo(
    () => Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR),
    []
  );

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const getBookingsForDay = useCallback(
    (date: Date) => {
      const ds = format(date, "yyyy-MM-dd");
      return bookings
        .filter((b) => {
          if (b.booking_date !== ds || !b.booking_time) return false;
          const [h] = b.booking_time.split(":").map(Number);
          return h >= START_HOUR && h < END_HOUR;
        })
        .sort((a, b) => a.booking_time.localeCompare(b.booking_time));
    },
    [bookings]
  );

  const dayBookings = useMemo(
    () => getBookingsForDay(selectedDate),
    [getBookingsForDay, selectedDate]
  );

  // Auto-scroll to first booking or 8 AM on date change
  useEffect(() => {
    if (!scrollRef.current) return;
    let scrollToHour = 8;
    if (dayBookings.length > 0) {
      const firstTime = dayBookings[0].booking_time;
      const [h] = firstTime.split(":").map(Number);
      scrollToHour = Math.max(h - 1, START_HOUR);
    }
    const scrollTop =
      ((scrollToHour - START_HOUR) / (END_HOUR - START_HOUR)) *
      scrollRef.current.scrollHeight;
    scrollRef.current.scrollTop = scrollTop;
  }, [selectedDate, dayBookings]);

  const getBookingPosition = useCallback((booking: DayViewBooking) => {
    if (!booking.booking_time) return { top: 0, height: HOUR_HEIGHT };
    const [h, m] = booking.booking_time.split(":").map(Number);
    const duration = calculateDuration(booking);
    const totalMinutesFromStart = (h - START_HOUR) * 60 + m;
    const top = (totalMinutesFromStart / 60) * HOUR_HEIGHT;
    const height = (duration / 60) * HOUR_HEIGHT;
    return { top, height: Math.max(height, 40) };
  }, []);

  const getCurrentTimePosition = useCallback(() => {
    const isTodayDate =
      format(selectedDate, "yyyy-MM-dd") === format(currentTime, "yyyy-MM-dd");
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const showIndicator =
      isTodayDate && currentHour >= START_HOUR && currentHour < END_HOUR;
    const position = showIndicator
      ? ((currentHour - START_HOUR) * 60 + currentMinute) / 60 * HOUR_HEIGHT
      : 0;
    return { showIndicator, position };
  }, [currentTime, selectedDate]);

  const daySummary = useMemo(() => {
    const count = dayBookings.length;
    const totalMinutes = dayBookings.reduce(
      (sum, b) => sum + calculateDuration(b),
      0
    );
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const hoursLabel = mins > 0 ? `${hours}h${mins.toString().padStart(2, "0")}` : `${hours}h`;

    const totalEarnings = dayBookings.reduce((sum, b) => {
      const total = calculateTotalPrice(b);
      const commission = b.therapist_commission ?? 70;
      return sum + total * (commission / 100);
    }, 0);

    return { count, hoursLabel, totalEarnings };
  }, [dayBookings]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const deltaX = endX - touchStartRef.current.x;
      const deltaY = endY - touchStartRef.current.y;
      touchStartRef.current = null;

      if (Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX < 0) {
          onDateChange(addDays(selectedDate, 1));
        } else {
          onDateChange(subDays(selectedDate, 1));
        }
      }
    },
    [selectedDate, onDateChange]
  );

  const { showIndicator, position: currentTimeTop } = getCurrentTimePosition();
  const isTodaySelected = isToday(selectedDate);

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b bg-background">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDateChange(subDays(selectedDate, 1))}
          className="px-2"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-center capitalize">
            {format(selectedDate, "EEEE d MMMM", { locale: dateLocale })}
          </h2>
          {!isTodaySelected && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs font-medium"
              onClick={() => onDateChange(new Date())}
            >
              {t("calendar.today", "Aujourd'hui")}
            </Button>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDateChange(addDays(selectedDate, 1))}
          className="px-2"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 px-3 py-2.5 border-b bg-muted/20">
        <div className="flex items-center gap-2 bg-background rounded-lg px-3 py-2 shadow-sm">
          <CalendarDays className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-bold">{daySummary.count}</div>
            <div className="text-[10px] text-muted-foreground truncate">
              {t("calendar.appointments", "Rendez-vous")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-background rounded-lg px-3 py-2 shadow-sm">
          <Clock className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-bold">{daySummary.hoursLabel}</div>
            <div className="text-[10px] text-muted-foreground truncate">
              {t("calendar.hoursWorked", "Heures")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-background rounded-lg px-3 py-2 shadow-sm">
          <Euro className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-bold">
              {formatPrice(Math.round(daySummary.totalEarnings), "EUR", { decimals: 0 })}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              {t("calendar.estimatedEarnings", "Revenus estimés")}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto" ref={scrollRef}>
        <div className="min-h-full">
          <div className="grid grid-cols-[50px_1fr]">
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

            <div className={`relative ${isTodaySelected ? "bg-primary/[0.02]" : ""}`}>
              {hours.map((hour) => (
                <div
                  key={hour}
                  className={`border-b ${
                    onSlotClick
                      ? "cursor-pointer hover:bg-primary/5 active:bg-primary/10 transition-colors"
                      : ""
                  }`}
                  style={{ height: `${HOUR_HEIGHT}px` }}
                  onClick={() => {
                    if (onSlotClick) {
                      onSlotClick(dateStr, `${hour.toString().padStart(2, "0")}:00`);
                    }
                  }}
                />
              ))}

              {dayBookings.map((booking) => {
                const { top, height } = getBookingPosition(booking);
                const statusConfig = getBookingStatusConfig(booking.status);
                const duration = calculateDuration(booking);
                const endTime = formatEndTime(booking.booking_time, duration);
                const treatmentNames = getTreatmentNames(booking);

                return (
                  <div
                    key={booking.id}
                    className={`absolute left-1 right-1 rounded-lg text-xs cursor-pointer overflow-hidden z-10 ${statusConfig.cardClass} ${
                      booking.isUnassigned
                        ? "opacity-75 border-2 border-dashed border-white/60"
                        : ""
                    }`}
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      minHeight: "40px",
                    }}
                    onClick={() => onBookingClick(booking)}
                  >
                    <div
                      className="h-full flex items-center overflow-hidden"
                      style={{ padding: height <= 44 ? "2px 8px" : "6px 8px" }}
                    >
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        {height <= 44 ? (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-bold text-[12px] leading-none shrink-0">
                              {booking.booking_time?.substring(0, 5)} - {endTime}
                            </span>
                            <span className="text-[11px] font-medium truncate">
                              {booking.isUnassigned
                                ? booking.client_first_name || t("calendar.toConfirm", "À confirmer")
                                : booking.client_first_name}
                            </span>
                            {treatmentNames && (
                              <span className="text-[10px] opacity-75 truncate">
                                {treatmentNames}
                              </span>
                            )}
                          </div>
                        ) : height < 60 ? (
                          <>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-bold text-[13px] leading-tight shrink-0">
                                {booking.booking_time?.substring(0, 5)} - {endTime}
                              </span>
                              <span className="text-[12px] font-medium truncate opacity-90">
                                {booking.isUnassigned
                                  ? booking.client_first_name || t("calendar.toConfirm", "À confirmer")
                                  : `${booking.client_first_name} ${booking.client_last_name}`}
                              </span>
                            </div>
                            {treatmentNames && (
                              <div className="text-[11px] opacity-80 truncate">
                                {treatmentNames}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="font-bold text-[13px] leading-tight">
                              {booking.booking_time?.substring(0, 5)} - {endTime}
                            </div>
                            <div className="font-medium text-[12px] truncate">
                              {booking.isUnassigned
                                ? booking.client_first_name || t("calendar.toConfirm", "À confirmer")
                                : `${booking.client_first_name} ${booking.client_last_name}`}
                            </div>
                            {treatmentNames && (
                              <div className="text-[11px] opacity-85 truncate">
                                {treatmentNames}
                              </div>
                            )}
                            {height >= 80 && (
                              <div className="text-[10px] opacity-70 truncate">
                                {booking.hotel_name}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {booking.isUnassigned && onAcceptBooking && (
                        <button
                          className="shrink-0 ml-2 px-2.5 py-1 rounded-md bg-white/90 text-emerald-700 text-[11px] font-semibold flex items-center gap-1 hover:bg-white active:scale-95 transition-all shadow-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAcceptBooking(booking);
                          }}
                        >
                          <Check className="h-3.5 w-3.5" />
                          {t("dashboard.accept", "Accepter")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {showIndicator && (
                <div
                  className="absolute left-0 right-0 h-0.5 bg-destructive z-20 pointer-events-none"
                  style={{ top: `${currentTimeTop}px` }}
                >
                  <div className="absolute -left-1 -top-1 w-2.5 h-2.5 bg-destructive rounded-full" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PwaDayView;
