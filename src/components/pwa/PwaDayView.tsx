import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { format, addDays, subDays, isToday, addMinutes, parse } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Check, DoorOpen, User, Users } from "lucide-react";
import { getCalendarFlowStage } from "@/utils/statusStyles";
import { formatPrice } from "@/lib/formatPrice";
import { computeTherapistEarnings, type TherapistRates } from "@/lib/therapistEarnings";
import { useLongPress } from "@/hooks/pwa/useLongPress";
import { BookingPreviewPopover } from "@/components/pwa/BookingPreviewPopover";

interface BookingTreatment {
  therapistShortName?: string | null;
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
  room_name?: string | null;
  status: string;
  payment_status?: string | null;
  phone: string;
  duration?: number;
  isUnassigned?: boolean;
  total_price?: number | null;
  guest_count?: number | null;
  booking_treatments?: BookingTreatment[];
  therapistName?: string | null;
}

interface PwaDayViewProps {
  bookings: DayViewBooking[];
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onBookingClick: (booking: DayViewBooking) => void;
  onSlotClick?: (date: string, time: string) => void;
  onAcceptBooking?: (booking: DayViewBooking) => void;
  therapistRates?: TherapistRates | null;
  hideEarnings?: boolean;
}

const HOUR_HEIGHT = 80;
const START_HOUR = 7;
const END_HOUR = 23;
const SWIPE_THRESHOLD = 50;
// Trim a couple px off each block so back-to-back bookings keep a readable seam.
const BLOCK_GAP = 3;

interface TreatmentLine {
  name: string;
  therapist: string | null;
}

function getTreatmentLines(booking: DayViewBooking): TreatmentLine[] {
  if (!booking.booking_treatments || booking.booking_treatments.length === 0) return [];
  return booking.booking_treatments
    .filter((bt) => bt.treatment_menus?.name)
    .map((bt) => ({
      name: bt.treatment_menus!.name,
      therapist: bt.therapistShortName ?? null,
    }));
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

// Solid pill so it stands out on the pastel calendar card backgrounds.
function DuoTag() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-600 px-1.5 py-px text-[9px] font-bold uppercase leading-none text-white shrink-0">
      <Users className="h-2.5 w-2.5" />
      Duo
    </span>
  );
}

export function PwaDayView({
  bookings,
  selectedDate,
  onDateChange,
  onBookingClick,
  onSlotClick,
  onAcceptBooking,
  therapistRates,
  hideEarnings,
}: PwaDayViewProps) {
  const { t, i18n } = useTranslation("pwa");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [preview, setPreview] = useState<DayViewBooking | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const dateLocale = i18n.language === "fr" ? fr : enUS;
  const { bind, consumeLongPress } = useLongPress();

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
    return { top, height: Math.max(height - BLOCK_GAP, 40) };
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
      const dur = calculateDuration(b);
      const earned = computeTherapistEarnings(therapistRates ?? null, dur);
      return sum + (earned ?? 0);
    }, 0);

    return { count, hoursLabel, totalEarnings };
  }, [dayBookings, therapistRates]);

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
      className="app-refonte flex flex-col h-full overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="ag-datenav">
        <button className="navb" onClick={() => onDateChange(subDays(selectedDate, 1))} aria-label={t("calendar.prevDay", "Jour précédent")}>
          <ChevronLeft size={16} />
        </button>
        <div className="cur">
          <div className="d" style={{ textTransform: "capitalize" }}>
            {format(selectedDate, "EEEE d MMMM", { locale: dateLocale })}
          </div>
          <div className="s">
            {daySummary.count > 0 ? (
              <>
                <b>{daySummary.count} {t("calendar.appointments", "Rendez-vous")}</b> · {daySummary.hoursLabel}
                {!hideEarnings && ` · ${formatPrice(Math.round(daySummary.totalEarnings), "EUR", { decimals: 0 })}`}
              </>
            ) : (
              t("calendar.noBookings", "Aucun rendez-vous")
            )}
          </div>
        </div>
        {isTodaySelected ? (
          <span style={{ width: 34 }} />
        ) : (
          <button className="ag-today" onClick={() => onDateChange(new Date())}>
            {t("calendar.today", "Aujourd'hui")}
          </button>
        )}
        <button className="navb" onClick={() => onDateChange(addDays(selectedDate, 1))} aria-label={t("calendar.nextDay", "Jour suivant")}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-auto" ref={scrollRef}>
        <div className="min-h-full">
          <div className="grid grid-cols-[50px_1fr]">
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

            <div
              className="relative"
              style={isTodaySelected ? { background: "color-mix(in srgb, var(--accent) 4%, transparent)" } : undefined}
            >
              {hours.map((hour) => (
                <div
                  key={hour}
                  className={onSlotClick ? "cursor-pointer transition-colors" : ""}
                  style={{ height: `${HOUR_HEIGHT}px`, borderBottom: "1px solid var(--line-soft)" }}
                  onClick={() => {
                    if (onSlotClick) {
                      onSlotClick(dateStr, `${hour.toString().padStart(2, "0")}:00`);
                    }
                  }}
                />
              ))}

              {dayBookings.map((booking) => {
                const { top, height } = getBookingPosition(booking);
                const flowStage = getCalendarFlowStage(booking.status, booking.payment_status);
                const duration = calculateDuration(booking);
                const endTime = formatEndTime(booking.booking_time, duration);
                const treatmentLines = getTreatmentLines(booking);
                const isDuo = (booking.guest_count ?? 1) > 1;
                const hasPerTreatmentTherapists = treatmentLines.some((l) => l.therapist);

                return (
                  <div
                    key={booking.id}
                    className={`absolute left-1 right-1 rounded-lg text-xs cursor-pointer overflow-hidden z-10 select-none ${flowStage.cardClass} ${
                      booking.isUnassigned
                        ? "opacity-75 border-2 border-dashed border-current/40"
                        : ""
                    }`}
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      minHeight: "40px",
                    }}
                    {...bind(() => setPreview(booking))}
                    onClick={() => {
                      if (consumeLongPress()) return;
                      onBookingClick(booking);
                    }}
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
                            {isDuo && <DuoTag />}
                            <span className="text-[11px] font-medium truncate">
                              {booking.isUnassigned
                                ? booking.client_first_name || t("calendar.toConfirm", "À confirmer")
                                : booking.client_first_name}
                            </span>
                            {treatmentLines.length > 0 && (
                              <span className="text-[10px] opacity-75 truncate">
                                {treatmentLines.map((l) => l.name).join(", ")}
                              </span>
                            )}
                          </div>
                        ) : height < 60 ? (
                          <>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-bold text-[13px] leading-tight shrink-0">
                                {booking.booking_time?.substring(0, 5)} - {endTime}
                              </span>
                              {isDuo && <DuoTag />}
                              <span className="text-[12px] font-medium truncate opacity-90">
                                {booking.isUnassigned
                                  ? booking.client_first_name || t("calendar.toConfirm", "À confirmer")
                                  : `${booking.client_first_name} ${booking.client_last_name}`}
                              </span>
                            </div>
                            {treatmentLines.map((line, i) => (
                              <div key={i} className="text-[11px] opacity-80 truncate">
                                {line.name}
                                {line.therapist && (
                                  <span className="opacity-75"> · {line.therapist}</span>
                                )}
                              </div>
                            ))}
                          </>
                        ) : (
                          <div className="flex justify-between gap-1.5 min-w-0">
                            <div className="min-w-0 flex flex-col">
                              <div className="flex items-center gap-1.5 font-bold text-[13px] leading-tight">
                                {booking.booking_time?.substring(0, 5)} - {endTime}
                                {isDuo && <DuoTag />}
                              </div>
                              <div className="font-medium text-[12px] truncate">
                                {booking.isUnassigned
                                  ? booking.client_first_name || t("calendar.toConfirm", "À confirmer")
                                  : `${booking.client_first_name} ${booking.client_last_name}`}
                              </div>
                              {treatmentLines.map((line, i) => (
                                <div key={i} className="text-[11px] opacity-85 truncate">
                                  {line.name}
                                  {line.therapist && (
                                    <span className="opacity-75"> · {line.therapist}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                            {((booking.therapistName && !hasPerTreatmentTherapists) || booking.room_name) && (
                              <div className="flex flex-col items-end text-right shrink-0 max-w-[45%] gap-0.5">
                                {booking.therapistName && !hasPerTreatmentTherapists && (
                                  <span className="flex items-center gap-0.5 text-[10px] font-medium opacity-80 min-w-0 max-w-full">
                                    <User className="h-2.5 w-2.5 shrink-0" />
                                    <span className="truncate">{booking.therapistName}</span>
                                  </span>
                                )}
                                {booking.room_name && (
                                  <span className="flex items-center gap-0.5 text-[10px] font-medium opacity-90 min-w-0 max-w-full">
                                    <DoorOpen className="h-2.5 w-2.5 shrink-0" />
                                    <span className="truncate">{booking.room_name}</span>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
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
                  className="absolute left-0 right-0 z-20 pointer-events-none"
                  style={{ top: `${currentTimeTop}px`, height: 0, borderTop: "1.5px solid var(--clay)" }}
                >
                  <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full" style={{ background: "var(--clay)" }} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <BookingPreviewPopover booking={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

export default PwaDayView;
