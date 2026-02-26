import { useMemo, useRef, useEffect } from "react";
import { format, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, Clock, User, Phone, Euro, Building2, Users, ExternalLink } from "lucide-react";
import { formatPrice } from "@/lib/formatPrice";
import { decodeHtmlEntities, cn } from "@/lib/utils";
import type { BookingWithTreatments, Hotel } from "@/hooks/booking";

interface BookingCalendarViewProps {
  weekDays: Date[];
  currentWeekStart: Date;
  dayCount: number;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onGoToToday: () => void;
  onSetViewDate: (date: Date) => void;
  getBookingsForDay: (date: Date) => BookingWithTreatments[];
  getBookingPosition: (booking: BookingWithTreatments) => { top: number; height: number };
  getCurrentTimePosition: (date: Date) => { showIndicator: boolean; position: number };
  getStatusColor: (status: string) => string;
  getTranslatedStatus: (status: string) => string;
  getCalendarCardColor: (status: string, paymentStatus?: string | null) => string;
  onCalendarClick: (date: Date, time: string) => void;
  onBookingClick: (booking: BookingWithTreatments) => void;
  hours: number[];
  hourHeight: number;
  startHour: number;
  getHotelInfo: (hotelId: string | null) => Hotel | null;
  hotels: Hotel[] | undefined;
  hotelFilter: string;
}

function getTherapistInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
}

export function BookingCalendarView({
  weekDays,
  currentWeekStart,
  dayCount,
  onPreviousWeek,
  onNextWeek,
  onGoToToday,
  onSetViewDate,
  getBookingsForDay,
  getBookingPosition,
  getCurrentTimePosition,
  getStatusColor,
  getTranslatedStatus,
  getCalendarCardColor,
  onCalendarClick,
  onBookingClick,
  hours,
  hourHeight,
  startHour,
  getHotelInfo,
  hotels,
  hotelFilter,
}: BookingCalendarViewProps) {
  const navigate = useNavigate();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (scrollContainerRef.current) {
      const now = new Date();
      const currentHour = now.getHours();
      if (currentHour >= startHour && currentHour < 24) {
        const scrollTo = ((currentHour - startHour - 1) * hourHeight);
        scrollContainerRef.current.scrollTop = Math.max(0, scrollTo);
      }
    }
  }, [startHour, hourHeight]);

  // Compute off-hours based on filtered venue or all venues
  const { earliestOpen, latestClose } = useMemo(() => {
    if (!hotels || hotels.length === 0) return { earliestOpen: 7, latestClose: 24 };

    const relevantHotels = hotelFilter !== 'all'
      ? hotels.filter(h => h.id === hotelFilter)
      : hotels;

    if (relevantHotels.length === 0) return { earliestOpen: 7, latestClose: 24 };

    const opens = relevantHotels.map(h => parseInt(h.opening_time?.substring(0, 2) || '7'));
    const closes = relevantHotels.map(h => {
      const closeHour = parseInt(h.closing_time?.substring(0, 2) || '24');
      const closeMin = parseInt(h.closing_time?.substring(3, 5) || '0');
      return closeMin > 0 ? closeHour + 1 : closeHour;
    });

    return {
      earliestOpen: Math.min(...opens),
      latestClose: Math.max(...closes),
    };
  }, [hotels, hotelFilter]);

  // Date range label
  const dateRangeLabel = useMemo(() => {
    if (dayCount === 1) {
      return format(currentWeekStart, "EEEE d MMMM yyyy", { locale: fr });
    }
    const endDate = addDays(currentWeekStart, dayCount - 1);
    const sameMonth = format(currentWeekStart, 'MM') === format(endDate, 'MM');
    if (sameMonth) {
      return `${format(currentWeekStart, "d", { locale: fr })} - ${format(endDate, "d MMMM yyyy", { locale: fr })}`;
    }
    return `${format(currentWeekStart, "d MMM", { locale: fr })} - ${format(endDate, "d MMM yyyy", { locale: fr })}`;
  }, [currentWeekStart, dayCount]);

  // Venues for legend (show when 2+ venues)
  const venuesWithBookings = useMemo(() => {
    if (!hotels || hotels.length <= 1) return [];
    return hotels;
  }, [hotels]);

  const gridTemplateColumns = `60px repeat(${dayCount}, 1fr)`;
  const gridTemplateColumnsMd = `80px repeat(${dayCount}, 1fr)`;

  return (
    <div className="p-2 md:p-4 flex flex-col h-full overflow-hidden">
      {/* Navigation bar */}
      <div className="flex items-center justify-between mb-2 gap-2 flex-shrink-0">
        {/* Left: nav arrows + today */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPreviousWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-medium" onClick={onGoToToday}>
            Aujourd'hui
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Center: clickable date range → mini calendar popover */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="text-sm font-semibold hover:bg-muted px-3 py-1 rounded-md transition-colors cursor-pointer capitalize">
              {dateRangeLabel}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            <Calendar
              mode="single"
              selected={currentWeekStart}
              onSelect={(date) => {
                if (date) onSetViewDate(date);
              }}
              locale={fr}
              weekStartsOn={1}
            />
          </PopoverContent>
        </Popover>

      </div>

      {/* Venue legend */}
      {venuesWithBookings.length > 1 && (
        <div className="flex flex-wrap items-center gap-3 mb-2 px-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground font-medium">Lieux :</span>
          {venuesWithBookings.map((hotel) => (
            <div key={hotel.id} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: hotel.calendar_color || '#3b82f6' }}
              />
              <span className="text-xs text-muted-foreground">{hotel.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Calendar grid */}
      <div className="w-full -mx-2 md:mx-0 px-2 md:px-0 flex-1 flex flex-col min-h-0">
        <div className="min-w-[600px] md:min-w-0 w-full bg-card rounded-lg border border-border flex flex-col h-full overflow-hidden">
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-auto"
            style={{ scrollbarGutter: "stable" }}
          >
            {/* Header with days */}
            <div
              className="sticky top-0 z-20 border-b border-border bg-card hidden md:grid"
              style={{ gridTemplateColumns: gridTemplateColumnsMd }}
            >
              <div className="p-1 md:p-2 border-r border-border bg-muted">
                <span className="text-[10px] md:text-xs font-medium text-muted-foreground">Heure</span>
              </div>
              {weekDays.map((day) => {
                const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "p-1 md:p-2 text-center border-r border-border last:border-r-0 bg-muted",
                      isToday && "ring-1 ring-inset ring-primary/20"
                    )}
                  >
                    <div className="text-[10px] md:text-xs font-medium text-muted-foreground uppercase">
                      {format(day, "EEE", { locale: fr })}
                    </div>
                    <div className={cn("text-sm md:text-lg font-bold", isToday && "text-primary")}>
                      {format(day, "d")}
                    </div>
                    <div className="text-[8px] md:text-[10px] text-muted-foreground">
                      {format(day, "MMM", { locale: fr })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mobile header */}
            <div
              className="sticky top-0 z-20 border-b border-border bg-card grid md:hidden"
              style={{ gridTemplateColumns }}
            >
              <div className="p-1 border-r border-border bg-muted">
                <span className="text-[10px] font-medium text-muted-foreground">Heure</span>
              </div>
              {weekDays.map((day) => {
                const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "p-1 text-center border-r border-border last:border-r-0 bg-muted",
                      isToday && "ring-1 ring-inset ring-primary/20"
                    )}
                  >
                    <div className="text-[10px] font-medium text-muted-foreground uppercase">
                      {format(day, "EEE", { locale: fr })}
                    </div>
                    <div className={cn("text-sm font-bold", isToday && "text-primary")}>
                      {format(day, "d")}
                    </div>
                    <div className="text-[8px] text-muted-foreground">
                      {format(day, "MMM", { locale: fr })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time slots grid - Desktop */}
            <div className="hidden md:grid" style={{ gridTemplateColumns: gridTemplateColumnsMd }}>
              {/* Hours column */}
              <div className="border-r border-border bg-muted/20">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="border-b border-border p-1 flex items-start"
                    style={{ height: `${hourHeight}px` }}
                  >
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {hour.toString().padStart(2, '0')}:00
                    </span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((day) => {
                const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                const dayBookings = getBookingsForDay(day);
                const { showIndicator, position: currentTimeTop } = getCurrentTimePosition(day);

                return (
                  <div
                    key={day.toISOString()}
                    className={cn("relative border-r border-border last:border-r-0", isToday && "bg-primary/[0.02]")}
                  >
                    {/* Grid lines for each hour */}
                    {hours.map((hour) => {
                      const isOutsideHours = hour < earliestOpen || hour >= latestClose;
                      const hourStr = `${hour.toString().padStart(2, '0')}:00`;
                      return (
                        <div
                          key={hour}
                          className={cn(
                            "border-b border-border transition-colors",
                            isOutsideHours
                              ? "bg-muted/40 cursor-default"
                              : cn(
                                  hour % 2 !== 0 ? "bg-muted/10" : "",
                                  "cursor-pointer hover:bg-primary/10"
                                )
                          )}
                          style={{ height: `${hourHeight}px` }}
                          onClick={() => !isOutsideHours && onCalendarClick(day, hourStr)}
                        />
                      );
                    })}

                    {/* Positioned bookings */}
                    <TooltipProvider>
                      {dayBookings.map((booking) => (
                        <BookingCard
                          key={booking.id}
                          booking={booking}
                          getBookingPosition={getBookingPosition}
                          getCalendarCardColor={getCalendarCardColor}
                          getStatusColor={getStatusColor}
                          getTranslatedStatus={getTranslatedStatus}
                          getHotelInfo={getHotelInfo}
                          onBookingClick={onBookingClick}
                          navigate={navigate}
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

            {/* Time slots grid - Mobile */}
            <div className="grid md:hidden" style={{ gridTemplateColumns }}>
              {/* Hours column */}
              <div className="border-r border-border bg-muted/20 w-[60px]">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="border-b border-border p-1 flex items-start"
                    style={{ height: `${hourHeight}px` }}
                  >
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {hour.toString().padStart(2, '0')}:00
                    </span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((day) => {
                const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                const dayBookings = getBookingsForDay(day);
                const { showIndicator, position: currentTimeTop } = getCurrentTimePosition(day);

                return (
                  <div
                    key={day.toISOString()}
                    className={cn("relative border-r border-border last:border-r-0", isToday && "bg-primary/[0.02]")}
                  >
                    {hours.map((hour) => {
                      const isOutsideHours = hour < earliestOpen || hour >= latestClose;
                      const hourStr = `${hour.toString().padStart(2, '0')}:00`;
                      return (
                        <div
                          key={hour}
                          className={cn(
                            "border-b border-border transition-colors",
                            isOutsideHours
                              ? "bg-muted/40 cursor-default"
                              : cn(
                                  hour % 2 !== 0 ? "bg-muted/10" : "",
                                  "cursor-pointer hover:bg-primary/10"
                                )
                          )}
                          style={{ height: `${hourHeight}px` }}
                          onClick={() => !isOutsideHours && onCalendarClick(day, hourStr)}
                        />
                      );
                    })}

                    <TooltipProvider>
                      {dayBookings.map((booking) => (
                        <BookingCard
                          key={booking.id}
                          booking={booking}
                          getBookingPosition={getBookingPosition}
                          getCalendarCardColor={getCalendarCardColor}
                          getStatusColor={getStatusColor}
                          getTranslatedStatus={getTranslatedStatus}
                          getHotelInfo={getHotelInfo}
                          onBookingClick={onBookingClick}
                          navigate={navigate}
                        />
                      ))}
                    </TooltipProvider>

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
      </div>
    </div>
  );
}

// Extracted booking card component for cleaner code
function BookingCard({
  booking,
  getBookingPosition,
  getCalendarCardColor,
  getStatusColor,
  getTranslatedStatus,
  getHotelInfo,
  onBookingClick,
  navigate,
}: {
  booking: BookingWithTreatments;
  getBookingPosition: (booking: BookingWithTreatments) => { top: number; height: number };
  getCalendarCardColor: (status: string, paymentStatus?: string | null) => string;
  getStatusColor: (status: string) => string;
  getTranslatedStatus: (status: string) => string;
  getHotelInfo: (hotelId: string | null) => Hotel | null;
  onBookingClick: (booking: BookingWithTreatments) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { top, height } = getBookingPosition(booking);
  const hotelInfo = getHotelInfo(booking.hotel_id);

  const duration = booking.duration && booking.duration > 0
    ? booking.duration
    : (booking.totalDuration && booking.totalDuration > 0
      ? booking.totalDuration
      : 60);
  const treatments = booking.treatments || [];
  const durationHours = Math.floor(duration / 60);
  const durationMinutes = duration % 60;
  const durationFormatted = durationHours > 0
    ? (durationMinutes > 0 ? `${durationHours}h${durationMinutes}` : `${durationHours}h`)
    : `${durationMinutes}min`;
  const totalPrice = booking.total_price && booking.total_price > 0
    ? booking.total_price
    : (booking.treatmentsTotalPrice || 0);

  const therapistInitials = getTherapistInitials(booking.therapist_name);
  const hasTherapist = !!booking.therapist_id;

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "absolute left-1 right-1 rounded text-xs cursor-pointer overflow-hidden z-10 border-l-4 group",
            getCalendarCardColor(booking.status, booking.payment_status)
          )}
          style={{
            borderLeftColor: hotelInfo?.calendar_color || '#3b82f6',
            top: `${top}px`,
            height: `${height}px`,
            minHeight: '20px',
          }}
          onClick={(e) => {
            e.stopPropagation();
            onBookingClick(booking);
          }}
        >
          <div className="p-1 h-full flex flex-col relative">
            {/* Top row: time + therapist badge */}
            <div className="flex items-start justify-between gap-0.5">
              <div className="font-bold text-[11px] leading-tight">
                {booking.booking_time?.substring(0, 5)}
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {/* Link to therapist on hover */}
                {hasTherapist && (
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-4 w-4 flex items-center justify-center rounded-full hover:bg-foreground/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/admin/therapists/${booking.therapist_id}`);
                    }}
                    title="Voir la fiche thérapeute"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                  </button>
                )}
                {/* Therapist initials badge */}
                <div
                  className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold flex-shrink-0",
                    hasTherapist
                      ? "bg-foreground/10 text-foreground/70"
                      : "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                  )}
                  title={booking.therapist_name || "Aucun thérapeute assigné"}
                >
                  {therapistInitials}
                </div>
              </div>
            </div>
            {/* Client name (if card is tall enough) */}
            {height >= 32 && (
              <div className="truncate text-[8px] opacity-80 font-medium">
                {booking.client_first_name} {booking.client_last_name}
              </div>
            )}
            {/* Duration (if card is tall enough) */}
            {height >= 48 && (
              <div className="text-[7px] opacity-60">{durationFormatted}</div>
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
              <span>{booking.client_first_name} {booking.client_last_name}</span>
            </div>
            {booking.phone && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" />
                <span>{booking.phone}</span>
              </div>
            )}
          </div>

          {booking.therapist_name && (
            <div className="flex items-center gap-2 text-xs">
              <Users className="h-3 w-3" />
              <span>Thérapeute : {booking.therapist_name}</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs">
            <Clock className="h-3 w-3" />
            <span>Durée: {durationFormatted}</span>
          </div>

          {(() => {
            const allOnQuote = treatments.length > 0 && treatments.every(
              (t) => (!t.price || t.price === 0) && (!t.duration || t.duration === 0)
            );

            if (allOnQuote) {
              return (
                <div className="text-xs text-muted-foreground italic">
                  Sur devis
                </div>
              );
            }

            if (treatments.length > 0) {
              return (
                <div className="space-y-1">
                  <div className="text-xs font-medium">Traitements:</div>
                  <ul className="text-xs space-y-1">
                    {treatments.map((treatment, idx) => {
                      const tHours = Math.floor((treatment.duration || 0) / 60);
                      const tMinutes = (treatment.duration || 0) % 60;
                      const tDurationFormatted = `${tHours.toString().padStart(2, '0')}h${tMinutes.toString().padStart(2, '0')}`;
                      return (
                        <li key={idx} className="flex justify-between gap-2">
                          <span>{treatment.name}</span>
                          <span className="text-muted-foreground whitespace-nowrap">
                            {tDurationFormatted} • {formatPrice(treatment.price || 0, hotelInfo?.currency || 'EUR')}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            }

            return null;
          })()}

          <div className="flex items-center gap-2 text-xs font-semibold border-t pt-2">
            <Euro className="h-3 w-3" />
            <span>Total: {formatPrice(totalPrice, hotelInfo?.currency || 'EUR')}</span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
