import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format, addDays, startOfDay } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Phone,
  Euro,
  Building2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/formatPrice";
import { decodeHtmlEntities } from "@/lib/utils";
import { useTimezone } from "@/contexts/TimezoneContext";
import {
  useBookingData,
  CALENDAR_CONSTANTS,
  type BookingWithTreatments,
  type Hotel,
  type Therapist,
} from "@/hooks/booking";
import { getBookingStatusConfig, getPaymentStatusConfig } from "@/utils/statusStyles";
import { BookingDetailDialog } from "@/components/admin/details/BookingDetailDialog";
import EditBookingDialog from "@/components/EditBookingDialog";

interface TherapistAgendaViewProps {
  hotelFilter?: string;
}

export function TherapistAgendaView({ hotelFilter = "all" }: TherapistAgendaViewProps) {
  const { t, i18n } = useTranslation("admin");
  const navigate = useNavigate();
  const { activeTimezone } = useTimezone();
  const isFr = i18n.language === "fr";
  const locale = isFr ? fr : enUS;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { START_HOUR, END_HOUR, HOUR_HEIGHT } = CALENDAR_CONSTANTS;

  // Data
  const { bookings, hotels, therapists, getHotelInfo } = useBookingData();

  // Navigation state
  const [currentDate, setCurrentDate] = useState(() => startOfDay(new Date()));
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const handlePrevious = useCallback(() => {
    setCurrentDate((prev) => addDays(prev, -1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentDate((prev) => addDays(prev, 1));
  }, []);

  const goToToday = useCallback(() => {
    setCurrentDate(startOfDay(new Date()));
  }, []);

  const setViewDate = useCallback((date: Date) => {
    setCurrentDate(startOfDay(date));
  }, []);

  // Filter active therapists, optionally by venue
  const filteredTherapists = useMemo(() => {
    if (!therapists) return [];
    // therapists from useBookingData are already filtered to active status
    return therapists;
  }, [therapists]);

  // Filter bookings for the selected date
  const dayBookings = useMemo(() => {
    if (!bookings) return [];
    const dateStr = format(currentDate, "yyyy-MM-dd");
    return bookings.filter((b) => {
      if (b.booking_date !== dateStr) return false;
      if (hotelFilter !== "all" && b.hotel_id !== hotelFilter) return false;
      return true;
    });
  }, [bookings, currentDate, hotelFilter]);

  // Group bookings by therapist
  const bookingsByTherapist = useMemo(() => {
    const map = new Map<string, BookingWithTreatments[]>();
    // Initialize all therapists with empty arrays
    for (const t of filteredTherapists) {
      map.set(t.id, []);
    }
    // Add an "unassigned" bucket
    map.set("__unassigned__", []);

    for (const b of dayBookings) {
      const key = b.therapist_id || "__unassigned__";
      const arr = map.get(key);
      if (arr) {
        arr.push(b);
      } else {
        // Therapist not in the active list (e.g. inactive) — skip or show in unassigned
        const unassigned = map.get("__unassigned__")!;
        unassigned.push(b);
      }
    }

    return map;
  }, [dayBookings, filteredTherapists]);

  // Columns to display (therapists with bookings + unassigned if any)
  const columns = useMemo(() => {
    const cols: { id: string; name: string; image: string | null }[] = [];

    for (const therapist of filteredTherapists) {
      const hasBookings = (bookingsByTherapist.get(therapist.id)?.length ?? 0) > 0;
      // Show all therapists, even those without bookings, for a complete view
      cols.push({
        id: therapist.id,
        name: `${therapist.first_name} ${therapist.last_name}`,
        image: null, // therapists from useBookingData don't include image
      });
    }

    const unassigned = bookingsByTherapist.get("__unassigned__") || [];
    if (unassigned.length > 0) {
      cols.push({
        id: "__unassigned__",
        name: t("therapists.agendaView.unassigned", "Non assigné"),
        image: null,
      });
    }

    return cols;
  }, [filteredTherapists, bookingsByTherapist, t]);

  // Hours array
  const hours = useMemo(
    () => Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR),
    [START_HOUR, END_HOUR]
  );

  // Off-hours based on venue
  const { earliestOpen, latestClose } = useMemo(() => {
    if (!hotels || hotels.length === 0) return { earliestOpen: 7, latestClose: 24 };
    const relevantHotels =
      hotelFilter !== "all" ? hotels.filter((h) => h.id === hotelFilter) : hotels;
    if (relevantHotels.length === 0) return { earliestOpen: 7, latestClose: 24 };

    const opens = relevantHotels.map((h) =>
      parseInt(h.opening_time?.substring(0, 2) || "7")
    );
    const closes = relevantHotels.map((h) => {
      const closeHour = parseInt(h.closing_time?.substring(0, 2) || "24");
      const closeMin = parseInt(h.closing_time?.substring(3, 5) || "0");
      return closeMin > 0 ? closeHour + 1 : closeHour;
    });

    return { earliestOpen: Math.min(...opens), latestClose: Math.max(...closes) };
  }, [hotels, hotelFilter]);

  // Booking position
  const getBookingPosition = useCallback(
    (booking: BookingWithTreatments) => {
      if (!booking.booking_time) return { top: 0, height: HOUR_HEIGHT };
      const [h, m] = booking.booking_time.split(":").map(Number);
      const duration =
        booking.totalDuration && booking.totalDuration > 0
          ? booking.totalDuration
          : 60;
      const top = ((h - START_HOUR) * 60 + m) / 60 * HOUR_HEIGHT;
      const height = (duration / 60) * HOUR_HEIGHT;
      return { top, height: Math.max(height, 20) };
    },
    [START_HOUR, HOUR_HEIGHT]
  );

  // Current time indicator
  const getCurrentTimePosition = useCallback(() => {
    const isToday =
      format(currentDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
    const now = new Date(
      currentTime.toLocaleString("en-US", { timeZone: activeTimezone })
    );
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const showIndicator =
      isToday && currentHour >= START_HOUR && currentHour < END_HOUR;
    const position = showIndicator
      ? ((currentHour - START_HOUR) * 60 + currentMinute) / 60 * HOUR_HEIGHT
      : 0;
    return { showIndicator, position };
  }, [currentDate, currentTime, activeTimezone, START_HOUR, END_HOUR, HOUR_HEIGHT]);

  // Status helpers
  const getStatusColor = useCallback((status: string) => {
    return getBookingStatusConfig(status).badgeClass;
  }, []);

  const getTranslatedStatus = useCallback((status: string) => {
    return getBookingStatusConfig(status).label;
  }, []);

  const getCalendarCardColor = useCallback(
    (status: string, paymentStatus?: string | null) => {
      if (paymentStatus === "pending" && status !== "cancelled") {
        return "bg-yellow-50 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-100";
      }
      const config = getBookingStatusConfig(status);
      return config.calendarCardClass || config.cardClass;
    },
    []
  );

  // Auto-scroll to current time
  useEffect(() => {
    if (scrollContainerRef.current) {
      const now = new Date();
      const h = now.getHours();
      if (h >= START_HOUR && h < END_HOUR) {
        scrollContainerRef.current.scrollTop = Math.max(
          0,
          (h - START_HOUR - 1) * HOUR_HEIGHT
        );
      }
    }
  }, [START_HOUR, HOUR_HEIGHT, END_HOUR]);

  // Dialog state
  const [viewedBooking, setViewedBooking] =
    useState<BookingWithTreatments | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const handleBookingClick = (booking: BookingWithTreatments) => {
    setViewedBooking(booking);
    setIsDetailOpen(true);
  };

  const handleEditFromDetail = () => {
    setIsDetailOpen(false);
    setIsEditOpen(true);
  };

  // Initials helper
  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  };

  const { showIndicator, position: currentTimeTop } = getCurrentTimePosition();

  const dateLabel = format(currentDate, "EEEE d MMMM yyyy", { locale });

  const gridTemplateColumns = `80px repeat(${columns.length}, minmax(140px, 1fr))`;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Navigation bar */}
      <div className="flex items-center justify-between mb-2 gap-2 flex-shrink-0 px-1">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handlePrevious}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-medium" onClick={goToToday}>
            {t("therapists.agendaView.today", "Aujourd'hui")}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <button className="text-sm font-semibold hover:bg-muted px-3 py-1 rounded-md transition-colors cursor-pointer capitalize">
              {dateLabel}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            <Calendar
              mode="single"
              selected={currentDate}
              onSelect={(date) => date && setViewDate(date)}
              locale={locale === fr ? fr : undefined}
              weekStartsOn={1}
            />
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span>{columns.length}</span>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 bg-card rounded-lg border border-border overflow-hidden flex flex-col">
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto"
          style={{ scrollbarGutter: "stable" }}
        >
          {/* Header with therapist columns */}
          <div
            className="sticky top-0 z-20 border-b border-border bg-card grid"
            style={{ gridTemplateColumns }}
          >
            {/* Hours corner */}
            <div className="px-2 py-2 border-r border-border bg-muted flex items-center">
              <span className="text-[10px] font-medium text-muted-foreground">
                {t("therapists.agendaView.hour", "Heure")}
              </span>
            </div>
            {/* Therapist headers */}
            {columns.map((col) => (
              <div
                key={col.id}
                className={cn(
                  "px-2 py-2 border-r border-border last:border-r-0 bg-muted flex flex-col items-center gap-1",
                  col.id !== "__unassigned__" && "cursor-pointer hover:bg-muted/70 transition-colors"
                )}
                onClick={() => {
                  if (col.id !== "__unassigned__") navigate(`/admin/therapists/${col.id}`);
                }}
              >
                <Avatar className="h-8 w-8">
                  {col.image && <AvatarImage src={col.image} alt={col.name} />}
                  <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                    {getInitials(col.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[11px] font-medium text-foreground truncate max-w-full text-center leading-tight">
                  {col.name}
                </span>
                <span className="text-[9px] text-muted-foreground">
                  {bookingsByTherapist.get(col.id)?.length || 0} rdv
                </span>
              </div>
            ))}
          </div>

          {/* Time grid */}
          <div className="grid relative" style={{ gridTemplateColumns }}>
            {/* Hours column */}
            <div className="border-r border-border bg-muted/20">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="border-b border-border p-1 flex items-start"
                  style={{ height: `${HOUR_HEIGHT}px` }}
                >
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {hour.toString().padStart(2, "0")}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Therapist columns */}
            {columns.map((col) => {
              const colBookings = bookingsByTherapist.get(col.id) || [];

              return (
                <div
                  key={col.id}
                  className="relative border-r border-border last:border-r-0"
                >
                  {/* Hour grid lines */}
                  {hours.map((hour) => {
                    const isOutsideHours =
                      hour < earliestOpen || hour >= latestClose;
                    return (
                      <div
                        key={hour}
                        className={cn(
                          "border-b border-border transition-colors",
                          isOutsideHours
                            ? "bg-muted/40"
                            : hour % 2 !== 0
                              ? "bg-muted/10"
                              : ""
                        )}
                        style={{ height: `${HOUR_HEIGHT}px` }}
                      />
                    );
                  })}

                  {/* Bookings */}
                  <TooltipProvider>
                    {colBookings.map((booking) => (
                      <AgendaBookingCard
                        key={booking.id}
                        booking={booking}
                        position={getBookingPosition(booking)}
                        getCalendarCardColor={getCalendarCardColor}
                        getStatusColor={getStatusColor}
                        getTranslatedStatus={getTranslatedStatus}
                        getHotelInfo={getHotelInfo}
                        onClick={handleBookingClick}
                      />
                    ))}
                  </TooltipProvider>

                  {/* Current time indicator */}
                  {showIndicator && (
                    <div
                      className="absolute left-0 right-0 h-0.5 bg-destructive z-20 pointer-events-none"
                      style={{ top: `${currentTimeTop}px` }}
                    >
                      <div className="absolute -left-1.5 -top-1 w-2.5 h-2.5 bg-destructive rounded-full" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <BookingDetailDialog
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        booking={viewedBooking}
        hotel={viewedBooking ? getHotelInfo(viewedBooking.hotel_id) : null}
        onEdit={handleEditFromDetail}
      />

      <EditBookingDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        booking={viewedBooking}
      />
    </div>
  );
}

// Booking card for the per-therapist agenda
function AgendaBookingCard({
  booking,
  position,
  getCalendarCardColor,
  getStatusColor,
  getTranslatedStatus,
  getHotelInfo,
  onClick,
}: {
  booking: BookingWithTreatments;
  position: { top: number; height: number };
  getCalendarCardColor: (status: string, paymentStatus?: string | null) => string;
  getStatusColor: (status: string) => string;
  getTranslatedStatus: (status: string) => string;
  getHotelInfo: (hotelId: string | null) => Hotel | null;
  onClick: (booking: BookingWithTreatments) => void;
}) {
  const { top, height } = position;
  const hotelInfo = getHotelInfo(booking.hotel_id);

  const duration =
    booking.duration && booking.duration > 0
      ? booking.duration
      : booking.totalDuration && booking.totalDuration > 0
        ? booking.totalDuration
        : 60;
  const treatments = booking.treatments || [];
  const durationHours = Math.floor(duration / 60);
  const durationMinutes = duration % 60;
  const durationFormatted =
    durationHours > 0
      ? durationMinutes > 0
        ? `${durationHours}h${durationMinutes}`
        : `${durationHours}h`
      : `${durationMinutes}min`;
  const totalPrice =
    booking.total_price && booking.total_price > 0
      ? booking.total_price
      : booking.treatmentsTotalPrice || 0;

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "absolute rounded text-xs cursor-pointer overflow-hidden z-10 border-l-4 group",
            getCalendarCardColor(booking.status, booking.payment_status)
          )}
          style={{
            borderLeftColor: hotelInfo?.calendar_color || "#3b82f6",
            top: `${top}px`,
            height: `${height}px`,
            minHeight: "20px",
            left: "2px",
            right: "2px",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onClick(booking);
          }}
        >
          <div className="p-1 h-full flex flex-col">
            {/* Time */}
            <div className="font-bold text-[11px] leading-tight">
              {booking.booking_time?.substring(0, 5)}
            </div>
            {/* Client name */}
            {height >= 32 && (
              <div className="truncate text-[10px] font-medium opacity-90">
                {booking.client_first_name} {booking.client_last_name}
              </div>
            )}
            {/* Treatment name */}
            {height >= 48 && treatments.length > 0 && (
              <div className="truncate text-[8px] opacity-70">
                {treatments[0].name}
                {treatments.length > 1 && ` +${treatments.length - 1}`}
              </div>
            )}
            {/* Duration */}
            {height >= 60 && (
              <div className="text-[7px] opacity-60 mt-auto">{durationFormatted}</div>
            )}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-sm z-50">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-sm">
              Booking #{booking.booking_id}
            </div>
            <Badge className={`text-[8px] ${getStatusColor(booking.status)}`}>
              {getTranslatedStatus(booking.status)}
            </Badge>
          </div>

          {booking.hotel_name && (
            <div className="flex items-center gap-2 text-xs">
              <Building2 className="h-3 w-3" />
              <span>{booking.hotel_name}</span>
            </div>
          )}

          {booking.room_number && (
            <div className="text-xs">
              Chambre: {decodeHtmlEntities(booking.room_number)}
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium">
              <User className="h-3 w-3" />
              <span>
                {booking.client_first_name} {booking.client_last_name}
              </span>
            </div>
            {booking.phone && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" />
                <span>{booking.phone}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Clock className="h-3 w-3" />
            <span>Durée: {durationFormatted}</span>
          </div>

          {treatments.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium">Traitements:</div>
              <ul className="text-xs space-y-1">
                {treatments.map((treatment, idx) => {
                  const tHours = Math.floor((treatment.duration || 0) / 60);
                  const tMinutes = (treatment.duration || 0) % 60;
                  const tDurationFormatted = `${tHours.toString().padStart(2, "0")}h${tMinutes.toString().padStart(2, "0")}`;
                  return (
                    <li key={idx} className="flex justify-between gap-2">
                      <span>{treatment.name}</span>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {tDurationFormatted} -{" "}
                        {formatPrice(
                          treatment.price || 0,
                          hotelInfo?.currency || "EUR"
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs font-semibold border-t pt-2">
            <Euro className="h-3 w-3" />
            <span>
              Total: {formatPrice(totalPrice, hotelInfo?.currency || "EUR")}
            </span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
